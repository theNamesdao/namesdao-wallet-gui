import { LayoutDashboardSub } from '@chia-network/core';
import React from 'react';
import { Routes, Route } from 'react-router-dom';

import NameRegistration from './NameRegistration';
import NameSearch from './NameSearch';
import NamesSideBar from './NamesSideBar';

export default function Names() {
  return (
    <Routes>
      <Route element={<LayoutDashboardSub sidebar={<NamesSideBar />} outlet />}>
        <Route index element={<NameSearch />} />
        <Route path="register/:name" element={<NameRegistration />} />
        <Route path="*" element={<NameSearch />} />
      </Route>
    </Routes>
  );
}
