export {};

declare module 'express-session' {
  interface SessionData {
    adminUserId?: string;
    csrfToken?: string;
    flash?: { type: 'success' | 'error'; message: string };
  }
}
