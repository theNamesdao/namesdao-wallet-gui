import { useGetTransactionQuery } from '@chia-network/api-react';
import { useEffect, useState } from 'react';

export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'timeout';

export interface TransactionConfirmationOptions {
  transactionId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export default function useTransactionConfirmation(options: TransactionConfirmationOptions) {
  const { transactionId, timeoutMs = 300_000 } = options;
  const [status, setStatus] = useState<TransactionStatus>('pending');
  const [error, setError] = useState<string | null>(null);
  const [startTime] = useState(Date.now());

  const { data: transaction, error: txError } = useGetTransactionQuery(
    { transactionId },
    {
      skip: !transactionId,
    },
  );

  useEffect(() => {
    if (!transactionId) {
      setStatus('pending');
      setError(null);
      return () => {};
    }

    // Check for timeout
    const checkTimeout = () => {
      if (Date.now() - startTime > timeoutMs) {
        setStatus('timeout');
        setError('Transaction confirmation timed out');
      }
    };

    // Handle transaction data updates
    if (transaction) {
      if (transaction.confirmed) {
        setStatus('confirmed');
        setError(null);
      }
      // Note: Transaction might not be rejected yet, just unconfirmed
    } else if (txError) {
      setStatus('failed');
      setError((txError as any)?.message || 'Failed to fetch transaction status');
    }

    // Set up timeout check
    const timeoutId = setInterval(checkTimeout, 1000);
    return () => clearInterval(timeoutId);
  }, [transaction, txError, transactionId, startTime, timeoutMs]);

  const reset = () => {
    setStatus('pending');
    setError(null);
  };

  return {
    status,
    error,
    isLoading: status === 'pending' && !error,
    isConfirmed: status === 'confirmed',
    isFailed: status === 'failed' || status === 'timeout',
    transaction,
    reset,
  };
}
