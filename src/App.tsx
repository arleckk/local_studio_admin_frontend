import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { apiRequest, ApiError, buildUrl } from './lib/api';
import { loadPersistedState, savePersistedState } from './lib/storage';
import type {
  AdminSummary, AdminUser, PublisherAccess, PublisherInvitation,
  PublisherMember, PublisherPlugin, PublisherProfile, PublisherRelease,
  ReviewQueueItem, ReviewQueueSummary, RuntimeStatus,
  SessionResponse, SessionStatusResponse, SessionUser,
} from './lib/types';

// ─── types ────────────────────────────────────────────────────────────────────
type Page = 'dashboard' | 'plugins' | 'releases' | 'publisher' | 'members' | 'reviews' | 'users' | 'settings';
type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string };
type ConfigState = { apiBaseUrl: string; publisherSlug: string; publisherApiKey: string; adminApiKey: string };
type SessionState = { accessToken: string; refreshToken: string; sessionId: string; expiresAt: string; user: SessionUser | null };
type PluginFormState = { pluginKey: string; displayName: string; description: string; homepageUrl: string; documentationUrl: string; trustLevel: string; visibility: string; productSurface: string; tags: string; categories: string; capabilities: string };
type InvitationFormState = { email: string; role: string; notes: string; expiresInDays: number };
type AuthMode = 'login' | 'register';

const defaultPersisted = loadPersistedState();

const initialPluginForm: PluginFormState = {
  pluginKey: '', displayName: '', description: '', homepageUrl: '', documentationUrl: '',
  trustLevel: 'community', visibility: 'public', productSurface: 'default', tags: '', categories: '', capabilities: '',
};

const initialInvitationForm: InvitationFormState = { email: '', role: 'member', notes: '', expiresInDays: 7 };

// ─── utils ────────────────────────────────────────────────────────────────────
function parseCsv(v: string): string[] { return v.split(',').map(s => s.trim()).filter(Boolean); }
function fmtDate(v?: string | null): string {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return v; }
}
function fmtDateTime(v?: string | null): string {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return v; }
}
function getInitials(name: string): string {
  return name.split(/[\s._-]/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';
}
function pluginColor(key: string): string {
  const colors = ['#06b6d4','#8b5cf6','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6'];
  let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}
function getPublisherLabel(trust_tier?: string | null, slug?: string): { cls: string; text: string } {
  if (slug === 'local-studio' || trust_tier === 'internal') return { cls: 'label-core', text: '⬡ Core' };
  if (trust_tier === 'official' || trust_tier === 'verified') return { cls: 'label-official', text: '★ Official' };
  return { cls: 'label-community', text: '◈ Community' };
}
function getStatusLabel(v?: string | null): { cls: string; text: string } {
  const s = (v || 'unknown').toLowerCase();
  const map: Record<string, string> = {
    active: 'label-active', approved: 'label-approved', verified: 'label-verified',
    public: 'label-public', stable: 'label-stable', community: 'label-community',
    official: 'label-official', internal: 'label-core', core: 'label-core',
    suspended: 'label-suspended', banned: 'label-banned', rejected: 'label-rejected',
    private: 'label-private', beta: 'label-beta', canary: 'label-canary',
    pending: 'label-pending', in_review: 'label-pending', quarantined: 'label-suspended',
  };
  return { cls: map[s] || 'label-default', text: v || 'unknown' };
}
function exportCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function Label({ status }: { status?: string | null }) {
  const { cls, text } = getStatusLabel(status);
  return <span className={`label ${cls}`}>{text}</span>;
}
function Spinner() { return <span className="spinner" />; }

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const toastId = useRef(0);

  // config & session
  const [config, setConfig] = useState<ConfigState>({
    apiBaseUrl: defaultPersisted.apiBaseUrl,
    publisherSlug: defaultPersisted.publisherSlug,
    publisherApiKey: defaultPersisted.publisherApiKey,
    adminApiKey: defaultPersisted.adminApiKey,
  });
  const [session, setSession] = useState<SessionState>({
    accessToken: defaultPersisted.accessToken, refreshToken: defaultPersisted.refreshToken,
    sessionId: defaultPersisted.sessionId, expiresAt: defaultPersisted.expiresAt, user: defaultPersisted.user,
  });

  // forms
  const [loginForm, setLoginForm] = useState({ usernameOrEmail: '', password: '', deviceLabel: 'Local Studio Admin' });
  const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '', deviceLabel: 'Local Studio Admin' });
  const [pluginForm, setPluginForm] = useState<PluginFormState>(initialPluginForm);
  const [invitationForm, setInvitationForm] = useState<InvitationFormState>(initialInvitationForm);
  const [releasePluginKey, setReleasePluginKey] = useState('');
  const [releaseChannel, setReleaseChannel] = useState('stable');
  const [releaseChangelog, setReleaseChangelog] = useState('');
  const [releaseFile, setReleaseFile] = useState<File | null>(null);
  const [bootstrapRole, setBootstrapRole] = useState('owner');

  // data
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [publisherAccess, setPublisherAccess] = useState<PublisherAccess[]>([]);
  const [publisherProfile, setPublisherProfile] = useState<PublisherProfile | null>(null);
  const [plugins, setPlugins] = useState<PublisherPlugin[]>([]);
  const [allPublisherPlugins, setAllPublisherPlugins] = useState<PublisherPlugin[]>([]);
  const [releases, setReleases] = useState<PublisherRelease[]>([]);
  const [members, setMembers] = useState<PublisherMember[]>([]);
  const [invitations, setInvitations] = useState<PublisherInvitation[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewQueueSummary | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminUsersTotal, setAdminUsersTotal] = useState(0);

  // filters
  const [pluginFilter, setPluginFilter] = useState('all');
  const [pluginSearch, setPluginSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');

  // modal states
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showPluginModal, setShowPluginModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ label: string; onConfirm: () => void } | null>(null);

  // persist
  useEffect(() => { savePersistedState({ ...config, ...session }); }, [config, session]);

  // ─── toast helpers ───
  const toast = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, kind, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, []);

  // ─── api helpers ───
  function isBusy(k: string) { return !!busy[k]; }
  async function withBusy<T>(k: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(b => ({ ...b, [k]: true }));
    try { return await fn(); }
    catch (e) { toast('error', e instanceof ApiError ? e.message : String(e)); return null; }
    finally { setBusy(b => ({ ...b, [k]: false })); }
  }
  function authOpts(opts?: { admin?: boolean; publisher?: boolean }) {
    return {
      token: session.accessToken,
      ...(opts?.publisher ? { includePublisher: true, publisherSlug: config.publisherSlug, publisherApiKey: config.publisherApiKey } : {}),
      ...(opts?.admin ? { includeAdmin: true, adminApiKey: config.adminApiKey } : {}),
    };
  }
  function applySession(data: SessionResponse) {
    setSession({ accessToken: data.access_token, refreshToken: data.refresh_token, sessionId: data.session_id, expiresAt: data.expires_at, user: data.user });
  }
  function clearSession() {
    setSession({ accessToken: '', refreshToken: '', sessionId: '', expiresAt: '', user: null });
  }

  const isLoggedIn = !!session.user;

  // ─── AUTH ───
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    await withBusy('login', async () => {
      const data = await apiRequest<SessionResponse>(config.apiBaseUrl, '/api/v1/accounts/login', {
        method: 'POST',
        body: { username_or_email: loginForm.usernameOrEmail, password: loginForm.password, device_label: loginForm.deviceLabel || null },
      });
      applySession(data);
      toast('success', `Welcome back, ${data.user.username}!`);
      setPage('dashboard');
    });
  }
  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    await withBusy('register', async () => {
      const data = await apiRequest<SessionResponse>(config.apiBaseUrl, '/api/v1/accounts/register', {
        method: 'POST',
        body: { username: registerForm.username, email: registerForm.email, password: registerForm.password, device_label: registerForm.deviceLabel || null },
      });
      applySession(data);
      toast('success', `Account created! Welcome, ${data.user.username}.`);
      setPage('dashboard');
    });
  }
  async function handleLogout() {
    await withBusy('logout', async () => {
      if (session.accessToken || session.refreshToken) {
        await apiRequest(config.apiBaseUrl, '/api/v1/accounts/logout', {
          method: 'POST', token: session.accessToken,
          body: { refresh_token: session.refreshToken || null },
        });
      }
      clearSession();
      setAdminSummary(null); setPlugins([]); setMembers([]); setAdminUsers([]);
      toast('info', 'Signed out.');
      setPage('dashboard');
    });
  }

  // ─── DASHBOARD ───
  const loadDashboard = useCallback(async () => {
    if (!config.adminApiKey) return;
    await withBusy('dashboard', async () => {
      const [summary, runtime] = await Promise.all([
        apiRequest<AdminSummary>(config.apiBaseUrl, '/api/v1/admin/summary', authOpts({ admin: true })),
        apiRequest<RuntimeStatus>(config.apiBaseUrl, '/api/v1/admin/runtime', authOpts({ admin: true })),
      ]);
      setAdminSummary(summary);
      setRuntimeStatus(runtime);
    });
  }, [config]);

  useEffect(() => { if (isLoggedIn && page === 'dashboard') loadDashboard(); }, [page, isLoggedIn]);

  // ─── PLUGINS ───
  async function loadPlugins() {
    await withBusy('plugins', async () => {
      const data = await apiRequest<PublisherPlugin[]>(config.apiBaseUrl, '/api/v1/publishers/plugins', authOpts({ publisher: true }));
      setPlugins(data);
    });
  }
  async function handleSavePlugin(e: FormEvent) {
    e.preventDefault();
    await withBusy('save-plugin', async () => {
      await apiRequest<PublisherPlugin>(config.apiBaseUrl, '/api/v1/publishers/plugins', {
        method: 'POST', ...authOpts({ publisher: true }),
        body: {
          plugin_key: pluginForm.pluginKey, display_name: pluginForm.displayName,
          description: pluginForm.description || null, homepage_url: pluginForm.homepageUrl || null,
          documentation_url: pluginForm.documentationUrl || null, trust_level: pluginForm.trustLevel,
          product_surface: pluginForm.productSurface || 'default', visibility: pluginForm.visibility,
          tags: parseCsv(pluginForm.tags), categories: parseCsv(pluginForm.categories),
          capabilities: parseCsv(pluginForm.capabilities), metadata: {}, install_policy: {}, update_channels: {},
        },
      });
      setPluginForm(initialPluginForm);
      setShowPluginModal(false);
      await loadPlugins();
      toast('success', `Plugin "${pluginForm.displayName}" saved.`);
    });
  }

  const filteredPlugins = useMemo(() => {
    let list = plugins;
    if (pluginFilter !== 'all') list = list.filter(p => p.trust_level === pluginFilter || (pluginFilter === 'internal' && p.internal));
    if (pluginSearch) {
      const q = pluginSearch.toLowerCase();
      list = list.filter(p => p.display_name.toLowerCase().includes(q) || p.plugin_key.toLowerCase().includes(q));
    }
    return list;
  }, [plugins, pluginFilter, pluginSearch]);

  // ─── RELEASES ───
  async function loadReleases(key?: string) {
    const pk = (key ?? releasePluginKey).trim();
    if (!pk) { toast('error', 'Select a plugin key first.'); return; }
    await withBusy('releases', async () => {
      const data = await apiRequest<PublisherRelease[]>(config.apiBaseUrl, `/api/v1/publishers/plugins/${pk}/releases`, authOpts({ publisher: true }));
      setReleases(data);
      if (key) setReleasePluginKey(key);
    });
  }
  async function handleUploadRelease(e: FormEvent) {
    e.preventDefault();
    if (!releaseFile) { toast('error', 'Pick a file first.'); return; }
    await withBusy('upload', async () => {
      const fd = new FormData();
      fd.append('file', releaseFile);
      if (releaseChannel) fd.append('release_channel', releaseChannel);
      if (releaseChangelog) fd.append('changelog', releaseChangelog);
      const r = await apiRequest<PublisherRelease>(config.apiBaseUrl, '/api/v1/publishers/releases', {
        method: 'POST', ...authOpts({ publisher: true }), body: fd, isFormData: true,
      });
      setReleaseFile(null); setReleaseChangelog('');
      await loadReleases(r.plugin_key);
      toast('success', `Release v${r.version} uploaded.`);
    });
  }

  // ─── PUBLISHER ───
  async function loadPublisherProfile() {
    await withBusy('pub-profile', async () => {
      const [access, profile] = await Promise.all([
        apiRequest<PublisherAccess[]>(config.apiBaseUrl, '/api/v1/publishers/access', authOpts()),
        apiRequest<PublisherProfile>(config.apiBaseUrl, '/api/v1/publishers/me', authOpts({ publisher: true })),
      ]);
      setPublisherAccess(access);
      setPublisherProfile(profile);
    });
  }
  async function bootstrapMembership() {
    if (!session.user) { toast('error', 'Login required.'); return; }
    await withBusy('bootstrap', async () => {
      await apiRequest(config.apiBaseUrl, '/api/v1/publishers/members', {
        method: 'POST', ...authOpts({ publisher: true }),
        body: { user_identifier: session.user?.email || session.user?.username, role: bootstrapRole, status: 'active', notes: 'Bootstrapped from admin.', permissions: {} },
      });
      await loadPublisherProfile();
      toast('success', 'Publisher membership granted.');
    });
  }

  // ─── MEMBERS ───
  async function loadMembers() {
    await withBusy('members', async () => {
      const data = await apiRequest<PublisherMember[]>(config.apiBaseUrl, '/api/v1/publishers/members', authOpts({ publisher: true }));
      setMembers(data);
    });
  }
  async function loadInvitations() {
    await withBusy('invitations', async () => {
      const data = await apiRequest<PublisherInvitation[]>(config.apiBaseUrl, '/api/v1/publishers/invitations', authOpts({ publisher: true }));
      setInvitations(data);
    });
  }
  async function handleCreateInvitation(e: FormEvent) {
    e.preventDefault();
    await withBusy('invite', async () => {
      await apiRequest(config.apiBaseUrl, '/api/v1/publishers/invitations', {
        method: 'POST', ...authOpts({ publisher: true }),
        body: { email: invitationForm.email, role: invitationForm.role, notes: invitationForm.notes || null, permissions: {}, expires_in_days: Number(invitationForm.expiresInDays) },
      });
      setInvitationForm(initialInvitationForm);
      await loadInvitations();
      toast('success', `Invitation sent to ${invitationForm.email}.`);
    });
  }

  // ─── REVIEWS ───
  async function loadReviews() {
    await withBusy('reviews', async () => {
      const [summary, queue] = await Promise.all([
        apiRequest<ReviewQueueSummary>(config.apiBaseUrl, '/api/v1/admin/review-queue/summary', authOpts({ admin: true })),
        apiRequest<ReviewQueueItem[]>(config.apiBaseUrl, '/api/v1/reviews/queue', authOpts({ admin: true })),
      ]);
      setReviewSummary(summary);
      setReviewQueue(queue);
    });
  }
  async function submitReview(id: string, action: 'approve' | 'reject' | 'request-changes') {
    await withBusy(`review-${id}`, async () => {
      await apiRequest(config.apiBaseUrl, `/api/v1/reviews/${id}/${action}`, {
        method: 'POST', ...authOpts({ admin: true }),
        body: { notes: `Admin decision: ${action}`, force: false },
      });
      await loadReviews();
      toast('success', `Release ${action}d.`);
    });
  }

  // ─── ADMIN USERS ───
  async function loadUsers() {
    await withBusy('users', async () => {
      const params = new URLSearchParams();
      if (userSearch) params.set('query', userSearch);
      if (userStatusFilter !== 'all') params.set('status', userStatusFilter);
      params.set('limit', '100');
      const q = params.toString();
      const data = await apiRequest<{ total: number; items: AdminUser[] }>(
        config.apiBaseUrl, `/api/v1/admin/users${q ? `?${q}` : ''}`, authOpts({ admin: true })
      );
      setAdminUsers(data.items);
      setAdminUsersTotal(data.total);
    });
  }
  async function updateUserStatus(userId: string, newStatus: string) {
    await withBusy(`user-${userId}`, async () => {
      await apiRequest(config.apiBaseUrl, `/api/v1/admin/users/${userId}/status`, {
        method: 'POST', ...authOpts({ admin: true }), body: { status: newStatus },
      });
      await loadUsers();
      toast('success', `User status updated to "${newStatus}".`);
    });
  }
  async function setPublisherOfficial(slug: string, official: boolean) {
    await withBusy(`pub-official-${slug}`, async () => {
      await apiRequest(config.apiBaseUrl, `/api/v1/admin/publishers/${slug}/set-official?official=${official}`, {
        method: 'POST', ...authOpts({ admin: true }), body: {},
      });
      await loadPublisherProfile();
      toast('success', `Publisher marked as ${official ? 'Official' : 'Community'}.`);
    });
  }

  // ─── page-level load ───
  useEffect(() => {
    if (!isLoggedIn) return;
    if (page === 'plugins') loadPlugins();
    if (page === 'members') { loadMembers(); loadInvitations(); }
    if (page === 'reviews') loadReviews();
    if (page === 'users') loadUsers();
    if (page === 'publisher') loadPublisherProfile();
  }, [page, isLoggedIn]);

  // ─── render helpers ──────────────────────────────────────────────────────────
  const navItems: { key: Page; icon: string; label: string; section?: string }[] = [
    { key: 'dashboard', icon: '⬡', label: 'Dashboard', section: 'Overview' },
    { key: 'plugins', icon: '⬡', label: 'Plugins', section: 'Publisher' },
    { key: 'releases', icon: '↑', label: 'Releases' },
    { key: 'publisher', icon: '◉', label: 'Publisher' },
    { key: 'members', icon: '◈', label: 'Members' },
    { key: 'reviews', icon: '⟳', label: 'Reviews', section: 'Admin' },
    { key: 'users', icon: '◎', label: 'Users' },
    { key: 'settings', icon: '⚙', label: 'Settings' },
  ];

  // ── AUTH SCREEN ──────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <div className="auth-logo-mark">LS</div>
              <div>
                <div className="auth-logo-name">Local Studio</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Plugin Admin</div>
              </div>
            </div>
            <div className="auth-tabs">
              <button className={`auth-tab${authMode === 'login' ? ' active' : ''}`} onClick={() => setAuthMode('login')}>Sign in</button>
              <button className={`auth-tab${authMode === 'register' ? ' active' : ''}`} onClick={() => setAuthMode('register')}>Register</button>
            </div>
          </div>
          <div className="auth-body">
            {authMode === 'login' ? (
              <>
                <div className="auth-title">Welcome back</div>
                <div className="auth-subtitle">Sign in to manage your plugins and releases.</div>
                <form onSubmit={handleLogin}>
                  <div className="form-field">
                    <label className="form-label">Username or email</label>
                    <input className="form-input" required value={loginForm.usernameOrEmail} onChange={e => setLoginForm(p => ({ ...p, usernameOrEmail: e.target.value }))} placeholder="you@example.com" />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Password</label>
                    <input className="form-input" type="password" required value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} />
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <button className="btn btn-primary btn-lg btn-full" type="submit" disabled={isBusy('login')}>
                      {isBusy('login') ? <><Spinner /> Signing in…</> : 'Sign in'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="auth-title">Create account</div>
                <div className="auth-subtitle">Join Local Studio to publish and manage plugins.</div>
                <form onSubmit={handleRegister}>
                  <div className="form-grid" style={{ marginBottom: 14 }}>
                    <div className="form-field" style={{ margin: 0 }}>
                      <label className="form-label">Username</label>
                      <input className="form-input" required value={registerForm.username} onChange={e => setRegisterForm(p => ({ ...p, username: e.target.value }))} />
                    </div>
                    <div className="form-field" style={{ margin: 0 }}>
                      <label className="form-label">Email</label>
                      <input className="form-input" type="email" required value={registerForm.email} onChange={e => setRegisterForm(p => ({ ...p, email: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-field">
                    <label className="form-label">Password</label>
                    <input className="form-input" type="password" required minLength={8} value={registerForm.password} onChange={e => setRegisterForm(p => ({ ...p, password: e.target.value }))} />
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <button className="btn btn-primary btn-lg btn-full" type="submit" disabled={isBusy('register')}>
                      {isBusy('register') ? <><Spinner /> Creating…</> : 'Create account'}
                    </button>
                  </div>
                </form>
              </>
            )}
            {/* backend url config */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Backend URL</label>
                <input className="form-input" value={config.apiBaseUrl} onChange={e => setConfig(p => ({ ...p, apiBaseUrl: e.target.value }))} placeholder="http://localhost:45111" />
              </div>
            </div>
          </div>
        </div>
        <ToastStack toasts={toasts} />
      </div>
    );
  }

  // ── MAIN LAYOUT ──────────────────────────────────────────────────────────────
  const pageTitle: Record<Page, string> = {
    dashboard: 'Dashboard', plugins: 'Plugins', releases: 'Releases',
    publisher: 'Publisher', members: 'Team & Members', reviews: 'Release Reviews',
    users: 'User Management', settings: 'Settings',
  };

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-mark">LS</div>
            <div>
              <div className="sidebar-logo-text">Local Studio</div>
              <div className="sidebar-logo-sub">Plugin Admin</div>
            </div>
          </div>
        </div>

        <div className="sidebar-session">
          <div className="session-user">
            <div className="session-avatar">{getInitials(session.user?.username || '?')}</div>
            <div className="session-info">
              <div className="session-name">{session.user?.username}</div>
              <div className="session-email">{session.user?.email}</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item, i) => {
            const prevSection = i > 0 ? navItems[i - 1].section : undefined;
            const showSection = item.section && item.section !== prevSection;
            return (
              <div key={item.key}>
                {showSection && <div className="nav-section-label">{item.section}</div>}
                <button
                  className={`nav-item${page === item.key ? ' active' : ''}`}
                  onClick={() => setPage(item.key)}
                >
                  <span style={{ fontSize: 13, width: 16, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  {item.label}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div style={{ padding: '8px 2px', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {config.apiBaseUrl || '(same origin)'}
          </div>
          <button className="btn btn-ghost btn-full btn-sm" onClick={() => setShowConfigModal(true)} style={{ justifyContent: 'flex-start' }}>
            ⚙ Configure connection
          </button>
          <button className="btn btn-ghost btn-full btn-sm" style={{ justifyContent: 'flex-start', color: 'var(--text-muted)' }} disabled={isBusy('logout')} onClick={handleLogout}>
            {isBusy('logout') ? <Spinner /> : '→ Sign out'}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-content">
        <div className="topbar">
          <div className="topbar-title">{pageTitle[page]}</div>
          <div className="topbar-actions">
            {page === 'plugins' && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowPluginModal(true)}>+ New plugin</button>
            )}
            {page === 'dashboard' && (
              <button className="btn btn-secondary btn-sm" disabled={isBusy('dashboard')} onClick={loadDashboard}>
                {isBusy('dashboard') ? <Spinner /> : '⟳ Refresh'}
              </button>
            )}
            {page === 'users' && (
              <button className="btn btn-export btn-sm" onClick={() => exportCsv('users.csv', ['ID','Username','Email','Status','Created'], adminUsers.map(u => [u.id, u.username, u.email, u.status, u.created_at ?? '']))}>
                ↓ Export CSV
              </button>
            )}
          </div>
        </div>

        <div className="page-content">
          <div className="page-enter" key={page}>
            {/* ─────────────────── DASHBOARD ─────────────────────────── */}
            {page === 'dashboard' && (
              <div>
                <div className="page-header">
                  <div>
                    <div className="page-heading">Overview</div>
                    <div className="page-desc">Platform metrics and system status.</div>
                  </div>
                </div>

                {adminSummary ? (
                  <>
                    <div className="metrics-grid">
                      {[
                        { label: 'Users', value: adminSummary.users_total ?? 0, sub: 'registered accounts', color: 'var(--accent)' },
                        { label: 'Publishers', value: adminSummary.publishers_total ?? 0, sub: `${adminSummary.publishers_verified ?? 0} verified`, color: 'var(--violet)' },
                        { label: 'Plugins', value: adminSummary.plugins_total ?? 0, sub: 'in catalog', color: 'var(--emerald)' },
                        { label: 'Releases', value: adminSummary.releases_total ?? 0, sub: `${adminSummary.releases_approved ?? 0} approved`, color: 'var(--sky)' },
                        { label: 'In Review', value: adminSummary.releases_in_review ?? 0, sub: 'awaiting decision', color: 'var(--gold)' },
                        { label: 'Active Sessions', value: adminSummary.active_sessions ?? 0, sub: 'live sessions', color: 'var(--accent)' },
                        { label: 'Abuse Reports', value: adminSummary.abuse_reports_open ?? 0, sub: 'open reports', color: 'var(--red)' },
                        { label: 'Quarantined', value: adminSummary.releases_quarantined ?? 0, sub: 'blocked releases', color: 'var(--orange)' },
                      ].map(m => (
                        <div className="metric-card" key={m.label} style={{ '--metric-accent': m.color } as React.CSSProperties}>
                          <div className="metric-label">{m.label}</div>
                          <div className="metric-value">{m.value}</div>
                          <div className="metric-sublabel">{m.sub}</div>
                        </div>
                      ))}
                    </div>

                    <div className="grid-2">
                      <div className="panel">
                        <div className="panel-header">
                          <div>
                            <div className="panel-title">Runtime status</div>
                            <div className="panel-subtitle">Backend health and diagnostics</div>
                          </div>
                          <Label status={runtimeStatus?.ready ? 'active' : 'suspended'} />
                        </div>
                        <div className="panel-body">
                          {runtimeStatus ? (
                            <>
                              <div className="detail-row"><span className="detail-key">Ready</span><span className="detail-val">{String(runtimeStatus.ready)}</span></div>
                              {runtimeStatus.startup_error && (
                                <div className="alert alert-warn" style={{ marginTop: 10, marginBottom: 0 }}>⚠ {runtimeStatus.startup_error}</div>
                              )}
                              {Array.isArray(runtimeStatus.checks) && runtimeStatus.checks.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                  {runtimeStatus.checks.map((c: unknown, i: number) => {
                                    const check = c as { name?: string; status?: string; detail?: string };
                                    return (
                                      <div key={i} className="detail-row">
                                        <span className="detail-key">{check.name ?? `check ${i + 1}`}</span>
                                        <Label status={check.status} />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          ) : <div className="empty-state"><div className="empty-sub">No runtime data. Refresh dashboard.</div></div>}
                        </div>
                      </div>

                      <div className="panel">
                        <div className="panel-header">
                          <div>
                            <div className="panel-title">Quick actions</div>
                            <div className="panel-subtitle">Common admin tasks</div>
                          </div>
                        </div>
                        <div className="panel-body stack">
                          <button className="btn btn-secondary btn-full" style={{ justifyContent: 'flex-start' }} onClick={() => setPage('reviews')}>
                            ⟳ Review queue · {adminSummary.releases_in_review ?? 0} pending
                          </button>
                          <button className="btn btn-secondary btn-full" style={{ justifyContent: 'flex-start' }} onClick={() => setPage('plugins')}>
                            ⬡ Plugins · {adminSummary.plugins_total ?? 0} in catalog
                          </button>
                          <button className="btn btn-secondary btn-full" style={{ justifyContent: 'flex-start' }} onClick={() => setPage('users')}>
                            ◎ Users · {adminSummary.users_total ?? 0} registered
                          </button>
                          <button className="btn btn-secondary btn-full" style={{ justifyContent: 'flex-start' }} onClick={() => setPage('publisher')}>
                            ◉ Publisher · {adminSummary.publishers_total ?? 0} publishers
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="panel">
                    <div className="panel-body">
                      {isBusy('dashboard') ? (
                        <div className="empty-state"><Spinner /><div className="empty-sub">Loading dashboard…</div></div>
                      ) : (
                        <div className="empty-state">
                          <div className="empty-icon">⬡</div>
                          <div className="empty-title">No data loaded</div>
                          <div className="empty-sub">Configure your Admin API key in Settings and refresh.</div>
                          <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={loadDashboard}>Load dashboard</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─────────────────── PLUGINS ───────────────────────────── */}
            {page === 'plugins' && (
              <div>
                <div className="toolbar">
                  <div className="search-bar">
                    <span className="search-icon" style={{ fontSize: 13 }}>⌕</span>
                    <input placeholder="Search plugins…" value={pluginSearch} onChange={e => setPluginSearch(e.target.value)} />
                  </div>
                  <div className="filter-chips">
                    {['all', 'community', 'verified', 'trusted', 'internal'].map(f => (
                      <button key={f} className={`filter-chip${pluginFilter === f ? ' active' : ''}`} onClick={() => setPluginFilter(f)}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="spacer" />
                  <button className="btn btn-secondary btn-sm" disabled={isBusy('plugins')} onClick={loadPlugins}>
                    {isBusy('plugins') ? <Spinner /> : '⟳ Refresh'}
                  </button>
                </div>

                {filteredPlugins.length === 0 ? (
                  <div className="panel">
                    <div className="empty-state">
                      <div className="empty-icon">⬡</div>
                      <div className="empty-title">{plugins.length === 0 ? 'No plugins yet' : 'No results'}</div>
                      <div className="empty-sub">{plugins.length === 0 ? 'Create your first plugin to get started.' : 'Try a different search or filter.'}</div>
                      {plugins.length === 0 && <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => setShowPluginModal(true)}>+ New plugin</button>}
                    </div>
                  </div>
                ) : (
                  <div className="plugin-grid">
                    {filteredPlugins.map(plugin => {
                      const pubLabel = getPublisherLabel(undefined, plugin.publisher_slug);
                      const { cls: visCls, text: visText } = getStatusLabel(plugin.visibility);
                      const color = pluginColor(plugin.plugin_key);
                      return (
                        <div className="plugin-card" key={plugin.id}>
                          <div className="plugin-card-header">
                            <div className="plugin-icon" style={{ background: `linear-gradient(135deg, ${color}cc, ${color}66)` }}>
                              {getInitials(plugin.display_name)}
                            </div>
                            <div className="row" style={{ gap: 4 }}>
                              <span className={`label ${pubLabel.cls}`}>{pubLabel.text}</span>
                            </div>
                          </div>
                          <div className="plugin-name">{plugin.display_name}</div>
                          <div className="plugin-key">{plugin.plugin_key}</div>
                          {plugin.description && <div className="plugin-description">{plugin.description}</div>}
                          {plugin.tags.length > 0 && (
                            <div className="plugin-tags">{plugin.tags.slice(0, 4).map(t => <span key={t} className="tag">{t}</span>)}</div>
                          )}
                          <div className="plugin-footer">
                            <span className={`label ${visCls}`}>{visText}</span>
                            <div className="row" style={{ gap: 6 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setReleasePluginKey(plugin.plugin_key); setPage('releases'); }}>Releases</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─────────────────── RELEASES ──────────────────────────── */}
            {page === 'releases' && (
              <div className="grid-2">
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-title">Upload release</div>
                  </div>
                  <div className="panel-body">
                    <form onSubmit={handleUploadRelease}>
                      <div className="form-field">
                        <label className="form-label">Plugin key</label>
                        <input className="form-input" value={releasePluginKey} onChange={e => setReleasePluginKey(e.target.value)} placeholder="my.plugin.key" />
                      </div>
                      <div className="form-field">
                        <label className="form-label">Release channel</label>
                        <select className="form-select" value={releaseChannel} onChange={e => setReleaseChannel(e.target.value)}>
                          <option value="stable">stable</option>
                          <option value="beta">beta</option>
                          <option value="canary">canary</option>
                        </select>
                      </div>
                      <div className="form-field">
                        <label className="form-label">Changelog</label>
                        <textarea className="form-textarea" rows={3} value={releaseChangelog} onChange={e => setReleaseChangelog(e.target.value)} placeholder="What changed in this release…" />
                      </div>
                      <div className="form-field">
                        <label className="form-label">Package file (.lspkg)</label>
                        <input className="form-input" type="file" accept=".lspkg,.zip" style={{ padding: '7px 10px', fontSize: 12 }} onChange={e => setReleaseFile(e.target.files?.[0] ?? null)} />
                      </div>
                      <button className="btn btn-primary btn-full" type="submit" disabled={isBusy('upload') || !releaseFile}>
                        {isBusy('upload') ? <><Spinner /> Uploading…</> : '↑ Upload release'}
                      </button>
                    </form>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">Release history</div>
                      <div className="panel-subtitle">{releasePluginKey || 'Select a plugin key'}</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" disabled={isBusy('releases')} onClick={() => loadReleases()}>
                      {isBusy('releases') ? <Spinner /> : '⟳'}
                    </button>
                  </div>
                  <div className="panel-body" style={{ padding: 0 }}>
                    {releases.length === 0 ? (
                      <div className="empty-state"><div className="empty-icon">↑</div><div className="empty-title">No releases loaded</div><div className="empty-sub">Enter a plugin key and click refresh.</div></div>
                    ) : (
                      <div className="stack" style={{ padding: 14, gap: 8 }}>
                        {releases.map(r => (
                          <div className="list-item" key={r.id}>
                            <div className="list-item-left">
                              <div className="list-item-name">v{r.version}</div>
                              <div className="list-item-sub">{fmtDateTime(r.created_at)}</div>
                            </div>
                            <div className="list-item-actions">
                              <Label status={r.release_channel} />
                              <Label status={r.status} />
                              {r.review_state && <Label status={r.review_state} />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─────────────────── PUBLISHER ─────────────────────────── */}
            {page === 'publisher' && (
              <div>
                {publisherProfile && (
                  <div className="profile-hero">
                    <div className="profile-avatar-lg">{getInitials(publisherProfile.display_name)}</div>
                    <div style={{ flex: 1 }}>
                      <div className="profile-name">{publisherProfile.display_name}</div>
                      <div className="profile-slug">{publisherProfile.slug}</div>
                      <div className="profile-badges">
                        {(() => { const l = getPublisherLabel(publisherProfile.trust_tier, publisherProfile.slug); return <span className={`label ${l.cls}`}>{l.text}</span>; })()}
                        <Label status={publisherProfile.verification_status} />
                        <Label status={publisherProfile.active ? 'active' : 'suspended'} />
                      </div>
                    </div>
                    <div className="col" style={{ gap: 6 }}>
                      <button className="btn btn-gold btn-sm" disabled={isBusy(`pub-official-${publisherProfile.slug}`)} onClick={() => setPublisherOfficial(publisherProfile.slug, true)}>★ Mark Official</button>
                      <button className="btn btn-ghost btn-sm" disabled={isBusy(`pub-official-${publisherProfile.slug}`)} onClick={() => setPublisherOfficial(publisherProfile.slug, false)}>Remove Official</button>
                    </div>
                  </div>
                )}

                <div className="grid-2">
                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">Publisher memberships</div>
                      <button className="btn btn-secondary btn-sm" disabled={isBusy('pub-profile')} onClick={loadPublisherProfile}>
                        {isBusy('pub-profile') ? <Spinner /> : '⟳ Load'}
                      </button>
                    </div>
                    <div className="panel-body" style={{ padding: 0 }}>
                      {publisherAccess.length === 0 ? (
                        <div className="empty-state"><div className="empty-sub">No memberships loaded.</div></div>
                      ) : (
                        <div className="stack" style={{ padding: 12, gap: 8 }}>
                          {publisherAccess.map(a => (
                            <div className="list-item" key={`${a.publisher_slug}-${a.auth_mode}`}>
                              <div className="list-item-left">
                                <div className="list-item-name">{a.display_name}</div>
                                <div className="list-item-sub">{a.publisher_slug}</div>
                              </div>
                              <div className="list-item-actions"><Label status={a.role} /><Label status={a.auth_mode} /></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-header"><div className="panel-title">Bootstrap access</div></div>
                    <div className="panel-body">
                      <div className="alert alert-info">Use this once to grant your logged-in account publisher access via the Publisher API key.</div>
                      <div className="form-field">
                        <label className="form-label">Role</label>
                        <select className="form-select" value={bootstrapRole} onChange={e => setBootstrapRole(e.target.value)}>
                          <option value="owner">owner</option>
                          <option value="admin">admin</option>
                          <option value="member">member</option>
                        </select>
                      </div>
                      <button className="btn btn-primary btn-full" disabled={isBusy('bootstrap')} onClick={bootstrapMembership}>
                        {isBusy('bootstrap') ? <><Spinner /> Granting…</> : 'Grant my account access'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─────────────────── MEMBERS ───────────────────────────── */}
            {page === 'members' && (
              <div className="grid-2">
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-title">Team members</div>
                    <button className="btn btn-secondary btn-sm" disabled={isBusy('members')} onClick={loadMembers}>{isBusy('members') ? <Spinner /> : '⟳'}</button>
                  </div>
                  <div className="panel-body" style={{ padding: 0 }}>
                    {members.length === 0 ? (
                      <div className="empty-state"><div className="empty-icon">◈</div><div className="empty-title">No members loaded</div></div>
                    ) : (
                      <div className="stack" style={{ padding: 12, gap: 8 }}>
                        {members.map(m => (
                          <div className="list-item" key={m.id}>
                            <div className="list-item-left">
                              <div className="list-item-name">{m.username || m.email || m.user_id}</div>
                              <div className="list-item-sub">{m.email || ''} · {fmtDate(m.updated_at)}</div>
                            </div>
                            <div className="list-item-actions"><Label status={m.role} /><Label status={m.status} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header"><div className="panel-title">Invite member</div></div>
                  <div className="panel-body">
                    <form onSubmit={handleCreateInvitation}>
                      <div className="form-field">
                        <label className="form-label">Email</label>
                        <input className="form-input" type="email" required value={invitationForm.email} onChange={e => setInvitationForm(p => ({ ...p, email: e.target.value }))} />
                      </div>
                      <div className="form-grid">
                        <div className="form-field" style={{ margin: 0 }}>
                          <label className="form-label">Role</label>
                          <select className="form-select" value={invitationForm.role} onChange={e => setInvitationForm(p => ({ ...p, role: e.target.value }))}>
                            <option value="member">member</option>
                            <option value="admin">admin</option>
                            <option value="owner">owner</option>
                          </select>
                        </div>
                        <div className="form-field" style={{ margin: 0 }}>
                          <label className="form-label">Expires (days)</label>
                          <input className="form-input" type="number" min={1} max={30} value={invitationForm.expiresInDays} onChange={e => setInvitationForm(p => ({ ...p, expiresInDays: Number(e.target.value) }))} />
                        </div>
                      </div>
                      <div className="form-field">
                        <label className="form-label">Notes</label>
                        <textarea className="form-textarea" rows={2} value={invitationForm.notes} onChange={e => setInvitationForm(p => ({ ...p, notes: e.target.value }))} />
                      </div>
                      <button className="btn btn-primary btn-full" type="submit" disabled={isBusy('invite')}>
                        {isBusy('invite') ? <><Spinner /> Sending…</> : '✉ Send invitation'}
                      </button>
                    </form>
                  </div>

                  {invitations.length > 0 && (
                    <>
                      <div className="divider" style={{ margin: '0 18px' }} />
                      <div style={{ padding: '0 12px 12px' }}>
                        <div className="section-title" style={{ padding: '12px 6px 8px' }}>Pending invitations</div>
                        <div className="stack" style={{ gap: 6 }}>
                          {invitations.map(inv => (
                            <div className="list-item" key={inv.id}>
                              <div className="list-item-left">
                                <div className="list-item-name">{inv.email}</div>
                                <div className="list-item-sub">Expires {fmtDate(inv.expires_at)}</div>
                              </div>
                              <div className="list-item-actions"><Label status={inv.role} /><Label status={inv.status} /></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────── REVIEWS ───────────────────────────── */}
            {page === 'reviews' && (
              <div>
                {reviewSummary && (
                  <div className="metrics-grid" style={{ marginBottom: 18 }}>
                    {[
                      { label: 'Total in queue', value: reviewSummary.total, color: 'var(--accent)' },
                      ...Object.entries(reviewSummary.by_review_state ?? {}).map(([k, v]) => ({ label: k, value: v, color: 'var(--violet)' })),
                      ...Object.entries(reviewSummary.by_risk_level ?? {}).slice(0, 2).map(([k, v]) => ({ label: `Risk: ${k}`, value: v, color: k === 'high' ? 'var(--red)' : 'var(--gold)' })),
                    ].slice(0, 6).map(m => (
                      <div className="metric-card" key={m.label} style={{ '--metric-accent': m.color } as React.CSSProperties}>
                        <div className="metric-label">{m.label}</div>
                        <div className="metric-value">{m.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">Release moderation queue</div>
                      <div className="panel-subtitle">{reviewQueue.length} items</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" disabled={isBusy('reviews')} onClick={loadReviews}>{isBusy('reviews') ? <Spinner /> : '⟳ Refresh'}</button>
                  </div>
                  {reviewQueue.length === 0 ? (
                    <div className="empty-state"><div className="empty-icon">⟳</div><div className="empty-title">Queue is empty</div><div className="empty-sub">All releases have been reviewed.</div></div>
                  ) : (
                    <div className="table-wrap" style={{ borderRadius: 0, border: 'none', borderTop: '1px solid var(--border-subtle)' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Plugin</th>
                            <th>Publisher</th>
                            <th>Version</th>
                            <th>Channel</th>
                            <th>Risk</th>
                            <th>State</th>
                            <th>Age</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reviewQueue.map(item => (
                            <tr key={item.release_id}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{item.plugin_display_name}</div>
                                <div className="table-mono">{item.plugin_key}</div>
                              </td>
                              <td className="table-muted">{item.publisher || '—'}</td>
                              <td><span className="table-mono">v{item.version}</span></td>
                              <td><Label status={item.release_channel} /></td>
                              <td><Label status={item.risk_level} /></td>
                              <td><Label status={item.review_state} /></td>
                              <td className="table-muted">{item.queue_age_hours.toFixed(1)}h</td>
                              <td>
                                <div className="table-actions">
                                  <button className="btn btn-success btn-sm" disabled={isBusy(`review-${item.release_id}`)} onClick={() => submitReview(item.release_id, 'approve')}>✓</button>
                                  <button className="btn btn-secondary btn-sm" disabled={isBusy(`review-${item.release_id}`)} onClick={() => submitReview(item.release_id, 'request-changes')}>△</button>
                                  <button className="btn btn-danger btn-sm" disabled={isBusy(`review-${item.release_id}`)} onClick={() => submitReview(item.release_id, 'reject')}>✕</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────── USERS ─────────────────────────────── */}
            {page === 'users' && (
              <div>
                <div className="toolbar">
                  <div className="search-bar">
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>⌕</span>
                    <input placeholder="Search users…" value={userSearch} onChange={e => setUserSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadUsers()} />
                  </div>
                  <div className="filter-chips">
                    {['all', 'active', 'suspended', 'banned', 'pending'].map(f => (
                      <button key={f} className={`filter-chip${userStatusFilter === f ? ' active' : ''}`} onClick={() => { setUserStatusFilter(f); }}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="spacer" />
                  <button className="btn btn-secondary btn-sm" disabled={isBusy('users')} onClick={loadUsers}>{isBusy('users') ? <Spinner /> : '⟳ Search'}</button>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <div className="panel-title">All users</div>
                      <div className="panel-subtitle">{adminUsersTotal} total</div>
                    </div>
                    <button className="btn btn-export btn-sm" onClick={() => exportCsv('users.csv', ['ID','Username','Email','Status','Created'], adminUsers.map(u => [u.id, u.username, u.email, u.status, u.created_at ?? '']))}>
                      ↓ Export
                    </button>
                  </div>
                  {adminUsers.length === 0 ? (
                    <div className="empty-state">
                      {isBusy('users') ? <><Spinner /><div className="empty-sub">Loading users…</div></> : <><div className="empty-icon">◎</div><div className="empty-title">No users loaded</div><div className="empty-sub">Click Search to load users.</div></>}
                    </div>
                  ) : (
                    <div className="table-wrap" style={{ borderRadius: 0, border: 'none', borderTop: '1px solid var(--border-subtle)' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminUsers.map(u => (
                            <tr key={u.id}>
                              <td>
                                <div className="row" style={{ gap: 10 }}>
                                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${pluginColor(u.id)}, ${pluginColor(u.username)})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0, fontFamily: 'var(--font-display)' }}>
                                    {getInitials(u.username)}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{u.username}</div>
                                    <div className="table-mono" style={{ fontSize: 10 }}>{u.id.slice(0, 8)}…</div>
                                  </div>
                                </div>
                              </td>
                              <td className="table-muted">{u.email}</td>
                              <td><Label status={u.status} /></td>
                              <td className="table-muted">{fmtDate(u.created_at)}</td>
                              <td>
                                <div className="table-actions">
                                  {u.status !== 'active' && (
                                    <button className="btn btn-success btn-sm" disabled={isBusy(`user-${u.id}`)} onClick={() => updateUserStatus(u.id, 'active')}>Activate</button>
                                  )}
                                  {u.status !== 'suspended' && (
                                    <button className="btn btn-secondary btn-sm" disabled={isBusy(`user-${u.id}`)} onClick={() => updateUserStatus(u.id, 'suspended')}>Suspend</button>
                                  )}
                                  {u.status !== 'banned' && (
                                    <button className="btn btn-danger btn-sm" disabled={isBusy(`user-${u.id}`)} onClick={() => setConfirmAction({ label: `Ban user "${u.username}"? This will prevent them from logging in.`, onConfirm: () => updateUserStatus(u.id, 'banned') })}>Ban</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────── SETTINGS ──────────────────────────── */}
            {page === 'settings' && (
              <div className="stack">
                <div className="panel">
                  <div className="panel-header"><div className="panel-title">Connection settings</div></div>
                  <div className="panel-body">
                    <div className="form-field">
                      <label className="form-label">Backend URL</label>
                      <input className="form-input" value={config.apiBaseUrl} onChange={e => setConfig(p => ({ ...p, apiBaseUrl: e.target.value }))} placeholder="http://localhost:45111" />
                      <span className="form-help">The Local Studio backend API base URL.</span>
                    </div>
                    <div className="divider" />
                    <div className="form-field">
                      <label className="form-label">Admin API key</label>
                      <input className="form-input" type="password" value={config.adminApiKey} onChange={e => setConfig(p => ({ ...p, adminApiKey: e.target.value }))} placeholder="local-studio-backend-admin" />
                      <span className="form-help">Sent as X-Marketplace-Admin-Key. Required for admin operations.</span>
                    </div>
                    <div className="divider" />
                    <div className="form-grid">
                      <div className="form-field" style={{ margin: 0 }}>
                        <label className="form-label">Publisher slug</label>
                        <input className="form-input" value={config.publisherSlug} onChange={e => setConfig(p => ({ ...p, publisherSlug: e.target.value }))} />
                      </div>
                      <div className="form-field" style={{ margin: 0 }}>
                        <label className="form-label">Publisher API key</label>
                        <input className="form-input" type="password" value={config.publisherApiKey} onChange={e => setConfig(p => ({ ...p, publisherApiKey: e.target.value }))} />
                      </div>
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <div className="alert alert-success">Settings are saved automatically to localStorage.</div>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header"><div className="panel-title">Session</div></div>
                  <div className="panel-body">
                    <div className="detail-row"><span className="detail-key">User</span><span className="detail-val">{session.user?.username ?? '—'}</span></div>
                    <div className="detail-row"><span className="detail-key">Email</span><span className="detail-val">{session.user?.email ?? '—'}</span></div>
                    <div className="detail-row"><span className="detail-key">User ID</span><span className="detail-val-mono">{session.user?.id ?? '—'}</span></div>
                    <div className="detail-row"><span className="detail-key">Session</span><span className="detail-val-mono">{session.sessionId || '—'}</span></div>
                    <div className="detail-row"><span className="detail-key">Expires</span><span className="detail-val">{fmtDateTime(session.expiresAt) || '—'}</span></div>
                    <div style={{ marginTop: 16 }}>
                      <button className="btn btn-danger" disabled={isBusy('logout')} onClick={handleLogout}>
                        {isBusy('logout') ? <><Spinner /> Signing out…</> : '→ Sign out'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header"><div className="panel-title">Export data</div></div>
                  <div className="panel-body">
                    <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                      <button className="btn btn-export" onClick={() => exportCsv('plugins.csv', ['ID','Key','Name','Publisher','Trust','Visibility'], plugins.map(p => [p.id, p.plugin_key, p.display_name, p.publisher_slug, p.trust_level, p.visibility]))}>
                        ↓ Plugins CSV
                      </button>
                      <button className="btn btn-export" onClick={() => exportCsv('releases.csv', ['ID','Plugin','Version','Status','Channel','Created'], releases.map(r => [r.id, r.plugin_key, r.version, r.status, r.release_channel ?? '', r.created_at ?? '']))}>
                        ↓ Releases CSV
                      </button>
                      <button className="btn btn-export" onClick={() => exportCsv('users.csv', ['ID','Username','Email','Status','Created'], adminUsers.map(u => [u.id, u.username, u.email, u.status, u.created_at ?? '']))}>
                        ↓ Users CSV
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowConfigModal(false)}>
          <div className="modal">
            <div className="modal-header"><div className="modal-title">Connection settings</div></div>
            <div className="modal-body">
              <div className="form-field">
                <label className="form-label">Backend URL</label>
                <input className="form-input" value={config.apiBaseUrl} onChange={e => setConfig(p => ({ ...p, apiBaseUrl: e.target.value }))} placeholder="http://localhost:45111" />
              </div>
              <div className="form-field">
                <label className="form-label">Admin API key</label>
                <input className="form-input" type="password" value={config.adminApiKey} onChange={e => setConfig(p => ({ ...p, adminApiKey: e.target.value }))} />
              </div>
              <div className="form-grid">
                <div className="form-field" style={{ margin: 0 }}>
                  <label className="form-label">Publisher slug</label>
                  <input className="form-input" value={config.publisherSlug} onChange={e => setConfig(p => ({ ...p, publisherSlug: e.target.value }))} />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label className="form-label">Publisher API key</label>
                  <input className="form-input" type="password" value={config.publisherApiKey} onChange={e => setConfig(p => ({ ...p, publisherApiKey: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowConfigModal(false)}>Close</button>
              <button className="btn btn-primary" onClick={() => { setShowConfigModal(false); toast('success', 'Settings saved.'); }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showPluginModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPluginModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header"><div className="modal-title">Create plugin</div></div>
            <div className="modal-body">
              <form id="plugin-form" onSubmit={handleSavePlugin}>
                <div className="form-grid">
                  <div className="form-field" style={{ margin: 0 }}>
                    <label className="form-label">Plugin key *</label>
                    <input className="form-input" required value={pluginForm.pluginKey} onChange={e => setPluginForm(p => ({ ...p, pluginKey: e.target.value }))} placeholder="vendor.name.plugin" />
                  </div>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label className="form-label">Display name *</label>
                    <input className="form-input" required value={pluginForm.displayName} onChange={e => setPluginForm(p => ({ ...p, displayName: e.target.value }))} />
                  </div>
                </div>
                <div className="form-field" style={{ marginTop: 12 }}>
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" rows={2} value={pluginForm.description} onChange={e => setPluginForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label className="form-label">Trust level</label>
                    <select className="form-select" value={pluginForm.trustLevel} onChange={e => setPluginForm(p => ({ ...p, trustLevel: e.target.value }))}>
                      <option value="community">community</option>
                      <option value="verified">verified</option>
                      <option value="trusted">trusted</option>
                    </select>
                  </div>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label className="form-label">Visibility</label>
                    <select className="form-select" value={pluginForm.visibility} onChange={e => setPluginForm(p => ({ ...p, visibility: e.target.value }))}>
                      <option value="public">public</option>
                      <option value="private">private</option>
                    </select>
                  </div>
                </div>
                <div className="form-field" style={{ marginTop: 12 }}>
                  <label className="form-label">Tags (comma-separated)</label>
                  <input className="form-input" value={pluginForm.tags} onChange={e => setPluginForm(p => ({ ...p, tags: e.target.value }))} placeholder="ai, text, image" />
                </div>
              </form>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" type="button" onClick={() => { setShowPluginModal(false); setPluginForm(initialPluginForm); }}>Cancel</button>
              <button className="btn btn-primary" type="submit" form="plugin-form" disabled={isBusy('save-plugin')}>
                {isBusy('save-plugin') ? <><Spinner /> Saving…</> : 'Create plugin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmAction(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header"><div className="modal-title">Confirm action</div></div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{confirmAction.label}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} />
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-dot" />
          {t.message}
        </div>
      ))}
    </div>
  );
}
