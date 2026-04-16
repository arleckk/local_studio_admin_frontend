export type PersistedState = {
  apiBaseUrl: string;
  publisherSlug: string;
  publisherApiKey: string;
  adminApiKey: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: string;
  user: { id: string; username: string; email: string; status: string } | null;
};

const STORAGE_KEY = 'local_studio_admin_frontend_v1';

export function loadPersistedState(): PersistedState {
  const defaults: PersistedState = {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || '',
    publisherSlug: import.meta.env.VITE_DEFAULT_PUBLISHER_SLUG?.trim() || 'local-studio',
    publisherApiKey: import.meta.env.VITE_DEFAULT_PUBLISHER_API_KEY?.trim() || '',
    adminApiKey: import.meta.env.VITE_DEFAULT_ADMIN_API_KEY?.trim() || '',
    accessToken: '',
    refreshToken: '',
    sessionId: '',
    expiresAt: '',
    user: null,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<PersistedState>) };
  } catch {
    return defaults;
  }
}

export function savePersistedState(value: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}
