# TenantGuard Console

Frontend web application for TenantGuard — multi-tenant access control management.

## Tech Stack

- **React 19** with TypeScript
- **Vite** (dev server + build)
- **React Router v7** (client-side routing)
- **TanStack Query v5** (server state)
- **React Hook Form + Zod** (forms + validation)
- **Tailwind CSS v3** (styling)
- **Lucide icons** (UI icons)

## Quick Start

### Prerequisites

- Node.js ≥ 20
- PostgreSQL (via Docker or local)
- TenantGuard API backend running on `http://127.0.0.1:3000`

### 1. Start database

```bash
docker compose up -d postgres
# or run PostgreSQL however you prefer
```

### 2. Run database migrations + start backend

```bash
# From the repo root
npx prisma migrate deploy
npm run dev
# API starts on http://127.0.0.1:3000
```

### 3. Install frontend dependencies

```bash
npm --prefix web install
```

### 4. Start frontend dev server

```bash
npm --prefix web run dev
# Starts on http://localhost:5173
```

## How Vite Proxy Works

The backend does not expose a CORS layer. In development, Vite proxies API requests so the browser communicates with a single origin (`localhost:5173`):

| Frontend request path | Proxied to |
|----------------------|------------|
| `/auth/*` | `http://127.0.0.1:3000/auth/*` |
| `/me/*` | `http://127.0.0.1:3000/me/*` |
| `/workspaces/*` | `http://127.0.0.1:3000/workspaces/*` |
| `/health` | `http://127.0.0.1:3000/health` |

All API calls use **relative URLs** (`/auth/login`, `/me`, etc.) with `credentials: "include"` — no hardcoded backend URLs in components.

## Why localStorage Is NOT Used

Session authentication is handled entirely by the backend via **HttpOnly cookies**. The frontend:

- Never reads, writes, or stores JWT tokens
- Never uses `localStorage` or `sessionStorage` for auth state
- Uses `credentials: "include"` on every `fetch` call
- Auth state is derived from the `GET /me` API response via TanStack Query

The only client-side persistence is the **selected workspace slug** in `sessionStorage` (UX convenience, not security).

## UI Features → Backend Routes

| UI Feature | Backend Route | Method |
|-----------|--------------|--------|
| Register | `/auth/register` | POST |
| Login | `/auth/login` | POST |
| Logout | `/auth/logout` | POST |
| View profile | `/me` | GET |
| Edit display name | `/me/profile` | PATCH |
| List workspaces | `/workspaces` | GET |
| Create workspace | `/workspaces` | POST |
| List members | `/workspaces/:slug/memberships` | GET |
| Add member | `/workspaces/:slug/memberships` | POST |
| Change member role | `/workspaces/:slug/memberships/:userId` | PATCH |
| Remove member | `/workspaces/:slug/memberships/:userId` | DELETE |
| List projects | `/workspaces/:slug/projects` | GET |
| View project | `/workspaces/:slug/projects/:id` | GET |
| Create project | `/workspaces/:slug/projects` | POST |
| Update project | `/workspaces/:slug/projects/:id` | PATCH |
| Delete project | `/workspaces/:slug/projects/:id` | DELETE |

## Backend Features Without UI

These features exist in the backend but have no corresponding UI (not in scope):
- Workspace rename/delete (no backend route exists yet)
- Password/email change (no backend route exists yet)
- Avatar upload (no backend route exists yet)
- Account deletion (no backend route exists yet)
- Audit log view (data is collected but no read endpoint)
- Analytics dashboard (no read endpoint)

## Production Cookie / HTTPS Notes

The backend sets the session cookie with `secure: NODE_ENV === "production"`. In production:

- The cookie **requires HTTPS** (`Secure` flag is set)
- The frontend must be served over HTTPS
- A reverse proxy (nginx, Caddy) should terminate TLS

### Local Development Limitation

The current `compose.yaml` runs the API with `NODE_ENV=production` on plain HTTP. In a browser, **the `Secure` cookie will not be set**, and login will appear to fail silently.

**Security-aware workaround for local development:** Run the backend in development mode instead:

```bash
NODE_ENV=development npm run dev
```

This disables the `Secure` flag on the cookie (which is acceptable for localhost) while keeping all other security controls intact. Never set `NODE_ENV=development` in production.

## Project Structure

```
web/
├── src/
│   ├── api/           # API client + endpoint modules
│   │   ├── client.ts  # Central fetch wrapper (credentials, error handling)
│   │   ├── auth.ts
│   │   ├── profile.ts
│   │   ├── workspaces.ts
│   │   ├── memberships.ts
│   │   └── projects.ts
│   ├── components/
│   │   ├── layout/    # AppShell, Sidebar
│   │   ├── ui/        # Button, Input, Card, Modal, Badge, Spinner
│   │   ├── role-badge.tsx
│   │   ├── workspace-switcher.tsx
│   │   ├── empty-state.tsx
│   │   └── error-state.tsx
│   ├── pages/         # Route-level page components
│   ├── hooks/         # useAuth, useWorkspace, useError
│   ├── lib/           # Utilities (cn, formatDate, clsx)
│   ├── types/         # Shared TypeScript types
│   ├── app.tsx        # App root + routing
│   ├── main.tsx       # Entry point
│   └── index.css      # Tailwind + base styles
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Security Decisions

1. **No token in browser storage** — HttpOnly cookies only
2. **`credentials: "include"`** on all fetch calls
3. **Centralized API client** — single error handling, no raw errors in UI
4. **Relative URLs only** — no hardcoded backend origins
5. **No `dangerouslySetInnerHTML`** for API error messages
6. **Role checks are UX-only** — backend is the sole authority
7. **Workspace slug from URL** — not from request body or local state
8. **401 clears query cache + redirects to login**
9. **No user/org IDs in request bodies** — all tenant scoping is server-side
