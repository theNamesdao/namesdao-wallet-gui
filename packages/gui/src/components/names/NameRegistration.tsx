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

import { checkAvailability, getInfo, getPricingTiers, resolveNamesdaoName } from '../../utils/namesdaoApi';

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
  const [assetIds, setAssetIds] = useState<Record<string, string> | null>(null);
  const [pricingState, setPricingState] = useState<any>(location.state?.pricing || null);
  const [sendTransaction] = useSendTransactionMutation();
  const [spendCAT] = useSpendCATMutation();
  const { data: walletsData } = useGetWalletsQuery();

  const pricing = pricingState || {};
  const xchAmount = pricing.XCH || null;
  const nameAssetId = assetIds?.NAME || null;
  const nameAmount = nameAssetId ? pricing[nameAssetId] || null : null;
  const yearsNum = Math.min(100, Math.max(1, Number.parseInt(years || '1', 10) || 1));
  const totalXch = xchAmount ? new BigNumber(xchAmount).times(yearsNum).toString(10) : null;
  const totalName = nameAmount ? new BigNumber(nameAmount).times(yearsNum).toString(10) : null;

  const standardWalletId = useMemo(() => {
    const list: any[] = walletsData || [];
    const wallet = list.find((item) => item.type === WalletType.STANDARD_WALLET);
    return wallet?.id;
  }, [walletsData]);

  const nameWalletId = useMemo(() => {
    if (!nameAssetId) return undefined;
    const list: any[] = walletsData || [];
    const wallet = list.find(
      (item) =>
        [WalletType.CAT, WalletType.RCAT, WalletType.CRCAT].includes(item.type) && item?.meta?.assetId === nameAssetId,
    );
    return wallet?.id;
  }, [walletsData, nameAssetId]);

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
        const [infoRes, tiers] = await Promise.all([getInfo(), getPricingTiers()]);
        setInfo({ paymentAddress: infoRes.paymentAddress });
        setAssetIds(tiers.assetIds || {});
        if (!pricingState && name) {
          const resp = await checkAvailability(name);
          const r = resp?.results?.[0];
          if (r?.pricing) setPricingState(r.pricing);
        }
      } catch (e: any) {
        setApiError(e?.message || String(e));
      }
    })();
  }, [pricingState, name]);

  async function handleRegister() {
    if (!name) return;
    if (sending) return;
    setApiError(null);
    setSending(true);
    try {
      const avail = await checkAvailability(name);
      const r = avail?.results?.[0];
      if (!r || r.status !== 'available') {
        throw new Error(t`Name is no longer available` as any);
      }
      const destAlias = info?.paymentAddress || 'namesdao.xch';
      const address = await resolveNamesdaoName(destAlias);
      const memos = [name];
      if (paymentMethod === 'xch') {
        if (!standardWalletId) throw new Error(t`No standard wallet found` as any);
        if (!xchAmount) throw new Error(t`Missing XCH amount` as any);
        const amount = chiaToMojo(new BigNumber(xchAmount).times(yearsNum));
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
        if (!nameAssetId) throw new Error(t`NAME assetId unknown` as any);
        if (!nameWalletId) throw new Error(t`Add the NAME token wallet to pay with NAME` as any);
        if (!nameAmount) throw new Error(t`Missing NAME amount` as any);
        const amount = catToMojo(new BigNumber(nameAmount).times(yearsNum));
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
          <Trans>Register {name}.xch</Trans>
        </Typography>
      </Flex>

      <Card>
        <Flex flexDirection="column" gap={3}>
          <Alert severity="success">
            <Trans>
              <strong>{name}.xch</strong> is available!
            </Trans>
          </Alert>

          <Box>
            <Typography variant="h6" gutterBottom>
              <Trans>Registration Details</Trans>
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
              fullWidth
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
                disabled={!totalName}
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
              <Trans>Register</Trans>
            </Button>
          </Flex>
          {apiError && <Alert severity="error">{apiError}</Alert>}
        </Flex>
      </Card>
    </Flex>
  );
}
