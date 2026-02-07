// ===========================================
// Wing Scout - Menu Fetching Service
// ===========================================

import axios from 'axios';
import { Menu, MenuSection, MenuItem, PlatformIds } from './types';
import { executeMinoScrape } from './agentql';

/**
 * Main menu fetching function with fallback chain
 * Priority: 1. Yelp Fusion API  2. Mino scraping
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
        return buildMenu(spotId, yelpMenu, 'yelp');
    }

    // 2. Fallback to Mino scraping (comprehensive but slower)
    const scrapedMenu = await scrapeMenuWithMino(name, address, platformIds);
    if (scrapedMenu) {
        return buildMenu(spotId, scrapedMenu, 'mino_scrape');
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

/**
 * Scrape menu directly from delivery platform using Mino
 * This is the most reliable but slowest option
 */
async function scrapeMenuWithMino(
    name: string,
    address: string,
    platformIds?: PlatformIds
): Promise<MenuSection[] | null> {
    // Determine best URL to scrape based on available platform IDs
    let scrapeUrl: string;

    let goal: string;

    if (platformIds?.source_url) {
        // Use the direct restaurant URL if available (DoorDash, UberEats, Grubhub)
        scrapeUrl = platformIds.source_url;
        goal = `Navigate to this restaurant page and extract the full menu.
Return a JSON object with an array called "sections", where each section has:
- name (section name like "Wings", "Appetizers", "Combos", "Entrees")
- items (array of menu items)

Each item should have:
- name (item name)
- description (optional description text)
- price (number only, just the dollar amount without $ symbol)

Focus especially on wing items and chicken dishes. Include all visible menu sections.`;
    } else {
        // Fallback to Google Maps for menu extraction
        scrapeUrl = `https://www.google.com/maps/search/${encodeURIComponent(name + ' ' + address)}`;
        goal = `Find this restaurant on Google Maps and extract its menu.
Steps:
1. Click on the restaurant listing in the search results
2. Look for a "Menu" tab or section on the business profile
3. If a menu link or tab exists, click it to see the full menu
4. If no menu tab, look for menu items shown in the overview or photos

Return a JSON object with an array called "sections", where each section has:
- name (section name like "Wings", "Appetizers", "Combos", "Entrees")
- items (array of menu items)

Each item should have:
- name (item name)
- description (optional description text)
- price (number only, just the dollar amount without $ symbol)

Focus especially on wing items and chicken dishes. Include all visible menu sections.
If the menu is not available on Google Maps, try clicking any linked website or ordering platform to find the menu there.`;
    }

    try {
        console.log(`Mino menu scrape: ${scrapeUrl}`);
        const result = await executeMinoScrape(scrapeUrl, goal);

        if (!result.success || !result.data) {
            console.log('Mino menu scrape: No results');
            return null;
        }

        // Mino can return result as a JSON string or a parsed object — handle both
        let parsed: unknown = result.data;
        console.log(`Mino menu scrape: result.data type = ${typeof parsed}`);
        if (typeof parsed === 'string') {
            try {
                parsed = JSON.parse(parsed);
                console.log('Mino menu scrape: Parsed string result to object');
            } catch {
                console.log('Mino menu scrape: Failed to parse string result as JSON');
                return null;
            }
        }

        const data = parsed as { sections?: Array<{ name: string; items: unknown[] }> };
        if (!data.sections || data.sections.length === 0) {
            console.log('Mino menu scrape: No sections found in response', JSON.stringify(data).substring(0, 200));
            return null;
        }

        // Parse and structure the menu sections
        const sections: MenuSection[] = data.sections.map(section => ({
            name: String(section.name || 'Menu'),
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

        console.log(`Mino menu scrape: Found ${sections.length} sections`);
        return sections;
    } catch (error) {
        console.error('Mino menu scrape error:', error);
        return null;
    }
}

/**
 * Build a complete Menu object from sections
 */
function buildMenu(
    spotId: string,
    sections: MenuSection[],
    source: 'yelp' | 'mino_scrape'
): Menu {
    return {
        spot_id: spotId,
        sections,
        fetched_at: new Date().toISOString(),
        source,
        has_wings: detectWingItems(sections),
        wing_section_index: findWingSectionIndex(sections),
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

