// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod drive_sync;
mod oauth;

use db::{
    db_backup_file, db_delete_invoice_cascading, db_delete_item, db_delete_property_cascading,
    db_delete_tenant_cascading, db_delete_unit_cascading, db_export_all, db_get_item, db_get_table,
    db_import_all, db_init, db_insert_item, db_update_item, DatabaseManager,
};
use drive_sync::{drive_pull_backup, drive_push_backup};
use oauth::{google_get_current_user, google_login, google_oauth, google_oauth_logout, AuthState};
use std::fs;
use tauri::Manager;

fn main() {
    dotenvy::dotenv().ok();
    dotenvy::from_path(".env").ok();
    dotenvy::from_path("../.env").ok();
    dotenvy::from_filename("../.env").ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app_data_dir: {}", e))?;

            fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("Failed to create app_data_dir: {}", e))?;

            let db_path = app_data_dir.join("rentflow_encrypted.db");
            let db_manager = DatabaseManager::new(db_path)?;

            app.manage(db_manager);
            app.manage(AuthState::default());

            println!("[RentFlow Tauri] SQLCipher AES-256 database & security initialized.");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Database operations (SQLCipher encrypted)
            db_init,
            db_get_table,
            db_get_item,
            db_insert_item,
            db_update_item,
            db_delete_item,
            db_delete_property_cascading,
            db_delete_unit_cascading,
            db_delete_invoice_cascading,
            db_delete_tenant_cascading,
            db_export_all,
            db_import_all,
            db_backup_file,
            // Google OAuth Loopback Desktop Flow
            google_login,
            google_oauth,
            google_oauth_logout,
            google_get_current_user,
            // Google Drive Rust Sync
            drive_push_backup,
            drive_pull_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RentFlow desktop application");
}
