'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { Scoreboard } from '@/components/Scoreboard';
import { ZipSearch } from '@/components/ZipSearch';
import { WingMap } from '@/components/WingMap';
import { WingCard } from '@/components/WingCard';
import { Sheet } from '@/components/ui/Sheet';
import { WingSpot, MapViewport, ScrapeResponse, AvailabilityStats } from '@/lib/types';
import { calculateAvailability } from '@/lib/utils';

// Session storage key for persisting last searched zip
const LAST_ZIP_KEY = 'wing-scout-last-zip';
const LAST_SEARCH_TIME_KEY = 'wing-scout-last-search-time';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Create query client with longer cache time
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: CACHE_DURATION_MS,
            gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
            retry: 2,
            refetchOnWindowFocus: false, // Don't refetch when window regains focus
            refetchOnMount: false, // Don't refetch when component mounts if data exists
        },
    },
});

// Flag to track if persister has been set up
let persisterInitialized = false;

function HomeContent() {
    // Initialize zip code as empty to avoid hydration mismatch
    // sessionStorage will be read in useEffect after hydration
    const [zipCode, setZipCode] = useState<string>('');
    const [isHydrated, setIsHydrated] = useState(false);

    // Set up persister and restore state after hydration (client-side only)
    useEffect(() => {
        // Set up query persister once
        if (!persisterInitialized && typeof window !== 'undefined') {
            const persister = createSyncStoragePersister({
                storage: window.sessionStorage,
                key: 'wing-scout-query-cache',
            });

            persistQueryClient({
                queryClient,
                persister,
                maxAge: CACHE_DURATION_MS,
            });
            persisterInitialized = true;
        }

        // Restore last searched zip from sessionStorage
        const savedZip = sessionStorage.getItem(LAST_ZIP_KEY);
        if (savedZip && savedZip.length === 5) {
            setZipCode(savedZip);
        }
        setIsHydrated(true);
    }, []);
    const [selectedSpot, setSelectedSpot] = useState<WingSpot | null>(null);
    const [viewport, setViewport] = useState<MapViewport>({
        latitude: 39.8283,
        longitude: -98.5795,
        zoom: 4,
    });

    // Track in-flight requests to prevent duplicates
    const pendingRequestRef = useRef<AbortController | null>(null);

    // Fetch wing spots with deduplication
    const { data, isLoading, isFetching, refetch } = useQuery<ScrapeResponse>({
        queryKey: ['wingSpots', zipCode],
        queryFn: async ({ signal }) => {
            if (!zipCode) return { success: true, spots: [], cached: false, message: '' };

            // Check if we have fresh data from a recent search
            const lastSearchTime = sessionStorage.getItem(LAST_SEARCH_TIME_KEY);
            const cachedData = queryClient.getQueryData<ScrapeResponse>(['wingSpots', zipCode]);

            if (lastSearchTime && cachedData?.success && cachedData.spots.length > 0) {
                const timeSinceLastSearch = Date.now() - parseInt(lastSearchTime, 10);
                if (timeSinceLastSearch < CACHE_DURATION_MS) {
                    console.log(`Using cached data for ${zipCode} (${Math.round(timeSinceLastSearch / 1000)}s old)`);
                    return cachedData;
                }
            }

            // Cancel any pending request for different zip
            if (pendingRequestRef.current) {
                pendingRequestRef.current.abort();
            }

            // Create new abort controller for this request
            const abortController = new AbortController();
            pendingRequestRef.current = abortController;

            // Use URLSearchParams for safe URL encoding
            const params = new URLSearchParams({ zip: zipCode });
            const res = await fetch(`/api/scrape?${params.toString()}`, {
                signal: signal || abortController.signal,
            });

            pendingRequestRef.current = null;

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${res.status}`);
            }

            const result = await res.json();

            // Store search time for cache validation
            sessionStorage.setItem(LAST_SEARCH_TIME_KEY, Date.now().toString());

            return result;
        },
        enabled: zipCode.length === 5,
        refetchInterval: CACHE_DURATION_MS,
        refetchIntervalInBackground: false, // Don't refetch when tab is in background
    });

    const spots = data?.spots || [];
    const stats: AvailabilityStats = calculateAvailability(spots);

    // Update viewport when location changes
    useEffect(() => {
        if (data?.location) {
            setViewport({
                latitude: data.location.lat,
                longitude: data.location.lng,
                zoom: 12,
            });
        }
    }, [data?.location]);

    const handleSearch = useCallback((zip: string) => {
        // Persist zip to sessionStorage so it survives page refresh
        if (typeof window !== 'undefined') {
            sessionStorage.setItem(LAST_ZIP_KEY, zip);
        }
        setZipCode(zip);
        setSelectedSpot(null);
    }, []);

    const handleSpotClick = useCallback((spot: WingSpot) => {
        setSelectedSpot(spot);
    }, []);

    return (
        <div className="min-h-screen flex flex-col">
            {/* Scoreboard Header */}
            <Scoreboard
                stats={stats}
                isLoading={isLoading}
                isRefreshing={isFetching && !isLoading}
            />

            {/* Main Content */}
            <main className="flex-1 pt-20 relative">
                {/* Search Bar */}
                <div className="absolute top-24 left-0 right-0 z-20 px-4">
                    <ZipSearch
                        onSearch={handleSearch}
                        isLoading={isLoading}
                        initialZip={zipCode}
                    />
                </div>

                {/* Map */}
                <div className="absolute inset-0 pt-20">
                    {zipCode ? (
                        <WingMap
                            spots={spots}
                            viewport={viewport}
                            onViewportChange={setViewport}
                            onSpotClick={handleSpotClick}
                            selectedSpotId={selectedSpot?.id}
                        />
                    ) : (
                        <div className="h-full flex items-center justify-center">
                            <div className="text-center max-w-md px-4">
                                <div className="text-6xl mb-4">🍗</div>
                                <h2 className="font-heading text-3xl text-gray-100 mb-2">
                                    Find Wings Near You
                                </h2>
                                <p className="text-gray-400">
                                    Enter your zip code above to discover the best chicken wing deals
                                    for Super Bowl LX in your area.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Status message */}
                {data?.message && !isLoading && spots.length === 0 && (
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
                        <div className="glass px-4 py-2 rounded-lg text-gray-300 text-sm">
                            {data.message}
                        </div>
                    </div>
                )}
            </main>

            {/* Wing Card Sheet */}
            <Sheet
                isOpen={!!selectedSpot}
                onClose={() => setSelectedSpot(null)}
                title={selectedSpot?.name}
            >
                {selectedSpot && (
                    <WingCard
                        spot={selectedSpot}
                        onClose={() => setSelectedSpot(null)}
                    />
                )}
            </Sheet>
        </div>
    );
}

export default function Home() {
    return (
        <QueryClientProvider client={queryClient}>
            <HomeContent />
        </QueryClientProvider>
    );
}
