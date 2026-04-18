import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { req, ApiError } from './lib/api';
import { loadState, saveState, API_BASE } from './lib/storage';
import type {
  AdminSummary, AdminUser,
  PublisherPlugin, PublisherPublishResponse, PublisherRelease, ReviewQueueItem, ReviewQueueSummary,
  RuntimeStatus, SessionResponse, SessionUser,
} from './lib/types';

// ─── utils ────────────────────────────────────────────────────────────
type Theme = 'dark' | 'light';
type Toast = { id: number; kind: 'ok' | 'err' | 'inf'; msg: string };
type AdminPage = 'dash' | 'publish' | 'my-plugins' | 'plugins-admin' | 'users' | 'reviews';
type UserPage  = 'publish' | 'my-plugins' | 'profile';
type CapabilityOption = { value: string; label: string; description?: string };

function fmtDate(v?: string | null) {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return v; }
}
function fmtDT(v?: string | null) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return v; }
}
function initials(name: string) {
  return name.split(/[\s._@-]/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}
function pluginColor(key: string) {
  const c = ['#06b6d4','#7c3aed','#059669','#d97706','#dc2626','#2563eb','#db2777','#0d9488'];
  let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return c[h % c.length];
}
function publisherLabel(trust?: string | null, slug?: string): { cls: string; text: string } {
  const normalized = (trust || '').toLowerCase();
  if (slug === 'local-studio' || normalized === 'core' || normalized === 'internal') return { cls: 'lbl-core', text: '⬡ Core' };
  if (normalized === 'official' || normalized === 'verified') return { cls: 'lbl-official', text: '★ Official' };
  return { cls: 'lbl-community', text: '◈ Community' };
}
function splitCsvLike(value: string) {
  return value.split(/[,\n]/).map(v => v.trim()).filter(Boolean);
}
function isLspkgFile(file: File | null | undefined) {
  return !!file && file.name.toLowerCase().endsWith('.lspkg');
}
function isAllowedYoutubeUrl(raw: string) {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && ['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host);
  } catch {
    return false;
  }
}
function statusLbl(v?: string | null): { cls: string; text: string } {
  const s = (v || 'unknown').toLowerCase().replace(/[- ]/g, '_');
  const m: Record<string, string> = {
    active:'lbl-active', approved:'lbl-approved', verified:'lbl-active', public:'lbl-public',
    stable:'lbl-stable', community:'lbl-community', official:'lbl-official', internal:'lbl-core',
    core:'lbl-core', suspended:'lbl-suspended', banned:'lbl-banned', rejected:'lbl-rejected',
    private:'lbl-private', beta:'lbl-beta', canary:'lbl-canary', pending:'lbl-pending',
    in_review:'lbl-in_review', quarantined:'lbl-suspended', owner:'lbl-official', admin:'lbl-beta',
    member:'lbl-community',
  };
  return { cls: m[s] || 'lbl-unknown', text: v || 'unknown' };
}
function Lbl({ v }: { v?: string | null }) {
  const { cls, text } = statusLbl(v);
  return <span className={`lbl ${cls}`}>{text}</span>;
}
function Spin() { return <span className="spin" />; }
function exportCsv(name: string, cols: string[], rows: (string|number|null|undefined)[][]) {
  const e = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob([[cols, ...rows].map(r => r.map(e).join(',')).join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click(); URL.revokeObjectURL(a.href);
}

function normalizeCapabilityOptions(payload: unknown): CapabilityOption[] {
  const source = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object'
        ? ((payload as { items?: unknown; results?: unknown; data?: unknown; capabilities?: unknown }).items
          ?? (payload as { results?: unknown }).results
          ?? (payload as { data?: unknown }).data
          ?? (payload as { capabilities?: unknown }).capabilities
          ?? [])
        : []);

  if (!Array.isArray(source)) return [];

  return source
    .map((entry) => {
      if (typeof entry === 'string') return { value: entry, label: entry } satisfies CapabilityOption;
      if (!entry || typeof entry !== 'object') return null;
      const obj = entry as Record<string, unknown>;
      const value = String(obj.key ?? obj.code ?? obj.slug ?? obj.value ?? obj.id ?? '').trim();
      const label = String(obj.label ?? obj.display_name ?? obj.name ?? obj.title ?? value).trim();
      const description = obj.description ? String(obj.description) : undefined;
      if (!value) return null;
      return { value, label: label || value, description } satisfies CapabilityOption;
    })
    .filter((value): value is CapabilityOption => !!value)
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── persisted state ─────────────────────────────────────────────────
const ps = loadState();

// ─── App ─────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState<Theme>(ps.theme ?? 'dark');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);

  // auth
  const [accessToken, setAccessToken]   = useState(ps.accessToken);
  const [refreshToken, setRefreshToken] = useState(ps.refreshToken);
  const [sessionId, setSessionId]       = useState(ps.sessionId);
  const [expiresAt, setExpiresAt]       = useState(ps.expiresAt);
  const [user, setUser]                 = useState<SessionUser | null>(ps.user);

  // config
  const [adminKey]   = useState(ps.adminApiKey);

  // pages
  const [aPage, setAPage] = useState<AdminPage>('dash');
  const [uPage, setUPage] = useState<UserPage>('publish');

  // data
  const [summary, setSummary]         = useState<AdminSummary | null>(null);
  const [runtime, setRuntime]         = useState<RuntimeStatus | null>(null);
  const [allPlugins, setAllPlugins]   = useState<PublisherPlugin[]>([]);
  const [myPlugins, setMyPlugins]     = useState<PublisherPlugin[]>([]);
  const [releases, setReleases]       = useState<PublisherRelease[]>([]);
  const [capabilityOptions, setCapabilityOptions] = useState<CapabilityOption[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [reviewSummary, setRQSummary] = useState<ReviewQueueSummary | null>(null);
  const [adminUsers, setAdminUsers]   = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal]   = useState(0);

  // ui state
  const [busy, setBusy]               = useState<Record<string, boolean>>({});
  const [pluginFilter, setPluginFilter] = useState('all');
  const [pluginSearch, setPluginSearch] = useState('');
  const [userSearch, setUserSearch]   = useState('');
  const [userFilter, setUserFilter]   = useState('all');
  const [releaseKey, setReleaseKey]   = useState('');
  const [confirmCtx, setConfirmCtx]   = useState<{ title: string; body: string; onOk: () => void } | null>(null);
  const [publishForm, setPublishForm] = useState({
    name: '', description: '',
    tags: '', categories: '', capabilities: [] as string[], changelog: '', videoLinks: '',
    packageFile: null as File | null, iconFile: null as File | null, imageFiles: [] as File[],
  });
  const [publishDrag, setPublishDrag] = useState<{ package: boolean; icon: boolean; images: boolean }>({ package: false, icon: false, images: false });
  const [pwForm, setPwForm]           = useState({ current: '', next: '', confirm: '' });
  const [loginForm, setLoginForm]     = useState({ ident: '', pw: '' });
  const [regForm, setRegForm]         = useState({ user: '', email: '', pw: '', pw2: '' });
  const [authTab, setAuthTab]         = useState<'login'|'reg'>('login');

  const isAdmin = !!user?.is_admin;
  const isLoggedIn = !!user;

  // persist
  useEffect(() => {
    saveState({ publisherSlug: ps.publisherSlug || 'local-studio', publisherApiKey: '', adminApiKey: adminKey, accessToken, refreshToken, sessionId, expiresAt, theme, user });
  }, [adminKey, accessToken, refreshToken, sessionId, expiresAt, theme, user]);

  // theme on html
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  // ── toast ──
  const toast = useCallback((kind: Toast['kind'], msg: string) => {
    const id = ++tid.current;
    setToasts(t => [...t, { id, kind, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);

  function isBusy(k: string) { return !!busy[k]; }
  async function run<T>(k: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(b => ({ ...b, [k]: true }));
    try { return await fn(); }
    catch (e) { toast('err', e instanceof ApiError ? e.message : String(e)); return null; }
    finally { setBusy(b => ({ ...b, [k]: false })); }
  }

  function auth(o: { pub?: boolean; admin?: boolean } = {}) {
    return { token: accessToken, adminApiKey: adminKey, ...o };
  }
  function applySession(d: SessionResponse) {
    setAccessToken(d.access_token); setRefreshToken(d.refresh_token);
    setSessionId(d.session_id); setExpiresAt(d.expires_at); setUser(d.user);
  }

  // ── AUTH ──────────────────────────────────────────────────────────
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    await run('login', async () => {
      const d = await req<SessionResponse>('/api/v1/accounts/login', {
        method: 'POST', body: { username_or_email: loginForm.ident, password: loginForm.pw },
      });
      applySession(d);
      toast('ok', `Welcome back, ${d.user.username}!`);
    });
  }
  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (regForm.pw !== regForm.pw2) { toast('err', 'Passwords do not match.'); return; }
    await run('reg', async () => {
      const d = await req<SessionResponse>('/api/v1/accounts/register', {
        method: 'POST', body: { username: regForm.user, email: regForm.email, password: regForm.pw },
      });
      applySession(d);
      toast('ok', `Account created! Welcome, ${d.user.username}.`);
    });
  }
  async function handleLogout() {
    await run('logout', async () => {
      try { await req('/api/v1/accounts/logout', { method: 'POST', token: accessToken, body: { refresh_token: refreshToken || null } }); } catch {}
      setUser(null); setAccessToken(''); setRefreshToken(''); setSessionId(''); setExpiresAt('');
      setSummary(null); setAllPlugins([]); setMyPlugins([]); setAdminUsers([]); setReleases([]);
      toast('inf', 'Signed out.');
    });
  }
  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { toast('err', 'New passwords do not match.'); return; }
    if (pwForm.next.length < 8) { toast('err', 'Password must be at least 8 characters.'); return; }
    await run('pw', async () => {
      await req('/api/v1/accounts/change-password', {
        method: 'POST', token: accessToken,
        body: { current_password: pwForm.current, new_password: pwForm.next },
      });
      setPwForm({ current: '', next: '', confirm: '' });
      toast('ok', 'Password updated successfully!');
    });
  }

  // ── ADMIN: Dashboard ─────────────────────────────────────────────
  const loadDash = useCallback(async () => {
    if (!adminKey) return;
    await run('dash', async () => {
      const [s, r] = await Promise.all([
        req<AdminSummary>('/api/v1/admin/summary', auth({ admin: true })),
        req<RuntimeStatus>('/api/v1/admin/runtime', auth({ admin: true })),
      ]);
      setSummary(s); setRuntime(r);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, accessToken]);

  // ── ADMIN: All Plugins ───────────────────────────────────────────
  async function loadAllPlugins() {
    await run('all-plugins', async () => {
      const d = await req<PublisherPlugin[]>('/api/v1/publishers/plugins', auth({ pub: true }));
      setAllPlugins(d);
    });
  }

  // ── ADMIN: Users ─────────────────────────────────────────────────
  async function loadUsers() {
    await run('users', async () => {
      const p = new URLSearchParams();
      if (userSearch) p.set('query', userSearch);
      if (userFilter !== 'all') p.set('status', userFilter);
      p.set('limit', '200');
      const d = await req<{ total: number; items: AdminUser[] }>(`/api/v1/admin/users?${p}`, auth({ admin: true }));
      setAdminUsers(d.items); setUsersTotal(d.total);
    });
  }
  async function updateStatus(uid: string, s: string) {
    setConfirmCtx({
      title: `Change user status`,
      body: `Set status to "${s}" for this user?`,
      onOk: async () => {
        await run(`u-${uid}`, async () => {
          await req(`/api/v1/admin/users/${uid}/status`, { method: 'POST', ...auth({ admin: true }), body: { status: s } });
          await loadUsers();
          toast('ok', `Status updated to "${s}".`);
        });
      },
    });
  }
  async function setOfficial(slug: string, official: boolean) {
    await run(`off-${slug}`, async () => {
      await req(`/api/v1/admin/publishers/${slug}/set-official?official=${official}`, { method: 'POST', ...auth({ admin: true }), body: {} });
      await loadAllPlugins();
      toast('ok', `Publisher marked as ${official ? 'Official' : 'Community'}.`);
    });
  }

  // ── ADMIN: Reviews ───────────────────────────────────────────────
  async function loadReviews() {
    await run('reviews', async () => {
      const [s, q] = await Promise.all([
        req<ReviewQueueSummary>('/api/v1/admin/review-queue/summary', auth({ admin: true })),
        req<ReviewQueueItem[]>('/api/v1/reviews/queue', auth({ admin: true })),
      ]);
      setRQSummary(s); setReviewQueue(q);
    });
  }
  async function reviewAction(id: string, action: 'approve'|'reject'|'request-changes') {
    await run(`rv-${id}`, async () => {
      await req(`/api/v1/reviews/${id}/${action}`, { method: 'POST', ...auth({ admin: true }), body: { notes: `Admin: ${action}`, force: false } });
      await loadReviews();
      toast('ok', `Release ${action}d.`);
    });
  }

  // ── USER: My Plugins ─────────────────────────────────────────────
  async function loadMyPlugins() {
    await run('my-plugins', async () => {
      const d = await req<PublisherPlugin[]>('/api/v1/publishers/plugins', auth());
      setMyPlugins(d);

      const nextKey = releaseKey && d.some(plugin => plugin.plugin_key === releaseKey)
        ? releaseKey
        : d[0]?.plugin_key || '';

      if (!nextKey) {
        setReleaseKey('');
        setReleases([]);
        return;
      }

      setReleaseKey(nextKey);
      try {
        const rs = await req<PublisherRelease[]>(`/api/v1/publishers/plugins/${nextKey}/releases`, auth());
        setReleases(rs);
      } catch {
        setReleases([]);
      }
    });
  }

  async function loadCapabilityOptions(force = false) {
    if (!force && capabilityOptions.length > 0) return;
    await run('capabilities', async () => {
      const candidates = [
        '/api/v1/market/capabilities',
        '/api/v1/capabilities',
        '/api/v1/publishers/capabilities',
        '/api/v1/metadata/capabilities',
      ];

      for (const path of candidates) {
        try {
          const data = await req<unknown>(path, auth());
          const normalized = normalizeCapabilityOptions(data);
          if (normalized.length > 0) {
            setCapabilityOptions(normalized);
            return;
          }
        } catch {
          // try next endpoint candidate
        }
      }

      setCapabilityOptions([]);
    });
  }

  async function publishPlugin(e: FormEvent) {
    e.preventDefault();
    if (!publishForm.packageFile) { toast('err', 'Select a .lspkg package first.'); return; }
    if (!isLspkgFile(publishForm.packageFile)) { toast('err', 'Only .lspkg packages are supported.'); return; }
    const videos = splitCsvLike(publishForm.videoLinks);
    if (videos.some(link => !isAllowedYoutubeUrl(link))) {
      toast('err', 'Only HTTPS YouTube links are allowed.');
      return;
    }

    const packageFile = publishForm.packageFile;

    await run('publish', async () => {
      const fd = new FormData();
      fd.append('display_name', publishForm.name.trim());
      if (publishForm.description.trim()) fd.append('description', publishForm.description.trim());
      if (publishForm.tags.trim()) fd.append('tags', publishForm.tags);
      if (publishForm.categories.trim()) fd.append('categories', publishForm.categories);
      if (publishForm.capabilities.length) fd.append('capabilities', publishForm.capabilities.join(','));
      if (publishForm.videoLinks.trim()) fd.append('video_links', publishForm.videoLinks);
      if (publishForm.changelog.trim()) fd.append('changelog', publishForm.changelog.trim());
      fd.append('package', packageFile);
      if (publishForm.iconFile) fd.append('icon', publishForm.iconFile);
      for (const image of publishForm.imageFiles) fd.append('images', image);

      const response = await req<PublisherPublishResponse>('/api/v1/publishers/publish', {
        method: 'POST', ...auth(), body: fd, isForm: true,
      });

      setPublishForm({
        name: response.plugin.display_name,
        description: response.plugin.description || '',
        tags: (response.plugin.tags || []).join(', '),
        categories: (response.plugin.categories || []).join(', '),
        capabilities: response.plugin.capabilities || [],
        changelog: '',
        videoLinks: (response.plugin.video_links || []).join('\n'),
        packageFile: null,
        iconFile: null,
        imageFiles: [],
      });
      await loadMyPlugins();
      setReleaseKey(response.plugin.plugin_key);
      await loadReleases(response.plugin.plugin_key);
      toast('ok', `Published ${response.plugin.display_name} v${response.release.version}.`);
    });
  }

  async function loadReleases(key?: string) {
    const pk = (key ?? releaseKey).trim();
    if (!pk) { return; }
    await run('releases', async () => {
      const d = await req<PublisherRelease[]>(`/api/v1/publishers/plugins/${pk}/releases`, auth());
      setReleases(d); if (key) setReleaseKey(key);
    });
  }

  function onPackageSelected(file: File | null) {
    if (!file) return;
    if (!isLspkgFile(file)) { toast('err', 'Only .lspkg packages are supported.'); return; }
    setPublishForm(p => ({ ...p, packageFile: file }));
  }
  function onIconSelected(file: File | null) {
    if (!file) return;
    setPublishForm(p => ({ ...p, iconFile: file }));
  }
  function onImagesSelected(files: FileList | File[] | null) {
    if (!files) return;
    const next = Array.from(files).filter(Boolean);
    setPublishForm(p => ({ ...p, imageFiles: next }));
  }

  async function disablePlugin(pluginKey: string) {
    setConfirmCtx({
      title: 'Disable plugin',
      body: `This will take down ${pluginKey} from your published plugins. Continue?`,
      onOk: async () => {
        await run(`disable-${pluginKey}`, async () => {
          const encoded = encodeURIComponent(pluginKey);
          const attempts: Array<() => Promise<unknown>> = [
            () => req(`/api/v1/publishers/plugins/${encoded}/deactivate`, { method: 'POST', ...auth(), body: {} }),
            () => req(`/api/v1/publishers/plugins/${encoded}/disable`, { method: 'POST', ...auth(), body: {} }),
            () => req(`/api/v1/publishers/plugins/${encoded}`, { method: 'DELETE', ...auth() }),
          ];

          let lastError: unknown = null;
          for (const attempt of attempts) {
            try {
              await attempt();
              lastError = null;
              break;
            } catch (error) {
              lastError = error;
            }
          }
          if (lastError) throw lastError;

          if (releaseKey === pluginKey) {
            setReleaseKey('');
            setReleases([]);
          }
          await loadMyPlugins();
          toast('ok', `Plugin ${pluginKey} disabled.`);
        });
      },
    });
  }

  // ── page-level loads ─────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    if (isAdmin) {
      if (aPage === 'dash') loadDash();
      if (aPage === 'publish') loadCapabilityOptions();
      if (aPage === 'my-plugins') loadMyPlugins();
      if (aPage === 'plugins-admin') loadAllPlugins();
      if (aPage === 'users') loadUsers();
      if (aPage === 'reviews') loadReviews();
    } else {
      if (uPage === 'publish') loadCapabilityOptions();
      if (uPage === 'my-plugins') loadMyPlugins();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aPage, uPage, isLoggedIn, isAdmin]);

  // ── filtered plugins ─────────────────────────────────────────────
  const displayPlugins = useMemo(() => {
    let list = isAdmin ? allPlugins : myPlugins;
    if (pluginFilter !== 'all') list = list.filter(p => (p.plugin_type || p.trust_level) === pluginFilter || (pluginFilter === 'core' && p.internal));
    if (pluginSearch) {
      const q = pluginSearch.toLowerCase();
      list = list.filter(p => p.display_name.toLowerCase().includes(q) || p.plugin_key.toLowerCase().includes(q));
    }
    return list;
  }, [allPlugins, myPlugins, isAdmin, pluginFilter, pluginSearch]);

  // ═════════════════════════════════════════════════════════════════
  // AUTH SCREEN
  // ═════════════════════════════════════════════════════════════════
  if (!isLoggedIn) {
    return (
      <div className="auth-shell">
        <div className="auth-grid-bg" />
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-brand">
              <div className="auth-brand-mark">LS</div>
              <div>
                <div className="auth-brand-name">Local Studio</div>
                <div className="auth-brand-sub">Plugin Admin Platform</div>
              </div>
            </div>
            <div className="auth-tabs">
              <button className={`auth-tab${authTab === 'login' ? ' active' : ''}`} onClick={() => setAuthTab('login')}>Sign in</button>
              <button className={`auth-tab${authTab === 'reg' ? ' active' : ''}`} onClick={() => setAuthTab('reg')}>Register</button>
            </div>
          </div>
          <div className="auth-body">
            {authTab === 'login' ? (
              <>
                <div className="auth-title">Welcome back</div>
                <div className="auth-sub">Sign in to manage your plugins and releases.</div>
                <form onSubmit={handleLogin}>
                  <div className="field"><label className="field-label">Username or email</label><input className="input" required autoFocus value={loginForm.ident} onChange={e => setLoginForm(p => ({...p, ident: e.target.value}))} placeholder="localstudio or admin@..." /></div>
                  <div className="field"><label className="field-label">Password</label><input className="input" type="password" required value={loginForm.pw} onChange={e => setLoginForm(p => ({...p, pw: e.target.value}))} /></div>
                  <div style={{marginTop:20}}><button className="btn btn-primary btn-lg btn-full" disabled={isBusy('login')}>{isBusy('login') ? <><Spin /> Signing in…</> : 'Sign in'}</button></div>
                </form>
              </>
            ) : (
              <>
                <div className="auth-title">Create account</div>
                <div className="auth-sub">Join Local Studio to publish and manage plugins.</div>
                <form onSubmit={handleRegister}>
                  <div className="grid2-form" style={{marginBottom:14}}>
                    <div className="field" style={{margin:0}}><label className="field-label">Username</label><input className="input" required value={regForm.user} onChange={e => setRegForm(p => ({...p, user: e.target.value}))} /></div>
                    <div className="field" style={{margin:0}}><label className="field-label">Email</label><input className="input" type="email" required value={regForm.email} onChange={e => setRegForm(p => ({...p, email: e.target.value}))} /></div>
                  </div>
                  <div className="grid2-form">
                    <div className="field" style={{margin:0}}><label className="field-label">Password</label><input className="input" type="password" required minLength={8} value={regForm.pw} onChange={e => setRegForm(p => ({...p, pw: e.target.value}))} /></div>
                    <div className="field" style={{margin:0}}><label className="field-label">Confirm</label><input className="input" type="password" required value={regForm.pw2} onChange={e => setRegForm(p => ({...p, pw2: e.target.value}))} /></div>
                  </div>
                  <div style={{marginTop:18}}><button className="btn btn-primary btn-lg btn-full" disabled={isBusy('reg')}>{isBusy('reg') ? <><Spin /> Creating…</> : 'Create account'}</button></div>
                </form>
              </>
            )}
          </div>
        </div>
        <Toasts toasts={toasts} />
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════
  // MAIN APP
  // ═════════════════════════════════════════════════════════════════
  const adminNav: Array<{ key: AdminPage; icon: string; label: string; section?: string; badge?: number }> = [
    { key: 'dash',         icon: '⬡', label: 'Dashboard',    section: 'Overview' },
    { key: 'publish',      icon: '⇪', label: 'Publish',      section: 'Publishing' },
    { key: 'my-plugins',   icon: '◫', label: 'My Plugins' },
    { key: 'plugins-admin',icon: '⊞', label: 'All Plugins',  section: 'Admin' },
    { key: 'users',        icon: '◎', label: 'Users' },
    { key: 'reviews',      icon: '⟳', label: 'Reviews', badge: reviewQueue.length > 0 ? reviewQueue.length : undefined },
  ];

  const userNav: Array<{ key: UserPage; icon: string; label: string; section?: string }> = [
    { key: 'publish',     icon: '⇪', label: 'Publish',     section: 'Publishing' },
    { key: 'my-plugins',  icon: '◫', label: 'My Plugins' },
    { key: 'profile',     icon: '◉', label: 'Profile',     section: 'Account' },
  ];

  const curPageTitle = isAdmin
    ? { dash: 'Dashboard', publish: 'Publish Plugins', 'my-plugins': 'My Plugins', 'plugins-admin': 'All Plugins', users: 'User Management', reviews: 'Release Reviews' }[aPage]
    : { publish: 'Publish Plugins', 'my-plugins': 'My Plugins', profile: 'Profile' }[uPage];

  const showPublishPage = (isAdmin && aPage === 'publish') || (!isAdmin && uPage === 'publish');
  const showMyPluginsPage = (isAdmin && aPage === 'my-plugins') || (!isAdmin && uPage === 'my-plugins');
  const selectedMyPlugin = myPlugins.find(plugin => plugin.plugin_key === releaseKey) || myPlugins[0] || null;

  return (
    <div className="app-shell">
      {/* ════ SIDEBAR ════ */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-inner">
            <div className="sidebar-mark">LS</div>
            <div>
              <div className="sidebar-name">Local Studio</div>
              <div className="sidebar-tagline">Plugin Admin</div>
            </div>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-inner">
            <div className="sidebar-avatar">{initials(user?.username || '?')}</div>
            <div style={{flex:1,minWidth:0}}>
              <div className="sidebar-username">{user?.username}</div>
              <div className="sidebar-email">{user?.email}</div>
            </div>
            <div className={`sidebar-role-badge${isAdmin ? ' admin' : ''}`}>{isAdmin ? 'Admin' : 'User'}</div>
          </div>
        </div>

        <div className="sidebar-sep" />

        <nav className="sidebar-nav">
          {isAdmin ? adminNav.map((item, i) => {
            const prev = adminNav[i - 1];
            return (
              <div key={item.key}>
                {item.section && (!prev || prev.section !== item.section) && <div className="nav-section">{item.section}</div>}
                <button className={`nav-btn${aPage === item.key ? ' active' : ''}`} onClick={() => setAPage(item.key as AdminPage)}>
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                  {'badge' in item && item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                </button>
              </div>
            );
          }) : userNav.map((item, i) => {
            const prev = userNav[i - 1];
            return (
              <div key={item.key}>
                {item.section && (!prev || prev.section !== item.section) && <div className="nav-section">{item.section}</div>}
                <button className={`nav-btn${uPage === item.key ? ' active' : ''}`} onClick={() => setUPage(item.key as UserPage)}>
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-bottom-url">{API_BASE}</div>
          <button className="sidebar-footer-btn" onClick={handleLogout} disabled={isBusy('logout')}>
            {isBusy('logout') ? <><Spin /> Signing out…</> : '→ Sign out'}
          </button>
        </div>
      </aside>

      {/* ════ MAIN ════ */}
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">{curPageTitle}</div>
          </div>
          <div className="topbar-right">
            {/* page actions */}
            {isAdmin && aPage === 'dash' && <button className="btn btn-secondary btn-sm" disabled={isBusy('dash')} onClick={loadDash}>{isBusy('dash') ? <Spin /> : '⟳ Refresh'}</button>}
            {isAdmin && aPage === 'plugins-admin' && <button className="btn btn-secondary btn-sm" disabled={isBusy('all-plugins')} onClick={loadAllPlugins}>{isBusy('all-plugins') ? <Spin /> : '⟳'}</button>}
            {isAdmin && aPage === 'users' && <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('users.csv', ['ID','Username','Email','Status','Created'], adminUsers.map(u => [u.id,u.username,u.email,u.status,u.created_at??'']))}>↓ CSV</button>}
            {isAdmin && aPage === 'reviews' && <button className="btn btn-secondary btn-sm" disabled={isBusy('reviews')} onClick={loadReviews}>{isBusy('reviews') ? <Spin /> : '⟳ Refresh'}</button>}
            {showPublishPage && <button className="btn btn-secondary btn-sm" disabled={isBusy('capabilities')} onClick={() => loadCapabilityOptions(true)}>{isBusy('capabilities') ? <Spin /> : '⟳ Refresh'}</button>}
            {showMyPluginsPage && <button className="btn btn-secondary btn-sm" disabled={isBusy('my-plugins')} onClick={() => loadMyPlugins()}>{isBusy('my-plugins') ? <Spin /> : '⟳ Refresh'}</button>}
            {/* theme toggle */}
            <button className="theme-toggle" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div className="page-area">
          <div className="page-in" key={isAdmin ? aPage : uPage}>

            {/* ══════════════════════════════════════════════════════
                ADMIN — DASHBOARD
            ══════════════════════════════════════════════════════ */}
            {isAdmin && aPage === 'dash' && (
              <div>
                <div className="ph">
                  <div><div className="ph-title">Platform overview</div><div className="ph-sub">Live metrics and system health.</div></div>
                </div>
                {isBusy('dash') && !summary && <div className="card"><div className="empty"><Spin /><div className="empty-sub">Loading…</div></div></div>}
                {!summary && !isBusy('dash') && (
                  <div className="card"><div className="empty">
                    <div className="empty-icon">⬡</div>
                    <div className="empty-title">No data loaded</div>
                    <div className="empty-sub">Configure your Admin API key and load the dashboard.</div>
                    <button className="btn btn-primary btn-sm" style={{marginTop:10}} onClick={loadDash}>Load dashboard</button>
                  </div></div>
                )}
                {summary && (<>
                  <div className="metrics">
                    {[
                      {l:'Users',           v:summary.users_total??0,          sub:`total accounts`,           c:'var(--accent)'},
                      {l:'Publishers',      v:summary.publishers_total??0,     sub:`${summary.publishers_verified??0} verified`, c:'var(--violet)'},
                      {l:'Plugins',         v:summary.plugins_total??0,        sub:`in catalog`,               c:'var(--emerald)'},
                      {l:'Releases',        v:summary.releases_total??0,       sub:`${summary.releases_approved??0} approved`, c:'#38bdf8'},
                      {l:'In Review',       v:summary.releases_in_review??0,   sub:`awaiting decision`,        c:'var(--gold)'},
                      {l:'Active Sessions', v:summary.active_sessions??0,      sub:`live sessions`,            c:'var(--accent)'},
                      {l:'Abuse Reports',   v:summary.abuse_reports_open??0,   sub:`open reports`,             c:'var(--red)'},
                      {l:'Quarantined',     v:summary.releases_quarantined??0, sub:`blocked releases`,         c:'var(--orange)'},
                    ].map(m => (
                      <div key={m.l} className="metric" style={{'--m-color':m.c} as React.CSSProperties}>
                        <div className="metric-label">{m.l}</div>
                        <div className="metric-val">{m.v}</div>
                        <div className="metric-sub">{m.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div className="g2">
                    <div className="card">
                      <div className="card-head">
                        <div><div className="card-title">Runtime status</div><div className="card-sub">Backend health</div></div>
                        <Lbl v={runtime?.ready ? 'active' : 'suspended'} />
                      </div>
                      <div className="card-body">
                        {runtime ? (<>
                          <div className="drow"><span className="dkey">Ready</span><span className="dval">{String(runtime.ready)}</span></div>
                          {runtime.startup_error && <div className="alert alert-warn" style={{marginTop:10,marginBottom:0}}>⚠ {runtime.startup_error}</div>}
                          {Array.isArray(runtime.checks) && runtime.checks.map((c: unknown, i) => {
                            const ck = c as {name?:string;status?:string};
                            return <div key={i} className="drow"><span className="dkey">{ck.name??`check ${i+1}`}</span><Lbl v={ck.status} /></div>;
                          })}
                        </>) : <div className="empty-sub" style={{padding:'12px 0'}}>No runtime data.</div>}
                      </div>
                    </div>
                    <div className="card">
                      <div className="card-head"><div className="card-title">Quick actions</div></div>
                      <div className="card-body vstack">
                        <button className="btn btn-secondary btn-full" style={{justifyContent:'flex-start'}} onClick={() => setAPage('reviews')}>⟳ Review queue · {summary.releases_in_review??0} pending</button>
                        <button className="btn btn-secondary btn-full" style={{justifyContent:'flex-start'}} onClick={() => setAPage('plugins-admin')}>⬡ Plugins · {summary.plugins_total??0} in catalog</button>
                        <button className="btn btn-secondary btn-full" style={{justifyContent:'flex-start'}} onClick={() => setAPage('users')}>◎ Users · {summary.users_total??0} registered</button>
                      </div>
                    </div>
                  </div>
                </>)}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                PUBLISH — COMBINED PLUGIN + RELEASE FLOW
            ══════════════════════════════════════════════════════ */}
            {showPublishPage && (
              <div className="vstack">
                <div className="ph">
                  <div>
                    <div className="ph-title">Publish plugin package</div>
                    <div className="ph-sub">Single flow for plugin metadata + release upload. Plugin key is detected automatically from the manifest inside the .lspkg package.</div>
                  </div>
                  <div className="row" style={{gap:8}}>
                    <span className="lbl lbl-community">Auto type</span>
                    <span className="lbl lbl-public">public</span>
                  </div>
                </div>

                <div className="card">
                  <div className="card-head">
                    <div>
                      <div className="card-title">Publish</div>
                      <div className="card-sub">Only <span className="tbl-mono">.lspkg</span> packages are accepted.</div>
                    </div>
                  </div>
                  <div className="card-body">
                    <form onSubmit={publishPlugin} className="vstack">
                      <div className="grid2-form">
                        <div className="field" style={{margin:0}}>
                          <label className="field-label">Display name *</label>
                          <input className="input" required value={publishForm.name} onChange={e => setPublishForm(p => ({ ...p, name: e.target.value }))} placeholder="My Plugin" />
                          <span className="field-hint">The backend will read the plugin key from the manifest.json included in the package.</span>
                        </div>
                        <div className="field" style={{margin:0}}>
                          <label className="field-label">Capabilities</label>
                          <CapabilityMultiSelect
                            options={capabilityOptions}
                            value={publishForm.capabilities}
                            onChange={(next) => setPublishForm(p => ({ ...p, capabilities: next }))}
                            loading={isBusy('capabilities')}
                          />
                        </div>
                      </div>

                      <div className="field">
                        <label className="field-label">Description</label>
                        <textarea className="textarea" rows={3} value={publishForm.description} onChange={e => setPublishForm(p => ({ ...p, description: e.target.value }))} placeholder="What does this plugin do?" />
                      </div>

                      <div className="grid2-form">
                        <div className="field" style={{margin:0}}>
                          <label className="field-label">Tags</label>
                          <input className="input" value={publishForm.tags} onChange={e => setPublishForm(p => ({ ...p, tags: e.target.value }))} placeholder="audio, transcribe" />
                        </div>
                        <div className="field" style={{margin:0}}>
                          <label className="field-label">Categories</label>
                          <input className="input" value={publishForm.categories} onChange={e => setPublishForm(p => ({ ...p, categories: e.target.value }))} placeholder="speech, media" />
                        </div>
                      </div>

                      <div className="field">
                        <label className="field-label">YouTube links</label>
                        <textarea className="textarea" rows={3} value={publishForm.videoLinks} onChange={e => setPublishForm(p => ({ ...p, videoLinks: e.target.value }))} placeholder={"One per line or comma separated\nhttps://www.youtube.com/watch?v=..."} />
                        <span className="field-hint">Only HTTPS links from YouTube are accepted.</span>
                      </div>

                      <div className="field">
                        <label className="field-label">Release notes</label>
                        <textarea className="textarea" rows={3} value={publishForm.changelog} onChange={e => setPublishForm(p => ({ ...p, changelog: e.target.value }))} placeholder="What changed in this release?" />
                      </div>

                      <div className="grid3-form publish-assets">
                        <FileDropZone
                          label="Package (.lspkg) *"
                          hint={publishForm.packageFile ? publishForm.packageFile.name : 'Drop or browse your packaged plugin'}
                          accept=".lspkg"
                          dragActive={publishDrag.package}
                          hasFiles={!!publishForm.packageFile}
                          multiple={false}
                          onDragChange={(active) => setPublishDrag(s => ({ ...s, package: active }))}
                          onFiles={(files) => onPackageSelected(files[0] ?? null)}
                        />
                        <FileDropZone
                          label="Icon (optional)"
                          hint={publishForm.iconFile ? publishForm.iconFile.name : 'PNG, JPG, WEBP or GIF'}
                          accept=".png,.jpg,.jpeg,.webp,.gif"
                          dragActive={publishDrag.icon}
                          hasFiles={!!publishForm.iconFile}
                          multiple={false}
                          onDragChange={(active) => setPublishDrag(s => ({ ...s, icon: active }))}
                          onFiles={(files) => onIconSelected(files[0] ?? null)}
                        />
                        <FileDropZone
                          label="Images (optional)"
                          hint={publishForm.imageFiles.length ? `${publishForm.imageFiles.length} image(s) selected` : 'Drag one or more preview images'}
                          accept=".png,.jpg,.jpeg,.webp,.gif"
                          dragActive={publishDrag.images}
                          hasFiles={publishForm.imageFiles.length > 0}
                          multiple
                          onDragChange={(active) => setPublishDrag(s => ({ ...s, images: active }))}
                          onFiles={(files) => onImagesSelected(files)}
                        />
                      </div>

                      {(publishForm.packageFile || publishForm.iconFile || publishForm.imageFiles.length > 0) && (
                        <div className="publish-file-list">
                          {publishForm.packageFile && <span className="tag">package · {publishForm.packageFile.name}</span>}
                          {publishForm.iconFile && <span className="tag">icon · {publishForm.iconFile.name}</span>}
                          {publishForm.imageFiles.map(file => <span key={file.name + file.size} className="tag">image · {file.name}</span>)}
                        </div>
                      )}

                      <div className="alert alert-info">Trust Level, visibility, and channel are assigned by backend policy. Visibility is always public.</div>

                      <button className="btn btn-primary btn-full" type="submit" disabled={isBusy('publish') || !publishForm.packageFile}>
                        {isBusy('publish') ? <><Spin/> Publishing…</> : 'Publish plugin'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                MY PLUGINS
            ══════════════════════════════════════════════════════ */}
            {showMyPluginsPage && (
              <div className="g2 publish-layout">
                <div className="card">
                  <div className="card-head">
                    <div>
                      <div className="card-title">My plugins</div>
                      <div className="card-sub">Browse your published plugins and inspect their release history.</div>
                    </div>
                  </div>
                  {myPlugins.length === 0 ? (
                    <div className="empty">
                      {isBusy('my-plugins') ? <><Spin/><div className="empty-sub">Loading…</div></> : <><div className="empty-icon">⬡</div><div className="empty-title">No plugins yet</div><div className="empty-sub">Your published plugins will appear here.</div></>}
                    </div>
                  ) : (
                    <PluginGrid
                      plugins={myPlugins}
                      activeKey={selectedMyPlugin?.plugin_key}
                      onReleasesClick={(pk) => loadReleases(pk)}
                      adminActions={(plugin) => (
                        <div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap'}}>
                          <button className="btn btn-secondary btn-sm" onClick={() => loadReleases(plugin.plugin_key)}>Release history</button>
                          <button className="btn btn-danger btn-sm" onClick={() => disablePlugin(plugin.plugin_key)} disabled={isBusy(`disable-${plugin.plugin_key}`)}>
                            {isBusy(`disable-${plugin.plugin_key}`) ? <><Spin/> Disabling…</> : 'Take down'}
                          </button>
                        </div>
                      )}
                    />
                  )}
                </div>

                <div className="vstack">
                  <div className="card">
                    <div className="card-head">
                      <div>
                        <div className="card-title">Plugin details</div>
                        <div className="card-sub">{selectedMyPlugin ? selectedMyPlugin.display_name : 'Select a plugin to inspect details.'}</div>
                      </div>
                    </div>
                    {!selectedMyPlugin ? (
                      <div className="empty">
                        <div className="empty-icon">◫</div>
                        <div className="empty-title">No plugin selected</div>
                        <div className="empty-sub">Choose one of your plugins to inspect release history and status.</div>
                      </div>
                    ) : (
                      <div className="card-body">
                        <div className="drow"><span className="dkey">Plugin</span><span className="dval">{selectedMyPlugin.display_name}</span></div>
                        <div className="drow"><span className="dkey">Plugin key</span><span className="dval-mono">{selectedMyPlugin.plugin_key}</span></div>
                        <div className="drow"><span className="dkey">Type</span><PluginTypeBadge plugin={selectedMyPlugin} /></div>
                        <div className="drow"><span className="dkey">Visibility</span><Lbl v={selectedMyPlugin.visibility} /></div>
                        <div className="drow"><span className="dkey">Updated</span><span className="dval">{fmtDT(selectedMyPlugin.updated_at)}</span></div>
                        {selectedMyPlugin.description && <div className="field" style={{marginTop:14, marginBottom:0}}><label className="field-label">Description</label><div className="plugin-detail-copy">{selectedMyPlugin.description}</div></div>}
                        {selectedMyPlugin.tags.length > 0 && <div className="field" style={{marginTop:14, marginBottom:0}}><label className="field-label">Tags</label><div className="publish-file-list">{selectedMyPlugin.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}</div></div>}
                        {selectedMyPlugin.categories.length > 0 && <div className="field" style={{marginTop:14, marginBottom:0}}><label className="field-label">Categories</label><div className="publish-file-list">{selectedMyPlugin.categories.map(category => <span key={category} className="tag">{category}</span>)}</div></div>}
                        {selectedMyPlugin.capabilities.length > 0 && <div className="field" style={{marginTop:14, marginBottom:0}}><label className="field-label">Capabilities</label><div className="publish-file-list">{selectedMyPlugin.capabilities.map(capability => <span key={capability} className="tag">{capability}</span>)}</div></div>}
                      </div>
                    )}
                  </div>

                  <div className="card">
                    <div className="card-head">
                      <div>
                        <div className="card-title">Release history</div>
                        <div className="card-sub">{selectedMyPlugin?.plugin_key || 'Select a plugin to inspect releases'}</div>
                      </div>
                      <button className="btn btn-secondary btn-sm" disabled={isBusy('releases') || !selectedMyPlugin} onClick={() => selectedMyPlugin && loadReleases(selectedMyPlugin.plugin_key)}>
                        {isBusy('releases') ? <Spin/> : '⟳'}
                      </button>
                    </div>
                    {releases.length === 0 ? (
                      <div className="empty">
                        <div className="empty-icon">↑</div>
                        <div className="empty-title">No releases loaded</div>
                        <div className="empty-sub">Release history will appear here for the selected plugin.</div>
                      </div>
                    ) : (
                      <div style={{padding:12,display:'flex',flexDirection:'column',gap:8}}>
                        {releases.map(r => (
                          <div className="li" key={r.release_id}>
                            <div className="li-left"><div className="li-name">v{r.version}</div><div className="li-sub">{fmtDT(r.created_at)}</div></div>
                            <div className="li-actions">{r.release_channel && <Lbl v={r.release_channel}/>}<Lbl v={r.status}/>{r.review_state && <Lbl v={r.review_state}/>}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                ADMIN — ALL PLUGINS
            ══════════════════════════════════════════════════════ */}
            {isAdmin && aPage === 'plugins-admin' && (
              <div>
                <div className="toolbar">
                  <div className="searchbar">
                    <span className="searchbar-icon">⌕</span>
                    <input placeholder="Search plugins…" value={pluginSearch} onChange={e => setPluginSearch(e.target.value)} />
                  </div>
                  <div className="chips">
                    {['all','core','official','community'].map(f => (
                      <button key={f} className={`chip${pluginFilter===f?' on':''}`} onClick={() => setPluginFilter(f)}>
                        {f.charAt(0).toUpperCase()+f.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="spacer" />
                  <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('plugins.csv', ['ID','Key','Name','Publisher','Type','Visibility'], displayPlugins.map(p=>[p.id,p.plugin_key,p.display_name,p.publisher_slug,p.plugin_type || p.trust_level,p.visibility]))}>↓ CSV</button>
                </div>
                {isBusy('all-plugins') && displayPlugins.length === 0
                  ? <div className="card"><div className="empty"><Spin /><div className="empty-sub">Loading…</div></div></div>
                  : displayPlugins.length === 0
                  ? <div className="card"><div className="empty"><div className="empty-icon">⬡</div><div className="empty-title">No plugins found</div></div></div>
                  : <PluginGrid plugins={displayPlugins} onReleasesClick={(pk) => { setReleaseKey(pk); setAPage('publish'); loadReleases(pk); }} adminActions={(p) => (
                    <div style={{display:'flex',gap:6,marginTop:8}}>
                      <button className="btn btn-gold btn-sm" onClick={() => setOfficial(p.publisher_slug, true)} disabled={isBusy(`off-${p.publisher_slug}`)}>★ Official</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setOfficial(p.publisher_slug, false)} disabled={isBusy(`off-${p.publisher_slug}`)}>◈ Community</button>
                    </div>
                  )} />
                }
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                ADMIN — USERS
            ══════════════════════════════════════════════════════ */}
            {isAdmin && aPage === 'users' && (
              <div>
                <div className="toolbar">
                  <div className="searchbar" style={{minWidth:220}}>
                    <span className="searchbar-icon">⌕</span>
                    <input placeholder="Search by username or email…" value={userSearch} onChange={e => setUserSearch(e.target.value)} onKeyDown={e => e.key==='Enter' && loadUsers()} />
                  </div>
                  <div className="chips">
                    {['all','active','suspended','banned','pending'].map(f => (
                      <button key={f} className={`chip${userFilter===f?' on':''}`} onClick={() => setUserFilter(f)}>
                        {f.charAt(0).toUpperCase()+f.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="spacer" />
                  <button className="btn btn-secondary btn-sm" disabled={isBusy('users')} onClick={loadUsers}>{isBusy('users') ? <Spin/> : '⟳ Search'}</button>
                </div>
                <div className="card">
                  <div className="card-head">
                    <div><div className="card-title">Registered users</div><div className="card-sub">{usersTotal} total</div></div>
                    <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('users.csv',['ID','Username','Email','Status','Admin','Created'],adminUsers.map(u=>[u.id,u.username,u.email,u.status,String(!!u.trust_flags?.is_admin),u.created_at??'']))}>↓ Export</button>
                  </div>
                  {adminUsers.length === 0
                    ? <div className="empty">{isBusy('users') ? <><Spin /><div className="empty-sub">Loading…</div></> : <><div className="empty-icon">◎</div><div className="empty-title">No users loaded</div><div className="empty-sub">Use Search to load users.</div><button className="btn btn-primary btn-sm" style={{marginTop:10}} onClick={loadUsers}>Load all</button></>}</div>
                    : <div className="tbl-wrap"><table className="tbl">
                        <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                        <tbody>
                          {adminUsers.map(u => (
                            <tr key={u.id}>
                              <td>
                                <div className="row" style={{gap:10}}>
                                  <div style={{width:28,height:28,borderRadius:'50%',background:`linear-gradient(135deg,${pluginColor(u.id)},${pluginColor(u.username)})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'white',flexShrink:0,fontFamily:'Syne,sans-serif'}}>{initials(u.username)}</div>
                                  <div><div style={{fontWeight:600}}>{u.username}</div><div className="tbl-mono" style={{fontSize:10}}>{u.id.slice(0,8)}…</div></div>
                                </div>
                              </td>
                              <td className="tbl-muted">{u.email}</td>
                              <td>{u.trust_flags?.is_admin ? <Lbl v="admin"/> : <Lbl v="member"/>}</td>
                              <td><Lbl v={u.status}/></td>
                              <td className="tbl-muted">{fmtDate(u.created_at)}</td>
                              <td><div className="tbl-actions">
                                {u.status!=='active' && <button className="btn btn-success btn-sm" disabled={isBusy(`u-${u.id}`)} onClick={() => updateStatus(u.id,'active')}>Activate</button>}
                                {u.status!=='suspended' && <button className="btn btn-secondary btn-sm" disabled={isBusy(`u-${u.id}`)} onClick={() => updateStatus(u.id,'suspended')}>Suspend</button>}
                                {u.status!=='banned' && <button className="btn btn-danger btn-sm" disabled={isBusy(`u-${u.id}`)} onClick={() => updateStatus(u.id,'banned')}>Ban</button>}
                              </div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                  }
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                ADMIN — REVIEWS
            ══════════════════════════════════════════════════════ */}
            {isAdmin && aPage === 'reviews' && (
              <div>
                {reviewSummary && (
                  <div className="metrics" style={{marginBottom:18}}>
                    {[
                      {l:'Total queue',  v:reviewSummary.total,       c:'var(--accent)'},
                      ...Object.entries(reviewSummary.by_review_state??{}).map(([k,v])=>({l:k,v,c:'var(--violet)'})),
                      ...Object.entries(reviewSummary.by_risk_level??{}).slice(0,2).map(([k,v])=>({l:`Risk: ${k}`,v,c:k==='high'?'var(--red)':'var(--gold)'})),
                    ].slice(0,6).map(m => (
                      <div key={m.l} className="metric" style={{'--m-color':m.c} as React.CSSProperties}>
                        <div className="metric-label">{m.l}</div>
                        <div className="metric-val">{m.v}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="card">
                  <div className="card-head">
                    <div><div className="card-title">Moderation queue</div><div className="card-sub">{reviewQueue.length} pending</div></div>
                  </div>
                  {reviewQueue.length === 0
                    ? <div className="empty">{isBusy('reviews') ? <><Spin/><div className="empty-sub">Loading…</div></> : <><div className="empty-icon">⟳</div><div className="empty-title">Queue is empty</div><div className="empty-sub">All releases reviewed.</div></>}</div>
                    : <div className="tbl-wrap"><table className="tbl">
                        <thead><tr><th>Plugin</th><th>Publisher</th><th>Version</th><th>Channel</th><th>Risk</th><th>State</th><th>Age</th><th>Actions</th></tr></thead>
                        <tbody>
                          {reviewQueue.map(item => (
                            <tr key={item.release_id}>
                              <td><div style={{fontWeight:600}}>{item.plugin_display_name}</div><div className="tbl-mono">{item.plugin_key}</div></td>
                              <td className="tbl-muted">{item.publisher||'—'}</td>
                              <td><span className="tbl-mono">v{item.version}</span></td>
                              <td><Lbl v={item.release_channel}/></td>
                              <td><Lbl v={item.risk_level}/></td>
                              <td><Lbl v={item.review_state}/></td>
                              <td className="tbl-muted">{item.queue_age_hours.toFixed(1)}h</td>
                              <td><div className="tbl-actions">
                                <button className="btn btn-success btn-sm" disabled={isBusy(`rv-${item.release_id}`)} onClick={() => reviewAction(item.release_id,'approve')}>✓ Approve</button>
                                <button className="btn btn-secondary btn-sm" disabled={isBusy(`rv-${item.release_id}`)} onClick={() => reviewAction(item.release_id,'request-changes')}>△ Changes</button>
                                <button className="btn btn-danger btn-sm" disabled={isBusy(`rv-${item.release_id}`)} onClick={() => reviewAction(item.release_id,'reject')}>✕ Reject</button>
                              </div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                  }
                </div>
              </div>
            )}


            {/* ══════════════════════════════════════════════════════
                USER — PROFILE (password only)
            ══════════════════════════════════════════════════════ */}
            {!isAdmin && uPage === 'profile' && (
              <div className="vstack">
                <div className="profile-hero">
                  <div className="profile-av">{initials(user?.username||'?')}</div>
                  <div style={{flex:1}}>
                    <div className="profile-name">{user?.username}</div>
                    <div className="profile-email">{user?.email}</div>
                    <div className="row" style={{gap:6}}>
                      <Lbl v={user?.status}/>
                      <Lbl v={isAdmin?'admin':'member'}/>
                    </div>
                  </div>
                </div>

                <div className="g2">
                  <div className="card">
                    <div className="card-head"><div className="card-title">Account info</div></div>
                    <div className="card-body">
                      <div className="alert alert-info">Username and email cannot be changed. Contact an administrator if you need to update them.</div>
                      <div className="drow"><span className="dkey">Username</span><span className="dval">{user?.username}</span></div>
                      <div className="drow"><span className="dkey">Email</span><span className="dval">{user?.email}</span></div>
                      <div className="drow"><span className="dkey">User ID</span><span className="dval-mono">{user?.id}</span></div>
                      <div className="drow"><span className="dkey">Status</span><Lbl v={user?.status}/></div>
                      <div className="drow"><span className="dkey">Session</span><span className="dval-mono">{sessionId.slice(0,12)}…</span></div>
                      <div className="drow"><span className="dkey">Expires</span><span className="dval">{fmtDT(expiresAt)}</span></div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-head"><div className="card-title">Change password</div></div>
                    <div className="card-body">
                      <form onSubmit={handleChangePassword}>
                        <div className="field"><label className="field-label">Current password</label><input className="input" type="password" required value={pwForm.current} onChange={e => setPwForm(p=>({...p,current:e.target.value}))} /></div>
                        <div className="field"><label className="field-label">New password</label><input className="input" type="password" required minLength={8} value={pwForm.next} onChange={e => setPwForm(p=>({...p,next:e.target.value}))} /><span className="field-hint">Minimum 8 characters.</span></div>
                        <div className="field"><label className="field-label">Confirm new password</label><input className="input" type="password" required value={pwForm.confirm} onChange={e => setPwForm(p=>({...p,confirm:e.target.value}))} /></div>
                        <button className="btn btn-primary btn-full" type="submit" disabled={isBusy('pw')}>{isBusy('pw') ? <><Spin/> Updating…</> : 'Update password'}</button>
                      </form>
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      </div>

      {/* ════ MODALS ════ */}


      {/* Confirm dialog */}
      {confirmCtx && (
        <div className="overlay" onClick={e => e.target===e.currentTarget && setConfirmCtx(null)}>
          <div className="modal" style={{maxWidth:380}}>
            <div className="modal-head"><div className="modal-title">{confirmCtx.title}</div></div>
            <div className="modal-body"><p style={{fontSize:13,color:'var(--txt-2)',lineHeight:1.6}}>{confirmCtx.body}</p></div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setConfirmCtx(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { confirmCtx.onOk(); setConfirmCtx(null); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}

function FileDropZone({
  label,
  hint,
  accept,
  dragActive,
  multiple = false,
  hasFiles = false,
  onDragChange,
  onFiles,
}: {
  label: string;
  hint: string;
  accept: string;
  dragActive: boolean;
  multiple?: boolean;
  hasFiles?: boolean;
  onDragChange: (active: boolean) => void;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      className={`dropzone${dragActive ? ' active' : ''}${hasFiles ? ' loaded' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); onDragChange(true); }}
      onDragOver={(e) => { e.preventDefault(); onDragChange(true); }}
      onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget === e.target) onDragChange(false); }}
      onDrop={(e) => {
        e.preventDefault();
        onDragChange(false);
        onFiles(Array.from(e.dataTransfer.files || []));
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only-input"
        accept={accept}
        multiple={multiple}
        onChange={(e) => onFiles(Array.from(e.target.files || []))}
      />
      <div className="dropzone-label">{label}</div>
      <div className="dropzone-hint">{hint}</div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()}>Browse</button>
    </div>
  );
}

function CapabilityMultiSelect({
  options,
  value,
  onChange,
  loading,
}: {
  options: CapabilityOption[];
  value: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter(option => value.includes(option.value));

  return (
    <div className={`multi-select${open ? ' open' : ''}`}>
      <button type="button" className="multi-select-trigger" onClick={() => setOpen(v => !v)}>
        <span>{selected.length ? selected.map(option => option.label).join(', ') : (loading ? 'Loading capabilities…' : 'Select capabilities')}</span>
        <span className="multi-select-caret">▾</span>
      </button>
      {open && (
        <div className="multi-select-menu">
          {options.length === 0 ? (
            <div className="multi-select-empty">No capabilities available.</div>
          ) : (
            options.map(option => {
              const checked = value.includes(option.value);
              return (
                <label key={option.value} className="multi-select-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      if (checked) onChange(value.filter(item => item !== option.value));
                      else onChange([...value, option.value]);
                    }}
                  />
                  <span>
                    <span className="multi-select-option-title">{option.label}</span>
                    {option.description && <span className="multi-select-option-sub">{option.description}</span>}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function PluginTypeBadge({ plugin }: { plugin: PublisherPlugin }) {
  const label = publisherLabel(plugin.plugin_type || plugin.trust_level, plugin.publisher_slug);
  return <span className={`lbl ${label.cls}`}>{label.text}</span>;
}

// ─── Plugin grid component ────────────────────────────────────────
function PluginGrid({ plugins, onReleasesClick, adminActions, activeKey }: {
  plugins: PublisherPlugin[];
  onReleasesClick: (key: string) => void;
  adminActions?: (p: PublisherPlugin) => React.ReactNode;
  activeKey?: string | null;
}) {
  return (
    <div className="g-auto">
      {plugins.map(p => {
        const color = pluginColor(p.plugin_key);
        const pl = publisherLabel(p.plugin_type || p.trust_level, p.publisher_slug);
        const { cls: vCls, text: vTxt } = statusLbl(p.visibility);
        return (
          <div className={`plugin-card${activeKey === p.plugin_key ? ' selected' : ''}`} key={p.id}>
            <div className="row" style={{justifyContent:'space-between',alignItems:'flex-start'}}>
              <div className="plugin-icon" style={{background:`linear-gradient(135deg,${color}cc,${color}66)`}}>
                {p.display_name.slice(0,2).toUpperCase()}
              </div>
              <span className={`lbl ${pl.cls}`}>{pl.text}</span>
            </div>
            <div><div className="plugin-name">{p.display_name}</div><div className="plugin-key">{p.plugin_key}</div></div>
            {p.description && <div className="plugin-desc">{p.description}</div>}
            {p.tags.length>0 && <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{p.tags.slice(0,4).map(t=><span key={t} className="tag">{t}</span>)}</div>}
            {adminActions && adminActions(p)}
            <div className="plugin-foot">
              <span className={`lbl ${vCls}`}>{vTxt}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => onReleasesClick(p.plugin_key)}>Releases →</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Toasts ───────────────────────────────────────────────────────
function Toasts({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  const cls: Record<string,string> = { ok:'toast-ok', err:'toast-err', inf:'toast-inf' };
  return (
    <div className="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${cls[t.kind]}`}>
          <span className="toast-dot"/>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
