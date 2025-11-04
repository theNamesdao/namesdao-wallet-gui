import * as openpgp from 'openpgp';

function randomBase64(bytesLength = 20): string {
  const bytes = new Uint8Array(bytesLength);
  (globalThis as any).crypto.getRandomValues(bytes);
  let str = '';
  for (let i = 0; i < bytes.length; i += 1) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

export async function cloakMemo(
  payload: string,
  publicKeyArmored: string,
  includeSalt = true,
  action: 'register' | 'renew' = 'register',
): Promise<string> {
  let msg = payload;
  if (includeSalt) {
    msg = `${msg}:${randomBase64(20)}`;
  }

  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
  const message = await openpgp.createMessage({ text: msg });
  const encrypted = await openpgp.encrypt({ message, encryptionKeys: publicKey });
  return `:${action}:${encodeURIComponent(encrypted as string)}`;
}
