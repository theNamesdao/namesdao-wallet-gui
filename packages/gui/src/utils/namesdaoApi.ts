import { validAddress } from '@chia-network/core';

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

function baseUrl() {
  const env = (globalThis as any).process?.env?.NAMESDAO_API_BASE;
  if (env && typeof env === 'string' && env.trim()) {
    const trimmed = env.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }
  return 'https://api.namesdao.org';
}

export async function checkAvailability(name: string): Promise<{ results: any[] }> {
  const clean = (name || '').trim();
  const url = `${baseUrl()}/v1/check_name_availability?name=${encodeURIComponent(clean)}`;
  const json = await getJSON(url);
  if (!json?.results) {
    throw new Error('Unexpected response format');
  }
  return json;
}

export async function getInfo(): Promise<{ paymentAddress: string; publicKey: string }> {
  const url = `${baseUrl()}/v1/info`;
  return getJSON(url);
}

export async function getPricingTiers(): Promise<{ tiers: any[]; assetIds: Record<string, string> }> {
  const url = `${baseUrl()}/v1/get_pricing_tiers`;
  return getJSON(url);
}

export async function resolveNamesdaoName(nameOrDotXch: string): Promise<string> {
  const trimmed = (nameOrDotXch || '').toString().trim().toLowerCase();
  if (!trimmed) throw new Error('Empty name');
  const lookupName = trimmed.replace(/\.xch$/i, '');
  const urls = [
    `https://namesdaolookup.xchstorage.com/${encodeURIComponent(lookupName)}.json`,
    `https://storage1.xchstorage.cyou/names_lookup/${encodeURIComponent(lookupName)}.json`,
  ];
  const results: Array<{ addr?: string; err?: any }> = await Promise.all(
    urls.map(async (url) => {
      try {
        const data = await getJSON(url);
        const addr = data?.address;
        if (!addr) throw new Error('No address in response');
        try {
          validAddress(addr);
        } catch {
          throw new Error('Invalid address');
        }
        return { addr };
      } catch (err) {
        return { err };
      }
    }),
  );

  const success = results.find((r) => r.addr);
  if (success?.addr) return success.addr;

  const errs = results.filter((r) => r.err);
  const lastErr = errs.length ? errs[errs.length - 1].err : undefined;
  throw new Error(`Failed to resolve ${lookupName}.xch${lastErr ? `: ${lastErr.message ?? String(lastErr)}` : ''}`);
}
