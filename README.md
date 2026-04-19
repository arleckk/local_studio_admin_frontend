# Local Studio — Plugin Admin Frontend

Admin/developer portal built with React + TypeScript for plugin publishing, developer public keys, release review and account management.

## Stack

- React 18 + TypeScript
- Vite 5
- Native Fetch API
- Custom CSS UI

## Setup

```bash
cp .env.example .env.local
# Edit VITE_API_BASE_URL only when you are not using the Vite dev proxy
npm install
npm run dev        # http://localhost:45110
npm run build      # dist/
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Optional backend URL when calling the API directly from the browser. Leave empty to use same-origin or the Vite dev proxy. |
| `VITE_DEV_PROXY_TARGET` | Dev-only proxy target for `/api` and `/health`. |
| `VITE_DEFAULT_PUBLISHER_SLUG` | Optional non-sensitive default publisher slug shown in the UI. |
| `VITE_AUTH_SESSION_MODE` | Optional. Use `cookie` when `local_studio_backend` migrates to HttpOnly cookie sessions. Default keeps token session state in `sessionStorage`. |

## Security posture

- This frontend **does not store private keys**.
- This frontend **must not embed admin or publisher shared secrets**.
- Authorization must be enforced by `local_studio_backend` using the authenticated user session and backend policy.
- Session state is persisted in `sessionStorage`, so **page refresh keeps the session in the current tab**.
- Closing the tab/browser clears the session in token mode.
- The client is ready for future **HttpOnly cookie sessions** by setting `VITE_AUTH_SESSION_MODE=cookie` once backend support is live.
- Runtime/admin screens are status-focused and must not depend on internal filesystem or storage paths.

## Features

| Section | Description |
|---------|-------------|
| **Dashboard** | Platform metrics, release pipeline chart, runtime status |
| **Developer** | Developer status, public signing keys, signing guide |
| **Publish** | Package validation, release channel selection, publish pipeline |
| **My Plugins** | Publisher plugin list, release history, disable/retire actions |
| **Users** | Admin user management |
| **Review Queue** | Release moderation workflow |
| **Profile** | Password change and account info |

## Auth flow

1. Sign in or register.
2. The backend returns session tokens for the current browser session.
3. Frontend requests use `Authorization: Bearer <token>` only.
4. Session tokens are persisted in `sessionStorage` for the current tab, so `F5` does not force login.
5. On expiration or `401`, the frontend attempts one coordinated refresh and otherwise returns to login.
6. Changing password invalidates active sessions and forces sign-in again.
7. Future backend migration can move this flow to **HttpOnly cookies** without exposing tokens to frontend JavaScript.

## Export

CSV exports are sanitized to avoid spreadsheet formula execution when values come from user-controlled data.
