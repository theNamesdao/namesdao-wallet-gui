import type { NFTInfo } from '@chia-network/api';
import { useGetSyncStatusQuery } from '@chia-network/api-react';
import { useEffect, useMemo, useState } from 'react';

import removeHexPrefix from '../util/removeHexPrefix';
import { extractFromDataUris, NAMESDAO_CREATOR_DID_HEX, NAMESDAO_COLLECTION_NAME } from '../utils/namesdaoNames';

import useNFTProvider from './useNFTProvider';

export type NamesdaoNameEntry = {
  name: string;
  expiryBlock: number;
  nftId: string;
  nft: NFTInfo;
};

export default function useMyNamesdaoNames() {
  const { nfts, getMetadata, subscribeToChanges, isLoading, ensureInitialized } = useNFTProvider();
  const { data: syncStatus } = useGetSyncStatusQuery();
  const synced = !!syncStatus?.synced;
  const [version, setVersion] = useState(0);
  const [initInProgress, setInitInProgress] = useState(true);

  useEffect(() => subscribeToChanges(() => setVersion((v) => v + 1)), [subscribeToChanges]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureInitialized();
      } finally {
        if (alive) setInitInProgress(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ensureInitialized]);

  const entries = useMemo<NamesdaoNameEntry[]>(() => {
    const v = version;
    const byName = new Map<string, NamesdaoNameEntry>();

    nfts.forEach((nft, nftId) => {
      const hexMinter = removeHexPrefix(nft.minterDid || '');
      if (hexMinter !== NAMESDAO_CREATOR_DID_HEX) return;

      const parsed = extractFromDataUris(nft.dataUris);
      if (!parsed) return;

      // While syncing, avoid triggering metadata fetches; rely on DID + canonical data URI
      if (!synced) {
        const key = parsed.name.toLowerCase();
        const current: NamesdaoNameEntry | undefined = byName.get(key);
        const candidate: NamesdaoNameEntry = { name: parsed.name, expiryBlock: parsed.expiryBlock, nftId, nft };

        if (!current) {
          byName.set(key, candidate);
          return;
        }

        if (candidate.expiryBlock > current.expiryBlock) {
          byName.set(key, candidate);
          return;
        }

        if (candidate.expiryBlock === current.expiryBlock) {
          const a = Number(candidate.nft.nftCoinConfirmationHeight || 0);
          const b = Number(current.nft.nftCoinConfirmationHeight || 0);
          if (a !== b) {
            byName.set(key, a > b ? candidate : current);
            return;
          }
          const ma = Number(candidate.nft.mintHeight || 0);
          const mb = Number(current.nft.mintHeight || 0);
          if (ma !== mb) {
            byName.set(key, ma > mb ? candidate : current);
            return;
          }
        }

        return;
      }

      // When synced, enforce collection name via metadata
      const { metadata } = getMetadata(nftId);
      const collectionName = metadata?.collection?.name;
      if (collectionName !== NAMESDAO_COLLECTION_NAME) return;

      const key = parsed.name.toLowerCase();
      const current: NamesdaoNameEntry | undefined = byName.get(key);
      const candidate: NamesdaoNameEntry = { name: parsed.name, expiryBlock: parsed.expiryBlock, nftId, nft };

      if (!current) {
        byName.set(key, candidate);
        return;
      }

      if (candidate.expiryBlock > current.expiryBlock) {
        byName.set(key, candidate);
        return;
      }

      if (candidate.expiryBlock === current.expiryBlock) {
        const a = Number(candidate.nft.nftCoinConfirmationHeight || 0);
        const b = Number(current.nft.nftCoinConfirmationHeight || 0);
        if (a !== b) {
          byName.set(key, a > b ? candidate : current);
          return;
        }
        const ma = Number(candidate.nft.mintHeight || 0);
        const mb = Number(current.nft.mintHeight || 0);
        if (ma !== mb) {
          byName.set(key, ma > mb ? candidate : current);
        }
      }
    });

    return Array.from(byName.values()).sort((x, y) =>
      v ? x.name.localeCompare(y.name) : x.name.localeCompare(y.name),
    );
  }, [nfts, getMetadata, version, synced]);

  return { entries, isLoading: isLoading || initInProgress } as const;
}
