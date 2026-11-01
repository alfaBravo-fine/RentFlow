import React, { useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { AppRoutes } from './routes';
import { LoginView } from './features/auth/LoginView';
import { useAuthStore } from './stores/authStore';
import { seedInitialData } from './db/seed';
import { ToastProvider } from './components/toast/ToastContext';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { initAutomatedLateFeeSchedule } from './lib/autoLateFeeEngine';
import { useDriveSync } from './hooks/useDriveSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { KeyboardShortcutsModal } from './components/layout/KeyboardShortcutsModal';

const queryClient = new QueryClient();

function AuthenticatedContent() {
  // Drive sync engine: instant background upload & startup download
  const { syncNow, isRestoring } = useDriveSync();
  const { isHelpOpen, setIsHelpOpen } = useKeyboardShortcuts(syncNow);

  useEffect(() => {
    // Seed initial fixtures if empty
    seedInitialData(false);
    // Initialize automated 24h statutory late fee scanner
    const cleanup = initAutomatedLateFeeSchedule();
    return cleanup;
  }, []);

  return (
    <>
      <Layout>
        {isRestoring && (
          <div className="bg-indigo-600 text-white text-xs py-2 px-4 text-center font-semibold tracking-wide animate-pulse shrink-0">
            Restoring your portfolio data from Google Drive...
          </div>
        )}
        <AppRoutes />
      </Layout>
      <KeyboardShortcutsModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}

function AuthenticatedApp() {
  return (
    <HashRouter>
      <AuthenticatedContent />
    </HashRouter>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  // If user is not logged in, show LoginView wrapped in ThemeProvider & ToastProvider
  if (!isAuthenticated || !user) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <LoginView />
        </ToastProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthenticatedApp />
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
