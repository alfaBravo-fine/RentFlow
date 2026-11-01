import { getDeviceId } from '../lib/device';
import { generateUUID } from '../lib/uuid';
import {
  isTauri,
  tauriDbInsertItem,
  tauriDbUpdateItem,
  tauriDbDeleteItem,
  tauriDbDeletePropertyCascading,
  tauriDbDeleteUnitCascading,
  tauriDbDeleteInvoiceCascading,
  tauriDbDeleteTenantCascading,
} from '../lib/tauri/bridge';
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
  private writeListeners: Array<() => void> = [];

  constructor() {
    this.deviceId = getDeviceId();
  }

  // Reactive DB write subscription
  public onWrite(listener: () => void): () => void {
    this.writeListeners.push(listener);
    return () => {
      this.writeListeners = this.writeListeners.filter((l) => l !== listener);
    };
  }

  public notifyWrite() {
    this.writeListeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Error in db write listener:', err);
      }
    });
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

  public getTable<T extends { deleted_at?: number | null; deletedAt?: number | null }>(tableName: string): T[] {
    const rows = getStorageTable<T>(tableName);
    return rows.filter((r) => !r.deleted_at && !(r as any).deletedAt);
  }

  public getItem<T extends { id: string; deleted_at?: number | null; deletedAt?: number | null }>(tableName: string, id: string): T | null {
    const rows = getStorageTable<T>(tableName);
    const found = rows.find((r) => r.id === id);
    if (!found || found.deleted_at || (found as any).deletedAt) return null;
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
      deleted_at: null,
      deletedAt: null,
    } as unknown as T;

    rows.push(stamped);
    setStorageTable(tableName, rows);
    this.enqueueSync(tableName, stamped.id, 'insert', stamped);
    this.recordAudit('CREATE', tableName, stamped.id, null, stamped);
    if (isTauri()) {
      tauriDbInsertItem(tableName, stamped).catch((err) => console.warn('[Tauri SQLCipher] insert error:', err));
    }
    this.notifyWrite();
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
    if (isTauri()) {
      tauriDbUpdateItem(tableName, id, updated).catch((err) => console.warn('[Tauri SQLCipher] update error:', err));
    }
    this.notifyWrite();
    return updated;
  }

  public softDeleteItem<T extends { id: string; deleted_at?: number | null; deletedAt?: number | null; updated_at?: number; device_id?: string }>(tableName: string, id: string): boolean {
    const rows = getStorageTable<T>(tableName);
    const index = rows.findIndex((r) => r.id === id);
    if (index === -1) return false;

    const before = rows[index];
    const now = Date.now();
    const updated: T = {
      ...before,
      deleted_at: now,
      deletedAt: now,
      updated_at: now,
      device_id: this.deviceId,
    };

    rows[index] = updated;
    setStorageTable(tableName, rows);
    this.enqueueSync(tableName, id, 'delete', updated);
    this.recordAudit('DELETE', tableName, id, before, updated);
    if (isTauri()) {
      tauriDbDeleteItem(tableName, id).catch((err) => console.warn('[Tauri SQLCipher] delete error:', err));
    }
    this.notifyWrite();
    return true;
  }

  // --- Cascading Soft Deletes ---

  public deletePropertyCascading(propertyId: string): boolean {
    const now = Date.now();

    // 1. Soft-delete property
    this.softDeleteItem<Property>('properties', propertyId);

    // 2. Find and soft-delete units
    const units = getStorageTable<Unit>('units');
    const unitIds: string[] = [];
    units.forEach((u) => {
      if (u.property_id === propertyId && !u.deleted_at && !(u as any).deletedAt) {
        unitIds.push(u.id);
        u.deleted_at = now;
        (u as any).deletedAt = now;
        u.updated_at = now;
      }
    });
    setStorageTable('units', units);

    // 3. Find and soft-delete leases for these units
    const leases = getStorageTable<Lease>('leases');
    const leaseIds: string[] = [];
    leases.forEach((l) => {
      if (unitIds.includes(l.unit_id) && !l.deleted_at && !(l as any).deletedAt) {
        leaseIds.push(l.id);
        l.deleted_at = now;
        (l as any).deletedAt = now;
        l.updated_at = now;
      }
    });
    setStorageTable('leases', leases);

    // 4. Find and soft-delete invoices for these leases
    const invoices = getStorageTable<Invoice>('invoices');
    const invoiceIds: string[] = [];
    invoices.forEach((inv) => {
      if (leaseIds.includes(inv.lease_id) && !inv.deleted_at && !(inv as any).deletedAt) {
        invoiceIds.push(inv.id);
        inv.deleted_at = now;
        (inv as any).deletedAt = now;
        inv.updated_at = now;
      }
    });
    setStorageTable('invoices', invoices);

    // 5. Soft-delete payments for these invoices
    const payments = getStorageTable<Payment>('payments');
    payments.forEach((p) => {
      if (invoiceIds.includes(p.invoice_id) && !p.deleted_at && !(p as any).deletedAt) {
        p.deleted_at = now;
        (p as any).deletedAt = now;
        p.updated_at = now;
      }
    });
    setStorageTable('payments', payments);

    // 6. Soft-delete maintenance requests for these units
    const maintenance = getStorageTable<MaintenanceRequest>('maintenance_requests');
    maintenance.forEach((m) => {
      if (unitIds.includes(m.unit_id) && !m.deleted_at && !(m as any).deletedAt) {
        m.deleted_at = now;
        (m as any).deletedAt = now;
        m.updated_at = now;
      }
    });
    setStorageTable('maintenance_requests', maintenance);

    if (isTauri()) {
      tauriDbDeletePropertyCascading(propertyId).catch((err) => console.warn('[Tauri SQLCipher] cascading prop delete:', err));
    }

    this.notifyWrite();
    return true;
  }

  public deleteUnitCascading(unitId: string): boolean {
    const now = Date.now();

    // 1. Soft delete unit
    this.softDeleteItem<Unit>('units', unitId);

    // 2. Soft delete leases for this unit
    const leases = getStorageTable<Lease>('leases');
    const leaseIds: string[] = [];
    leases.forEach((l) => {
      if (l.unit_id === unitId && !l.deleted_at && !(l as any).deletedAt) {
        leaseIds.push(l.id);
        l.deleted_at = now;
        (l as any).deletedAt = now;
        l.updated_at = now;
      }
    });
    setStorageTable('leases', leases);

    // 3. Soft delete invoices
    const invoices = getStorageTable<Invoice>('invoices');
    const invoiceIds: string[] = [];
    invoices.forEach((inv) => {
      if (leaseIds.includes(inv.lease_id) && !inv.deleted_at && !(inv as any).deletedAt) {
        invoiceIds.push(inv.id);
        inv.deleted_at = now;
        (inv as any).deletedAt = now;
        inv.updated_at = now;
      }
    });
    setStorageTable('invoices', invoices);

    // 4. Soft delete payments
    const payments = getStorageTable<Payment>('payments');
    payments.forEach((p) => {
      if (invoiceIds.includes(p.invoice_id) && !p.deleted_at && !(p as any).deletedAt) {
        p.deleted_at = now;
        (p as any).deletedAt = now;
        p.updated_at = now;
      }
    });
    setStorageTable('payments', payments);

    // 5. Soft delete maintenance requests
    const maintenance = getStorageTable<MaintenanceRequest>('maintenance_requests');
    maintenance.forEach((m) => {
      if (m.unit_id === unitId && !m.deleted_at && !(m as any).deletedAt) {
        m.deleted_at = now;
        (m as any).deletedAt = now;
        m.updated_at = now;
      }
    });
    setStorageTable('maintenance_requests', maintenance);

    if (isTauri()) {
      tauriDbDeleteUnitCascading(unitId).catch((err) => console.warn('[Tauri SQLCipher] cascading unit delete:', err));
    }

    this.notifyWrite();
    return true;
  }

  public deleteInvoiceCascading(invoiceId: string): boolean {
    const now = Date.now();
    this.softDeleteItem<Invoice>('invoices', invoiceId);

    const payments = getStorageTable<Payment>('payments');
    payments.forEach((p) => {
      if (p.invoice_id === invoiceId && !p.deleted_at && !(p as any).deletedAt) {
        p.deleted_at = now;
        (p as any).deletedAt = now;
        p.updated_at = now;
      }
    });
    setStorageTable('payments', payments);

    if (isTauri()) {
      tauriDbDeleteInvoiceCascading(invoiceId).catch((err) => console.warn('[Tauri SQLCipher] cascading inv delete:', err));
    }

    this.notifyWrite();
    return true;
  }

  public deleteTenantCascading(tenantId: string): boolean {
    const now = Date.now();
    this.softDeleteItem<Tenant>('tenants', tenantId);

    const leases = getStorageTable<Lease>('leases');
    const leaseIds: string[] = [];
    leases.forEach((l) => {
      if (l.tenant_id === tenantId && !l.deleted_at && !(l as any).deletedAt) {
        leaseIds.push(l.id);
        l.deleted_at = now;
        (l as any).deletedAt = now;
        l.updated_at = now;
      }
    });
    setStorageTable('leases', leases);

    const invoices = getStorageTable<Invoice>('invoices');
    const invoiceIds: string[] = [];
    invoices.forEach((inv) => {
      if (leaseIds.includes(inv.lease_id) && !inv.deleted_at && !(inv as any).deletedAt) {
        invoiceIds.push(inv.id);
        inv.deleted_at = now;
        (inv as any).deletedAt = now;
        inv.updated_at = now;
      }
    });
    setStorageTable('invoices', invoices);

    const payments = getStorageTable<Payment>('payments');
    payments.forEach((p) => {
      if (invoiceIds.includes(p.invoice_id) && !p.deleted_at && !(p as any).deletedAt) {
        p.deleted_at = now;
        (p as any).deletedAt = now;
        p.updated_at = now;
      }
    });
    setStorageTable('payments', payments);

    if (isTauri()) {
      tauriDbDeleteTenantCascading(tenantId).catch((err) => console.warn('[Tauri SQLCipher] cascading tenant delete:', err));
    }

    this.notifyWrite();
    return true;
  }

  // --- Payment & FIFO Allocation ---

  public allocatePayment(
    leaseId: string,
    paymentAmountMinor: number,
    method: string,
    reference?: string
  ): { payment: Payment; allocatedInvoices: Invoice[] } {
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

    const firstInvoiceId = allocatedInvoices.length > 0
      ? allocatedInvoices[0].id
      : invoices.length > 0
      ? invoices[0].id
      : 'unallocated';

    const payment = this.insertItem<Payment>('payments', {
      id: paymentId,
      invoice_id: firstInvoiceId,
      amount_minor: paymentAmountMinor,
      currency_code: lease.currency_code,
      method,
      reference: reference || `REF-${Date.now().toString().slice(-6)}`,
      paid_at: new Date().toISOString(),
    });

    this.notifyWrite();
    return { payment, allocatedInvoices };
  }

  public recordInvoicePayment(
    invoiceId: string,
    paymentAmountMinor: number,
    method: string,
    reference?: string
  ): { payment: Payment; invoice: Invoice } {
    const inv = this.getItem<Invoice>('invoices', invoiceId);
    if (!inv) throw new Error('Invoice not found');

    const paymentId = generateUUID();
    const newPaid = inv.amount_paid_minor + paymentAmountMinor;
    const newStatus = newPaid >= inv.total_minor ? 'paid' : 'partially_paid';

    const updatedInv = this.updateItem<Invoice>('invoices', inv.id, {
      amount_paid_minor: newPaid,
      status: newStatus,
    })!;

    const payment = this.insertItem<Payment>('payments', {
      id: paymentId,
      invoice_id: invoiceId,
      amount_minor: paymentAmountMinor,
      currency_code: inv.currency_code,
      method,
      reference: reference || `REF-${Date.now().toString().slice(-6)}`,
      paid_at: new Date().toISOString(),
    });

    this.notifyWrite();
    return { payment, invoice: updatedInv };
  }

  public exportAllData(): Record<string, any> {
    const tables = [
      'organizations',
      'users',
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
      'tenant_contact_logs',
      'audit_log',
      'sync_queue',
      'rent_increases',
      'utility_bills',
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
    this.notifyWrite();
  }
}

export const db = new DBClient();
