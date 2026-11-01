use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::Arc;
use tauri::State;

use crate::db::{db_export_all, db_import_all, DatabaseManager};
use crate::oauth::AuthState;

const SALT: &[u8] = b"rentflow_appdata_gcm_salt_v2";
const APP_DATA_BACKUP_FILENAME: &str = "RentFlowBackup.enc";

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupSyncResult {
    pub success: bool,
    pub synced_at: String,
    pub file_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DrivePullResult {
    pub restored: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct DriveFileList {
    pub files: Vec<DriveFileItem>,
}

#[derive(Debug, Deserialize, Serialize)]
struct DriveFileItem {
    pub id: String,
    pub name: String,
}

fn derive_aes_key(google_id: &str) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(google_id.as_bytes(), SALT, 100_000, &mut key);
    key
}

fn encrypt_payload(plaintext: &str, google_id: &str) -> Result<Vec<u8>, String> {
    let key = derive_aes_key(google_id);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("AES encryption error: {}", e))?;

    let mut output = Vec::with_capacity(12 + ciphertext.len());
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

fn decrypt_payload(encrypted_bytes: &[u8], google_id: &str) -> Result<String, String> {
    if encrypted_bytes.len() < 12 {
        return Err("Payload too short for AES-GCM nonce".to_string());
    }

    let key = derive_aes_key(google_id);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let (nonce_bytes, ciphertext) = encrypted_bytes.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("AES decryption authentication failed: {}", e))?;

    String::from_utf8(decrypted).map_err(|e| format!("UTF-8 decoding error: {}", e))
}

async fn find_drive_backup_file(token: &str) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", token))
        .query(&[
            ("spaces", "appDataFolder"),
            ("q", &format!("name = '{}' and trashed = false", APP_DATA_BACKUP_FILENAME)),
            ("fields", "files(id, name)"),
        ])
        .send()
        .await
        .map_err(|e| format!("Drive query error: {}", e))?;

    if !res.status().is_success() {
        return Ok(None);
    }

    let list: DriveFileList = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Drive list: {}", e))?;

    Ok(list.files.first().map(|f| f.id.clone()))
}

#[tauri::command]
pub async fn drive_push_backup(
    google_id: String,
    auth_state: State<'_, AuthState>,
    db_state: State<'_, DatabaseManager>,
) -> Result<BackupSyncResult, String> {
    // 1. Validate google_id input
    if google_id.is_empty() || google_id.contains('/') || google_id.contains('\\') {
        return Err("Invalid Google User ID".into());
    }

    // 2. Retrieve backend access token
    let token = auth_state
        .access_token
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Not authenticated with Google Drive".to_string())?;

    // 3. Export all data from encrypted SQLCipher DB
    let full_snapshot = db_export_all(db_state.clone()).await?;

    let payload = serde_json::json!({
        "app": "RentFlow",
        "version": "2.0.0",
        "exportedAt": chrono_or_now(),
        "userId": google_id,
        "data": full_snapshot
    });

    // 4. Encrypt using AES-256-GCM
    let encrypted_bytes = encrypt_payload(&payload.to_string(), &google_id)?;

    // 5. Check if file already exists in appDataFolder
    let mut file_id = auth_state.drive_file_id.lock().unwrap().clone();
    if file_id.is_none() {
        file_id = find_drive_backup_file(&token).await?;
        *auth_state.drive_file_id.lock().unwrap() = file_id.clone();
    }

    let client = reqwest::Client::new();
    let synced_at = chrono_or_now();

    if let Some(ref fid) = file_id {
        // PATCH existing file
        let url = format!("https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=media", fid);
        let res = client
            .patch(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/octet-stream")
            .body(encrypted_bytes)
            .send()
            .await
            .map_err(|e| format!("Upload error: {}", e))?;

        if !res.status().is_success() {
            let err_text = res.text().await.unwrap_or_default();
            return Err(format!("Drive PATCH error: {}", err_text));
        }
    } else {
        // POST new multipart file into appDataFolder
        let metadata = serde_json::json!({
            "name": APP_DATA_BACKUP_FILENAME,
            "parents": ["appDataFolder"]
        });

        let form = reqwest::multipart::Form::new()
            .part(
                "metadata",
                reqwest::multipart::Part::text(metadata.to_string())
                    .mime_str("application/json")
                    .map_err(|e| e.to_string())?,
            )
            .part(
                "file",
                reqwest::multipart::Part::bytes(encrypted_bytes)
                    .mime_str("application/octet-stream")
                    .map_err(|e| e.to_string())?,
            );

        let res = client
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
            .header("Authorization", format!("Bearer {}", token))
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Drive upload error: {}", e))?;

        if !res.status().is_success() {
            let err_text = res.text().await.unwrap_or_default();
            return Err(format!("Drive create error: {}", err_text));
        }

        let created_file: DriveFileItem = res
            .json()
            .await
            .map_err(|e| format!("Parse created file response: {}", e))?;

        *auth_state.drive_file_id.lock().unwrap() = Some(created_file.id.clone());
        file_id = Some(created_file.id);
    }

    Ok(BackupSyncResult {
        success: true,
        synced_at,
        file_id,
        message: "SQLCipher database backed up to Google Drive appDataFolder".into(),
    })
}

#[tauri::command]
pub async fn drive_pull_backup(
    google_id: String,
    auth_state: State<'_, AuthState>,
    db_state: State<'_, DatabaseManager>,
) -> Result<DrivePullResult, String> {
    if google_id.is_empty() {
        return Err("Invalid Google User ID".into());
    }

    let token = auth_state
        .access_token
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Not authenticated with Google Drive".to_string())?;

    let file_id = find_drive_backup_file(&token).await?;

    let Some(fid) = file_id else {
        return Ok(DrivePullResult {
            restored: false,
            message: "No remote backup file found in Google Drive appDataFolder".into(),
        });
    };

    let client = reqwest::Client::new();
    let res = client
        .get(format!("https://www.googleapis.com/drive/v3/files/{}?alt=media", fid))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("Download error: {}", e))?;

    if !res.status().is_success() {
        return Err("Failed to download remote encrypted backup".into());
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Read backup bytes error: {}", e))?;

    if bytes.len() < 12 {
        return Ok(DrivePullResult {
            restored: false,
            message: "Remote backup file is empty".into(),
        });
    }

    let decrypted_str = decrypt_payload(&bytes, &google_id)?;
    let parsed: serde_json::Value = serde_json::from_str(&decrypted_str)
        .map_err(|e| format!("Failed to parse decrypted JSON: {}", e))?;

    if let Some(data_obj) = parsed.get("data") {
        db_import_all(data_obj.clone(), db_state.clone()).await?;
        return Ok(DrivePullResult {
            restored: true,
            message: "Successfully restored data from Google Drive into SQLCipher database".into(),
        });
    }

    Ok(DrivePullResult {
        restored: false,
        message: "Backup contained no table data".into(),
    })
}

fn chrono_or_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}.000Z", now)
}
