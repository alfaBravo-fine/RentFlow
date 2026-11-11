import { GOOGLE_CLIENT_ID } from '../config/google';
import { encryptWithGoogleId, decryptWithGoogleId } from './driveCrypto';
import { db } from '../db/client';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore, ColorPalette, applyThemeToDOM } from '../stores/themeStore';
import { usePackStore } from '../countries/usePack';
import { useUIStore } from '../stores/uiStore';
import { Property, Tenant } from '../db/schema';

export const APP_DATA_BACKUP_FILENAME = 'RentFlow_FullBackup.enc';
export const LEGACY_BACKUP_FILENAME = 'RentFlowBackup.enc';

export interface DriveFileItem {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface DriveFileListResponse {
  files: DriveFileItem[];
}

export interface AppSettingsState {
  currency: string;
  countryCode: string;
  exportDestination: string;
  exportPaths?: string[];
  autoSyncEnabled: boolean;
  agencyCommissionPct: number;
  maintenanceApprovalThresholdMinor: number;
  uiLayout: string;
  calendarTodos: any[];
  mapPosition: any;
  sidebarCollapsed: boolean;
  notificationsState: any;
}

export interface AppThemeState {
  mode: 'light' | 'dark';
  colorPalette: string;
}

export interface FullBackupPayload {
  app: string;
  version: string;
  backupType: string;
  exportedAt: string;
  userId: string;
  userEmail: string;
  tables: Record<string, any[]>;
  data: Record<string, any[]>;
  settings: AppSettingsState;
  themes: AppThemeState;
  properties?: any[];
  units?: any[];
  tenants?: any[];
  leases?: any[];
  invoices?: any[];
  payments?: any[];
  expenses?: any[];
  vendors?: any[];
  maintenance?: any[];
  maintenance_requests?: any[];
  documents?: any[];
  [key: string]: any;
}

export function isNonOAuthToken(accessToken?: string | null): boolean {
  if (!accessToken || accessToken === 'undefined' || accessToken === 'null') {
    return true;
  }
  return (
    accessToken.startsWith('mock') ||
    accessToken.startsWith('demo_') ||
    accessToken.startsWith('tauri_')
  );
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
        error_callback: (err: any) => {
          reject(new Error(err?.message || err?.type || 'Google authorization popup closed or blocked'));
        },
      });

      client.requestAccessToken({ prompt: '' });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Collects all current user settings from localStorage and stores into a unified object.
 */
export function collectAppSettings(): AppSettingsState {
  let calendarTodos: any[] = [];
  try {
    const raw = localStorage.getItem('rentflow_calendar_todos');
    if (raw) calendarTodos = JSON.parse(raw);
  } catch {}

  let mapPosition: any = null;
  try {
    const raw = localStorage.getItem('rentflow_map_position') || localStorage.getItem('rentflow_map_state');
    if (raw) mapPosition = JSON.parse(raw);
  } catch {}

  let notificationsState: any = {};
  try {
    const raw = localStorage.getItem('rentflow_notifications_state');
    if (raw) notificationsState = JSON.parse(raw);
  } catch {}

  const exportPath = localStorage.getItem('rentflow_export_destination') || 'C:\\Users\\Documents\\RentFlowExports';
  const countryCode = localStorage.getItem('rentflow_active_country_code') || 'US';

  return {
    currency: countryCode,
    countryCode,
    exportDestination: exportPath,
    exportPaths: [exportPath],
    autoSyncEnabled: localStorage.getItem('rentflow_auto_sync_enabled') !== 'false',
    agencyCommissionPct: Number(localStorage.getItem('rentflow_agency_commission_pct') || '8'),
    maintenanceApprovalThresholdMinor: Number(
      localStorage.getItem('rentflow_maintenance_approval_threshold_minor') || '50000'
    ),
    uiLayout: localStorage.getItem('rentflow_ui_layout') || 'sidebar',
    calendarTodos,
    mapPosition,
    sidebarCollapsed: localStorage.getItem('rentflow_sidebar_collapsed') === 'true',
    notificationsState,
  };
}

/**
 * Collects the current theme configuration.
 */
export function collectAppTheme(): AppThemeState {
  try {
    const raw = localStorage.getItem('rentflow_theme_config_v2') || localStorage.getItem('rentflow_theme_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        mode: parsed.mode === 'dark' ? 'dark' : 'light',
        colorPalette: parsed.colorPalette || (parsed.mode === 'dark' ? 'midnight' : 'classic'),
      };
    }
  } catch {}
  return { mode: 'light', colorPalette: 'classic' };
}

/**
 * Restores chosen theme (Dark/Light, Color Palette) and settings (Currency, Export paths, etc.)
 */
export function applyRestoredSettingsAndThemes(parsed: any) {
  // 1. Restore Theme
  const themeData = parsed.themes || parsed.theme;
  if (themeData && themeData.mode && themeData.colorPalette) {
    try {
      useThemeStore.getState().setTheme({
        mode: themeData.mode,
        colorPalette: themeData.colorPalette as ColorPalette,
      });
      applyThemeToDOM(themeData.mode, themeData.colorPalette as ColorPalette);
      localStorage.setItem('rentflow_theme_config_v2', JSON.stringify({
        mode: themeData.mode,
        colorPalette: themeData.colorPalette,
      }));
    } catch (e) {
      console.warn('Could not restore theme:', e);
    }
  }

  // 2. Restore Settings
  const s = parsed.settings;
  if (s) {
    const countryCode = s.countryCode || s.currency;
    if (countryCode) {
      try {
        usePackStore.getState().setCountryCode(countryCode);
        localStorage.setItem('rentflow_active_country_code', countryCode);
      } catch (e) {
        console.warn('Could not restore country code:', e);
      }
    }
    if (s.exportDestination) {
      localStorage.setItem('rentflow_export_destination', s.exportDestination);
    } else if (Array.isArray(s.exportPaths) && s.exportPaths.length > 0) {
      localStorage.setItem('rentflow_export_destination', s.exportPaths[0]);
    }

    if (s.autoSyncEnabled !== undefined) {
      localStorage.setItem('rentflow_auto_sync_enabled', String(s.autoSyncEnabled));
    }
    if (s.agencyCommissionPct !== undefined) {
      localStorage.setItem('rentflow_agency_commission_pct', String(s.agencyCommissionPct));
    }
    if (s.maintenanceApprovalThresholdMinor !== undefined) {
      localStorage.setItem('rentflow_maintenance_approval_threshold_minor', String(s.maintenanceApprovalThresholdMinor));
    }
    if (s.uiLayout) {
      try {
        useUIStore.getState().setUILayout(s.uiLayout);
        localStorage.setItem('rentflow_ui_layout', s.uiLayout);
      } catch (e) {
        console.warn('Could not restore layout:', e);
      }
    }
    if (s.calendarTodos) {
      localStorage.setItem('rentflow_calendar_todos', JSON.stringify(s.calendarTodos));
    }
    if (s.mapPosition) {
      localStorage.setItem('rentflow_map_position', JSON.stringify(s.mapPosition));
      localStorage.setItem('rentflow_map_state', JSON.stringify(s.mapPosition));
    }
    if (s.sidebarCollapsed !== undefined) {
      localStorage.setItem('rentflow_sidebar_collapsed', String(s.sidebarCollapsed));
    }
    if (s.notificationsState) {
      localStorage.setItem('rentflow_notifications_state', JSON.stringify(s.notificationsState));
    }
  }
}

/**
 * Searches for existing RentFlow_FullBackup.enc (or legacy RentFlowBackup.enc)
 * inside Google Drive appDataFolder.
 */
export async function findDriveBackupFileItem(accessToken: string): Promise<DriveFileItem | null> {
  if (isNonOAuthToken(accessToken)) {
    return null;
  }

  // 1. Search for primary RentFlow_FullBackup.enc
  const primaryUrl = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${APP_DATA_BACKUP_FILENAME}%27%20and%20trashed%3Dfalse&fields=files(id%2Cname%2CmodifiedTime)`;

  try {
    let res = await fetch(primaryUrl, {
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

    if (res.ok) {
      const data: DriveFileListResponse = await res.json();
      if (data.files && data.files.length > 0) {
        return data.files[0];
      }
    }

    // 2. Fallback check for legacy RentFlowBackup.enc
    const legacyUrl = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27${LEGACY_BACKUP_FILENAME}%27%20and%20trashed%3Dfalse&fields=files(id%2Cname%2CmodifiedTime)`;
    const legacyRes = await fetch(legacyUrl, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken,
      },
    });

    if (legacyRes.ok) {
      const legacyData: DriveFileListResponse = await legacyRes.json();
      if (legacyData.files && legacyData.files.length > 0) {
        return legacyData.files[0];
      }
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
 * Uploads AES-256-GCM encrypted snapshot payload directly to Google Drive appDataFolder as RentFlow_FullBackup.enc
 */
export async function uploadEncryptedBackupToDrive(
  accessToken: string,
  existingFileId: string | null,
  encryptedBytes: Uint8Array
): Promise<{ fileId: string; syncedAt: string }> {
  if (isNonOAuthToken(accessToken)) {
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
 * Downloads AES-256-GCM encrypted snapshot payload from Google Drive.
 */
export async function downloadEncryptedBackupFromDrive(
  accessToken: string,
  fileId: string
): Promise<Uint8Array | null> {
  if (isNonOAuthToken(accessToken)) {
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
 * Comprehensive Backup (Push):
 * Exports all Dexie/IndexedDB tables into a single JSON object:
 * properties, units, tenants, leases, invoices, payments, expenses, vendors, maintenance, documents, settings, and themes.
 * Encrypts this entire JSON object using AES-256-GCM.
 * Uploads it to Google Drive appDataFolder as RentFlow_FullBackup.enc.
 */
export async function backupToDrive(
  accessToken?: string | null,
  googleId?: string | null
): Promise<{ fileId: string; syncedAt: string; totalRecords: number }> {
  const token =
    accessToken ||
    useAuthStore.getState().accessToken ||
    localStorage.getItem('rentflow_google_access_token');

  const user = useAuthStore.getState().user;
  const gId = googleId || user?.sub;

  if (!token || !gId) {
    throw new Error('Cannot backup to Google Drive: User is not authenticated.');
  }

  // 1. Export all tables from database
  const tables = db.exportAllData();
  const settings = collectAppSettings();
  const themes = collectAppTheme();

  let totalRecords = 0;
  for (const rows of Object.values(tables)) {
    if (Array.isArray(rows)) {
      totalRecords += rows.length;
    }
  }

  // 2. Assemble comprehensive JSON object
  const fullPayload: FullBackupPayload = {
    app: 'RentFlow',
    version: '2.0.0',
    backupType: 'full_application_state',
    exportedAt: new Date().toISOString(),
    userId: gId,
    userEmail: user?.email || '',
    tables,
    data: tables, // backwards compatibility
    settings,
    themes,
    // Explicit top-level properties as requested
    properties: tables.properties || [],
    units: tables.units || [],
    tenants: tables.tenants || [],
    leases: tables.leases || [],
    invoices: tables.invoices || [],
    payments: tables.payments || [],
    expenses: tables.expenses || [],
    vendors: tables.vendors || [],
    maintenance: tables.maintenance_requests || [],
    maintenance_requests: tables.maintenance_requests || [],
    documents: tables.documents || [],
  };

  // 3. Encrypt entire JSON object using AES-256-GCM
  const payloadString = JSON.stringify(fullPayload);
  const encryptedBytes = await encryptWithGoogleId(payloadString, gId);

  // 4. Find existing file item or upload new to appDataFolder
  let existingFileId =
    useAuthStore.getState().driveFileId ||
    localStorage.getItem('rentflow_google_drive_file_id');

  if (!existingFileId) {
    existingFileId = await findDriveBackupFile(token);
  }

  const result = await uploadEncryptedBackupToDrive(token, existingFileId, encryptedBytes);

  localStorage.setItem('rentflow_last_drive_sync', result.syncedAt);
  if (result.fileId) {
    localStorage.setItem('rentflow_google_drive_file_id', result.fileId);
  }

  return {
    fileId: result.fileId,
    syncedAt: result.syncedAt,
    totalRecords,
  };
}

/**
 * Comprehensive Restore (Pull):
 * Downloads RentFlow_FullBackup.enc from Google Drive appDataFolder.
 * Decrypts with AES-256-GCM, parses the JSON.
 * Wipes the local database (clearing all current tables).
 * Repopulates all tables with the exact data from the JSON object.
 * Restores user settings (Currency, Export paths, etc.) and themes (Dark/Light, Color Palette).
 * Refreshes UI so the dashboard immediately shows the restored data.
 */
export async function restoreFromDrive(
  accessToken?: string | null,
  googleId?: string | null
): Promise<{ restored: boolean; message: string; totalRecords: number }> {
  const token =
    accessToken ||
    useAuthStore.getState().accessToken ||
    localStorage.getItem('rentflow_google_access_token');

  const user = useAuthStore.getState().user;
  const gId = googleId || user?.sub;

  if (!token || !gId) {
    throw new Error('Cannot restore from Google Drive: User is not authenticated.');
  }

  // 1. Locate backup file in appDataFolder
  const item = await findDriveBackupFileItem(token);
  if (!item) {
    return {
      restored: false,
      message: 'No Google Drive backup file found in appDataFolder.',
      totalRecords: 0,
    };
  }

  // 2. Download encrypted backup payload
  const encryptedBytes = await downloadEncryptedBackupFromDrive(token, item.id);
  if (!encryptedBytes || encryptedBytes.length < 12) {
    return {
      restored: false,
      message: 'Backup file on Google Drive is empty or invalid.',
      totalRecords: 0,
    };
  }

  // 3. Decrypt using AES-256-GCM
  const decryptedJson = await decryptWithGoogleId(encryptedBytes, gId);
  const parsed = JSON.parse(decryptedJson);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Decrypted backup payload is not valid JSON.');
  }

  // 4. Wipe local database (clear all current tables) & repopulate
  const totalRecords = await db.wipeAndRestoreAllDataAsync(parsed);

  // 5. Restore user settings and theme
  applyRestoredSettingsAndThemes(parsed);

  // 6. Persist sync timestamp and file ID
  const syncedAt = item.modifiedTime || new Date().toISOString();
  localStorage.setItem('rentflow_last_drive_sync', syncedAt);
  localStorage.setItem('rentflow_google_drive_file_id', item.id);

  // 7. Notify reactive listeners and broadcast DOM event
  db.notifyWrite();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('rentflow:restored', {
        detail: { totalRecords, timestamp: Date.now() },
      })
    );
  }

  return {
    restored: true,
    message: `Restored ${totalRecords} records across all modules from Google Drive!`,
    totalRecords,
  };
}

/**
 * Cross-Device syncOnStartup: Checks appDataFolder for RentFlow_FullBackup.enc.
 * If file exists and local DB is empty OR remote modifiedTime is newer than local lastSyncTime,
 * downloads, decrypts, wipes, and restores the complete application state.
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

    // If local was wiped/never synced OR local is empty OR remote is newer:
    if (!localSyncTime || isLocalEmpty || isRemoteNewer) {
      console.log('[syncOnStartup] Remote backup available. Performing comprehensive restoration...');
      const result = await restoreFromDrive(accessToken, googleId);
      return result;
    }

    return { restored: false, message: 'Local database is current' };
  } catch (err: any) {
    console.warn('[syncOnStartup] Error:', err);
    return { restored: false, message: err.message || 'Sync check failed' };
  }
}

export async function pullFromGoogleDrive(accessToken: string, googleId: string): Promise<boolean> {
  const result = await restoreFromDrive(accessToken, googleId);
  return result.restored;
}
