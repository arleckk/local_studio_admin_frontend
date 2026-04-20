import { req } from './api';
import type {
  DeveloperKey,
  DeveloperStatus,
  PackageManifestSummary,
  PackageValidationResult,
  PublisherPlugin,
  PublisherRelease,
} from './types';
import { buildFallbackPackageValidation, deriveDeveloperFallback } from './utils';
import { normalizeManifestSummary } from './pluginManifest';

export type AuthOpts = {
  token?: string;
  publisherSlug?: string;
  pub?: boolean;
  admin?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const obj = asRecord(value);
  const candidate = obj.items ?? obj.results ?? obj.data ?? obj.keys ?? obj.releases ?? obj.queue;
  return Array.isArray(candidate) ? candidate : [];
}

export async function tryRequest<T>(paths: string[], invoke: (path: string) => Promise<T>) {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await invoke(path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No compatible backend contract found.');
}

export function normalizeDeveloperStatus(payload: unknown, fallbackCaps: string[] | undefined, keyCount: number): DeveloperStatus {
  const obj = asRecord(payload);
  const publisher = asRecord(obj.publisher ?? obj.publisher_profile ?? obj.publisher_access);
  const caps = asStringList(obj.capabilities ?? obj.allowed_capabilities ?? obj.permissions ?? obj.effective_capabilities);
  if (!Object.keys(obj).length) return deriveDeveloperFallback(fallbackCaps, keyCount);

  const localKey = asRecord(obj.local_key ?? obj.localKey);
  const remoteKey = asRecord(obj.remote_key ?? obj.remoteKey);

  return {
    source: 'backend',
    status: String(obj.status ?? obj.account_status ?? 'active'),
    developer_status: String(obj.developer_status ?? obj.role ?? obj.membership_status ?? 'active'),
    publisher: Object.keys(publisher).length
      ? {
          id: typeof publisher.id === 'string' ? publisher.id : null,
          slug:
            typeof publisher.slug === 'string'
              ? publisher.slug
              : typeof publisher.publisher_slug === 'string'
                ? publisher.publisher_slug
                : null,
          display_name:
            typeof publisher.display_name === 'string'
              ? publisher.display_name
              : typeof publisher.name === 'string'
                ? publisher.name
                : null,
          role: typeof publisher.role === 'string' ? publisher.role : null,
          status: typeof publisher.status === 'string' ? publisher.status : null,
        }
      : null,
    capabilities: caps.length ? caps : fallbackCaps || [],
    publish_allowed:
      typeof obj.publish_allowed === 'boolean'
        ? obj.publish_allowed
        : typeof obj.can_publish === 'boolean'
          ? obj.can_publish
          : true,
    developer_mode_allowed:
      typeof obj.developer_mode_allowed === 'boolean'
        ? obj.developer_mode_allowed
        : typeof obj.can_use_developer_mode === 'boolean'
          ? obj.can_use_developer_mode
          : null,
    local_install_allowed:
      typeof obj.local_install_allowed === 'boolean'
        ? obj.local_install_allowed
        : typeof obj.can_install_locally === 'boolean'
          ? obj.can_install_locally
          : null,
    signing_keys_registered: typeof obj.signing_keys_registered === 'number' ? obj.signing_keys_registered : keyCount,
    active_key_id: typeof obj.active_key_id === 'string' ? obj.active_key_id : null,
    authorized:
      typeof obj.authorized === 'boolean'
        ? obj.authorized
        : typeof obj.remote_authorized === 'boolean'
          ? obj.remote_authorized
          : null,
    local_key: Object.keys(localKey).length
      ? {
          has_local_private_key:
            typeof localKey.has_local_private_key === 'boolean'
              ? localKey.has_local_private_key
              : typeof localKey.has_private_key === 'boolean'
                ? localKey.has_private_key
                : null,
          key_id: typeof localKey.key_id === 'string' ? localKey.key_id : null,
          status: typeof localKey.status === 'string' ? localKey.status : null,
        }
      : null,
    remote_key: Object.keys(remoteKey).length
      ? {
          state: typeof remoteKey.state === 'string' ? remoteKey.state : typeof remoteKey.status === 'string' ? remoteKey.status : null,
          key_id: typeof remoteKey.key_id === 'string' ? remoteKey.key_id : null,
          matches_local_key:
            typeof remoteKey.matches_local_key === 'boolean'
              ? remoteKey.matches_local_key
              : typeof remoteKey.matches === 'boolean'
                ? remoteKey.matches
                : null,
        }
      : null,
    authorized_namespaces: asStringList(obj.authorized_namespaces ?? publisher.authorized_namespaces),
    warnings: asStringList(obj.warnings ?? obj.policy_warnings),
    notes: asStringList(obj.notes ?? obj.guidance),
  };
}

export function normalizeDeveloperKeys(payload: unknown): DeveloperKey[] {
  const items: DeveloperKey[] = [];
  for (const entry of pickList(payload)) {
    const obj = asRecord(entry);
    const keyId = String(obj.key_id ?? obj.id ?? obj.fingerprint ?? '').trim();
    if (!keyId) continue;
    items.push({
      key_id: keyId,
      algorithm: typeof obj.algorithm === 'string' ? obj.algorithm : typeof obj.alg === 'string' ? obj.alg : null,
      label: typeof obj.label === 'string' ? obj.label : typeof obj.name === 'string' ? obj.name : null,
      status: typeof obj.status === 'string' ? obj.status : null,
      created_at: typeof obj.created_at === 'string' ? obj.created_at : null,
      last_used_at: typeof obj.last_used_at === 'string' ? obj.last_used_at : null,
      fingerprint: typeof obj.fingerprint === 'string' ? obj.fingerprint : null,
      public_key: typeof obj.public_key === 'string' ? obj.public_key : null,
      can_revoke: typeof obj.can_revoke === 'boolean' ? obj.can_revoke : true,
    });
  }
  return items;
}

export function normalizeManifest(entry: unknown): PackageManifestSummary | null {
  return normalizeManifestSummary(entry);
}

export function normalizePackageValidation(payload: unknown, file: File, releaseChannel: string): PackageValidationResult {
  const fallback = buildFallbackPackageValidation(file, releaseChannel);
  const obj = asRecord(payload);
  if (!Object.keys(obj).length) return fallback;
  const signature = asRecord(obj.signature ?? obj.signature_summary ?? obj.developer_signature);
  const securityScan = asRecord(obj.security_scan ?? obj.security_scan_summary);
  const manifest = normalizeManifest(obj.manifest ?? obj.detected_manifest);

  return {
    source: 'backend',
    package_status: typeof obj.package_status === 'string' ? obj.package_status : typeof obj.status === 'string' ? obj.status : fallback.package_status,
    manifest,
    plugin_key:
      typeof obj.plugin_key === 'string'
        ? obj.plugin_key
        : typeof obj.detected_plugin_key === 'string'
          ? obj.detected_plugin_key
          : fallback.plugin_key,
    capabilities: asStringList(obj.capabilities ?? obj.detected_capabilities ?? obj.requested_capabilities ?? manifest?.capabilities),
    detected_channel:
      typeof obj.detected_channel === 'string'
        ? obj.detected_channel
        : typeof obj.channel === 'string'
          ? obj.channel
          : fallback.detected_channel,
    release_channel: typeof obj.release_channel === 'string' ? obj.release_channel : releaseChannel,
    entitlement_policy:
      typeof obj.entitlement_policy === 'string'
        ? obj.entitlement_policy
        : typeof obj.commercial_model === 'string'
          ? obj.commercial_model
          : fallback.entitlement_policy,
    signature: Object.keys(signature).length
      ? {
          status: typeof signature.status === 'string' ? signature.status : null,
          key_id:
            typeof signature.key_id === 'string'
              ? signature.key_id
              : typeof signature.signing_key_id === 'string'
                ? signature.signing_key_id
                : null,
          algorithm: typeof signature.algorithm === 'string' ? signature.algorithm : null,
          signer_type: typeof signature.signer_type === 'string' ? signature.signer_type : null,
          developer_key_status: typeof signature.developer_key_status === 'string' ? signature.developer_key_status : null,
        }
      : fallback.signature,
    security_scan_status:
      typeof securityScan.status === 'string'
        ? securityScan.status
        : typeof obj.security_scan_status === 'string'
          ? obj.security_scan_status
          : null,
    summary: typeof obj.summary === 'string' ? obj.summary : typeof obj.message === 'string' ? obj.message : fallback.summary,
    warnings: asStringList(obj.warnings),
    conflicts: asStringList(obj.conflicts ?? obj.validation_conflicts),
    errors: asStringList(obj.errors),
    policy_warnings: asStringList(obj.policy_warnings),
    commercial_warnings: asStringList(obj.commercial_warnings),
    install_policy_badges: asStringList(obj.install_policy_badges),
    raw: payload,
  };
}

export function normalizePlugins(payload: unknown): PublisherPlugin[] {
  const items: PublisherPlugin[] = [];
  for (const entry of pickList(payload)) {
    const obj = asRecord(entry);
    const pluginKey = String(obj.plugin_key ?? obj.key ?? '').trim();
    const pluginId = String(obj.id ?? pluginKey ?? '').trim();
    if (!pluginId || !pluginKey) continue;
    const manifest = normalizeManifestSummary(
      obj.manifest ?? obj.public_manifest ?? obj.latest_manifest ?? (Array.isArray(obj.operations) || Array.isArray(obj.flows) || Array.isArray(obj.providers) ? obj : null),
    );
    items.push({
      id: pluginId,
      plugin_key: pluginKey,
      display_name: String(obj.display_name ?? obj.name ?? manifest?.display_name ?? pluginKey),
      description: typeof obj.description === 'string' ? obj.description : manifest?.description ?? null,
      publisher_slug: String(obj.publisher_slug ?? obj.publisher ?? 'unknown'),
      publisher: typeof obj.publisher === 'string' ? obj.publisher : null,
      trust_level: String(obj.trust_level ?? obj.plugin_type ?? 'community'),
      plugin_type: typeof obj.plugin_type === 'string' ? obj.plugin_type : undefined,
      visibility: String(obj.visibility ?? 'public'),
      status: typeof obj.status === 'string' ? obj.status : null,
      deactivated_at: typeof obj.deactivated_at === 'string' ? obj.deactivated_at : null,
      deactivation_reason: typeof obj.deactivation_reason === 'string' ? obj.deactivation_reason : null,
      tags: asStringList(obj.tags ?? manifest?.tags),
      categories: asStringList(obj.categories ?? manifest?.categories),
      capabilities: asStringList(obj.capabilities ?? manifest?.capabilities),
      operations: manifest?.operations ?? [],
      providers: manifest?.providers ?? [],
      operation_count: manifest?.operation_count,
      provider_count: manifest?.provider_count,
      manifest,
      internal: typeof obj.internal === 'boolean' ? obj.internal : undefined,
      bundled: typeof obj.bundled === 'boolean' ? obj.bundled : undefined,
      homepage_url: typeof obj.homepage_url === 'string' ? obj.homepage_url : null,
      documentation_url: typeof obj.documentation_url === 'string' ? obj.documentation_url : null,
      media: obj.media && typeof obj.media === 'object' ? (obj.media as PublisherPlugin['media']) : undefined,
      video_links: asStringList(obj.video_links),
      created_at: String(obj.created_at ?? new Date().toISOString()),
      updated_at: String(obj.updated_at ?? obj.created_at ?? new Date().toISOString()),
      latest_release_channel: typeof obj.latest_release_channel === 'string' ? obj.latest_release_channel : null,
      latest_signature_status: typeof obj.latest_signature_status === 'string' ? obj.latest_signature_status : null,
      entitlement_policy: typeof obj.entitlement_policy === 'string' ? obj.entitlement_policy : null,
      offline_grace_days: asOptionalNumber(obj.offline_grace_days),
      install_policy: typeof obj.install_policy === 'string' ? obj.install_policy : null,
      install_policy_badges: asStringList(obj.install_policy_badges),
      policy_warnings: asStringList(obj.policy_warnings),
      commercial_warnings: asStringList(obj.commercial_warnings),
      release_channel_badges: asStringList(obj.release_channel_badges),
    });
  }
  return items;
}

export function normalizeRelease(entry: unknown): PublisherRelease | null {
  const obj = asRecord(entry);
  const id = String(obj.release_id ?? obj.id ?? '').trim();
  const pluginKey = String(obj.plugin_key ?? '').trim();
  const version = String(obj.version ?? '').trim();
  if (!id || !pluginKey || !version) return null;
  return {
    release_id: id,
    plugin_key: pluginKey,
    version,
    status: String(obj.status ?? 'unknown'),
    review_state: typeof obj.review_state === 'string' ? obj.review_state : null,
    release_channel: typeof obj.release_channel === 'string' ? obj.release_channel : null,
    changelog: typeof obj.changelog === 'string' ? obj.changelog : null,
    created_at: typeof obj.created_at === 'string' ? obj.created_at : null,
    approved_at: typeof obj.approved_at === 'string' ? obj.approved_at : null,
    published_at: typeof obj.published_at === 'string' ? obj.published_at : null,
    signature_status: typeof obj.signature_status === 'string' ? obj.signature_status : null,
    developer_key_status: typeof obj.developer_key_status === 'string' ? obj.developer_key_status : null,
    signature_key_id: typeof obj.signature_key_id === 'string' ? obj.signature_key_id : null,
    entitlement_policy: typeof obj.entitlement_policy === 'string' ? obj.entitlement_policy : null,
    offline_grace_days: asOptionalNumber(obj.offline_grace_days),
    install_policy: typeof obj.install_policy === 'string' ? obj.install_policy : null,
    install_policy_badges: asStringList(obj.install_policy_badges),
    policy_warnings: asStringList(obj.policy_warnings),
    commercial_warnings: asStringList(obj.commercial_warnings),
    disable_allowed: typeof obj.disable_allowed === 'boolean' ? obj.disable_allowed : undefined,
    retire_allowed: typeof obj.retire_allowed === 'boolean' ? obj.retire_allowed : undefined,
    license_grants_issued: asOptionalNumber(obj.license_grants_issued),
  };
}

export function normalizeReleases(payload: unknown): PublisherRelease[] {
  return pickList(payload).map(normalizeRelease).filter((entry): entry is PublisherRelease => !!entry);
}

export function normalizeReviewItem(entry: unknown) {
  const obj = asRecord(entry);
  const releaseId = String(obj.release_id ?? obj.id ?? '').trim();
  if (!releaseId) return null;
  return {
    release_id: releaseId,
    plugin_key: String(obj.plugin_key ?? 'unknown'),
    plugin_display_name: String(obj.plugin_display_name ?? obj.plugin_name ?? obj.plugin_key ?? 'Unknown plugin'),
    publisher: typeof obj.publisher === 'string' ? obj.publisher : null,
    publisher_trust_tier: typeof obj.publisher_trust_tier === 'string' ? obj.publisher_trust_tier : null,
    version: String(obj.version ?? '0.0.0'),
    release_channel: typeof obj.release_channel === 'string' ? obj.release_channel : null,
    status: String(obj.status ?? 'pending'),
    review_state: String(obj.review_state ?? 'pending'),
    risk_level: typeof obj.risk_level === 'string' ? obj.risk_level : null,
    recommended_decision: typeof obj.recommended_decision === 'string' ? obj.recommended_decision : null,
    reasons: asStringList(obj.reasons),
    created_at: String(obj.created_at ?? new Date().toISOString()),
    queue_age_hours: typeof obj.queue_age_hours === 'number' ? obj.queue_age_hours : 0,
    signature_status: typeof obj.signature_status === 'string' ? obj.signature_status : null,
    developer_key_status: typeof obj.developer_key_status === 'string' ? obj.developer_key_status : null,
    policy_warnings: asStringList(obj.policy_warnings),
    commercial_warnings: asStringList(obj.commercial_warnings),
  };
}

export function normalizeReviewQueue(payload: unknown) {
  return pickList(payload)
    .map(normalizeReviewItem)
    .filter((entry): entry is NonNullable<ReturnType<typeof normalizeReviewItem>> => !!entry);
}

export async function loadDeveloperStatusWithFallback(auth: AuthOpts, userCaps: string[] | undefined, keyCount: number) {
  const payload = await tryRequest(
    [
      '/api/v1/developer/status',
      '/api/v1/developer/me',
      '/api/v1/developers/me',
      '/api/v1/publishers/developer/me',
      '/api/v1/accounts/developer',
      '/api/v1/accounts/me',
    ],
    (path) => req<unknown>(path, auth),
  );
  return normalizeDeveloperStatus(payload, userCaps, keyCount);
}

export async function loadDeveloperKeys(auth: AuthOpts) {
  const payload = await tryRequest(
    ['/api/v1/developer/keys', '/api/v1/developers/keys', '/api/v1/publishers/developer/keys', '/api/v1/accounts/developer/keys'],
    (path) => req<unknown>(path, auth),
  );
  return normalizeDeveloperKeys(payload);
}

export async function validatePackageContract(auth: AuthOpts, file: File, releaseChannel: string) {
  const form = new FormData();
  form.append('package', file);
  form.append('release_channel', releaseChannel);
  try {
    const payload = await tryRequest(
      ['/api/v1/publishers/releases/inspect', '/api/v1/publishers/packages/validate', '/api/v1/publishers/package-validation', '/api/v1/publishers/validate-package', '/api/v1/publishers/publish/validate'],
      (path) => req<unknown>(path, { ...auth, method: 'POST', body: form, isForm: true }),
    );
    return normalizePackageValidation(payload, file, releaseChannel);
  } catch {
    return buildFallbackPackageValidation(file, releaseChannel);
  }
}
