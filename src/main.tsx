import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.tsx';
import { GOOGLE_CLIENT_ID } from './config/google.ts';
import './index.css';

console.log('[RentFlow Client ID Config] Active Google Client ID:', GOOGLE_CLIENT_ID);

createRoot(document.getElementById('root')!).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <App />
  </GoogleOAuthProvider>
);
