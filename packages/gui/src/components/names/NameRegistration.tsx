import { WalletType } from '@chia-network/api';
import { useSendTransactionMutation, useGetWalletsQuery, useSpendCATMutation } from '@chia-network/api-react';
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

import { checkAvailability, getInfo, resolveNamesdaoName } from '../../utils/namesdaoApi';
import { getPrices, type PriceTier } from '../../utils/priceService';

export default function NameRegistration() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [paymentMethod, setPaymentMethod] = useState<'xch' | 'name'>('xch');
  const [fee, setFee] = useState<string>('0');
  const [years, setYears] = useState<string>('1');
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ paymentAddress: string } | null>(null);
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
    if (underscores >= 3 && len >= 5) {
      return tiers.find((tier) => tier.label.includes('3+ underscores')) || null;
    }
    if (underscores >= 1 && len >= 5) {
      return tiers.find((tier) => tier.label.includes('1-2 underscores')) || null;
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

  const totalXch = perYearXch ? new BigNumber(perYearXch).times(yearsNum).toString(10) : null;
  const perYearName = useMemo(() => {
    if (!pricesList || !name) return null;
    const base = normalizeBaseName(name);
    const tier = pickTierForName(base, pricesList);
    return tier?.namePrice ?? null;
  }, [pricesList, name, pickTierForName]);
  const totalName = perYearName ? new BigNumber(perYearName).times(yearsNum).toString(10) : null;

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

  const nameWalletId = nameWallet?.id;

  const isRenewMode = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get('mode') === 'renew';
  }, [location.search]);

  function handleBack() {
    navigate('/dashboard/names');
  }

  function handlePaymentMethodChange(event: React.ChangeEvent<HTMLInputElement>) {
    setPaymentMethod(event.target.value as 'xch' | 'name');
  }

  useEffect(() => {
    (async () => {
      try {
        setApiError(null);
        const [infoRes, tiers] = await Promise.all([getInfo(), getPrices()]);
        setInfo({ paymentAddress: infoRes.paymentAddress });
        setPricesList(tiers);
        // Asset IDs are not provided by getPrices(); leaving NAME payments disabled until asset IDs source is added
      } catch (e: any) {
        setApiError(e?.message || String(e));
      }
    })();
  }, [name]);

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
      const address = await resolveNamesdaoName(destAlias);
      let memos: string[] = [];
      if (isRenewMode) {
        if (r.status === 'grace_period') {
          memos = [`${name}.xch:${name}.xch`];
        } else if (r.status === 'available') {
          memos = [name];
        } else {
          throw new Error(t`Cannot renew at this time` as any);
        }
      } else {
        if (r.status !== 'available') {
          throw new Error(t`Name is no longer available` as any);
        }
        memos = [name];
      }
      if (paymentMethod === 'xch') {
        if (!standardWalletId) throw new Error(t`No standard wallet found` as any);
        if (!totalXch) throw new Error(t`Missing XCH amount` as any);
        const amount = chiaToMojo(new BigNumber(totalXch));
        const feeMojo = chiaToMojo((fee || '0').trim() || '0');
        await sendTransaction({
          walletId: standardWalletId,
          address,
          amount,
          fee: feeMojo,
          memos,
          waitForConfirmation: true,
        }).unwrap();
        navigate('/dashboard/wallets');
      }
      if (paymentMethod === 'name') {
        if (!nameWalletId) throw new Error(t`Add the NAME token wallet to pay with NAME` as any);
        if (!totalName) throw new Error(t`Missing NAME amount` as any);
        const amount = catToMojo(new BigNumber(totalName));
        const feeMojo = chiaToMojo((fee || '0').trim() || '0');
        await spendCAT({
          walletId: nameWalletId,
          address,
          amount,
          fee: feeMojo,
          memos,
          waitForConfirmation: true,
        }).unwrap();
        navigate('/dashboard/wallets');
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
                <strong>{totalXch ?? '?'} XCH</strong>
              ) : (
                <strong>{totalName ?? '?'} NAME</strong>
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
              <FormControlLabel value="xch" control={<Radio />} label={t`Pay with XCH (${totalXch ?? '?'} XCH)`} />
              <FormControlLabel
                value="name"
                control={<Radio />}
                disabled={!(nameWalletId && totalName)}
                label={t`Pay with NAME token (${totalName ?? '?'} NAME)`}
              />
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
              disabled={sending || (!totalXch && !totalName)}
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
