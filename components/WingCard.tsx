'use client';

import React from 'react';
import Image from 'next/image';
import { WingSpot } from '@/lib/types';
import { formatPricePerWing, formatDeliveryTime, formatRelativeTime, getGoogleMapsUrl, getTelLink, getStatusBorderClass } from '@/lib/utils';
import { StatusBadge } from './ui/Badge';
import { Button } from './ui/Button';

interface WingCardProps {
    spot: WingSpot;
    onClose?: () => void;
}

export function WingCard({ spot, onClose }: WingCardProps) {
    return (
        <div className="space-y-4">
            {/* Header with image */}
            {spot.image_url && (
                <div className="relative h-40 -mx-4 -mt-4 overflow-hidden rounded-t-xl">
                    <Image
                        src={spot.image_url}
                        alt={spot.name}
                        fill
                        className="object-cover"
                        unoptimized // External URLs from scraped sources
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gridiron-bg-secondary to-transparent" />
                </div>
            )}

            {/* Name and status */}
            <div className="flex items-start justify-between gap-3">
                <h3 className="font-heading text-3xl text-gray-100 leading-tight">
                    {spot.name}
                </h3>
                <StatusBadge status={spot.status} />
            </div>

            {/* Deal highlight */}
            {spot.deal_text && (
                <div className={`p-3 rounded-lg border ${getStatusBorderClass('green')} bg-wing-green/10`}>
                    <p className="font-heading text-xl text-wing-green">
                        🔥 {spot.deal_text}
                    </p>
                </div>
            )}

            {/* Price */}
            <div className="flex items-baseline gap-3">
                {spot.price_per_wing && (
                    <span className="font-heading text-2xl text-gray-100">
                        {formatPricePerWing(spot.price_per_wing)}
                    </span>
                )}
                {spot.delivery_time_mins && (
                    <span className="text-gray-400">
                        • {formatDeliveryTime(spot.delivery_time_mins)} delivery
                    </span>
                )}
            </div>

            {/* Details list */}
            <div className="space-y-3 py-3 border-t border-b border-gridiron-border">
                {/* Address */}
                <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-gray-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div>
                        <p className="text-gray-100">{spot.address}</p>
                        <a
                            href={getGoogleMapsUrl(spot.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-wing-green hover:underline"
                        >
                            Open in Maps →
                        </a>
                    </div>
                </div>

                {/* Hours */}
                {spot.hours_today && (
                    <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-gray-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <p className={spot.is_open_now ? 'text-wing-green' : 'text-wing-red'}>
                                {spot.is_open_now ? 'Open now' : 'Closed'}
                            </p>
                            <p className="text-sm text-gray-400">{spot.hours_today}</p>
                            {spot.opens_during_game && (
                                <p className="text-xs text-wing-green mt-1">✓ Open during game time</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Phone */}
                {spot.phone && (
                    <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <a href={getTelLink(spot.phone)} className="text-gray-100 hover:text-wing-green">
                            {spot.phone}
                        </a>
                    </div>
                )}
            </div>

            {/* Source and updated */}
            <div className="flex items-center justify-between text-xs text-gray-500">
                <span>via {spot.source.charAt(0).toUpperCase() + spot.source.slice(1)}</span>
                <span>Updated {formatRelativeTime(spot.last_updated)}</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <Button variant="primary" className="flex-1">
                    Order Now
                </Button>
                {spot.phone && (
                    <Button variant="secondary" onClick={() => window.open(getTelLink(spot.phone!))}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                    </Button>
                )}
            </div>
        </div>
    );
}
