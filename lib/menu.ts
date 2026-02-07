// ===========================================
// Wing Scout - Menu Fetching Service
// Wings-only scraping with background fetch
// ===========================================

import axios from 'axios';
import { Menu, MenuSection, MenuItem, PlatformIds, AgentQLResponse } from './types';
import { executeMinoMenuScrape, executeMinoScrape } from './agentql';
import { cacheMenu, cacheChainMenu, clearScoutingLock } from './cache';
import { createServerClient } from './supabase';

/**
 * Main menu fetching function with fallback chain
 * Priority: 1. Yelp Fusion API  2. Mino scraping (45s timeout)
 */
export async function fetchMenu(
    spotId: string,
    name: string,
    address: string,
    platformIds?: PlatformIds
): Promise<Menu | null> {
    // 1. Try Yelp Fusion API (5k/day free tier)
    const yelpMenu = await fetchYelpMenu(name, address);
    if (yelpMenu) {
        return buildMenu(spotId, yelpMenu, 'yelp', platformIds?.source_url);
    }

    // 2. Fallback to Mino scraping (wings-only, 45s timeout)
    const scrapedMenu = await scrapeMenuWithMino(name, address, platformIds);
    if (scrapedMenu) {
        return buildMenu(spotId, scrapedMenu, 'mino_scrape', platformIds?.source_url);
    }

    return null;
}

/**
 * Fetch menu from Yelp Fusion API
 * Note: Yelp free API doesn't include menu items directly,
 * but provides business info and menu_url for potential scraping
 */
async function fetchYelpMenu(
    name: string,
    address: string
): Promise<MenuSection[] | null> {
    const apiKey = process.env.YELP_API_KEY;
    if (!apiKey) {
        console.log('Yelp API key not configured, skipping Yelp menu fetch');
        return null;
    }

    try {
        // Search for the business
        const searchResponse = await axios.get('https://api.yelp.com/v3/businesses/search', {
            params: {
                term: name,
                location: address,
                limit: 1,
            },
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            timeout: 5000,
        });

        const business = searchResponse.data.businesses?.[0];
        if (!business?.id) {
            console.log('Yelp: Business not found');
            return null;
        }

        // Note: Yelp Fusion free API doesn't include menu items directly
        // The menu_url field can be used for scraping if needed
        console.log(`Yelp: Found business ${business.id}, but menu data not available in free API`);
        return null;
    } catch (error) {
        console.error('Yelp menu fetch error:', error);
        return null;
    }
}

// ===========================================
// Wings-Only Mino Goal Prompts
// ===========================================

function getWingsOnlyGoal(hasDirectUrl: boolean): string {
    if (hasDirectUrl) {
        return `Navigate to this restaurant page. Extract ONLY wing-related menu items and any wing deals/combos.

Look for items matching these keywords: wings, buffalo wings, boneless wings, bone-in wings, drumettes, tenders, chicken tenders, nuggets, wing combo, wing deal, wing special, wing bucket.

SKIP all non-wing items (burgers, fries, drinks, desserts, salads, sandwiches, etc).

Return a JSON object with an array called "sections", where each section has:
- name (section name like "Wings", "Boneless Wings", "Wing Combos", "Deals")
- items (array of items)

Each item should have:
- name (item name)
- description (optional description text)
- price (number only, just the dollar amount without $ symbol)
- quantity (number of pieces if mentioned, like "10 pc" = 10)

Be fast — only look at wing-related sections. Do not scroll through the entire menu.`;
    }

    return `Find this restaurant on Google Maps and look for wing items on their menu.
Steps:
1. Click on the restaurant listing
2. Look for a "Menu" tab or section
3. Find ONLY wing-related items: wings, buffalo wings, boneless, bone-in, drumettes, tenders, nuggets
4. If you see menu images, read only items that appear to be wings or chicken tenders

SKIP all non-wing items (burgers, fries, drinks, desserts, sandwiches, etc).

Return a JSON object with an array called "sections", where each section has:
- name (section name like "Wings", "Boneless Wings", "Wing Combos")
- items (array of items)

Each item should have:
- name (item name)
- description (optional description text)
- price (number only, just the dollar amount without $ symbol)
- quantity (number of pieces if mentioned)

Be fast — spend no more than 20 seconds. Only extract wing items.`;
}

/**
 * Scrape wing items from restaurant using Mino
 * Accepts optional scrape function for timeout flexibility:
 * - Default: executeMinoMenuScrape (45s timeout) for fast path
 * - Background: executeMinoScrape (120s timeout) for background scrape
 */
export async function scrapeMenuWithMino(
    name: string,
    address: string,
    platformIds?: PlatformIds,
    scrapeFn?: (url: string, goal: string) => Promise<AgentQLResponse>
): Promise<MenuSection[] | null> {
    const scrape = scrapeFn || executeMinoMenuScrape;

    // Determine best URL to scrape
    const hasDirectUrl = !!platformIds?.source_url;
    const scrapeUrl = hasDirectUrl
        ? platformIds!.source_url!
        : `https://www.google.com/maps/search/${encodeURIComponent(name + ' ' + address)}`;
    const goal = getWingsOnlyGoal(hasDirectUrl);

    try {
        console.log(`Mino wing scrape: ${scrapeUrl}`);
        const result = await scrape(scrapeUrl, goal);

        if (!result.success || !result.data) {
            console.log('Mino wing scrape: No results');
            return null;
        }

        // Mino can return result as a JSON string or a parsed object — handle both
        let parsed: unknown = result.data;
        console.log(`Mino wing scrape: result.data type = ${typeof parsed}`);
        if (typeof parsed === 'string') {
            try {
                parsed = JSON.parse(parsed);
                console.log('Mino wing scrape: Parsed string result to object');
            } catch {
                console.log('Mino wing scrape: Failed to parse string result as JSON');
                return null;
            }
        }

        const data = parsed as { sections?: Array<{ name: string; items: unknown[] }> };
        if (!data.sections || data.sections.length === 0) {
            console.log('Mino wing scrape: No sections found in response', JSON.stringify(data).substring(0, 200));
            return null;
        }

        // Parse and structure the menu sections
        const sections: MenuSection[] = data.sections.map(section => ({
            name: String(section.name || 'Wings'),
            items: (section.items || []).map((item: unknown) => {
                const itemObj = item as Record<string, unknown>;
                return {
                    name: String(itemObj.name || 'Unknown Item'),
                    description: itemObj.description ? String(itemObj.description) : undefined,
                    price: itemObj.price ? parseFloat(String(itemObj.price)) : null,
                    quantity: itemObj.quantity ? parseInt(String(itemObj.quantity)) : undefined,
                    price_per_wing: calculatePricePerWing(itemObj.price, itemObj.quantity, String(itemObj.name || '')),
                    is_deal: detectDeal(String(itemObj.name || ''), String(itemObj.description || '')),
                };
            }),
        }));

        console.log(`Mino wing scrape: Found ${sections.length} sections`);
        return sections;
    } catch (error) {
        console.error('Mino wing scrape error:', error);
        return null;
    }
}

/**
 * Build a complete Menu object from sections
 */
function buildMenu(
    spotId: string,
    sections: MenuSection[],
    source: 'yelp' | 'mino_scrape',
    sourceUrl?: string
): Menu {
    return {
        spot_id: spotId,
        sections,
        fetched_at: new Date().toISOString(),
        source,
        has_wings: detectWingItems(sections),
        wing_section_index: findWingSectionIndex(sections),
        source_url: sourceUrl,
    };
}

/**
 * Detect if menu sections contain wing items
 */
function detectWingItems(sections: MenuSection[]): boolean {
    const wingKeywords = ['wing', 'wings', 'buffalo', 'boneless', 'drumette'];

    for (const section of sections) {
        for (const item of section.items) {
            const itemText = (item.name + ' ' + (item.description || '')).toLowerCase();
            if (wingKeywords.some(kw => itemText.includes(kw))) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Find the index of the section most likely to contain wings
 */
function findWingSectionIndex(sections: MenuSection[]): number | undefined {
    const wingKeywords = ['wing', 'wings', 'buffalo'];

    // First, look for a section named "Wings" or similar
    for (let i = 0; i < sections.length; i++) {
        if (wingKeywords.some(kw => sections[i].name.toLowerCase().includes(kw))) {
            return i;
        }
    }

    // Otherwise, find section with most wing items
    let maxWingItems = 0;
    let bestIndex: number | undefined;

    for (let i = 0; i < sections.length; i++) {
        const wingCount = sections[i].items.filter(item =>
            wingKeywords.some(kw => item.name.toLowerCase().includes(kw))
        ).length;

        if (wingCount > maxWingItems) {
            maxWingItems = wingCount;
            bestIndex = i;
        }
    }

    return bestIndex;
}

/**
 * Calculate price per wing from item data
 */
function calculatePricePerWing(
    price: unknown,
    quantity: unknown,
    name: string
): number | undefined {
    const priceNum = typeof price === 'string' ? parseFloat(price) : (typeof price === 'number' ? price : undefined);
    let quantityNum = typeof quantity === 'string' ? parseInt(quantity) : (typeof quantity === 'number' ? quantity : undefined);

    // Try to extract quantity from name if not provided
    if (!quantityNum) {
        const match = name.match(/(\d+)\s*(pc|piece|wing|ct|count)/i);
        if (match) {
            quantityNum = parseInt(match[1]);
        }
    }

    if (priceNum && quantityNum && quantityNum > 0) {
        return Math.round((priceNum / quantityNum) * 100) / 100;
    }

    return undefined;
}

/**
 * Detect if item appears to be a deal
 */
function detectDeal(name: string, description?: string): boolean {
    const dealKeywords = ['deal', 'special', 'combo', 'bundle', 'meal', 'discount', 'off', 'save', 'value'];
    const text = (name + ' ' + (description || '')).toLowerCase();
    return dealKeywords.some(kw => text.includes(kw));
}

// ===========================================
// Background Menu Scraping
// ===========================================

/**
 * Fire-and-forget background wing scrape.
 * Uses the full 120s Mino timeout via executeMinoScrape.
 * On success, caches the result in Redis + chain cache + Supabase.
 * Redis scouting lock prevents duplicates across serverless instances.
 */
export function startBackgroundMenuScrape(
    spotId: string,
    name: string,
    address: string,
    platformIds?: PlatformIds
): void {
    console.log(`Starting background wing scrape for ${spotId}: ${name}`);

    // Fire-and-forget — reuses scrapeMenuWithMino with full 120s timeout
    (async () => {
        try {
            const sections = await scrapeMenuWithMino(name, address, platformIds, executeMinoScrape);

            if (!sections || sections.length === 0) {
                console.log(`Background scrape: no wing items for ${spotId}`);
                return;
            }

            const menu = buildMenu(spotId, sections, 'mino_scrape', platformIds?.source_url);

            // Cache in Redis (per-spot + chain)
            await cacheMenu(spotId, menu);
            await cacheChainMenu(name, menu);

            // Persist to Supabase
            try {
                const supabase = createServerClient();
                await supabase
                    .from('menus')
                    .upsert({
                        spot_id: spotId,
                        sections: menu.sections,
                        source: menu.source,
                        has_wings: menu.has_wings,
                        wing_section_index: menu.wing_section_index,
                        fetched_at: menu.fetched_at,
                    }, { onConflict: 'spot_id' });
            } catch (dbErr) {
                console.error('Background scrape: Supabase persist error:', dbErr);
            }

            console.log(`Background scrape SUCCESS for ${spotId}: ${sections.length} sections cached`);
        } catch (err) {
            console.error(`Background scrape error for ${spotId}:`, err);
        } finally {
            // ALWAYS clear the Redis scouting lock, even on failure
            await clearScoutingLock(spotId);
        }
    })();
}
