# Local Studio — Plugin Admin Frontend

Admin panel React + TypeScript for managing plugins, publishers, users and release reviews.

## Stack

- React 18 + TypeScript
- Vite 5
- Zero UI library dependencies — custom design system

## Setup

```bash
cp .env.example .env
# Edit VITE_API_BASE_URL to point at your backend
npm install
npm run dev        # http://localhost:45110
npm run build      # dist/
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend URL, e.g. `http://localhost:45111` |
| `VITE_DEFAULT_PUBLISHER_SLUG` | Pre-filled publisher slug |
| `VITE_DEFAULT_ADMIN_API_KEY` | Pre-filled admin key (dev only) |
| `VITE_DEFAULT_PUBLISHER_API_KEY` | Pre-filled publisher key (dev only) |

> Never commit `.env` with real keys. Use `.env.example` as the template.

## Features

| Section | Description |
|---------|-------------|
| **Dashboard** | Platform metrics, release pipeline chart, runtime status |
| **Plugins** | Browse, filter and create plugins with label system (Core / Official / Community) |
| **Releases** | Upload `.lspkg` packages, track status and review state |
| **Publishers** | Admin view of all publishers, toggle Official label |
| **Users** | Admin user management — activate, suspend, ban |
| **Review Queue** | Moderate releases — approve, reject, request changes |
| **Settings** | Connection config, publisher access, session info |

## Label System

| Label | Condition |
|-------|-----------|
| ⬡ Core | Plugin has `internal: true` or `bundled: true` |
| ★ Official | Publisher has `trust_tier: "official"` or `verified: true` |
| Community | All other publishers (default) |

## Export

Each section has a **⬇ Export** button that downloads data as CSV or JSON.

## Auth Flow

1. Sign in or register → session is stored in `localStorage`
2. Session token is used for publisher operations (`Authorization: Bearer <token>`)
3. Admin API key is sent as `X-Marketplace-Admin-Key` header for admin operations
4. Publisher API key + slug are sent as `X-Marketplace-Publisher-Key` + `X-Publisher-Slug`

Session config persists across browser reloads via `localStorage` under key `local_studio_admin_frontend_v1`.
