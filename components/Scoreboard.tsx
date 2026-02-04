'use client';

import React, { useEffect, useState } from 'react';
import { getCountdown, formatCountdown, SUPER_BOWL_DATE } from '@/lib/utils';
import { AvailabilityStats } from '@/lib/types';
import { LiveBadge } from './ui/Badge';

interface ScoreboardProps {
    stats: AvailabilityStats;
    isLoading?: boolean;
    isRefreshing?: boolean;
}

export function Scoreboard({ stats, isLoading, isRefreshing }: ScoreboardProps) {
    const [countdown, setCountdown] = useState(getCountdown());

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(getCountdown());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <header className="fixed top-0 left-0 right-0 z-30 glass border-b border-gridiron-border">
            <div className="max-w-7xl mx-auto px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                    {/* Logo & Title */}
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🍗</span>
                        <div className="hidden sm:block">
                            <h1 className="font-heading text-2xl text-wing-green tracking-wide">
                                WING SCOUT
                            </h1>
                            <p className="text-xs text-gray-500">Super Bowl LX Tracker</p>
                        </div>
                    </div>

                    {/* Countdown */}
                    <div className="text-center">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">
                            Kickoff In
                        </p>
                        <div className={`font-heading text-xl sm:text-2xl text-wing-green ${!countdown.isPast ? 'animate-countdown' : ''}`}>
                            {formatCountdown(countdown)}
                        </div>
                        <p className="text-xs text-gray-500 hidden sm:block">
                            Feb 8, 2026 • 6:30 PM ET
                        </p>
                    </div>

                    {/* Availability */}
                    <div className="text-right">
                        <div className="flex items-center justify-end gap-2 mb-0.5">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">
                                Wings Available
                            </p>
                            {isRefreshing && <LiveBadge />}
                        </div>
                        {isLoading ? (
                            <div className="h-8 w-20 skeleton rounded" />
                        ) : (
                            <div className="font-heading text-2xl sm:text-3xl">
                                <span className={stats.percentage >= 50 ? 'text-wing-green' : stats.percentage >= 25 ? 'text-wing-yellow' : 'text-wing-red'}>
                                    {stats.percentage}%
                                </span>
                            </div>
                        )}
                        <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-wing-green" />
                                {stats.green}
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-wing-yellow" />
                                {stats.yellow}
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-wing-red" />
                                {stats.red}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
