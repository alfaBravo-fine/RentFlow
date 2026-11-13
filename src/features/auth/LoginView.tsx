import React, { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../../stores/authStore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ShieldCheck, Lock, RefreshCw, AlertCircle, Database, Folder } from '../../components/icons';
import { RentFlowLogo } from '../../components/brand/RentFlowLogo';
import { GOOGLE_CLIENT_ID } from '../../config/google';
import { isTauri as detectTauri } from '../../lib/tauri/bridge';

const isTauri = detectTauri();

export const LoginView: React.FC = () => {
  const setAuthenticating = useAuthStore((s) => s.setAuthenticating);
  const setGoogleSession = useAuthStore((s) => s.setGoogleSession);
  const isAuthenticating = useAuthStore((s) => s.isAuthenticating);
  const authError = useAuthStore((s) => s.authError);

  const [statusText, setStatusText] = useState<string | null>(null);

  // Helper to fetch real profile from Google OAuth UserInfo endpoint using access_token
  const fetchRealGoogleProfile = async (accessToken: string) => {
    setStatusText('Fetching real Google user profile...');
    console.log('[Google Auth] Fetching profile with access_token via Google UserInfo API...');

    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Google UserInfo API returned error status ${res.status}`);
    }

    const profile = await res.json();
    console.log('[Google Auth] Real Google User Profile received:', profile);

    if (!profile || !profile.email) {
      throw new Error('Invalid Google user profile data received from Google.');
    }

    setGoogleSession(
      {
        sub: profile.sub,
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        picture: profile.picture,
      },
      accessToken,
      ''
    );
  };

  // Google OAuth hook via @react-oauth/google
  const triggerGoogleLoginWeb = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      console.log('[Google Auth] OAuth success tokenResponse:', tokenResponse);
      const accessToken = tokenResponse.access_token;
      if (!accessToken) {
        setAuthenticating(false, 'No access token returned by Google OAuth.');
        return;
      }
      try {
        await fetchRealGoogleProfile(accessToken);
      } catch (err: any) {
        console.error('[Google UserInfo Error]:', err);
        setAuthenticating(false, err.message || 'Failed to fetch Google profile.');
      } finally {
        setStatusText(null);
      }
    },
    onError: (errorResponse) => {
      console.error('[Google OAuth Error Response]:', errorResponse);
      setAuthenticating(false, 'Google Sign-In popup failed or was closed by user.');
      setStatusText(null);
    },
    scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata',
  });

  // Direct OAuth 2.0 window.open popup fallback if Google GIS script is delayed or blocked
  const triggerDirectWindowPopup = () => {
    console.log('[Google Auth] Triggering direct OAuth popup window fallback...');
    const redirectUri = window.location.origin;
    const scopes = encodeURIComponent(
      'openid email profile https://www.googleapis.com/auth/drive.appdata'
    );
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=token&scope=${scopes}&prompt=select_account`;

    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'google_oauth_popup',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
    );

    if (!popup) {
      setAuthenticating(false, 'Popup window blocked. Please enable popups for this domain.');
      setStatusText(null);
      return;
    }

    const timer = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(timer);
          setAuthenticating(false, null);
          setStatusText(null);
          return;
        }

        if (popup.location && popup.location.href.includes('access_token=')) {
          const hash = popup.location.hash || popup.location.search;
          const params = new URLSearchParams(hash.replace('#', '?'));
          const accessToken = params.get('access_token');
          popup.close();
          clearInterval(timer);

          if (accessToken) {
            fetchRealGoogleProfile(accessToken).catch((e) => {
              setAuthenticating(false, e.message || 'Failed to fetch user profile from token.');
            });
          }
        }
      } catch {
        // Cross-origin restriction while popup is on google.com
      }
    }, 500);
  };

  // Check URL hash on load in case of OAuth redirect callback
  useEffect(() => {
    if (window.location.hash.includes('access_token=')) {
      const params = new URLSearchParams(window.location.hash.replace('#', '?'));
      const accessToken = params.get('access_token');
      if (accessToken) {
        window.history.replaceState(null, '', window.location.pathname);
        setAuthenticating(true, null);
        fetchRealGoogleProfile(accessToken).catch((e) => {
          setAuthenticating(false, e.message || 'Failed to fetch profile from token.');
        });
      }
    }
  }, []);

  // Main Google Login Click Handler
  const handleGoogleLogin = async () => {
    console.log("Google Login Button Clicked");
    setAuthenticating(true, null);
    setStatusText('Opening Google Sign-In popup...');

    if (isTauri) {
      try {
        setStatusText('Starting 127.0.0.1 desktop loopback server & opening default browser...');

        const { invoke } = await import('@tauri-apps/api/core');
        const profile = await invoke<{
          id: string;
          email: string;
          name: string;
          picture?: string;
        }>('google_login');

        setStatusText('Authenticated! Checking Google Drive appDataFolder for cloud backup...');

        try {
          const restoreResult = await invoke<{ restored: boolean; message: string }>('drive_pull_backup', {
            googleId: profile.id,
          });
          if (restoreResult.restored) {
            console.log('[RentFlow Desktop] Cloud database restored:', restoreResult.message);
          }
        } catch (e) {
          console.warn('[Desktop Backup Pull] Ignored backup check error:', e);
        }

        setGoogleSession(
          {
            sub: profile.id,
            email: profile.email,
            name: profile.name,
            picture: profile.picture,
          },
          'tauri_desktop_token_secured_in_rust',
          ''
        );
      } catch (err: unknown) {
        console.error('[Desktop Sign-in Error]:', err);
        const msg =
          typeof err === 'string'
            ? err
            : (err as { message?: string })?.message || 'Desktop OAuth loopback failed.';
        setAuthenticating(false, msg);
      } finally {
        setStatusText(null);
      }
    } else {
      // Web Environment: Trigger Google OAuth 2.0 Popup
      try {
        triggerGoogleLoginWeb();
      } catch (e) {
        console.warn('[Google OAuth] GIS hook fallback to direct window popup:', e);
        triggerDirectWindowPopup();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)] p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-md space-y-6 text-center my-auto">
        {/* Brand Header */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-md mb-4">
            <RentFlowLogo size={36} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            RentFlow Desktop
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs">
            Property Management Suite &bull; Google OAuth Identity
          </p>
        </div>

        {/* Login Container Card */}
        <Card className="p-6 sm:p-8 space-y-6 text-left border border-[var(--border-strong)] rounded-2xl shadow-lg bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Google Account Authentication
            </span>
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>OAuth 2.0 SSL Verified</span>
            </Badge>
          </div>

          <div className="space-y-3.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                <Folder className="w-3.5 h-3.5" />
              </div>
              <div>
                <strong className="text-[var(--text-primary)]">Google OAuth 2.0 Popup:</strong>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Sign in with your Google Account. A popup window will prompt account selection and consent.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div>
                <strong className="text-[var(--text-primary)]">Verified Account Profile:</strong>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Your identity is fetched directly from Google's UserInfo API (<code className="font-mono text-[10px] bg-[var(--bg-base)] px-1 py-0.5 rounded">googleapis.com/oauth2/v3/userinfo</code>).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <Database className="w-3.5 h-3.5" />
              </div>
              <div>
                <strong className="text-[var(--text-primary)]">Encrypted Backup Vault:</strong>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Google Drive synchronization backs up your portfolio to your account's private <code className="font-mono text-[10px] bg-[var(--bg-base)] px-1 py-0.5 rounded">appDataFolder</code>.
                </p>
              </div>
            </div>
          </div>

          {isAuthenticating && (
            <div className="p-3.5 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-xs text-[var(--accent)] flex items-center gap-3">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <div>
                <strong className="block font-semibold">Authenticating with Google...</strong>
                <span className="text-[11px] opacity-90">{statusText || 'Opening Google Sign-In Popup...'}</span>
              </div>
            </div>
          )}

          {authError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* Prominent Google Sign-in Button */}
          <div className="pt-2 space-y-3">
            <Button
              type="button"
              variant="primary"
              className="w-full py-3 h-12 gap-3 font-semibold text-sm rounded-xl cursor-pointer shadow-md transition-all active:scale-[0.99]"
              onClick={handleGoogleLogin}
              disabled={isAuthenticating}
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isAuthenticating ? 'Connecting to Google...' : 'Sign in with Google'}</span>
            </Button>

            <p className="text-[10px] font-mono text-[var(--text-secondary)] mt-2 text-center break-all bg-[var(--bg-base)] p-1.5 rounded border border-[var(--border-subtle)] select-all">
              Environment: {isTauri ? 'Desktop (Tauri v2 Native)' : 'Web Browser'} &bull; Client ID: {GOOGLE_CLIENT_ID.slice(0, 16)}…
            </p>
          </div>
        </Card>

        <p className="text-[11px] text-[var(--text-secondary)]">
          RentFlow Property Manager &bull; Google OAuth 2.0 Identity Engine
        </p>
      </div>
    </div>
  );
};
