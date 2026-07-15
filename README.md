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

## Локальная разработка

### 1. Подготовить environment

```bash
cp .env.example .env
```

Проверь значения PostgreSQL в `.env`.

### 2. Запустить PostgreSQL и API

```bash
docker compose up --build -d
```

Проверка:

```bash
docker compose ps
curl --fail --show-error http://127.0.0.1:3000/health
```

Local Compose запускает API с:

```text
NODE_ENV=development
LAB_MODE=false
```

Это необходимо для предсказуемой работы HttpOnly session cookie через локальный HTTP.

### 3. Запустить frontend

```bash
npm --prefix web ci
npm --prefix web run dev
```

Открыть:

```text
http://localhost:5173
```

Vite проксирует `/auth`, `/me` и `/workspaces` на локальный API.

### Важно

Не хранить session token в:

```text
localStorage
sessionStorage
JavaScript state
```

Raw session token существует только в HttpOnly cookie.

`compose.yaml` предназначен для локальной разработки. Production deployment должен использовать HTTPS и `NODE_ENV=production`.

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
│   │   └── projects/           # tenant-scoped CRUD + publication workflow
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

| Method | Path | Body | Roles | Состояние / ответ |
|--------|------|------|-------|-------------------|
| GET | `/workspaces/:slug/projects` | — | Member+ | 200 `{projects[]}` |
| POST | `/workspaces/:slug/projects` | `{name, description?}` | OWNER, ADMIN | Создаёт `DRAFT` |
| GET | `/workspaces/:slug/projects/:id` | — | Member+ | 200 `{project}` / 404 |
| PATCH | `/workspaces/:slug/projects/:id` | `{name?, description?}` | OWNER, ADMIN | Только `DRAFT` |
| DELETE | `/workspaces/:slug/projects/:id` | — | OWNER, ADMIN | Только `DRAFT` |
| POST | `/workspaces/:slug/projects/:id/submit-review` | — | OWNER, ADMIN | `DRAFT → REVIEW` |
| POST | `/workspaces/:slug/projects/:id/reject-review` | — | OWNER | `REVIEW → DRAFT` |
| POST | `/workspaces/:slug/projects/:id/publish` | — | OWNER | `REVIEW → PUBLISHED` |

### Project publication workflow

```text
DRAFT ──submit-review──> REVIEW ──publish──> PUBLISHED
  ^                         |
  └──────reject-review──────┘
```

Правила состояния:

- `DRAFT` можно редактировать и удалять через OWNER или ADMIN;
- `REVIEW` нельзя редактировать или удалять;
- только OWNER может вернуть `REVIEW` в `DRAFT`;
- только OWNER может опубликовать `REVIEW`;
- `PUBLISHED` является read-only;
- клиент не может напрямую передавать `status`, `reviewRequestedAt` или `publishedAt`;
- каждая смена состояния выполняется server-side и записывает `AuditEvent`;
- все project-запросы ограничены текущим workspace/tenant.

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
| View project | `GET /workspaces/:slug/projects/:id` | `/app/workspaces/:slug/projects/:id` |
| Create project | `POST /workspaces/:slug/projects` | `/app/workspaces/:slug/projects` |
| Edit project | `PATCH /workspaces/:slug/projects/:id` | Project detail |
| Delete project | `DELETE /workspaces/:slug/projects/:id` | Project detail |
| Submit review | `POST /workspaces/:slug/projects/:id/submit-review` | Project detail |
| Return to draft | `POST /workspaces/:slug/projects/:id/reject-review` | Project detail |
| Publish project | `POST /workspaces/:slug/projects/:id/publish` | Project detail |

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
| Project workflow authority | Статус меняется только через отдельные backend actions; frontend не является security boundary |

---

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
