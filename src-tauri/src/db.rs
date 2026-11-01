use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

// Database encryption passphrase (AES-256 via SQLCipher)
const SQLCIPHER_PASSPHRASE: &str = "rentflow_master_aes256_sqlcipher_secret_key_v2";

const ALLOWED_TABLES: &[&str] = &[
    "properties",
    "units",
    "tenants",
    "leases",
    "invoices",
    "payments",
    "expenses",
    "maintenance_requests",
    "documents",
    "organizations",
    "owners",
    "vendors",
    "utility_bills",
];

pub fn open_connection(db_path: &Path, key: &str) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create db dir: {}", e))?;
    }

    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

    // Enable SQLCipher AES-256 encryption on disk
    conn.execute(&format!("PRAGMA key = '{}';", key), [])
        .map_err(|e| format!("Failed to set SQLCipher PRAGMA key: {}", e))?;
    let _ = conn.execute("PRAGMA cipher_compatibility = 4;", []);
    let _ = conn.execute("PRAGMA foreign_keys = ON;", []);

    Ok(conn)
}

pub struct DatabaseManager {
    pub conn: Mutex<Connection>,
    pub db_path: PathBuf,
}

impl DatabaseManager {
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        let conn = open_connection(&db_path, SQLCIPHER_PASSPHRASE)?;
        let mgr = Self {
            conn: Mutex::new(conn),
            db_path,
        };

        // Run initial schema migrations
        mgr.run_migrations()?;

        Ok(mgr)
    }

    pub fn new_with_key(db_path: PathBuf, key: &str) -> Result<Self, String> {
        let conn = open_connection(&db_path, key)?;
        let mgr = Self {
            conn: Mutex::new(conn),
            db_path,
        };

        mgr.run_migrations()?;

        Ok(mgr)
    }

    pub fn run_migrations(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS organizations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                country_code TEXT NOT NULL,
                display_currency TEXT NOT NULL,
                timezone TEXT NOT NULL DEFAULT 'UTC',
                locale TEXT NOT NULL DEFAULT 'en-US',
                plan TEXT NOT NULL DEFAULT 'landlord',
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS properties (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                owner_id TEXT,
                name TEXT NOT NULL,
                address_line1 TEXT,
                address_line2 TEXT,
                address TEXT,
                city TEXT,
                region TEXT,
                postal_code TEXT,
                type TEXT NOT NULL DEFAULT 'residential_apartment',
                country_code TEXT NOT NULL DEFAULT 'US',
                notes TEXT,
                photo_url TEXT,
                latitude REAL,
                longitude REAL,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS units (
                id TEXT PRIMARY KEY,
                property_id TEXT NOT NULL,
                name TEXT NOT NULL,
                size REAL NOT NULL DEFAULT 0,
                area_unit TEXT NOT NULL DEFAULT 'sqft',
                bedrooms INTEGER NOT NULL DEFAULT 1,
                bathrooms REAL NOT NULL DEFAULT 1,
                rent_minor INTEGER NOT NULL DEFAULT 0,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                status TEXT NOT NULL DEFAULT 'vacant',
                amenities_json TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER,
                FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tenants (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT NOT NULL,
                id_type TEXT NOT NULL,
                id_number TEXT NOT NULL,
                emergency_contact TEXT,
                occupants INTEGER DEFAULT 1,
                notes_json TEXT,
                tags_json TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS leases (
                id TEXT PRIMARY KEY,
                unit_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                rent_minor INTEGER NOT NULL,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                country_code_snapshot TEXT NOT NULL DEFAULT 'US',
                pack_version_snapshot INTEGER NOT NULL DEFAULT 1,
                billing_cycle TEXT NOT NULL DEFAULT 'monthly',
                due_day INTEGER NOT NULL DEFAULT 1,
                deposit_minor INTEGER NOT NULL DEFAULT 0,
                late_fee_type TEXT NOT NULL DEFAULT 'percent',
                late_fee_value REAL NOT NULL DEFAULT 5,
                grace_days INTEGER NOT NULL DEFAULT 5,
                status TEXT NOT NULL DEFAULT 'active',
                terms_notes TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER,
                FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE CASCADE,
                FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS invoices (
                id TEXT PRIMARY KEY,
                lease_id TEXT NOT NULL,
                period_start TEXT NOT NULL,
                period_end TEXT NOT NULL,
                due_date TEXT NOT NULL,
                subtotal_minor INTEGER NOT NULL,
                late_fee_minor INTEGER NOT NULL DEFAULT 0,
                total_minor INTEGER NOT NULL,
                amount_paid_minor INTEGER NOT NULL DEFAULT 0,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                status TEXT NOT NULL DEFAULT 'unpaid',
                voided_reason TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER,
                FOREIGN KEY (lease_id) REFERENCES leases (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY,
                invoice_id TEXT NOT NULL,
                amount_minor INTEGER NOT NULL,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                method TEXT NOT NULL,
                reference TEXT,
                paid_at TEXT NOT NULL,
                receipt_path TEXT,
                reversal_of_id TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER,
                FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS expenses (
                id TEXT PRIMARY KEY,
                property_id TEXT,
                unit_id TEXT,
                category TEXT NOT NULL,
                amount_minor INTEGER NOT NULL,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                date TEXT NOT NULL,
                vendor TEXT,
                description TEXT NOT NULL,
                receipt_url TEXT,
                tax_deductible INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS maintenance_requests (
                id TEXT PRIMARY KEY,
                unit_id TEXT NOT NULL,
                tenant_id TEXT,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                urgency TEXT NOT NULL DEFAULT 'medium',
                status TEXT NOT NULL DEFAULT 'new',
                vendor_id TEXT,
                cost_minor INTEGER NOT NULL DEFAULT 0,
                paid_by TEXT NOT NULL DEFAULT 'landlord',
                completed_at TEXT,
                photo_url TEXT,
                needs_approval INTEGER NOT NULL DEFAULT 0,
                approved_by TEXT,
                approved_at TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                related_entity_type TEXT,
                related_entity_id TEXT,
                file_name TEXT NOT NULL,
                file_data_or_url TEXT NOT NULL,
                file_size_bytes INTEGER,
                expiry_date TEXT,
                notes TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS utility_bills (
                id TEXT PRIMARY KEY,
                property_id TEXT NOT NULL,
                unit_id TEXT,
                utility_type TEXT NOT NULL,
                provider_name TEXT NOT NULL,
                account_number TEXT,
                amount_minor INTEGER NOT NULL,
                currency_code TEXT NOT NULL DEFAULT 'USD',
                bill_date TEXT NOT NULL,
                due_date TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'unpaid',
                paid_at TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS owners (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                payout_details TEXT,
                commission_type TEXT NOT NULL DEFAULT 'percentage',
                commission_value REAL NOT NULL DEFAULT 8.0,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS vendors (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                name TEXT NOT NULL,
                service_category TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT,
                contact_person TEXT,
                tax_id TEXT,
                is_insured INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                updated_at INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                deleted_at INTEGER
            );
            "#,
        )
        .map_err(|e| format!("Migration error: {}", e))?;

        Ok(())
    }
}

// Input validation helper
pub fn validate_table_name(table_name: &str) -> Result<(), String> {
    if !ALLOWED_TABLES.contains(&table_name) {
        return Err(format!("Forbidden or invalid table name: '{}'", table_name));
    }
    Ok(())
}

pub fn validate_safe_path(path_str: &str) -> Result<(), String> {
    if path_str.contains("..") || path_str.contains('\0') {
        return Err("Security Violation: Path traversal or invalid character detected".into());
    }
    Ok(())
}

// --- Tauri Database Commands ---

#[tauri::command]
pub async fn db_init(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let db_path = app_data_dir.join("rentflow_encrypted.db");
    
    // Ensure parent directory exists
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Dir create error: {}", e))?;
    }

    let _mgr = DatabaseManager::new(db_path)?;
    Ok("SQLCipher encrypted database initialized successfully".to_string())
}

#[tauri::command]
pub async fn db_get_table(
    table_name: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Vec<Value>, String> {
    validate_table_name(&table_name)?;

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT * FROM {} WHERE deleted_at IS NULL ORDER BY updated_at DESC",
        table_name
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let column_names: Vec<String> = stmt
        .column_names()
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    let rows = stmt
        .query_map([], |row| {
            let mut map = serde_json::Map::new();
            for (i, name) in column_names.iter().enumerate() {
                let val_ref = row.get_ref(i)?;
                let json_val = match val_ref {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => json!(n),
                    rusqlite::types::ValueRef::Real(f) => json!(f),
                    rusqlite::types::ValueRef::Text(s) => {
                        let text = String::from_utf8_lossy(s).to_string();
                        // Try parse if looks like nested json
                        if (text.starts_with('{') && text.ends_with('}'))
                            || (text.starts_with('[') && text.ends_with(']'))
                        {
                            serde_json::from_str(&text).unwrap_or(json!(text))
                        } else {
                            json!(text)
                        }
                    }
                    rusqlite::types::ValueRef::Blob(b) => json!(base64::encode(b)),
                };
                map.insert(name.clone(), json_val);
            }
            Ok(Value::Object(map))
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        if let Ok(item) = row {
            result.push(item);
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn db_get_item(
    table_name: String,
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Option<Value>, String> {
    validate_table_name(&table_name)?;

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT * FROM {} WHERE id = ? AND deleted_at IS NULL LIMIT 1",
        table_name
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let column_names: Vec<String> = stmt
        .column_names()
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    let mut rows = stmt
        .query_map(params![id], |row| {
            let mut map = serde_json::Map::new();
            for (i, name) in column_names.iter().enumerate() {
                let val_ref = row.get_ref(i)?;
                let json_val = match val_ref {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => json!(n),
                    rusqlite::types::ValueRef::Real(f) => json!(f),
                    rusqlite::types::ValueRef::Text(s) => {
                        let text = String::from_utf8_lossy(s).to_string();
                        if (text.starts_with('{') && text.ends_with('}'))
                            || (text.starts_with('[') && text.ends_with(']'))
                        {
                            serde_json::from_str(&text).unwrap_or(json!(text))
                        } else {
                            json!(text)
                        }
                    }
                    rusqlite::types::ValueRef::Blob(b) => json!(base64::encode(b)),
                };
                map.insert(name.clone(), json_val);
            }
            Ok(Value::Object(map))
        })
        .map_err(|e| e.to_string())?;

    if let Some(first) = rows.next() {
        match first {
            Ok(val) => Ok(Some(val)),
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn db_insert_item(
    table_name: String,
    item: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    validate_table_name(&table_name)?;

    let obj = item.as_object().ok_or("Item must be a JSON object")?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let keys: Vec<&String> = obj.keys().collect();
    let placeholders: Vec<&str> = keys.iter().map(|_| "?").collect();

    let sql = format!(
        "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
        table_name,
        keys.iter().map(|k| k.as_str()).collect::<Vec<_>>().join(", "),
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let params_vec: Vec<Box<dyn rusqlite::ToSql>> = keys
        .iter()
        .map(|k| {
            let val = &obj[*k];
            match val {
                Value::Null => Box::new(rusqlite::types::Null) as Box<dyn rusqlite::ToSql>,
                Value::Bool(b) => Box::new(if *b { 1 } else { 0 }),
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        Box::new(i)
                    } else if let Some(f) = n.as_f64() {
                        Box::new(f)
                    } else {
                        Box::new(0)
                    }
                }
                Value::String(s) => Box::new(s.clone()),
                Value::Array(_) | Value::Object(_) => Box::new(val.to_string()),
            }
        })
        .collect();

    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    stmt.execute(&*params_slice).map_err(|e| e.to_string())?;

    Ok(item)
}

#[tauri::command]
pub async fn db_update_item(
    table_name: String,
    id: String,
    updates: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<Value, String> {
    validate_table_name(&table_name)?;
    let obj = updates.as_object().ok_or("Updates must be a JSON object")?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let set_clauses: Vec<String> = obj.keys().map(|k| format!("{} = ?", k)).collect();
    let sql = format!(
        "UPDATE {} SET {} WHERE id = ?",
        table_name,
        set_clauses.join(", ")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = obj
        .keys()
        .map(|k| {
            let val = &obj[k];
            match val {
                Value::Null => Box::new(rusqlite::types::Null) as Box<dyn rusqlite::ToSql>,
                Value::Bool(b) => Box::new(if *b { 1 } else { 0 }),
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        Box::new(i)
                    } else if let Some(f) = n.as_f64() {
                        Box::new(f)
                    } else {
                        Box::new(0)
                    }
                }
                Value::String(s) => Box::new(s.clone()),
                Value::Array(_) | Value::Object(_) => Box::new(val.to_string()),
            }
        })
        .collect();

    params_vec.push(Box::new(id.clone()));
    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    stmt.execute(&*params_slice).map_err(|e| e.to_string())?;

    Ok(updates)
}

#[tauri::command]
pub async fn db_delete_item(
    table_name: String,
    id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    validate_table_name(&table_name)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let sql = format!(
        "UPDATE {} SET deleted_at = ?, updated_at = ? WHERE id = ?",
        table_name
    );
    conn.execute(&sql, params![now_ts, now_ts, id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// Cascading Deletes for Properties
#[tauri::command]
pub async fn db_delete_property_cascading(
    property_id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    // 1. Soft-delete property
    conn.execute(
        "UPDATE properties SET deleted_at = ?, updated_at = ? WHERE id = ?",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    // 2. Soft-delete all units
    conn.execute(
        "UPDATE units SET deleted_at = ?, updated_at = ? WHERE property_id = ?",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    // 3. Soft-delete all associated leases
    conn.execute(
        "UPDATE leases SET deleted_at = ?, updated_at = ? WHERE unit_id IN (SELECT id FROM units WHERE property_id = ?)",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    // 4. Soft-delete invoices
    conn.execute(
        "UPDATE invoices SET deleted_at = ?, updated_at = ? WHERE lease_id IN (SELECT id FROM leases WHERE unit_id IN (SELECT id FROM units WHERE property_id = ?))",
        params![now, now, property_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// Cascading Deletes for Units
#[tauri::command]
pub async fn db_delete_unit_cascading(
    unit_id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    conn.execute(
        "UPDATE units SET deleted_at = ?, updated_at = ? WHERE id = ?",
        params![now, now, unit_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE leases SET deleted_at = ?, updated_at = ? WHERE unit_id = ?",
        params![now, now, unit_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// Cascading Deletes for Invoices
#[tauri::command]
pub async fn db_delete_invoice_cascading(
    invoice_id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    conn.execute(
        "UPDATE invoices SET deleted_at = ?, updated_at = ? WHERE id = ?",
        params![now, now, invoice_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE payments SET deleted_at = ?, updated_at = ? WHERE invoice_id = ?",
        params![now, now, invoice_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// Cascading Deletes for Tenants
#[tauri::command]
pub async fn db_delete_tenant_cascading(
    tenant_id: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    conn.execute(
        "UPDATE tenants SET deleted_at = ?, updated_at = ? WHERE id = ?",
        params![now, now, tenant_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE leases SET deleted_at = ?, updated_at = ? WHERE tenant_id = ?",
        params![now, now, tenant_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// Export All Data (for backup / Drive sync)
#[tauri::command]
pub async fn db_export_all(state: tauri::State<'_, DatabaseManager>) -> Result<Value, String> {
    let mut map = serde_json::Map::new();

    for table in ALLOWED_TABLES {
        let rows = db_get_table(table.to_string(), state.clone()).await?;
        map.insert(table.to_string(), Value::Array(rows));
    }

    Ok(Value::Object(map))
}

// Import All Data
#[tauri::command]
pub async fn db_import_all(
    data: Value,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<(), String> {
    let obj = data.as_object().ok_or("Import payload must be an object")?;

    for (table, rows_val) in obj {
        if !ALLOWED_TABLES.contains(&table.as_str()) {
            continue;
        }
        if let Some(rows) = rows_val.as_array() {
            for row in rows {
                let _ = db_insert_item(table.clone(), row.clone(), state.clone()).await;
            }
        }
    }

    Ok(())
}

// Backup Database File (Creates an encrypted copy of the SQLite database file at user-selected location)
#[tauri::command]
pub async fn db_backup_file(
    destination_path: String,
    state: tauri::State<'_, DatabaseManager>,
) -> Result<String, String> {
    if destination_path.contains("..") || destination_path.contains('\0') {
        return Err("Security Violation: Path traversal or invalid character detected".into());
    }

    let dest = PathBuf::from(&destination_path);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create destination directory: {}", e))?;
        }
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let _ = conn.execute("PRAGMA wal_checkpoint(FULL);", []);

    fs::copy(&state.db_path, &dest)
        .map_err(|e| format!("Failed to copy database file: {}", e))?;

    Ok(format!("Database file successfully backed up to {}", destination_path))
}
