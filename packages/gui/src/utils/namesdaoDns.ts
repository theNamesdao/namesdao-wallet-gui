export type NamesdaoRecord = {
  type: string; // e.g. 'CNAME'
  host: string; // e.g. '@'
  value: string; // e.g. 'www.example.com'
  ttl: number; // numeric per Linux format
};

export type NamesdaoModel = Record<string, { dns: { default: NamesdaoRecord[] } }>;

export function parseNamesdaoString(input?: string): NamesdaoModel {
  if (!input || typeof input !== 'string') return {};
  try {
    const parsed = JSON.parse(input);
    // Very light validation
    if (parsed && typeof parsed === 'object') {
      return parsed as NamesdaoModel;
    }
  } catch (_e) {
    // ignore
  }
  return {};
}

export function serializeNamesdao(model: NamesdaoModel): string {
  return JSON.stringify(model);
}

export function stripProtocol(urlOrHost: string): string {
  const raw = (urlOrHost || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.hostname || '';
  } catch {
    // Not a URL, treat as host
    return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
}

export function normalizeHostname(urlOrHost: string): string | null {
  const host = stripProtocol(urlOrHost).trim();
  if (!host) return null;
  // Very basic host validation
  if (/\s/.test(host)) return null;
  return host;
}

export function getHostnameForName(model: NamesdaoModel, fqdn: string): string | undefined {
  const entry = model[fqdn];
  if (!entry || !entry.dns || !Array.isArray(entry.dns.default)) return undefined;
  const rec = entry.dns.default.find((r) => r && r.type === 'CNAME' && r.host === '@');
  if (!rec || !rec.value) return undefined;
  // Return the exact value that was stored
  return rec.value;
}

export function mergeName(model: NamesdaoModel, fqdn: string, hostNormalized: string): NamesdaoModel {
  const next: NamesdaoModel = { ...model };
  const value = hostNormalized;
  const record: NamesdaoRecord = {
    type: 'CNAME',
    host: '@',
    value,
    ttl: 3600,
  };
  next[fqdn] = {
    dns: {
      default: [record],
    },
  };
  return next;
}

export function verifyNameConfigured(model: NamesdaoModel, fqdn: string, hostNormalized: string): boolean {
  const entry = model[fqdn];
  if (!entry || !entry.dns || !Array.isArray(entry.dns.default)) return false;
  const value = hostNormalized;
  return entry.dns.default.some(
    (r) => r.type === 'CNAME' && r.host === '@' && r.value === value && typeof r.ttl === 'number',
  );
}
