import { GOOGLE_CLIENT_ID } from '../config/google';
import { decryptWithGoogleId } from './driveCrypto';
import { db } from '../db/client';
import { Property, Tenant } from '../db/schema';

const APP_DATA_BACKUP_FILENAME = 'RentFlowBackup.enc';

export interface DriveFileItem {
  id: string;
  name: string;
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
 * 1. Searches for existing RentFlowBackup.enc inside Google Drive appDataFolder.
 * Returns the Google Drive file ID if found, or null if not found.
 */
export async function findDriveBackupFile(accessToken: string): Promise<string | null> {
  console.log('TOKEN (Search):', accessToken);
  if (!accessToken || accessToken === 'undefined' || accessToken.startsWith('mock')) {
    return null;
  }

  const queryUrl = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${APP_DATA_BACKUP_FILENAME}%27%20and%20trashed%3Dfalse&fields=files(id%2Cname)`;

  try {
    const res = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken,
      },
    });

    if (res.status === 401) {
      console.warn('[Google Drive API] HTTP 401 Unauthorized - Token expired during search. Re-authenticating...');
      localStorage.removeItem('rentflow_google_access_token');
      try {
        const freshToken = await requestFreshAccessToken(
          GOOGLE_CLIENT_ID,
          'openid email profile https://www.googleapis.com/auth/drive.appdata'
        );
        if (freshToken) {
          localStorage.setItem('rentflow_google_access_token', freshToken);
          return findDriveBackupFile(freshToken);
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
      return data.files[0].id;
    }
  } catch (err) {
    console.error('[Google Drive API] Error searching appDataFolder:', err);
  }
  return null;
}

/**
 * 2. Uploads AES-256-GCM encrypted snapshot payload directly to Google Drive appDataFolder using FormData multipart/form-data.
 */
export async function uploadEncryptedBackupToDrive(
  accessToken: string,
  existingFileId: string | null,
  encryptedBytes: Uint8Array
): Promise<{ fileId: string; syncedAt: string }> {
  console.log('TOKEN:', accessToken);

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
    console.warn('[Google Drive Upload] 401 Unauthorized. Attempting token refresh...');
    localStorage.removeItem('rentflow_google_access_token');
    try {
      const freshToken = await requestFreshAccessToken(
        GOOGLE_CLIENT_ID,
        'openid email profile https://www.googleapis.com/auth/drive.appdata'
      );
      if (freshToken) {
        localStorage.setItem('rentflow_google_access_token', freshToken);
        console.log('TOKEN (Refreshed):', freshToken);

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
  console.log('[Google Drive Upload] Status:', res.status, res.statusText);
  console.log('[Google Drive Upload] Response:', responseText);

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
  console.log('TOKEN (Download):', accessToken);
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
 * 4. Pulls and restores database backup from Google Drive appDataFolder if local DB is empty.
 */
export async function pullFromGoogleDrive(accessToken: string, googleId: string): Promise<boolean> {
  const properties = db.getTable<Property>('properties');
  const tenants = db.getTable<Tenant>('tenants');

  if (properties.length > 0 || tenants.length > 0) {
    console.log('[Google Drive Pull] Local database is not empty. Skipping cloud restore.');
    return false;
  }

  console.log('[Google Drive Pull] Local database is empty. Searching appDataFolder for RentFlowBackup.enc...');
  const fileId = await findDriveBackupFile(accessToken);
  if (!fileId) {
    console.log('[Google Drive Pull] No backup file found in appDataFolder.');
    return false;
  }

  console.log('[Google Drive Pull] Downloading encrypted backup file ID:', fileId);
  const encryptedBytes = await downloadEncryptedBackupFromDrive(accessToken, fileId);
  if (!encryptedBytes || encryptedBytes.length < 12) {
    console.warn('[Google Drive Pull] Downloaded backup is empty or invalid.');
    return false;
  }

  console.log('[Google Drive Pull] Decrypting backup using Google ID key...');
  const decryptedJson = await decryptWithGoogleId(encryptedBytes, googleId);
  const parsed = JSON.parse(decryptedJson);

  if (parsed && parsed.data) {
    console.log('[Google Drive Pull] Restoring local database from Google Drive backup...');
    db.importAllData(parsed.data);
    localStorage.setItem('rentflow_last_drive_sync', new Date().toISOString());
    localStorage.setItem('rentflow_google_drive_file_id', fileId);
    return true;
  }

  return false;
}
