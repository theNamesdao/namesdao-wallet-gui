import type { NFTInfo } from '@chia-network/api';
import { useGetHeightInfoQuery, useGetSyncStatusQuery, useGetDIDsQuery } from '@chia-network/api-react';
import { Flex, Loading } from '@chia-network/core';
import { Trans } from '@lingui/macro';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Box,
  Divider,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material';
import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import useMyNamesdaoNames from '../../hooks/useMyNamesdaoNames';
import { didToDIDId } from '../../util/dids';
import removeHexPrefix from '../../util/removeHexPrefix';
import { GRACE_PERIOD_BLOCKS, formatDotXch } from '../../utils/namesdaoNames';
import NFTMoveToProfileDialog from '../nfts/NFTMoveToProfileDialog';

function underscorePrefixCount(name: string) {
  const m = name.match(/^_+/);
  const count = m ? m[0].length : 0;
  return Math.min(count, 3);
}

function sortByUnderscoreThenAlpha(arr: { name: string; expiryBlock: number }[]) {
  return [...arr].sort((a, b) => {
    const ua = underscorePrefixCount(a.name);
    const ub = underscorePrefixCount(b.name);
    if (ua !== ub) return ua - ub;
    return a.name.localeCompare(b.name);
  });
}

function classifyStatus(currentHeight: number | undefined, expiryBlock: number, synced: boolean) {
  const hasHeight = typeof currentHeight === 'number' && !Number.isNaN(currentHeight) && currentHeight >= 1;
  if (hasHeight) {
    // It is safe to show 'expired' even while syncing since further syncing won't change that state
    if (currentHeight! > expiryBlock + GRACE_PERIOD_BLOCKS) return 'expired';
    if (!synced) return 'unknown';
    if (currentHeight! <= expiryBlock) return 'active';
    if (currentHeight! <= expiryBlock + GRACE_PERIOD_BLOCKS) return 'grace';
    return 'expired';
  }
  return 'unknown';
}

export default function NamesOwnedList() {
  const navigate = useNavigate();
  const { entries, isLoading } = useMyNamesdaoNames();
  const { data: currentHeight, isLoading: isLoadingHeight } = useGetHeightInfoQuery();
  const { data: syncStatus, isLoading: isLoadingSync } = useGetSyncStatusQuery();
  const { data: didWallets } = useGetDIDsQuery();
  const synced = !!syncStatus?.synced;

  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuContext, setMenuContext] = useState<{
    name: string;
    status: 'active' | 'grace' | 'expired' | 'unknown';
  } | null>(null);

  const [configureOpen, setConfigureOpen] = useState(false);
  const [configureUrl, setConfigureUrl] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveNft, setMoveNft] = useState<NFTInfo | null>(null);

  const openMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, name: string, status: 'active' | 'grace' | 'expired' | 'unknown') => {
      event.preventDefault();
      setMenuContext({ name, status });
      setMenuAnchorEl(event.currentTarget);
    },
    [],
  );

  const closeMenu = useCallback(() => {
    setMenuAnchorEl(null);
  }, []);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, name: string, status: 'active' | 'grace' | 'expired' | 'unknown') => {
      openMenu(event, name, status);
    },
    [openMenu],
  );

  const handleRenew = useCallback(() => {
    if (!menuContext) return;
    const n = menuContext.name;
    closeMenu();
    navigate(`/dashboard/names/register/${n}?mode=renew`);
  }, [menuContext, closeMenu, navigate]);

  const handleConfigure = useCallback(() => {
    if (!menuContext) return;
    const { name } = menuContext;
    const entry = entries.find((e) => e.name === name);
    closeMenu();
    if (!entry) return;

    // Determine if owned by one of user's DIDs
    const ownerDidHex = entry.nft.ownerDid || undefined;
    const ownerDidId = ownerDidHex ? didToDIDId(removeHexPrefix(ownerDidHex)) : undefined;
    const didList: any[] = (didWallets as any) || [];
    const userDidIds = new Set<string>(didList.map((w: any) => w.myDid ?? w.mydid).filter(Boolean));

    if (ownerDidId && userDidIds.has(ownerDidId)) {
      // Eligible: open Configure dialog
      setConfigureUrl('https://');
      setConfigureOpen(true);
      return;
    }

    if (didList.length > 0) {
      // Has DID(s) but NFT not owned by a user DID -> prompt move to profile
      setMoveNft(entry.nft);
      setMoveOpen(true);
      return;
    }

    // No DID -> navigate to create profile
    navigate('/dashboard/settings/profiles/add');
  }, [menuContext, closeMenu, entries, didWallets, navigate]);

  const handleMoveToProfile = useCallback(() => {
    if (!menuContext) return;
    const { name } = menuContext;
    const entry = entries.find((e) => e.name === name);
    closeMenu();
    if (!entry) return;
    setMoveNft(entry.nft);
    setMoveOpen(true);
  }, [menuContext, entries, closeMenu]);

  const groups = useMemo(() => {
    const g: Record<string, { name: string; expiryBlock: number }[]> = {
      active: [],
      grace: [],
      expired: [],
      unknown: [],
    };

    entries.forEach((e) => {
      const status = classifyStatus(currentHeight, e.expiryBlock, synced);
      g[status].push({ name: e.name, expiryBlock: e.expiryBlock });
    });

    (Object.keys(g) as (keyof typeof g)[]).forEach((k) => {
      g[k] = sortByUnderscoreThenAlpha(g[k]);
    });
    return g;
  }, [entries, currentHeight, synced]);

  // Only confidently show empty when fully known: not loading, synced, and height > 0
  const isSyncing = !synced || (currentHeight ?? 0) < 1;
  const showLoading = isLoading || isLoadingHeight || isLoadingSync || isSyncing;
  const total = entries.length;
  const canShowEmpty = !showLoading && total === 0;

  return (
    <Box>
      <Typography variant="h6">
        <Trans>Your .xch Names</Trans>
      </Typography>
      {showLoading && (
        <Box mt={1} mb={1}>
          <Loading />
        </Box>
      )}
      {canShowEmpty && (
        <Typography variant="body2" color="textSecondary">
          <Trans>No .xch names found</Trans>
        </Typography>
      )}
      {total > 0 && (
        <Flex flexDirection="column" gap={1.5} mt={1}>
          {groups.active.length > 0 && (
            <Box>
              <Typography variant="subtitle2">
                <Trans>Active</Trans> ({groups.active.length})
              </Typography>
              <Flex flexDirection="column" gap={0.5} mt={0.5}>
                {groups.active.map((it) => (
                  <Flex
                    key={`a-${it.name}`}
                    alignItems="center"
                    justifyContent="space-between"
                    onContextMenu={(e: React.MouseEvent<HTMLElement>) => handleContextMenu(e, it.name, 'active')}
                  >
                    <Typography variant="body2">{formatDotXch(it.name)}</Typography>
                    <IconButton
                      aria-label="more"
                      size="small"
                      onClick={(e: React.MouseEvent<HTMLElement>) => openMenu(e, it.name, 'active')}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Flex>
                ))}
              </Flex>
            </Box>
          )}

          {groups.grace.length > 0 && (
            <>
              {groups.active.length > 0 && <Divider sx={{ my: 1 }} />}
              <Box>
                <Typography variant="subtitle2">
                  <Trans>Expired (grace period)</Trans> ({groups.grace.length})
                </Typography>
                <Flex flexDirection="column" gap={0.5} mt={0.5}>
                  {groups.grace.map((it) => (
                    <Flex
                      key={`g-${it.name}`}
                      alignItems="center"
                      justifyContent="space-between"
                      onContextMenu={(e: React.MouseEvent<HTMLElement>) => handleContextMenu(e, it.name, 'grace')}
                    >
                      <Typography variant="body2">{formatDotXch(it.name)}</Typography>
                      <IconButton
                        aria-label="more"
                        size="small"
                        onClick={(e: React.MouseEvent<HTMLElement>) => openMenu(e, it.name, 'grace')}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            </>
          )}

          {groups.expired.length > 0 && (
            <>
              {(groups.active.length > 0 || groups.grace.length > 0) && <Divider sx={{ my: 1 }} />}
              <Box>
                <Typography variant="subtitle2">
                  <Trans>Expired</Trans> ({groups.expired.length})
                </Typography>
                <Flex flexDirection="column" gap={0.5} mt={0.5}>
                  {groups.expired.map((it) => (
                    <Flex
                      key={`e-${it.name}`}
                      alignItems="center"
                      justifyContent="space-between"
                      onContextMenu={(e: React.MouseEvent<HTMLElement>) => handleContextMenu(e, it.name, 'expired')}
                    >
                      <Typography variant="body2">{formatDotXch(it.name)}</Typography>
                      <IconButton
                        aria-label="more"
                        size="small"
                        onClick={(e: React.MouseEvent<HTMLElement>) => openMenu(e, it.name, 'expired')}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            </>
          )}

          {groups.unknown.length > 0 && (
            <>
              {(groups.active.length > 0 || groups.grace.length > 0 || groups.expired.length > 0) && (
                <Divider sx={{ my: 1 }} />
              )}
              <Box>
                <Typography variant="subtitle2">
                  <Trans>Syncing</Trans> ({groups.unknown.length})
                </Typography>
                <Flex flexDirection="column" gap={0.5} mt={0.5}>
                  {groups.unknown.map((it) => (
                    <Typography key={`u-${it.name}`} variant="body2">
                      {formatDotXch(it.name)}
                    </Typography>
                  ))}
                </Flex>
              </Box>
            </>
          )}
        </Flex>
      )}

      <Menu
        anchorEl={menuAnchorEl}
        open={!!menuAnchorEl}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {menuContext?.status === 'active' && (
          <>
            <MenuItem onClick={handleConfigure} aria-label="configure-xch-limo">
              <Trans>Configure .xch.limo Website</Trans>
            </MenuItem>
            <MenuItem onClick={handleMoveToProfile} aria-label="move-to-profile">
              <Trans>Move to Profile</Trans>
            </MenuItem>
          </>
        )}
        {(menuContext?.status === 'grace' || menuContext?.status === 'expired') && (
          <MenuItem onClick={handleRenew} aria-label="renew-name">
            <Trans>Renew</Trans>
          </MenuItem>
        )}
      </Menu>

      <Dialog open={configureOpen} onClose={() => setConfigureOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Trans>Configure .xch.limo Website</Trans>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={<Trans>Website URL</Trans>}
            value={configureUrl}
            onChange={(e) => setConfigureUrl(e.target.value)}
            placeholder="https://example.com"
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigureOpen(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button onClick={() => setConfigureOpen(false)} variant="contained" color="primary" disabled>
            <Trans>Save</Trans>
          </Button>
        </DialogActions>
      </Dialog>

      <NFTMoveToProfileDialog open={moveOpen} onClose={() => setMoveOpen(false)} nfts={moveNft ? [moveNft] : []} />
    </Box>
  );
}
