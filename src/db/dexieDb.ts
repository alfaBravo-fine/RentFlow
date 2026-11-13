import Dexie, { Table } from 'dexie';
import {
  Organization,
  User,
  Workspace,
  DeviceRegistry,
  Owner,
  Property,
  Unit,
  Tenant,
  Lease,
  Invoice,
  Payment,
  Credit,
  Deposit,
  DepositDeduction,
  MaintenanceRequest,
  DocumentVaultItem,
  TenantContactLog,
  Vendor,
  Expense,
  RentIncrease,
  UtilityBill,
  AuditLog,
  SyncQueueItem,
} from './schema';

export const ALL_DB_TABLES = [
  'organizations',
  'users',
  'workspaces',
  'device_registry',
  'owners',
  'properties',
  'units',
  'tenants',
  'leases',
  'invoices',
  'payments',
  'credits',
  'deposits',
  'deposit_deductions',
  'maintenance_requests',
  'documents',
  'tenant_contact_logs',
  'vendors',
  'expenses',
  'rent_increases',
  'utility_bills',
  'audit_log',
  'sync_queue',
] as const;

export type DBTableName = (typeof ALL_DB_TABLES)[number];

export class RentFlowDexieDatabase extends Dexie {
  organizations!: Table<Organization, string>;
  users!: Table<User, string>;
  workspaces!: Table<Workspace, string>;
  device_registry!: Table<DeviceRegistry, string>;
  owners!: Table<Owner, string>;
  properties!: Table<Property, string>;
  units!: Table<Unit, string>;
  tenants!: Table<Tenant, string>;
  leases!: Table<Lease, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<Payment, string>;
  credits!: Table<Credit, string>;
  deposits!: Table<Deposit, string>;
  deposit_deductions!: Table<DepositDeduction, string>;
  maintenance_requests!: Table<MaintenanceRequest, string>;
  documents!: Table<DocumentVaultItem, string>;
  tenant_contact_logs!: Table<TenantContactLog, string>;
  vendors!: Table<Vendor, string>;
  expenses!: Table<Expense, string>;
  rent_increases!: Table<RentIncrease, string>;
  utility_bills!: Table<UtilityBill, string>;
  audit_log!: Table<AuditLog, string>;
  sync_queue!: Table<SyncQueueItem, number>;

  constructor(dbName = 'RentFlowDB') {
    super(dbName);

    const storesV1 = {
      organizations: 'id, country_code, updated_at, deleted_at',
      users: 'id, org_id, email, role, status, updated_at, deleted_at',
      workspaces: 'id, org_id, storage_model, updated_at, deleted_at',
      device_registry: 'id, user_id, workspace_id, updated_at, deleted_at',
      owners: 'id, org_id, name, updated_at, deleted_at',
      properties: 'id, org_id, owner_id, country_code, type, updated_at, deleted_at',
      units: 'id, property_id, status, updated_at, deleted_at, [property_id+status]',
      tenants: 'id, org_id, name, email, phone, updated_at, deleted_at',
      leases:
        'id, unit_id, tenant_id, status, start_date, end_date, updated_at, deleted_at, [unit_id+status], [tenant_id+status]',
      invoices:
        'id, lease_id, status, due_date, period_start, updated_at, deleted_at, [lease_id+status], [status+due_date]',
      payments: 'id, invoice_id, paid_at, method, updated_at, deleted_at',
      credits: 'id, lease_id, applied_invoice_id, updated_at, deleted_at',
      deposits: 'id, lease_id, status, updated_at, deleted_at',
      maintenance_requests:
        'id, unit_id, tenant_id, vendor_id, urgency, status, updated_at, deleted_at, [unit_id+status]',
      documents:
        'id, org_id, category, related_entity_type, related_entity_id, expiry_date, updated_at, deleted_at',
      tenant_contact_logs: 'id, tenant_id, channel, created_at, updated_at, deleted_at',
      vendors: 'id, org_id, category, name, updated_at, deleted_at',
      expenses:
        'id, org_id, property_id, unit_id, vendor_id, category, expense_date, updated_at, deleted_at',
      rent_increases: 'id, unit_id, effective_date, created_at, updated_at, deleted_at',
      utility_bills: 'id, property_id, utility_type, bill_period, updated_at, deleted_at',
      audit_log: 'id, org_id, entity_type, entity_id, created_at',
      sync_queue: '++id, table_name, record_id, synced, created_at',
    };

    this.version(1).stores(storesV1);
    this.version(2).stores({
      ...storesV1,
      deposit_deductions: 'id, deposit_id, lease_id, created_at, updated_at, deleted_at',
    });
  }
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export const dexieDb = new RentFlowDexieDatabase();

const LEGACY_DB_PREFIX = 'rentflow_db_v1_';

/**
 * One-time atomic migration from legacy localStorage keys (`rentflow_db_v1_*`)
 * into structured IndexedDB via Dexie.js.
 */
export async function migrateLegacyLocalStorageToDexie(
  targetDb: RentFlowDexieDatabase = dexieDb
): Promise<boolean> {
  if (!isIndexedDbAvailable() || typeof localStorage === 'undefined') {
    return false;
  }

  const legacyData: Record<string, any[]> = {};
  let hasLegacyRecords = false;

  for (const tableName of ALL_DB_TABLES) {
    try {
      const raw = localStorage.getItem(`${LEGACY_DB_PREFIX}${tableName}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          legacyData[tableName] = parsed;
          hasLegacyRecords = true;
        }
      }
    } catch {
      // Ignore malformed legacy entry
    }
  }

  if (!hasLegacyRecords) {
    return false;
  }

  await targetDb.open();

  const existingOrgsCount = await targetDb.organizations.count();
  if (existingOrgsCount === 0) {
    const tablesToWrite = Object.keys(legacyData).map((name) => targetDb.table(name));
    await targetDb.transaction('rw', tablesToWrite, async () => {
      for (const [tableName, rows] of Object.entries(legacyData)) {
        const normalizedRows = rows.map((row) => {
          if (row && typeof row === 'object' && 'deletedAt' in row) {
            const { deletedAt, ...rest } = row;
            return {
              ...rest,
              deleted_at: rest.deleted_at ?? deletedAt ?? null,
            };
          }
          return row;
        });
        await targetDb.table(tableName).bulkPut(normalizedRows);
      }
    });
  }

  for (const tableName of ALL_DB_TABLES) {
    try {
      localStorage.removeItem(`${LEGACY_DB_PREFIX}${tableName}`);
    } catch {
      // Ignore storage removal errors
    }
  }

  return true;
}
