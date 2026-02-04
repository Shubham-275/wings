// ===========================================
// Wing Scout - OCR.space API Wrapper
// ===========================================

import axios from 'axios';
import { OCRResponse, MenuItem } from './types';

const OCR_API_URL = 'https://api.ocr.space/parse/imageurl';
const OCR_API_KEY = process.env.OCR_SPACE_API_KEY!;

export async function extractTextFromImage(imageUrl: string): Promise<string | null> {
    try {
        const response = await axios.post<OCRResponse>(OCR_API_URL, null, {
            params: {
                apikey: OCR_API_KEY,
                url: imageUrl,
                isTable: true,
                language: 'eng',
                detectOrientation: true,
                scale: true,
                OCREngine: 2,
            },
            timeout: 30000,
        });

        if (response.data.IsErroredOnProcessing) {
            console.error('OCR error:', response.data.ErrorMessage);
            return null;
        }

        if (!response.data.ParsedResults?.length) return null;
        return response.data.ParsedResults[0].ParsedText || null;
    } catch (error) {
        console.error('OCR API error:', error);
        return null;
    }
}

export function parseMenuText(rawText: string): MenuItem[] {
    const items: MenuItem[] = [];
    const lines = rawText.split('\n').filter(l => l.trim());

    const wingPatterns = [/wing/i, /buffalo/i, /boneless/i, /drumette/i, /hot.*wing/i];
    const pricePattern = /\$\s*(\d+(?:\.\d{2})?)/;
    const qtyPattern = /(\d+)\s*(?:pc|piece|pcs|pieces|ct|count|wings?)/i;
    const dealPatterns = [/special/i, /deal/i, /combo/i, /bucket/i, /party/i, /super.*bowl/i, /free/i];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const next = lines[i + 1]?.trim() || '';

        if (!wingPatterns.some(p => p.test(line))) continue;

        let price: number | null = null;
        const pm = line.match(pricePattern) || next.match(pricePattern);
        if (pm) price = parseFloat(pm[1]);

        let qty: number | undefined;
        const qm = line.match(qtyPattern) || next.match(qtyPattern);
        if (qm) qty = parseInt(qm[1], 10);

        const ppw = (price && qty && qty > 0) ? price / qty : undefined;
        const isDeal = dealPatterns.some(p => p.test(line) || p.test(next));
        const name = line.replace(pricePattern, '').replace(/\s+/g, ' ').trim();

        if (name.length > 3) {
            items.push({ name, price, quantity: qty, price_per_wing: ppw, is_deal: isDeal });
        }
    }
    return items;
}

export async function extractWingMenuFromImage(imageUrl: string): Promise<MenuItem[]> {
    const raw = await extractTextFromImage(imageUrl);
    return raw ? parseMenuText(raw) : [];
}

export function findBestWingDeal(items: MenuItem[]): MenuItem | null {
    if (!items.length) return null;
    const withPrice = items.filter(i => i.price_per_wing);
    if (!withPrice.length) return items[0];
    return withPrice.reduce((best, i) =>
        (i.price_per_wing! < (best.price_per_wing || Infinity)) ? i : best
    );
}
