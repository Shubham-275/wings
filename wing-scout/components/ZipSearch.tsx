'use client';

import React, { useState, useRef, useEffect } from 'react';
import { isValidZipCode, cleanZipCode, POPULAR_CITIES } from '@/lib/utils';
import { PopularCity } from '@/lib/types';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

interface ZipSearchProps {
    onSearch: (zip: string) => void;
    isLoading?: boolean;
    initialZip?: string;
}

export function ZipSearch({ onSearch, isLoading, initialZip = '' }: ZipSearchProps) {
    const [value, setValue] = useState(initialZip);
    const [error, setError] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredCities, setFilteredCities] = useState<PopularCity[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target.value;
        setValue(input);
        setError('');

        if (input.length >= 2) {
            const lowerInput = input.toLowerCase();
            const filtered = POPULAR_CITIES.filter(
                c => c.name.toLowerCase().includes(lowerInput) ||
                    c.state.toLowerCase().includes(lowerInput) ||
                    c.zip.startsWith(input)
            ).slice(0, 6);
            setFilteredCities(filtered);
            setShowSuggestions(filtered.length > 0);
        } else {
            setShowSuggestions(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleaned = cleanZipCode(value);

        if (!isValidZipCode(cleaned)) {
            setError('Please enter a valid 5-digit US zip code');
            return;
        }

        setShowSuggestions(false);
        onSearch(cleaned);
    };

    const handleCitySelect = (city: PopularCity) => {
        setValue(city.zip);
        setShowSuggestions(false);
        onSearch(city.zip);
    };

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto relative">
            <div className="flex gap-2">
                <div className="flex-1 relative" ref={suggestionsRef}>
                    <Input
                        ref={inputRef}
                        type="text"
                        placeholder="Enter zip code or city..."
                        value={value}
                        onChange={handleInputChange}
                        onFocus={() => filteredCities.length > 0 && setShowSuggestions(true)}
                        error={error}
                        icon={
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        }
                    />

                    {/* Suggestions dropdown */}
                    {showSuggestions && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-gridiron-bg-secondary border border-gridiron-border rounded-lg shadow-xl z-50 overflow-hidden">
                            {filteredCities.map((city, idx) => (
                                <button
                                    key={`${city.zip}-${idx}`}
                                    type="button"
                                    onClick={() => handleCitySelect(city)}
                                    className="w-full px-4 py-3 text-left hover:bg-gridiron-bg-tertiary transition-colors flex justify-between items-center"
                                >
                                    <span className="text-gray-100">
                                        {city.name}, {city.state}
                                    </span>
                                    <span className="text-gray-500 text-sm">{city.zip}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <Button type="submit" isLoading={isLoading} className="shrink-0">
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Find Wings
                </Button>
            </div>
        </form>
    );
}
