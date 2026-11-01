use oauth2::PkceCodeChallenge;
use serde::{Deserialize, Serialize};
use std::env;
use std::sync::Mutex;
use tauri::State;

// Secure Credential Placeholders as requested
const CLIENT_ID: &str = "[YOUR_CLIENT_ID_HERE]";
const CLIENT_SECRET: &str = "[YOUR_CLIENT_SECRET_HERE]";

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
struct GoogleTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
}

// In-memory secure token store - RAW TOKENS NEVER EXPOSED TO REACT FRONTEND
pub struct AuthState {
    pub access_token: Mutex<Option<String>>,
    pub refresh_token: Mutex<Option<String>>,
    pub user_profile: Mutex<Option<UserProfile>>,
    pub drive_file_id: Mutex<Option<String>>,
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            access_token: Mutex::new(None),
            refresh_token: Mutex::new(None),
            user_profile: Mutex::new(None),
            drive_file_id: Mutex::new(None),
        }
    }
}

// Read client credentials from environment or fallback to placeholders
pub fn get_client_credentials() -> (String, String) {
    let id = env::var("GOOGLE_CLIENT_ID")
        .or_else(|_| env::var("VITE_GOOGLE_CLIENT_ID"))
        .unwrap_or_else(|_| CLIENT_ID.to_string());

    let secret = env::var("GOOGLE_CLIENT_SECRET")
        .unwrap_or_else(|_| CLIENT_SECRET.to_string());

    (id, secret)
}

#[tauri::command]
pub async fn google_login(
    state: State<'_, AuthState>,
) -> Result<UserProfile, String> {
    dotenvy::dotenv().ok();
    dotenvy::from_path(".env").ok();
    dotenvy::from_path("../.env").ok();

    let (client_id, client_secret) = get_client_credentials();

    if client_id == "[YOUR_CLIENT_ID_HERE]" || client_id.is_empty() {
        return Err("Google Client ID not configured. Please set GOOGLE_CLIENT_ID in .env".to_string());
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<String>();

    // 1. Start one-shot loopback server on 127.0.0.1:<random_port> using tauri-plugin-oauth
    let port = tauri_plugin_oauth::start(move |url| {
        if let Ok(parsed_url) = reqwest::Url::parse(&url) {
            for (k, v) in parsed_url.query_pairs() {
                if k == "code" {
                    let _ = tx.send(v.to_string());
                    break;
                }
            }
        }
    })
    .map_err(|e| format!("Failed to start local OAuth loopback server: {}", e))?;

    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // 2. Build consent URL for Desktop App
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

    // 3. Open user's system default browser
    open::that(&auth_url).map_err(|e| format!("Failed to open default system browser: {}", e))?;

    // 4. Await authorization code from loopback redirect
    let auth_code = rx
        .await
        .map_err(|_| "OAuth flow timed out or cancelled by user.".to_string())?;

    // 5. Exchange code for access & refresh tokens
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
        .map_err(|e| format!("Network error exchanging token: {}", e))?;

    if !token_res.status().is_success() {
        let err_body = token_res.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", err_body));
    }

    let token_data: GoogleTokenResponse = token_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let access_token = token_data.access_token;

    // 6. Fetch User Profile
    let userinfo_res = http_client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("UserInfo request error: {}", e))?;

    if !userinfo_res.status().is_success() {
        return Err("Failed to retrieve Google user profile info".into());
    }

    let userinfo: GoogleUserInfoResponse = userinfo_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse userinfo: {}", e))?;

    let profile = UserProfile {
        id: userinfo.sub,
        email: userinfo.email,
        name: userinfo.name,
        picture: userinfo.picture,
    };

    // 7. Store tokens strictly in Rust backend memory (Never send to React frontend)
    *state.access_token.lock().unwrap() = Some(access_token);
    *state.refresh_token.lock().unwrap() = token_data.refresh_token;
    *state.user_profile.lock().unwrap() = Some(profile.clone());

    // 8. Return ONLY profile to the frontend
    Ok(profile)
}

#[tauri::command]
pub async fn google_oauth(
    state: State<'_, AuthState>,
) -> Result<UserProfile, String> {
    google_login(state).await
}

#[tauri::command]
pub async fn google_oauth_logout(state: State<'_, AuthState>) -> Result<(), String> {
    let token = state.access_token.lock().unwrap().take();
    if let Some(t) = token {
        let client = reqwest::Client::new();
        let _ = client
            .post("https://oauth2.googleapis.com/revoke")
            .form(&[("token", t)])
            .send()
            .await;
    }

    *state.refresh_token.lock().unwrap() = None;
    *state.user_profile.lock().unwrap() = None;
    *state.drive_file_id.lock().unwrap() = None;

    Ok(())
}

#[tauri::command]
pub async fn google_get_current_user(state: State<'_, AuthState>) -> Result<Option<UserProfile>, String> {
    let user = state.user_profile.lock().unwrap().clone();
    Ok(user)
}
