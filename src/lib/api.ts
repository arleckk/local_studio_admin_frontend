export type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
  publisherSlug?: string;
  publisherApiKey?: string;
  adminApiKey?: string;
  includePublisher?: boolean;
  includeAdmin?: boolean;
  isFormData?: boolean;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

function resolveBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.trim().replace(/\/$/, '');
}

export function buildUrl(apiBaseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = resolveBaseUrl(apiBaseUrl);
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export async function apiRequest<T>(apiBaseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }
  if (options.includePublisher) {
    if (options.publisherSlug) headers.set('X-Publisher-Slug', options.publisherSlug);
    if (options.publisherApiKey) headers.set('X-Marketplace-Publisher-Key', options.publisherApiKey);
  }
  if (options.includeAdmin && options.adminApiKey) {
    headers.set('X-Marketplace-Admin-Key', options.adminApiKey);
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined && options.body !== null) {
    if (options.isFormData && options.body instanceof FormData) {
      body = options.body;
    } else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(buildUrl(apiBaseUrl, path), {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = typeof payload === 'string' ? payload : (payload as { detail?: unknown })?.detail;
    const message = typeof detail === 'string' ? detail : JSON.stringify(detail ?? payload, null, 2);
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
