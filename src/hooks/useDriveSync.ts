import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { db } from '../db/client';
import { encryptWithGoogleId } from '../lib/driveCrypto';
import {
  findDriveBackupFile,
  uploadEncryptedBackupToDrive,
  syncOnStartup,
} from '../lib/googleDriveService';
import { isTauri, tauriDrivePushBackup, tauriDrivePullBackup } from '../lib/tauri/bridge';

export type SyncState = 'idle' | 'pending' | 'syncing' | 'synced' | 'error';

export function useDriveSync() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const driveFileId = useAuthStore((s) => s.driveFileId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    return localStorage.getItem('rentflow_last_drive_sync') || null;
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  const isSyncingRef = useRef(false);
  const hasQueuedSyncRef = useRef(false);

  // Perform upload to Google Drive appdata (AES-256-GCM encrypted)
  const triggerUpload = useCallback(async () => {
    if (!user || !accessToken) {
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
        // Execute Google Drive sync push entirely in Rust backend using reqwest
        const result = await tauriDrivePushBackup(user.sub);
        setSyncState('synced');
        setLastSyncedAt(result.synced_at);
        localStorage.setItem('rentflow_last_drive_sync', result.synced_at);
        if (result.file_id) {
          localStorage.setItem('rentflow_google_drive_file_id', result.file_id);
        }
      } else {
        // Web mode: client-side multipart upload
        const snapshot = db.exportAllData();
        const payload = {
          app: 'RentFlow',
          version: '2.0.0',
          exportedAt: new Date().toISOString(),
          userId: user.sub,
          userEmail: user.email,
          data: snapshot,
        };

        const encryptedBytes = await encryptWithGoogleId(JSON.stringify(payload), user.sub);

        let targetFileId = driveFileId;
        if (!targetFileId) {
          targetFileId = await findDriveBackupFile(accessToken);
        }

        const result = await uploadEncryptedBackupToDrive(accessToken, targetFileId, encryptedBytes);

        setSyncState('synced');
        setLastSyncedAt(result.syncedAt);
        localStorage.setItem('rentflow_last_drive_sync', result.syncedAt);
        if (result.fileId) {
          localStorage.setItem('rentflow_google_drive_file_id', result.fileId);
        }
      }
    } catch (err: any) {
      console.warn('[useDriveSync] Drive upload error:', err);
      setSyncState('error');
      setSyncError(err.message || 'Auto-sync upload failed');
    } finally {
      isSyncingRef.current = false;
      if (hasQueuedSyncRef.current) {
        hasQueuedSyncRef.current = false;
        triggerUpload();
      }
    }
  }, [user, accessToken, driveFileId]);

  // 1. Startup Pull / Cross-Device Restore: Download & decrypt backup if remote is newer or local is empty
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let isMounted = true;
    const runStartupSync = async () => {
      try {
        setIsRestoring(true);
        setSyncState('syncing');

        if (isTauri()) {
          // Pull and restore in Rust backend
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

function isAutoSyncEnabled(): boolean {
  try {
    return localStorage.getItem('rentflow_auto_sync_enabled') !== 'false';
  } catch {
    return true;
  }
}

  // 2. Zero-delay instant sync on DB write
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const unsubscribe = db.onWrite(() => {
      if (isAutoSyncEnabled()) {
        triggerUpload();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, user, triggerUpload]);

  // 3. Instant sync on tab close / beforeunload
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const handleBeforeUnload = () => {
      if (isAutoSyncEnabled() && !isSyncingRef.current) {
        triggerUpload();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated, user, triggerUpload]);

  return {
    syncState,
    lastSyncedAt,
    syncError,
    isRestoring,
    syncNow: triggerUpload,
  };
}
