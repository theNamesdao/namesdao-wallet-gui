import type { NFTInfo } from '@chia-network/api';
import {
  useGetDIDsQuery,
  useCreateNewWalletMutation,
  useSetNFTDIDMutation,
  useGetNFTInfoQuery,
  useGetDIDMetadataQuery,
  useUpdateDIDMetadataMutation,
  useGetTransactionAsyncMutation,
} from '@chia-network/api-react';
import { Form, Flex, EstimatedFee, chiaToMojo } from '@chia-network/core';
import { Trans, t } from '@lingui/macro';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stepper,
  Step,
  StepLabel,
  Typography,
  TextField,
  CircularProgress,
} from '@mui/material';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';

import { didToDIDId, didFromDIDId } from '../../util/dids';
import removeHexPrefix from '../../util/removeHexPrefix';
import { clampMinFeeMojo, MIN_FEE_XCH } from '../../utils/fees';
import {
  parseNamesdaoString,
  serializeNamesdao,
  normalizeHostname,
  mergeName,
  getHostnameForName,
  verifyNameConfigured,
} from '../../utils/namesdaoDns';
import { checkNFTAssignedToDID } from '../../utils/transactionConfirmation';

type XchLimoSetupDialogProps = {
  open: boolean;
  onClose: () => void;
  name: string;
  nft: NFTInfo;
};

type SetupStep =
  | 'create-did'
  | 'confirm-did'
  | 'assign-nft'
  | 'confirm-assign'
  | 'configure-website'
  | 'confirm-config-1'
  | 'confirm-config-2'
  | 'complete';

type CreateDIDFormData = {
  name: string;
  amount: string;
  fee: string;
};

export default function XchLimoSetupDialog({ open, onClose, name, nft }: XchLimoSetupDialogProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>('create-did');
  const [isCreating, setIsCreating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Transaction confirmation states
  const [nftTransactionId, setNftTransactionId] = useState<string | null>(null);
  const [createdDIDId, setCreatedDIDId] = useState<string | null>(null);
  const [selectedDIDId, setSelectedDIDId] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string>('');

  const {
    data: didWallets,
    refetch: refetchDIDs,
    isLoading: isDIDsLoading,
    isFetching: isDIDsFetching,
  } = useGetDIDsQuery(undefined as any);
  const [createWallet] = useCreateNewWalletMutation();
  const [setNFTDID] = useSetNFTDIDMutation();

  // Live NFT info polling while confirming assignment
  const coinIdNoPrefix = nft && nft.nftCoinId ? removeHexPrefix(nft.nftCoinId) : '';
  const { data: liveNFTInfo, refetch: refetchNFTInfo } = useGetNFTInfoQuery({ coinId: coinIdNoPrefix } as any, {
    skip: !(nft && nft.nftCoinId),
    pollingInterval: 0,
  });

  // (removed) Transaction confirmation hooks were unused after switching to explicit polling

  const createDIDForm = useForm<CreateDIDFormData>({
    defaultValues: {
      name: `${name}.xch Profile`,
      amount: '0.000001',
      fee: MIN_FEE_XCH,
    },
  });

  const websiteForm = useForm({
    defaultValues: {
      url: 'https://',
      fee: MIN_FEE_XCH,
    },
  });

  const resolveExistingHost = useCallback((model: any, nameToCheck: string): string | undefined => {
    const fqdnFor = (nm: string) => (nm && nm.endsWith('.xch') ? nm : `${nm}.xch`);
    const candidates: string[] = [];
    const primary = fqdnFor(nameToCheck);
    candidates.push(primary);
    if (nameToCheck && nameToCheck.endsWith('.xch')) {
      const without = nameToCheck.replace(/\.xch$/, '');
      if (without) candidates.push(without);
    } else if (nameToCheck) {
      candidates.push(nameToCheck);
    }
    for (const key of candidates) {
      const h = getHostnameForName(model, key);
      if (h) return h;
    }
    return undefined;
  }, []);

  // Ensure fee defaults to 1 mojo if missing when entering steps
  useEffect(() => {
    if (open && currentStep === 'create-did') {
      const v = createDIDForm.getValues('fee' as any) as any;
      if (!v) createDIDForm.setValue('fee' as any, MIN_FEE_XCH as any, { shouldDirty: false } as any);
    }
  }, [open, currentStep, createDIDForm]);

  useEffect(() => {
    if (open && currentStep === 'configure-website') {
      const v = websiteForm.getValues('fee' as any) as any;
      if (!v) websiteForm.setValue('fee' as any, MIN_FEE_XCH as any, { shouldDirty: false } as any);
    }
  }, [open, currentStep, websiteForm]);

  // Helper: determine if the NFT owner DID (hex) belongs to the current wallet DIDs
  const ownedByUser = (ownerDidMaybe: string | undefined, walletsMaybe: any[] | undefined): boolean => {
    if (!ownerDidMaybe || !walletsMaybe || walletsMaybe.length === 0) return false;
    // If owner is already bech32 did:chia, compare directly
    if (ownerDidMaybe.startsWith('did:chia:')) {
      const bech = ownerDidMaybe;
      if (walletsMaybe.some((w: any) => (w.myDid ?? w.mydid) === bech)) return true;
      // Decode wallet bech32 to hex and compare to owner hex (decoded)
      const ownerHexFromBech = didFromDIDId(bech);
      if (!ownerHexFromBech) return false;
      const userHexesFromBech = new Set<string>(
        walletsMaybe
          .map((w: any) => w.myDid ?? w.mydid)
          .filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
          .map((didId: string) => didFromDIDId(didId))
          .filter((x: string | undefined): x is string => typeof x === 'string' && x.length > 0)
          .map((hex: string) => removeHexPrefix(hex).toLowerCase()),
      );
      return userHexesFromBech.has(removeHexPrefix(ownerHexFromBech).toLowerCase());
    }
    // Otherwise treat as hex and derive bech32 for fast compare
    const ownerHex = removeHexPrefix(ownerDidMaybe).toLowerCase();
    const ownerBech = didToDIDId(ownerHex);
    if (walletsMaybe.some((w: any) => (w.myDid ?? w.mydid) === ownerBech)) return true;
    // Fallback: decode wallet bech32 to hex and compare
    const userHexes = new Set<string>(
      walletsMaybe
        .map((w: any) => w.myDid ?? w.mydid)
        .filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
        .map((didId: string) => didFromDIDId(didId))
        .filter((x: string | undefined): x is string => typeof x === 'string' && x.length > 0)
        .map((hex: string) => removeHexPrefix(hex).toLowerCase()),
    );
    return userHexes.has(ownerHex);
  };

  // Resolve owner DID walletId from NFT owner (prefer live info, fallback to nft, then minter DID)
  const sourceForOwner: any = (liveNFTInfo ?? nft) as any;
  const ownerDidMaybe = sourceForOwner?.ownerDid || sourceForOwner?.minterDid || undefined;
  let ownerBech: string | undefined;
  if (typeof ownerDidMaybe === 'string' && ownerDidMaybe.startsWith('did:chia:')) {
    ownerBech = ownerDidMaybe;
  } else if (ownerDidMaybe) {
    ownerBech = didToDIDId(removeHexPrefix(ownerDidMaybe));
  } else {
    ownerBech = undefined;
  }
  const didListAny: any[] = didWallets || [];
  const ownerWallet = didListAny.find((w: any) => (w.myDid ?? w.mydid) === ownerBech);
  const ownerWalletId: number | undefined = ownerWallet?.id;

  // DID metadata hooks
  const { data: didMetadata, refetch: refetchDIDMetadata } = useGetDIDMetadataQuery(
    { walletId: ownerWalletId as any },
    { skip: !ownerWalletId },
  );
  const [updateDIDMetadata] = useUpdateDIDMetadataMutation();
  const [getTransactionAsync] = useGetTransactionAsyncMutation();

  useEffect(() => {
    if (!open) return;
    if (currentStep !== 'configure-website') return;
    if (ownerWalletId) refetchDIDMetadata();
  }, [open, currentStep, ownerWalletId, refetchDIDMetadata]);

  // Pending config state
  const [pendingNamesdao, setPendingNamesdao] = useState<string | null>(null);
  const [pendingHost, setPendingHost] = useState<string | null>(null);
  const [pendingFeeMojo, setPendingFeeMojo] = useState<string | null>(null);
  const [pendingTxIds1, setPendingTxIds1] = useState<string[] | null>(null);
  const [pendingTxIds2, setPendingTxIds2] = useState<string[] | null>(null);
  const [onChainHost, setOnChainHost] = useState<string | null>(null);

  // Prefill URL from on-chain metadata when entering configure step (after metadata is available)
  useEffect(() => {
    if (!open) return;
    if (currentStep !== 'configure-website') return;
    const namesdaoStr: string | undefined = (didMetadata as any)?.metadata?.namesdao;
    const model = parseNamesdaoString(namesdaoStr);
    const existingHost = resolveExistingHost(model, name);
    setOnChainHost(existingHost ?? null);
    const fieldState = websiteForm.getFieldState('url' as any);
    if (!fieldState?.isDirty) {
      if (existingHost) {
        const currentVal = websiteForm.getValues('url' as any) as any;
        if (currentVal !== `https://${existingHost}`) {
          websiteForm.setValue('url' as any, `https://${existingHost}` as any, { shouldDirty: false } as any);
        }
      } else {
        const currentVal = websiteForm.getValues('url' as any) as any;
        if (!currentVal) websiteForm.setValue('url' as any, 'https://' as any, { shouldDirty: false } as any);
      }
    }
  }, [open, currentStep, didMetadata, name, websiteForm, resolveExistingHost, setOnChainHost]);

  // Handle DID transaction confirmation (explicit 10s refetch loop)
  useEffect(() => {
    let cancelled = false;
    let intervalId: any | null = null;

    const tick = async () => {
      if (!open) return;
      try {
        const didRes: any = await refetchDIDs();
        const currentDIDs: any[] = (didRes as any)?.data || didWallets || [];

        if (currentDIDs.length > 0 && !cancelled) {
          setCurrentStep('assign-nft');
          setCreatedDIDId(null);
          setConfirmationMessage('');
        } else if (!cancelled) {
          if (currentStep === 'confirm-did' && createdDIDId === 'pending') {
            setConfirmationMessage('Waiting for DID to appear in wallet...');
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error checking DID creation:', err);
          setError('Failed to verify DID creation');
        }
      }
    };

    if (open && currentStep === 'confirm-did' && createdDIDId === 'pending') {
      tick();
      intervalId = setInterval(tick, 10_000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [open, currentStep, createdDIDId, didWallets, refetchDIDs]);

  // Handle NFT assignment confirmation (explicit 10s refetch loop)
  useEffect(() => {
    let cancelled = false;
    let intervalId: any | null = null;

    const tick = async () => {
      if (!open) return;
      try {
        const nftRes = await refetchNFTInfo();
        await refetchDIDs();
        const sourceNFT: any = (nftRes as any)?.data ?? liveNFTInfo ?? nft;
        const isAssigned = selectedDIDId ? checkNFTAssignedToDID(sourceNFT, selectedDIDId) : false;

        if (isAssigned && !cancelled) {
          setCurrentStep('configure-website');
          setNftTransactionId(null);
          setSelectedDIDId(null);
          setConfirmationMessage('');
        } else if (!cancelled) {
          if (currentStep === 'confirm-assign' && selectedDIDId) {
            setConfirmationMessage('Waiting for NFT assignment to confirm on blockchain...');
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error checking NFT assignment:', err);
          setError('Failed to verify NFT assignment');
        }
      }
    };

    if (open && currentStep === 'confirm-assign' && selectedDIDId) {
      tick();
      intervalId = setInterval(tick, 10_000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [open, currentStep, selectedDIDId, nft, liveNFTInfo, refetchNFTInfo, refetchDIDs]);

  // Safeguard: if a DID selection is active but UI shows assign menu, switch to confirmation
  useEffect(() => {
    if (selectedDIDId && currentStep === 'assign-nft') {
      setCurrentStep('confirm-assign');
      if (!confirmationMessage) {
        setConfirmationMessage('Submitting transaction...');
      }
    }
  }, [selectedDIDId, currentStep, confirmationMessage]);

  // Fallback: if DIDs are present and we are still on the first step, advance to next step
  useEffect(() => {
    if (!open) return;
    if (
      currentStep === 'create-did' &&
      Array.isArray(didWallets) &&
      didWallets.length > 0 &&
      !isCreating &&
      !isAssigning &&
      createdDIDId !== 'pending' &&
      !selectedDIDId
    ) {
      const source = (liveNFTInfo ?? nft) as any;
      const ownerDidMaybeLocal = source?.ownerDid || source?.minterDid;
      if (ownedByUser(ownerDidMaybeLocal, didWallets)) {
        setCurrentStep('configure-website');
      }
      // Do not force 'assign-nft' here; let init() decide after fresh refetch
    }
  }, [open, currentStep, didWallets, isCreating, isAssigning, createdDIDId, selectedDIDId, liveNFTInfo, nft]);

  // Auto-promote: if we are on 'assign-nft' but the NFT is already owned by one of user's DIDs (after live refetch), skip to configure-website
  useEffect(() => {
    if (!open) return;
    if (currentStep !== 'assign-nft') return;
    if (isAssigning) return;
    if (!Array.isArray(didWallets) || didWallets.length === 0) return;
    const source = (liveNFTInfo ?? nft) as any;
    const ownerDidMaybeLocal = source?.ownerDid || source?.minterDid;
    if (ownedByUser(ownerDidMaybeLocal, didWallets)) {
      setCurrentStep('configure-website');
    }
  }, [open, currentStep, isAssigning, didWallets, liveNFTInfo, nft]);

  // Determine initial step based on current state (run once per open; do not override while confirming or submitting)
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!open) {
        initializedRef.current = false; // reset when dialog closes
        return;
      }
      // Don't auto-change steps while we're in a confirmation state or submitting
      if (
        currentStep === 'confirm-did' ||
        currentStep === 'confirm-assign' ||
        isAssigning ||
        isCreating ||
        createdDIDId === 'pending' ||
        selectedDIDId
      ) {
        return;
      }
      // Only compute once when dialog opens
      if (initializedRef.current) return;
      // Wait for DID list to load to avoid prematurely locking 'create-did'
      if (isDIDsLoading || isDIDsFetching) return;

      try {
        // Refresh DID list and latest NFT owner before deciding
        const didsRes: any = await refetchDIDs();
        const didList: any[] | undefined = (didsRes as any)?.data ?? didWallets;
        // Wait until DID data is loaded at least once
        if (didList === undefined) {
          return;
        }
        const nftRes = await refetchNFTInfo();
        const sourceNFT: any = (nftRes as any)?.data ?? liveNFTInfo ?? nft;
        const ownerDidHexLocal = sourceNFT?.ownerDid || sourceNFT?.minterDid || undefined;

        let nextStep: SetupStep;
        if (ownedByUser(ownerDidHexLocal, didList)) {
          nextStep = 'configure-website';
        } else if (didList.length > 0) {
          nextStep = 'assign-nft';
        } else {
          nextStep = 'create-did';
        }

        if (!cancelled) {
          initializedRef.current = true;
          if (currentStep !== nextStep) setCurrentStep(nextStep);
        }
      } catch (e) {
        if (!cancelled) {
          // Do not lock initialization on error; let it retry when data becomes available
        }
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    nft,
    didWallets,
    currentStep,
    isAssigning,
    isCreating,
    createdDIDId,
    selectedDIDId,
    refetchNFTInfo,
    liveNFTInfo,
    refetchDIDs,
    isDIDsLoading,
    isDIDsFetching,
  ]);

  const handleCreateDID = async (data: CreateDIDFormData) => {
    setIsCreating(true);
    setError(null);

    try {
      const feeInMojos = clampMinFeeMojo(chiaToMojo(data.fee || 0));

      const result = await createWallet({
        walletType: 'did_wallet',
        options: {
          did_type: 'new',
          backupDids: [],
          numOfBackupIdsNeeded: 0,
          name: data.name,
          amount: chiaToMojo(data.amount),
          fee: Number(feeInMojos),
        },
      }).unwrap();

      // Wallet creation submitted, extract DID ID from result
      if (result) {
        // The DID creation response structure varies, so we'll use a generic approach
        // The actual DID ID will be available when we refetch the DID wallets
        setCreatedDIDId('pending'); // Use placeholder until we can get the real DID ID

        // Start confirmation process
        setCurrentStep('confirm-did');
        setConfirmationMessage('Creating DID profile on blockchain...');

        // Refetch DIDs to get the updated list with the new DID
        await refetchDIDs();
      } else {
        throw new Error('No response returned from DID creation');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create profile. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleAssignNFT = async (selectedDidId: string) => {
    setIsAssigning(true);
    setError(null);

    // Immediately switch to confirmation view so user sees waiting state
    setSelectedDIDId(selectedDidId); // already bech32 did:chia:
    setCurrentStep('confirm-assign');
    setConfirmationMessage('Submitting transaction...');

    try {
      const feeInMojos = clampMinFeeMojo(chiaToMojo('0'));
      const nftCoinIdRaw = nft && nft.nftCoinId ? nft.nftCoinId : '';
      if (!nftCoinIdRaw) {
        throw new Error('Missing NFT coin ID');
      }
      await setNFTDID({
        walletId: (nft as any).walletId || 1,
        nftCoinIds: [removeHexPrefix(nftCoinIdRaw)],
        did: selectedDidId,
        fee: feeInMojos,
      });

      // After submit succeeds, inform user we are waiting for on-chain confirmation
      setConfirmationMessage('Waiting for NFT assignment to confirm on blockchain...');
    } catch (err: any) {
      setError(err?.message || 'Failed to assign name to profile. Please try again.');
      // Return user to selection if submit failed
      setCurrentStep('assign-nft');
    } finally {
      setIsAssigning(false);
    }
  };

  // (removed duplicate initial-step effect)

  // Confirm Config 1: wait for first tx confirmation (via tx ids), then submit second tx
  useEffect(() => {
    let cancelled = false;
    let intervalId: any | null = null;
    const fqdn = `${name}.xch`;

    const tick = async () => {
      if (!open) return;
      try {
        let firstConfirmed = false;
        if (pendingTxIds1 && pendingTxIds1.length > 0) {
          const results = await Promise.all(
            pendingTxIds1.map((txId) =>
              getTransactionAsync({ transactionId: txId })
                .unwrap()
                .catch(() => null),
            ),
          );
          if (cancelled) return;
          const confirmedCount = results.reduce((acc: number, tx: any) => {
            const ok = tx && (tx.confirmed || (typeof tx?.confirmedAtHeight === 'number' && tx.confirmedAtHeight > 0));
            return acc + (ok ? 1 : 0);
          }, 0);
          firstConfirmed = confirmedCount === pendingTxIds1.length;
          if (!firstConfirmed && currentStep === 'confirm-config-1') {
            setConfirmationMessage(
              `${t`Waiting for on-chain confirmation (first transaction)` as any}: ${confirmedCount}/${
                pendingTxIds1.length
              } confirmed...`,
            );
          }
        } else {
          // Fallback to metadata verification if tx ids are unavailable
          const metaRes: any = await refetchDIDMetadata();
          const latest = (metaRes as any)?.data ?? didMetadata;
          const namesdaoStr: string | undefined = (latest as any)?.metadata?.namesdao;
          const model = parseNamesdaoString(namesdaoStr);
          firstConfirmed = pendingHost ? verifyNameConfigured(model, fqdn, pendingHost) : false;
          if (!firstConfirmed && currentStep === 'confirm-config-1') {
            setConfirmationMessage(t`Waiting for on-chain confirmation (first transaction)...` as any);
          }
        }

        if (firstConfirmed && !cancelled && ownerWalletId && pendingNamesdao) {
          setConfirmationMessage(t`Submitting configuration (2/2)...` as any);
          const res2: any = await updateDIDMetadata({
            walletId: ownerWalletId,
            metadata: { namesdao: pendingNamesdao },
            fee: Number(clampMinFeeMojo(pendingFeeMojo || '0')),
            reusePuzhash: false,
          }).unwrap();
          const txIds2: string[] = Array.isArray(res2?.transactions)
            ? res2.transactions.map((tx: any) => tx?.name).filter(Boolean)
            : [];
          setPendingTxIds2(txIds2.length ? txIds2 : null);
          setCurrentStep('confirm-config-2');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error checking configuration:', err);
          setError('Failed to verify configuration');
        }
      }
    };

    if (open && currentStep === 'confirm-config-1' && ownerWalletId && pendingHost) {
      tick();
      intervalId = setInterval(tick, 10_000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    open,
    currentStep,
    ownerWalletId,
    pendingHost,
    pendingNamesdao,
    pendingFeeMojo,
    pendingTxIds1,
    name,
    refetchDIDMetadata,
    didMetadata,
    updateDIDMetadata,
    getTransactionAsync,
  ]);

  // Confirm Config 2: wait for second tx confirmation (via tx ids)
  useEffect(() => {
    let cancelled = false;
    let intervalId: any | null = null;
    const fqdn = `${name}.xch`;

    const tick = async () => {
      if (!open) return;
      try {
        let secondConfirmed = false;
        if (pendingTxIds2 && pendingTxIds2.length > 0) {
          const results = await Promise.all(
            pendingTxIds2.map((txId) =>
              getTransactionAsync({ transactionId: txId })
                .unwrap()
                .catch(() => null),
            ),
          );
          if (cancelled) return;
          const confirmedCount = results.reduce((acc: number, tx: any) => {
            const ok = tx && (tx.confirmed || (typeof tx?.confirmedAtHeight === 'number' && tx.confirmedAtHeight > 0));
            return acc + (ok ? 1 : 0);
          }, 0);
          secondConfirmed = confirmedCount === pendingTxIds2.length;
          if (!secondConfirmed && currentStep === 'confirm-config-2') {
            setConfirmationMessage(
              `${t`Waiting for on-chain confirmation (second transaction)` as any}: ${confirmedCount}/${
                pendingTxIds2.length
              } confirmed...`,
            );
          }
        } else {
          // Fallback to metadata verification if tx ids are unavailable
          const metaRes: any = await refetchDIDMetadata();
          const latest = (metaRes as any)?.data ?? didMetadata;
          const namesdaoStr: string | undefined = (latest as any)?.metadata?.namesdao;
          const model = parseNamesdaoString(namesdaoStr);
          secondConfirmed = pendingHost ? verifyNameConfigured(model, fqdn, pendingHost) : false;
          if (!secondConfirmed && currentStep === 'confirm-config-2') {
            setConfirmationMessage(t`Waiting for on-chain confirmation (second transaction)...` as any);
          }
        }

        if (secondConfirmed && !cancelled) {
          setCurrentStep('complete');
          setConfirmationMessage('');
          setPendingNamesdao(null);
          setPendingHost(null);
          setPendingFeeMojo(null);
          setPendingTxIds1(null);
          setPendingTxIds2(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error checking configuration:', err);
          setError('Failed to verify configuration');
        }
      }
    };

    if (open && currentStep === 'confirm-config-2' && ownerWalletId && pendingHost) {
      tick();
      intervalId = setInterval(tick, 10_000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    open,
    currentStep,
    ownerWalletId,
    pendingHost,
    name,
    refetchDIDMetadata,
    didMetadata,
    pendingTxIds2,
    getTransactionAsync,
  ]);

  // Reset state when dialog closes to avoid acting as if a transaction was submitted
  useEffect(() => {
    if (!open) {
      setCurrentStep('create-did');
      setIsCreating(false);
      setIsAssigning(false);
      setError(null);
      setConfirmationMessage('');
      setNftTransactionId(null);
      setCreatedDIDId(null);
      setSelectedDIDId(null);
      setPendingNamesdao(null);
      setPendingHost(null);
      setPendingFeeMojo(null);
      setOnChainHost(null);
      // Reset website form so prefill logic can apply on next open
      websiteForm.reset({ url: 'https://', fee: MIN_FEE_XCH } as any, { keepDirty: false } as any);
      initializedRef.current = false;
    }
  }, [open, websiteForm]);

  const getStepContent = () => {
    switch (currentStep) {
      case 'create-did': {
        return (
          <Box>
            <Typography variant="body1" gutterBottom>
              <Trans>
                To configure <strong>{name}.xch.limo</strong>, you need a Chia Profile (DID). This will be your
                decentralized identity for managing website links.
              </Trans>
            </Typography>
            <Box mt={3}>
              <Form methods={createDIDForm} onSubmit={handleCreateDID}>
                <Flex flexDirection="column" gap={2}>
                  <TextField
                    fullWidth
                    label={<Trans>Profile Name</Trans>}
                    {...createDIDForm.register('name')}
                    helperText={t`This name helps you identify your profile in the wallet`}
                  />
                  <TextField
                    fullWidth
                    label={<Trans>Deposit Amount (XCH)</Trans>}
                    {...createDIDForm.register('amount')}
                    disabled
                    helperText={t`Minimum amount required to create a profile`}
                  />
                  <EstimatedFee
                    id="filled-secondary"
                    variant="filled"
                    name="fee"
                    color="secondary"
                    label={<Trans>Network Fee (XCH)</Trans>}
                    disabled={isCreating}
                    txType="createDID"
                    helperText={t`Fee for processing the transaction`}
                  />
                  {error && <Alert severity="error">{error}</Alert>}
                  <Flex gap={2}>
                    <Button onClick={onClose}>
                      <Trans>Cancel</Trans>
                    </Button>
                    <Button type="submit" variant="contained" disabled={isCreating}>
                      <Trans>Create Profile</Trans>
                    </Button>
                  </Flex>
                </Flex>
              </Form>
            </Box>
          </Box>
        );
      }
      case 'confirm-did': {
        return (
          <Box>
            <Typography variant="body1" gutterBottom>
              <Trans>Creating your DID profile on the blockchain...</Trans>
            </Typography>
            <Box mt={3} display="flex" flexDirection="column" alignItems="center" gap={2}>
              <CircularProgress size={40} />
              <Typography variant="body2" color="text.secondary" align="center">
                {confirmationMessage}
              </Typography>
              {/* Removed transaction id display as it was unused */}
              <Alert severity="info">
                <Trans>
                  Please wait while your DID profile is being created on the blockchain. This typically takes 1-2
                  minutes.
                </Trans>
              </Alert>
            </Box>
          </Box>
        );
      }
      case 'assign-nft': {
        return (
          <Box>
            <Typography variant="body1" gutterBottom>
              <Trans>
                Now we'll link <strong>{name}.xch</strong> to your profile. This allows your profile to manage the
                website settings for this name.
              </Trans>
            </Typography>
            <Box mt={3}>
              <Typography variant="subtitle2" gutterBottom>
                <Trans>Select Profile:</Trans>
              </Typography>
              <Flex flexDirection="column" gap={1}>
                {(didWallets || []).map((wallet: any) => (
                  <Button
                    key={wallet.id}
                    variant="outlined"
                    onClick={() => handleAssignNFT(wallet.myDid ?? wallet.mydid)}
                    disabled={isAssigning}
                    sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    <Box>
                      <Typography variant="body2">{wallet.name}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {wallet.myDid || wallet.mydid || ''}
                      </Typography>
                    </Box>
                  </Button>
                ))}
              </Flex>
              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
              <Flex gap={2} sx={{ mt: 3 }}>
                <Button onClick={onClose}>
                  <Trans>Cancel</Trans>
                </Button>
              </Flex>
            </Box>
          </Box>
        );
      }
      case 'confirm-assign': {
        return (
          <Box>
            <Typography variant="body1" gutterBottom>
              <Trans>Assigning {name}.xch to your DID profile...</Trans>
            </Typography>
            <Box mt={3} display="flex" flexDirection="column" alignItems="center" gap={2}>
              <CircularProgress size={40} />
              <Typography variant="body2" color="text.secondary" align="center">
                {confirmationMessage}
              </Typography>
              {nftTransactionId && (
                <Typography variant="caption" color="text.secondary" align="center">
                  <Trans>Transaction ID: {nftTransactionId}</Trans>
                </Typography>
              )}
              <Alert severity="info">
                <Trans>
                  Please wait while your name is being assigned to your DID profile. This typically takes 1-2 minutes.
                </Trans>
              </Alert>
            </Box>
          </Box>
        );
      }
      case 'configure-website': {
        // Verify prerequisites (owner DID belongs to one of user's DIDs)
        const source = (liveNFTInfo ?? nft) as any;
        const ownerDidHexLocal = (source?.ownerDid ?? source?.minterDid) || undefined;
        if (didWallets === undefined) {
          return null; // DIDs not loaded yet
        }
        const didListLocal: any[] = didWallets || [];
        if (!didListLocal.length || !ownedByUser(ownerDidHexLocal, didListLocal)) {
          if (!didListLocal.length) setCurrentStep('create-did');
          else setCurrentStep('assign-nft');
          return null;
        }

        // Prefill
        const namesdaoStr: string | undefined = (didMetadata as any)?.metadata?.namesdao;
        const model = parseNamesdaoString(namesdaoStr);
        const fqdn = name && name.endsWith('.xch') ? name : `${name}.xch`;
        const existingHost = getHostnameForName(model, fqdn);
        const effectiveHost = onChainHost ?? existingHost;
        if (existingHost) {
          const currentVal = websiteForm.getValues('url');
          if (!currentVal || currentVal === 'https://') websiteForm.setValue('url', `https://${existingHost}`);
        }

        return (
          <Box>
            <Typography variant="body1" gutterBottom>
              <Trans>
                Great! Your profile is ready. Now configure the website URL for <strong>{name}.xch.limo</strong>.
              </Trans>
            </Typography>
            <Box mt={3}>
              {effectiveHost && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Trans>Currently on-chain:</Trans> {`https://${effectiveHost}`}
                </Alert>
              )}
              <Form
                methods={websiteForm}
                onSubmit={async (data: any) => {
                  try {
                    setError(null);
                    const normalized = normalizeHostname(data.url || '');
                    if (!normalized) throw new Error(t`Please enter a valid URL or hostname` as any);
                    if (!ownerWalletId) throw new Error(t`Missing profile wallet` as any);
                    const feeMojo = clampMinFeeMojo(chiaToMojo(data.fee || MIN_FEE_XCH));
                    const current = parseNamesdaoString((didMetadata as any)?.metadata?.namesdao);
                    const merged = mergeName(current, fqdn, normalized);
                    const payload = serializeNamesdao(merged);
                    setPendingNamesdao(payload);
                    setPendingHost(normalized);
                    setPendingFeeMojo(feeMojo.toString());
                    // Provide instant feedback while awaiting wallet and RPC
                    setCurrentStep('confirm-config-1');
                    setConfirmationMessage(t`Submitting configuration (1/2)...` as any);
                    // Submit first tx
                    const res1: any = await updateDIDMetadata({
                      walletId: ownerWalletId,
                      metadata: { namesdao: payload },
                      fee: Number(feeMojo),
                      reusePuzhash: false,
                    }).unwrap();
                    const txIds1: string[] = Array.isArray(res1?.transactions)
                      ? res1.transactions.map((tx: any) => tx?.name).filter(Boolean)
                      : [];
                    setPendingTxIds1(txIds1.length ? txIds1 : null);
                    setConfirmationMessage(t`Waiting for on-chain confirmation (first transaction)...` as any);
                  } catch (e: any) {
                    setError(e?.message || (t`Failed to submit configuration` as any));
                    setCurrentStep('configure-website');
                  }
                }}
              >
                <Flex flexDirection="column" gap={2}>
                  <TextField
                    fullWidth
                    label={<Trans>Website URL</Trans>}
                    {...websiteForm.register('url')}
                    placeholder="https://example.com"
                    helperText={t`Enter the URL where your website is hosted`}
                  />
                  <EstimatedFee
                    id="filled-secondary"
                    variant="filled"
                    name="fee"
                    color="secondary"
                    label={<Trans>Network Fee (XCH)</Trans>}
                    txType="updateDIDMetadata"
                    helperText={t`This action will submit two transactions; the fee applies twice`}
                  />
                  <Alert severity="info">
                    <Trans>
                      This will create a DNS record that points {name}.xch.limo to your website. Two transactions will
                      be submitted (1/2 and 2/2), each with the selected network fee. The configuration is stored
                      on-chain and can be updated anytime.
                    </Trans>
                  </Alert>
                  <Flex gap={2}>
                    <Button onClick={onClose}>
                      <Trans>Cancel</Trans>
                    </Button>
                    <Button type="submit" variant="contained" disabled={!ownerWalletId}>
                      <Trans>Save Configuration</Trans>
                    </Button>
                  </Flex>
                </Flex>
              </Form>
            </Box>
          </Box>
        );
      }
      case 'confirm-config-1': {
        return (
          <Box>
            <Typography variant="body1" gutterBottom>
              <Trans>Configuring {name}.xch.limo (1/2)...</Trans>
            </Typography>
            <Box mt={3} display="flex" flexDirection="column" alignItems="center" gap={2}>
              <CircularProgress size={40} />
              <Typography variant="body2" color="text.secondary" align="center">
                {confirmationMessage}
              </Typography>
              <Alert severity="info">
                <Trans>Waiting for on-chain confirmation (first transaction). This typically takes 1-2 minutes.</Trans>
                <br />
                <Trans>After it confirms, you will be prompted to approve the second transaction.</Trans>
              </Alert>
            </Box>
          </Box>
        );
      }
      case 'confirm-config-2': {
        return (
          <Box>
            <Typography variant="body1" gutterBottom>
              <Trans>Configuring {name}.xch.limo (2/2)...</Trans>
            </Typography>
            <Box mt={3} display="flex" flexDirection="column" alignItems="center" gap={2}>
              <CircularProgress size={40} />
              <Typography variant="body2" color="text.secondary" align="center">
                {confirmationMessage}
              </Typography>
              <Alert severity="info">
                <Trans>Waiting for on-chain confirmation (second transaction). This typically takes 1-2 minutes.</Trans>
              </Alert>
            </Box>
          </Box>
        );
      }
      case 'complete': {
        // Show final success with current configured host
        const namesdaoStr: string | undefined = (didMetadata as any)?.metadata?.namesdao;
        const model = parseNamesdaoString(namesdaoStr);
        const fqdn = `${name}.xch`;
        const existingHost = getHostnameForName(model, fqdn) || pendingHost;
        return (
          <Box>
            <Typography variant="body1" gutterBottom>
              <Trans>Configuration complete</Trans>
            </Typography>
            <Alert severity="success" sx={{ mb: 2 }}>
              <Trans>{name}.xch.limo is configured.</Trans>
              {existingHost ? ` → https://${existingHost}` : ''}
            </Alert>
            <Flex gap={2}>
              <Button
                component="a"
                href={`https://${name}.xch.limo`}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
              >
                <Trans>Open {name}.xch.limo</Trans>
              </Button>
              <Button variant="contained" onClick={onClose}>
                <Trans>Close</Trans>
              </Button>
            </Flex>
          </Box>
        );
      }
      default:
        return null;
    }
  };

  const getActiveStep = () => {
    switch (currentStep) {
      case 'create-did':
      case 'confirm-did':
        return 0;
      case 'assign-nft':
      case 'confirm-assign':
        return 1;
      case 'configure-website':
      case 'confirm-config-1':
      case 'confirm-config-2':
      case 'complete':
        return 2;
      default:
        return 0;
    }
  };

  const steps = [t`Create Profile`, t`Assign Name to Profile`, t`Configure Website`];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6">
          <Trans>Configure {name}.xch.limo Website</Trans>
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Stepper activeStep={getActiveStep()} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {getStepContent()}
      </DialogContent>
    </Dialog>
  );
}
