import { Flex, LayoutDashboardSub } from '@chia-network/core';
import { Trans } from '@lingui/macro';
import { Typography } from '@mui/material';
import React from 'react';

export default function NamesSideBar() {
  return (
    <LayoutDashboardSub>
      <Flex
        flexDirection="column"
        gap={1.5}
        minWidth="300px"
        sx={{
          overflowY: 'auto',
          scrollBehavior: 'auto',
          '::-webkit-scrollbar': {
            background: 'transparent',
            width: '0px',
          },
        }}
      >
        <Flex flexDirection="row" alignItems="center">
          <Flex flexGrow={1}>
            <Typography variant="h5">
              <Trans>Names</Trans>
            </Typography>
          </Flex>
        </Flex>
        <Flex flexDirection="column" gap={2}>
          <Typography variant="body2" color="textSecondary">
            <Trans>Register .xch names with Namesdao</Trans>
          </Typography>
        </Flex>
      </Flex>
    </LayoutDashboardSub>
  );
}
