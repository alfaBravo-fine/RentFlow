import { create } from 'zustand';

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
  signOut: () => Promise<void>;
  checkAuth: () => void;
}

const STORAGE_USER_KEY = 'rentflow_google_user';
const STORAGE_TOKEN_KEY = 'rentflow_google_access_token';
const STORAGE_DRIVE_FILE_ID_KEY = 'rentflow_google_drive_file_id';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: (() => {
    try {
      const raw = localStorage.getItem(STORAGE_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })(),
  accessToken: localStorage.getItem(STORAGE_TOKEN_KEY) || null,
  driveFileId: localStorage.getItem(STORAGE_DRIVE_FILE_ID_KEY) || null,
  isAuthenticated: (() => {
    try {
      const userRaw = localStorage.getItem(STORAGE_USER_KEY);
      const token = localStorage.getItem(STORAGE_TOKEN_KEY);
      return !!(userRaw && token);
    } catch {
      return false;
    }
  })(),
  isAuthenticating: false,
  authError: null,

  setAuthenticating: (isAuthenticating: boolean, error: string | null = null) => {
    set({ isAuthenticating, authError: error });
  },

  setGoogleSession: (user: UserProfile, accessToken: string, driveFileId: string) => {
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    localStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
    localStorage.setItem(STORAGE_DRIVE_FILE_ID_KEY, driveFileId);

    set({
      user,
      accessToken,
      driveFileId,
      isAuthenticated: true,
      isAuthenticating: false,
      authError: null,
    });
  },

  signOut: async () => {
    const token = get().accessToken;
    if (token) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `token=${token}`,
        });
      } catch (e) {
        console.warn('Error revoking token:', e);
      }
    }

    localStorage.removeItem(STORAGE_USER_KEY);
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
    try {
      const userRaw = localStorage.getItem(STORAGE_USER_KEY);
      const token = localStorage.getItem(STORAGE_TOKEN_KEY);
      const fileId = localStorage.getItem(STORAGE_DRIVE_FILE_ID_KEY);

      if (userRaw && token) {
        set({
          user: JSON.parse(userRaw),
          accessToken: token,
          driveFileId: fileId,
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
    } catch {
      set({
        user: null,
        accessToken: null,
        driveFileId: null,
        isAuthenticated: false,
      });
    }
  },
}));
