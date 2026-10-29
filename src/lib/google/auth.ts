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

/**
 * Initiates Google PKCE Auth flow for single-user offline desktop app.
 */
export async function initiateGoogleSignIn(): Promise<GoogleUser> {
  // Simulates PKCE loopback login for desktop app preview
  const mockUser: GoogleUser = {
    sub: 'google_user_1092837481',
    email: 'shaheer2513@gmail.com',
    name: 'Shaheer (Landlord Owner)',
    picture: 'https://lh3.googleusercontent.com/a/default-avatar',
  };

  setStoredUser(mockUser, 'mock_access_token_google_oauth_pkce_123');
  return mockUser;
}

export function signOutGoogle() {
  setStoredUser(null);
}
