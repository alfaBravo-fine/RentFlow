import React, { useState, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { AppRoutes } from './routes';
import { LoginView } from './features/auth/LoginView';
import { getStoredUser, GoogleUser } from './lib/google/auth';
import { seedInitialData } from './db/seed';

const queryClient = new QueryClient();

export default function App() {
  const [user, setUser] = useState<GoogleUser | null>(getStoredUser());
  const [hasDismissedBootAuth, setHasDismissedBootAuth] = useState(() => {
    return localStorage.getItem('rentflow_boot_auth_dismissed') === 'true';
  });

  useEffect(() => {
    // Seed initial demo fixtures if empty on app launch
    seedInitialData(false);
  }, []);

  const handleSignedIn = (u: GoogleUser) => {
    setUser(u);
    setHasDismissedBootAuth(true);
    localStorage.setItem('rentflow_boot_auth_dismissed', 'true');
  };

  const handleContinueOffline = () => {
    setHasDismissedBootAuth(true);
    localStorage.setItem('rentflow_boot_auth_dismissed', 'true');
  };

  // If user is not authenticated and hasn't yet dismissed first-launch boot login screen
  if (!user && !hasDismissedBootAuth) {
    return (
      <LoginView
        onSignedIn={handleSignedIn}
        onContinueOffline={handleContinueOffline}
      />
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <AppRoutes />
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
