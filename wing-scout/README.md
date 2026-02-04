# 🍗 Wing Scout - Super Bowl LX Chicken Wing Tracker

**Hyper-local, real-time chicken wing availability for Super Bowl LX (Feb 8, 2026, 6:30 PM ET)**

Find the best wings near you with live pricing, stock status, delivery times, and Super Bowl specials — all on a "Gridiron War Room" themed interactive map.

![Wing Scout Banner](./public/banner.png)

## 🏈 Features

- **Pan-USA Coverage**: Works with any valid US zip code
- **Real-Time Data**: Scrapes DoorDash, Uber Eats, Grubhub, and Yelp
- **Smart Pin Colors**:
  - 🟢 **Green**: In stock + deal/≤$1.50 per wing + <45 min delivery + open during game
  - 🟡 **Yellow**: Wings available but doesn't meet green criteria
  - 🔴 **Red**: Sold out, closed, or no wings found
- **Live Countdown**: Timer to Super Bowl LX kickoff
- **Gridiron Theme**: Dark stadium aesthetic with animated UI
- **Mobile-First**: Responsive bottom sheets and smooth animations

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL + PostGIS) |
| Mapping | Mapbox GL JS |
| Scraping | Mino/AgentQL Enterprise |
| OCR | OCR.space API |
| Caching | Upstash Redis |
| Deployment | Vercel + GitHub Actions |

---

## 📋 Prerequisites

- Node.js 18+ and npm
- Python 3.9+ (for cron scraper)
- Supabase account (free tier)
- Mapbox account (free tier)
- Upstash Redis account (free tier)
- Mino/AgentQL Enterprise API key
- OCR.space API key

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd wing-scout
npm install
```

### 2. Setup Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Enable PostGIS extension:
   - Go to **Database** → **Extensions**
   - Search for `postgis` and enable it
3. Run the database schema:

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Wing spots table
CREATE TABLE wing_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  price_per_wing DECIMAL(10,2),
  deal_text TEXT,
  delivery_time_mins INTEGER,
  wait_time_mins INTEGER,
  is_in_stock BOOLEAN DEFAULT true,
  is_open_now BOOLEAN DEFAULT true,
  opens_during_game BOOLEAN DEFAULT true,
  hours_today TEXT,
  phone TEXT,
  image_url TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('green', 'yellow', 'red')),
  zip_code TEXT NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geocode cache table
CREATE TABLE geocode_cache (
  zip_code TEXT PRIMARY KEY,
  city TEXT,
  state TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scrape queue table
CREATE TABLE scrape_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip_code TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_wing_spots_zip ON wing_spots(zip_code);
CREATE INDEX idx_wing_spots_location ON wing_spots USING GIST(location);
CREATE INDEX idx_wing_spots_status ON wing_spots(status);
CREATE INDEX idx_wing_spots_last_updated ON wing_spots(last_updated);
CREATE INDEX idx_scrape_queue_status ON scrape_queue(status);
```

4. Copy your project URL and keys from **Settings** → **API**

### 3. Setup Mapbox

1. Create account at [mapbox.com](https://www.mapbox.com)
2. Create a new access token with `styles:read` and `styles:tiles` scopes
3. Copy your public token

### 4. Setup Upstash Redis

1. Create account at [upstash.com](https://upstash.com)
2. Create a new Redis database (free tier)
3. Copy the REST URL and REST token

### 5. Get API Keys

- **Mino/AgentQL**: Get your enterprise API key
- **OCR.space**: Get free API key at [ocr.space](https://ocr.space/ocrapi)

### 6. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your-mapbox-token

# Mino/AgentQL Enterprise
AGENTQL_API_KEY=your-agentql-key
AGENTQL_API_URL=https://api.agentql.com

# OCR.space
OCR_SPACE_API_KEY=your-ocr-space-key

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

### 7. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Production Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import project at [vercel.com](https://vercel.com)
3. Add all environment variables in Vercel dashboard
4. Deploy!

```bash
# Or use Vercel CLI
npm i -g vercel
vercel --prod
```

### Setup GitHub Actions Cron

The Python scraper runs every 4 hours to pre-populate data for the top 150 zip codes.

1. Add these secrets to your GitHub repository:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AGENTQL_API_KEY`
   - `AGENTQL_API_URL`

2. The workflow at `.github/workflows/scrape-cron.yml` will run automatically.

---

## 🌱 Sample Data Seeding

Run this SQL to add sample wing spots for testing:

```sql
INSERT INTO wing_spots (name, address, lat, lng, price_per_wing, deal_text, delivery_time_mins, is_in_stock, is_open_now, opens_during_game, hours_today, phone, source, status, zip_code)
VALUES 
  ('Buffalo Wild Wings', '123 Main St, New York, NY 10001', 40.7484, -73.9967, 1.20, '50 Wings Super Bowl Bucket - $49.99!', 35, true, true, true, '11AM - 2AM', '(212) 555-0101', 'doordash', 'green', '10001'),
  ('Wingstop', '456 Broadway, New York, NY 10001', 40.7505, -73.9934, 1.45, 'Game Day Special: Buy 20 Get 10 Free', 25, true, true, true, '10AM - 12AM', '(212) 555-0102', 'doordash', 'green', '10001'),
  ('Wing Zone', '789 5th Ave, New York, NY 10001', 40.7527, -73.9812, 1.65, NULL, 50, true, true, true, '11AM - 11PM', '(212) 555-0103', 'ubereats', 'yellow', '10001'),
  ('Hooters', '321 Park Ave, New York, NY 10001', 40.7549, -73.9756, 1.80, NULL, 40, false, true, true, '11AM - 1AM', '(212) 555-0104', 'grubhub', 'red', '10001'),
  ('Atomic Wings', '654 Lexington Ave, New York, NY 10001', 40.7571, -73.9689, 1.35, 'Super Bowl Party Pack - $59.99', 30, true, true, true, '11AM - 3AM', '(212) 555-0105', 'doordash', 'green', '10001');

-- Update location geography
UPDATE wing_spots SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography WHERE location IS NULL;
```

---

## 📁 Project Structure

```
/wing-scout
├── /app
│   ├── layout.tsx              # Root layout with theme
│   ├── page.tsx                # Main search + map page
│   ├── globals.css             # Global styles
│   └── api/scrape/route.ts     # On-demand scraping endpoint
├── /components
│   ├── Scoreboard.tsx          # Countdown + availability %
│   ├── ZipSearch.tsx           # Zip input with autocomplete
│   ├── WingMap.tsx             # Mapbox map component
│   ├── WingCard.tsx            # Restaurant detail card
│   └── ui/                     # Reusable UI components
├── /lib
│   ├── supabase.ts             # Supabase clients
│   ├── agentql.ts              # Scraper wrappers
│   ├── ocr.ts                  # OCR.space wrapper
│   ├── geocode.ts              # Nominatim geocoding
│   ├── cache.ts                # Upstash Redis
│   ├── utils.ts                # Helpers
│   └── types.ts                # TypeScript interfaces
├── /scraper
│   ├── scrape_wings.py         # Python cron script
│   └── requirements.txt        # Python dependencies
├── /public                     # Static assets
├── .env.example
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 🔧 API Endpoints

### `GET /api/scrape?zip=10001`

Triggers on-demand scraping for a zip code.

**Response:**
```json
{
  "success": true,
  "spots": [...],
  "cached": false,
  "message": "Found 12 wing spots"
}
```

---

## 🎨 Theme Colors

| Name | Hex | Usage |
|------|-----|-------|
| Background | `#121212` | Main dark background |
| Green | `#22c55e` | In-stock/available |
| Yellow | `#fbbf24` | Partial availability |
| Red | `#ef4444` | Sold out/closed |
| Text | `#f3f4f6` | Primary text |
| Muted | `#9ca3af` | Secondary text |

---

## 📱 Mobile Support

The app is fully responsive with:
- Bottom sheet for restaurant details on mobile
- Touch-friendly map controls
- Optimized for iOS Safari and Chrome Android

---

## 🐛 Troubleshooting

### Map not loading
- Verify your Mapbox token is correct
- Check browser console for CORS errors
- Ensure token has proper scopes

### No data showing
- Check Supabase connection
- Verify database tables exist
- Run sample data seeding SQL

### Scraping failures
- Verify AgentQL API key
- Check rate limits
- Review scraper logs in Vercel

---

## 📄 License

MIT License - feel free to use for your Super Bowl party! 🏈🍗

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

**Built with 🍗 for Super Bowl LX**
