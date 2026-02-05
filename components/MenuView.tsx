'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MenuResponse, MenuItem } from '@/lib/types';
import { Accordion, AccordionItem } from './ui/Accordion';
import { Badge } from './ui/Badge';
import { cn } from '@/lib/utils';

interface MenuViewProps {
    spotId: string;
    spotName: string;
}

export function MenuView({ spotId, spotName }: MenuViewProps) {
    const { data, isLoading, error } = useQuery<MenuResponse>({
        queryKey: ['menu', spotId],
        queryFn: async () => {
            const res = await fetch(`/api/menu?spot_id=${encodeURIComponent(spotId)}`);
            if (!res.ok) {
                throw new Error('Failed to fetch menu');
            }
            return res.json();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 30 * 60 * 1000,   // 30 minutes (formerly cacheTime)
        retry: 1,
    });

    if (isLoading) {
        return <MenuSkeleton />;
    }

    if (error || !data?.success || !data.menu) {
        return (
            <div className="text-center py-6 text-gray-400">
                <p>Menu not available</p>
                <p className="text-sm mt-1">Try ordering directly from the restaurant</p>
            </div>
        );
    }

    const { menu } = data;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="font-heading text-xl text-gray-100">Menu</h4>
                {menu.has_wings && (
                    <Badge variant="green" size="sm">
                        Wings Available
                    </Badge>
                )}
            </div>

            <Accordion>
                {menu.sections.map((section, index) => (
                    <AccordionItem
                        key={`${section.name}-${index}`}
                        title={section.name}
                        defaultOpen={index === menu.wing_section_index}
                        highlighted={index === menu.wing_section_index}
                        badge={
                            index === menu.wing_section_index ? (
                                <Badge variant="green" size="sm">Wings</Badge>
                            ) : undefined
                        }
                    >
                        <div className="space-y-3">
                            {section.items.map((item, itemIndex) => (
                                <MenuItemRow
                                    key={`${item.name}-${itemIndex}`}
                                    item={item}
                                />
                            ))}
                        </div>
                    </AccordionItem>
                ))}
            </Accordion>

            <p className="text-xs text-gray-500 text-center">
                Menu via {menu.source.replace('_', ' ')}
                {data.cached && ' (cached)'}
            </p>
        </div>
    );
}

function MenuItemRow({ item }: { item: MenuItem }) {
    const isWingItem = /wing/i.test(item.name);

    return (
        <div className={cn(
            'flex justify-between items-start gap-3 py-2',
            'border-b border-gridiron-border/50 last:border-0',
            isWingItem && 'bg-wing-green/5 -mx-2 px-2 rounded'
        )}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn(
                        'font-medium text-gray-100',
                        isWingItem && 'text-wing-green'
                    )}>
                        {item.name}
                    </span>
                    {item.is_deal && (
                        <Badge variant="yellow" size="sm">Deal</Badge>
                    )}
                </div>
                {item.description && (
                    <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">
                        {item.description}
                    </p>
                )}
                {item.price_per_wing && (
                    <p className="text-xs text-wing-green mt-1">
                        ${item.price_per_wing.toFixed(2)}/wing
                    </p>
                )}
            </div>
            <div className="text-right shrink-0">
                {item.price !== null ? (
                    <span className="font-medium text-gray-100">
                        ${item.price.toFixed(2)}
                    </span>
                ) : (
                    <span className="text-gray-500">--</span>
                )}
            </div>
        </div>
    );
}

function MenuSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="h-6 bg-gridiron-bg-tertiary rounded w-24" />
            <div className="space-y-2">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-14 bg-gridiron-bg-tertiary rounded" />
                ))}
            </div>
        </div>
    );
}
