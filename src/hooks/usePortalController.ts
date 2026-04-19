import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, req, subscribeUnauthorized } from '../lib/api';
import { API_BASE_DISPLAY, clearSessionState, loadSessionState, loadState, saveSessionState, saveState } from '../lib/storage';
import type {
  AdminSummary,
  AdminUser,
  CapabilityOption,
  DeveloperKey,
  DeveloperStatus,
  PackageValidationResult,
  PublisherPlugin,
  PublisherPublishResponse,
  PublisherRelease,
  ReviewQueueItem,
  ReviewQueueSummary,
  RuntimeStatus,
  SessionResponse,
  SessionUser,
  PublishForm,
} from '../lib/types';
import {
  loadDeveloperKeys,
  loadDeveloperStatusWithFallback,
  normalizePlugins,
  normalizeReleases,
  normalizeReviewQueue,
  validatePackageContract,
} from '../lib/contracts';
import {
  AdminPage,
  Theme,
  Toast,
  UserPage,
  buildFallbackPackageValidation,
  enrichPlugin,
  exportCsv,
  isAllowedYoutubeUrl,
  normalizeCapabilityOptions,
  validateIconFile,
  validateImageFiles,
  validatePackageFile,
  splitCsvLike,
  toReleaseChannelOptions,
} from '../lib/utils';

const ps = loadState();
const sessionState = loadSessionState<SessionUser>();

type ConfirmCtx = { title: string; body: string; onOk: () => void } | null;


const emptyDeveloperStatus: DeveloperStatus = {
  source: 'fallback',
  status: 'unknown',
  developer_status: 'unknown',
  capabilities: [],
  publish_allowed: null,
  developer_mode_allowed: null,
  local_install_allowed: null,
  signing_keys_registered: 0,
  active_key_id: null,
  warnings: [],
  notes: [],
};

function isPluginInactive(plugin: PublisherPlugin | null | undefined) {
  if (!plugin) return false;
  const status = String(plugin.status || '').toLowerCase();
  return status.includes('deactivated') || status.includes('disabled') || !!plugin.deactivated_at;
}

export function usePortalController() {
  const [theme, setTheme] = useState<Theme>(ps.theme ?? 'dark');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const unauthorizedHandledAt = useRef(0);
  const refreshPromiseRef = useRef<Promise<SessionResponse | null> | null>(null);
  const lastVerifiedAccessTokenRef = useRef<string | null>(null);

  const [accessToken, setAccessToken] = useState(sessionState.accessToken || '');
  const [refreshToken, setRefreshToken] = useState(sessionState.refreshToken || '');
  const [sessionId, setSessionId] = useState(sessionState.sessionId || '');
  const [expiresAt, setExpiresAt] = useState(sessionState.expiresAt || '');
  const [user, setUser] = useState<SessionUser | null>(sessionState.user || null);

  const [aPage, setAPage] = useState<AdminPage>('dash');
  const [uPage, setUPage] = useState<UserPage>('publish');

  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [allPlugins, setAllPlugins] = useState<PublisherPlugin[]>([]);
  const [myPlugins, setMyPlugins] = useState<PublisherPlugin[]>([]);
  const [releases, setReleases] = useState<PublisherRelease[]>([]);
  const [capabilityOptions, setCapabilityOptions] = useState<CapabilityOption[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewQueueSummary | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [developerStatus, setDeveloperStatus] = useState<DeveloperStatus>(emptyDeveloperStatus);
  const [developerKeys, setDeveloperKeys] = useState<DeveloperKey[]>([]);
  const [packageValidation, setPackageValidation] = useState<PackageValidationResult | null>(null);

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [pluginFilter, setPluginFilter] = useState('all');
  const [pluginSearch, setPluginSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [releaseKey, setReleaseKey] = useState('');
  const [confirmCtx, setConfirmCtx] = useState<ConfirmCtx>(null);

  const [publishForm, setPublishForm] = useState<PublishForm>({
    name: '',
    description: '',
    tags: '',
    categories: '',
    capabilities: [],
    changelog: '',
    videoLinks: '',
    releaseChannel: 'private_beta',
    entitlementPolicy: 'free',
    offlineGraceDays: 30,
    packageFile: null,
    iconFile: null,
    imageFiles: [],
  });
  const [publishDrag, setPublishDrag] = useState({ package: false, icon: false, images: false });
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [loginForm, setLoginForm] = useState({ ident: '', pw: '' });
  const [regForm, setRegForm] = useState({ user: '', email: '', pw: '', pw2: '' });
  const [developerKeyForm, setDeveloperKeyForm] = useState({ label: '', algorithm: 'ed25519', publicKey: '' });
  const [authTab, setAuthTab] = useState<'login' | 'reg'>('login');
  const [selectedMyPluginKey, setSelectedMyPluginKey] = useState<string | null>(null);

  const isAdmin = !!user?.is_admin;
  const isLoggedIn = !!user;

  useEffect(() => {
    saveState({
      publisherSlug: user?.publisher_slug || ps.publisherSlug || 'local-studio',
      theme,
    });
  }, [theme, user?.publisher_slug]);

  useEffect(() => {
    saveSessionState({
      accessToken,
      refreshToken,
      sessionId,
      expiresAt,
      user,
    });
  }, [accessToken, refreshToken, sessionId, expiresAt, user]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toast = useCallback((kind: Toast['kind'], msg: string) => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, kind, msg }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200);
  }, []);

  const isBusy = useCallback((key: string) => !!busy[key], [busy]);

  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy((current) => ({ ...current, [key]: true }));
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && (accessToken || user)) {
        return null;
      }
      toast('err', error instanceof ApiError ? error.message : String(error));
      return null;
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  }

  const auth = useCallback(
    (opts: { pub?: boolean; admin?: boolean } = {}) => ({
      token: accessToken,
      publisherSlug: user?.publisher_slug || ps.publisherSlug,
      pub: opts.pub,
      admin: opts.admin,
    }),
    [accessToken, user?.publisher_slug],
  );

  const applySession = useCallback((data: SessionResponse) => {
    lastVerifiedAccessTokenRef.current = null;
    setAccessToken(data.access_token);
    setRefreshToken(data.refresh_token);
    setSessionId(data.session_id);
    setExpiresAt(data.expires_at);
    setUser(data.user);
    setAuthTab('login');
  }, []);

  const clearSession = useCallback((reason?: string, kind: Toast['kind'] = 'inf') => {
    refreshPromiseRef.current = null;
    lastVerifiedAccessTokenRef.current = null;
    setUser(null);
    setAccessToken('');
    setRefreshToken('');
    setSessionId('');
    setExpiresAt('');
    clearSessionState();
    setSummary(null);
    setRuntime(null);
    setAllPlugins([]);
    setMyPlugins([]);
    setReleases([]);
    setReviewQueue([]);
    setReviewSummary(null);
    setAdminUsers([]);
    setUsersTotal(0);
    setDeveloperStatus(emptyDeveloperStatus);
    setDeveloperKeys([]);
    setPackageValidation(null);
    setSelectedMyPluginKey(null);
    setReleaseKey('');
    setAPage('dash');
    setUPage('developer');
    setAuthTab('login');
    setLoginForm((current) => ({ ...current, pw: '' }));
    if (reason) toast(kind, reason);
  }, [toast]);

  const refreshSession = useCallback(async (reason: 'proactive' | 'unauthorized' | 'manual' = 'proactive') => {
    if (!refreshToken) return null;
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const task = (async () => {
      try {
        const data = await req<SessionResponse>('/api/v1/accounts/refresh', {
          method: 'POST',
          body: { refresh_token: refreshToken, session_id: sessionId || null },
          suppressUnauthorizedEvent: true,
        });
        applySession(data);
        if (reason === 'manual') toast('ok', 'Session refreshed.');
        return data;
      } catch {
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = task;
    return task;
  }, [applySession, refreshToken, sessionId, toast]);

  useEffect(() => {
    const onUnauthorized = async (detail: { path: string }) => {
      const path = detail?.path || '';
      if (path.includes('/api/v1/accounts/refresh')) return;

      const now = Date.now();
      if (now - unauthorizedHandledAt.current < 800) return;
      unauthorizedHandledAt.current = now;
      if (!accessToken && !user) return;

      const refreshed = refreshToken ? await refreshSession('unauthorized') : null;
      if (refreshed) return;

      clearSession('Your session expired or is no longer valid. Please sign in again.', 'err');
    };

    return subscribeUnauthorized(onUnauthorized);
  }, [accessToken, clearSession, refreshSession, refreshToken, user]);

  useEffect(() => {
    if (!accessToken) return;
    if (lastVerifiedAccessTokenRef.current === accessToken) return;

    let cancelled = false;
    lastVerifiedAccessTokenRef.current = accessToken;

    const verifySession = async () => {
      try {
        const me = await req<SessionUser>('/api/v1/accounts/me', { token: accessToken });
        if (cancelled) return;
        setUser((current) => {
          if (
            current
            && current.id === me.id
            && current.username === me.username
            && current.email === me.email
            && current.is_admin === me.is_admin
            && current.publisher_slug === me.publisher_slug
            && JSON.stringify(current.capabilities || []) === JSON.stringify(me.capabilities || [])
          ) {
            return current;
          }
          return current ? { ...current, ...me } : me;
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) return;
        lastVerifiedAccessTokenRef.current = null;
      }
    };

    void verifySession();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !refreshToken || !expiresAt) return;
    const expiresMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresMs)) return;

    const leadTimeMs = 60_000;
    const delay = Math.max(0, expiresMs - Date.now() - leadTimeMs);
    const timer = window.setTimeout(() => {
      void refreshSession('proactive');
    }, delay);

    return () => window.clearTimeout(timer);
  }, [accessToken, expiresAt, refreshSession, refreshToken]);

  const refreshCapabilities = useCallback(async () => {
    const payload = await run('capabilities', async () => {
      const candidates = [
        '/api/v1/market/capabilities',
        '/api/v1/capabilities',
        '/api/v1/publishers/capabilities',
        '/api/v1/metadata/capabilities',
      ];
      for (const path of candidates) {
        try {
          return await req<unknown>(path, auth());
        } catch {
          // continue
        }
      }
      return [];
    });
    if (payload) setCapabilityOptions(normalizeCapabilityOptions(payload));
  }, [auth]);

  const loadDashboard = useCallback(async () => {
    if (!isAdmin || !accessToken) return;
    const payload = await run('dashboard', async () => {
      const [summaryPayload, runtimePayload] = await Promise.all([
        req<AdminSummary>('/api/v1/admin/summary', auth({ admin: true })),
        req<RuntimeStatus>('/api/v1/admin/runtime', auth({ admin: true })),
      ]);
      return { summaryPayload, runtimePayload };
    });
    if (!payload) return;
    setSummary(payload.summaryPayload);
    setRuntime(payload.runtimePayload);
  }, [accessToken, auth, isAdmin]);

  const loadAllPlugins = useCallback(async () => {
    if (!accessToken) return;
    const payload = await run('all-plugins', async () => req<unknown>('/api/v1/publishers/plugins', auth()));
    if (!payload) return;
    setAllPlugins(normalizePlugins(payload));
  }, [accessToken, auth]);

  const loadMyPlugins = useCallback(async () => {
    if (!accessToken) return;
    const pluginPayload = await run('my-plugins', async () => {
      const candidates = ['/api/v1/publishers/my/plugins', '/api/v1/publishers/plugins'];
      for (const path of candidates) {
        try {
          return await req<unknown>(path, auth());
        } catch {
          // continue
        }
      }
      throw new Error('No backend endpoint accepted my plugins listing yet.');
    });
    if (!pluginPayload) return;
    const plugins = normalizePlugins(pluginPayload);
    const releaseResults = await Promise.allSettled(
      plugins.map(async (plugin) => {
        const candidates = [
          `/api/v1/publishers/my/plugins/${encodeURIComponent(plugin.plugin_key)}/releases`,
          `/api/v1/publishers/plugins/${encodeURIComponent(plugin.plugin_key)}/releases`,
        ];
        for (const path of candidates) {
          try {
            return await req<unknown>(path, auth());
          } catch {
            // continue
          }
        }
        throw new Error(`No backend endpoint accepted releases for ${plugin.plugin_key}.`);
      }),
    );
    const releaseMap = new Map<string, PublisherRelease[]>();
    releaseResults.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      releaseMap.set(plugins[index].plugin_key, normalizeReleases(result.value));
    });
    const enriched = plugins.map((plugin) => enrichPlugin(plugin, releaseMap.get(plugin.plugin_key) || []));
    setMyPlugins(enriched);
    const firstKey = selectedMyPluginKey && enriched.some((plugin) => plugin.plugin_key === selectedMyPluginKey)
      ? selectedMyPluginKey
      : enriched[0]?.plugin_key || null;
    setSelectedMyPluginKey(firstKey);
    if (firstKey) setReleases(releaseMap.get(firstKey) || []);
    else setReleases([]);
  }, [accessToken, auth, selectedMyPluginKey]);

  const loadPluginReleases = useCallback(async (pluginKey: string) => {
    if (!accessToken) return;
    const payload = await run(`releases-${pluginKey}`, async () => {
      const candidates = [
        `/api/v1/publishers/my/plugins/${encodeURIComponent(pluginKey)}/releases`,
        `/api/v1/publishers/plugins/${encodeURIComponent(pluginKey)}/releases`,
      ];
      for (const path of candidates) {
        try {
          return await req<unknown>(path, auth());
        } catch {
          // continue
        }
      }
      throw new Error(`No backend endpoint accepted releases for ${pluginKey}.`);
    });
    if (!payload) return;
    setSelectedMyPluginKey(pluginKey);
    setReleaseKey(pluginKey);
    setReleases(normalizeReleases(payload));
  }, [accessToken, auth]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin || !accessToken) return;
    const query = new URLSearchParams();
    if (userSearch.trim()) query.set('q', userSearch.trim());
    if (userFilter !== 'all') query.set('status', userFilter);
    const payload = await run('users', async () => req<{ items?: AdminUser[]; total?: number } | AdminUser[]>(`/api/v1/admin/users${query.toString() ? `?${query.toString()}` : ''}`, auth({ admin: true })));
    if (!payload) return;
    if (Array.isArray(payload)) {
      setAdminUsers(payload);
      setUsersTotal(payload.length);
      return;
    }
    setAdminUsers(Array.isArray(payload.items) ? payload.items : []);
    setUsersTotal(typeof payload.total === 'number' ? payload.total : Array.isArray(payload.items) ? payload.items.length : 0);
  }, [accessToken, auth, isAdmin, userFilter, userSearch]);

  const loadReviews = useCallback(async () => {
    if (!isAdmin || !accessToken) return;
    const payload = await run('reviews', async () => {
      const [summaryPayload, queuePayload] = await Promise.all([
        req<ReviewQueueSummary>('/api/v1/admin/review-queue/summary', auth({ admin: true })),
        req<unknown>('/api/v1/reviews/queue', auth({ admin: true })),
      ]);
      return { summaryPayload, queuePayload };
    });
    if (!payload) return;
    setReviewSummary(payload.summaryPayload);
    setReviewQueue(normalizeReviewQueue(payload.queuePayload));
  }, [accessToken, auth, isAdmin]);

  const loadDeveloperHub = useCallback(async () => {
    if (!accessToken) return;
    const [keys, status] = await Promise.all([
      run('developer-keys', async () => loadDeveloperKeys(auth())),
      run('developer-status', async () => loadDeveloperStatusWithFallback(auth(), user?.capabilities, developerKeys.length)),
    ]);
    if (keys) setDeveloperKeys(keys);
    if (status) setDeveloperStatus(status);
  }, [accessToken, auth, developerKeys.length, user?.capabilities]);

  const validateSelectedPackage = useCallback(async (file: File | null, releaseChannel: string) => {
    if (!file) {
      setPackageValidation(null);
      return;
    }
    const result = await run('package-validate', async () => validatePackageContract(auth(), file, releaseChannel));
    const nextValidation = result || buildFallbackPackageValidation(file, releaseChannel);
    setPackageValidation(nextValidation);
    setPublishForm((current) => ({
      ...current,
      name: current.name || nextValidation.manifest?.display_name || current.name,
      capabilities: current.capabilities.length ? current.capabilities : (nextValidation.capabilities || []),
    }));
  }, [auth]);

  useEffect(() => {
    if (!isLoggedIn) return;
    refreshCapabilities();
    loadAllPlugins();
    loadMyPlugins();
    loadDeveloperHub();
    if (isAdmin) {
      loadDashboard();
      loadUsers();
      loadReviews();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!publishForm.packageFile) return;
    validateSelectedPackage(publishForm.packageFile, publishForm.releaseChannel);
  }, [publishForm.packageFile, publishForm.releaseChannel, validateSelectedPackage]);

  useEffect(() => {
    if (selectedMyPluginKey) {
      const plugin = myPlugins.find((item) => item.plugin_key === selectedMyPluginKey);
      if (plugin?.latest_release) setReleaseKey(plugin.latest_release.release_id);
    }
  }, [myPlugins, selectedMyPluginKey]);

  const handleLogin = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const data = await run('login', async () => req<SessionResponse>('/api/v1/accounts/login', {
      method: 'POST',
      body: { username_or_email: loginForm.ident, password: loginForm.pw },
    }));
    if (!data) return;
    applySession(data);
    toast('ok', `Welcome back, ${data.user.username}!`);
  }, [applySession, loginForm.ident, loginForm.pw, toast]);

  const handleRegister = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (regForm.pw !== regForm.pw2) { toast('err', 'Passwords do not match.'); return; }
    const data = await run('register', async () => req<SessionResponse>('/api/v1/accounts/register', {
      method: 'POST',
      body: { username: regForm.user, email: regForm.email, password: regForm.pw },
    }));
    if (!data) return;
    applySession(data);
    toast('ok', `Account created! Welcome, ${data.user.username}.`);
  }, [applySession, regForm.email, regForm.pw, regForm.pw2, regForm.user, toast]);

  const handleLogout = useCallback(async () => {
    await run('logout', async () => {
      try {
        await req('/api/v1/accounts/logout', { method: 'POST', token: accessToken, body: { refresh_token: refreshToken || null }, suppressUnauthorizedEvent: true });
      } catch {
        // ignore logout request errors
      }
      clearSession('Signed out.', 'ok');
      return true;
    });
  }, [accessToken, clearSession, refreshToken]);

  const handleChangePassword = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (pwForm.next !== pwForm.confirm) { toast('err', 'New passwords do not match.'); return; }
    const ok = await run('change-password', async () => req('/api/v1/accounts/change-password', {
      method: 'POST',
      token: accessToken,
      body: { current_password: pwForm.current, new_password: pwForm.next },
    }));
    if (!ok) return;
    setPwForm({ current: '', next: '', confirm: '' });
    clearSession('Password changed. Please sign in again with your new password.', 'ok');
  }, [accessToken, clearSession, pwForm.confirm, pwForm.current, pwForm.next, toast]);

  const handleRegisterDeveloperKey = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      label: developerKeyForm.label,
      algorithm: developerKeyForm.algorithm,
      public_key: developerKeyForm.publicKey,
    };
    const created = await run('developer-create-key', async () => {
      const candidates = [
        '/api/v1/developer/keys',
        '/api/v1/developers/keys',
        '/api/v1/publishers/developer/keys',
        '/api/v1/accounts/developer/keys',
      ];
      for (const path of candidates) {
        try {
          return await req<unknown>(path, { ...auth(), method: 'POST', body: payload });
        } catch {
          // continue
        }
      }
      throw new Error('No backend endpoint accepted developer key registration yet.');
    });
    if (!created) return;
    toast('ok', 'Public key registered.');
    setDeveloperKeyForm({ label: '', algorithm: 'ed25519', publicKey: '' });
    await loadDeveloperHub();
  }, [auth, developerKeyForm, loadDeveloperHub, toast]);

  const revokeDeveloperKey = useCallback(async (keyId: string) => {
    const ok = await run(`developer-revoke-${keyId}`, async () => {
      const candidates = [
        `/api/v1/developer/keys/${encodeURIComponent(keyId)}/revoke`,
        `/api/v1/developers/keys/${encodeURIComponent(keyId)}/revoke`,
        `/api/v1/publishers/developer/keys/${encodeURIComponent(keyId)}/revoke`,
        `/api/v1/accounts/developer/keys/${encodeURIComponent(keyId)}/revoke`,
      ];
      for (const path of candidates) {
        try {
          return await req<unknown>(path, { ...auth(), method: 'POST' });
        } catch {
          // continue
        }
      }
      throw new Error('No backend endpoint accepted developer key revocation yet.');
    });
    if (!ok) return;
    toast('ok', `Key ${keyId} revoked.`);
    await loadDeveloperHub();
  }, [auth, loadDeveloperHub, toast]);

  const onPackageSelected = useCallback((file: File | null) => {
    const error = validatePackageFile(file);
    if (error) {
      toast('err', error);
      setPublishForm((current) => ({ ...current, packageFile: null }));
      setPackageValidation(null);
      return;
    }
    setPublishForm((current) => ({ ...current, packageFile: file }));
    if (!file) setPackageValidation(null);
  }, [toast]);

  const onIconSelected = useCallback((file: File | null) => {
    const error = validateIconFile(file);
    if (error) {
      toast('err', error);
      return;
    }
    setPublishForm((current) => ({ ...current, iconFile: file }));
  }, [toast]);

  const onImagesSelected = useCallback((files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    const error = validateImageFiles(list);
    if (error) {
      toast('err', error);
      return;
    }
    setPublishForm((current) => ({ ...current, imageFiles: list }));
  }, [toast]);

  const publishPlugin = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!publishForm.packageFile) { toast('err', 'Package is required.'); return; }
    const packageError = validatePackageFile(publishForm.packageFile);
    if (packageError) { toast('err', packageError); return; }
    const iconError = validateIconFile(publishForm.iconFile);
    if (iconError) { toast('err', iconError); return; }
    const imageError = validateImageFiles(publishForm.imageFiles);
    if (imageError) { toast('err', imageError); return; }
    const videoLinks = splitCsvLike(publishForm.videoLinks);
    const invalidVideo = videoLinks.find((link) => !isAllowedYoutubeUrl(link));
    if (invalidVideo) { toast('err', `Only HTTPS YouTube links are allowed: ${invalidVideo}`); return; }
    if ((packageValidation?.errors.length || 0) > 0) { toast('err', 'Resolve package validation errors before submit.'); return; }

    const form = new FormData();
    form.append('name', publishForm.name);
    form.append('description', publishForm.description);
    form.append('tags', JSON.stringify(splitCsvLike(publishForm.tags)));
    form.append('categories', JSON.stringify(splitCsvLike(publishForm.categories)));
    form.append('capabilities', JSON.stringify(publishForm.capabilities));
    form.append('changelog', publishForm.changelog);
    form.append('release_channel', publishForm.releaseChannel);
    form.append('entitlement_policy', publishForm.entitlementPolicy);
    if (publishForm.entitlementPolicy !== 'free') form.append('offline_grace_days', String(publishForm.offlineGraceDays));
    form.append('video_links', JSON.stringify(videoLinks));
    form.append('package', publishForm.packageFile);
    if (publishForm.iconFile) form.append('icon', publishForm.iconFile);
    publishForm.imageFiles.forEach((file) => form.append('images', file));

    const response = await run('publish', async () => {
      const candidates = ['/api/v1/publishers/publish', '/api/v1/publishers/releases'];
      for (const path of candidates) {
        try {
          return await req<PublisherPublishResponse>(path, { ...auth(), method: 'POST', body: form, isForm: true });
        } catch {
          // continue
        }
      }
      throw new Error('Publish endpoints are not available yet.');
    });
    if (!response) return;
    toast('ok', `Submitted ${response.plugin.display_name} to ${publishForm.releaseChannel}.`);
    setPublishForm({
      name: '',
      description: '',
      tags: '',
      categories: '',
      capabilities: [],
      changelog: '',
      videoLinks: '',
      releaseChannel: 'private_beta',
      entitlementPolicy: 'free',
      offlineGraceDays: 30,
      packageFile: null,
      iconFile: null,
      imageFiles: [],
    });
    setPackageValidation(null);
    await Promise.all([loadAllPlugins(), loadMyPlugins(), isAdmin ? loadReviews() : Promise.resolve()]);
  }, [auth, isAdmin, loadAllPlugins, loadMyPlugins, loadReviews, packageValidation?.errors.length, publishForm, toast]);

  const setUserStatus = useCallback(async (userId: string, status: 'active' | 'suspended') => {
    const ok = await run(`user-status-${userId}`, async () => req(`/api/v1/admin/users/${encodeURIComponent(userId)}/status`, {
      ...auth({ admin: true }),
      method: 'POST',
      body: { status },
    }));
    if (!ok) return;
    toast('ok', `User set to ${status}.`);
    await loadUsers();
  }, [auth, loadUsers, toast]);

  const setPublisherOfficial = useCallback(async (publisherSlug: string, official: boolean) => {
    const ok = await run(`publisher-official-${publisherSlug}`, async () => req(`/api/v1/admin/publishers/${encodeURIComponent(publisherSlug)}/set-official?official=${official ? 'true' : 'false'}`, {
      ...auth({ admin: true }),
      method: 'POST',
    }));
    if (!ok) return;
    toast('ok', `${publisherSlug} marked as ${official ? 'official' : 'community'}.`);
    await loadAllPlugins();
  }, [auth, loadAllPlugins, toast]);

  const reviewAction = useCallback(async (releaseId: string, action: 'approve' | 'reject' | 'request-changes') => {
    const ok = await run(`review-${releaseId}-${action}`, async () => req(`/api/v1/reviews/${encodeURIComponent(releaseId)}/${action}`, {
      ...auth({ admin: true }),
      method: 'POST',
    }));
    if (!ok) return;
    toast('ok', `Review action applied: ${action}.`);
    await Promise.all([loadReviews(), loadMyPlugins(), loadAllPlugins()]);
  }, [auth, loadAllPlugins, loadMyPlugins, loadReviews, toast]);

  const togglePluginEnabled = useCallback(async (plugin: PublisherPlugin) => {
    const inactive = isPluginInactive(plugin);

    if (inactive) {
      const ok = await run(`enable-plugin-${plugin.plugin_key}`, async () => {
        const candidates = [
          `/api/v1/publishers/my/plugins/${encodeURIComponent(plugin.plugin_key)}/activate`,
          `/api/v1/publishers/my/plugins/${encodeURIComponent(plugin.plugin_key)}/reactivate`,
          `/api/v1/publishers/my/plugins/${encodeURIComponent(plugin.plugin_key)}/restore`,
          `/api/v1/publishers/plugins/${encodeURIComponent(plugin.plugin_key)}/enable`,
          `/api/v1/publishers/plugins/${encodeURIComponent(plugin.plugin_key)}/activate`,
          `/api/v1/publishers/plugins/${encodeURIComponent(plugin.plugin_key)}/restore`,
        ];
        for (const path of candidates) {
          try {
            return await req(path, { ...auth(), method: 'POST' });
          } catch (error) {
            const status = error instanceof ApiError ? error.status : 0;
            if ([404, 405].includes(status)) continue;
            throw error;
          }
        }
        throw new Error('Backend docs do not expose a plugin enable/reactivate endpoint yet.');
      });
      if (!ok) return;
      toast('ok', `${plugin.display_name} enabled.`);
    } else {
      const reason = window.prompt(`Disable ${plugin.display_name}? Optional reason:`, plugin.deactivation_reason || '')?.trim() || '';
      const form = new FormData();
      if (reason) form.append('reason', reason);
      const ok = await run(`disable-plugin-${plugin.plugin_key}`, async () => {
        const candidates = [
          `/api/v1/publishers/my/plugins/${encodeURIComponent(plugin.plugin_key)}/deactivate`,
          `/api/v1/publishers/plugins/${encodeURIComponent(plugin.plugin_key)}/disable`,
        ];
        for (const path of candidates) {
          try {
            return await req(path, { ...auth(), method: 'POST', body: form, isForm: true });
          } catch (error) {
            const status = error instanceof ApiError ? error.status : 0;
            if ([404, 405].includes(status)) continue;
            throw error;
          }
        }
        throw new Error('No backend endpoint accepted plugin disable/deactivate yet.');
      });
      if (!ok) return;
      toast('ok', `${plugin.display_name} disabled.`);
    }

    await Promise.all([loadMyPlugins(), loadAllPlugins()]);
    if (selectedMyPluginKey === plugin.plugin_key) await loadPluginReleases(plugin.plugin_key);
  }, [auth, loadAllPlugins, loadMyPlugins, loadPluginReleases, selectedMyPluginKey, toast]);

  const deletePlugin = useCallback(async (plugin: PublisherPlugin) => {
    setConfirmCtx({
      title: `Delete ${plugin.display_name}?`,
      body: 'This removes the plugin and its related releases/artifacts according to backend policy. This action cannot be undone from the portal.',
      onOk: async () => {
        const result = await run(`delete-plugin-${plugin.plugin_key}`, async () => {
          const candidates = [
            `/api/v1/publishers/my/plugins/${encodeURIComponent(plugin.plugin_key)}`,
            `/api/v1/publishers/plugins/${encodeURIComponent(plugin.plugin_key)}`,
          ];
          for (const path of candidates) {
            try {
              return await req<{ deleted_release_count?: number; deleted_artifact_count?: number } & Record<string, unknown>>(path, { ...auth(), method: 'DELETE' });
            } catch (error) {
              const status = error instanceof ApiError ? error.status : 0;
              if ([404, 405].includes(status)) continue;
              throw error;
            }
          }
          throw new Error('No backend endpoint accepted plugin deletion yet.');
        });
        if (!result) return;
        const deletedReleases = typeof result.deleted_release_count === 'number' ? result.deleted_release_count : 0;
        const deletedArtifacts = typeof result.deleted_artifact_count === 'number' ? result.deleted_artifact_count : 0;
        toast('ok', `${plugin.display_name} deleted.${deletedReleases || deletedArtifacts ? ` Releases: ${deletedReleases}, artifacts: ${deletedArtifacts}.` : ''}`);
        if (selectedMyPluginKey === plugin.plugin_key) {
          setSelectedMyPluginKey(null);
          setReleases([]);
          setReleaseKey('');
        }
        await Promise.all([loadMyPlugins(), loadAllPlugins()]);
      },
    });
  }, [auth, loadAllPlugins, loadMyPlugins, selectedMyPluginKey, toast]);

  const retireRelease = useCallback(async (releaseId: string) => {
    const ok = await run(`retire-release-${releaseId}`, async () => {
      const candidates = [
        `/api/v1/publishers/releases/${encodeURIComponent(releaseId)}/retire`,
        `/api/v1/publishers/releases/${encodeURIComponent(releaseId)}/disable`,
      ];
      for (const path of candidates) {
        try {
          return await req(path, { ...auth(), method: 'POST' });
        } catch {
          // continue
        }
      }
      throw new Error('No backend endpoint accepted retire/disable release yet.');
    });
    if (!ok) return;
    toast('ok', `Release ${releaseId} retired.`);
    if (selectedMyPluginKey) await loadPluginReleases(selectedMyPluginKey);
    await Promise.all([loadMyPlugins(), loadAllPlugins(), isAdmin ? loadReviews() : Promise.resolve()]);
  }, [auth, isAdmin, loadAllPlugins, loadMyPlugins, loadPluginReleases, loadReviews, selectedMyPluginKey, toast]);

  const allPluginsFiltered = useMemo(() => {
    const q = pluginSearch.trim().toLowerCase();
    return allPlugins.filter((plugin) => {
      if (pluginFilter !== 'all') {
        const hay = [plugin.status, plugin.plugin_type, plugin.trust_level, plugin.latest_release?.release_channel].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(pluginFilter.toLowerCase())) return false;
      }
      if (!q) return true;
      const hay = [plugin.display_name, plugin.plugin_key, plugin.publisher_slug, plugin.description, ...(plugin.tags || []), ...(plugin.categories || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allPlugins, pluginFilter, pluginSearch]);

  const myPluginsFiltered = useMemo(() => {
    const q = pluginSearch.trim().toLowerCase();
    return myPlugins.filter((plugin) => {
      if (pluginFilter !== 'all') {
        const hay = [plugin.status, plugin.latest_release?.release_channel, plugin.latest_signature_status].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(pluginFilter.toLowerCase())) return false;
      }
      if (!q) return true;
      const hay = [plugin.display_name, plugin.plugin_key, plugin.description, ...(plugin.tags || []), ...(plugin.categories || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [myPlugins, pluginFilter, pluginSearch]);

  const selectedMyPlugin = useMemo(
    () => myPlugins.find((plugin) => plugin.plugin_key === selectedMyPluginKey) || null,
    [myPlugins, selectedMyPluginKey],
  );

  const filteredUsers = useMemo(() => adminUsers, [adminUsers]);

  const adminNavItems = useMemo(() => [
    { key: 'dash', icon: '⌂', label: 'Dashboard', section: 'Overview' },
    { key: 'developer', icon: '⌘', label: 'Developer', section: 'Developer' },
    { key: 'publish', icon: '⇪', label: 'Publish', section: 'Developer' },
    { key: 'my-plugins', icon: '◈', label: 'My Plugins', section: 'Plugins' },
    { key: 'plugins-admin', icon: '⬡', label: 'All Plugins', section: 'Admin' },
    { key: 'users', icon: '👥', label: 'Users', section: 'Admin' },
    { key: 'reviews', icon: '✓', label: 'Reviews', section: 'Admin', badge: reviewSummary?.total || reviewQueue.length || 0 },
  ], [reviewQueue.length, reviewSummary?.total]);

  const userNavItems = useMemo(() => [
    { key: 'developer', icon: '⌘', label: 'Developer', section: 'Developer' },
    { key: 'publish', icon: '⇪', label: 'Publish', section: 'Developer' },
    { key: 'my-plugins', icon: '◈', label: 'My Plugins', section: 'Plugins' },
    { key: 'profile', icon: '⚙', label: 'Profile', section: 'Account' },
  ], []);

  const pageTitles: Record<string, string> = {
    dash: 'Dashboard',
    developer: 'Developer',
    publish: 'Publish',
    'my-plugins': 'My Plugins',
    'plugins-admin': 'All Plugins',
    users: 'Users',
    reviews: 'Reviews',
    profile: 'Profile',
  };

  const exportUsersCsv = useCallback(() => {
    exportCsv('users.csv', ['username', 'email', 'status', 'developer_status', 'capabilities'], filteredUsers.map((item) => [item.username, item.email, item.status, item.developer_status || '', (item.capabilities || []).join('|')]));
  }, [filteredUsers]);

  const exportPluginsCsv = useCallback(() => {
    exportCsv('plugins.csv', ['display_name', 'plugin_key', 'publisher_slug', 'status', 'latest_release', 'release_channel', 'signature_status'], allPluginsFiltered.map((item) => [item.display_name, item.plugin_key, item.publisher_slug, item.status || '', item.latest_release?.version || '', item.latest_release?.release_channel || '', item.latest_signature_status || item.latest_release?.signature_status || '']));
  }, [allPluginsFiltered]);

  return {
    API_BASE: API_BASE_DISPLAY,
    theme,
    setTheme,
    toasts,
    isBusy,
    authTab,
    setAuthTab,
    loginForm,
    setLoginForm,
    regForm,
    setRegForm,
    handleLogin,
    handleRegister,
    handleLogout,
    isLoggedIn,
    isAdmin,
    user,
    aPage,
    setAPage,
    uPage,
    setUPage,
    currentPageTitle: pageTitles[isAdmin ? aPage : uPage],
    adminNavItems,
    userNavItems,
    summary,
    runtime,
    loadDashboard,
    developerStatus,
    developerKeys,
    developerKeyForm,
    setDeveloperKeyForm,
    loadDeveloperHub,
    handleRegisterDeveloperKey,
    revokeDeveloperKey,
    capabilityOptions,
    refreshCapabilities,
    packageValidation,
    publishForm,
    setPublishForm,
    publishDrag,
    setPublishDrag,
    onPackageSelected,
    onIconSelected,
    onImagesSelected,
    publishPlugin,
    allPlugins: allPluginsFiltered,
    myPlugins: myPluginsFiltered,
    rawMyPlugins: myPlugins,
    loadAllPlugins,
    loadMyPlugins,
    selectedMyPlugin,
    selectedMyPluginKey,
    setSelectedMyPluginKey,
    releases,
    releaseKey,
    setReleaseKey,
    loadPluginReleases,
    togglePluginEnabled,
    deletePlugin,
    retireRelease,
    pluginFilter,
    setPluginFilter,
    pluginSearch,
    setPluginSearch,
    reviewQueue,
    reviewSummary,
    loadReviews,
    reviewAction,
    adminUsers: filteredUsers,
    usersTotal,
    loadUsers,
    userSearch,
    setUserSearch,
    userFilter,
    setUserFilter,
    setUserStatus,
    setPublisherOfficial,
    exportUsersCsv,
    exportPluginsCsv,
    confirmCtx,
    setConfirmCtx,
    pwForm,
    setPwForm,
    handleChangePassword,
    releaseChannelOptions: toReleaseChannelOptions(),
  };
}
