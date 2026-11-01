export interface GoogleUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

const GOOGLE_USER_KEY = 'rentflow_google_user';
const GOOGLE_TOKEN_KEY = 'rentflow_google_access_token';

export function getStoredUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(GOOGLE_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setStoredUser(user: GoogleUser | null, accessToken?: string) {
  if (user) {
    localStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(user));
    if (accessToken) localStorage.setItem(GOOGLE_TOKEN_KEY, accessToken);
  } else {
    localStorage.removeItem(GOOGLE_USER_KEY);
    localStorage.removeItem(GOOGLE_TOKEN_KEY);
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(GOOGLE_TOKEN_KEY);
}

export function signOutGoogle() {
  setStoredUser(null);
}
