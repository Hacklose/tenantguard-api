# TenantGuard

Учебная multi-tenant SaaS-лаборатория для практики backend-разработки, AppSec и API security testing.

Проект строится как безопасный API по умолчанию:

- пользователь определяется только через server-side session;
- tenant определяется server-side через workspace membership;
- роль определяется server-side через Membership;
- client-controlled ID всегда проверяется в пределах текущего tenant;
- намеренно уязвимые сценарии будут существовать только в отдельных lab routes через `LAB_MODE=true`.

---

## Что это за приложение

TenantGuard — API для workspaces и projects + веб-консоль управления.

Терминология:

```text
HTTP API: workspace
Database / Prisma: Organization
```

## Быстрый старт

### 1. Создать .env (один раз, обязательно)

```bash
cp .env.example .env
```

### 2. Запустить

```bash
sudo docker compose up
```

> Если порт 5432 занят локальным PostgreSQL — сначала `sudo systemctl stop postgresql`.

Готово:

| Сервис | URL |
|--------|-----|
| Фронтенд | http://localhost:5173 |
| API | http://localhost:3000 |

### 3. Проверка

```bash
curl -s http://localhost:3000/health
# → {"status":"ok"}

curl -s http://localhost:5173/
# → HTML страница (HTTP 200)
```

---

## Структура проекта

```text
.
├── src/
│   ├── app.ts                  # Express app: /auth, /me, /workspaces, /workspaces/:slug/projects
│   ├── features/
│   │   ├── auth/               # register, login, logout, session, rate-limit
│   │   ├── users/              # GET /me, PATCH /me/profile
│   │   ├── workspaces/         # CRUD workspaces + membership CRUD + RBAC middleware
│   │   └── projects/           # CRUD projects (scoped to workspace)
│   ├── middleware/              # error-handler
│   └── lib/                    # prisma client, env config
├── tests/                      # integration tests
├── prisma/                     # schema + migrations
├── web/                        # Frontend — TenantGuard Console (React + Vite)
│   ├── src/
│   │   ├── api/                # client.ts, auth.ts, profile.ts, workspaces.ts, memberships.ts, projects.ts
│   │   ├── components/         # layout (AppShell, Sidebar), ui (Button, Input, Card, Modal, Badge, Spinner)
│   │   ├── pages/              # login, register, dashboard, workspaces, projects, members, profile, 404
│   │   ├── hooks/              # useAuth, useWorkspace, useError
│   │   ├── lib/                # utils, clsx
│   │   ├── types/              # User, Workspace, Membership, Project, ApiError
│   │   ├── app.tsx             # routing + providers
│   │   └── main.tsx            # entry point
│   ├── vite.config.ts          # dev proxy → http://127.0.0.1:3000
│   ├── tailwind.config.ts      # dark SaaS theme (surface-950, brand-cyan)
│   └── README.md               # подробная документация frontend
├── compose.yaml                # Docker Compose (PostgreSQL + API)
├── Dockerfile                  # multi-stage (migrate + runtime)
└── package.json                # backend dependencies
```

---

## API Routes

### Auth (public + authenticated)

| Method | Path | Body | Roles | Ответ |
|--------|------|------|-------|-------|
| POST | `/auth/register` | `{email, password, displayName}` | Public | 200 / 422 |
| POST | `/auth/login` | `{email, password}` | Public | 200 + HttpOnly cookie / 401 |
| POST | `/auth/logout` | — | Auth | 204 |

### Me

| Method | Path | Body | Ответ |
|--------|------|------|-------|
| GET | `/me` | — | 200 `{user}` / 401 |
| PATCH | `/me/profile` | `{displayName}` | 200 `{user}` / 422 |

### Workspaces

| Method | Path | Body | Ответ |
|--------|------|------|-------|
| GET | `/workspaces` | — | 200 `{workspaces[]}` |
| POST | `/workspaces` | `{name, slug}` | 201 `{workspace}` / 409 / 422 |

### Memberships

| Method | Path | Body | Roles | Ответ |
|--------|------|------|-------|-------|
| GET | `/workspaces/:slug/memberships` | — | Member+ | 200 `{memberships[]}` |
| POST | `/workspaces/:slug/memberships` | `{email, role: ADMIN\|MEMBER}` | OWNER | 201 / 404 / 409 |
| PATCH | `/workspaces/:slug/memberships/:userId` | `{role: ADMIN\|MEMBER}` | OWNER | 200 / 404 / 409 |
| DELETE | `/workspaces/:slug/memberships/:userId` | — | OWNER | 204 / 404 / 409 |

### Projects

| Method | Path | Body | Roles | Ответ |
|--------|------|------|-------|-------|
| GET | `/workspaces/:slug/projects` | — | Member+ | 200 `{projects[]}` |
| POST | `/workspaces/:slug/projects` | `{name, description?}` | OWNER, ADMIN | 201 / 422 |
| GET | `/workspaces/:slug/projects/:id` | — | Member+ | 200 `{project}` / 404 |
| PATCH | `/workspaces/:slug/projects/:id` | `{name?, description?}` | OWNER, ADMIN | 200 / 404 / 422 |
| DELETE | `/workspaces/:slug/projects/:id` | — | OWNER, ADMIN | 204 / 404 |

---

## Frontend → Backend mapping

| UI Feature | Route | Page |
|-----------|-------|------|
| Register | `POST /auth/register` | `/register` |
| Login | `POST /auth/login` | `/login` |
| Logout | `POST /auth/logout` | Sidebar |
| View profile | `GET /me` | `/app/profile` |
| Edit display name | `PATCH /me/profile` | `/app/profile` |
| List workspaces | `GET /workspaces` | `/app/workspaces` |
| Create workspace | `POST /workspaces` | `/app/workspaces` |
| List members | `GET /workspaces/:slug/memberships` | `/app/workspaces/:slug/members` |
| Add member | `POST /workspaces/:slug/memberships` | `/app/workspaces/:slug/members` |
| Change role | `PATCH /workspaces/:slug/memberships/:id` | `/app/workspaces/:slug/members` |
| Remove member | `DELETE /workspaces/:slug/memberships/:id` | `/app/workspaces/:slug/members` |
| List projects | `GET /workspaces/:slug/projects` | `/app/workspaces/:slug/projects` |
| View project | `GET /workspaces/:slug/projects/:id` | `/app/workspaces/:slug/projects` |
| Create project | `POST /workspaces/:slug/projects` | `/app/workspaces/:slug/projects` |
| Edit project | `PATCH /workspaces/:slug/projects/:id` | `/app/workspaces/:slug/projects` |
| Delete project | `DELETE /workspaces/:slug/projects/:id` | `/app/workspaces/:slug/projects` |

---

## Ключевые security decisions

| Решение | Детали |
|---------|--------|
| Session → HttpOnly cookie | Никаких JWT в localStorage/sessionStorage |
| `credentials: "include"` | Все fetch-запросы из frontend |
| Относительные URL | Без хардкода backend origin в компонентах |
| Central API client | `web/src/api/client.ts` — единая обработка ошибок |
| Role-based UI → UX only | Backend — единственный authority для RBAC |
| 401 → clear cache + redirect | При истечении сессии |
| Final OWNER защита | Нельзя удалить/понизить последнего OWNER |
| Workspace slug из URL | Не из тела запроса и не из localStorage |

---

## Local development: cookie/HTTPS

Backend в `NODE_ENV=development` (`.env`) ставит `secure: false` на cookie — сессия работает через HTTP localhost.

При `NODE_ENV=production` (compose.yaml) cookie имеет `Secure` флаг и **не будет работать** в браузере через HTTP. Для локальной разработки используй:

```bash
NODE_ENV=development npm run dev
```

Никогда не выставляй `secure: false` в production.

---

## Что пока не реализовано (нет backend routes)

- Workspace rename / delete
- Password / email change
- Avatar upload
- Account deletion
- Audit log read endpoint (события пишутся, но нет GET)
- Invitation emails
- Analytics / activity dashboard

---

## Команды

```bash
# Backend
npm run dev              # dev server (:3000)
npm run build            # tsc
npm test                 # integration tests

# Frontend
npm --prefix web run dev       # Vite dev server (:5173)
npm --prefix web run build     # production build
npm --prefix web run typecheck # TypeScript check
```
