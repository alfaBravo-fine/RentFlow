import React, { useState } from 'react';
import { Search, Sun, Moon, LogIn, LogOut, RefreshCw, Copy, Globe } from '../icons';
import { getStoredUser, initiateGoogleSignIn, signOutGoogle, GoogleUser } from '../../lib/google/auth';
import { syncEngine } from '../../lib/sync';
import { listAllPacks, getCountryPack } from '../../countries/resolver';
import { usePackStore } from '../../countries/usePack';
import { useToast } from '../toast/ToastContext';
import { CommandPalette } from './CommandPalette';
import { QuickCopyPanel } from './QuickCopyPanel';

export interface TopbarProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ isDarkMode, onToggleTheme }) => {
  const [user, setUser] = useState<GoogleUser | null>(getStoredUser());
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isQuickCopyOpen, setIsQuickCopyOpen] = useState(false);

  const countryCode = usePackStore((s) => s.countryCode);
  const setCountryCode = usePackStore((s) => s.setCountryCode);
  const { showToast } = useToast();

  const pendingSyncs = syncEngine.getPendingCount();
  const packs = listAllPacks();

  const handlePackChange = (code: string) => {
    setCountryCode(code);
    const p = getCountryPack(code);
    showToast({
      type: 'success',
      message: `Switched region to ${p.name} (${p.currency.code})`,
    });
  };

  const handleSignIn = async () => {
    const u = await initiateGoogleSignIn();
    setUser(u);
    showToast({ type: 'success', message: `Signed in as ${u.name}` });
  };

  const handleSignOut = () => {
    signOutGoogle();
    setUser(null);
    showToast({ type: 'info', message: 'Signed out of Google Drive' });
  };

  return (
    <>
      <header className="h-14 border-b border-[var(--border)] bg-[var(--surface-raised)] px-6 flex items-center justify-between shrink-0">
        {/* Left: Command Search & Quick-Copy Trigger */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCommandOpen(true)}
            className="flex items-center gap-3 px-3 py-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-muted)] hover:border-[var(--border-strong)] transition-colors w-64 justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
              <span>Search or jump to...</span>
            </div>
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-subtle)]">
              ⌘K
            </kbd>
          </button>

          {/* Quick-Copy Utility Tool Button */}
          <button
            onClick={() => setIsQuickCopyOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors cursor-pointer"
            title="Open Quick-Copy Utility Drawer"
          >
            <Copy className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Quick-Copy</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Global Country Pack Selector (Reactive Zustand) */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text)]">
            <Globe className="w-3.5 h-3.5 text-[var(--accent)]" />
            <select
              value={countryCode}
              onChange={(e) => handlePackChange(e.target.value)}
              className="bg-transparent border-0 focus:outline-none cursor-pointer font-semibold text-xs"
            >
              {packs.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.flag} {p.currency.code} ({p.code})
                </option>
              ))}
            </select>
          </div>

          {/* Sync status queue badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs font-mono text-[var(--text-muted)]">
            <RefreshCw className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
            <span>{pendingSyncs > 0 ? `${pendingSyncs} queued` : 'Synced'}</span>
          </div>

          {/* Light / Dark Mode Toggle */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors focus-ring cursor-pointer"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* User Profile / Google Sign-In */}
          {user ? (
            <div className="flex items-center gap-2 border-l border-[var(--border)] pl-3">
              <div className="w-7 h-7 rounded-full bg-[var(--accent)] text-white text-xs font-semibold flex items-center justify-center">
                {user.name[0]}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-medium text-[var(--text)] line-clamp-1">{user.name}</span>
                <span className="text-[10px] text-[var(--text-subtle)] line-clamp-1">{user.email}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-md text-[var(--text-subtle)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--surface)] cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Google Drive Auth</span>
            </button>
          )}
        </div>
      </header>

      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />
      <QuickCopyPanel isOpen={isQuickCopyOpen} onClose={() => setIsQuickCopyOpen(false)} />
    </>
  );
};
