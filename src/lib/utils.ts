import type { CapabilityOption, DeveloperStatus, PackageValidationResult, PublisherPlugin, PublisherRelease } from './types';

export type Theme = 'dark' | 'light';
export type Toast = { id: number; kind: 'ok' | 'err' | 'inf'; msg: string };
export type AdminPage = 'dash' | 'developer' | 'publish' | 'my-plugins' | 'plugins-admin' | 'users' | 'reviews';
export type UserPage = 'developer' | 'publish' | 'my-plugins' | 'profile';

export function fmtDate(v?: string | null) {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return v; }
}

export function fmtDT(v?: string | null) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return v; }
}

export function initials(name: string) {
  return name.split(/[\s._@-]/).filter(Boolean).map((word) => word[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export function pluginColor(key: string) {
  const colors = ['#06b6d4', '#7c3aed', '#059669', '#d97706', '#dc2626', '#2563eb', '#db2777', '#0d9488'];
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

export function publisherLabel(trust?: string | null, slug?: string) {
  const normalized = (trust || '').toLowerCase();
  if (slug === 'local-studio' || normalized === 'core' || normalized === 'internal') return { cls: 'lbl-core', text: '⬡ Core' };
  if (normalized === 'official' || normalized === 'verified') return { cls: 'lbl-official', text: '★ Official' };
  return { cls: 'lbl-community', text: '◈ Community' };
}

export function splitCsvLike(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export const MAX_PACKAGE_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_ICON_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIZE_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_COUNT = 8;
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function isLspkgFile(file: File | null | undefined) {
  return !!file && file.name.toLowerCase().endsWith('.lspkg');
}

export function isSupportedImageFile(file: File | null | undefined) {
  if (!file) return false;
  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  return hasAllowedExtension && (!file.type || ALLOWED_IMAGE_MIME_TYPES.includes(file.type));
}

export function validatePackageFile(file: File | null | undefined): string | null {
  if (!file) return null;
  if (!isLspkgFile(file)) return 'Only .lspkg packages are allowed.';
  if (file.size > MAX_PACKAGE_SIZE_BYTES) return 'Package is too large. Keep .lspkg files under 100 MB.';
  return null;
}

export function validateIconFile(file: File | null | undefined): string | null {
  if (!file) return null;
  if (!isSupportedImageFile(file)) return 'Icon must be a real PNG, JPG, WEBP or GIF image.';
  if (file.size > MAX_ICON_SIZE_BYTES) return 'Icon is too large. Keep icon images under 10 MB.';
  return null;
}

export function validateImageFiles(files: File[] | FileList | null | undefined): string | null {
  const list = files ? Array.from(files) : [];
  if (list.length > MAX_IMAGE_COUNT) return `You can upload up to ${MAX_IMAGE_COUNT} preview images.`;
  for (const file of list) {
    if (!isSupportedImageFile(file)) return `Image rejected: ${file.name}. Use PNG, JPG, WEBP or GIF files only.`;
    if (file.size > MAX_IMAGE_SIZE_BYTES) return `Image too large: ${file.name}. Keep preview images under 12 MB each.`;
  }
  return null;
}

export function isAllowedYoutubeUrl(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host);
  } catch {
    return false;
  }
}

export function statusLbl(value?: string | null) {
  const normalized = (value || 'unknown').toLowerCase().replace(/[- ]/g, '_');
  const map: Record<string, string> = {
    active: 'lbl-active', approved: 'lbl-approved', verified: 'lbl-active', public: 'lbl-public', stable: 'lbl-stable',
    community: 'lbl-community', official: 'lbl-official', internal: 'lbl-core', core: 'lbl-core',
    suspended: 'lbl-suspended', banned: 'lbl-banned', rejected: 'lbl-rejected', private: 'lbl-private',
    beta: 'lbl-beta', canary: 'lbl-canary', pending: 'lbl-pending', in_review: 'lbl-in_review', quarantined: 'lbl-suspended',
    owner: 'lbl-official', admin: 'lbl-beta', member: 'lbl-community', private_beta: 'lbl-beta',
    marketplace_release: 'lbl-public', local_dev: 'lbl-private', signed: 'lbl-active', valid: 'lbl-active',
    invalid: 'lbl-rejected', missing: 'lbl-pending', revoked: 'lbl-banned', disabled: 'lbl-suspended', retired: 'lbl-suspended', unpublished: 'lbl-private',
  };
  return { cls: map[normalized] || 'lbl-unknown', text: value || 'unknown' };
}

export function exportCsv(name: string, cols: string[], rows: (string | number | null | undefined)[][]) {
  const safeCell = (value: unknown) => {
    const text = String(value ?? '');
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  };
  const escape = (value: unknown) => `"${safeCell(value).replace(/"/g, '""')}"`;
  const blob = new Blob([[cols, ...rows].map((row) => row.map(escape).join(',')).join('\n')], { type: 'text/csv' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  link.click();
  URL.revokeObjectURL(link.href);
}

export function normalizeCapabilityOptions(payload: unknown): CapabilityOption[] {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? ((payload as { items?: unknown; results?: unknown; data?: unknown; capabilities?: unknown }).items
        ?? (payload as { results?: unknown }).results
        ?? (payload as { data?: unknown }).data
        ?? (payload as { capabilities?: unknown }).capabilities
        ?? [])
      : [];

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
    .filter((entry): entry is CapabilityOption => !!entry)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getLatestRelease(releases: PublisherRelease[]) {
  return [...releases].sort((a, b) => {
    const left = new Date(b.created_at || b.published_at || 0).getTime();
    const right = new Date(a.created_at || a.published_at || 0).getTime();
    return left - right;
  })[0] || null;
}

export function enrichPlugin(plugin: PublisherPlugin, releases: PublisherRelease[]) {
  const latest = getLatestRelease(releases);
  return {
    ...plugin,
    latest_release: latest,
    latest_release_channel: plugin.latest_release_channel ?? latest?.release_channel ?? null,
    latest_signature_status: plugin.latest_signature_status ?? latest?.signature_status ?? null,
    entitlement_policy: plugin.entitlement_policy ?? latest?.entitlement_policy ?? null,
    install_policy: plugin.install_policy ?? latest?.install_policy ?? null,
    install_policy_badges: plugin.install_policy_badges ?? latest?.install_policy_badges ?? [],
    policy_warnings: plugin.policy_warnings ?? latest?.policy_warnings ?? [],
    commercial_warnings: plugin.commercial_warnings ?? latest?.commercial_warnings ?? [],
  } satisfies PublisherPlugin;
}

export function deriveDeveloperFallback(userCaps: string[] | undefined, keyCount: number): DeveloperStatus {
  return {
    source: 'fallback',
    status: 'available',
    developer_status: 'contract_pending',
    capabilities: userCaps || [],
    publish_allowed: true,
    developer_mode_allowed: null,
    local_install_allowed: null,
    signing_keys_registered: keyCount,
    warnings: ['Developer status endpoint is not available yet. Showing a local fallback view.'],
    notes: [
      'Private keys stay on the developer device.',
      'Local Developer Mode and local installs happen in Desktop, not in this portal.',
    ],
  };
}

export function buildFallbackPackageValidation(file: File, releaseChannel: string): PackageValidationResult {
  return {
    source: 'fallback',
    package_status: isLspkgFile(file) ? 'uploaded' : 'invalid',
    manifest: null,
    plugin_key: null,
    capabilities: [],
    detected_channel: 'local_dev',
    release_channel: releaseChannel,
    signature: { status: 'pending', key_id: null, algorithm: null, signer_type: null, developer_key_status: null },
    summary: 'Package uploaded. Waiting for backend package validation contract.',
    warnings: ['Manifest, signature and conflict details require the new package validation endpoint in local_studio_backend.'],
    conflicts: [],
    errors: isLspkgFile(file) ? [] : ['Only .lspkg packages are supported.'],
    policy_warnings: [],
    commercial_warnings: [],
    install_policy_badges: [],
  };
}

export function toReleaseChannelOptions() {
  return [
    { value: 'private_beta', label: 'Private Beta', description: 'Controlled rollout for invited testers or limited audiences.' },
    { value: 'marketplace_release', label: 'Marketplace Release', description: 'Formal marketplace publish path with backend review and policy checks.' },
  ];
}
