'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { WingSpot, MapViewport } from '@/lib/types';
import { getStatusEmoji } from '@/lib/utils';

interface WingMapProps {
    spots: WingSpot[];
    viewport: MapViewport;
    onViewportChange: (viewport: MapViewport) => void;
    onSpotClick: (spot: WingSpot) => void;
    selectedSpotId?: string;
}

export function WingMap({ spots, viewport, onViewportChange, onSpotClick, selectedSpotId }: WingMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const [mapLoaded, setMapLoaded] = useState(false);

    // Store onViewportChange in a ref to avoid re-initializing map when it changes
    const onViewportChangeRef = useRef(onViewportChange);
    onViewportChangeRef.current = onViewportChange;

    // Store initial viewport in ref for map initialization
    const initialViewportRef = useRef(viewport);

    // Initialize map (only once)
    useEffect(() => {
        if (!mapContainer.current || map.current) return;

        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

        const initialVp = initialViewportRef.current;
        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [initialVp.longitude, initialVp.latitude],
            zoom: initialVp.zoom,
            pitch: 0,
            bearing: 0,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.current.addControl(new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
        }), 'top-right');

        map.current.on('load', () => setMapLoaded(true));

        map.current.on('moveend', () => {
            if (!map.current) return;
            const center = map.current.getCenter();
            onViewportChangeRef.current({
                latitude: center.lat,
                longitude: center.lng,
                zoom: map.current.getZoom(),
            });
        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // Update markers when spots change
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // Clear existing markers
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        // Add new markers
        spots.forEach(spot => {
            // Create marker element safely (no innerHTML to prevent XSS)
            const el = document.createElement('div');
            el.className = 'wing-marker';

            const innerDiv = document.createElement('div');
            innerDiv.className = `w-10 h-10 flex items-center justify-center text-2xl cursor-pointer transform hover:scale-125 transition-transform duration-200 ${selectedSpotId === spot.id ? 'scale-125' : ''}`;
            // Use textContent for safe emoji rendering (getStatusEmoji returns safe hardcoded values)
            innerDiv.textContent = getStatusEmoji(spot.status);
            el.appendChild(innerDiv);

            el.addEventListener('click', () => onSpotClick(spot));

            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([spot.lng, spot.lat])
                .addTo(map.current!);

            markersRef.current.push(marker);
        });
    }, [spots, mapLoaded, selectedSpotId, onSpotClick]);

    // Fly to new viewport
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        map.current.flyTo({
            center: [viewport.longitude, viewport.latitude],
            zoom: viewport.zoom,
            duration: 1500,
        });
    }, [viewport.latitude, viewport.longitude, viewport.zoom, mapLoaded]);

    return (
        <div className="relative w-full h-full">
            <div ref={mapContainer} className="w-full h-full" />

            {/* Map legend */}
            <div className="absolute bottom-4 left-4 glass rounded-lg p-3 z-10">
                <p className="text-xs text-gray-400 mb-2 font-medium">Pin Legend</p>
                <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                        <span>🟢</span>
                        <span className="text-gray-300">Great deal, fast, open</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span>🟡</span>
                        <span className="text-gray-300">Available</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span>🔴</span>
                        <span className="text-gray-300">Sold out / Closed</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
