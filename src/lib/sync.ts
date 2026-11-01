import { db } from '../db/client';
import { SyncQueueItem } from '../db/schema';
import { encryptData, decryptData, EncryptedPayload } from './crypto';

export interface SyncStatus {
  lastSyncAt: number | null;
  pendingCount: number;
  isSyncing: boolean;
  error: string | null;
}

class SyncEngine {
  private passphrase = 'rentflow_local_master_key';

  public getPendingCount(): number {
    try {
      const raw = localStorage.getItem('rentflow_db_v1_sync_queue');
      const queue: SyncQueueItem[] = raw ? JSON.parse(raw) : [];
      return queue.filter((item) => !item.synced).length;
    } catch (e) {
      return 0;
    }
  }

  public async exportEncryptedSnapshot(): Promise<EncryptedPayload> {
    const allTables = [
      'organizations',
      'users',
      'workspaces',
      'owners',
      'properties',
      'units',
      'tenants',
      'leases',
      'invoices',
      'payments',
      'credits',
      'deposits',
      'maintenance_requests',
      'vendors',
      'expenses',
      'documents',
      'reminders',
      'audit_log',
    ];

    const backupData: Record<string, any[]> = {};
    for (const table of allTables) {
      backupData[table] = db.getTable(table);
    }

    const payloadString = JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      data: backupData,
    });

    return encryptData(payloadString, this.passphrase);
  }

  public async importEncryptedSnapshot(payload: EncryptedPayload): Promise<boolean> {
    try {
      const decryptedString = await decryptData(payload, this.passphrase);
      const parsed = JSON.parse(decryptedString);

      if (!parsed.data) throw new Error('Invalid backup file payload');

      for (const [tableName, rows] of Object.entries(parsed.data)) {
        if (Array.isArray(rows)) {
          localStorage.setItem(`rentflow_db_v1_${tableName}`, JSON.stringify(rows));
        }
      }
      return true;
    } catch (e) {
      console.error('Failed to import backup snapshot:', e);
      throw e;
    }
  }

  public markQueueSynced() {
    try {
      const raw = localStorage.getItem('rentflow_db_v1_sync_queue');
      const queue: SyncQueueItem[] = raw ? JSON.parse(raw) : [];
      const updated = queue.map((q) => ({ ...q, synced: true }));
      localStorage.setItem('rentflow_db_v1_sync_queue', JSON.stringify(updated));
    } catch (e) {
      console.error('Error marking queue synced', e);
    }
  }
}

export const syncEngine = new SyncEngine();
