import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { DashboardView } from './features/dashboard/DashboardView';
import { OnboardingView } from './features/onboarding/OnboardingView';
import { PropertiesView } from './features/properties/PropertiesView';
import { TenantsView } from './features/tenants/TenantsView';
import { LeasesView } from './features/leases/LeasesView';
import { InvoicesView } from './features/invoices/InvoicesView';
import { MaintenanceView } from './features/maintenance/MaintenanceView';
import { VendorsView } from './features/vendors/VendorsView';
import { ExpensesView } from './features/expenses/ExpensesView';
import { ReportsView } from './features/reports/ReportsView';
import { SyncView } from './features/sync/SyncView';
import { SettingsView } from './features/settings/SettingsView';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<DashboardView />} />
      <Route path="/onboarding" element={<OnboardingView />} />
      <Route path="/properties" element={<PropertiesView />} />
      <Route path="/tenants" element={<TenantsView />} />
      <Route path="/leases" element={<LeasesView />} />
      <Route path="/invoices" element={<InvoicesView />} />
      <Route path="/maintenance" element={<MaintenanceView />} />
      <Route path="/vendors" element={<VendorsView />} />
      <Route path="/expenses" element={<ExpensesView />} />
      <Route path="/reports" element={<ReportsView />} />
      <Route path="/sync" element={<SyncView />} />
      <Route path="/settings" element={<SettingsView />} />
    </Routes>
  );
};
