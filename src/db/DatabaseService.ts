/**
 * RentFlow DatabaseService (Phase 1)
 *
 * Provides a unified TypeScript service layer interfacing with the native
 * SQLCipher AES-256 encrypted SQLite database running in the Tauri v2 Rust backend.
 * Includes graceful browser fallback for development previews.
 */

import {
  isTauri,
  tauriDbGetTable,
  tauriDbInsertItem,
  tauriDbUpdateItem,
  tauriDbDeleteItem,
  tauriDbDeletePropertyCascading,
  tauriDbDeleteUnitCascading,
  tauriDbDeleteInvoiceCascading,
  tauriDbDeleteTenantCascading,
  tauriDbExportAll,
  tauriDbImportAll,
} from '../lib/tauri/bridge';
import { db } from './client';
import {
  Property,
  Unit,
  Tenant,
  Lease,
  Invoice,
  Payment,
  Expense,
  MaintenanceRequest,
  DocumentVaultItem,
} from './schema';

export class DatabaseService {
  private static instance: DatabaseService;
  private isInitialized = false;
  private writeListeners: Array<() => void> = [];

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initializes the SQLCipher AES-256 encrypted database via Tauri Rust backend.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke<string>('db_init');
        console.log('[DatabaseService] Native SQLCipher AES-256 database initialized.');
        
        // Populate local reactive mirror from SQLCipher
        const snapshot = await tauriDbExportAll();
        if (snapshot && Object.keys(snapshot).length > 0) {
          db.importAllData(snapshot);
        }
      } catch (err) {
        console.warn('[DatabaseService] Tauri DB init notice:', err);
      }
    }

    this.isInitialized = true;
  }

  /**
   * Subscribe to database mutations (inserts, updates, deletes)
   */
  public onWrite(listener: () => void): () => void {
    return db.onWrite(listener);
  }

  /**
   * Get all active (non-deleted) records from a table
   */
  public async getTable<T extends { deleted_at?: number | null; deletedAt?: number | null }>(
    tableName: string
  ): Promise<T[]> {
    if (isTauri()) {
      try {
        const rows = await tauriDbGetTable<T>(tableName);
        return rows.filter((r) => !r.deleted_at && !(r as any).deletedAt);
      } catch (err) {
        console.warn(`[DatabaseService] Fallback to cache for table ${tableName}:`, err);
      }
    }
    return db.getTable<T>(tableName);
  }

  /**
   * Synchronous getTable from local cache for immediate React renders
   */
  public getTableSync<T extends { deleted_at?: number | null; deletedAt?: number | null }>(
    tableName: string
  ): T[] {
    return db.getTable<T>(tableName);
  }

  /**
   * Get single item by ID
   */
  public async getItem<T extends { id: string; deleted_at?: number | null; deletedAt?: number | null }>(
    tableName: string,
    id: string
  ): Promise<T | null> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const item = await invoke<T | null>('db_get_item', { tableName, id });
        if (item && !item.deleted_at && !(item as any).deletedAt) {
          return item;
        }
      } catch (err) {
        console.warn(`[DatabaseService] Fallback for getItem ${tableName}/${id}:`, err);
      }
    }
    return db.getItem<T>(tableName, id);
  }

  /**
   * Insert a new record
   */
  public async insertItem<T extends { id: string }>(
    tableName: string,
    item: T
  ): Promise<T> {
    const stamped = db.insertItem<any>(tableName, item);
    if (isTauri()) {
      try {
        await tauriDbInsertItem(tableName, stamped);
      } catch (err) {
        console.warn(`[DatabaseService] SQLCipher insert error on ${tableName}:`, err);
      }
    }
    return stamped;
  }

  /**
   * Update an existing record
   */
  public async updateItem<T extends { id: string }>(
    tableName: string,
    id: string,
    patch: Partial<T>
  ): Promise<T | null> {
    const updated = db.updateItem<any>(tableName, id, patch);
    if (isTauri() && updated) {
      try {
        await tauriDbUpdateItem(tableName, id, updated);
      } catch (err) {
        console.warn(`[DatabaseService] SQLCipher update error on ${tableName}:`, err);
      }
    }
    return updated;
  }

  /**
   * Soft delete a single record
   */
  public async deleteItem(tableName: string, id: string): Promise<boolean> {
    const deleted = db.softDeleteItem(tableName, id);
    if (isTauri()) {
      try {
        await tauriDbDeleteItem(tableName, id);
      } catch (err) {
        console.warn(`[DatabaseService] SQLCipher delete error on ${tableName}:`, err);
      }
    }
    return deleted;
  }

  /**
   * Cascading soft delete for Property -> Units -> Leases -> Invoices -> Payments -> Maintenance
   */
  public async deletePropertyCascading(propertyId: string): Promise<boolean> {
    const ok = db.deletePropertyCascading(propertyId);
    if (isTauri()) {
      try {
        await tauriDbDeletePropertyCascading(propertyId);
      } catch (err) {
        console.warn('[DatabaseService] SQLCipher cascading property delete error:', err);
      }
    }
    return ok;
  }

  /**
   * Cascading soft delete for Unit -> Leases -> Invoices -> Payments -> Maintenance
   */
  public async deleteUnitCascading(unitId: string): Promise<boolean> {
    const ok = db.deleteUnitCascading(unitId);
    if (isTauri()) {
      try {
        await tauriDbDeleteUnitCascading(unitId);
      } catch (err) {
        console.warn('[DatabaseService] SQLCipher cascading unit delete error:', err);
      }
    }
    return ok;
  }

  /**
   * Cascading soft delete for Invoice -> Payments
   */
  public async deleteInvoiceCascading(invoiceId: string): Promise<boolean> {
    const ok = db.deleteInvoiceCascading(invoiceId);
    if (isTauri()) {
      try {
        await tauriDbDeleteInvoiceCascading(invoiceId);
      } catch (err) {
        console.warn('[DatabaseService] SQLCipher cascading invoice delete error:', err);
      }
    }
    return ok;
  }

  /**
   * Cascading soft delete for Tenant -> Leases -> Invoices -> Payments
   */
  public async deleteTenantCascading(tenantId: string): Promise<boolean> {
    const ok = db.deleteTenantCascading(tenantId);
    if (isTauri()) {
      try {
        await tauriDbDeleteTenantCascading(tenantId);
      } catch (err) {
        console.warn('[DatabaseService] SQLCipher cascading tenant delete error:', err);
      }
    }
    return ok;
  }

  /**
   * Export all table records for zero-knowledge cloud backup
   */
  public async exportAll(): Promise<Record<string, any[]>> {
    if (isTauri()) {
      try {
        return await tauriDbExportAll();
      } catch (err) {
        console.warn('[DatabaseService] SQLCipher export fallback:', err);
      }
    }
    return db.exportAllData();
  }

  /**
   * Import all table records from a cloud backup or migration file
   */
  public async importAll(data: Record<string, any[]>): Promise<void> {
    db.importAllData(data);
    if (isTauri()) {
      try {
        await tauriDbImportAll(data);
      } catch (err) {
        console.warn('[DatabaseService] SQLCipher import error:', err);
      }
    }
  }
}

export const databaseService = DatabaseService.getInstance();
