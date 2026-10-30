import { getDeviceId } from '../lib/device';
import { generateUUID } from '../lib/uuid';
import {
  Organization,
  User,
  Property,
  Unit,
  Tenant,
  Lease,
  Invoice,
  Payment,
  Credit,
  Deposit,
  MaintenanceRequest,
  Vendor,
  Expense,
  AuditLog,
  SyncQueueItem,
} from './schema';

const DB_PREFIX = 'rentflow_db_v1_';

function getStorageTable<T>(tableName: string): T[] {
  try {
    const raw = localStorage.getItem(`${DB_PREFIX}${tableName}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error(`Error reading ${tableName} from local storage`, e);
    return [];
  }
}

function setStorageTable<T>(tableName: string, items: T[]): void {
  try {
    localStorage.setItem(`${DB_PREFIX}${tableName}`, JSON.stringify(items));
  } catch (e) {
    console.error(`Error writing ${tableName} to local storage`, e);
  }
}

export class DBClient {
  private deviceId: string;

  constructor() {
    this.deviceId = getDeviceId();
  }

  // --- Generic Helpers ---

  private enqueueSync(tableName: string, recordId: string, op: 'insert' | 'update' | 'delete', payload: any) {
    const queue = getStorageTable<SyncQueueItem>('sync_queue');
    const newItem: SyncQueueItem = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      table_name: tableName,
      record_id: recordId,
      op,
      payload_json: JSON.stringify(payload),
      synced: false,
      created_at: Date.now(),
    };
    queue.push(newItem);
    setStorageTable('sync_queue', queue);
  }

  public recordAudit(action: string, entityType: string, entityId: string, before?: any, after?: any) {
    const logs = getStorageTable<AuditLog>('audit_log');
    const entry: AuditLog = {
      id: generateUUID(),
      org_id: 'default_org',
      user_id: 'local_user',
      action,
      entity_type: entityType,
      entity_id: entityId,
      before_json: before ? JSON.stringify(before) : null,
      after_json: after ? JSON.stringify(after) : null,
      created_at: Date.now(),
    };
    logs.unshift(entry);
    setStorageTable('audit_log', logs);
  }

  // --- CRUD Operations ---

  public getTable<T extends { deleted_at?: number | null }>(tableName: string): T[] {
    const rows = getStorageTable<T>(tableName);
    return rows.filter((r) => !r.deleted_at);
  }

  public getItem<T extends { id: string; deleted_at?: number | null }>(tableName: string, id: string): T | null {
    const rows = getStorageTable<T>(tableName);
    const found = rows.find((r) => r.id === id);
    if (!found || found.deleted_at) return null;
    return found;
  }

  public insertItem<T extends { id: string; updated_at?: number; device_id?: string }>(
    tableName: string,
    item: Omit<T, 'updated_at' | 'device_id'> & Partial<Pick<T, 'updated_at' | 'device_id'>>
  ): T {
    const rows = getStorageTable<T>(tableName);
    const stamped = {
      ...item,
      updated_at: Date.now(),
      device_id: this.deviceId,
    } as unknown as T;

    rows.push(stamped);
    setStorageTable(tableName, rows);
    this.enqueueSync(tableName, stamped.id, 'insert', stamped);
    this.recordAudit('CREATE', tableName, stamped.id, null, stamped);
    return stamped;
  }

  public updateItem<T extends { id: string; updated_at?: number; device_id?: string }>(tableName: string, id: string, patch: Partial<T>): T | null {
    const rows = getStorageTable<T>(tableName);
    const index = rows.findIndex((r) => r.id === id);
    if (index === -1) return null;

    const before = rows[index];
    const updated: T = {
      ...before,
      ...patch,
      updated_at: Date.now(),
      device_id: this.deviceId,
    };

    rows[index] = updated;
    setStorageTable(tableName, rows);
    this.enqueueSync(tableName, id, 'update', updated);
    this.recordAudit('UPDATE', tableName, id, before, updated);
    return updated;
  }

  public softDeleteItem<T extends { id: string; deleted_at?: number | null; updated_at?: number; device_id?: string }>(tableName: string, id: string): boolean {
    const rows = getStorageTable<T>(tableName);
    const index = rows.findIndex((r) => r.id === id);
    if (index === -1) return false;

    const before = rows[index];
    const updated: T = {
      ...before,
      deleted_at: Date.now(),
      updated_at: Date.now(),
      device_id: this.deviceId,
    };

    rows[index] = updated;
    setStorageTable(tableName, rows);
    this.enqueueSync(tableName, id, 'delete', updated);
    this.recordAudit('DELETE', tableName, id, before, updated);
    return true;
  }

  public allocatePayment(leaseId: string, paymentAmountMinor: number, method: string, reference?: string): { payment: Payment; allocatedInvoices: Invoice[] } {
    const lease = this.getItem<Lease>('leases', leaseId);
    if (!lease) throw new Error('Lease not found');

    const invoices = this.getTable<Invoice>('invoices')
      .filter((inv) => inv.lease_id === leaseId && inv.status !== 'paid' && inv.status !== 'voided')
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    const paymentId = generateUUID();
    let remainingPayment = paymentAmountMinor;
    const allocatedInvoices: Invoice[] = [];

    for (const inv of invoices) {
      if (remainingPayment <= 0) break;

      const unpaidOnInv = inv.total_minor - inv.amount_paid_minor;
      if (unpaidOnInv <= 0) continue;

      const paymentForInv = Math.min(remainingPayment, unpaidOnInv);
      const newPaid = inv.amount_paid_minor + paymentForInv;
      const newStatus = newPaid >= inv.total_minor ? 'paid' : 'partially_paid';

      const updatedInv = this.updateItem<Invoice>('invoices', inv.id, {
        amount_paid_minor: newPaid,
        status: newStatus,
      })!;

      allocatedInvoices.push(updatedInv);
      remainingPayment -= paymentForInv;
    }

    if (remainingPayment > 0) {
      this.insertItem<Credit>('credits', {
        id: generateUUID(),
        lease_id: leaseId,
        amount_minor: remainingPayment,
        currency_code: lease.currency_code,
        reason: 'Overpayment credit',
      });
    }

    const firstInvoiceId = invoices.length > 0 ? invoices[0].id : 'unallocated';
    const payment = this.insertItem<Payment>('payments', {
      id: paymentId,
      invoice_id: firstInvoiceId,
      amount_minor: paymentAmountMinor,
      currency_code: lease.currency_code,
      method,
      reference: reference || null,
      paid_at: new Date().toISOString(),
    });

    return { payment, allocatedInvoices };
  }

  public exportAllData(): Record<string, any> {
    const tables = [
      'organizations',
      'users',
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
      'audit_log',
      'sync_queue',
      'rent_increases',
    ];
    const dump: Record<string, any> = {};
    for (const t of tables) {
      dump[t] = getStorageTable(t);
    }
    return dump;
  }

  public importAllData(data: Record<string, any>): void {
    if (!data || typeof data !== 'object') throw new Error('Invalid database payload');
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        setStorageTable(key, value);
      }
    }
  }
}

export const db = new DBClient();
