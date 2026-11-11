import { create } from 'zustand';
import { GOOGLE_CLIENT_ID } from '../config/google';
import { requestFreshAccessToken, isNonOAuthToken } from '../lib/googleDriveService';
import { isTauri, tauriGoogleLogout } from '../lib/tauri/bridge';

export interface UserProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  driveFileId: string | null;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  setAuthenticating: (isAuthenticating: boolean, error?: string | null) => void;
  setGoogleSession: (user: UserProfile, accessToken: string, driveFileId: string) => void;
  setAccessToken: (accessToken: string) => void;
  refreshAccessTokenSilently: () => Promise<string | null>;
  signOut: () => Promise<void>;
  checkAuth: () => void;
}

const STORAGE_USER_KEY_1 = 'rentflow_user';
const STORAGE_USER_KEY_2 = 'rentflow_google_user';
const STORAGE_TOKEN_KEY = 'rentflow_google_access_token';
const STORAGE_DRIVE_FILE_ID_KEY = 'rentflow_google_drive_file_id';

function getStoredProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_USER_KEY_1) || localStorage.getItem(STORAGE_USER_KEY_2);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: getStoredProfile(),
  accessToken: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_TOKEN_KEY) || null : null,
  driveFileId: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_DRIVE_FILE_ID_KEY) || null : null,
  // Persistent login: If user profile exists in localStorage, immediately set to logged in!
  isAuthenticated: !!getStoredProfile(),
  isAuthenticating: false,
  authError: null,

  setAuthenticating: (isAuthenticating: boolean, error: string | null = null) => {
    set({ isAuthenticating, authError: error });
  },

  setGoogleSession: (user: UserProfile, accessToken: string, driveFileId: string) => {
    const userJson = JSON.stringify(user);
    localStorage.setItem(STORAGE_USER_KEY_1, userJson);
    localStorage.setItem(STORAGE_USER_KEY_2, userJson);
    localStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
    if (driveFileId) {
      localStorage.setItem(STORAGE_DRIVE_FILE_ID_KEY, driveFileId);
    }

    set({
      user,
      accessToken,
      driveFileId: driveFileId || get().driveFileId,
      isAuthenticated: true,
      isAuthenticating: false,
      authError: null,
    });
  },

  setAccessToken: (accessToken: string) => {
    localStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
    set({ accessToken });
  },

  refreshAccessTokenSilently: async () => {
    try {
      const freshToken = await requestFreshAccessToken(
        GOOGLE_CLIENT_ID,
        'openid email profile https://www.googleapis.com/auth/drive.appdata'
      );
      if (freshToken) {
        localStorage.setItem(STORAGE_TOKEN_KEY, freshToken);
        set({ accessToken: freshToken });
        return freshToken;
      }
    } catch (err) {
      console.warn('[AuthStore] Silent token refresh failed:', err);
    }
    return null;
  },

  signOut: async () => {
    if (isTauri()) {
      try {
        await tauriGoogleLogout();
      } catch (e) {
        console.warn('Error logging out from Tauri backend:', e);
      }
    }

    const token = get().accessToken;
    if (!isNonOAuthToken(token) && token) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `token=${encodeURIComponent(token)}`,
        });
      } catch (e) {
        console.warn('Error revoking token:', e);
      }
    }

    localStorage.removeItem(STORAGE_USER_KEY_1);
    localStorage.removeItem(STORAGE_USER_KEY_2);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_DRIVE_FILE_ID_KEY);

    set({
      user: null,
      accessToken: null,
      driveFileId: null,
      isAuthenticated: false,
      isAuthenticating: false,
      authError: null,
    });
  },

  checkAuth: () => {
    const profile = getStoredProfile();
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    const fileId = localStorage.getItem(STORAGE_DRIVE_FILE_ID_KEY);

    if (profile) {
      set({
        user: profile,
        accessToken: token || null,
        driveFileId: fileId || null,
        isAuthenticated: true,
      });
    } else {
      set({
        user: null,
        accessToken: null,
        driveFileId: null,
        isAuthenticated: false,
      });
    }
  },
}));
