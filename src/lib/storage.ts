export type PersistedState = {
  publisherSlug: string;
  publisherApiKey: string;
  adminApiKey: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: string;
  theme: 'dark' | 'light';
  user: { id: string; username: string; email: string; status: string; is_admin: boolean; capabilities?: string[]; publisher_slug?: string | null } | null;
};

const KEY = 'ls_admin_v2';
export const API_BASE = 'http://127.0.0.1:45121';

export function loadState(): PersistedState {
  const defaults: PersistedState = {
    publisherSlug: 'local-studio',
    publisherApiKey: '',
    adminApiKey: import.meta.env.VITE_DEFAULT_ADMIN_API_KEY?.trim() || 'local-studio-backend-admin',
    accessToken: '', refreshToken: '', sessionId: '', expiresAt: '',
    theme: 'dark', user: null,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<PersistedState>) };
  } catch { return defaults; }
}

export function saveState(v: PersistedState): void {
  localStorage.setItem(KEY, JSON.stringify(v));
}
