import { API_BASE, AUTH_USES_COOKIES } from './storage';

export type ReqOpts = {
  method?: string;
  body?: unknown;
  token?: string;
  publisherSlug?: string;
  pub?: boolean;
  admin?: boolean;
  isForm?: boolean;
  suppressUnauthorizedEvent?: boolean;
};

export type UnauthorizedDetail = {
  path: string;
  status: 401;
  payload: unknown;
};

export class ApiError extends Error {
  constructor(msg: string, public status: number, public payload: unknown) {
    super(msg);
  }
}

function detailFromPayload(data: unknown) {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  return JSON.stringify(detail ?? data, null, 2);
}

function friendlyErrorMessage(path: string, status: number, data: unknown) {
  const detail = detailFromPayload(data);
  const normalizedPath = path.toLowerCase();
  const isUploadFlow = normalizedPath.includes('/publish') || normalizedPath.includes('/package') || normalizedPath.includes('/validate') || normalizedPath.includes('/releases');
  const isImageOrPackage = normalizedPath.includes('publish') || normalizedPath.includes('package') || normalizedPath.includes('image');

  if (status === 413) {
    if (isUploadFlow) return 'File too large. Reduce the package or image size and try again.';
    return 'Request payload too large. Please try again with a smaller file.';
  }

  if (status === 400 && isImageOrPackage) {
    if (detail) return `Upload rejected. ${detail}`;
    return 'Upload rejected. Check that the package is a valid .lspkg and that images are real, supported image files.';
  }

  if (status === 401 && normalizedPath.includes('/accounts/change-password')) {
    return 'Your session is no longer valid. Please sign in again.';
  }

  return detail || `Request failed with status ${status}.`;
}

export function url(path: string) {
  const base = API_BASE.replace(/\/$/, '');
  return base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : (path.startsWith('/') ? path : `/${path}`);
}

const unauthorizedListeners = new Set<(detail: UnauthorizedDetail) => void>();

function emitUnauthorized(path: string, data: unknown) {
  const detail: UnauthorizedDetail = { path, status: 401, payload: data };
  unauthorizedListeners.forEach((listener) => {
    try {
      listener(detail);
    } catch {
      // ignore listener failures
    }
  });
}

export function subscribeUnauthorized(listener: (detail: UnauthorizedDetail) => void) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export async function req<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const headers = new Headers();

  if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`);
  if (opts.publisherSlug) headers.set('X-Publisher-Slug', opts.publisherSlug);

  let body: BodyInit | undefined;
  if (opts.body != null) {
    if (opts.isForm && opts.body instanceof FormData) {
      body = opts.body;
    } else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(opts.body);
    }
  }

  const response = await fetch(url(path), {
    method: opts.method ?? 'GET',
    headers,
    body,
    credentials: AUTH_USES_COOKIES ? 'include' : 'same-origin',
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401 && !opts.suppressUnauthorizedEvent) emitUnauthorized(path, data);
    throw new ApiError(friendlyErrorMessage(path, response.status, data), response.status, data);
  }

  return data as T;
}
