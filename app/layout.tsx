import type { Metadata, Viewport } from 'next';
import { Inter, Bebas_Neue } from 'next/font/google';
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

export const metadata: Metadata = {
    title: 'Wing Scout | Super Bowl LX Chicken Wing Tracker',
    description: 'Find the best chicken wings near you for Super Bowl LX. Real-time availability, prices, and deals from DoorDash, Uber Eats, Grubhub, and local spots.',
    keywords: ['chicken wings', 'super bowl', 'wing deals', 'food delivery', 'game day food'],
    authors: [{ name: 'Wing Scout' }],
    icons: {
        icon: '/icon.svg',
    },
    openGraph: {
        title: 'Wing Scout | Super Bowl LX Wing Tracker',
        description: 'Real-time chicken wing availability for Super Bowl LX',
        type: 'website',
        locale: 'en_US',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Wing Scout | Super Bowl LX Wing Tracker',
        description: 'Real-time chicken wing availability for Super Bowl LX',
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
    themeColor: '#121212',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`${inter.variable} ${bebasNeue.variable}`}>
            <body className="bg-gridiron-bg min-h-screen antialiased">
                <div className="gridiron-bg min-h-screen">
                    <div className="stadium-glow min-h-screen">
                        {children}
                    </div>
                </div>
            </body>
        </html>
    );
}
