export const NAMESDAO_CREATOR_DID_HEX = '8ec8c193d7d8753707af7fc1936056eea8a3589c91250ce03f464f8d506b6fea';
export const NAMESDAO_COLLECTION_NAME = '.xch Namesdao Names';
export const GRACE_PERIOD_BLOCKS = 414_720;

function stripQueryAndHash(url: string) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

function lastPathSegment(url: string) {
  const clean = stripQueryAndHash(url);
  const parts = clean.split('/');
  return decodeURIComponent(parts[parts.length - 1] || '');
}

function removeExtension(filename: string) {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : filename;
}

export function parseNameAndExpiryFromUri(uri: string): { name: string; expiryBlock: number } | null {
  const seg = lastPathSegment(uri);
  if (!seg) return null;
  const base = removeExtension(seg);
  const parts = base.split('-');
  if (parts.length < 2) return null;
  const rawName = (parts[0] || '').trim();
  const expStr = (parts[1] || '').replace(/[^0-9]/g, '');
  if (!rawName || !expStr) return null;
  const expiryBlock = Number.parseInt(expStr, 10);
  if (!Number.isFinite(expiryBlock)) return null;
  const name = rawName.toLowerCase();
  return { name, expiryBlock };
}

export function extractFromDataUris(dataUris: string[] | undefined): { name: string; expiryBlock: number } | null {
  if (!dataUris || dataUris.length < 2) return null;
  const idx = dataUris.length - 2;
  return parseNameAndExpiryFromUri(dataUris[idx]);
}

export function formatDotXch(name: string) {
  return `${name}.xch`;
}
