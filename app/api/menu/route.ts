// ===========================================
// Wing Scout - Menu API Endpoint
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getCachedMenu, cacheMenu, getCachedChainMenu, cacheChainMenu } from '@/lib/cache';
import { fetchMenu } from '@/lib/menu';
import { MenuResponse, Menu } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds max for menu fetch

// In-flight request deduplication
const inFlightRequests = new Map<string, Promise<MenuResponse>>();

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const spotId = searchParams.get('spot_id');

    // Validate spot_id parameter
    if (!spotId) {
        return NextResponse.json<MenuResponse>(
            { success: false, menu: null, cached: false, message: 'spot_id is required' },
            { status: 400 }
        );
    }

    // Seed data spots have no real restaurants — skip Mino entirely
    if (spotId.startsWith('seed-')) {
        return NextResponse.json<MenuResponse>({
            success: false,
            menu: null,
            cached: false,
            message: 'Menu not available for demo restaurants. Search with a real zip code to see live menus!',
        });
    }

    // Check for in-flight request (deduplication)
    const inFlightKey = `menu:${spotId}`;
    if (inFlightRequests.has(inFlightKey)) {
        try {
            const result = await inFlightRequests.get(inFlightKey)!;
            return NextResponse.json<MenuResponse>({
                ...result,
                message: result.message + ' (deduplicated)',
            });
        } catch {
            inFlightRequests.delete(inFlightKey);
        }
    }

    try {
        // 1. Check Redis cache first (1-hour TTL)
        const cachedMenu = await getCachedMenu(spotId);
        if (cachedMenu) {
            console.log(`Menu cache hit for ${spotId}`);
            return NextResponse.json<MenuResponse>({
                success: true,
                menu: { ...cachedMenu, source: 'cached' } as Menu,
                cached: true,
                message: 'Menu loaded from cache',
            });
        }

        // 2. Check Supabase for persisted menu
        const supabase = createServerClient();
        const { data: dbMenu, error: dbError } = await supabase
            .from('menus')
            .select('*')
            .eq('spot_id', spotId)
            .single();

        if (dbMenu && !dbError) {
            // Check if menu is fresh (less than 24 hours old)
            const fetchedAt = new Date(dbMenu.fetched_at);
            const ageHours = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60);

            if (ageHours < 24) {
                // Cache in Redis and return
                const menu: Menu = {
                    spot_id: dbMenu.spot_id,
                    sections: dbMenu.sections,
                    fetched_at: dbMenu.fetched_at,
                    source: 'cached',
                    has_wings: dbMenu.has_wings,
                    wing_section_index: dbMenu.wing_section_index,
                };
                await cacheMenu(spotId, menu);
                console.log(`Menu loaded from database for ${spotId}`);
                return NextResponse.json<MenuResponse>({
                    success: true,
                    menu,
                    cached: true,
                    message: 'Menu loaded from database',
                });
            }
        }

        // 3. Fetch spot details for menu lookup
        const { data: spot, error: spotError } = await supabase
            .from('wing_spots')
            .select('name, address, platform_ids')
            .eq('id', spotId)
            .single();

        if (!spot || spotError) {
            console.log(`Spot not found: ${spotId}`);
            return NextResponse.json<MenuResponse>(
                { success: false, menu: null, cached: false, message: 'Spot not found' },
                { status: 404 }
            );
        }

        // 4. Check chain-level cache (shared across all locations of same restaurant)
        const chainMenu = await getCachedChainMenu(spot.name);
        if (chainMenu) {
            console.log(`Chain cache hit for "${spot.name}" (spot ${spotId})`);
            // Also cache under this spot's ID for faster next lookup
            const spotMenu: Menu = { ...chainMenu, spot_id: spotId, source: 'cached' };
            await cacheMenu(spotId, spotMenu);
            return NextResponse.json<MenuResponse>({
                success: true,
                menu: spotMenu,
                cached: true,
                message: `Menu loaded from chain cache (${spot.name})`,
            });
        }

        // 5. Fetch fresh menu with deduplication
        const fetchPromise = (async (): Promise<MenuResponse> => {
            console.log(`Fetching fresh menu for ${spotId}: ${spot.name}`);
            const menu = await fetchMenu(
                spotId,
                spot.name,
                spot.address,
                spot.platform_ids
            );

            if (!menu) {
                return {
                    success: false,
                    menu: null,
                    cached: false,
                    message: 'Could not fetch menu for this restaurant',
                };
            }

            // 6. Cache in Redis (per-spot 1hr + chain-level 6hr)
            await cacheMenu(spotId, menu);
            await cacheChainMenu(spot.name, menu);

            // 7. Persist to Supabase
            const { error: upsertError } = await supabase
                .from('menus')
                .upsert({
                    spot_id: spotId,
                    sections: menu.sections,
                    source: menu.source,
                    has_wings: menu.has_wings,
                    wing_section_index: menu.wing_section_index,
                    fetched_at: menu.fetched_at,
                }, { onConflict: 'spot_id' });

            if (upsertError) {
                console.error('Failed to persist menu to Supabase:', upsertError);
                // Continue anyway - we have the menu cached
            }

            return {
                success: true,
                menu,
                cached: false,
                message: `Menu fetched from ${menu.source}`,
            };
        })();

        inFlightRequests.set(inFlightKey, fetchPromise);

        try {
            const result = await fetchPromise;
            return NextResponse.json<MenuResponse>(result);
        } finally {
            inFlightRequests.delete(inFlightKey);
        }
    } catch (error) {
        console.error('Menu API error:', error);
        return NextResponse.json<MenuResponse>(
            { success: false, menu: null, cached: false, message: 'Failed to fetch menu' },
            { status: 500 }
        );
    }
}
