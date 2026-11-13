/**
 * Google OAuth 2.0 Client ID Configuration
 * Uses VITE_GOOGLE_CLIENT_ID injected at build time (e.g. GitHub Actions secret) with fallback.
 */
export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "509114057579-5bv9v9laq51n2ehoe3gkrcuvdsg7b3q4.apps.googleusercontent.com";
