// ===========================================
// Wing Scout - Mino AI Web Scraper
// ===========================================

import axios from 'axios';
import { ScrapedRestaurant, WingSpot, AgentQLResponse } from './types';
import { calculateStatus, deduplicateWingSpots } from './utils';
// OCR imports removed for speed - can add back later if needed
// import { extractWingMenuFromImage, findBestWingDeal } from './ocr';

// Mino API Configuration
const MINO_API_URL = process.env.AGENTQL_API_URL || 'https://mino.ai/v1/automation/run-sse';
const MINO_API_KEY = process.env.AGENTQL_API_KEY || '';

// Warn if API key is missing (will fail gracefully at runtime)
if (!MINO_API_KEY) {
    console.warn('Warning: MINO API KEY (AGENTQL_API_KEY) not set. Scraping will be disabled.');
}

// Timeout helper for graceful timeout handling
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
            console.warn(`Operation timed out after ${timeoutMs}ms`);
            resolve(fallback);
        }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

// Scraper timeout constant
const SCRAPER_TIMEOUT = 25000; // 25 seconds per source

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
                timeout: 25000, // 25 second timeout to fit within Vercel's limits
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
        // Removed delay to speed up scraping

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
        // Removed delay to speed up scraping

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
        // Removed delay to speed up scraping

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

// ===== GOOGLE SCRAPER =====
// Using Google Search instead of Yelp because Yelp blocks scrapers
// Enhanced for Hidden Gem Detection - finds local spots, not just chains
export async function scrapeGoogle(zipCode: string): Promise<ScrapedRestaurant[]> {
    const restaurants: ScrapedRestaurant[] = [];

    try {
        // Search query targets local spots and hidden gems
        const searchUrl = `https://www.google.com/search?q=best+chicken+wings+local+sports+bar+${zipCode}`;
        const goal = `Extract ALL chicken wings restaurants visible on this Google search results page.
IMPORTANT: Include local establishments like:
- Family-owned restaurants and pizzerias with wings
- Sports bars and dive bars serving wings
- Local BBQ joints and wing shops
- Small independent restaurants
- Any place serving chicken wings
NOT just major chains like Buffalo Wild Wings, Wingstop, or Hooters.
Return a JSON array called "businesses" with these fields for each restaurant:
- name (restaurant name)
- address (full street address)
- rating (number like 4.2)
- phone (phone number if visible)
- hours (like "Closed · Opens 11 am" or "Open · Closes 10 pm")
- image (image URL if visible)
Scroll down and extract every restaurant listing. Aim for 10-20+ diverse results including hidden gems and local favorites.`;

        const result = await executeMinoScrape(searchUrl, goal);
        if (!result.success || !result.data) {
            console.log('Google: No results from Mino');
            return restaurants;
        }

        const data = result.data as { businesses?: Array<Record<string, unknown>> };
        for (const b of data.businesses || []) {
            // Parse hours to determine if open
            const hoursStr = String(b.hours || '');
            const isOpen = !hoursStr.toLowerCase().includes('closed');

            restaurants.push({
                name: String(b.name || 'Unknown'),
                address: String(b.address || ''),
                phone: String(b.phone || ''),
                hours: hoursStr,
                rating: Number(b.rating) || undefined,
                image_url: String(b.image || ''),
                is_open: isOpen,
                source: 'google',
                menu_items: [],
            });
        }
        console.log(`Google: Found ${restaurants.length} restaurants`);
    } catch (error) {
        console.error('Google scrape error:', error);
    }

    return restaurants;
}

// ===== YELP SCRAPER (DEPRECATED - blocks scrapers) =====
export async function scrapeYelp(zipCode: string): Promise<ScrapedRestaurant[]> {
    // Yelp blocks scrapers with "You have been blocked" page
    // Keeping this function for backwards compatibility but it won't be used
    console.log('Yelp: Skipping - known to block scrapers');
    return [];
}

// Helper function to process restaurants into WingSpots
function processRestaurants(
    restaurants: ScrapedRestaurant[],
    zipCode: string,
    lat: number,
    lng: number
): WingSpot[] {
    const wingSpots: WingSpot[] = [];

    for (const restaurant of restaurants) {
        // Skip OCR processing for speed - can add later if needed
        const pricePerWing: number | null = null;
        const dealText: string | null = null;

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

    return wingSpots;
}

// ===== MAIN SCRAPER =====
// Scrapes ALL sources in PARALLEL for maximum results
export async function scrapeAllSources(zipCode: string, lat: number, lng: number): Promise<WingSpot[]> {
    console.log(`Starting parallel scrape for zip: ${zipCode}`);

    // Run ALL scrapers in parallel with timeout protection
    const results = await Promise.allSettled([
        withTimeout(scrapeGoogle(zipCode), SCRAPER_TIMEOUT, []),
        withTimeout(scrapeDoorDash(zipCode), SCRAPER_TIMEOUT, []),
        withTimeout(scrapeGrubhub(zipCode), SCRAPER_TIMEOUT, []),
        withTimeout(scrapeUberEats(zipCode), SCRAPER_TIMEOUT, []),
    ]);

    const allRestaurants: ScrapedRestaurant[] = [];
    const sourceNames = ['Google', 'DoorDash', 'Grubhub', 'UberEats'];

    // Collect results from ALL successful scrapes
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            console.log(`${sourceNames[index]}: ${result.value.length} results`);
            allRestaurants.push(...result.value);
        } else {
            console.error(`${sourceNames[index]} failed:`, result.reason);
        }
    });

    // Process ALL results
    const wingSpots = processRestaurants(allRestaurants, zipCode, lat, lng);
    const deduplicatedSpots = deduplicateWingSpots(wingSpots);

    console.log(`Total: ${wingSpots.length} spots, ${deduplicatedSpots.length} unique after deduplication`);

    return deduplicatedSpots;
}
