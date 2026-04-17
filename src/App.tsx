import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { req, ApiError } from './lib/api';
import { loadState, saveState, API_BASE } from './lib/storage';
import type {
  AdminSummary, AdminUser, PublisherAccess, PublisherInvitation, PublisherMember,
  PublisherPlugin, PublisherRelease, ReviewQueueItem, ReviewQueueSummary,
  RuntimeStatus, SessionResponse, SessionUser,
} from './lib/types';

// ─── utils ────────────────────────────────────────────────────────────
type Theme = 'dark' | 'light';
type Toast = { id: number; kind: 'ok' | 'err' | 'inf'; msg: string };
type AdminPage = 'dash' | 'plugins-admin' | 'users' | 'reviews';
type UserPage  = 'profile' | 'plugins' | 'releases' | 'my-reviews';

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
  if (slug === 'local-studio' || trust === 'internal') return { cls: 'lbl-core', text: '⬡ Core' };
  if (trust === 'official' || trust === 'verified') return { cls: 'lbl-official', text: '★ Official' };
  return { cls: 'lbl-community', text: '◈ Community' };
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
  const [pubSlug, setPubSlug]     = useState(ps.publisherSlug);
  const [pubKey, setPubKey]       = useState(ps.publisherApiKey);
  const [adminKey, setAdminKey]   = useState(ps.adminApiKey);

  // pages
  const [aPage, setAPage] = useState<AdminPage>('dash');
  const [uPage, setUPage] = useState<UserPage>('plugins');

  // data
  const [summary, setSummary]         = useState<AdminSummary | null>(null);
  const [runtime, setRuntime]         = useState<RuntimeStatus | null>(null);
  const [allPlugins, setAllPlugins]   = useState<PublisherPlugin[]>([]);
  const [myPlugins, setMyPlugins]     = useState<PublisherPlugin[]>([]);
  const [releases, setReleases]       = useState<PublisherRelease[]>([]);
  const [myReleases, setMyReleases]   = useState<PublisherRelease[]>([]);
  const [members, setMembers]         = useState<PublisherMember[]>([]);
  const [invites, setInvites]         = useState<PublisherInvitation[]>([]);
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
  const [showPluginModal, setShowPluginModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [confirmCtx, setConfirmCtx]   = useState<{ title: string; body: string; onOk: () => void } | null>(null);
  const [pluginForm, setPluginForm]   = useState({ key: '', name: '', desc: '', trust: 'community', vis: 'public', surface: 'default', tags: '', cats: '', caps: '' });
  const [inviteForm, setInviteForm]   = useState({ email: '', role: 'member', notes: '', days: 7 });
  const [releaseForm, setReleaseForm] = useState({ channel: 'stable', log: '', file: null as File | null });
  const [pwForm, setPwForm]           = useState({ current: '', next: '', confirm: '' });
  const [loginForm, setLoginForm]     = useState({ ident: '', pw: '' });
  const [regForm, setRegForm]         = useState({ user: '', email: '', pw: '', pw2: '' });
  const [authTab, setAuthTab]         = useState<'login'|'reg'>('login');
  const [bootstrapRole, setBootstrapRole] = useState('owner');

  const isAdmin = !!user?.is_admin;
  const isLoggedIn = !!user;

  // persist
  useEffect(() => {
    saveState({ publisherSlug: pubSlug, publisherApiKey: pubKey, adminApiKey: adminKey, accessToken, refreshToken, sessionId, expiresAt, theme, user });
  }, [pubSlug, pubKey, adminKey, accessToken, refreshToken, sessionId, expiresAt, theme, user]);

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
    return { token: accessToken, publisherSlug: pubSlug, publisherApiKey: pubKey, adminApiKey: adminKey, ...o };
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
      setSummary(null); setAllPlugins([]); setMyPlugins([]); setAdminUsers([]);
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
      const d = await req<PublisherPlugin[]>('/api/v1/publishers/plugins', auth({ pub: true }));
      setMyPlugins(d);
    });
  }
  async function savePlugin(e: FormEvent) {
    e.preventDefault();
    await run('save-plugin', async () => {
      await req<PublisherPlugin>('/api/v1/publishers/plugins', {
        method: 'POST', ...auth({ pub: true }),
        body: { plugin_key: pluginForm.key, display_name: pluginForm.name, description: pluginForm.desc || null,
          trust_level: pluginForm.trust, visibility: pluginForm.vis, product_surface: pluginForm.surface,
          tags: pluginForm.tags.split(',').map(s=>s.trim()).filter(Boolean),
          categories: pluginForm.cats.split(',').map(s=>s.trim()).filter(Boolean),
          capabilities: pluginForm.caps.split(',').map(s=>s.trim()).filter(Boolean),
          metadata: {}, install_policy: {}, update_channels: {} },
      });
      setPluginForm({ key:'',name:'',desc:'',trust:'community',vis:'public',surface:'default',tags:'',cats:'',caps:'' });
      setShowPluginModal(false);
      await loadMyPlugins();
      toast('ok', `Plugin "${pluginForm.name}" created!`);
    });
  }

  // ── USER: Releases ───────────────────────────────────────────────
  async function loadReleases(key?: string) {
    const pk = (key ?? releaseKey).trim();
    if (!pk) { toast('err', 'Enter a plugin key first.'); return; }
    await run('releases', async () => {
      const d = await req<PublisherRelease[]>(`/api/v1/publishers/plugins/${pk}/releases`, auth({ pub: true }));
      setReleases(d); if (key) setReleaseKey(key);
    });
  }
  async function uploadRelease(e: FormEvent) {
    e.preventDefault();
    if (!releaseForm.file) { toast('err', 'Select a .lspkg file first.'); return; }
    await run('upload', async () => {
      const fd = new FormData();
      fd.append('file', releaseForm.file!);
      if (releaseForm.channel) fd.append('release_channel', releaseForm.channel);
      if (releaseForm.log) fd.append('changelog', releaseForm.log);
      const r = await req<PublisherRelease>('/api/v1/publishers/releases', {
        method: 'POST', ...auth({ pub: true }), body: fd, isForm: true,
      });
      setReleaseForm(p => ({ ...p, file: null, log: '' }));
      await loadReleases(r.plugin_key);
      toast('ok', `Release v${r.version} uploaded!`);
    });
  }

  // ── USER: My Reviews (releases of my plugins) ────────────────────
  async function loadMyReleases() {
    await run('my-releases', async () => {
      // Load releases for all user's plugins
      const plugins = await req<PublisherPlugin[]>('/api/v1/publishers/plugins', auth({ pub: true }));
      setMyPlugins(plugins);
      const all: PublisherRelease[] = [];
      for (const p of plugins.slice(0, 10)) {
        try {
          const rs = await req<PublisherRelease[]>(`/api/v1/publishers/plugins/${p.plugin_key}/releases`, auth({ pub: true }));
          all.push(...rs);
        } catch {}
      }
      setMyReleases(all.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()));
    });
  }

  // ── Bootstrap ────────────────────────────────────────────────────
  async function bootstrap() {
    if (!user) { toast('err', 'Login required.'); return; }
    await run('bootstrap', async () => {
      await req('/api/v1/publishers/members', {
        method: 'POST', ...auth({ pub: true }),
        body: { user_identifier: user.email || user.username, role: bootstrapRole, status: 'active', notes: 'Bootstrapped from admin.', permissions: {} },
      });
      toast('ok', `Publisher access granted (${bootstrapRole}).`);
    });
  }

  // ── page-level loads ─────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    if (isAdmin) {
      if (aPage === 'dash') loadDash();
      if (aPage === 'plugins-admin') loadAllPlugins();
      if (aPage === 'users') loadUsers();
      if (aPage === 'reviews') loadReviews();
    } else {
      if (uPage === 'plugins') loadMyPlugins();
      if (uPage === 'releases') loadMyPlugins();
      if (uPage === 'my-reviews') loadMyReleases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aPage, uPage, isLoggedIn, isAdmin]);

  // ── filtered plugins ─────────────────────────────────────────────
  const displayPlugins = useMemo(() => {
    let list = isAdmin ? allPlugins : myPlugins;
    if (pluginFilter !== 'all') list = list.filter(p => p.trust_level === pluginFilter || (pluginFilter === 'internal' && p.internal));
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
  const adminNav = [
    { key: 'dash',         icon: '⬡', label: 'Dashboard',    section: 'Overview' },
    { key: 'plugins-admin',icon: '⊞', label: 'All Plugins',  section: 'Admin' },
    { key: 'users',        icon: '◎', label: 'Users' },
    { key: 'reviews',      icon: '⟳', label: 'Reviews', badge: reviewQueue.length > 0 ? reviewQueue.length : undefined },
  ] as const;

  const userNav = [
    { key: 'plugins',     icon: '⬡', label: 'My Plugins',   section: 'Publisher' },
    { key: 'releases',    icon: '↑', label: 'Releases' },
    { key: 'my-reviews',  icon: '⟳', label: 'Reviews' },
    { key: 'profile',     icon: '◉', label: 'Profile',       section: 'Account' },
  ] as const;

  const curPageTitle = isAdmin
    ? { dash: 'Dashboard', 'plugins-admin': 'All Plugins', users: 'User Management', reviews: 'Release Reviews' }[aPage]
    : { plugins: 'My Plugins', releases: 'Releases', 'my-reviews': 'My Reviews', profile: 'Profile' }[uPage];

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
          <button className="sidebar-footer-btn" onClick={() => setShowConfigModal(true)}>⚙ API Keys</button>
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
            {!isAdmin && uPage === 'plugins' && <button className="btn btn-primary btn-sm" onClick={() => setShowPluginModal(true)}>+ New plugin</button>}
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
                    {['all','community','verified','trusted','internal'].map(f => (
                      <button key={f} className={`chip${pluginFilter===f?' on':''}`} onClick={() => setPluginFilter(f)}>
                        {f.charAt(0).toUpperCase()+f.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="spacer" />
                  <button className="btn btn-secondary btn-sm" onClick={() => exportCsv('plugins.csv', ['ID','Key','Name','Publisher','Trust','Visibility'], displayPlugins.map(p=>[p.id,p.plugin_key,p.display_name,p.publisher_slug,p.trust_level,p.visibility]))}>↓ CSV</button>
                </div>
                {isBusy('all-plugins') && displayPlugins.length === 0
                  ? <div className="card"><div className="empty"><Spin /><div className="empty-sub">Loading…</div></div></div>
                  : displayPlugins.length === 0
                  ? <div className="card"><div className="empty"><div className="empty-icon">⬡</div><div className="empty-title">No plugins found</div></div></div>
                  : <PluginGrid plugins={displayPlugins} onReleasesClick={(pk) => { setReleaseKey(pk); toast('inf', `Switch to Releases tab to view ${pk}`); }} adminActions={(p) => (
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
                USER — MY PLUGINS
            ══════════════════════════════════════════════════════ */}
            {!isAdmin && uPage === 'plugins' && (
              <div>
                <div className="toolbar">
                  <div className="searchbar"><span className="searchbar-icon">⌕</span><input placeholder="Search my plugins…" value={pluginSearch} onChange={e => setPluginSearch(e.target.value)} /></div>
                  <div className="chips">
                    {['all','community','verified'].map(f => <button key={f} className={`chip${pluginFilter===f?' on':''}`} onClick={() => setPluginFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>)}
                  </div>
                  <div className="spacer"/>
                  <button className="btn btn-secondary btn-sm" disabled={isBusy('my-plugins')} onClick={loadMyPlugins}>{isBusy('my-plugins') ? <Spin/> : '⟳'}</button>
                </div>
                {displayPlugins.length === 0
                  ? <div className="card"><div className="empty"><div className="empty-icon">⬡</div><div className="empty-title">{myPlugins.length===0?'No plugins yet':'No results'}</div><div className="empty-sub">{myPlugins.length===0?'Create your first plugin.':'Try a different search.'}</div>{myPlugins.length===0 && <button className="btn btn-primary btn-sm" style={{marginTop:10}} onClick={() => setShowPluginModal(true)}>+ New plugin</button>}</div></div>
                  : <PluginGrid plugins={displayPlugins} onReleasesClick={(pk) => { setReleaseKey(pk); setUPage('releases'); }} />
                }
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                USER — RELEASES
            ══════════════════════════════════════════════════════ */}
            {!isAdmin && uPage === 'releases' && (
              <div className="g2">
                <div className="card">
                  <div className="card-head"><div className="card-title">Upload release</div></div>
                  <div className="card-body">
                    <form onSubmit={uploadRelease}>
                      <div className="field"><label className="field-label">Plugin key</label><input className="input" value={releaseKey} onChange={e => setReleaseKey(e.target.value)} placeholder="vendor.name.plugin" /></div>
                      <div className="field"><label className="field-label">Channel</label>
                        <select className="select" value={releaseForm.channel} onChange={e => setReleaseForm(p=>({...p,channel:e.target.value}))}>
                          <option value="stable">stable</option><option value="beta">beta</option><option value="canary">canary</option>
                        </select>
                      </div>
                      <div className="field"><label className="field-label">Changelog</label><textarea className="textarea" rows={3} value={releaseForm.log} onChange={e => setReleaseForm(p=>({...p,log:e.target.value}))} placeholder="What changed…" /></div>
                      <div className="field">
                        <label className="field-label">Package file (.lspkg)</label>
                        <input className="input" type="file" accept=".lspkg,.zip" style={{padding:'7px 10px',fontSize:12}} onChange={e => setReleaseForm(p=>({...p,file:e.target.files?.[0]??null}))} />
                      </div>
                      <button className="btn btn-primary btn-full" type="submit" disabled={isBusy('upload')||!releaseForm.file}>{isBusy('upload') ? <><Spin/> Uploading…</> : '↑ Upload release'}</button>
                    </form>
                    {myPlugins.length > 0 && (
                      <div style={{marginTop:14}}>
                        <div style={{fontSize:11,color:'var(--txt-3)',marginBottom:8}}>Quick-load from your plugins:</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                          {myPlugins.map(p => <button key={p.id} className="chip" onClick={() => { setReleaseKey(p.plugin_key); loadReleases(p.plugin_key); }}>{p.plugin_key}</button>)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="card">
                  <div className="card-head">
                    <div><div className="card-title">Release history</div><div className="card-sub">{releaseKey||'Select a plugin'}</div></div>
                    <button className="btn btn-secondary btn-sm" disabled={isBusy('releases')} onClick={() => loadReleases()}>{isBusy('releases') ? <Spin/> : '⟳'}</button>
                  </div>
                  <div style={{padding:'0 0'}}>
                    {releases.length === 0
                      ? <div className="empty"><div className="empty-icon">↑</div><div className="empty-title">No releases loaded</div><div className="empty-sub">Enter a plugin key and refresh.</div></div>
                      : <div style={{padding:12,display:'flex',flexDirection:'column',gap:8}}>
                          {releases.map(r => (
                            <div className="li" key={r.id}>
                              <div className="li-left"><div className="li-name">v{r.version}</div><div className="li-sub">{fmtDT(r.created_at)}</div></div>
                              <div className="li-actions"><Lbl v={r.release_channel}/><Lbl v={r.status}/>{r.review_state&&<Lbl v={r.review_state}/>}</div>
                            </div>
                          ))}
                        </div>
                    }
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════
                USER — MY REVIEWS
            ══════════════════════════════════════════════════════ */}
            {!isAdmin && uPage === 'my-reviews' && (
              <div>
                <div className="toolbar">
                  <div className="spacer"/>
                  <button className="btn btn-secondary btn-sm" disabled={isBusy('my-releases')} onClick={loadMyReleases}>{isBusy('my-releases') ? <Spin/> : '⟳ Refresh'}</button>
                </div>
                <div className="card">
                  <div className="card-head"><div><div className="card-title">Release reviews</div><div className="card-sub">Review status for all your plugin releases</div></div></div>
                  {myReleases.length === 0
                    ? <div className="empty">{isBusy('my-releases') ? <><Spin/><div className="empty-sub">Loading…</div></> : <><div className="empty-icon">⟳</div><div className="empty-title">No releases yet</div><div className="empty-sub">Upload releases to see their review status.</div></>}</div>
                    : <div className="tbl-wrap"><table className="tbl">
                        <thead><tr><th>Plugin</th><th>Version</th><th>Channel</th><th>Status</th><th>Review</th><th>Published</th></tr></thead>
                        <tbody>
                          {myReleases.map(r => (
                            <tr key={r.id}>
                              <td><span className="tbl-mono">{r.plugin_key}</span></td>
                              <td><span className="tbl-mono">v{r.version}</span></td>
                              <td><Lbl v={r.release_channel}/></td>
                              <td><Lbl v={r.status}/></td>
                              <td>{r.review_state ? <Lbl v={r.review_state}/> : <span className="tbl-muted">—</span>}</td>
                              <td className="tbl-muted">{fmtDate(r.approved_at||r.created_at)}</td>
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

                {/* Publisher bootstrap for regular users */}
                <div className="card">
                  <div className="card-head"><div><div className="card-title">Publisher access</div><div className="card-sub">Link your account to a publisher to upload plugins</div></div></div>
                  <div className="card-body">
                    <div className="alert alert-info">Use this once with the Publisher API key to gain publisher access. After that you can manage plugins.</div>
                    <div className="row" style={{gap:10}}>
                      <select className="select" style={{width:140}} value={bootstrapRole} onChange={e => setBootstrapRole(e.target.value)}>
                        <option value="owner">owner</option><option value="admin">admin</option><option value="member">member</option>
                      </select>
                      <button className="btn btn-primary" disabled={isBusy('bootstrap')} onClick={bootstrap}>{isBusy('bootstrap') ? <><Spin/> Granting…</> : 'Grant access'}</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ════ MODALS ════ */}

      {/* Create plugin modal */}
      {showPluginModal && (
        <div className="overlay" onClick={e => e.target===e.currentTarget && setShowPluginModal(false)}>
          <div className="modal" style={{maxWidth:560}}>
            <div className="modal-head"><div className="modal-title">Create new plugin</div></div>
            <div className="modal-body">
              <form id="pf" onSubmit={savePlugin}>
                <div className="grid2-form" style={{marginBottom:12}}>
                  <div className="field" style={{margin:0}}><label className="field-label">Plugin key *</label><input className="input" required value={pluginForm.key} onChange={e => setPluginForm(p=>({...p,key:e.target.value}))} placeholder="vendor.category.name" /></div>
                  <div className="field" style={{margin:0}}><label className="field-label">Display name *</label><input className="input" required value={pluginForm.name} onChange={e => setPluginForm(p=>({...p,name:e.target.value}))} /></div>
                </div>
                <div className="field"><label className="field-label">Description</label><textarea className="textarea" rows={2} value={pluginForm.desc} onChange={e => setPluginForm(p=>({...p,desc:e.target.value}))} /></div>
                <div className="grid2-form" style={{marginBottom:12}}>
                  <div className="field" style={{margin:0}}><label className="field-label">Trust level</label>
                    <select className="select" value={pluginForm.trust} onChange={e => setPluginForm(p=>({...p,trust:e.target.value}))}>
                      <option value="community">community</option><option value="verified">verified</option><option value="trusted">trusted</option>
                    </select>
                  </div>
                  <div className="field" style={{margin:0}}><label className="field-label">Visibility</label>
                    <select className="select" value={pluginForm.vis} onChange={e => setPluginForm(p=>({...p,vis:e.target.value}))}>
                      <option value="public">public</option><option value="private">private</option>
                    </select>
                  </div>
                </div>
                <div className="field"><label className="field-label">Tags (comma-separated)</label><input className="input" value={pluginForm.tags} onChange={e => setPluginForm(p=>({...p,tags:e.target.value}))} placeholder="ai, text, image" /></div>
              </form>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowPluginModal(false)}>Cancel</button>
              <button className="btn btn-primary" form="pf" type="submit" disabled={isBusy('save-plugin')}>{isBusy('save-plugin') ? <><Spin/> Saving…</> : 'Create plugin'}</button>
            </div>
          </div>
        </div>
      )}

      {/* API Keys modal */}
      {showConfigModal && (
        <div className="overlay" onClick={e => e.target===e.currentTarget && setShowConfigModal(false)}>
          <div className="modal">
            <div className="modal-head"><div className="modal-title">API Keys & Configuration</div></div>
            <div className="modal-body">
              <div className="alert alert-info">Backend URL is fixed to <code style={{fontFamily:'monospace',fontSize:12}}>{API_BASE}</code></div>
              <div className="field"><label className="field-label">Admin API key</label><input className="input" type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)} placeholder="local-studio-backend-admin" /><span className="field-hint">Required for admin operations (X-Marketplace-Admin-Key).</span></div>
              <div className="sep"/>
              <div className="grid2-form">
                <div className="field" style={{margin:0}}><label className="field-label">Publisher slug</label><input className="input" value={pubSlug} onChange={e => setPubSlug(e.target.value)} /></div>
                <div className="field" style={{margin:0}}><label className="field-label">Publisher API key</label><input className="input" type="password" value={pubKey} onChange={e => setPubKey(e.target.value)} /></div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowConfigModal(false)}>Close</button>
              <button className="btn btn-primary" onClick={() => { setShowConfigModal(false); toast('ok', 'Keys saved.'); }}>Save</button>
            </div>
          </div>
        </div>
      )}

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

// ─── Plugin grid component ────────────────────────────────────────
function PluginGrid({ plugins, onReleasesClick, adminActions }: {
  plugins: PublisherPlugin[];
  onReleasesClick: (key: string) => void;
  adminActions?: (p: PublisherPlugin) => React.ReactNode;
}) {
  return (
    <div className="g-auto">
      {plugins.map(p => {
        const color = pluginColor(p.plugin_key);
        const pl = publisherLabel(undefined, p.publisher_slug);
        const { cls: vCls, text: vTxt } = statusLbl(p.visibility);
        return (
          <div className="plugin-card" key={p.id}>
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
