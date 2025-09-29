// this file has changed
import type { AddressContact } from '@chia-network/core';
import { AddressBookContext } from '@chia-network/core';
import { Trans } from '@lingui/macro';
import {
  Autocomplete as MaterialAutocomplete,
  FormControl,
  TextField,
  TextFieldProps,
  Typography,
} from '@mui/material';
import React, { useEffect, useState, useContext } from 'react';
import { useController } from 'react-hook-form';

import { resolveNamesdaoIfNeeded } from '../utils';

type Props = TextFieldProps &
  AddressBookAutocompleteProps<string, false, false, true> & {
    name: string;
    getType: string; // currently supports 'address' and 'did'
    fullWidth?: boolean;
    freeSolo?: boolean;
    renderInput?: any;
  };

export default function AddressBookAutocomplete(props: Props) {
  const { name, getType, required, fullWidth, freeSolo, disableClearable, ...rest } = props;
  const [addressBook] = useContext(AddressBookContext);
  const [options, setOptions] = useState([]);
  const [resolveStatus, setResolveStatus] = useState<'idle' | 'resolving' | 'ok' | 'not_found' | 'error'>('idle');
  const [resolvedFrom, setResolvedFrom] = useState<string | undefined>(undefined);
  const [resolvedTo, setResolvedTo] = useState<string | undefined>(undefined);
  const [resolveError, setResolveError] = useState<string | undefined>(undefined);

  const {
    field: { onChange, onBlur },
  } = useController({
    name,
  });

  function handleChange(newValue: any) {
    // reset helper state on any edit/change
    if (resolveStatus !== 'idle') {
      setResolveStatus('idle');
      setResolvedFrom(undefined);
      setResolvedTo(undefined);
      setResolveError(undefined);
    }

    const updatedValue = newValue || '';
    updatedValue.id ? onChange(updatedValue.id) : onChange(updatedValue);
  }

  async function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    // mark field as touched
    onBlur();

    const raw = e.target?.value ?? '';
    const value = String(raw).trim();

    // resolve only for .xch names when getType requests an address
    const shouldResolve = getType === 'address' && value.toLowerCase().endsWith('.xch');
    if (!shouldResolve) {
      return;
    }

    setResolveStatus('resolving');
    setResolvedFrom(value);
    setResolvedTo(undefined);
    setResolveError(undefined);

    try {
      const resolved = await resolveNamesdaoIfNeeded(value, 'address');
      if (resolved && resolved !== value) {
        setResolvedTo(resolved);
        setResolveStatus('ok');
      } else {
        // returned same value -> treat as not found for a .xch name
        setResolveStatus('not_found');
      }
    } catch (_err: any) {
      const msg = (_err?.message ?? '').toString();
      if (msg.toLowerCase().includes('not found')) {
        setResolveStatus('not_found');
        setResolveError(undefined);
      } else {
        setResolveStatus('error');
        setResolveError("Couldn't resolve name. Try again.");
      }
    }
  }

  useEffect(() => {
    const contactList = [];
    addressBook.forEach((contact: AddressContact) => {
      const nameStr = JSON.stringify(contact.name).slice(1, -1);
      if (getType === 'address') {
        contact.addresses.forEach((addressInfo) => {
          const addNameStr = JSON.stringify(addressInfo.name).slice(1, -1);
          const optionStr = `${contact.emoji} ${nameStr} | ${addNameStr}`;
          contactList.push({ label: optionStr, id: addressInfo.address });
        });
      } else if (getType === 'did') {
        contact.dids.forEach((didInfo) => {
          const didNameStr = JSON.stringify(didInfo.name).slice(1, -1);
          const optionStr = `${nameStr} | ${didNameStr}`;
          contactList.push({ label: optionStr, id: didInfo.did });
        });
      }
    });
    setOptions(contactList);
  }, [addressBook, getType]);

  return (
    <FormControl variant="filled" fullWidth>
      <MaterialAutocomplete
        autoComplete
        blurOnSelect
        options={options}
        onChange={(_e, newValue) => handleChange(newValue)}
        name={name}
        renderInput={(params) => (
          <TextField
            autoComplete="off"
            label={<Trans>Address / Contact / Namesdao .xch Name</Trans>}
            required={required}
            onBlur={handleBlur}
            onChange={(_e) => handleChange(_e.target.value)}
            {...rest}
            {...params}
          />
        )}
        freeSolo={freeSolo}
        fullWidth={fullWidth}
        disableClearable={disableClearable}
      />
      {resolveStatus !== 'idle' && (
        <Typography variant="caption" sx={{ mt: 0.5 }}>
          {resolveStatus === 'resolving' && 'Resolving name…'}
          {resolveStatus === 'ok' && resolvedTo ? `Resolves to ${resolvedTo}` : null}
          {resolveStatus === 'not_found' && resolvedFrom ? `No address found for '${resolvedFrom}'` : null}
          {resolveStatus === 'error' && (resolveError || "Couldn't resolve name. Try again.")}
        </Typography>
      )}
    </FormControl>
  );
}
