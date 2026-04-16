import { FormEvent, useEffect, useMemo, useState } from 'react';
import './styles.css';
import { apiRequest, ApiError, buildUrl } from './lib/api';
import { loadPersistedState, savePersistedState } from './lib/storage';
import type {
  AdminSummary,
  PublisherAccess,
  PublisherInvitation,
  PublisherMember,
  PublisherPlugin,
  PublisherProfile,
  PublisherRelease,
  ReviewQueueItem,
  ReviewQueueSummary,
  RuntimeStatus,
  SessionResponse,
  SessionStatusResponse,
  SessionUser,
} from './lib/types';

type TabKey = 'auth' | 'publisher' | 'plugins' | 'releases' | 'members' | 'reviews';

type Toast = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

type ConfigState = {
  apiBaseUrl: string;
  publisherSlug: string;
  publisherApiKey: string;
  adminApiKey: string;
};

type SessionState = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: string;
  user: SessionUser | null;
};

type PluginFormState = {
  pluginKey: string;
  displayName: string;
  description: string;
  homepageUrl: string;
  documentationUrl: string;
  trustLevel: string;
  visibility: string;
  productSurface: string;
  tags: string;
  categories: string;
  capabilities: string;
};

type InvitationFormState = {
  email: string;
  role: string;
  notes: string;
  expiresInDays: number;
};

const defaultPersistedState = loadPersistedState();

const initialPluginForm: PluginFormState = {
  pluginKey: '',
  displayName: '',
  description: '',
  homepageUrl: '',
  documentationUrl: '',
  trustLevel: 'community',
  visibility: 'public',
  productSurface: 'default',
  tags: '',
  categories: '',
  capabilities: '',
};

const initialInvitationForm: InvitationFormState = {
  email: '',
  role: 'member',
  notes: '',
  expiresInDays: 7,
};

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusTone(value?: string | null): string {
  const normalized = String(value || '').toLowerCase();
  if (['approved', 'active', 'healthy', 'verified', 'ready', 'public', 'accepted'].includes(normalized)) return 'ok';
  if (['rejected', 'failed', 'error', 'quarantined', 'revoked', 'declined', 'private'].includes(normalized)) return 'danger';
  return 'warn';
}

function badge(value?: string | null): JSX.Element {
  return <span className={`badge badge-${statusTone(value)}`}>{value || 'unknown'}</span>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error.';
}

async function runSafely<T>(operation: () => Promise<T>, setToast: (toast: Toast) => void, successMessage?: string): Promise<T | null> {
  try {
    const result = await operation();
    if (successMessage) setToast({ kind: 'success', message: successMessage });
    return result;
  } catch (error) {
    setToast({ kind: 'error', message: getErrorMessage(error) });
    return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('auth');
  const [toast, setToast] = useState<Toast | null>(null);
  const [busyKey, setBusyKey] = useState('');

  const [config, setConfig] = useState<ConfigState>({
    apiBaseUrl: defaultPersistedState.apiBaseUrl,
    publisherSlug: defaultPersistedState.publisherSlug,
    publisherApiKey: defaultPersistedState.publisherApiKey,
    adminApiKey: defaultPersistedState.adminApiKey,
  });
  const [session, setSession] = useState<SessionState>({
    accessToken: defaultPersistedState.accessToken,
    refreshToken: defaultPersistedState.refreshToken,
    sessionId: defaultPersistedState.sessionId,
    expiresAt: defaultPersistedState.expiresAt,
    user: defaultPersistedState.user,
  });

  const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '', deviceLabel: 'Local Studio Admin Frontend' });
  const [loginForm, setLoginForm] = useState({ usernameOrEmail: '', password: '', deviceLabel: 'Local Studio Admin Frontend' });
  const [pluginForm, setPluginForm] = useState<PluginFormState>(initialPluginForm);
  const [invitationForm, setInvitationForm] = useState<InvitationFormState>(initialInvitationForm);
  const [bootstrapRole, setBootstrapRole] = useState('owner');
  const [releasePluginKey, setReleasePluginKey] = useState('');
  const [releaseChannel, setReleaseChannel] = useState('stable');
  const [releaseChangelog, setReleaseChangelog] = useState('');
  const [releaseFile, setReleaseFile] = useState<File | null>(null);

  const [accountPayload, setAccountPayload] = useState<unknown>(session.user ? { user: session.user, sessionId: session.sessionId, expiresAt: session.expiresAt } : null);
  const [publisherAccessList, setPublisherAccessList] = useState<PublisherAccess[]>([]);
  const [publisherProfile, setPublisherProfile] = useState<PublisherProfile | null>(null);
  const [plugins, setPlugins] = useState<PublisherPlugin[]>([]);
  const [releases, setReleases] = useState<PublisherRelease[]>([]);
  const [members, setMembers] = useState<PublisherMember[]>([]);
  const [invitations, setInvitations] = useState<PublisherInvitation[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewQueueSummary | null>(null);
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);

  useEffect(() => {
    savePersistedState({ ...config, ...session });
  }, [config, session]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const sessionLabel = useMemo(() => {
    if (!session.user) return 'Not logged in';
    return `${session.user.username} · ${session.user.email}`;
  }, [session.user]);

  const apiBaseLabel = useMemo(() => {
    return config.apiBaseUrl.trim() || '(relative / same origin)';
  }, [config.apiBaseUrl]);

  async function withBusy<T>(key: string, operation: () => Promise<T>): Promise<T | null> {
    setBusyKey(key);
    try {
      return await operation();
    } finally {
      setBusyKey('');
    }
  }

  function authOptions(extra?: Partial<Parameters<typeof apiRequest>[2]>) {
    return {
      token: session.accessToken,
      publisherSlug: config.publisherSlug,
      publisherApiKey: config.publisherApiKey,
      adminApiKey: config.adminApiKey,
      ...extra,
    };
  }

  function applySession(data: SessionResponse) {
    setSession({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      sessionId: data.session_id,
      expiresAt: data.expires_at,
      user: data.user,
    });
    setAccountPayload(data);
  }

  function clearSession() {
    setSession({ accessToken: '', refreshToken: '', sessionId: '', expiresAt: '', user: null });
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy(
      'register',
      async () =>
        runSafely(async () => {
          const data = await apiRequest<SessionResponse>(config.apiBaseUrl, '/api/v1/accounts/register', {
            method: 'POST',
            body: {
              username: registerForm.username,
              email: registerForm.email,
              password: registerForm.password,
              device_label: registerForm.deviceLabel || null,
            },
          });
          applySession(data);
          setActiveTab('publisher');
        }, setToast, 'Account created and session started.'),
    );
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy(
      'login',
      async () =>
        runSafely(async () => {
          const data = await apiRequest<SessionResponse>(config.apiBaseUrl, '/api/v1/accounts/login', {
            method: 'POST',
            body: {
              username_or_email: loginForm.usernameOrEmail,
              password: loginForm.password,
              device_label: loginForm.deviceLabel || null,
            },
          });
          applySession(data);
          setActiveTab('publisher');
        }, setToast, 'Logged in.'),
    );
  }

  async function refreshSessionStatus() {
    await withBusy(
      'me',
      async () =>
        runSafely(async () => {
          const data = await apiRequest<SessionStatusResponse>(config.apiBaseUrl, '/api/v1/accounts/me', authOptions());
          setSession((current) => ({
            ...current,
            sessionId: data.session_id ?? current.sessionId,
            expiresAt: data.expires_at ?? current.expiresAt,
            user: data.user ?? null,
          }));
          setAccountPayload(data);
        }, setToast),
    );
  }

  async function handleLogout() {
    await withBusy(
      'logout',
      async () =>
        runSafely(async () => {
          if (session.accessToken || session.refreshToken) {
            await apiRequest(config.apiBaseUrl, '/api/v1/accounts/logout', {
              method: 'POST',
              token: session.accessToken,
              body: { refresh_token: session.refreshToken || null },
            });
          }
          clearSession();
          setPublisherAccessList([]);
          setPublisherProfile(null);
          setPlugins([]);
          setMembers([]);
          setInvitations([]);
          setReleases([]);
          setReviewQueue([]);
          setReviewSummary(null);
          setAdminSummary(null);
          setRuntimeStatus(null);
          setAccountPayload({ ok: true, message: 'Logged out.' });
        }, setToast, 'Logged out.'),
    );
  }

  async function loadPublisherAccess() {
    await withBusy(
      'publisher-access',
      async () =>
        runSafely(async () => {
          const access = await apiRequest<PublisherAccess[]>(config.apiBaseUrl, '/api/v1/publishers/access', authOptions());
          setPublisherAccessList(access);
          return access;
        }, setToast, 'Publisher memberships loaded.'),
    );
  }

  async function loadPublisherProfile() {
    await withBusy(
      'publisher-profile',
      async () =>
        runSafely(async () => {
          const profile = await apiRequest<PublisherProfile>(config.apiBaseUrl, '/api/v1/publishers/me', {
            ...authOptions({ includePublisher: true }),
          });
          setPublisherProfile(profile);
          return profile;
        }, setToast, 'Publisher profile loaded.'),
    );
  }

  async function bootstrapMembership() {
    if (!session.user) {
      setToast({ kind: 'error', message: 'Login required before bootstrapping publisher membership.' });
      return;
    }
    if (!config.publisherApiKey.trim()) {
      setToast({ kind: 'error', message: 'Publisher API key is required for bootstrap.' });
      return;
    }

    await withBusy(
      'bootstrap-membership',
      async () =>
        runSafely(async () => {
          await apiRequest<PublisherMember>(config.apiBaseUrl, '/api/v1/publishers/members', {
            method: 'POST',
            includePublisher: true,
            publisherSlug: config.publisherSlug,
            publisherApiKey: config.publisherApiKey,
            body: {
              user_identifier: session.user?.email || session.user?.username,
              role: bootstrapRole,
              status: 'active',
              notes: 'Bootstrapped from React admin frontend.',
              permissions: {},
            },
          });
          await loadPublisherAccess();
          await loadMembers();
          setToast({ kind: 'success', message: 'Publisher membership bootstrapped. Switch to session-based publisher auth now.' });
        }, setToast),
    );
  }

  async function loadPlugins() {
    await withBusy(
      'plugins',
      async () =>
        runSafely(async () => {
          const data = await apiRequest<PublisherPlugin[]>(config.apiBaseUrl, '/api/v1/publishers/plugins', {
            ...authOptions({ includePublisher: true }),
          });
          setPlugins(data);
          return data;
        }, setToast, 'Plugins loaded.'),
    );
  }

  async function handlePluginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy(
      'save-plugin',
      async () =>
        runSafely(async () => {
          const payload = await apiRequest<PublisherPlugin>(config.apiBaseUrl, '/api/v1/publishers/plugins', {
            method: 'POST',
            ...authOptions({ includePublisher: true }),
            body: {
              plugin_key: pluginForm.pluginKey,
              display_name: pluginForm.displayName,
              description: pluginForm.description || null,
              homepage_url: pluginForm.homepageUrl || null,
              documentation_url: pluginForm.documentationUrl || null,
              trust_level: pluginForm.trustLevel,
              product_surface: pluginForm.productSurface || 'default',
              visibility: pluginForm.visibility,
              tags: parseCsv(pluginForm.tags),
              categories: parseCsv(pluginForm.categories),
              capabilities: parseCsv(pluginForm.capabilities),
              metadata: {},
              install_policy: {},
              update_channels: {},
            },
          });
          setPluginForm({ ...initialPluginForm, pluginKey: payload.plugin_key });
          setReleasePluginKey(payload.plugin_key);
          await loadPlugins();
          setToast({ kind: 'success', message: `Plugin ${payload.plugin_key} saved.` });
        }, setToast),
    );
  }

  async function loadReleases(pluginKeyOverride?: string) {
    const pluginKey = (pluginKeyOverride ?? releasePluginKey).trim();
    if (!pluginKey) {
      setToast({ kind: 'error', message: 'Choose or enter a plugin key first.' });
      return;
    }
    await withBusy(
      'releases',
      async () =>
        runSafely(async () => {
          const data = await apiRequest<PublisherRelease[]>(config.apiBaseUrl, `/api/v1/publishers/plugins/${pluginKey}/releases`, {
            ...authOptions({ includePublisher: true }),
          });
          setReleases(data);
          setReleasePluginKey(pluginKey);
          return data;
        }, setToast, 'Releases loaded.'),
    );
  }

  async function handleReleaseUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!releaseFile) {
      setToast({ kind: 'error', message: 'Pick a release file first.' });
      return;
    }

    await withBusy(
      'upload-release',
      async () =>
        runSafely(async () => {
          const formData = new FormData();
          formData.append('file', releaseFile);
          if (releaseChannel.trim()) formData.append('release_channel', releaseChannel.trim());
          if (releaseChangelog.trim()) formData.append('changelog', releaseChangelog.trim());
          const payload = await apiRequest<PublisherRelease>(config.apiBaseUrl, '/api/v1/publishers/releases', {
            method: 'POST',
            ...authOptions({ includePublisher: true }),
            body: formData,
            isFormData: true,
          });
          setReleaseFile(null);
          await loadReleases(payload.plugin_key);
          setToast({ kind: 'success', message: `Release ${payload.version} uploaded.` });
        }, setToast),
    );
  }

  async function loadMembers() {
    await withBusy(
      'members',
      async () =>
        runSafely(async () => {
          const data = await apiRequest<PublisherMember[]>(config.apiBaseUrl, '/api/v1/publishers/members', {
            ...authOptions({ includePublisher: true }),
          });
          setMembers(data);
          return data;
        }, setToast, 'Members loaded.'),
    );
  }

  async function loadInvitations() {
    await withBusy(
      'invitations',
      async () =>
        runSafely(async () => {
          const data = await apiRequest<PublisherInvitation[]>(config.apiBaseUrl, '/api/v1/publishers/invitations', {
            ...authOptions({ includePublisher: true }),
          });
          setInvitations(data);
          return data;
        }, setToast, 'Invitations loaded.'),
    );
  }

  async function handleInvitationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy(
      'create-invitation',
      async () =>
        runSafely(async () => {
          await apiRequest<PublisherInvitation>(config.apiBaseUrl, '/api/v1/publishers/invitations', {
            method: 'POST',
            ...authOptions({ includePublisher: true }),
            body: {
              email: invitationForm.email,
              role: invitationForm.role,
              notes: invitationForm.notes || null,
              permissions: {},
              expires_in_days: Number(invitationForm.expiresInDays),
            },
          });
          setInvitationForm(initialInvitationForm);
          await loadInvitations();
          setToast({ kind: 'success', message: 'Invitation created.' });
        }, setToast),
    );
  }

  async function loadReviewQueue() {
    await withBusy(
      'review-queue',
      async () =>
        runSafely(async () => {
          const [summary, queue, admin, runtime] = await Promise.all([
            apiRequest<ReviewQueueSummary>(config.apiBaseUrl, '/api/v1/admin/review-queue/summary', authOptions({ includeAdmin: true })),
            apiRequest<ReviewQueueItem[]>(config.apiBaseUrl, '/api/v1/reviews/queue', authOptions({ includeAdmin: true })),
            apiRequest<AdminSummary>(config.apiBaseUrl, '/api/v1/admin/summary', authOptions({ includeAdmin: true })),
            apiRequest<RuntimeStatus>(config.apiBaseUrl, '/api/v1/admin/runtime', authOptions({ includeAdmin: true })),
          ]);
          setReviewSummary(summary);
          setReviewQueue(queue);
          setAdminSummary(admin);
          setRuntimeStatus(runtime);
          return { summary, queue, admin, runtime };
        }, setToast, 'Admin review queue loaded.'),
    );
  }

  async function submitReviewDecision(releaseId: string, action: 'approve' | 'reject' | 'request-changes') {
    await withBusy(
      `review-${releaseId}-${action}`,
      async () =>
        runSafely(async () => {
          await apiRequest(config.apiBaseUrl, `/api/v1/reviews/${releaseId}/${action}`, {
            method: 'POST',
            ...authOptions({ includeAdmin: true }),
            body: {
              notes: `Decision sent from React admin frontend: ${action}`,
              force: false,
            },
          });
          await loadReviewQueue();
          setToast({ kind: 'success', message: `Release ${action} completed.` });
        }, setToast),
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Local Studio</p>
          <h1>Remote Admin Frontend</h1>
          <p className="sidebar-copy">Separate React project for login, publisher access, plugin management, release upload, members and admin review.</p>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">Backend</span>
          <strong>{apiBaseLabel}</strong>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">Session</span>
          <strong>{sessionLabel}</strong>
          <div className="inline-meta">
            <span>Publisher slug: {config.publisherSlug || '—'}</span>
          </div>
        </div>

        <nav className="nav-list">
          {[
            ['auth', 'Auth'],
            ['publisher', 'Publisher'],
            ['plugins', 'Plugins'],
            ['releases', 'Releases'],
            ['members', 'Members'],
            ['reviews', 'Admin reviews'],
          ].map(([key, label]) => (
            <button key={key} className={activeTab === key ? 'nav-button active' : 'nav-button'} onClick={() => setActiveTab(key as TabKey)}>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        {toast ? <div className={`toast toast-${toast.kind}`}>{toast.message}</div> : null}

        <section className="panel panel-config">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Connection</p>
              <h2>Backend and credentials</h2>
            </div>
          </div>

          <div className="config-grid">
            <label>
              <span>Backend URL</span>
              <input
                value={config.apiBaseUrl}
                onChange={(event) => setConfig((current) => ({ ...current, apiBaseUrl: event.target.value }))}
                placeholder="http://localhost:45121"
              />
            </label>
            <label>
              <span>Publisher slug</span>
              <input value={config.publisherSlug} onChange={(event) => setConfig((current) => ({ ...current, publisherSlug: event.target.value }))} />
            </label>
            <label>
              <span>Publisher API key</span>
              <input value={config.publisherApiKey} onChange={(event) => setConfig((current) => ({ ...current, publisherApiKey: event.target.value }))} />
            </label>
            <label>
              <span>Admin API key</span>
              <input value={config.adminApiKey} onChange={(event) => setConfig((current) => ({ ...current, adminApiKey: event.target.value }))} />
            </label>
          </div>

          <div className="helper-row">
            <span>Health endpoint:</span>
            <code>{buildUrl(config.apiBaseUrl, '/health')}</code>
          </div>
        </section>

        {activeTab === 'auth' ? (
          <section className="content-grid two-up">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Account</p>
                  <h2>Register</h2>
                </div>
              </div>
              <form className="stack-form" onSubmit={handleRegisterSubmit}>
                <label>
                  <span>Username</span>
                  <input required value={registerForm.username} onChange={(event) => setRegisterForm((current) => ({ ...current, username: event.target.value }))} />
                </label>
                <label>
                  <span>Email</span>
                  <input type="email" required value={registerForm.email} onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label>
                  <span>Password</span>
                  <input type="password" required value={registerForm.password} onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))} />
                </label>
                <label>
                  <span>Device label</span>
                  <input value={registerForm.deviceLabel} onChange={(event) => setRegisterForm((current) => ({ ...current, deviceLabel: event.target.value }))} />
                </label>
                <button disabled={busyKey === 'register'}>{busyKey === 'register' ? 'Creating…' : 'Create account'}</button>
              </form>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Session</p>
                  <h2>Login</h2>
                </div>
              </div>
              <form className="stack-form" onSubmit={handleLoginSubmit}>
                <label>
                  <span>Username or email</span>
                  <input required value={loginForm.usernameOrEmail} onChange={(event) => setLoginForm((current) => ({ ...current, usernameOrEmail: event.target.value }))} />
                </label>
                <label>
                  <span>Password</span>
                  <input type="password" required value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} />
                </label>
                <label>
                  <span>Device label</span>
                  <input value={loginForm.deviceLabel} onChange={(event) => setLoginForm((current) => ({ ...current, deviceLabel: event.target.value }))} />
                </label>
                <div className="row-actions">
                  <button disabled={busyKey === 'login'}>{busyKey === 'login' ? 'Signing in…' : 'Login'}</button>
                  <button type="button" className="secondary" disabled={!session.accessToken || busyKey === 'me'} onClick={refreshSessionStatus}>
                    {busyKey === 'me' ? 'Refreshing…' : 'Who am I'}
                  </button>
                  <button type="button" className="secondary" disabled={busyKey === 'logout'} onClick={handleLogout}>
                    Logout
                  </button>
                </div>
              </form>
            </article>

            <article className="panel full-span">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Payload</p>
                  <h2>Current account state</h2>
                </div>
                <div className="header-metadata">
                  {session.user ? badge(session.user.status) : badge('not logged in')}
                </div>
              </div>
              <pre className="json-box">{prettyJson(accountPayload ?? { message: 'Login or register to start.' })}</pre>
            </article>
          </section>
        ) : null}

        {activeTab === 'publisher' ? (
          <section className="content-grid two-up">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Access</p>
                  <h2>Publisher memberships</h2>
                </div>
                <button className="secondary" disabled={busyKey === 'publisher-access'} onClick={loadPublisherAccess}>
                  {busyKey === 'publisher-access' ? 'Loading…' : 'Reload'}
                </button>
              </div>
              <div className="card-list compact">
                {publisherAccessList.length ? (
                  publisherAccessList.map((item) => (
                    <div key={`${item.publisher_slug}-${item.auth_mode}`} className="list-card">
                      <div>
                        <strong>{item.display_name}</strong>
                        <div className="muted">{item.publisher_slug}</div>
                      </div>
                      <div className="badge-row">
                        {badge(item.auth_mode)}
                        {badge(item.role)}
                        {badge(item.status)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No membership loaded yet.</div>
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Profile</p>
                  <h2>Publisher profile</h2>
                </div>
                <button className="secondary" disabled={busyKey === 'publisher-profile'} onClick={loadPublisherProfile}>
                  {busyKey === 'publisher-profile' ? 'Loading…' : 'Load profile'}
                </button>
              </div>
              {publisherProfile ? (
                <div className="stacked-details">
                  <div className="detail-row"><span>Display name</span><strong>{publisherProfile.display_name}</strong></div>
                  <div className="detail-row"><span>Slug</span><strong>{publisherProfile.slug}</strong></div>
                  <div className="detail-row"><span>Verification</span>{badge(publisherProfile.verification_status)}</div>
                  <div className="detail-row"><span>Trust tier</span>{badge(publisherProfile.trust_tier)}</div>
                  <div className="detail-row"><span>Active</span>{badge(String(publisherProfile.active))}</div>
                </div>
              ) : (
                <div className="empty-state">Load the publisher profile using your session or API key.</div>
              )}
            </article>

            <article className="panel full-span">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Bootstrap</p>
                  <h2>Grant this account publisher access</h2>
                </div>
              </div>
              <div className="inline-form">
                <label>
                  <span>Bootstrap role</span>
                  <select value={bootstrapRole} onChange={(event) => setBootstrapRole(event.target.value)}>
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                  </select>
                </label>
                <button disabled={busyKey === 'bootstrap-membership'} onClick={bootstrapMembership}>
                  {busyKey === 'bootstrap-membership' ? 'Granting…' : 'Grant my account access'}
                </button>
              </div>
              <p className="helper-text">Use this once with the publisher API key to convert your logged-in account into a member of the publisher. After that, normal session auth is enough for most actions.</p>
            </article>
          </section>
        ) : null}

        {activeTab === 'plugins' ? (
          <section className="content-grid two-up">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Create or update</p>
                  <h2>Plugin metadata</h2>
                </div>
              </div>
              <form className="stack-form" onSubmit={handlePluginSubmit}>
                <label><span>Plugin key</span><input required value={pluginForm.pluginKey} onChange={(event) => setPluginForm((current) => ({ ...current, pluginKey: event.target.value }))} /></label>
                <label><span>Display name</span><input required value={pluginForm.displayName} onChange={(event) => setPluginForm((current) => ({ ...current, displayName: event.target.value }))} /></label>
                <label><span>Description</span><textarea rows={3} value={pluginForm.description} onChange={(event) => setPluginForm((current) => ({ ...current, description: event.target.value }))} /></label>
                <label><span>Homepage URL</span><input value={pluginForm.homepageUrl} onChange={(event) => setPluginForm((current) => ({ ...current, homepageUrl: event.target.value }))} /></label>
                <label><span>Documentation URL</span><input value={pluginForm.documentationUrl} onChange={(event) => setPluginForm((current) => ({ ...current, documentationUrl: event.target.value }))} /></label>
                <div className="config-grid compact-grid">
                  <label>
                    <span>Trust level</span>
                    <select value={pluginForm.trustLevel} onChange={(event) => setPluginForm((current) => ({ ...current, trustLevel: event.target.value }))}>
                      <option value="community">community</option>
                      <option value="verified">verified</option>
                      <option value="trusted">trusted</option>
                    </select>
                  </label>
                  <label>
                    <span>Visibility</span>
                    <select value={pluginForm.visibility} onChange={(event) => setPluginForm((current) => ({ ...current, visibility: event.target.value }))}>
                      <option value="public">public</option>
                      <option value="private">private</option>
                    </select>
                  </label>
                </div>
                <label><span>Product surface</span><input value={pluginForm.productSurface} onChange={(event) => setPluginForm((current) => ({ ...current, productSurface: event.target.value }))} /></label>
                <label><span>Tags (comma-separated)</span><input value={pluginForm.tags} onChange={(event) => setPluginForm((current) => ({ ...current, tags: event.target.value }))} /></label>
                <label><span>Categories (comma-separated)</span><input value={pluginForm.categories} onChange={(event) => setPluginForm((current) => ({ ...current, categories: event.target.value }))} /></label>
                <label><span>Capabilities (comma-separated)</span><input value={pluginForm.capabilities} onChange={(event) => setPluginForm((current) => ({ ...current, capabilities: event.target.value }))} /></label>
                <button disabled={busyKey === 'save-plugin'}>{busyKey === 'save-plugin' ? 'Saving…' : 'Save plugin'}</button>
              </form>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Current catalog</p>
                  <h2>Publisher plugins</h2>
                </div>
                <button className="secondary" disabled={busyKey === 'plugins'} onClick={loadPlugins}>
                  {busyKey === 'plugins' ? 'Loading…' : 'Reload'}
                </button>
              </div>
              <div className="card-list">
                {plugins.length ? (
                  plugins.map((plugin) => (
                    <div key={plugin.id} className="list-card">
                      <div>
                        <strong>{plugin.display_name}</strong>
                        <div className="muted">{plugin.plugin_key}</div>
                        <div className="muted">Tags: {plugin.tags.join(', ') || '—'}</div>
                      </div>
                      <div className="badge-row">
                        {badge(plugin.trust_level)}
                        {badge(plugin.visibility)}
                        <button
                          className="ghost"
                          onClick={() => {
                            setReleasePluginKey(plugin.plugin_key);
                            setPluginForm((current) => ({ ...current, pluginKey: plugin.plugin_key, displayName: plugin.display_name }));
                            setActiveTab('releases');
                          }}
                        >
                          Use for releases
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No plugins created yet.</div>
                )}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === 'releases' ? (
          <section className="content-grid two-up">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Upload</p>
                  <h2>New release</h2>
                </div>
              </div>
              <form className="stack-form" onSubmit={handleReleaseUpload}>
                <label>
                  <span>Plugin key</span>
                  <input value={releasePluginKey} onChange={(event) => setReleasePluginKey(event.target.value)} placeholder="my.plugin.key" />
                </label>
                <label>
                  <span>Release channel</span>
                  <select value={releaseChannel} onChange={(event) => setReleaseChannel(event.target.value)}>
                    <option value="stable">stable</option>
                    <option value="beta">beta</option>
                    <option value="canary">canary</option>
                  </select>
                </label>
                <label>
                  <span>Changelog</span>
                  <textarea rows={4} value={releaseChangelog} onChange={(event) => setReleaseChangelog(event.target.value)} />
                </label>
                <label>
                  <span>Package file</span>
                  <input type="file" onChange={(event) => setReleaseFile(event.target.files?.[0] ?? null)} />
                </label>
                <button disabled={busyKey === 'upload-release'}>{busyKey === 'upload-release' ? 'Uploading…' : 'Upload release'}</button>
              </form>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">History</p>
                  <h2>Releases by plugin</h2>
                </div>
                <button className="secondary" disabled={busyKey === 'releases'} onClick={() => loadReleases()}>
                  {busyKey === 'releases' ? 'Loading…' : 'Load releases'}
                </button>
              </div>
              <div className="card-list">
                {releases.length ? (
                  releases.map((release) => (
                    <div key={release.id} className="list-card">
                      <div>
                        <strong>{release.version}</strong>
                        <div className="muted">{release.plugin_key}</div>
                        <div className="muted">Created: {formatDate(release.created_at)}</div>
                      </div>
                      <div className="badge-row">
                        {badge(release.status)}
                        {badge(release.review_state)}
                        {badge(release.release_channel)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No releases loaded yet.</div>
                )}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === 'members' ? (
          <section className="content-grid two-up">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Team</p>
                  <h2>Members</h2>
                </div>
                <button className="secondary" disabled={busyKey === 'members'} onClick={loadMembers}>
                  {busyKey === 'members' ? 'Loading…' : 'Reload'}
                </button>
              </div>
              <div className="card-list compact">
                {members.length ? (
                  members.map((member) => (
                    <div key={member.id} className="list-card">
                      <div>
                        <strong>{member.username || member.email || member.user_id}</strong>
                        <div className="muted">{member.email || 'No email visible'}</div>
                        <div className="muted">Updated: {formatDate(member.updated_at)}</div>
                      </div>
                      <div className="badge-row">
                        {badge(member.role)}
                        {badge(member.status)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No members loaded yet.</div>
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Invitations</p>
                  <h2>Create invitation</h2>
                </div>
              </div>
              <form className="stack-form" onSubmit={handleInvitationSubmit}>
                <label><span>Email</span><input type="email" required value={invitationForm.email} onChange={(event) => setInvitationForm((current) => ({ ...current, email: event.target.value }))} /></label>
                <label>
                  <span>Role</span>
                  <select value={invitationForm.role} onChange={(event) => setInvitationForm((current) => ({ ...current, role: event.target.value }))}>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                    <option value="owner">owner</option>
                  </select>
                </label>
                <label><span>Notes</span><textarea rows={3} value={invitationForm.notes} onChange={(event) => setInvitationForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                <label><span>Expires in days</span><input type="number" min={1} max={30} value={invitationForm.expiresInDays} onChange={(event) => setInvitationForm((current) => ({ ...current, expiresInDays: Number(event.target.value) }))} /></label>
                <div className="row-actions">
                  <button disabled={busyKey === 'create-invitation'}>{busyKey === 'create-invitation' ? 'Sending…' : 'Create invitation'}</button>
                  <button type="button" className="secondary" disabled={busyKey === 'invitations'} onClick={loadInvitations}>
                    {busyKey === 'invitations' ? 'Loading…' : 'Load invitations'}
                  </button>
                </div>
              </form>
              <div className="card-list compact">
                {invitations.length ? (
                  invitations.map((invitation) => (
                    <div key={invitation.id} className="list-card">
                      <div>
                        <strong>{invitation.email}</strong>
                        <div className="muted">Expires: {formatDate(invitation.expires_at)}</div>
                      </div>
                      <div className="badge-row">
                        {badge(invitation.role)}
                        {badge(invitation.status)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No invitations loaded yet.</div>
                )}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === 'reviews' ? (
          <section className="content-grid single-column">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Admin</p>
                  <h2>Review queue and runtime</h2>
                </div>
                <button className="secondary" disabled={busyKey === 'review-queue'} onClick={loadReviewQueue}>
                  {busyKey === 'review-queue' ? 'Loading…' : 'Reload admin data'}
                </button>
              </div>
              <div className="admin-overview-grid">
                <div className="mini-panel">
                  <span className="mini-label">Review queue</span>
                  <strong>{reviewSummary?.total ?? 0}</strong>
                </div>
                <div className="mini-panel">
                  <span className="mini-label">Runtime</span>
                  <strong>{runtimeStatus ? String(runtimeStatus.ready) : '—'}</strong>
                </div>
                <div className="mini-panel">
                  <span className="mini-label">Pending reviews</span>
                  <strong>{String(adminSummary?.pending_reviews_total ?? '—')}</strong>
                </div>
                <div className="mini-panel">
                  <span className="mini-label">Publishers</span>
                  <strong>{String(adminSummary?.publishers_total ?? '—')}</strong>
                </div>
              </div>
              <div className="split-json">
                <div>
                  <h3>Review summary</h3>
                  <pre className="json-box">{prettyJson(reviewSummary ?? { message: 'Load admin data.' })}</pre>
                </div>
                <div>
                  <h3>Runtime</h3>
                  <pre className="json-box">{prettyJson(runtimeStatus ?? { message: 'Load admin data.' })}</pre>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Queue</p>
                  <h2>Release moderation</h2>
                </div>
              </div>
              <div className="card-list">
                {reviewQueue.length ? (
                  reviewQueue.map((item) => (
                    <div key={item.release_id} className="list-card tall-card">
                      <div>
                        <strong>{item.plugin_display_name}</strong>
                        <div className="muted">{item.plugin_key} · v{item.version}</div>
                        <div className="muted">Created: {formatDate(item.created_at)}</div>
                        <div className="muted">Reasons: {item.reasons.join(', ') || '—'}</div>
                      </div>
                      <div className="card-actions-column">
                        <div className="badge-row wrap">
                          {badge(item.status)}
                          {badge(item.review_state)}
                          {badge(item.release_channel)}
                          {badge(item.risk_level)}
                        </div>
                        <div className="row-actions">
                          <button disabled={busyKey === `review-${item.release_id}-approve`} onClick={() => submitReviewDecision(item.release_id, 'approve')}>Approve</button>
                          <button className="secondary" disabled={busyKey === `review-${item.release_id}-request-changes`} onClick={() => submitReviewDecision(item.release_id, 'request-changes')}>Request changes</button>
                          <button className="danger" disabled={busyKey === `review-${item.release_id}-reject`} onClick={() => submitReviewDecision(item.release_id, 'reject')}>Reject</button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No review items loaded yet.</div>
                )}
              </div>
            </article>
          </section>
        ) : null}
      </main>
    </div>
  );
}
