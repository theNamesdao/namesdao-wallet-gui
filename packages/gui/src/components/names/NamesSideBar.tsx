import { Flex, LayoutDashboardSub } from '@chia-network/core';
import React from 'react';

import NamesOwnedList from './NamesOwnedList';

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
        <NamesOwnedList />
      </Flex>
    </LayoutDashboardSub>
  );
}
