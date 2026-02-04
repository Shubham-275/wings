// ===========================================
// Wing Scout - Upstash Redis Cache
// ===========================================

import { Redis } from '@upstash/redis';
import { WingSpot, GeocodedLocation, ScrapeResponse } from './types';

// Validate Redis environment variables
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
    console.warn('Warning: Redis environment variables not set. Caching will be disabled.');
}

// Initialize Redis client (may be null if env vars missing)
const redis = redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

// Cache TTL in seconds (15 minutes default)
const DEFAULT_TTL = 15 * 60;
const GEOCODE_TTL = 60 * 60 * 24 * 365; // 1 year for geocode (permanent)

/**
 * Cache key generators
 */
const keys = {
    wingSpots: (zip: string) => `wing_spots:${zip}`,
    geocode: (zip: string) => `geocode:${zip}`,
    scrapeResult: (zip: string) => `scrape_result:${zip}`,
    rateLimit: (ip: string) => `rate_limit:${ip}`,
};

/**
 * Get cached wing spots for a zip code
 */
export async function getCachedWingSpots(zipCode: string): Promise<WingSpot[] | null> {
    if (!redis) return null;
    try {
        const data = await redis.get<WingSpot[]>(keys.wingSpots(zipCode));
        return data;
    } catch (error) {
        console.error('Redis getCachedWingSpots error:', error);
        return null;
    }
}

/**
 * Cache wing spots for a zip code
 */
export async function cacheWingSpots(
    zipCode: string,
    spots: WingSpot[],
    ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
    if (!redis) return;
    try {
        await redis.set(keys.wingSpots(zipCode), spots, { ex: ttlSeconds });
    } catch (error) {
        console.error('Redis cacheWingSpots error:', error);
    }
}

/**
 * Get cached geocode data
 */
export async function getCachedGeocode(zipCode: string): Promise<GeocodedLocation | null> {
    if (!redis) return null;
    try {
        const data = await redis.get<GeocodedLocation>(keys.geocode(zipCode));
        return data;
    } catch (error) {
        console.error('Redis getCachedGeocode error:', error);
        return null;
    }
}

/**
 * Cache geocode data (permanent)
 */
export async function cacheGeocode(geocode: GeocodedLocation): Promise<void> {
    if (!redis) return;
    try {
        await redis.set(keys.geocode(geocode.zip_code), geocode, { ex: GEOCODE_TTL });
    } catch (error) {
        console.error('Redis cacheGeocode error:', error);
    }
}

/**
 * Get cached scrape result
 */
export async function getCachedScrapeResult(zipCode: string): Promise<ScrapeResponse | null> {
    if (!redis) return null;
    try {
        const data = await redis.get<ScrapeResponse>(keys.scrapeResult(zipCode));
        return data;
    } catch (error) {
        console.error('Redis getCachedScrapeResult error:', error);
        return null;
    }
}

/**
 * Cache scrape result
 */
export async function cacheScrapeResult(
    zipCode: string,
    result: ScrapeResponse,
    ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
    if (!redis) return;
    try {
        await redis.set(keys.scrapeResult(zipCode), result, { ex: ttlSeconds });
    } catch (error) {
        console.error('Redis cacheScrapeResult error:', error);
    }
}

/**
 * Rate limiting check
 * Returns true if request is allowed, false if rate limited
 * SECURITY: Denies on error to prevent DoS attacks when Redis is down
 */
export async function checkRateLimit(
    ip: string,
    maxRequests: number = 10,
    windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    // If Redis is not configured, allow requests (graceful degradation for dev)
    if (!redis) {
        return { allowed: true, remaining: maxRequests, resetIn: 0 };
    }

    try {
        const key = keys.rateLimit(ip);
        const current = await redis.incr(key);

        if (current === 1) {
            // First request, set expiry
            await redis.expire(key, windowSeconds);
        }

        const ttl = await redis.ttl(key);
        const allowed = current <= maxRequests;
        const remaining = Math.max(0, maxRequests - current);

        return { allowed, remaining, resetIn: ttl };
    } catch (error) {
        console.error('Redis checkRateLimit error:', error);
        // SECURITY: Deny on error to prevent rate limit bypass attacks
        return { allowed: false, remaining: 0, resetIn: windowSeconds };
    }
}

/**
 * Invalidate cache for a zip code
 */
export async function invalidateZipCache(zipCode: string): Promise<void> {
    if (!redis) return;
    try {
        await redis.del(keys.wingSpots(zipCode), keys.scrapeResult(zipCode));
    } catch (error) {
        console.error('Redis invalidateZipCache error:', error);
    }
}

/**
 * Get cache stats for monitoring
 */
export async function getCacheStats(): Promise<{
    connected: boolean;
    info: string;
}> {
    if (!redis) {
        return {
            connected: false,
            info: 'Redis not configured',
        };
    }
    try {
        const pingResult = await redis.ping();
        return {
            connected: pingResult === 'PONG',
            info: 'Redis connected',
        };
    } catch (error) {
        return {
            connected: false,
            info: `Redis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}

export { redis };
