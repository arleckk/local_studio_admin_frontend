export type PersistedState = {
  publisherSlug: string;
  theme: 'dark' | 'light';
};

const KEY = 'ls_admin_v3';
const envApiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';
export const API_BASE = envApiBase.replace(/\/$/, '');
export const API_BASE_DISPLAY = API_BASE || 'same-origin / dev proxy';

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
