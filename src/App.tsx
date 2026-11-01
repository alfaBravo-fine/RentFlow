import React, { useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { AppRoutes } from './routes';
import { LoginView } from './features/auth/LoginView';
import { useAuthStore } from './stores/authStore';
import { seedInitialData } from './db/seed';
import { ToastProvider } from './components/toast/ToastContext';
import { initAutomatedLateFeeSchedule } from './lib/autoLateFeeEngine';
import { useDriveSync } from './hooks/useDriveSync';

const queryClient = new QueryClient();

function AuthenticatedApp() {
  // Drive sync engine: 5-second debounced background upload & startup download
  useDriveSync();

  useEffect(() => {
    // Seed initial fixtures if empty
    seedInitialData(false);
    // Initialize automated 24h statutory late fee scanner
    const cleanup = initAutomatedLateFeeSchedule();
    return cleanup;
  }, []);

  return (
    <HashRouter>
      <Layout>
        <AppRoutes />
      </Layout>
    </HashRouter>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  // If user is not logged in, they cannot access the app
  if (!isAuthenticated || !user) {
    return (
      <ToastProvider>
        <LoginView />
      </ToastProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthenticatedApp />
      </ToastProvider>
    </QueryClientProvider>
  );
}
