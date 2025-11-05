import { WalletType } from '@chia-network/api';
import {
  useSendTransactionMutation,
  useGetWalletsQuery,
  useSpendCATMutation,
  useGetCurrentAddressQuery,
} from '@chia-network/api-react';
import { Card, Flex, Button, Back, chiaToMojo, catToMojo } from '@chia-network/core';
import { Trans, t } from '@lingui/macro';
import {
  Alert,
  Box,
  Typography,
  Divider,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField as MuiTextField,
} from '@mui/material';
import BigNumber from 'bignumber.js';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

import { NAMESDAO_RECIPIENT_PUBKEY } from '../../constants/namesdaoPubkey';
import { cloakMemo } from '../../utils/cloakMemo';
import { checkAvailability, getInfo, resolveNamesdaoName } from '../../utils/namesdaoApi';
import {
  getPrices,
  formatXchPrice,
  formatNamePrice,
  formatSbxPrice,
  formatAirPrice,
  type PriceTier,
} from '../../utils/priceService';

export default function NameRegistration() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [paymentMethod, setPaymentMethod] = useState<'xch' | 'name' | 'sbx' | 'air'>('xch');
  const [fee, setFee] = useState<string>('0');
  const [years, setYears] = useState<string>('1');
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ paymentAddress: string; publicKey?: string } | null>(null);
  // pricing and asset ids are not needed with priceService-based display
  const [pricesList, setPricesList] = useState<PriceTier[] | null>(null);
  const [sendTransaction] = useSendTransactionMutation();
  const [spendCAT] = useSpendCATMutation();
  const { data: walletsData } = useGetWalletsQuery();

  // priceService is the source of truth for pricing display
  const yearsNum = Math.min(100, Math.max(1, Number.parseInt(years || '1', 10) || 1));
  function normalizeBaseName(n: string | undefined) {
    const base = (n || '')
      .toLowerCase()
      .trim()
      .replace(/\.xch$/i, '');
    return base;
  }

  function countLeadingUnderscores(n: string) {
    const m = n.match(/^_+/);
    return m ? m[0].length : 0;
  }

  const pickTierForName = React.useCallback((nameBase: string, tiers: PriceTier[]): PriceTier | null => {
    if (!nameBase) return null;
    const underscores = countLeadingUnderscores(nameBase);
    const len = nameBase.length;
    // Prefer underscore tiers if criteria met
    if (underscores >= 3 && len >= 4) {
      return tiers.find((tier) => tier.label.includes('3 underscores')) || null;
    }
    if (underscores >= 1 && len >= 4) {
      return tiers.find((tier) => tier.label.includes('1 underscore')) || null;
    }
    // Fallback to length-based tiers
    if (len === 4) return tiers.find((tier) => tier.label.startsWith('4 characters')) || null;
    if (len === 5) return tiers.find((tier) => tier.label.startsWith('5 characters')) || null;
    if (len === 6) return tiers.find((tier) => tier.label.startsWith('6 characters')) || null;
    if (len >= 7) return tiers.find((tier) => tier.label.startsWith('7+ characters')) || null;
    return null;
  }, []);

  const perYearXch = useMemo(() => {
    if (!pricesList || !name) return null;
    const base = normalizeBaseName(name);
    const tier = pickTierForName(base, pricesList);
    return tier?.xchPrice ?? null;
  }, [pricesList, name, pickTierForName]);

  const perYearName = useMemo(() => {
    if (!pricesList || !name) return null;
    const base = normalizeBaseName(name);
    const tier = pickTierForName(base, pricesList);
    return tier?.namePrice ?? null;
  }, [pricesList, name, pickTierForName]);

  const perYearSbx = useMemo(() => {
    if (!pricesList || !name) return null;
    const base = normalizeBaseName(name);
    const tier = pickTierForName(base, pricesList);
    return tier?.sbxPrice ?? null;
  }, [pricesList, name, pickTierForName]);

  const perYearAir = useMemo(() => {
    if (!pricesList || !name) return null;
    const base = normalizeBaseName(name);
    const tier = pickTierForName(base, pricesList);
    return tier?.airPrice ?? null;
  }, [pricesList, name, pickTierForName]);

  const totalXch = perYearXch !== null ? new BigNumber(perYearXch).times(yearsNum).toString(10) : null;
  const totalName = perYearName !== null ? new BigNumber(perYearName).times(yearsNum).toString(10) : null;
  const totalSbx = perYearSbx !== null ? new BigNumber(perYearSbx).times(yearsNum).toString(10) : null;
  const totalAir = perYearAir !== null ? new BigNumber(perYearAir).times(yearsNum).toString(10) : null;

  const totalDisplayXch = totalXch !== null ? formatXchPrice(parseFloat(totalXch)) : null;
  const totalDisplayName = totalName !== null ? formatNamePrice(parseFloat(totalName)) : null;
  const totalDisplaySbx = totalSbx !== null ? formatSbxPrice(parseFloat(totalSbx)) : null;
  const totalDisplayAir = totalAir !== null ? formatAirPrice(parseFloat(totalAir)) : null;

  const standardWalletId = useMemo(() => {
    const list: any[] = walletsData || [];
    const wallet = list.find((item) => item.type === WalletType.STANDARD_WALLET);
    return wallet?.id;
  }, [walletsData]);

  const nameWallet = useMemo(() => {
    const list: any[] = walletsData || [];
    const lower = (s: any) => (typeof s === 'string' ? s.toLowerCase() : '');
    return list.find((item) => {
      if (![WalletType.CAT, WalletType.RCAT, WalletType.CRCAT].includes(item.type)) return false;
      const meta = item?.meta || {};
      const ticker = lower(meta.ticker);
      const nm = lower(meta.name);
      if (ticker === 'name') return true;
      if (nm === 'namesdao name' || nm === 'name') return true;
      return false;
    });
  }, [walletsData]);

  const sbxWallet = useMemo(() => {
    const list: any[] = walletsData || [];
    const lower = (s: any) => (typeof s === 'string' ? s.toLowerCase() : '');
    return list.find((item) => {
      if (![WalletType.CAT, WalletType.RCAT, WalletType.CRCAT].includes(item.type)) return false;
      const meta = item?.meta || {};
      const ticker = lower(meta.ticker);
      const nm = lower(meta.name);
      if (ticker === 'sbx') return true;
      if (nm === 'sbx' || nm.includes('sbx')) return true;
      return false;
    });
  }, [walletsData]);

  const airWallet = useMemo(() => {
    const list: any[] = walletsData || [];
    const lower = (s: any) => (typeof s === 'string' ? s.toLowerCase() : '');
    return list.find((item) => {
      if (![WalletType.CAT, WalletType.RCAT, WalletType.CRCAT].includes(item.type)) return false;
      const meta = item?.meta || {};
      const ticker = lower(meta.ticker);
      const nm = lower(meta.name);
      if (ticker === 'air') return true;
      if (nm === 'air' || nm.includes('air')) return true;
      return false;
    });
  }, [walletsData]);

  const nameWalletId = nameWallet?.id;
  const sbxWalletId = sbxWallet?.id;
  const airWalletId = airWallet?.id;

  const isRenewMode = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get('mode') === 'renew';
  }, [location.search]);

  const isTripleUnderscore = useMemo(() => {
    if (!name) return false;
    const base = normalizeBaseName(name);
    return countLeadingUnderscores(base) >= 3;
  }, [name]);

  function handleBack() {
    navigate('/dashboard/names');
  }

  function handlePaymentMethodChange(event: React.ChangeEvent<HTMLInputElement>) {
    setPaymentMethod(event.target.value as 'xch' | 'name' | 'sbx' | 'air');
  }

  const loadPrices = async () => {
    try {
      const tiers = await getPrices();
      setPricesList(tiers);
    } catch (priceError) {
      console.error('Failed to load prices:', priceError);
      const errorMessage = priceError instanceof Error ? priceError.message : 'Unknown error';
      setApiError(t`Failed to load pricing information: ${errorMessage}. Please try again later.`);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setApiError(null);
        const infoRes = await getInfo();
        setInfo({ paymentAddress: infoRes.paymentAddress, publicKey: infoRes.publicKey });

        // Load prices separately to handle failures gracefully
        await loadPrices();
      } catch (e: any) {
        setApiError(e?.message || String(e));
      }
    })();
  }, [name]);

  const { data: currentReceiveAddress } = useGetCurrentAddressQuery(
    { walletId: standardWalletId as any },
    { skip: !standardWalletId },
  );

  async function handleRegister() {
    if (!name) return;
    if (sending) return;
    setApiError(null);
    setSending(true);
    try {
      const avail = await checkAvailability(name);
      const r = avail?.results?.[0];
      if (!r) {
        throw new Error(t`Unexpected response format` as any);
      }
      const destAlias = info?.paymentAddress || 'namesdao.xch';
      const paymentAddress = await resolveNamesdaoName(destAlias);
      let payload: string | null = null;
      if (isRenewMode) {
        if (r.status === 'grace_period') {
          payload = `${name}.xch:${name}.xch`;
        } else if (r.status === 'available') {
          if (!currentReceiveAddress) throw new Error(t`Waiting for your receive address` as any);
          payload = `${name}.xch:${currentReceiveAddress}`;
        } else {
          throw new Error(t`Cannot renew at this time` as any);
        }
      } else {
        if (r.status !== 'available') {
          throw new Error(t`Name is no longer available` as any);
        }
        if (!currentReceiveAddress) throw new Error(t`Waiting for your receive address` as any);
        payload = `${name}.xch:${currentReceiveAddress}`;
      }

      const publicKey = info?.publicKey || NAMESDAO_RECIPIENT_PUBKEY;
      const cloaked = await cloakMemo(payload, publicKey, true, 'register');
      const memos: string[] = [cloaked];
      if (paymentMethod === 'xch') {
        if (!standardWalletId) throw new Error(t`No standard wallet found` as any);
        if (!totalXch) throw new Error(t`Missing XCH amount` as any);
        const amount = chiaToMojo(new BigNumber(totalXch));
        const feeMojo = chiaToMojo((fee || '0').trim() || '0');
        await sendTransaction({
          walletId: standardWalletId,
          address: paymentAddress,
          amount,
          fee: feeMojo,
          memos,
          waitForConfirmation: true,
        }).unwrap();
        navigate(`/dashboard/wallets/${standardWalletId}`);
      }
      const spendCatWith = async (
        walletId: any,
        total: string | null,
        missingWalletMsg: string,
        missingAmountMsg: string,
      ) => {
        if (!walletId) throw new Error(missingWalletMsg as any);
        if (!total) throw new Error(missingAmountMsg as any);
        const amount = catToMojo(new BigNumber(total));
        const feeMojo = chiaToMojo((fee || '0').trim() || '0');
        await spendCAT({
          walletId,
          address: paymentAddress,
          amount,
          fee: feeMojo,
          memos,
          waitForConfirmation: true,
        }).unwrap();
        navigate(`/dashboard/wallets/${walletId}`);
      };

      const catPaymentMap: Record<
        string,
        { walletId: any; total: string | null; missingWalletMsg: string; missingAmountMsg: string }
      > = {
        name: {
          walletId: nameWalletId,
          total: totalName,
          missingWalletMsg: t`Add the NAME token wallet to pay with NAME` as any,
          missingAmountMsg: t`Missing NAME amount` as any,
        },
        sbx: {
          walletId: sbxWalletId,
          total: totalSbx,
          missingWalletMsg: t`Add the SBX token wallet to pay with SBX` as any,
          missingAmountMsg: t`Missing SBX amount` as any,
        },
        air: {
          walletId: airWalletId,
          total: totalAir,
          missingWalletMsg: t`Add the AIR token wallet to pay with AIR` as any,
          missingAmountMsg: t`Missing AIR amount` as any,
        },
      };

      const catCfg = catPaymentMap[paymentMethod];
      if (catCfg) {
        await spendCatWith(
          catCfg.walletId,
          catCfg.total,
          catCfg.missingWalletMsg as any,
          catCfg.missingAmountMsg as any,
        );
      }
    } catch (e: any) {
      setApiError(e?.message || String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Flex flexDirection="column" gap={3}>
      <Flex alignItems="center" gap={1}>
        <Back onClick={handleBack} />
        <Typography variant="h4">
          {isRenewMode ? <Trans>Renew {name}.xch</Trans> : <Trans>Register {name}.xch</Trans>}
        </Typography>
      </Flex>

      <Card>
        <Flex flexDirection="column" gap={3}>
          {!isRenewMode && (
            <Alert severity="success">
              <Trans>
                <strong>{name}.xch</strong> is available!
              </Trans>
            </Alert>
          )}

          <Box>
            <Typography variant="h6" gutterBottom>
              {isRenewMode ? <Trans>Renewal Details</Trans> : <Trans>Registration Details</Trans>}
            </Typography>
            <Typography variant="body1">
              <Trans>Name:</Trans> <strong>{name}.xch</strong>
            </Typography>
            <Typography variant="body1">
              <Trans>Amount:</Trans>{' '}
              {paymentMethod === 'xch' ? (
                <strong>{totalDisplayXch ?? '?'} XCH</strong>
              ) : paymentMethod === 'name' ? (
                <strong>{totalDisplayName ?? '?'} NAME</strong>
              ) : paymentMethod === 'sbx' ? (
                <strong>{totalDisplaySbx ?? '?'} SBX</strong>
              ) : paymentMethod === 'air' ? (
                <strong>{totalDisplayAir ?? '?'} AIR</strong>
              ) : (
                <strong>?</strong>
              )}
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography variant="h6" gutterBottom>
              <Trans>Registration Period</Trans>
            </Typography>
            <MuiTextField
              label={<Trans>Years</Trans>}
              value={years}
              onChange={(e: any) => setYears(e.target.value)}
              type="number"
              inputProps={{ min: 1, max: 100, step: 1 }}
              variant="filled"
              size="small"
              sx={{ width: '10ch' }}
            />
          </Box>

          <Box>
            <Typography variant="h6" gutterBottom>
              <Trans>Payment Options</Trans>
            </Typography>

            <RadioGroup value={paymentMethod} onChange={handlePaymentMethodChange}>
              <FormControlLabel
                value="xch"
                control={<Radio />}
                label={t`Pay with XCH (${totalDisplayXch ?? '?'} XCH)`}
              />
              <FormControlLabel
                value="name"
                control={<Radio />}
                disabled={!(nameWalletId && totalName !== null)}
                label={t`Pay with NAME token (${totalDisplayName ?? '?'} NAME)`}
              />
              {isTripleUnderscore && (
                <>
                  <FormControlLabel
                    value="sbx"
                    control={<Radio />}
                    disabled={!(sbxWalletId && totalSbx !== null)}
                    label={t`Pay with SBX token (${totalDisplaySbx ?? '?'} SBX)`}
                  />
                  <FormControlLabel
                    value="air"
                    control={<Radio />}
                    disabled={!(airWalletId && totalAir !== null)}
                    label={t`Pay with AIR token (${totalDisplayAir ?? '?'} AIR)`}
                  />
                </>
              )}
            </RadioGroup>
          </Box>

          <Box>
            <MuiTextField
              label={<Trans>Blockchain Network Fee (XCH)</Trans>}
              value={fee}
              onChange={(e: any) => {
                const v = String(e.target.value ?? '');
                if (v === '') {
                  setFee('');
                  return;
                }
                let s = v.replace(/[^\d.]/g, '');
                const parts = s.split('.');
                if (parts.length > 2) {
                  s = `${parts[0]}.${parts.slice(1).join('')}`;
                }
                if (s.includes('.')) {
                  const [a, b = ''] = s.split('.');
                  s = `${a}.${b.slice(0, 12)}`;
                }
                setFee(s);
              }}
              variant="filled"
              fullWidth
            />
          </Box>

          <Flex gap={2}>
            <Button variant="outlined" onClick={handleBack}>
              <Trans>Back</Trans>
            </Button>
            <Button
              variant="contained"
              color="primary"
              disabled={
                sending ||
                !(
                  (paymentMethod === 'xch' && totalXch) ||
                  (paymentMethod === 'name' && totalName) ||
                  (paymentMethod === 'sbx' && totalSbx) ||
                  (paymentMethod === 'air' && totalAir)
                )
              }
              onClick={handleRegister}
            >
              {isRenewMode ? <Trans>Renew</Trans> : <Trans>Register</Trans>}
            </Button>
          </Flex>
          {apiError && <Alert severity="error">{apiError}</Alert>}
        </Flex>
      </Card>
    </Flex>
  );
}
