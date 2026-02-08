// ===========================================
// Wing Scout — Super Bowl Deals Scraper
// Visits restaurant websites and Instagram to find game day specials
// ===========================================

import { SuperBowlDeal, PlatformIds, AgentQLResponse } from './types';
import { runMinoScrape } from './agentql';

const DEALS_SCRAPE_TIMEOUT = 90000; // 90 seconds per source

/**
 * Timeout helper (same pattern as agentql.ts)
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
            console.warn(`Deals scrape timed out after ${timeoutMs}ms`);
            resolve(fallback);
        }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

/**
 * Parse deals from Mino scrape result
 */
function parseDeals(result: AgentQLResponse, source: SuperBowlDeal['source']): SuperBowlDeal[] {
    if (!result.success || !result.data) return [];

    try {
        const data = result.data as { deals?: Array<Record<string, unknown>> };
        const rawDeals = data.deals || [];

        return rawDeals
            .filter(d => d.description && String(d.description).trim().length > 0)
            .map(d => ({
                description: String(d.description).trim(),
                source,
                promo_code: d.promo_code ? String(d.promo_code).trim() : undefined,
                pre_order_deadline: d.pre_order_deadline ? String(d.pre_order_deadline).trim() : undefined,
                pre_order_url: d.pre_order_url && String(d.pre_order_url).startsWith('http')
                    ? String(d.pre_order_url).trim()
                    : undefined,
                special_menu_items: Array.isArray(d.special_items)
                    ? (d.special_items as string[]).map(s => String(s).trim()).filter(Boolean)
                    : undefined,
            }));
    } catch (error) {
        console.error(`Failed to parse ${source} deals:`, error);
        return [];
    }
}

/**
 * Scrape a restaurant's website for Super Bowl specials
 */
async function scrapeWebsiteForDeals(
    name: string,
    address: string,
    websiteUrl?: string,
): Promise<SuperBowlDeal[]> {
    const url = websiteUrl || `https://www.google.com/search?q=${encodeURIComponent(`${name} ${address} super bowl specials game day deals`)}`;

    const goal = `Visit this restaurant website and look for ANY Super Bowl specials, game day deals, pre-order information, party platters, catering specials, or limited-time promotions for Super Bowl Sunday (February 8, 2026).
Check:
- Homepage banners, popups, and hero sections
- Special/Events/Promotions pages
- Catering or Party pages
- Any mention of: "Super Bowl", "game day", "big game", "SB", "special", "deal", "pre-order", "catering", "party platter", "wings special", "game day bundle"

Return a JSON object with a "deals" array. Each deal should have:
- description (the full deal text, e.g. "50 wings for $39.99 - Super Bowl Special")
- promo_code (any promo/coupon code if mentioned)
- pre_order_deadline (ordering deadline if mentioned, e.g. "Order by Feb 7 5PM")
- pre_order_url (URL to the pre-order/catering page if found)
- special_items (array of special menu item names if listed)

If NO Super Bowl or game day deals are found, return {"deals": []}.
${websiteUrl ? '' : 'If this is a search results page, click on the first relevant restaurant website to check for deals.'}`;

    try {
        console.log(`Deals: scraping website for ${name}: ${url}`);
        const result = await runMinoScrape(url, goal, DEALS_SCRAPE_TIMEOUT);
        return parseDeals(result, 'website');
    } catch (error) {
        console.error(`Website deals scrape error for ${name}:`, error);
        return [];
    }
}

/**
 * Scrape Instagram for Super Bowl deal posts
 */
async function scrapeInstagramForDeals(
    name: string,
    instagramUrl?: string,
): Promise<SuperBowlDeal[]> {
    const url = instagramUrl || `https://www.google.com/search?q=${encodeURIComponent(`${name} instagram super bowl specials wings deals 2026`)}`;

    const goal = `Look at this restaurant's Instagram page or search results for their Instagram presence.
Find any recent posts (from the last 2 weeks, January-February 2026) about:
- Super Bowl specials or game day deals
- Wing specials or party platters
- Pre-order announcements for Super Bowl Sunday
- Any promotional offers for the big game

Return a JSON object with a "deals" array. Each deal should have:
- description (what the post says about the deal/special)
- promo_code (if any promo code is mentioned in the post)
- pre_order_deadline (if a deadline is mentioned)

If no relevant Super Bowl posts are found, return {"deals": []}.
${instagramUrl ? '' : 'If this is a Google search page, look at the visible Instagram post previews in the search results.'}`;

    try {
        console.log(`Deals: scraping Instagram for ${name}: ${url}`);
        const result = await runMinoScrape(url, goal, DEALS_SCRAPE_TIMEOUT);
        return parseDeals(result, 'instagram');
    } catch (error) {
        console.error(`Instagram deals scrape error for ${name}:`, error);
        return [];
    }
}

/**
 * Main entry point: fetch Super Bowl deals for a restaurant
 * Scrapes website and Instagram in parallel
 */
export async function fetchSuperBowlDeals(
    name: string,
    address: string,
    platformIds?: PlatformIds,
): Promise<SuperBowlDeal[]> {
    console.log(`Fetching Super Bowl deals for: ${name}`);

    const websiteUrl = platformIds?.website_url;
    const instagramUrl = platformIds?.instagram_url;

    // Run both scrapers in parallel with timeout protection
    const results = await Promise.allSettled([
        withTimeout(scrapeWebsiteForDeals(name, address, websiteUrl), DEALS_SCRAPE_TIMEOUT, []),
        withTimeout(scrapeInstagramForDeals(name, instagramUrl), DEALS_SCRAPE_TIMEOUT, []),
    ]);

    const allDeals: SuperBowlDeal[] = [];

    if (results[0].status === 'fulfilled') {
        console.log(`Website deals: ${results[0].value.length} found`);
        allDeals.push(...results[0].value);
    }

    if (results[1].status === 'fulfilled') {
        console.log(`Instagram deals: ${results[1].value.length} found`);
        allDeals.push(...results[1].value);
    }

    // Deduplicate by description similarity
    const seen = new Set<string>();
    const unique = allDeals.filter(deal => {
        const key = deal.description.toLowerCase().substring(0, 50);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    console.log(`Total Super Bowl deals for ${name}: ${unique.length}`);
    return unique;
}
