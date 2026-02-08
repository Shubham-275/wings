'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe, Instagram, Copy, Check, ExternalLink } from 'lucide-react';
import { DealsResponse, SuperBowlDeal } from '@/lib/types';
import { cn } from '@/lib/utils';

interface DealsViewProps {
    spotId: string;
    spotName: string;
    enabled?: boolean;
}

export function DealsView({ spotId, spotName, enabled = true }: DealsViewProps) {
    const { data, isLoading, error } = useQuery<DealsResponse>({
        queryKey: ['deals', spotId],
        queryFn: async () => {
            const res = await fetch(`/api/deals?spot_id=${encodeURIComponent(spotId)}`);
            if (!res.ok) throw new Error('Failed to fetch deals');
            return res.json();
        },
        staleTime: 15 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        retry: 1,
        enabled,
    });

    if (isLoading) {
        return <DealsSkeleton />;
    }

    if (error || !data?.success || data.deals.length === 0) {
        return (
            <div className="text-center py-2">
                <p className="font-marker text-[10px] text-gray-400">
                    No SB specials found
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1.5">
                <span className="text-sm">🏈</span>
                <span className="font-heading text-[10px] tracking-widest text-amber-700 uppercase">
                    Super Bowl Specials
                </span>
            </div>
            {data.deals.map((deal, index) => (
                <DealCard key={index} deal={deal} />
            ))}
        </div>
    );
}

/**
 * Compact inline deal badge for use in the ScoutingReportCard
 */
export function InlineDealBadge({ deal }: { deal: SuperBowlDeal }) {
    return (
        <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px]">🏈</span>
            <span className="font-marker text-[10px] text-amber-700 leading-tight line-clamp-1">
                {deal.description}
            </span>
        </div>
    );
}

function DealCard({ deal }: { deal: SuperBowlDeal }) {
    const [copied, setCopied] = useState(false);

    const copyPromoCode = () => {
        if (deal.promo_code) {
            navigator.clipboard.writeText(deal.promo_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className={cn(
            'rounded-lg border-2 border-amber-400/40 bg-amber-50/60 p-2.5 space-y-1.5',
        )}>
            {/* Deal description */}
            <p className="font-marker text-[11px] text-amber-900 leading-snug">
                {deal.description}
            </p>

            {/* Promo code */}
            {deal.promo_code && (
                <button
                    onClick={copyPromoCode}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-200/70 hover:bg-amber-300/70 transition-colors"
                >
                    <span className="font-mono text-[10px] font-bold text-amber-800">
                        {deal.promo_code}
                    </span>
                    {copied ? (
                        <Check className="w-2.5 h-2.5 text-green-600" />
                    ) : (
                        <Copy className="w-2.5 h-2.5 text-amber-600" />
                    )}
                </button>
            )}

            {/* Pre-order deadline */}
            {deal.pre_order_deadline && (
                <p className="text-[9px] text-red-600 font-bold">
                    {deal.pre_order_deadline}
                </p>
            )}

            {/* Pre-order link */}
            {deal.pre_order_url && (
                <a
                    href={deal.pre_order_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[9px] text-amber-700 hover:text-amber-900 underline"
                >
                    Pre-order <ExternalLink className="w-2.5 h-2.5" />
                </a>
            )}

            {/* Special menu items */}
            {deal.special_menu_items && deal.special_menu_items.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {deal.special_menu_items.map((item, i) => (
                        <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            {item}
                        </span>
                    ))}
                </div>
            )}

            {/* Source attribution */}
            <div className="flex items-center gap-1 pt-0.5">
                {deal.source === 'website' ? (
                    <Globe className="w-2.5 h-2.5 text-gray-400" />
                ) : (
                    <Instagram className="w-2.5 h-2.5 text-gray-400" />
                )}
                <span className="text-[8px] text-gray-400">
                    Found on {deal.source}
                </span>
            </div>
        </div>
    );
}

function DealsSkeleton() {
    return (
        <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-amber-100/50 rounded w-32" />
            <div className="h-16 bg-amber-100/30 rounded border border-amber-200/30" />
        </div>
    );
}
