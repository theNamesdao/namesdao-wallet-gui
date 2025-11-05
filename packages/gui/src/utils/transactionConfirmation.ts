import { didToDIDId } from '../util/dids';

/**
 * Check if DID wallet exists in the current wallet list
 */
export function checkDIDExists(didId: string, didWallets: any[]): boolean {
  if (!didWallets || !Array.isArray(didWallets)) {
    return false;
  }

  return didWallets.some((wallet: any) => {
    const walletDidId = wallet.myDid ?? wallet.mydid;
    return walletDidId === didId;
  });
}

/**
 * Check if NFT is assigned to a specific DID
 */
export function checkNFTAssignedToDID(nft: any, targetDidId: string): boolean {
  if (!nft || !targetDidId) {
    return false;
  }

  const ownerDidHex = nft.ownerDid;
  if (!ownerDidHex) {
    return false;
  }

  // Convert ownerDid to DIDId and compare
  const ownerDidId = didToDIDId(removeHexPrefix(ownerDidHex));
  return ownerDidId === targetDidId;
}

/**
 * Remove hex prefix from a string
 */
function removeHexPrefix(hex: string): string {
  if (hex.startsWith('0x') || hex.startsWith('0X')) {
    return hex.substring(2);
  }
  return hex;
}
