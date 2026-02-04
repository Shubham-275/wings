// ===========================================
// Wing Scout - AgentQL/Mino Enterprise Scraper
// ===========================================

import axios from 'axios';
import { ScrapedRestaurant, WingSpot, AgentQLResponse } from './types';
import { calculateStatus, randomDelay, deduplicateWingSpots } from './utils';
import { extractWingMenuFromImage, findBestWingDeal } from './ocr';

const AGENTQL_API_URL = process.env.AGENTQL_API_URL || 'https://api.agentql.com';
const AGENTQL_API_KEY = process.env.AGENTQL_API_KEY || '';

// Warn if API key is missing (will fail gracefully at runtime)
if (!AGENTQL_API_KEY) {
    console.warn('Warning: AGENTQL_API_KEY not set. Scraping will be disabled.');
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function executeAgentQL(url: string, query: string): Promise<AgentQLResponse> {
    // Early return if API key is not configured
    if (!AGENTQL_API_KEY) {
        return { success: false, data: null, error: 'AGENTQL_API_KEY not configured' };
    }

    try {
        const response = await axios.post(
            `${AGENTQL_API_URL}/v1/query`,
            { url, query, wait_for_navigation: true, timeout: 60000 },
            {
                headers: {
                    'Authorization': `Bearer ${AGENTQL_API_KEY}`,
                    'Content-Type': 'application/json',
                    'User-Agent': getRandomUserAgent(),
                },
                timeout: 65000,
            }
        );
        return { success: true, data: response.data };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('AgentQL error:', errorMessage);
        return { success: false, data: null, error: errorMessage };
    }
}

// ===== DOORDASH SCRAPER =====
export async function scrapeDoorDash(zipCode: string): Promise<ScrapedRestaurant[]> {
    const restaurants: ScrapedRestaurant[] = [];

    try {
        await randomDelay(2000, 4000);

        const searchUrl = `https://www.doordash.com/search/store/chicken%20wings/?pickup=false`;
        const query = `{
      restaurants[] {
        name
        address
        delivery_time
        delivery_fee
        rating
        image_url
        is_open
      }
    }`;

        const result = await executeAgentQL(searchUrl, query);
        if (!result.success || !result.data) return restaurants;

        const data = result.data as { restaurants?: Array<Record<string, unknown>> };
        for (const r of data.restaurants || []) {
            restaurants.push({
                name: String(r.name || 'Unknown'),
                address: String(r.address || ''),
                delivery_time: String(r.delivery_time || ''),
                rating: Number(r.rating) || undefined,
                image_url: String(r.image_url || ''),
                is_open: Boolean(r.is_open),
                source: 'doordash',
                menu_items: [],
            });
        }
    } catch (error) {
        console.error('DoorDash scrape error:', error);
    }

    return restaurants;
}

// ===== UBEREATS SCRAPER =====
export async function scrapeUberEats(zipCode: string): Promise<ScrapedRestaurant[]> {
    const restaurants: ScrapedRestaurant[] = [];

    try {
        await randomDelay(2000, 4000);

        const searchUrl = `https://www.ubereats.com/search?q=chicken%20wings`;
        const query = `{
      stores[] {
        name
        address
        eta
        rating
        image
        is_available
      }
    }`;

        const result = await executeAgentQL(searchUrl, query);
        if (!result.success || !result.data) return restaurants;

        const data = result.data as { stores?: Array<Record<string, unknown>> };
        for (const s of data.stores || []) {
            restaurants.push({
                name: String(s.name || 'Unknown'),
                address: String(s.address || ''),
                delivery_time: String(s.eta || ''),
                rating: Number(s.rating) || undefined,
                image_url: String(s.image || ''),
                is_open: Boolean(s.is_available),
                source: 'ubereats',
                menu_items: [],
            });
        }
    } catch (error) {
        console.error('UberEats scrape error:', error);
    }

    return restaurants;
}

// ===== GRUBHUB SCRAPER =====
export async function scrapeGrubhub(zipCode: string): Promise<ScrapedRestaurant[]> {
    const restaurants: ScrapedRestaurant[] = [];

    try {
        await randomDelay(2000, 4000);

        const searchUrl = `https://www.grubhub.com/search?query=chicken+wings&locationMode=DELIVERY`;
        const query = `{
      restaurants[] {
        name
        address
        delivery_time
        rating
        image
        is_open
      }
    }`;

        const result = await executeAgentQL(searchUrl, query);
        if (!result.success || !result.data) return restaurants;

        const data = result.data as { restaurants?: Array<Record<string, unknown>> };
        for (const r of data.restaurants || []) {
            restaurants.push({
                name: String(r.name || 'Unknown'),
                address: String(r.address || ''),
                delivery_time: String(r.delivery_time || ''),
                rating: Number(r.rating) || undefined,
                image_url: String(r.image || ''),
                is_open: Boolean(r.is_open),
                source: 'grubhub',
                menu_items: [],
            });
        }
    } catch (error) {
        console.error('Grubhub scrape error:', error);
    }

    return restaurants;
}

// ===== YELP SCRAPER =====
export async function scrapeYelp(zipCode: string): Promise<ScrapedRestaurant[]> {
    const restaurants: ScrapedRestaurant[] = [];

    try {
        await randomDelay(2000, 4000);

        const searchUrl = `https://www.yelp.com/search?find_desc=chicken+wings&find_loc=${zipCode}`;
        const query = `{
      businesses[] {
        name
        address
        phone
        rating
        image
        hours
      }
    }`;

        const result = await executeAgentQL(searchUrl, query);
        if (!result.success || !result.data) return restaurants;

        const data = result.data as { businesses?: Array<Record<string, unknown>> };
        for (const b of data.businesses || []) {
            restaurants.push({
                name: String(b.name || 'Unknown'),
                address: String(b.address || ''),
                phone: String(b.phone || ''),
                hours: String(b.hours || ''),
                rating: Number(b.rating) || undefined,
                image_url: String(b.image || ''),
                is_open: true,
                source: 'yelp',
                menu_items: [],
            });
        }
    } catch (error) {
        console.error('Yelp scrape error:', error);
    }

    return restaurants;
}

// ===== MAIN SCRAPER =====
export async function scrapeAllSources(zipCode: string, lat: number, lng: number): Promise<WingSpot[]> {
    const wingSpots: WingSpot[] = [];

    // Scrape all sources in parallel using Promise.allSettled for fault tolerance
    // If one source fails, we still get results from the others
    const results = await Promise.allSettled([
        scrapeDoorDash(zipCode),
        scrapeUberEats(zipCode),
        scrapeGrubhub(zipCode),
        scrapeYelp(zipCode),
    ]);

    // Extract successful results, log failures
    const allRestaurants: ScrapedRestaurant[] = [];
    const sourceNames = ['DoorDash', 'UberEats', 'Grubhub', 'Yelp'];

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            allRestaurants.push(...result.value);
        } else {
            console.error(`${sourceNames[index]} scraper failed:`, result.reason);
        }
    });

    for (const restaurant of allRestaurants) {
        // Process menu if image available
        let pricePerWing: number | null = null;
        let dealText: string | null = null;

        if (restaurant.image_url) {
            const menuItems = await extractWingMenuFromImage(restaurant.image_url);
            const bestDeal = findBestWingDeal(menuItems);
            if (bestDeal) {
                pricePerWing = bestDeal.price_per_wing || null;
                dealText = bestDeal.is_deal ? bestDeal.name : null;
            }
        }

        // Parse delivery time
        let deliveryMins: number | null = null;
        if (restaurant.delivery_time) {
            const match = restaurant.delivery_time.match(/(\d+)/);
            if (match) deliveryMins = parseInt(match[1], 10);
        }

        const spot: Omit<WingSpot, 'status'> & { status?: WingSpot['status'] } = {
            id: `${restaurant.source}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            name: restaurant.name,
            address: restaurant.address,
            lat: lat + (Math.random() - 0.5) * 0.02,
            lng: lng + (Math.random() - 0.5) * 0.02,
            price_per_wing: pricePerWing,
            deal_text: dealText,
            delivery_time_mins: deliveryMins,
            wait_time_mins: null,
            is_in_stock: true,
            is_open_now: restaurant.is_open ?? true,
            opens_during_game: true,
            hours_today: restaurant.hours || '11AM - 11PM',
            phone: restaurant.phone || null,
            image_url: restaurant.image_url || null,
            source: restaurant.source,
            zip_code: zipCode,
            last_updated: new Date().toISOString(),
        };

        spot.status = calculateStatus(spot);
        wingSpots.push(spot as WingSpot);
    }

    // Deduplicate restaurants that appear on multiple platforms
    // Keeps the one with best status/price/delivery time
    const deduplicatedSpots = deduplicateWingSpots(wingSpots);

    console.log(`Scraped ${wingSpots.length} spots, ${deduplicatedSpots.length} unique after deduplication`);

    return deduplicatedSpots;
}
