import { validAddress } from '@chia-network/core';
import { t } from '@lingui/macro';

/**
 * Resolve a Namesdao .xch name to an XCH address if needed.
 * - Trims input
 * - Only resolves when getType === 'address' and the value ends with `.xch` (case-insensitive)
 * - Uses window.appAPI.fetchTextGet (Electron main) when available to avoid CORS; falls back to fetch
 * - Returns the resolved address string or the original trimmed value
 * - Throws a detailed Error on failure (includes lookupName and HTTP/parse details)
 */
export async function resolveNamesdaoIfNeeded(value: string, getType: 'address' | 'did' = 'address'): Promise<string> {
  const trimmed = (value ?? '').toString().trim();
  if (!trimmed) return trimmed;
  if (getType !== 'address') return trimmed;
  if (!/\.xch$/i.test(trimmed)) return trimmed;

  const lookupName = trimmed.toLowerCase().replace(/\.xch$/i, '');
  // allow only conservative characters for safety
  if (!/^[a-z0-9._-]+$/.test(lookupName)) {
    throw new Error('Invalid .xch name format');
  }
  const url = `https://namesdaolookup.xchstorage.com/${encodeURIComponent(lookupName)}.json`;

  try {
    // Prefer main-process GET to bypass CORS
    const appAPI: any = (globalThis as any).window?.appAPI;
    if (appAPI?.fetchTextGet) {
      const result = await appAPI.fetchTextGet(url);
      const { statusCode, statusMessage, responseBody } = result || {};
      if (statusCode !== 200) {
        throw new Error(`HTTP ${statusCode} ${statusMessage ?? ''} - ${responseBody ?? ''}`.trim());
      }
      let data: any;
      try {
        data = JSON.parse(responseBody);
      } catch {
        throw new Error('Lookup response was not valid JSON');
      }
      if (!data || !data.address) {
        throw new Error('Lookup JSON missing "address" field');
      }
      // Validate bech32m address format; will throw on invalid
      try {
        validAddress(data.address);
      } catch (e: any) {
        throw new Error('Lookup JSON contained invalid address format');
      }
      return data.address;
    }

    // Fallback to fetch (may be blocked by CORS in some contexts)
    const res = await fetch(url);
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}${bodyText ? ` - ${bodyText}` : ''}`);
    }
    const data = await res.json();
    if (!data || !data.address) {
      throw new Error('Lookup JSON missing "address" field');
    }
    try {
      validAddress(data.address);
    } catch (e: any) {
      throw new Error('Lookup JSON contained invalid address format');
    }
    return data.address;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    throw new Error(t`Namesdao .xch lookup failed for ${lookupName}: ${msg}`);
  }
}

export default resolveNamesdaoIfNeeded;
