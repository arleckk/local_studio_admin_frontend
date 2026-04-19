export type PersistedState = {
  publisherSlug: string;
  theme: 'dark' | 'light';
};

export type SessionPersistedState = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: string;
  user: Record<string, unknown> | null;
};

const KEY = 'ls_admin_v3';
const SESSION_KEY = 'ls_admin_session_v1';
const envApiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
export const API_BASE = envApiBase.replace(/\/$/, '');
export const API_BASE_DISPLAY = API_BASE || 'same-origin / dev proxy';
export const AUTH_USES_COOKIES = (import.meta.env.VITE_AUTH_SESSION_MODE?.trim().toLowerCase() || '') === 'cookie';

export function loadState(): PersistedState {
  const defaults: PersistedState = {
    publisherSlug: import.meta.env.VITE_DEFAULT_PUBLISHER_SLUG?.trim() || 'local-studio',
    theme: 'dark',
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<PersistedState>) };
  } catch {
    return defaults;
  }
}

export function saveState(v: PersistedState): void {
  localStorage.setItem(KEY, JSON.stringify(v));
}

export function loadSessionState<TUser = Record<string, unknown>>(): SessionPersistedState & { user: TUser | null } {
  const defaults: SessionPersistedState = {
    accessToken: '',
    refreshToken: '',
    sessionId: '',
    expiresAt: '',
    user: null,
  };

  if (AUTH_USES_COOKIES) return defaults as SessionPersistedState & { user: TUser | null };

  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return defaults as SessionPersistedState & { user: TUser | null };
    return { ...defaults, ...(JSON.parse(raw) as Partial<SessionPersistedState>) } as SessionPersistedState & { user: TUser | null };
  } catch {
    return defaults as SessionPersistedState & { user: TUser | null };
  }
}

export function saveSessionState(v: SessionPersistedState): void {
  if (AUTH_USES_COOKIES) return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(v));
}

export function clearSessionState(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
