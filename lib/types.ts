// ===========================================
// Wing Scout - Type Definitions
// ===========================================

/**
 * Source platform for wing data
 */
export type WingSource = 'doordash' | 'ubereats' | 'grubhub' | 'yelp';

/**
 * Pin status color
 */
export type WingStatus = 'green' | 'yellow' | 'red';

/**
 * Main wing spot data structure
 */
export interface WingSpot {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    price_per_wing: number | null;
    deal_text: string | null;
    delivery_time_mins: number | null;
    wait_time_mins: number | null;
    is_in_stock: boolean;
    is_open_now: boolean;
    opens_during_game: boolean;
    hours_today: string | null;
    phone: string | null;
    image_url: string | null;
    source: WingSource;
    status: WingStatus;
    zip_code: string;
    last_updated: string;
    created_at?: string;
}

/**
 * Geocoded location data
 */
export interface GeocodedLocation {
    zip_code: string;
    city: string;
    state: string;
    lat: number;
    lng: number;
    cached_at?: string;
}

/**
 * Scrape queue item
 */
export interface ScrapeQueueItem {
    id: string;
    zip_code: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    created_at: string;
    started_at?: string;
    completed_at?: string;
    error?: string;
}

/**
 * API scrape response
 */
export interface ScrapeResponse {
    success: boolean;
    spots: WingSpot[];
    cached: boolean;
    message: string;
    location?: GeocodedLocation;
}

/**
 * Menu item extracted from OCR
 */
export interface MenuItem {
    name: string;
    description?: string;
    price: number | null;
    quantity?: number;
    price_per_wing?: number;
    is_deal: boolean;
}

/**
 * Scraped restaurant data (raw)
 */
export interface ScrapedRestaurant {
    name: string;
    address: string;
    phone?: string;
    hours?: string;
    delivery_time?: string;
    delivery_fee?: string;
    rating?: number;
    image_url?: string;
    menu_items: MenuItem[];
    is_open?: boolean;
    source: WingSource;
}

/**
 * AgentQL scrape request
 */
export interface AgentQLRequest {
    url: string;
    query: string;
    wait_for_selector?: string;
    timeout?: number;
    user_agent?: string;
}

/**
 * AgentQL scrape response
 */
export interface AgentQLResponse {
    success: boolean;
    data: unknown;
    screenshot?: string;
    error?: string;
}

/**
 * OCR.space API response
 */
export interface OCRResponse {
    ParsedResults: Array<{
        ParsedText: string;
        ErrorMessage?: string;
        FileParseExitCode: number;
    }>;
    OCRExitCode: number;
    IsErroredOnProcessing: boolean;
    ErrorMessage?: string[];
}

/**
 * Map viewport state
 */
export interface MapViewport {
    latitude: number;
    longitude: number;
    zoom: number;
}

/**
 * Popular city for autocomplete
 */
export interface PopularCity {
    name: string;
    state: string;
    zip: string;
}

/**
 * Countdown timer state
 */
export interface CountdownTime {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isPast: boolean;
}

/**
 * Availability statistics
 */
export interface AvailabilityStats {
    total: number;
    green: number;
    yellow: number;
    red: number;
    percentage: number;
}

/**
 * Supabase database row types
 */
export interface Database {
    public: {
        Tables: {
            wing_spots: {
                Row: WingSpot;
                Insert: Omit<WingSpot, 'id' | 'created_at'>;
                Update: Partial<Omit<WingSpot, 'id'>>;
            };
            geocode_cache: {
                Row: GeocodedLocation;
                Insert: GeocodedLocation;
                Update: Partial<GeocodedLocation>;
            };
            scrape_queue: {
                Row: ScrapeQueueItem;
                Insert: Omit<ScrapeQueueItem, 'id'>;
                Update: Partial<Omit<ScrapeQueueItem, 'id'>>;
            };
        };
    };
}
