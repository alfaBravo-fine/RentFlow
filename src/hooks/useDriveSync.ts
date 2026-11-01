import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { db } from '../db/client';
import { encryptWithGoogleId, decryptWithGoogleId } from '../lib/driveCrypto';
import {
  findDriveBackupFile,
  uploadEncryptedBackupToDrive,
  downloadEncryptedBackupFromDrive,
} from '../lib/googleDriveService';
import { Property, Tenant } from '../db/schema';

export type SyncState = 'idle' | 'pending' | 'syncing' | 'synced' | 'error';

export function useDriveSync() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const driveFileId = useAuthStore((s) => s.driveFileId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    return localStorage.getItem('rentflow_last_drive_sync') || null;
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);

  // Perform upload to Google Drive appdata (AES-256-GCM encrypted)
  const triggerUpload = useCallback(async () => {
    if (!user || !accessToken || isSyncingRef.current) {
      console.warn('[useDriveSync] Skipped triggerUpload because missing user/accessToken or already syncing.');
      return;
    }

    try {
      isSyncingRef.current = true;
      setSyncState('syncing');
      setSyncError(null);

      console.log('[useDriveSync] Starting immediate database backup to Google Drive...');

      // 1. Export local database snapshot
      const snapshot = db.exportAllData();
      const payload = {
        app: 'RentFlow',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        userId: user.sub,
        userEmail: user.email,
        data: snapshot,
      };

      // 2. Encrypt using AES-256-GCM with key derived from user.sub
      const encryptedBytes = await encryptWithGoogleId(JSON.stringify(payload), user.sub);

      // 3. Search for file ID if missing
      let targetFileId = driveFileId;
      if (!targetFileId) {
        targetFileId = await findDriveBackupFile(accessToken);
      }

      // 4. Perform multipart upload to Google Drive REST API
      const result = await uploadEncryptedBackupToDrive(accessToken, targetFileId, encryptedBytes);

      setSyncState('synced');
      setLastSyncedAt(result.syncedAt);
      localStorage.setItem('rentflow_last_drive_sync', result.syncedAt);
      if (result.fileId) {
        localStorage.setItem('rentflow_google_drive_file_id', result.fileId);
      }
      console.log('[useDriveSync] Force Sync Upload Completed Successfully!');
    } catch (err: any) {
      console.error('[useDriveSync] Drive upload error:', err);
      setSyncState('error');
      setSyncError(err.message || 'Auto-sync upload failed');
    } finally {
      isSyncingRef.current = false;
    }
  }, [user, accessToken, driveFileId]);

  // 1. App Startup: Download & decrypt backup if local DB is empty
  useEffect(() => {
    if (!isAuthenticated || !user || !accessToken) return;

    const checkAndRestoreOnStartup = async () => {
      const properties = db.getTable<Property>('properties');
      const tenants = db.getTable<Tenant>('tenants');

      // Only download on startup if local DB is empty
      if (properties.length === 0 && tenants.length === 0) {
        try {
          setSyncState('syncing');
          let targetFileId = driveFileId;
          if (!targetFileId) {
            targetFileId = await findDriveBackupFile(accessToken);
          }

          if (targetFileId) {
            const encryptedBytes = await downloadEncryptedBackupFromDrive(accessToken, targetFileId);
            if (encryptedBytes && encryptedBytes.length >= 12) {
              const decryptedJson = await decryptWithGoogleId(encryptedBytes, user.sub);
              const parsed = JSON.parse(decryptedJson);
              if (parsed.data) {
                db.importAllData(parsed.data);
                setSyncState('synced');
                setLastSyncedAt(new Date().toISOString());
                console.log('Successfully restored cloud backup from Google Drive appDataFolder.');
              }
            } else {
              setSyncState('idle');
            }
          } else {
            setSyncState('idle');
          }
        } catch (err: any) {
          console.warn('Could not restore startup backup from Drive:', err);
          setSyncState('idle');
        }
      }
    };

    checkAndRestoreOnStartup();
  }, [isAuthenticated, user, accessToken, driveFileId]);

  // 2. Debounced 5-second automatic sync trigger on DB write
  useEffect(() => {
    if (!isAuthenticated || !user || !accessToken) return;

    const unsubscribe = db.onWrite(() => {
      setSyncState('pending');

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        triggerUpload();
      }, 5000);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isAuthenticated, user, accessToken, triggerUpload]);

  return {
    syncState,
    lastSyncedAt,
    syncError,
    syncNow: triggerUpload,
  };
}
