export type SessionUser = {
  id: string;
  username: string;
  email: string;
  status: string;
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

export type PublisherAccess = {
  publisher_id: string;
  publisher_slug: string;
  display_name: string;
  auth_mode: string;
  role?: string | null;
  status?: string | null;
  permissions: string[];
  trust_tier?: string | null;
  verification_status?: string | null;
};

export type PublisherProfile = {
  id: string;
  slug: string;
  display_name: string;
  description?: string | null;
  trust_tier?: string | null;
  verification_status?: string | null;
  verified?: boolean;
  active?: boolean;
  policy_flags?: Record<string, unknown>;
  allowed_release_channels?: string[];
};

export type PublisherMember = {
  id: string;
  publisher_id: string;
  publisher_slug: string;
  user_id: string;
  username?: string | null;
  email?: string | null;
  role: string;
  status: string;
  notes?: string | null;
  permissions: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PublisherInvitation = {
  id: string;
  email: string;
  invited_username?: string | null;
  role: string;
  status: string;
  expires_at: string;
  invite_token?: string | null;
  notes?: string | null;
};

export type PublisherPlugin = {
  id: string;
  plugin_key: string;
  display_name: string;
  publisher_slug: string;
  trust_level: string;
  visibility: string;
  tags: string[];
  categories: string[];
  capabilities: string[];
  created_at: string;
  updated_at: string;
};

export type PublisherRelease = {
  id: string;
  plugin_key: string;
  version: string;
  status: string;
  review_state?: string | null;
  release_channel?: string | null;
  changelog?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
};

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
  plugins_total?: number;
  releases_total?: number;
  pending_reviews_total?: number;
  [key: string]: unknown;
};

export type RuntimeStatus = {
  ready: boolean;
  checks?: unknown[];
  startup_error?: string | null;
  [key: string]: unknown;
};
