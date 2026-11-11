import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { db } from '../db/client';
import {
  backupToDrive,
  restoreFromDrive,
  syncOnStartup,
  isNonOAuthToken,
} from '../lib/googleDriveService';
import { isTauri, tauriDrivePushBackup, tauriDrivePullBackup } from '../lib/tauri/bridge';

export type SyncState = 'idle' | 'pending' | 'syncing' | 'synced' | 'error';

function isAutoSyncEnabled(): boolean {
  try {
    return localStorage.getItem('rentflow_auto_sync_enabled') !== 'false';
  } catch {
    return true;
  }
}

export function useDriveSync() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    return localStorage.getItem('rentflow_last_drive_sync') || null;
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  const isSyncingRef = useRef(false);
  const hasQueuedSyncRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Perform upload to Google Drive appdata (AES-256-GCM encrypted RentFlow_FullBackup.enc)
  const triggerUpload = useCallback(async () => {
    if (!user || !accessToken) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // In Web Demo / local-only sessions, skip remote Google Drive HTTP calls so we never trigger 401 loops
    if (!isTauri() && isNonOAuthToken(accessToken)) {
      const nowIso = new Date().toISOString();
      setSyncState('synced');
      setSyncError(null);
      setLastSyncedAt(nowIso);
      localStorage.setItem('rentflow_last_drive_sync', nowIso);
      return;
    }

    if (isSyncingRef.current) {
      hasQueuedSyncRef.current = true;
      return;
    }

    try {
      isSyncingRef.current = true;
      setSyncState('syncing');
      setSyncError(null);

      if (isTauri()) {
        const result = await tauriDrivePushBackup(user.sub);
        setSyncState('synced');
        setLastSyncedAt(result.synced_at);
        localStorage.setItem('rentflow_last_drive_sync', result.synced_at);
        if (result.file_id) {
          localStorage.setItem('rentflow_google_drive_file_id', result.file_id);
        }
      } else {
        const result = await backupToDrive(accessToken, user.sub);
        setSyncState('synced');
        setLastSyncedAt(result.syncedAt);
        localStorage.setItem('rentflow_last_drive_sync', result.syncedAt);
        if (result.fileId) {
          localStorage.setItem('rentflow_google_drive_file_id', result.fileId);
        }
      }
    } catch (err: unknown) {
      console.warn('[useDriveSync] Drive upload error:', err);
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Auto-sync upload failed';
      setSyncState('error');
      setSyncError(msg);
    } finally {
      isSyncingRef.current = false;
      if (hasQueuedSyncRef.current) {
        hasQueuedSyncRef.current = false;
        triggerUpload();
      }
    }
  }, [user, accessToken]);

  // Perform restore from Google Drive appdata (download RentFlow_FullBackup.enc, decrypt, wipe & repopulate)
  const triggerRestore = useCallback(async () => {
    if (!user || !accessToken) {
      throw new Error('Please sign in with Google to restore your portfolio from Google Drive.');
    }

    setIsRestoring(true);
    setSyncState('syncing');
    setSyncError(null);

    try {
      if (isTauri()) {
        const result = await tauriDrivePullBackup(user.sub);
        if (result.restored) {
          setSyncState('synced');
          const syncedTime = localStorage.getItem('rentflow_last_drive_sync') || new Date().toISOString();
          setLastSyncedAt(syncedTime);
        } else {
          setSyncState('idle');
        }
        return { restored: result.restored, message: result.message, totalRecords: 0 };
      } else {
        const result = await restoreFromDrive(accessToken, user.sub);
        if (result.restored) {
          setSyncState('synced');
          const syncedTime = localStorage.getItem('rentflow_last_drive_sync') || new Date().toISOString();
          setLastSyncedAt(syncedTime);
        } else {
          setSyncState('idle');
        }
        return result;
      }
    } catch (err: any) {
      console.warn('[useDriveSync] Restore error:', err);
      const msg = err?.message || 'Restore from Google Drive failed';
      setSyncState('error');
      setSyncError(msg);
      throw err;
    } finally {
      setIsRestoring(false);
    }
  }, [user, accessToken]);

  // 1. Startup Pull / Cross-Device Restore: Download & decrypt backup if remote is newer or local is empty
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    if (!isTauri() && isNonOAuthToken(accessToken)) {
      setIsRestoring(false);
      setSyncState('idle');
      setSyncError(null);
      return;
    }

    let isMounted = true;
    const runStartupSync = async () => {
      try {
        setIsRestoring(true);
        setSyncState('syncing');

        if (isTauri()) {
          const result = await tauriDrivePullBackup(user.sub);
          if (!isMounted) return;

          if (result.restored) {
            setSyncState('synced');
            const syncedTime = localStorage.getItem('rentflow_last_drive_sync') || new Date().toISOString();
            setLastSyncedAt(syncedTime);
          } else {
            setSyncState('idle');
          }
        } else if (accessToken) {
          const result = await syncOnStartup(accessToken, user.sub);
          if (!isMounted) return;

          if (result.restored) {
            setSyncState('synced');
            const syncedTime = localStorage.getItem('rentflow_last_drive_sync') || new Date().toISOString();
            setLastSyncedAt(syncedTime);
          } else {
            setSyncState('idle');
          }
        }
      } catch (err: any) {
        console.warn('[useDriveSync] Startup sync warning:', err);
        if (isMounted) {
          setSyncState('idle');
        }
      } finally {
        if (isMounted) {
          setIsRestoring(false);
        }
      }
    };

    runStartupSync();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user, accessToken]);

  // 2. Debounced background sync on DB write (coalesces bulk inserts/seeding)
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const unsubscribe = db.onWrite(() => {
      if (!isAutoSyncEnabled()) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setSyncState('pending');
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        triggerUpload();
      }, 2000);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [isAuthenticated, user, triggerUpload]);

  // 3. Flush pending sync on tab close / beforeunload
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const handleBeforeUnload = () => {
      if (isAutoSyncEnabled() && !isSyncingRef.current && (!isTauri() ? !isNonOAuthToken(accessToken) : true)) {
        triggerUpload();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated, user, accessToken, triggerUpload]);

  return {
    syncState,
    lastSyncedAt,
    syncError,
    isRestoring,
    syncNow: triggerUpload,
    backupToDrive: triggerUpload,
    restoreFromDrive: triggerRestore,
  };
}
