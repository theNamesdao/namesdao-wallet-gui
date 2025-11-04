import { t } from '@lingui/macro';

async function getJSON(url: string) {
  const appAPI: any = (globalThis as any).window?.appAPI;
  if (appAPI?.fetchTextGet) {
    const result = await appAPI.fetchTextGet(url);
    const { statusCode, responseBody } = result || {};
    if (statusCode !== 200) {
      throw new Error(`HTTP ${statusCode}: ${result?.statusMessage ?? ''} ${result?.responseBody ?? ''}`.trim());
    }
    try {
      return JSON.parse(responseBody);
    } catch (e) {
      throw new Error('Response was not valid JSON');
    }
  }

  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? ` - ${txt}` : ''}`);
  }
  return res.json();
}

export type PriceTier = {
  label: string;
  namePrice: number;
  xchPrice: number;
  sbxPrice?: number;
  airPrice?: number;
};

type PricingData = {
  tiers: PriceTier[];
  lastUpdated: number;
};

const CACHE_KEY = 'namesdao-price-cache';
const CACHE_VALID_MS = 24 * 60 * 60 * 1000; // 24 hours - can be changed later if needed

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
  // Check cache first (only if valid)
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const parsed: PricingData = JSON.parse(cached);
    const isFresh = Date.now() - parsed.lastUpdated < CACHE_VALID_MS;
    const hasSbxAir =
      Array.isArray(parsed.tiers) &&
      parsed.tiers.length > 0 &&
      parsed.tiers.every((tier: any) => typeof tier?.sbxPrice === 'number' && typeof tier?.airPrice === 'number');
    if (isFresh && hasSbxAir) return parsed.tiers;
  }

  // No valid cache, fetch fresh prices with retry logic
  return fetchWithRetry();
}

async function fetchWithRetry(maxRetries = 3): Promise<PriceTier[]> {
  let attempt = 1;

  const tryFetch = async (): Promise<PriceTier[]> => {
    if (attempt > maxRetries) {
      throw new Error('Failed to fetch prices after multiple attempts');
    }

    try {
      return await fetchFreshPrices();
    } catch (error) {
      console.warn(`Price fetch attempt ${attempt} failed:`, error);

      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retry with exponential backoff (1s, 2s, 4s)
      const delay = 2 ** (attempt - 1) * 1000;
      attempt++;
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), delay);
      });
      return tryFetch();
    }
  };

  return tryFetch();
}

async function fetchFreshPrices(): Promise<PriceTier[]> {
  // Fetch fresh prices from Namesdao API using getJSON (which handles Electron appAPI)
  const data = await getJSON(`${getApiBaseUrl()}/v1/get_pricing_tiers`);

  const apiTiers = data?.tiers as
    | Array<{ nameType: string; fees: { XCH?: string; NAME?: string; SBX?: string; AIR?: string } }>
    | undefined;
  if (!apiTiers || !Array.isArray(apiTiers)) {
    throw new Error('Invalid price data from API');
  }

  // Map API tiers into our PriceTier format with labels compatible with pickTierForName()
  const tiers: PriceTier[] = apiTiers.map((tierItem) => {
    const { nameType, fees } = tierItem;
    const xch = Number(fees?.XCH ?? 0);
    const name = Number(fees?.NAME ?? 0);
    const sbx = Number(fees?.SBX ?? 0);
    const air = Number(fees?.AIR ?? 0);

    // Debug logging for 3u4 tier removed

    let label: string;
    switch (nameType) {
      case '0u4':
        label = t`4 characters`;
        break;
      case '0u5':
        label = t`5 characters`;
        break;
      case '0u6':
        label = t`6 characters`;
        break;
      case '0u7':
        label = t`7+ characters`;
        break;
      case '1u4':
        label = t`1 underscore (1u), 4+ characters`;
        break;
      case '3u4':
        label = t`3 underscores (3u), 4+ characters`;
        break;
      default:
        label = nameType;
    }
    return { label, namePrice: name, xchPrice: xch, sbxPrice: sbx, airPrice: air };
  });

  const pricingData: PricingData = { tiers, lastUpdated: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(pricingData));
  return pricingData.tiers;
}

export function formatXchPrice(price: number): string {
  if (price === 0) return '0';

  // For very small numbers, use fixed notation to avoid scientific notation
  if (price < 0.000_001) {
    return price.toFixed(12).replace(/\.?0+$/, '');
  }

  // For normal numbers, use standard formatting but remove trailing zeros
  const formatted = price.toString();
  if (formatted.includes('e')) {
    // Fallback for any scientific notation we might have missed
    return price.toFixed(12).replace(/\.?0+$/, '');
  }

  return formatted;
}

export function formatNamePrice(price: number): string {
  if (price === 0) return '0';
  return price.toString();
}

export function formatSbxPrice(price: number): string {
  if (price === 0) return '0';
  return price.toString();
}

export function formatAirPrice(price: number): string {
  if (price === 0) return '0';
  return price.toString();
}

export function isPriceLoading(prices: PriceTier[] | null): boolean {
  return prices === null;
}
