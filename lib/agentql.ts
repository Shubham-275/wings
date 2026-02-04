// ===========================================
// Wing Scout - Mino AI Web Scraper
// ===========================================

import axios from 'axios';
import { ScrapedRestaurant, WingSpot, AgentQLResponse } from './types';
import { calculateStatus, randomDelay, deduplicateWingSpots } from './utils';
import { extractWingMenuFromImage, findBestWingDeal } from './ocr';

// Mino API Configuration
const MINO_API_URL = process.env.AGENTQL_API_URL || 'https://mino.ai/v1/automation/run-sse';
const MINO_API_KEY = process.env.AGENTQL_API_KEY || '';

// Warn if API key is missing (will fail gracefully at runtime)
if (!MINO_API_KEY) {
    console.warn('Warning: MINO API KEY (AGENTQL_API_KEY) not set. Scraping will be disabled.');
}

// Mino API response interface
interface MinoResponse {
    type?: string;
    status?: string;
    resultJson?: unknown;
    error?: string;
}

async function executeMinoScrape(url: string, goal: string): Promise<AgentQLResponse> {
    // Early return if API key is not configured
    if (!MINO_API_KEY) {
        console.error('Mino API key not configured');
        return { success: false, data: null, error: 'MINO API KEY not configured' };
    }

    try {
        console.log(`Mino scraping: ${url}`);
        console.log(`Goal: ${goal}`);

        const response = await axios.post(
            MINO_API_URL,
            {
                url,
                goal,
                browserProfile: 'lite', // Use lite mode for faster scraping
            },
            {
                headers: {
                    'X-API-Key': MINO_API_KEY,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                timeout: 90000, // 90 second timeout for SSE
                responseType: 'text', // SSE returns text stream
            }
        );

        // Parse SSE response - Mino returns event stream
        const responseText = response.data as string;
        const lines = responseText.split('\n');
        let resultData: unknown = null;

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const eventData = JSON.parse(line.slice(6)) as MinoResponse;
                    if (eventData.resultJson) {
                        resultData = eventData.resultJson;
                    }
                    if (eventData.error) {
                        console.error('Mino error:', eventData.error);
                        return { success: false, data: null, error: eventData.error };
                    }
                } catch {
                    // Skip non-JSON lines
                }
            }
        }

        if (resultData) {
            return { success: true, data: resultData };
        }

        return { success: false, data: null, error: 'No result data in response' };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Mino API error:', errorMessage);
        return { success: false, data: null, error: errorMessage };
    }
}

// ===== DOORDASH SCRAPER =====
export async function scrapeDoorDash(zipCode: string): Promise<ScrapedRestaurant[]> {
    const restaurants: ScrapedRestaurant[] = [];

    try {
        await randomDelay(1000, 2000);

        const searchUrl = `https://www.doordash.com/search/store/chicken%20wings/?pickup=false`;
        const goal = `Search for chicken wings restaurants and extract a JSON array of restaurants with these fields for each: name, address, delivery_time (as string like "25-35 min"), rating (number), image_url, is_open (boolean). Return as JSON array called "restaurants".`;

        const result = await executeMinoScrape(searchUrl, goal);
        if (!result.success || !result.data) {
            console.log('DoorDash: No results from Mino');
            return restaurants;
        }

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
        console.log(`DoorDash: Found ${restaurants.length} restaurants`);
    } catch (error) {
        console.error('DoorDash scrape error:', error);
    }

    return restaurants;
}

// ===== UBEREATS SCRAPER =====
export async function scrapeUberEats(zipCode: string): Promise<ScrapedRestaurant[]> {
    const restaurants: ScrapedRestaurant[] = [];

    try {
        await randomDelay(1000, 2000);

        const searchUrl = `https://www.ubereats.com/search?q=chicken%20wings`;
        const goal = `Search for chicken wings restaurants and extract a JSON array of stores with these fields for each: name, address, eta (delivery time as string), rating (number), image (image URL), is_available (boolean). Return as JSON array called "stores".`;

        const result = await executeMinoScrape(searchUrl, goal);
        if (!result.success || !result.data) {
            console.log('UberEats: No results from Mino');
            return restaurants;
        }

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
        console.log(`UberEats: Found ${restaurants.length} restaurants`);
    } catch (error) {
        console.error('UberEats scrape error:', error);
    }

    return restaurants;
}

// ===== GRUBHUB SCRAPER =====
export async function scrapeGrubhub(zipCode: string): Promise<ScrapedRestaurant[]> {
    const restaurants: ScrapedRestaurant[] = [];

    try {
        await randomDelay(1000, 2000);

        const searchUrl = `https://www.grubhub.com/search?query=chicken+wings&locationMode=DELIVERY`;
        const goal = `Search for chicken wings restaurants and extract a JSON array of restaurants with these fields for each: name, address, delivery_time (as string), rating (number), image (image URL), is_open (boolean). Return as JSON array called "restaurants".`;

        const result = await executeMinoScrape(searchUrl, goal);
        if (!result.success || !result.data) {
            console.log('Grubhub: No results from Mino');
            return restaurants;
        }

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
        console.log(`Grubhub: Found ${restaurants.length} restaurants`);
    } catch (error) {
        console.error('Grubhub scrape error:', error);
    }

    return restaurants;
}

// ===== YELP SCRAPER =====
export async function scrapeYelp(zipCode: string): Promise<ScrapedRestaurant[]> {
    const restaurants: ScrapedRestaurant[] = [];

    try {
        await randomDelay(1000, 2000);

        const searchUrl = `https://www.yelp.com/search?find_desc=chicken+wings&find_loc=${zipCode}`;
        const goal = `Search for chicken wings restaurants in zip code ${zipCode} and extract a JSON array of businesses with these fields for each: name, address, phone, rating (number), image (image URL), hours (business hours as string). Return as JSON array called "businesses".`;

        const result = await executeMinoScrape(searchUrl, goal);
        if (!result.success || !result.data) {
            console.log('Yelp: No results from Mino');
            return restaurants;
        }

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
        console.log(`Yelp: Found ${restaurants.length} restaurants`);
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
