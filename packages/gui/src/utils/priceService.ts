import { t } from '@lingui/macro';

export type PriceTier = {
  label: string;
  namePrice: number;
  xchPrice: number;
};

type PricingData = {
  tiers: PriceTier[];
  lastUpdated: number;
};

const FALLBACK_PRICES: PriceTier[] = [
  {
    label: t`4 characters`,
    namePrice: 120,
    xchPrice: 5,
  },
  {
    label: t`5 characters`,
    namePrice: 20,
    xchPrice: 0.62,
  },
  {
    label: t`6 characters`,
    namePrice: 10,
    xchPrice: 0.31,
  },
  {
    label: t`7+ characters`,
    namePrice: 5,
    xchPrice: 0.19,
  },
  {
    label: t`1-2 underscores (1u), 5+ characters`,
    namePrice: 0.5,
    xchPrice: 0.018,
  },
  {
    label: t`3+ underscores (3u), 5+ characters`,
    namePrice: 0,
    xchPrice: 0.000_001, // 1 mojo
  },
];

const CACHE_KEY = 'namesdao-price-cache';
const CACHE_VALID_MS = 24 * 60 * 60 * 1000; // 24 hours

function getApiBaseUrl(): string {
  const env = (globalThis as any).process?.env?.NAMESDAO_API_BASE;
  if (env && typeof env === 'string' && env.trim()) {
    const trimmed = env.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }
  return 'https://api.namesdao.org';
}

export async function getPrices(): Promise<PriceTier[]> {
  try {
    // Check cache first
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: PricingData = JSON.parse(cached);
      if (Date.now() - parsed.lastUpdated < CACHE_VALID_MS) {
        return parsed.tiers;
      }
    }

    // Fetch fresh prices
    const response = await fetch(`${getApiBaseUrl()}/v1/prices`);
    if (!response.ok) throw new Error('Price API failed');

    const data = await response.json();
    if (!data?.tiers) throw new Error('Invalid price data');

    const pricingData: PricingData = {
      tiers: data.tiers,
      lastUpdated: Date.now(),
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(pricingData));
    return pricingData.tiers;
  } catch (error) {
    console.error('Failed to fetch prices, using fallback', error);
    return FALLBACK_PRICES;
  }
}

export function isPriceLoading(prices: PriceTier[] | null): boolean {
  return prices === null;
}

export function areFallbackPrices(prices: PriceTier[]): boolean {
  return prices === FALLBACK_PRICES;
}
