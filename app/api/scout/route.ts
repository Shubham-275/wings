import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getWingSpotsByZip, upsertWingSpots, deleteWingSpotsByZip } from '@/lib/supabase';
import { getCachedWingSpots, cacheWingSpots, checkRateLimit, getCachedScrapeResult, cacheScrapeResult, purgeZipCache } from '@/lib/cache';
import { geocodeZipCode } from '@/lib/geocode';
import { scrapeAllSources } from '@/lib/agentql';
import { generateSeedData } from '@/lib/seed-data';
import { isValidZipCode, cleanZipCode, calculateAvailability } from '@/lib/utils';
import { ScoutResponse, FlavorPersona } from '@/lib/types';

// Render.com: No timeout limit for Web Services (unlimited runtime)
// Setting Node.js runtime explicitly
export const runtime = 'nodejs';

// Render Web Services have no timeout constraint — we set a generous max here
// for Next.js route handler purposes. Render won't kill long-running requests.
export const maxDuration = 300;

// In-flight request deduplication
const inFlightRequests = new Map<string, Promise<ScoutResponse>>();
const INFLIGHT_CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupInFlightRequests() {
    const now = Date.now();
    if (now - lastCleanup > INFLIGHT_CLEANUP_INTERVAL) {
        inFlightRequests.clear();
        lastCleanup = now;
    }
}

const VALID_FLAVORS: FlavorPersona[] = ['face-melter', 'classicist', 'sticky-finger'];

export async function GET(request: NextRequest) {
    const t0 = Date.now();
    const log = (msg: string) => console.log(`[scout ${Date.now() - t0}ms] ${msg}`);

    const searchParams = request.nextUrl.searchParams;
    const rawZip = searchParams.get('zip');
    const rawFlavor = searchParams.get('flavor');
    const forceRefresh = searchParams.get('refresh') === 'true';
    const purge = searchParams.get('purge') === 'true';

    log(`START zip=${rawZip} flavor=${rawFlavor}${purge ? ' PURGE=true' : ''}`);

    // Validate zip code
    if (!rawZip || !isValidZipCode(rawZip)) {
        return NextResponse.json<ScoutResponse>(
            { success: false, spots: [], cached: false, message: 'Valid 5-digit US zip code required' },
            { status: 400 }
        );
    }

    const zipCode = cleanZipCode(rawZip);
    const flavor: FlavorPersona | undefined = rawFlavor && VALID_FLAVORS.includes(rawFlavor as FlavorPersona)
        ? rawFlavor as FlavorPersona
        : undefined;

    // Rate limiting
    log('checking rate limit...');
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const rateLimit = await checkRateLimit(ip, 20, 60);
    log(`rate limit: allowed=${rateLimit.allowed} remaining=${rateLimit.remaining}`);

    if (!rateLimit.allowed) {
        return NextResponse.json<ScoutResponse>(
            { success: false, spots: [], cached: false, message: `Rate limited. Try again in ${rateLimit.resetIn}s` },
            { status: 429 }
        );
    }

    cleanupInFlightRequests();

    // Skip in-flight deduplication — it can cause deadlocks in dev mode
    // where HMR restarts leave stale promises in memory

    try {
        // 0. Purge stale/incorrect data if requested
        if (purge) {
            log('PURGE: clearing Redis cache + Supabase data for zip...');
            const supabasePurge = createServerClient();
            await Promise.all([
                purgeZipCache(zipCode),
                deleteWingSpotsByZip(supabasePurge, zipCode),
            ]);
            log('PURGE: done');
        }

        // 1. Check Redis cache first (skip if purging or force-refreshing)
        if (!forceRefresh && !purge) {
            log('checking Redis scrapeResult cache...');
            const cachedResult = await getCachedScrapeResult(zipCode);
            if (cachedResult) {
                log(`HIT scrapeResult cache: ${cachedResult.spots.length} spots`);
                return NextResponse.json<ScoutResponse>({
                    ...cachedResult,
                    cached: true,
                    flavor,
                    message: `Cached data (${cachedResult.spots.length} spots)`,
                });
            }
            log('MISS scrapeResult cache');

            log('checking Redis wingSpots cache...');
            const cachedSpots = await getCachedWingSpots(zipCode);
            if (cachedSpots && cachedSpots.length > 0) {
                log(`HIT wingSpots cache: ${cachedSpots.length} spots`);
                const stats = calculateAvailability(cachedSpots);
                return NextResponse.json<ScoutResponse>({
                    success: true,
                    spots: cachedSpots,
                    cached: true,
                    flavor,
                    message: `Cached ${cachedSpots.length} spots (${stats.percentage}% available)`,
                });
            }
            log('MISS wingSpots cache');
        }

        // 2. Check Supabase for recent data
        log('checking Supabase...');
        const supabase = createServerClient();
        const { data: dbSpots } = await getWingSpotsByZip(supabase, zipCode);
        log(`Supabase: ${dbSpots?.length ?? 0} rows`);

        if (dbSpots && dbSpots.length > 0 && !forceRefresh && !purge) {
            const timestamps = dbSpots.map(s => new Date(s.last_updated).getTime()).filter(t => !isNaN(t));
            if (timestamps.length === 0) timestamps.push(0);
            const latestUpdate = new Date(Math.max(...timestamps));
            const ageMinutes = (Date.now() - latestUpdate.getTime()) / (1000 * 60);
            log(`Supabase data age: ${ageMinutes.toFixed(1)} min`);

            if (ageMinutes < 60) { // 1 hour — restaurant data (hours, menu, location) doesn't change fast
                await cacheWingSpots(zipCode, dbSpots);
                const stats = calculateAvailability(dbSpots);
                return NextResponse.json<ScoutResponse>({
                    success: true,
                    spots: dbSpots,
                    cached: true,
                    flavor,
                    message: `Fresh data: ${dbSpots.length} spots (${stats.percentage}% available)`,
                });
            }
        }

        // 3. Geocode zip code
        log('geocoding...');
        const location = await geocodeZipCode(zipCode);
        log(`geocode: ${location ? `${location.city}, ${location.state}` : 'FAILED'}`);

        if (!location) {
            if (dbSpots && dbSpots.length > 0) {
                return NextResponse.json<ScoutResponse>({
                    success: true,
                    spots: dbSpots,
                    cached: true,
                    flavor,
                    message: 'Could not geocode zip, showing cached data',
                });
            }
            return NextResponse.json<ScoutResponse>(
                { success: false, spots: [], cached: false, message: 'Could not geocode zip code. Please try again.' },
                { status: 502 }
            );
        }

        // 4. Scrape all sources in parallel
        log('starting scrapers...');
        let scrapedSpots = await scrapeAllSources(zipCode, location.lat, location.lng, flavor, location.city, location.state);
        log(`scrapers done: ${scrapedSpots.length} spots`);

        if (scrapedSpots.length === 0) {
            if (dbSpots && dbSpots.length > 0) {
                log('using stale DB data as fallback');
                return NextResponse.json<ScoutResponse>({
                    success: true,
                    spots: dbSpots,
                    cached: true,
                    flavor,
                    message: 'No new data found, showing cached results',
                });
            }

            // Fallback: Generate seed data so the app has something to display
            log('generating seed data...');
            scrapedSpots = generateSeedData(
                zipCode,
                location.lat,
                location.lng,
                location.city,
                location.state,
                flavor,
            );
            log(`seed data: ${scrapedSpots.length} spots`);
        }

        // 5. Save to Supabase
        log('saving to Supabase...');
        await upsertWingSpots(supabase, scrapedSpots);
        log('saved');

        // 6. Cache results
        log('caching results...');
        await cacheWingSpots(zipCode, scrapedSpots);

        const result: ScoutResponse = {
            success: true,
            spots: scrapedSpots,
            cached: false,
            flavor,
            message: `Found ${scrapedSpots.length} wing spots`,
            location,
        };

        await cacheScrapeResult(zipCode, result);
        log(`DONE: ${scrapedSpots.length} spots in ${Date.now() - t0}ms`);
        return NextResponse.json<ScoutResponse>(result);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log(`ERROR: ${errorMessage}`);
        console.error('Scout API error:', errorMessage);

        // Fallback to stale data
        try {
            const supabase = createServerClient();
            const { data: fallbackSpots } = await getWingSpotsByZip(supabase, zipCode);
            if (fallbackSpots && fallbackSpots.length > 0) {
                return NextResponse.json<ScoutResponse>({
                    success: true,
                    spots: fallbackSpots,
                    cached: true,
                    flavor,
                    message: 'Error occurred, showing cached data',
                });
            }
        } catch (fallbackError) {
            console.error('Fallback error:', fallbackError instanceof Error ? fallbackError.message : 'Unknown');
        }

        return NextResponse.json<ScoutResponse>(
            { success: false, spots: [], cached: false, message: 'An error occurred while fetching data' },
            { status: 500 }
        );
    }
}
