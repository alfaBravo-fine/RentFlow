import { encryptWithGoogleId, decryptWithGoogleId, uint8ArrayToBase64, base64ToUint8Array } from './driveCrypto';
import { GOOGLE_CLIENT_ID } from '../config/google';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface BackupSyncResult {
  success: boolean;
  synced_at: string;
  file_id?: string;
  message: string;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const STORAGE_USER_KEY = 'rentflow_google_user';
const STORAGE_ACCESS_TOKEN_KEY = 'rentflow_google_access_token';
const APP_DATA_BACKUP_FILENAME = 'RentFlowBackup.enc';

/**
 * Ensures Google Drive hidden appDataFolder backup file exists
 */
export async function ensureWebGoogleDriveAppFolder(token: string): Promise<string> {
  // 1. Search existing RentFlowBackup.enc in appDataFolder
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${APP_DATA_BACKUP_FILENAME}%27%20and%20trashed%3Dfalse&fields=files(id%2Cname)`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (listRes.ok) {
    const data = await listRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // 2. Create RentFlowBackup.enc in appDataFolder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: APP_DATA_BACKUP_FILENAME,
      parents: ['appDataFolder'],
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.warn('Drive file creation warning:', errText);
  }

  const created = await createRes.json();
  return created.id || 'drive_appdata_file_rentflow';
}

/**
 * Real Google Login execution: Tauri Rust system browser or Web OAuth 2.0 flow
 */
export async function tauriGoogleLogin(): Promise<UserProfile> {
  const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID;
  console.log('[RentFlow Auth Debug] import.meta.env.VITE_GOOGLE_CLIENT_ID:', envClientId);

  // 1. Desktop Tauri Environment
  if (isTauri()) {
    console.log('[RentFlow Auth Debug] Running in Tauri environment. Invoking google_login Rust command...');
    const { invoke } = await import('@tauri-apps/api/core');
    const profile = await invoke<UserProfile>('google_login');
    console.log('[RentFlow Auth Debug] Tauri google_login returned real user profile:', profile);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(profile));
    return profile;
  }

  // 2. Web Browser Environment - Real OAuth 2.0 Popup
  if (!envClientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured in .env file.');
  }

  return new Promise((resolve, reject) => {
    const redirectUri = window.location.origin;
    const scopes = encodeURIComponent(
      'openid email profile https://www.googleapis.com/auth/drive.appdata'
    );

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${envClientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=token&scope=${scopes}&prompt=consent`;

    console.log('[RentFlow Auth Debug] Web Browser Mode Client ID:', envClientId);
    console.log('[RentFlow Auth Debug] Web Browser Mode Full Auth URL:', authUrl);

    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'google_oauth_popup',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
    );

    if (!popup) {
      reject(new Error('Popup blocked! Please allow popups for this site to sign in with Google.'));
      return;
    }

    const timer = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          reject(new Error('Sign in window was closed before authorization completed.'));
          return;
        }

        const popupUrl = popup.location.href;
        if (popupUrl && popupUrl.includes(redirectUri) && popupUrl.includes('access_token=')) {
          clearInterval(timer);
          popup.close();

          const hash = popupUrl.split('#')[1];
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');

          if (!accessToken) {
            reject(new Error('Failed to extract access token from Google response.'));
            return;
          }

          // Fetch real user info from Google
          const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!userinfoRes.ok) {
            reject(new Error('Failed to retrieve user profile from Google.'));
            return;
          }

          const userinfo = await userinfoRes.json();

          // Create/verify Google Drive App Folder file
          await ensureWebGoogleDriveAppFolder(accessToken);

          const profile: UserProfile = {
            id: userinfo.sub,
            email: userinfo.email,
            name: userinfo.name,
            picture: userinfo.picture,
          };

          localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(profile));
          localStorage.setItem(STORAGE_ACCESS_TOKEN_KEY, accessToken);

          resolve(profile);
        }
      } catch {
        // Ignore cross-origin errors while popup is on google.com
      }
    }, 500);
  });
}

/**
 * Logout
 */
export async function tauriGoogleLogout(): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('google_logout');
    } catch (err) {
      console.warn('Tauri google_logout error:', err);
    }
  }

  const token = localStorage.getItem(STORAGE_ACCESS_TOKEN_KEY);
  if (token) {
    try {
      fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${token}`,
      });
    } catch {
      // Ignore network errors on revoke
    }
  }

  localStorage.removeItem(STORAGE_USER_KEY);
  localStorage.removeItem(STORAGE_ACCESS_TOKEN_KEY);
}

/**
 * Real Upload Backup
 */
export async function tauriUploadBackup(
  backupJson: string,
  googleId: string
): Promise<BackupSyncResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<BackupSyncResult>('upload_backup', {
      backupJson,
      googleId,
    });
  }

  const token = localStorage.getItem(STORAGE_ACCESS_TOKEN_KEY);
  if (!token) {
    throw new Error('No Google access token found. Please log in.');
  }

  const encryptedBytes = await encryptWithGoogleId(backupJson, googleId);
  const fileId = await ensureWebGoogleDriveAppFolder(token);

  // Upload to Google Drive REST API
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: encryptedBytes.buffer as ArrayBuffer,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive upload failed: ${errText}`);
  }

  const syncedAt = new Date().toISOString();
  localStorage.setItem('rentflow_last_drive_sync', syncedAt);

  return {
    success: true,
    synced_at: syncedAt,
    file_id: fileId,
    message: 'Encrypted database snapshot successfully backed up to Google Drive appDataFolder.',
  };
}

/**
 * Real Download Backup
 */
export async function tauriDownloadBackup(googleId: string): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const json = await invoke<string>('download_backup', { googleId });
    if (json && json !== '{}') return json;
    return null;
  }

  const token = localStorage.getItem(STORAGE_ACCESS_TOKEN_KEY);
  if (!token) return null;

  try {
    const fileId = await ensureWebGoogleDriveAppFolder(token);
    const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (downloadRes.ok) {
      const arrayBuffer = await downloadRes.arrayBuffer();
      const encryptedBytes = new Uint8Array(arrayBuffer);
      if (encryptedBytes.length >= 12) {
        return await decryptWithGoogleId(encryptedBytes, googleId);
      }
    }
  } catch (err) {
    console.warn('Failed to download/decrypt backup from Google Drive:', err);
  }

  return null;
}
