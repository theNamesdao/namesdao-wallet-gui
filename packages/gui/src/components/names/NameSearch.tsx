import { Card, Flex, Form, Button, Loading } from '@chia-network/core';
import { Trans, t } from '@lingui/macro';
import { Alert, Box, Typography, TextField as MuiTextField } from '@mui/material';
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { checkAvailability } from '../../utils/namesdaoApi';
import { getPrices, areFallbackPrices, type PriceTier } from '../../utils/priceService';

type FormData = {
  name: string;
};

export default function NameSearch() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<{
    available: boolean;
    name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputName, setInputName] = useState('');
  const [prices, setPrices] = useState<PriceTier[] | null>(null);

  useEffect(() => {
    async function loadPrices() {
      const priceData = await getPrices();
      setPrices(priceData);
    }
    loadPrices();
  }, []);

  const methods = useForm<FormData>({
    defaultValues: {
      name: '',
    },
  });

  async function handleSubmit(_data: FormData) {
    let name = inputName.trim().toLowerCase();

    if (!name) {
      setError(t`Please enter a name`);
      return;
    }

    // Strip .xch extension if present
    name = name.replace(/\.xch$/i, '');

    if (name.length > 100) {
      setError(t`Name must be at most 100 characters`);
      return;
    }
    const isValidChars = /^(?:[a-z0-9]+|_[a-z0-9]+|___[a-z0-9]+)$/.test(name);
    if (!isValidChars) {
      setError(t`Name can only contain lowercase letters and numbers; may begin with 1 or 3 underscores`);
      return;
    }

    setIsChecking(true);
    setError(null);
    setAvailabilityResult(null);

    try {
      const response = await checkAvailability(name);

      if (!response.results || response.results.length === 0) {
        setError(t`Unexpected response format`);
        return;
      }

      // Get the first result (we only queried one name)
      const result = response.results[0];

      // Handle different status responses
      switch (result.status) {
        case 'available':
          setAvailabilityResult({ available: true, name });
          // Navigate to registration page with pricing info
          navigate(`/dashboard/names/register/${name}`, {
            state: { pricing: result.pricing },
          });
          break;

        case 'taken':
          setAvailabilityResult({ available: false, name });
          break;

        case 'reserved':
          setError(t`The name "${name}" is reserved and cannot be registered`);
          break;

        case 'grace_period':
          setError(t`The name "${name}" is in renewal grace period (owner can renew)`);
          break;

        case 'future':
          setError(t`The name "${name}" will be available at block ${result.futureBlock}`);
          break;

        case 'invalid':
          setError(t`Invalid name format: ${result.message}`);
          break;

        default:
          setError(t`Unexpected response: ${result.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      setError(t`Error checking name availability: ${err.message || 'Network error'}`);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <Flex flexDirection="column" gap={3}>
      <Flex>
        <Typography variant="h4">
          <Trans>Register a .xch Name</Trans>
        </Typography>
      </Flex>

      <Card>
        <Form methods={methods} onSubmit={handleSubmit}>
          <Flex flexDirection="column" gap={3}>
            <Typography variant="body1">
              <Trans>
                Namesdao .xch names can be used as human-readable addresses for your wallet. Plus you get .xch.am &
                .xch.limo website services.
              </Trans>
            </Typography>

            <Flex flexDirection="row" gap={2} alignItems="flex-start">
              <Box flexGrow={1}>
                <MuiTextField
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  label={<Trans>Name</Trans>}
                  placeholder={t`myname`}
                  fullWidth
                  disabled={isChecking}
                  autoFocus
                />
              </Box>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={isChecking}
                sx={{ minWidth: '120px', height: '56px' }}
              >
                {isChecking ? <Loading size={24} /> : <Trans>Check</Trans>}
              </Button>
            </Flex>

            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {availabilityResult && !availabilityResult.available && (
              <Alert severity="warning">
                <Trans>
                  The name <strong>{availabilityResult.name}.xch</strong> is already registered.
                </Trans>
              </Alert>
            )}

            <Box>
              <Typography variant="h6" gutterBottom>
                <Trans>Registration Fees</Trans>
              </Typography>
              {!prices ? (
                <Loading size={24} />
              ) : (
                <Flex flexDirection="column" gap={1}>
                  {prices.map((tier) => (
                    <Typography key={tier.label} variant="body2">
                      • <strong>{tier.label}:</strong>{' '}
                      {tier.namePrice > 0 ? `${tier.namePrice} NAME or ${tier.xchPrice} XCH` : t`Free (1 mojo XCH)`}
                    </Typography>
                  ))}
                  {areFallbackPrices(prices) && (
                    <Typography variant="caption" color="textSecondary">
                      <Trans>Showing cached prices - updates may be delayed</Trans>
                    </Typography>
                  )}
                </Flex>
              )}
            </Box>
          </Flex>
        </Form>
      </Card>
    </Flex>
  );
}
