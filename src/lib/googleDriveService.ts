import { GOOGLE_CLIENT_ID } from '../config/google';
import { decryptWithGoogleId } from './driveCrypto';
import { db } from '../db/client';
import { Property, Tenant } from '../db/schema';

const APP_DATA_BACKUP_FILENAME = 'RentFlowBackup.enc';

export interface DriveFileItem {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface DriveFileListResponse {
  files: DriveFileItem[];
}

/**
 * Requests a fresh access token using Google Identity Services requestAccessToken() (silent refresh / popup).
 */
export function requestFreshAccessToken(clientId: string, scope: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services SDK not loaded'));
      return;
    }

    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: scope,
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error('Failed to obtain access token from Google OAuth2 client'));
          }
        },
      });

      client.requestAccessToken({ prompt: '' });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 1. Searches for existing RentFlowBackup.enc inside Google Drive appDataFolder with full metadata.
 */
export async function findDriveBackupFileItem(accessToken: string): Promise<DriveFileItem | null> {
  if (!accessToken || accessToken === 'undefined' || accessToken.startsWith('mock')) {
    return null;
  }

  const queryUrl = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${APP_DATA_BACKUP_FILENAME}%27%20and%20trashed%3Dfalse&fields=files(id%2Cname%2CmodifiedTime)`;

  try {
    const res = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken,
      },
    });

    if (res.status === 401) {
      console.warn('[Google Drive API] HTTP 401 Unauthorized - Attempting silent token refresh...');
      localStorage.removeItem('rentflow_google_access_token');
      try {
        const freshToken = await requestFreshAccessToken(
          GOOGLE_CLIENT_ID,
          'openid email profile https://www.googleapis.com/auth/drive.appdata'
        );
        if (freshToken) {
          localStorage.setItem('rentflow_google_access_token', freshToken);
          return findDriveBackupFileItem(freshToken);
        }
      } catch {
        console.warn('Cloud sync paused: Re-login required.');
      }
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const resText = await res.text();
    const data: DriveFileListResponse = JSON.parse(resText);
    if (data.files && data.files.length > 0) {
      return data.files[0];
    }
  } catch (err) {
    console.error('[Google Drive API] Error searching appDataFolder:', err);
  }
  return null;
}

export async function findDriveBackupFile(accessToken: string): Promise<string | null> {
  const item = await findDriveBackupFileItem(accessToken);
  return item ? item.id : null;
}

/**
 * 2. Uploads AES-256-GCM encrypted snapshot payload directly to Google Drive appDataFolder using FormData multipart/form-data.
 */
export async function uploadEncryptedBackupToDrive(
  accessToken: string,
  existingFileId: string | null,
  encryptedBytes: Uint8Array
): Promise<{ fileId: string; syncedAt: string }> {
  if (!accessToken || accessToken === 'undefined' || accessToken.startsWith('mock')) {
    throw new Error('Cloud sync paused: Invalid or missing Google access token.');
  }

  const formData = new FormData();
  let endpointUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  let method = 'POST';

  if (existingFileId) {
    endpointUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
    method = 'PATCH';
    const metadata = { name: APP_DATA_BACKUP_FILENAME };
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  } else {
    const metadata = {
      name: APP_DATA_BACKUP_FILENAME,
      parents: ['appDataFolder'],
    };
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  }

  const fileBlob = new Blob([encryptedBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  formData.append('file', fileBlob);

  let res = await fetch(endpointUrl, {
    method: method,
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
    body: formData,
  });

  if (res.status === 401) {
    console.warn('[Google Drive Upload] 401 Unauthorized. Attempting silent token refresh...');
    localStorage.removeItem('rentflow_google_access_token');
    try {
      const freshToken = await requestFreshAccessToken(
        GOOGLE_CLIENT_ID,
        'openid email profile https://www.googleapis.com/auth/drive.appdata'
      );
      if (freshToken) {
        localStorage.setItem('rentflow_google_access_token', freshToken);

        const retryFormData = new FormData();
        if (existingFileId) {
          retryFormData.append('metadata', new Blob([JSON.stringify({ name: APP_DATA_BACKUP_FILENAME })], { type: 'application/json' }));
        } else {
          retryFormData.append('metadata', new Blob([JSON.stringify({ name: APP_DATA_BACKUP_FILENAME, parents: ['appDataFolder'] })], { type: 'application/json' }));
        }
        retryFormData.append('file', fileBlob);

        res = await fetch(endpointUrl, {
          method: method,
          headers: {
            Authorization: 'Bearer ' + freshToken,
          },
          body: retryFormData,
        });
      }
    } catch {
      throw new Error('Cloud sync paused: Re-login required.');
    }
  }

  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`Google Drive Upload Failed (HTTP ${res.status}): ${responseText}`);
  }

  let fileId = existingFileId || '';
  try {
    const jsonRes = JSON.parse(responseText);
    if (jsonRes.id) {
      fileId = jsonRes.id;
    }
  } catch {
    // ignore
  }

  return { fileId, syncedAt: new Date().toISOString() };
}

/**
 * 3. Downloads AES-256-GCM encrypted snapshot payload from Google Drive.
 */
export async function downloadEncryptedBackupFromDrive(
  accessToken: string,
  fileId: string
): Promise<Uint8Array | null> {
  if (!accessToken || accessToken === 'undefined' || accessToken.startsWith('mock')) {
    return null;
  }

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  try {
    const res = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken,
      },
    });

    if (res.status === 401) {
      localStorage.removeItem('rentflow_google_access_token');
      try {
        const freshToken = await requestFreshAccessToken(
          GOOGLE_CLIENT_ID,
          'openid email profile https://www.googleapis.com/auth/drive.appdata'
        );
        if (freshToken) {
          localStorage.setItem('rentflow_google_access_token', freshToken);
          return downloadEncryptedBackupFromDrive(freshToken, fileId);
        }
      } catch {
        // ignore
      }
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;

    return new Uint8Array(arrayBuffer);
  } catch {
    return null;
  }
}

/**
 * 4. Cross-Device syncOnStartup: Checks appDataFolder for RentFlowBackup.enc.
 * If file exists and local DB is empty OR remote modifiedTime is newer than local lastSyncTime,
 * downloads, decrypts, and updates local database.
 */
export async function syncOnStartup(
  accessToken: string,
  googleId: string
): Promise<{ restored: boolean; message: string }> {
  try {
    const item = await findDriveBackupFileItem(accessToken);
    if (!item) {
      return { restored: false, message: 'No remote backup found' };
    }

    const localSyncTime = localStorage.getItem('rentflow_last_drive_sync');
    const properties = db.getTable<Property>('properties');
    const tenants = db.getTable<Tenant>('tenants');
    const isLocalEmpty = properties.length === 0 && tenants.length === 0;

    const isRemoteNewer = Boolean(
      item.modifiedTime &&
      localSyncTime &&
      new Date(item.modifiedTime).getTime() > new Date(localSyncTime).getTime()
    );

    if (isLocalEmpty || isRemoteNewer) {
      console.log('[syncOnStartup] Remote backup is newer or local DB is empty. Restoring...');
      const encryptedBytes = await downloadEncryptedBackupFromDrive(accessToken, item.id);
      if (encryptedBytes && encryptedBytes.length >= 12) {
        const decryptedJson = await decryptWithGoogleId(encryptedBytes, googleId);
        const parsed = JSON.parse(decryptedJson);
        if (parsed && parsed.data) {
          db.importAllData(parsed.data);
          localStorage.setItem('rentflow_last_drive_sync', item.modifiedTime || new Date().toISOString());
          localStorage.setItem('rentflow_google_drive_file_id', item.id);
          return { restored: true, message: 'Restored from Google Drive' };
        }
      }
    }

    return { restored: false, message: 'Local database is current' };
  } catch (err: any) {
    console.warn('[syncOnStartup] Error:', err);
    return { restored: false, message: err.message || 'Sync check failed' };
  }
}

export async function pullFromGoogleDrive(accessToken: string, googleId: string): Promise<boolean> {
  const result = await syncOnStartup(accessToken, googleId);
  return result.restored;
}
