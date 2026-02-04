import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getWingSpotsByZip, upsertWingSpots } from '@/lib/supabase';
import { getCachedWingSpots, cacheWingSpots, checkRateLimit, getCachedScrapeResult, cacheScrapeResult } from '@/lib/cache';
import { geocodeZipCode } from '@/lib/geocode';
import { scrapeAllSources } from '@/lib/agentql';
import { isValidZipCode, cleanZipCode, calculateAvailability } from '@/lib/utils';
import { ScrapeResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes - Fluid Compute on Vercel Hobby allows up to 300s

// In-flight request deduplication
// Prevents duplicate scrapes for the same zip code when multiple requests come in simultaneously
const inFlightRequests = new Map<string, Promise<ScrapeResponse>>();

// Cleanup old entries every 5 minutes
const INFLIGHT_CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupInFlightRequests() {
    const now = Date.now();
    if (now - lastCleanup > INFLIGHT_CLEANUP_INTERVAL) {
        inFlightRequests.clear();
        lastCleanup = now;
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const rawZip = searchParams.get('zip');
    const forceRefresh = searchParams.get('refresh') === 'true';

    // Validate zip code
    if (!rawZip || !isValidZipCode(rawZip)) {
        return NextResponse.json<ScrapeResponse>(
            { success: false, spots: [], cached: false, message: 'Valid 5-digit US zip code required' },
            { status: 400 }
        );
    }

    const zipCode = cleanZipCode(rawZip);

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const rateLimit = await checkRateLimit(ip, 20, 60);

    if (!rateLimit.allowed) {
        return NextResponse.json<ScrapeResponse>(
            { success: false, spots: [], cached: false, message: `Rate limited. Try again in ${rateLimit.resetIn}s` },
            { status: 429 }
        );
    }

    // Cleanup old in-flight requests periodically
    cleanupInFlightRequests();

    // Check if there's already an in-flight request for this zip
    // This prevents duplicate scrapes when user refreshes or multiple tabs request same zip
    const inFlightKey = `scrape:${zipCode}`;
    if (!forceRefresh && inFlightRequests.has(inFlightKey)) {
        console.log(`Returning in-flight request for ${zipCode}`);
        try {
            const result = await inFlightRequests.get(inFlightKey)!;
            return NextResponse.json<ScrapeResponse>({
                ...result,
                message: result.message + ' (deduplicated request)',
            });
        } catch {
            // If the in-flight request failed, remove it and continue with new request
            inFlightRequests.delete(inFlightKey);
        }
    }

    try {
        // 1. Check Redis cache first (unless force refresh)
        if (!forceRefresh) {
            const cachedResult = await getCachedScrapeResult(zipCode);
            if (cachedResult) {
                return NextResponse.json<ScrapeResponse>({
                    ...cachedResult,
                    cached: true,
                    message: `Cached data (${cachedResult.spots.length} spots)`,
                });
            }

            const cachedSpots = await getCachedWingSpots(zipCode);
            if (cachedSpots && cachedSpots.length > 0) {
                const stats = calculateAvailability(cachedSpots);
                return NextResponse.json<ScrapeResponse>({
                    success: true,
                    spots: cachedSpots,
                    cached: true,
                    message: `Cached ${cachedSpots.length} spots (${stats.percentage}% available)`,
                });
            }
        }

        // 2. Check Supabase for recent data
        const supabase = createServerClient();
        const { data: dbSpots } = await getWingSpotsByZip(supabase, zipCode);

        if (dbSpots && dbSpots.length > 0 && !forceRefresh) {
            // Check if data is fresh (less than 15 mins old)
            const timestamps = dbSpots.map(s => new Date(s.last_updated).getTime()).filter(t => !isNaN(t));
            if (timestamps.length === 0) {
                // No valid timestamps, treat as stale
                timestamps.push(0);
            }
            const latestUpdate = new Date(Math.max(...timestamps));
            const ageMinutes = (Date.now() - latestUpdate.getTime()) / (1000 * 60);

            if (ageMinutes < 15) {
                await cacheWingSpots(zipCode, dbSpots);
                const stats = calculateAvailability(dbSpots);
                return NextResponse.json<ScrapeResponse>({
                    success: true,
                    spots: dbSpots,
                    cached: true,
                    message: `Fresh data: ${dbSpots.length} spots (${stats.percentage}% available)`,
                });
            }
        }

        // 3. Geocode zip code
        const location = await geocodeZipCode(zipCode);
        if (!location) {
            // Return stale data if available
            if (dbSpots && dbSpots.length > 0) {
                return NextResponse.json<ScrapeResponse>({
                    success: true,
                    spots: dbSpots,
                    cached: true,
                    message: 'Could not geocode zip, showing cached data',
                });
            }
            return NextResponse.json<ScrapeResponse>(
                { success: false, spots: [], cached: false, message: 'Could not find location for zip code' },
                { status: 404 }
            );
        }

        // 4. Scrape all sources (with in-flight deduplication)
        // Create a promise for this scrape operation that other requests can wait on
        const scrapePromise = (async (): Promise<ScrapeResponse> => {
            const scrapedSpots = await scrapeAllSources(zipCode, location.lat, location.lng);

            if (scrapedSpots.length === 0) {
                // No results, return stale if available
                if (dbSpots && dbSpots.length > 0) {
                    return {
                        success: true,
                        spots: dbSpots,
                        cached: true,
                        message: 'No new data found, showing cached results',
                    };
                }
                return {
                    success: true,
                    spots: [],
                    cached: false,
                    message: 'No wing spots found in this area',
                    location,
                };
            }

            // 5. Save to Supabase
            await upsertWingSpots(supabase, scrapedSpots);

            // 6. Cache results
            await cacheWingSpots(zipCode, scrapedSpots);

            const result: ScrapeResponse = {
                success: true,
                spots: scrapedSpots,
                cached: false,
                message: `Found ${scrapedSpots.length} wing spots`,
                location,
            };

            await cacheScrapeResult(zipCode, result);

            return result;
        })();

        // Store the promise so concurrent requests can use it
        inFlightRequests.set(inFlightKey, scrapePromise);

        try {
            const result = await scrapePromise;
            return NextResponse.json<ScrapeResponse>(result);
        } finally {
            // Clean up the in-flight request after completion
            inFlightRequests.delete(inFlightKey);
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Scrape API error:', errorMessage);

        // Try to return stale data on error
        try {
            const supabase = createServerClient();
            const { data: fallbackSpots } = await getWingSpotsByZip(supabase, zipCode);
            if (fallbackSpots && fallbackSpots.length > 0) {
                return NextResponse.json<ScrapeResponse>({
                    success: true,
                    spots: fallbackSpots,
                    cached: true,
                    message: 'Error occurred, showing cached data',
                });
            }
        } catch (fallbackError) {
            // Log fallback error but don't expose to client
            console.error('Fallback error:', fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback error');
        }

        return NextResponse.json<ScrapeResponse>(
            { success: false, spots: [], cached: false, message: 'An error occurred while fetching data' },
            { status: 500 }
        );
    }
}
