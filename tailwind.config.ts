import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                // Gridiron War Room Theme
                gridiron: {
                    bg: '#121212',
                    'bg-secondary': '#1a1a1a',
                    'bg-tertiary': '#242424',
                    border: '#333333',
                },
                wing: {
                    green: '#22c55e',
                    'green-dark': '#16a34a',
                    yellow: '#fbbf24',
                    'yellow-dark': '#d97706',
                    red: '#ef4444',
                    'red-dark': '#dc2626',
                },
            },
            fontFamily: {
                heading: ['var(--font-bebas)', 'Impact', 'sans-serif'],
                body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'bounce-subtle': 'bounce-subtle 2s ease-in-out infinite',
                'glow': 'glow 2s ease-in-out infinite',
                'slide-up': 'slide-up 0.3s ease-out',
                'slide-down': 'slide-down 0.3s ease-out',
                'fade-in': 'fade-in 0.2s ease-out',
            },
            keyframes: {
                'bounce-subtle': {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-5px)' },
                },
                'glow': {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(34, 197, 94, 0.3)' },
                    '50%': { boxShadow: '0 0 40px rgba(34, 197, 94, 0.6)' },
                },
                'slide-up': {
                    '0%': { transform: 'translateY(100%)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                'slide-down': {
                    '0%': { transform: 'translateY(-100%)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
            },
            backgroundImage: {
                'gridiron-pattern': `linear-gradient(rgba(34, 197, 94, 0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(34, 197, 94, 0.03) 1px, transparent 1px)`,
                'stadium-gradient': 'radial-gradient(ellipse at center, #1a1a1a 0%, #121212 70%)',
            },
            backgroundSize: {
                'gridiron': '50px 50px',
            },
        },
    },
    plugins: [],
};

export default config;
