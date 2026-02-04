// ===========================================
// Wing Scout - Geocoding Service (Nominatim)
// ===========================================

import axios from 'axios';
import { GeocodedLocation } from './types';
import { getCachedGeocode as getCachedGeocodeRedis, cacheGeocode as cacheGeocodeRedis } from './cache';
import { createServerClient, getCachedGeocode as getCachedGeocodeSupabase, cacheGeocode as cacheGeocodeSupabase } from './supabase';

// Nominatim API (OpenStreetMap - free, no key required)
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

// User agent for Nominatim (required by their policy)
const USER_AGENT = 'WingScout/1.0 (super-bowl-wing-tracker)';

/**
 * Geocode a US zip code using Nominatim
 */
export async function geocodeZipCode(zipCode: string): Promise<GeocodedLocation | null> {
    // First check Redis cache
    const redisCache = await getCachedGeocodeRedis(zipCode);
    if (redisCache) {
        console.log(`Geocode cache hit (Redis): ${zipCode}`);
        return redisCache;
    }

    // Then check Supabase cache
    try {
        const supabase = createServerClient();
        const { data: supabaseCache } = await getCachedGeocodeSupabase(supabase, zipCode);
        if (supabaseCache) {
            console.log(`Geocode cache hit (Supabase): ${zipCode}`);
            // Also cache in Redis for faster subsequent access
            await cacheGeocodeRedis(supabaseCache);
            return supabaseCache;
        }
    } catch (error) {
        console.error('Supabase geocode cache check failed:', error);
    }

    // Cache miss - fetch from Nominatim
    console.log(`Geocoding zip code: ${zipCode}`);

    try {
        const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
            params: {
                postalcode: zipCode,
                country: 'United States',
                format: 'json',
                addressdetails: 1,
                limit: 1,
            },
            headers: {
                'User-Agent': USER_AGENT,
            },
            timeout: 10000,
        });

        if (!response.data || response.data.length === 0) {
            console.warn(`No geocode results for zip: ${zipCode}`);
            return null;
        }

        const result = response.data[0];

        const geocoded: GeocodedLocation = {
            zip_code: zipCode,
            city: result.address?.city
                || result.address?.town
                || result.address?.village
                || result.address?.hamlet
                || result.address?.municipality
                || 'Unknown',
            state: result.address?.state || 'Unknown',
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon),
            cached_at: new Date().toISOString(),
        };

        // Cache in both Redis (fast) and Supabase (permanent)
        await cacheGeocodeRedis(geocoded);

        try {
            const supabase = createServerClient();
            await cacheGeocodeSupabase(supabase, geocoded);
        } catch (error) {
            console.error('Failed to cache geocode in Supabase:', error);
        }

        return geocoded;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Nominatim API error for ${zipCode}:`, error.message);
        } else {
            console.error(`Geocoding error for ${zipCode}:`, error);
        }
        return null;
    }
}

/**
 * Batch geocode multiple zip codes
 * Respects Nominatim rate limit (1 req/sec)
 */
export async function batchGeocodeZipCodes(
    zipCodes: string[],
    delayMs: number = 1100
): Promise<Map<string, GeocodedLocation>> {
    const results = new Map<string, GeocodedLocation>();

    for (const zip of zipCodes) {
        const geocoded = await geocodeZipCode(zip);
        if (geocoded) {
            results.set(zip, geocoded);
        }
        // Rate limit - wait between requests
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return results;
}

/**
 * Get city name for a zip code (cached)
 */
export async function getCityForZip(zipCode: string): Promise<string> {
    const geocoded = await geocodeZipCode(zipCode);
    if (geocoded) {
        return `${geocoded.city}, ${geocoded.state}`;
    }
    return 'Unknown Location';
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in miles
 */
export function calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 3959; // Earth's radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg: number): number {
    return deg * (Math.PI / 180);
}

/**
 * Get bounding box for a radius around a point
 */
export function getBoundingBox(
    lat: number,
    lng: number,
    radiusMiles: number
): { north: number; south: number; east: number; west: number } {
    // Approximate degrees per mile at given latitude
    const latDegPerMile = 1 / 69.0;
    const lngDegPerMile = 1 / (69.0 * Math.cos(toRad(lat)));

    return {
        north: lat + (radiusMiles * latDegPerMile),
        south: lat - (radiusMiles * latDegPerMile),
        east: lng + (radiusMiles * lngDegPerMile),
        west: lng - (radiusMiles * lngDegPerMile),
    };
}
