// ===========================================
// Wing Scout - Utility Functions
// ===========================================

import { WingSpot, WingStatus, CountdownTime, AvailabilityStats, PopularCity } from './types';

// Type for class value
type ClassValue = string | number | boolean | undefined | null | ClassValue[] | Record<string, boolean | undefined | null>;

/**
 * Simple class name merger utility (clsx-like)
 */
function mergeClasses(...args: ClassValue[]): string {
    const classes: string[] = [];

    for (const arg of args) {
        if (!arg) continue;

        if (typeof arg === 'string' || typeof arg === 'number') {
            classes.push(String(arg));
        } else if (Array.isArray(arg)) {
            const inner = mergeClasses(...arg);
            if (inner) classes.push(inner);
        } else if (typeof arg === 'object') {
            for (const [key, value] of Object.entries(arg)) {
                if (value) classes.push(key);
            }
        }
    }

    return classes.join(' ');
}

/**
 * Tailwind CSS class name merger utility
 */
export function cn(...inputs: ClassValue[]): string {
    return mergeClasses(...inputs);
}

/**
 * Super Bowl LX date - Feb 8, 2026, 6:30 PM ET
 */
export const SUPER_BOWL_DATE = new Date('2026-02-08T18:30:00-05:00');

/**
 * Calculate countdown to Super Bowl
 */
export function getCountdown(targetDate: Date = SUPER_BOWL_DATE): CountdownTime {
    const now = new Date();
    const diff = targetDate.getTime() - now.getTime();

    if (diff <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, isPast: false };
}

/**
 * Format countdown for display
 */
export function formatCountdown(countdown: CountdownTime): string {
    if (countdown.isPast) {
        return 'GAME TIME!';
    }

    const parts: string[] = [];

    if (countdown.days > 0) {
        parts.push(`${countdown.days}d`);
    }
    parts.push(`${countdown.hours.toString().padStart(2, '0')}h`);
    parts.push(`${countdown.minutes.toString().padStart(2, '0')}m`);
    parts.push(`${countdown.seconds.toString().padStart(2, '0')}s`);

    return parts.join(' ');
}

/**
 * Validate US zip code format
 */
export function isValidZipCode(zip: string): boolean {
    const zipRegex = /^\d{5}(-\d{4})?$/;
    return zipRegex.test(zip.trim());
}

/**
 * Clean zip code (extract 5-digit)
 */
export function cleanZipCode(zip: string): string {
    return zip.trim().substring(0, 5);
}

/**
 * Calculate wing spot status based on criteria
 */
export function calculateStatus(spot: Partial<WingSpot>): WingStatus {
    // Red: Sold out, closed, or no wings
    if (!spot.is_in_stock || !spot.is_open_now) {
        return 'red';
    }

    // Check green criteria:
    // - In stock
    // - Deal OR price <= $1.50/wing
    // - Delivery/wait < 45 min
    // - Open during game
    const hasGoodPrice = spot.price_per_wing != null && spot.price_per_wing <= 1.50;
    const hasDeal = !!spot.deal_text;
    const hasFastDelivery =
        (spot.delivery_time_mins != null && spot.delivery_time_mins < 45) ||
        (spot.wait_time_mins != null && spot.wait_time_mins < 45);
    const openDuringGame = spot.opens_during_game !== false;

    if ((hasGoodPrice || hasDeal) && hasFastDelivery && openDuringGame) {
        return 'green';
    }

    // Yellow: Available but doesn't meet all green criteria
    return 'yellow';
}

/**
 * Calculate availability statistics
 */
export function calculateAvailability(spots: WingSpot[]): AvailabilityStats {
    const total = spots.length;
    const green = spots.filter(s => s.status === 'green').length;
    const yellow = spots.filter(s => s.status === 'yellow').length;
    const red = spots.filter(s => s.status === 'red').length;

    // Percentage is green pins out of total
    const percentage = total > 0 ? Math.round((green / total) * 100) : 0;

    return { total, green, yellow, red, percentage };
}

/**
 * Format price for display
 */
export function formatPrice(price: number | null): string {
    if (price === null) return 'Price N/A';
    return `$${price.toFixed(2)}`;
}

/**
 * Format price per wing
 */
export function formatPricePerWing(price: number | null): string {
    if (price === null) return '';
    return `$${price.toFixed(2)}/wing`;
}

/**
 * Format delivery time
 */
export function formatDeliveryTime(mins: number | null): string {
    if (mins === null) return 'Time N/A';
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
}

/**
 * Get status emoji
 */
export function getStatusEmoji(status: WingStatus): string {
    switch (status) {
        case 'green': return '🟢';
        case 'yellow': return '🟡';
        case 'red': return '🔴';
        default: return '⚪';
    }
}

/**
 * Get status color class
 */
export function getStatusColorClass(status: WingStatus): string {
    switch (status) {
        case 'green': return 'text-wing-green bg-wing-green/20';
        case 'yellow': return 'text-wing-yellow bg-wing-yellow/20';
        case 'red': return 'text-wing-red bg-wing-red/20';
        default: return 'text-gray-400 bg-gray-400/20';
    }
}

/**
 * Get status border class
 */
export function getStatusBorderClass(status: WingStatus): string {
    switch (status) {
        case 'green': return 'border-wing-green';
        case 'yellow': return 'border-wing-yellow';
        case 'red': return 'border-wing-red';
        default: return 'border-gray-500';
    }
}

/**
 * Format relative time
 */
export function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Generate Google Maps URL
 */
export function getGoogleMapsUrl(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Generate tel: link
 */
export function getTelLink(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    return `tel:+1${cleaned}`;
}

/**
 * Random delay for rate limiting (2-5 seconds)
 */
export function randomDelay(minMs = 2000, maxMs = 5000): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Popular US cities for autocomplete
 */
export const POPULAR_CITIES: PopularCity[] = [
    { name: 'New York', state: 'NY', zip: '10001' },
    { name: 'Los Angeles', state: 'CA', zip: '90001' },
    { name: 'Chicago', state: 'IL', zip: '60601' },
    { name: 'Houston', state: 'TX', zip: '77001' },
    { name: 'Phoenix', state: 'AZ', zip: '85001' },
    { name: 'Philadelphia', state: 'PA', zip: '19101' },
    { name: 'San Antonio', state: 'TX', zip: '78201' },
    { name: 'San Diego', state: 'CA', zip: '92101' },
    { name: 'Dallas', state: 'TX', zip: '75201' },
    { name: 'San Jose', state: 'CA', zip: '95101' },
    { name: 'Austin', state: 'TX', zip: '78701' },
    { name: 'Jacksonville', state: 'FL', zip: '32099' },
    { name: 'Fort Worth', state: 'TX', zip: '76101' },
    { name: 'Columbus', state: 'OH', zip: '43085' },
    { name: 'Indianapolis', state: 'IN', zip: '46201' },
    { name: 'Charlotte', state: 'NC', zip: '28201' },
    { name: 'San Francisco', state: 'CA', zip: '94102' },
    { name: 'Seattle', state: 'WA', zip: '98101' },
    { name: 'Denver', state: 'CO', zip: '80201' },
    { name: 'Boston', state: 'MA', zip: '02101' },
    { name: 'Las Vegas', state: 'NV', zip: '89101' },
    { name: 'Miami', state: 'FL', zip: '33101' },
    { name: 'Atlanta', state: 'GA', zip: '30301' },
    { name: 'Kansas City', state: 'MO', zip: '64101' },
    { name: 'New Orleans', state: 'LA', zip: '70112' },
    // Super Bowl host cities often popular
    { name: 'Tampa', state: 'FL', zip: '33601' },
    { name: 'Minneapolis', state: 'MN', zip: '55401' },
    { name: 'Glendale', state: 'AZ', zip: '85301' },
    { name: 'Inglewood', state: 'CA', zip: '90301' },
    { name: 'Arlington', state: 'TX', zip: '76010' },
];

/**
 * Normalize restaurant name for deduplication
 * Removes common suffixes, punctuation, and standardizes case
 */
export function normalizeRestaurantName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        // Remove common suffixes
        .replace(/\s*-\s*(doordash|uber\s*eats|grubhub|yelp|delivery|pickup|order\s*online).*$/i, '')
        .replace(/\s*\((doordash|uber\s*eats|grubhub|yelp)\)$/i, '')
        // Remove punctuation and extra spaces
        .replace(/[''`]/g, "'")
        .replace(/[^\w\s'-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Normalize address for comparison
 */
export function normalizeAddress(address: string): string {
    return address
        .toLowerCase()
        .trim()
        // Standardize common abbreviations
        .replace(/\bstreet\b/g, 'st')
        .replace(/\bavenue\b/g, 'ave')
        .replace(/\bboulevard\b/g, 'blvd')
        .replace(/\bdrive\b/g, 'dr')
        .replace(/\broad\b/g, 'rd')
        .replace(/\blane\b/g, 'ln')
        .replace(/\bcourt\b/g, 'ct')
        .replace(/\bplace\b/g, 'pl')
        .replace(/\bapartment\b/g, 'apt')
        .replace(/\bsuite\b/g, 'ste')
        .replace(/\bnorth\b/g, 'n')
        .replace(/\bsouth\b/g, 's')
        .replace(/\beast\b/g, 'e')
        .replace(/\bwest\b/g, 'w')
        // Remove punctuation and extra spaces
        .replace(/[,#.]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generate a unique key for restaurant deduplication
 * Uses normalized name + first part of address
 */
export function getRestaurantDedupeKey(name: string, address: string): string {
    const normalizedName = normalizeRestaurantName(name);
    const normalizedAddr = normalizeAddress(address);

    // Use first 30 chars of address (street number + name usually)
    const addrPart = normalizedAddr.substring(0, 30);

    return `${normalizedName}|${addrPart}`;
}

/**
 * Deduplicate wing spots that appear on multiple platforms
 * Keeps the spot with the best status (green > yellow > red) and lowest price
 */
export function deduplicateWingSpots(spots: WingSpot[]): WingSpot[] {
    const seen = new Map<string, WingSpot>();
    const statusPriority: Record<WingStatus, number> = {
        'green': 3,
        'yellow': 2,
        'red': 1,
    };

    for (const spot of spots) {
        const key = getRestaurantDedupeKey(spot.name, spot.address);
        const existing = seen.get(key);

        if (!existing) {
            seen.set(key, spot);
            continue;
        }

        // Determine which spot to keep based on:
        // 1. Better status (green > yellow > red)
        // 2. Lower price per wing (if status is same)
        // 3. Faster delivery (if price is same)
        const existingPriority = statusPriority[existing.status] || 0;
        const newPriority = statusPriority[spot.status] || 0;

        let shouldReplace = false;

        if (newPriority > existingPriority) {
            shouldReplace = true;
        } else if (newPriority === existingPriority) {
            // Compare price
            const existingPrice = existing.price_per_wing ?? Infinity;
            const newPrice = spot.price_per_wing ?? Infinity;

            if (newPrice < existingPrice) {
                shouldReplace = true;
            } else if (newPrice === existingPrice) {
                // Compare delivery time
                const existingTime = existing.delivery_time_mins ?? Infinity;
                const newTime = spot.delivery_time_mins ?? Infinity;

                if (newTime < existingTime) {
                    shouldReplace = true;
                }
            }
        }

        if (shouldReplace) {
            // Merge sources info - keep track that it's on multiple platforms
            const mergedSpot = {
                ...spot,
                // Add note about multiple sources if different
                deal_text: spot.deal_text || existing.deal_text,
            };
            seen.set(key, mergedSpot);
        }
    }

    return Array.from(seen.values());
}

/**
 * Top 150 zip codes for pre-scraping (high population + Super Bowl relevant)
 */
export const TOP_ZIP_CODES: string[] = [
    // New York Metro
    '10001', '10002', '10003', '10004', '10005', '10006', '10007', '10011', '10012', '10013',
    '10014', '10016', '10017', '10018', '10019', '10020', '10021', '10022', '10023', '10024',
    '11201', '11211', '11215', '11217', '11222', '11225', '11226', '11229', '11230', '11231',
    // Los Angeles Metro
    '90001', '90002', '90003', '90004', '90005', '90006', '90007', '90008', '90010', '90011',
    '90012', '90013', '90014', '90015', '90016', '90017', '90018', '90019', '90020', '90021',
    '90210', '90024', '90025', '90034', '90035', '90036', '90038', '90046', '90048', '90049',
    // Chicago Metro
    '60601', '60602', '60603', '60604', '60605', '60606', '60607', '60608', '60609', '60610',
    '60611', '60612', '60613', '60614', '60615', '60616', '60617', '60618', '60619', '60620',
    // Houston Metro
    '77001', '77002', '77003', '77004', '77005', '77006', '77007', '77008', '77009', '77010',
    // Phoenix Metro
    '85001', '85002', '85003', '85004', '85005', '85006', '85007', '85008', '85009', '85010',
    // Philadelphia Metro
    '19101', '19102', '19103', '19104', '19106', '19107', '19109', '19111', '19114', '19115',
    // San Antonio Metro
    '78201', '78202', '78203', '78204', '78205', '78207', '78208', '78209', '78210', '78211',
    // San Diego Metro
    '92101', '92102', '92103', '92104', '92105', '92106', '92107', '92108', '92109', '92110',
    // Dallas Metro
    '75201', '75202', '75203', '75204', '75205', '75206', '75207', '75208', '75209', '75210',
    // San Francisco/Bay Area
    '94102', '94103', '94104', '94105', '94107', '94108', '94109', '94110', '94111', '94112',
    // Other major metros
    '98101', '98102', '98103', '98104', // Seattle
    '80201', '80202', '80203', '80204', // Denver
    '02101', '02102', '02103', '02108', // Boston
    '33101', '33109', '33125', '33126', // Miami
    '30301', '30303', '30305', '30306', // Atlanta
];
