import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { AppRoutes } from './routes';
import { seedInitialData } from './db/seed';

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => {
    // Seed initial demo fixtures if empty on app launch
    seedInitialData(false);
  }, []);

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
