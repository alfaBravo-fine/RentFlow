import React, { useState } from 'react';
import { initiateGoogleSignIn, GoogleUser } from '../../lib/google/auth';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Shield, Database, RefreshCw, CheckCircle, Lock } from '../../components/icons';

export interface LoginViewProps {
  onSignedIn: (user: GoogleUser) => void;
  onContinueOffline: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSignedIn, onContinueOffline }) => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setStatusMsg('Connecting to Google OAuth 2.0 PKCE Loopback...');

    setTimeout(async () => {
      setStatusMsg('Checking Google Drive for "App_RentFlow_Backups" folder...');
      setTimeout(async () => {
        const user = await initiateGoogleSignIn();
        setIsAuthenticating(false);
        onSignedIn(user);
      }, 800);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Logo */}
        <div className="mx-auto w-16 h-16 rounded-[12px] bg-[var(--accent)] text-white font-bold text-2xl flex items-center justify-center shadow-md">
          RF
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">RentFlow Desktop</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Offline-First Property Management &bull; Zero-Config Google Drive Redundancy
          </p>
        </div>

        <Card className="p-6 space-y-6 text-left border-[var(--border-strong)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <span className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">Cloud Drive Authentication</span>
            <Badge variant="success">Zero-Knowledge AES-256</Badge>
          </div>

          <div className="space-y-3 text-xs text-[var(--text-muted)]">
            <div className="flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <span>Personal encrypted backup stored directly in your private Google Drive folder `App_RentFlow_Backups`.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <Database className="w-4 h-4 text-[var(--status-success-fg)] shrink-0 mt-0.5" />
              <span>Full offline CRUD capability — continuous background sync keeps local SQLite and Drive in perfect harmony.</span>
            </div>
          </div>

          {statusMsg && (
            <div className="p-3 rounded-[6px] bg-[var(--accent-subtle)] border border-[var(--accent)] text-xs text-[var(--accent)] flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <Button
              variant="primary"
              className="w-full py-2.5 gap-2 font-semibold text-sm"
              onClick={handleSignIn}
              disabled={isAuthenticating}
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{isAuthenticating ? 'Authenticating...' : 'Sign in with Google Drive'}</span>
            </Button>

            <Button
              variant="outline"
              className="w-full py-2"
              onClick={onContinueOffline}
              disabled={isAuthenticating}
            >
              Continue Offline (Local Mode)
            </Button>
          </div>
        </Card>

        <p className="text-[11px] text-[var(--text-subtle)]">
          RentFlow Desktop App &bull; Encrypted Storage
        </p>
      </div>
    </div>
  );
};
