// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use oauth2::{
    basic::BasicClient, AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, PkceCodeVerifier,
    RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::env;
use std::sync::Mutex;
use tauri::Manager;

const SALT: &[u8] = b"rentflow_appdata_gcm_salt_v2";
const APP_DATA_BACKUP_FILENAME: &str = "RentFlowBackup.enc";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfoResponse {
    pub sub: String,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleTokenExchangeResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupSyncResult {
    pub success: bool,
    pub synced_at: String,
    pub file_id: Option<String>,
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

// In-memory token vault cache
pub struct AppState {
    pub access_token: Mutex<Option<String>>,
    pub refresh_token: Mutex<Option<String>>,
    pub user_id: Mutex<Option<String>>,
    pub drive_file_id: Mutex<Option<String>>,
}

// --- Key Derivation & AES-256-GCM Helpers ---

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

// Helper: Get or create Google Drive App Folder File in appDataFolder
async fn ensure_google_drive_app_folder(access_token: &str) -> Result<String, String> {
    let client = reqwest::Client::new();

    // 1. Search for existing RentFlowBackup.enc in appDataFolder
    let list_res = client
        .get("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", access_token))
        .query(&[
            ("spaces", "appDataFolder"),
            ("q", &format!("name = '{}' and trashed = false", APP_DATA_BACKUP_FILENAME)),
            ("fields", "files(id, name)"),
        ])
        .send()
        .await
        .map_err(|e| format!("Google Drive list query error: {}", e))?;

    if list_res.status().is_success() {
        let list_data: DriveFileList = list_res
            .json()
            .await
            .map_err(|e| format!("Failed to parse Drive file list: {}", e))?;

        if let Some(existing_file) = list_data.files.first() {
            return Ok(existing_file.id.clone());
        }
    }

    // 2. Create RentFlowBackup.enc in appDataFolder
    let mut body_map = HashMap::new();
    body_map.insert("name", APP_DATA_BACKUP_FILENAME);
    body_map.insert("parents", "appDataFolder");

    let create_res = client
        .post("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "name": APP_DATA_BACKUP_FILENAME,
            "parents": ["appDataFolder"]
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to create Google Drive appDataFolder file: {}", e))?;

    if !create_res.status().is_success() {
        let err_text = create_res.text().await.unwrap_or_default();
        return Err(format!("Drive file creation error (HTTP status): {}", err_text));
    }

    let created_item: DriveFileItem = create_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse created file response: {}", e))?;

    Ok(created_item.id)
}

// --- Tauri Commands ---

#[tauri::command]
async fn google_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<UserProfile, String> {
    dotenvy::dotenv().ok();
    dotenvy::from_path(".env").ok();
    dotenvy::from_path("../.env").ok();
    dotenvy::from_filename("../.env").ok();

    let client_id = env::var("VITE_GOOGLE_CLIENT_ID")
        .or_else(|_| env::var("GOOGLE_CLIENT_ID"))
        .map_err(|_| "VITE_GOOGLE_CLIENT_ID missing from .env file".to_string())?;

    let client_secret = env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| "GOOGLE_CLIENT_SECRET missing from .env file".to_string())?;

    println!("==================================================");
    println!("[RentFlow Rust Auth] Reading Client ID from environment...");
    println!("[RentFlow Rust Auth] Exact Client ID: {}", client_id);

    let (tx, rx) = tokio::sync::oneshot::channel::<String>();

    // Start local loopback server on 127.0.0.1
    let port = tauri_plugin_oauth::start(move |url| {
        // Parse callback query string for ?code=
        if let Ok(parsed_url) = reqwest::Url::parse(&url) {
            for (k, v) in parsed_url.query_pairs() {
                if k == "code" {
                    let _ = tx.send(v.to_string());
                    break;
                }
            }
        }
    })
    .map_err(|e| format!("Failed to start OAuth loopback server: {}", e))?;

    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    println!("[RentFlow Rust Auth] Loopback Redirect URI: {}", redirect_uri);

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // Force Account Selection (prompt=consent) and offline refresh token
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
client_id={}&\
redirect_uri={}&\
response_type=code&\
scope=openid%20email%20profile%20https://www.googleapis.com/auth/drive.appdata&\
prompt=consent&\
access_type=offline&\
code_challenge={}&\
code_challenge_method=S256",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&pkce_challenge.as_str()),
    );

    println!("[RentFlow Rust Auth] Full Authorization URL:");
    println!("{}", auth_url);
    println!("==================================================");

    // Open default system browser (Chrome, Edge, Safari)
    open::that(&auth_url).map_err(|e| format!("Failed to open system browser: {}", e))?;

    // Wait for the OAuth authorization code from system browser loopback redirect
    let auth_code = rx
        .await
        .map_err(|_| "OAuth flow cancelled or timed out waiting for browser callback.".to_string())?;

    // Exchange auth_code for real tokens at Google OAuth Token Endpoint
    let http_client = reqwest::Client::new();
    let token_res = http_client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", auth_code.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri.as_str()),
            ("code_verifier", pkce_verifier.secret().as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange network error: {}", e))?;

    if !token_res.status().is_success() {
        let err_body = token_res.text().await.unwrap_or_default();
        return Err(format!("Google token exchange failed: {}", err_body));
    }

    let token_data: GoogleTokenExchangeResponse = token_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Google token JSON: {}", e))?;

    let access_token = token_data.access_token;

    // Fetch real User Profile from Google UserInfo endpoint
    let userinfo_res = http_client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("UserInfo request error: {}", e))?;

    if !userinfo_res.status().is_success() {
        let err_body = userinfo_res.text().await.unwrap_or_default();
        return Err(format!("Failed to retrieve Google user profile: {}", err_body));
    }

    let userinfo: GoogleUserInfoResponse = userinfo_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Google UserInfo response: {}", e))?;

    // Create/Verify Google Drive appDataFolder file
    let drive_file_id = ensure_google_drive_app_folder(&access_token).await?;

    let profile = UserProfile {
        id: userinfo.sub.clone(),
        email: userinfo.email,
        name: userinfo.name,
        picture: userinfo.picture,
    };

    // Store real credentials in AppState
    *state.access_token.lock().unwrap() = Some(access_token);
    *state.refresh_token.lock().unwrap() = token_data.refresh_token;
    *state.user_id.lock().unwrap() = Some(profile.id.clone());
    *state.drive_file_id.lock().unwrap() = Some(drive_file_id);

    Ok(profile)
}

#[tauri::command]
async fn google_logout(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut token_lock = state.access_token.lock().unwrap();
    if let Some(token) = token_lock.take() {
        let client = reqwest::Client::new();
        let _ = client
            .post("https://oauth2.googleapis.com/revoke")
            .form(&[("token", token)])
            .send()
            .await;
    }
    *state.refresh_token.lock().unwrap() = None;
    *state.user_id.lock().unwrap() = None;
    *state.drive_file_id.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
async fn upload_backup(
    backup_json: String,
    google_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<BackupSyncResult, String> {
    let token = state
        .access_token
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "User not authenticated with Google Drive. Please log in.".to_string())?;

    let file_id = state
        .drive_file_id
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_else(|| "".into());

    let encrypted_bytes = encrypt_payload(&backup_json, &google_id)?;

    let client = reqwest::Client::new();

    // Upload encrypted database payload directly to Google Drive appDataFolder
    let upload_url = if !file_id.is_empty() {
        format!("https://www.googleapis.com/upload/drive/v3/files/{}?uploadType=media", file_id)
    } else {
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=media".to_string()
    };

    let req = if !file_id.is_empty() {
        client.patch(&upload_url)
    } else {
        client.post(&upload_url)
    };

    let res = req
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/octet-stream")
        .body(encrypted_bytes)
        .send()
        .await
        .map_err(|e| format!("Failed to upload encrypted backup to Google Drive: {}", e))?;

    if !res.status().is_success() {
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!("Drive upload failed (HTTP status): {}", err_body));
    }

    let now_str = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| format!("{}.000Z", d.as_secs()))
        .unwrap_or_default();

    Ok(BackupSyncResult {
        success: true,
        synced_at: now_str,
        file_id: Some(file_id),
        message: "Real encrypted database snapshot successfully backed up to Google Drive appDataFolder.".into(),
    })
}

#[tauri::command]
async fn download_backup(
    google_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let token = state
        .access_token
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "User not authenticated with Google Drive. Please log in.".to_string())?;

    let client = reqwest::Client::new();

    // 1. Search for existing RentFlowBackup.enc file
    let list_res = client
        .get("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", token))
        .query(&[
            ("spaces", "appDataFolder"),
            ("q", &format!("name = '{}' and trashed = false", APP_DATA_BACKUP_FILENAME)),
            ("fields", "files(id, name)"),
        ])
        .send()
        .await
        .map_err(|e| format!("Drive list error: {}", e))?;

    if !list_res.status().is_success() {
        return Ok("{}".to_string());
    }

    let list_data: DriveFileList = list_res
        .json()
        .await
        .map_err(|e| format!("Parse file list error: {}", e))?;

    if let Some(target_file) = list_data.files.first() {
        // 2. Download media content
        let download_res = client
            .get(format!("https://www.googleapis.com/drive/v3/files/{}?alt=media", target_file.id))
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Download error: {}", e))?;

        if download_res.status().is_success() {
            let encrypted_bytes = download_res
                .bytes()
                .await
                .map_err(|e| format!("Bytes read error: {}", e))?;

            if !encrypted_bytes.is_empty() {
                return decrypt_payload(&encrypted_bytes, &google_id);
            }
        }
    }

    Ok("{}".to_string())
}

fn main() {
    dotenvy::dotenv().ok();
    dotenvy::from_path(".env").ok();
    dotenvy::from_path("../.env").ok();
    dotenvy::from_filename("../.env").ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_oauth::init())
        .manage(AppState {
            access_token: Mutex::new(None),
            refresh_token: Mutex::new(None),
            user_id: Mutex::new(None),
            drive_file_id: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            google_login,
            google_logout,
            upload_backup,
            download_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RentFlow desktop application");
}
