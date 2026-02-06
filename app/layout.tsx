import type { Metadata, Viewport } from 'next';
import { Inter, Bebas_Neue, Permanent_Marker, Russo_One } from 'next/font/google';
import './globals.css';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
});

const bebasNeue = Bebas_Neue({
    weight: '400',
    subsets: ['latin'],
    variable: '--font-bebas',
    display: 'swap',
});

const russoOne = Russo_One({
    weight: '400',
    subsets: ['latin'],
    variable: '--font-russo',
    display: 'swap',
});

// "Permanent Marker" handwriting font for coach notes:
const permanentMarker = Permanent_Marker({
    weight: '400',
    subsets: ['latin'],
    variable: '--font-marker',
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'Super Bowl LX: Wing Command | Your Game Day Wing HQ',
    description: 'Your Super Bowl LX wing headquarters. Find the best chicken wings to order for your game day party — real-time deals, flavor matching, and AI-powered scouting. Powered by Coach Wing.',
    keywords: ['chicken wings', 'super bowl', 'wing deals', 'game day food', 'wing command', 'super bowl lx', 'super bowl party', 'order wings'],
    authors: [{ name: 'Wing Command' }],
    icons: {
        icon: '/icon.svg',
    },
    openGraph: {
        title: 'Super Bowl LX: Wing Command | Your Game Day Wing HQ',
        description: 'Find the best chicken wings for your Super Bowl LX party. Real-time deals, flavor matching, and AI-powered scouting.',
        type: 'website',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Super Bowl LX: Wing Command | Your Game Day Wing HQ',
        description: 'Find the best chicken wings for your Super Bowl LX party.',
    },
    robots: {
        index: true,
        follow: true,
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    themeColor: '#F3F4F6',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`${inter.variable} ${bebasNeue.variable} ${russoOne.variable} ${permanentMarker.variable}`}>
            <body className="min-h-screen antialiased" style={{ background: 'transparent' }}>
                <div className="min-h-screen">
                    {children}
                </div>
            </body>
        </html>
    );
}
