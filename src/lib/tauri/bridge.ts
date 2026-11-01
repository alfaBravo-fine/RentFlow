/**
 * RentFlow Tauri v2 Desktop Bridge
 * Seamlessly interfaces React frontend with the Rust backend (SQLCipher & Loopback OAuth)
 * when running inside Tauri, with graceful web/browser fallback.
 */

export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(
      (window as any).__TAURI_INTERNALS__ ||
      (window as any).__TAURI__ ||
      (window as any).__TAURI_METADATA__
    )
  );
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error(`Tauri is not available in browser mode. Command '${cmd}' skipped.`);
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd, args);
  } catch (err: any) {
    console.error(`[Tauri Bridge] Error invoking command '${cmd}':`, err);
    throw err;
  }
}

// --- Database Operations (SQLCipher AES-256) ---

export async function tauriDbGetTable<T>(tableName: string): Promise<T[]> {
  return invokeTauri<T[]>('db_get_table', { tableName });
}

export async function tauriDbInsertItem<T>(tableName: string, item: any): Promise<T> {
  return invokeTauri<T>('db_insert_item', { tableName, item });
}

export async function tauriDbUpdateItem<T>(tableName: string, id: string, updates: any): Promise<T> {
  return invokeTauri<T>('db_update_item', { tableName, id, updates });
}

export async function tauriDbDeleteItem(tableName: string, id: string): Promise<void> {
  return invokeTauri<void>('db_delete_item', { tableName, id });
}

export async function tauriDbDeletePropertyCascading(propertyId: string): Promise<void> {
  return invokeTauri<void>('db_delete_property_cascading', { propertyId });
}

export async function tauriDbDeleteUnitCascading(unitId: string): Promise<void> {
  return invokeTauri<void>('db_delete_unit_cascading', { unitId });
}

export async function tauriDbDeleteInvoiceCascading(invoiceId: string): Promise<void> {
  return invokeTauri<void>('db_delete_invoice_cascading', { invoiceId });
}

export async function tauriDbDeleteTenantCascading(tenantId: string): Promise<void> {
  return invokeTauri<void>('db_delete_tenant_cascading', { tenantId });
}

export async function tauriDbExportAll(): Promise<Record<string, any[]>> {
  return invokeTauri<Record<string, any[]>>('db_export_all');
}

export async function tauriDbImportAll(data: Record<string, any[]>): Promise<void> {
  return invokeTauri<void>('db_import_all', { data });
}

// --- Production Google OAuth (Desktop Loopback) ---

export interface TauriUserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export async function tauriGoogleOAuth(): Promise<TauriUserProfile> {
  return invokeTauri<TauriUserProfile>('google_oauth');
}

export async function tauriGoogleLogout(): Promise<void> {
  return invokeTauri<void>('google_oauth_logout');
}

export async function tauriGoogleGetCurrentUser(): Promise<TauriUserProfile | null> {
  return invokeTauri<TauriUserProfile | null>('google_get_current_user');
}

// --- Google Drive Sync (Push/Pull in Rust Backend) ---

export interface TauriSyncResult {
  success: boolean;
  synced_at: string;
  file_id?: string;
  message: string;
}

export interface TauriPullResult {
  restored: boolean;
  message: string;
}

export async function tauriDrivePushBackup(googleId: string): Promise<TauriSyncResult> {
  return invokeTauri<TauriSyncResult>('drive_push_backup', { googleId });
}

export async function tauriDrivePullBackup(googleId: string): Promise<TauriPullResult> {
  return invokeTauri<TauriPullResult>('drive_pull_backup', { googleId });
}
