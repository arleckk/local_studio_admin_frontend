export type SessionUser = {
  id: string;
  username: string;
  email: string;
  status: string;
  is_admin: boolean;
  capabilities?: string[];
  publisher_slug?: string | null;
};

export type SessionResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
  session_id: string;
  user: SessionUser;
};

export type SessionStatusResponse = {
  active: boolean;
  session_id?: string | null;
  expires_at?: string | null;
  user?: SessionUser | null;
};

export type PublisherPluginMedia = {
  icon?: Record<string, unknown> | null;
  images?: Array<Record<string, unknown>>;
};

export type PublisherRelease = {
  release_id: string;
  plugin_key: string;
  version: string;
  status: string;
  review_state?: string | null;
  release_channel?: string | null;
  changelog?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  published_at?: string | null;
  signature_status?: string | null;
  developer_key_status?: string | null;
  signature_key_id?: string | null;
  entitlement_policy?: string | null;
  offline_grace_days?: number | null;
  install_policy?: string | null;
  install_policy_badges?: string[];
  policy_warnings?: string[];
  commercial_warnings?: string[];
  disable_allowed?: boolean;
  retire_allowed?: boolean;
  license_grants_issued?: number | null;
};

export type PublisherPlugin = {
  id: string;
  plugin_key: string;
  display_name: string;
  description?: string | null;
  publisher_slug: string;
  publisher?: string | null;
  trust_level: string;
  plugin_type?: string;
  visibility: string;
  status?: string | null;
  deactivated_at?: string | null;
  deactivation_reason?: string | null;
  tags: string[];
  categories: string[];
  capabilities: string[];
  operations: PackageOperationSummary[];
  providers: PackageProviderSummary[];
  operation_count?: number;
  provider_count?: number;
  manifest?: PackageManifestSummary | null;
  internal?: boolean;
  bundled?: boolean;
  homepage_url?: string | null;
  documentation_url?: string | null;
  media?: PublisherPluginMedia;
  video_links?: string[];
  created_at: string;
  updated_at: string;
  latest_release?: PublisherRelease | null;
  latest_release_channel?: string | null;
  latest_signature_status?: string | null;
  entitlement_policy?: string | null;
  offline_grace_days?: number | null;
  install_policy?: string | null;
  install_policy_badges?: string[];
  policy_warnings?: string[];
  commercial_warnings?: string[];
  release_channel_badges?: string[];
};

export type PublisherPublishResponse = { plugin: PublisherPlugin; release: PublisherRelease };

export type ReviewQueueItem = {
  release_id: string;
  plugin_key: string;
  plugin_display_name: string;
  publisher?: string | null;
  publisher_trust_tier?: string | null;
  version: string;
  release_channel?: string | null;
  status: string;
  review_state: string;
  risk_level?: string | null;
  recommended_decision?: string | null;
  reasons: string[];
  created_at: string;
  queue_age_hours: number;
  signature_status?: string | null;
  developer_key_status?: string | null;
  policy_warnings?: string[];
  commercial_warnings?: string[];
};

export type ReviewQueueSummary = {
  total: number;
  by_status: Record<string, number>;
  by_review_state: Record<string, number>;
  by_risk_level: Record<string, number>;
  by_release_channel: Record<string, number>;
};

export type AdminSummary = {
  users_total?: number;
  publishers_total?: number;
  publishers_verified?: number;
  plugins_total?: number;
  releases_total?: number;
  releases_in_review?: number;
  releases_quarantined?: number;
  releases_approved?: number;
  active_sessions?: number;
  pending_publisher_invitations?: number;
  abuse_reports_open?: number;
  developer_keys_total?: number;
  developer_keys_revoked?: number;
  [key: string]: unknown;
};

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  status: string;
  trust_flags: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
  capabilities?: string[];
  developer_status?: string | null;
};

export type RuntimeStatus = {
  ready: boolean;
  checks?: unknown[];
  startup_error?: string | null;
  [key: string]: unknown;
};

export type CapabilityOption = {
  value: string;
  label: string;
  description?: string;
  aliases?: string[];
};

export type DeveloperKey = {
  key_id: string;
  algorithm?: string | null;
  label?: string | null;
  status?: string | null;
  created_at?: string | null;
  last_used_at?: string | null;
  fingerprint?: string | null;
  public_key?: string | null;
  can_revoke?: boolean;
};

export type DeveloperPublisherSummary = {
  id?: string | null;
  slug?: string | null;
  display_name?: string | null;
  role?: string | null;
  status?: string | null;
};

export type DeveloperKeyState = {
  has_local_private_key?: boolean | null;
  key_id?: string | null;
  status?: string | null;
};

export type DeveloperRemoteKeyState = {
  state?: string | null;
  key_id?: string | null;
  matches_local_key?: boolean | null;
};

export type DeveloperStatus = {
  source: 'backend' | 'fallback';
  status?: string | null;
  developer_status?: string | null;
  publisher?: DeveloperPublisherSummary | null;
  capabilities: string[];
  publish_allowed?: boolean | null;
  developer_mode_allowed?: boolean | null;
  local_install_allowed?: boolean | null;
  signing_keys_registered?: number | null;
  active_key_id?: string | null;
  authorized?: boolean | null;
  local_key?: DeveloperKeyState | null;
  remote_key?: DeveloperRemoteKeyState | null;
  authorized_namespaces?: string[];
  warnings: string[];
  notes: string[];
};

export type PackageOperationSummary = {
  operation_key: string;
  workflow_key?: string | null;
  capability_key?: string | null;
  display_name?: string | null;
  description?: string | null;
  default_provider_key?: string | null;
  default_model_key?: string | null;
  suggested_model_keys: string[];
  accepted_model_families: string[];
  allow_user_model_override?: boolean | null;
  allow_cross_plugin_models?: boolean | null;
};

export type PackageProviderSummary = {
  provider_key: string;
  display_name?: string | null;
  runtime_family?: string | null;
  operation_keys: string[];
  default_for_operations: string[];
  supported_model_families: string[];
  requested_permissions: string[];
  side_engine_key?: string | null;
};

export type PackageManifestSummary = {
  plugin_key?: string | null;
  display_name?: string | null;
  version?: string | null;
  description?: string | null;
  capabilities: string[];
  tags: string[];
  categories: string[];
  declared_channel?: string | null;
  manifest_version?: string | null;
  os_support: string[];
  permissions: string[];
  operations: PackageOperationSummary[];
  providers: PackageProviderSummary[];
  operation_count: number;
  provider_count: number;
  manifest_consistency_warnings: string[];
};

export type PackageSignatureSummary = {
  status?: string | null;
  key_id?: string | null;
  algorithm?: string | null;
  signer_type?: string | null;
  developer_key_status?: string | null;
};

export type PackageValidationResult = {
  source: 'backend' | 'fallback';
  package_status?: string | null;
  manifest?: PackageManifestSummary | null;
  plugin_key?: string | null;
  capabilities?: string[];
  detected_channel?: string | null;
  release_channel?: string | null;
  entitlement_policy?: string | null;
  signature?: PackageSignatureSummary | null;
  security_scan_status?: string | null;
  summary?: string | null;
  warnings: string[];
  conflicts: string[];
  errors: string[];
  policy_warnings: string[];
  commercial_warnings: string[];
  install_policy_badges: string[];
  raw?: unknown;
};

export type PublishForm = {
  name: string;
  description: string;
  tags: string;
  categories: string;
  capabilities: string[];
  changelog: string;
  videoLinks: string;
  releaseChannel: string;
  entitlementPolicy: 'free' | 'paid' | 'freemium';
  offlineGraceDays: number;
  packageFile: File | null;
  iconFile: File | null;
  imageFiles: File[];
};

export type PackageClientInspection = {
  manifest: PackageManifestSummary | null;
  package_metadata?: { distribution_channel?: string | null } | null;
  signature: {
    status: 'signed' | 'unsigned' | 'invalid';
    key_id?: string | null;
    algorithm?: string | null;
  };
  warnings: string[];
  errors: string[];
};
