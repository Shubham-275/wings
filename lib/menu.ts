// ===========================================
// Wing Scout - Menu Fetching Service
// Wings-only scraping with background fetch
// Resilient parser for non-standard Mino responses
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
// Wings-Only Mino Goal Prompts (strict JSON)
// ===========================================

function getWingsOnlyGoal(hasDirectUrl: boolean): string {
    if (hasDirectUrl) {
        return `Navigate to this restaurant page. Find ONLY chicken wing menu items.

IMPORTANT: You MUST return ONLY a JSON object in this EXACT format — no other text:
{"sections": [{"name": "Wings", "items": [{"name": "10pc Wings", "price": 12.99, "quantity": 10}]}]}

Wing keywords: wings, buffalo wings, boneless wings, bone-in wings, tenders, chicken tenders, nuggets, drumettes, wing combo, wing deal, wing bucket.
SKIP everything else (burgers, fries, drinks, desserts, salads, sandwiches).

Each item needs: name (string), price (number without $), quantity (number if mentioned like "10 pc").
Group items into sections by type (e.g. "Wings", "Tenders", "Combos").

If the menu is not visible or NO wing items exist, return exactly: {"sections": []}

CRITICAL: Return ONLY the JSON object. No notes, no descriptions, no explanations.`;
    }

    return `Find this restaurant on Google Maps. Click on it, look for a Menu tab/section.

IMPORTANT: You MUST return ONLY a JSON object in this EXACT format — no other text:
{"sections": [{"name": "Wings", "items": [{"name": "Buffalo Wings", "price": 12.99, "quantity": 10}]}]}

Find ONLY wing items: wings, buffalo, boneless, bone-in, tenders, nuggets, drumettes.
Each item needs: name (string), price (number without $), quantity (number if listed).

If no wing items found, return exactly: {"sections": []}

CRITICAL: Return ONLY the JSON object. No notes, no prose, no status messages. Be fast.`;
}

// ===========================================
// Resilient Mino Response Parser
// ===========================================

/**
 * Wing-related keywords for item detection
 */
const WING_ITEM_KEYWORDS = [
    'wing', 'wings', 'buffalo', 'boneless', 'bone-in', 'bone in',
    'drumette', 'drumettes', 'tender', 'tenders', 'nugget', 'nuggets',
    'mcnugget', 'mcnuggets',
];

function isWingRelatedText(text: string): boolean {
    const lower = text.toLowerCase();
    return WING_ITEM_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Try to extract menu sections from non-standard Mino response formats.
 * Handles: flat items array, nested menu objects, descriptive summaries, etc.
 */
function extractFromAlternativeFormat(data: unknown): MenuSection[] | null {
    if (!data || typeof data !== 'object') return null;
    const obj = data as Record<string, unknown>;

    // Format B: { items: [{ name, price }] } — flat items array
    if (Array.isArray(obj.items) && obj.items.length > 0) {
        console.log('Mino wing scrape: alternative format — flat items array');
        return [{ name: 'Wings', items: parseItemsArray(obj.items) }];
    }

    // Format B2: { menu_items: [...] } or { menu: [...] }
    const menuItems = obj.menu_items || obj.menu;
    if (Array.isArray(menuItems) && menuItems.length > 0) {
        console.log('Mino wing scrape: alternative format — menu_items/menu array');
        return [{ name: 'Wings', items: parseItemsArray(menuItems) }];
    }

    // Format B3: { menu: { items: [...] } } or { menu: { sections: [...] } }
    if (obj.menu && typeof obj.menu === 'object' && !Array.isArray(obj.menu)) {
        const menuObj = obj.menu as Record<string, unknown>;
        if (Array.isArray(menuObj.sections) && menuObj.sections.length > 0) {
            console.log('Mino wing scrape: alternative format — nested menu.sections');
            return parseSectionsArray(menuObj.sections);
        }
        if (Array.isArray(menuObj.items) && menuObj.items.length > 0) {
            console.log('Mino wing scrape: alternative format — nested menu.items');
            return [{ name: 'Wings', items: parseItemsArray(menuObj.items) }];
        }
    }

    // Format C: Descriptive summary like { restrictions: ["Chicken McNuggets", ...], ... }
    // Try to extract wing-related items from any string arrays in the object
    const wingItems: MenuItem[] = [];
    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
            for (const entry of value) {
                if (typeof entry === 'string' && isWingRelatedText(entry)) {
                    wingItems.push({
                        name: entry,
                        price: null,
                        is_deal: detectDeal(entry, ''),
                    });
                } else if (typeof entry === 'object' && entry !== null) {
                    const entryObj = entry as Record<string, unknown>;
                    if (entryObj.name && typeof entryObj.name === 'string' && isWingRelatedText(String(entryObj.name))) {
                        wingItems.push({
                            name: String(entryObj.name),
                            description: entryObj.description ? String(entryObj.description) : undefined,
                            price: entryObj.price ? parseFloat(String(entryObj.price)) : null,
                            quantity: entryObj.quantity ? parseInt(String(entryObj.quantity)) : undefined,
                            is_deal: detectDeal(String(entryObj.name), String(entryObj.description || '')),
                        });
                    }
                }
            }
        }
        // Also check string values that mention wing items
        if (typeof value === 'string' && isWingRelatedText(value) && key !== 'status' && key !== 'note') {
            // Could be "extracted_items": "Chicken McNuggets 10pc - $8.99"
            const priceMatch = value.match(/\$?([\d.]+)/);
            const qtyMatch = value.match(/(\d+)\s*(pc|piece|ct|count)/i);
            wingItems.push({
                name: value.split(/[-–—,]/).map(s => s.trim()).filter(s => isWingRelatedText(s))[0] || value,
                price: priceMatch ? parseFloat(priceMatch[1]) : null,
                quantity: qtyMatch ? parseInt(qtyMatch[1]) : undefined,
                is_deal: detectDeal(value, ''),
            });
        }
    }

    if (wingItems.length > 0) {
        console.log(`Mino wing scrape: alternative format — extracted ${wingItems.length} wing items from descriptive response`);
        return [{ name: 'Wings', items: wingItems }];
    }

    // Format D: Check for any array property with objects that have a "name" field
    for (const value of Object.values(obj)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
            const firstItem = value[0] as Record<string, unknown>;
            if ('name' in firstItem) {
                console.log('Mino wing scrape: alternative format — generic named items array');
                const items = parseItemsArray(value);
                if (items.length > 0) return [{ name: 'Wings', items }];
            }
        }
    }

    return null;
}

/**
 * Parse an array of unknown items into MenuItem[]
 */
function parseItemsArray(items: unknown[]): MenuItem[] {
    return items.map((item: unknown) => {
        if (typeof item === 'string') {
            return {
                name: item,
                price: null,
                is_deal: detectDeal(item, ''),
            };
        }
        const itemObj = item as Record<string, unknown>;
        return {
            name: String(itemObj.name || 'Unknown Item'),
            description: itemObj.description ? String(itemObj.description) : undefined,
            price: itemObj.price ? parseFloat(String(itemObj.price)) : null,
            quantity: itemObj.quantity ? parseInt(String(itemObj.quantity)) : undefined,
            price_per_wing: calculatePricePerWing(itemObj.price, itemObj.quantity, String(itemObj.name || '')),
            is_deal: detectDeal(String(itemObj.name || ''), String(itemObj.description || '')),
        };
    });
}

/**
 * Parse a sections array from alternative format
 */
function parseSectionsArray(sections: unknown[]): MenuSection[] {
    return sections.map((section: unknown) => {
        const sectionObj = section as Record<string, unknown>;
        return {
            name: String(sectionObj.name || 'Wings'),
            items: Array.isArray(sectionObj.items) ? parseItemsArray(sectionObj.items) : [],
        };
    });
}

/**
 * Try to extract items from a free-form text string
 */
function extractItemsFromText(text: string): MenuItem[] {
    const items: MenuItem[] = [];
    // Split by common delimiters
    const lines = text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

    for (const line of lines) {
        if (isWingRelatedText(line)) {
            const priceMatch = line.match(/\$?([\d]+\.[\d]{2})/);
            const qtyMatch = line.match(/(\d+)\s*(pc|piece|ct|count|wings?)/i);
            items.push({
                name: line.replace(/\$[\d.]+/g, '').trim() || line,
                price: priceMatch ? parseFloat(priceMatch[1]) : null,
                quantity: qtyMatch ? parseInt(qtyMatch[1]) : undefined,
                is_deal: detectDeal(line, ''),
            });
        }
    }
    return items;
}

// ===========================================
// Main Mino Scraper
// ===========================================

/**
 * Single scrape attempt: call Mino, parse the response using all available formats.
 * Returns MenuSection[] (may be empty []) or null on API failure.
 */
async function attemptScrape(
    scrape: (url: string, goal: string) => Promise<AgentQLResponse>,
    url: string,
    goal: string
): Promise<MenuSection[] | null> {
    console.log(`Mino wing scrape: ${url}`);
    const result = await scrape(url, goal);

    if (!result.success || !result.data) {
        console.log('Mino wing scrape: No results');
        return null;
    }

    // Mino can return result as a JSON string or a parsed object — handle both
    let parsed: unknown = result.data;
    console.log(`Mino wing scrape: result.data type = ${typeof parsed}`);

    if (typeof parsed === 'string') {
        const trimmed = (parsed as string).trim();
        try {
            parsed = JSON.parse(trimmed);
            console.log('Mino wing scrape: Parsed string result to object');
        } catch {
            // Not valid JSON — try to extract items from the text
            console.log('Mino wing scrape: String is not JSON, trying text extraction');
            const textItems = extractItemsFromText(trimmed);
            if (textItems.length > 0) {
                console.log(`Mino wing scrape: Extracted ${textItems.length} items from text`);
                return [{ name: 'Wings', items: textItems }];
            }
            console.log('Mino wing scrape: No extractable items from text response');
            return []; // Empty array = "no wings found" (not null = "failed")
        }
    }

    // Standard format: { sections: [...] }
    const data = parsed as { sections?: Array<{ name: string; items: unknown[] }> };
    if (data.sections && Array.isArray(data.sections)) {
        if (data.sections.length === 0) {
            console.log('Mino wing scrape: Returned empty sections array (no wings at this restaurant)');
            return []; // Mino explicitly said no wings
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

        console.log(`Mino wing scrape: Found ${sections.length} sections (standard format)`);
        return sections;
    }

    // Non-standard format — try alternative extraction
    console.log('Mino wing scrape: No sections found, trying alternative formats...',
        JSON.stringify(data).substring(0, 300));
    const altSections = extractFromAlternativeFormat(parsed);
    if (altSections && altSections.length > 0) {
        return altSections;
    }

    // Mino returned data but nothing we can parse into wing items
    console.log('Mino wing scrape: Could not extract wing items from response');
    return []; // Empty = "no wings found at this restaurant"
}

/**
 * Scrape wing items from restaurant using Mino.
 * Accepts optional scrape function for timeout flexibility:
 * - Default: executeMinoMenuScrape (45s timeout) for fast path
 * - Background: executeMinoScrape (120s timeout) for background scrape
 *
 * Fallback chain:
 * 1. Try platform URL (Grubhub/DoorDash/UberEats) if available
 * 2. If platform URL returns empty → try Google search for "[name] menu wings"
 * 3. If already on Google (no platform URL) → single attempt only (no loop)
 *
 * Returns MenuSection[] (may be empty []) or null on total failure
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
        // First attempt: platform URL or Google Maps
        const sections = await attemptScrape(scrape, scrapeUrl, goal);

        // If platform URL returned empty, try Google search as fallback
        // Only when we used a direct URL (don't loop if already on Google)
        if (sections !== null && sections.length === 0 && hasDirectUrl) {
            console.log(`Mino wing scrape: platform URL returned empty, trying Google search for "${name}"...`);
            const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(name + ' menu wings')}`;
            const googleGoal = getWingsOnlyGoal(false);
            const googleSections = await attemptScrape(scrape, googleUrl, googleGoal);
            if (googleSections && googleSections.length > 0) {
                console.log(`Mino wing scrape: Google fallback found ${googleSections.length} sections!`);
                return googleSections;
            }
            console.log('Mino wing scrape: Google fallback also empty — genuinely no wings');
        }

        return sections;
    } catch (error) {
        console.error('Mino wing scrape error:', error);
        return null; // null = actual failure, can retry
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

/**
 * Get the cheapest price per wing from menu sections.
 * Scans all wing items across all sections for the lowest price_per_wing.
 * Also considers raw item prices for items with "wing" in the name but no quantity.
 */
export function getCheapestWingPrice(sections: MenuSection[]): number | null {
    const WING_KEYWORDS = ['wing', 'wings', 'buffalo', 'boneless', 'drumette'];
    let cheapest: number | null = null;

    for (const section of sections) {
        for (const item of section.items) {
            // Check price_per_wing if available
            if (item.price_per_wing && item.price_per_wing > 0) {
                if (cheapest === null || item.price_per_wing < cheapest) {
                    cheapest = item.price_per_wing;
                }
            }
            // Fallback: if item is a wing item with a reasonable price but no per-wing calc,
            // use the raw price as an approximation (e.g., "6 Wings $8.99" → ~$1.50/wing)
            else if (item.price && item.price > 0 && item.price < 50) {
                const text = (item.name + ' ' + (item.description || '')).toLowerCase();
                if (WING_KEYWORDS.some(kw => text.includes(kw))) {
                    // Try to extract quantity from name
                    const match = item.name.match(/(\d+)\s*(pc|piece|wing|ct|count|pk)/i);
                    if (match) {
                        const qty = parseInt(match[1]);
                        if (qty > 0) {
                            const ppw = Math.round((item.price / qty) * 100) / 100;
                            if (ppw > 0 && ppw < 10) { // sanity check
                                if (cheapest === null || ppw < cheapest) {
                                    cheapest = ppw;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return cheapest;
}

// ===========================================
// Background Menu Scraping
// ===========================================

/**
 * Fire-and-forget background wing scrape.
 * Uses the full 120s Mino timeout via executeMinoScrape.
 * On success, caches the result in Redis + chain cache + Supabase.
 * Redis scouting lock prevents duplicates across serverless instances.
 *
 * Now also caches empty results (no wings) to prevent re-scraping
 * restaurants that genuinely don't have wing items.
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

            // null = total failure (API error, timeout, etc.) — don't cache, allow retry
            if (sections === null) {
                console.log(`Background scrape: failed for ${spotId} (will allow retry)`);
                return;
            }

            // Empty array = Mino found no wing items at this restaurant — cache to prevent re-scraping
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

                // Extract cheapest wing price and update the wing_spots table
                const cheapestPrice = getCheapestWingPrice(sections);
                if (cheapestPrice !== null) {
                    await supabase
                        .from('wing_spots')
                        .update({ price_per_wing: cheapestPrice })
                        .eq('id', spotId);
                    console.log(`Background scrape: Updated price_per_wing=$${cheapestPrice.toFixed(2)} for ${spotId}`);
                }
            } catch (dbErr) {
                console.error('Background scrape: Supabase persist error:', dbErr);
            }

            console.log(`Background scrape SUCCESS for ${spotId}: ${sections.length} sections cached (has_wings: ${menu.has_wings})`);
        } catch (err) {
            console.error(`Background scrape error for ${spotId}:`, err);
        } finally {
            // ALWAYS clear the Redis scouting lock, even on failure
            await clearScoutingLock(spotId);
        }
    })();
}
