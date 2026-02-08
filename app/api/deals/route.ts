// ===========================================
// Wing Scout — Super Bowl Deals API Endpoint
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getCachedDeals, cacheDeals } from '@/lib/cache';
import { fetchSuperBowlDeals } from '@/lib/deals';
import { DealsResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes — enough for parallel website + Instagram scrape

// In-flight request deduplication
const inFlightRequests = new Map<string, Promise<DealsResponse>>();

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const spotId = searchParams.get('spot_id');

    if (!spotId) {
        return NextResponse.json<DealsResponse>(
            { success: false, deals: [], cached: false, message: 'spot_id is required' },
            { status: 400 }
        );
    }

    // Check for in-flight request (deduplication)
    const inFlightKey = `deals:${spotId}`;
    if (inFlightRequests.has(inFlightKey)) {
        try {
            const result = await inFlightRequests.get(inFlightKey)!;
            return NextResponse.json<DealsResponse>({
                ...result,
                message: result.message + ' (deduplicated)',
            });
        } catch {
            inFlightRequests.delete(inFlightKey);
        }
    }

    try {
        // 1. Check Redis cache first (30-min TTL)
        const cachedDeals = await getCachedDeals(spotId);
        if (cachedDeals) {
            console.log(`Deals cache hit for ${spotId}: ${cachedDeals.length} deals`);
            return NextResponse.json<DealsResponse>({
                success: true,
                deals: cachedDeals,
                cached: true,
                message: `${cachedDeals.length} Super Bowl deal(s) (cached)`,
            });
        }

        // 2. Look up spot details from Supabase
        const supabase = createServerClient();
        const { data: spot, error: spotError } = await supabase
            .from('wing_spots')
            .select('name, address, platform_ids')
            .eq('id', spotId)
            .single();

        if (!spot || spotError) {
            console.log(`Deals: spot not found: ${spotId}`);
            return NextResponse.json<DealsResponse>(
                { success: false, deals: [], cached: false, message: 'Spot not found' },
                { status: 404 }
            );
        }

        // 3. Fetch deals with deduplication
        const fetchPromise = (async (): Promise<DealsResponse> => {
            console.log(`Fetching Super Bowl deals for ${spotId}: ${spot.name}`);
            const deals = await fetchSuperBowlDeals(
                spot.name,
                spot.address,
                spot.platform_ids,
            );

            // 4. Cache in Redis (30-min TTL)
            await cacheDeals(spotId, deals);

            return {
                success: true,
                deals,
                cached: false,
                message: deals.length > 0
                    ? `Found ${deals.length} Super Bowl deal(s)`
                    : 'No Super Bowl specials found for this restaurant',
            };
        })();

        inFlightRequests.set(inFlightKey, fetchPromise);

        try {
            const result = await fetchPromise;
            return NextResponse.json<DealsResponse>(result);
        } finally {
            inFlightRequests.delete(inFlightKey);
        }
    } catch (error) {
        console.error('Deals API error:', error);
        return NextResponse.json<DealsResponse>(
            { success: false, deals: [], cached: false, message: 'Failed to fetch deals' },
            { status: 500 }
        );
    }
}
