import { API_BASE } from './storage';

export type ReqOpts = { method?: string; body?: unknown; token?: string; publisherSlug?: string; publisherApiKey?: string; adminApiKey?: string; pub?: boolean; admin?: boolean; isForm?: boolean };

export class ApiError extends Error {
  constructor(msg: string, public status: number, public payload: unknown) { super(msg); }
}

export function url(path: string) {
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : '/' + path}`;
}

export async function req<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const h = new Headers();
  if (opts.token) h.set('Authorization', `Bearer ${opts.token}`);
  if (opts.pub) {
    if (opts.publisherSlug) h.set('X-Publisher-Slug', opts.publisherSlug);
    if (opts.publisherApiKey) h.set('X-Marketplace-Publisher-Key', opts.publisherApiKey);
  }
  if (opts.admin && opts.adminApiKey) h.set('X-Marketplace-Admin-Key', opts.adminApiKey);

  let body: BodyInit | undefined;
  if (opts.body != null) {
    if (opts.isForm && opts.body instanceof FormData) body = opts.body;
    else { h.set('Content-Type', 'application/json'); body = JSON.stringify(opts.body); }
  }

  const res = await fetch(url(path), { method: opts.method ?? 'GET', headers: h, body });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const detail = typeof data === 'string' ? data : (data as { detail?: unknown })?.detail;
    const msg = typeof detail === 'string' ? detail : JSON.stringify(detail ?? data, null, 2);
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}
