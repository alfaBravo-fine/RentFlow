import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../../stores/authStore';
import { findDriveBackupFile, pullFromGoogleDrive } from '../../lib/googleDriveService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ShieldCheck, Lock, RefreshCw, AlertCircle, Database, Folder } from '../../components/icons';
import { RentFlowLogo } from '../../components/brand/RentFlowLogo';

import { GOOGLE_CLIENT_ID } from '../../config/google';

export const LoginView: React.FC = () => {
  const setAuthenticating = useAuthStore((s) => s.setAuthenticating);
  const setGoogleSession = useAuthStore((s) => s.setGoogleSession);
  const isAuthenticating = useAuthStore((s) => s.isAuthenticating);
  const authError = useAuthStore((s) => s.authError);

  const [statusText, setStatusText] = useState<string | null>(null);

  const googleClientId = GOOGLE_CLIENT_ID;

  const handleGoogleSignIn = useGoogleLogin({
    scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata',
    prompt: 'consent',
    onSuccess: async (tokenResponse) => {
      try {
        setAuthenticating(true, null);
        setStatusText('Google OAuth Authorized! Fetching user profile...');

        const accessToken = tokenResponse.access_token;

        // 1. Fetch real user profile from Google UserInfo
        const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!userinfoRes.ok) {
          throw new Error('Failed to retrieve user profile from Google UserInfo API.');
        }

        const userinfo = await userinfoRes.json();

        // 2. Pull & Restore cloud backup if local DB is empty
        setStatusText('Checking cloud storage for existing backup...');
        const restored = await pullFromGoogleDrive(accessToken, userinfo.sub);
        
        // 3. Search for existing RentFlowBackup.enc or create if new user
        setStatusText('Accessing Google Drive appDataFolder...');
        const driveFileId = (await findDriveBackupFile(accessToken)) || '';

        // 4. Unlock app session
        setStatusText('Authorization & Drive setup successful!');
        setGoogleSession(
          {
            sub: userinfo.sub,
            email: userinfo.email,
            name: userinfo.name,
            picture: userinfo.picture,
          },
          accessToken,
          driveFileId
        );

        if (restored) {
          setStatusText('Cloud backup successfully restored! Reloading dashboard...');
          setTimeout(() => window.location.reload(), 600);
          return;
        }
      } catch (err: any) {
        console.error('Google Sign-In post-processing error:', err);
        setAuthenticating(false, err.message || 'Failed to complete Google Drive initialization.');
      } finally {
        setStatusText(null);
      }
    },
    onError: (errorResponse) => {
      console.error('Google Sign-In Error:', errorResponse);
      setAuthenticating(false, 'Google Sign-In popup was closed or authorization failed.');
    },
  });

  if (!googleClientId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)] p-6">
        <Card className="p-8 max-w-md w-full text-center space-y-4 border-rose-500/30 bg-rose-500/5">
          <AlertCircle className="w-12 h-12 text-rose-600 mx-auto" />
          <h2 className="text-lg font-bold text-rose-700 dark:text-rose-300">
            Missing Google Client ID
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            <code className="font-mono font-bold">VITE_GOOGLE_CLIENT_ID</code> is missing from your environment. Please ensure it is defined in your <code className="font-mono font-bold">.env</code> file.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-base)] p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-md space-y-6 text-center my-auto">
        {/* Brand Header */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-md mb-4">
            <RentFlowLogo size={36} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            RentFlow Property Manager
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs">
            Offline-First Rental Ledger &bull; Zero-Knowledge Google Drive Redundancy
          </p>
        </div>

        {/* Login Container Card */}
        <Card className="p-6 sm:p-8 space-y-6 text-left border border-[var(--border-strong)] rounded-2xl shadow-lg bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Google Account Sign In
            </span>
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>AES-256-GCM Private</span>
            </Badge>
          </div>

          <div className="space-y-3.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                <Folder className="w-3.5 h-3.5" />
              </div>
              <div>
                <strong className="text-[var(--text-primary)]">Private Hidden App Data:</strong>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Creates <code className="font-mono text-[10px] bg-[var(--bg-base)] px-1 py-0.5 rounded">RentFlowBackup.enc</code> inside Google Drive's hidden <code className="font-mono text-[10px] bg-[var(--bg-base)] px-1 py-0.5 rounded">appDataFolder</code>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div>
                <strong className="text-[var(--text-primary)]">Zero-Knowledge Encryption:</strong>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  All databases are client-encrypted using AES-256-GCM with a secret key derived from your real Google ID before leaving your device.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <Database className="w-3.5 h-3.5" />
              </div>
              <div>
                <strong className="text-[var(--text-primary)]">Automated Sync:</strong>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Changes sync silently in the background 5 seconds after any local database update.
                </p>
              </div>
            </div>
          </div>

          {isAuthenticating && (
            <div className="p-3.5 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-xs text-[var(--accent)] flex items-center gap-3">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <div>
                <strong className="block font-semibold">Authenticating with Google...</strong>
                <span className="text-[11px] opacity-90">{statusText || 'Opening Google OAuth Popup...'}</span>
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
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              className="w-full py-3 h-12 gap-3 font-semibold text-sm rounded-xl cursor-pointer shadow-md transition-all active:scale-[0.99]"
              onClick={() => {
                setAuthenticating(true, null);
                setStatusText('Opening Google OAuth Popup...');
                handleGoogleSignIn();
              }}
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
            <p className="text-[10px] font-mono text-[var(--text-secondary)] mt-3 text-center break-all bg-[var(--bg-base)] p-1.5 rounded border border-[var(--border-subtle)] select-all">
              Debugging ID: {GOOGLE_CLIENT_ID}
            </p>
          </div>
        </Card>

        <p className="text-[11px] text-[var(--text-secondary)]">
          RentFlow Property Manager &bull; Google OAuth 2.0 Protected
        </p>
      </div>
    </div>
  );
};
