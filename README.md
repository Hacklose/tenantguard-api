# TenantGuard API

Учебная multi-tenant SaaS-лаборатория для практики backend-разработки и AppSec.

Проект строится как безопасный API по умолчанию. Позже в нём появятся отдельные намеренно уязвимые сценарии, включаемые только локально через `LAB_MODE`.

## Технологии

- TypeScript
- Node.js + Express
- PostgreSQL
- Prisma ORM
- Zod
- Argon2id
- Vitest + Supertest
- Docker Compose
- GitHub Actions

## Реализовано

- регистрация пользователей;
- Argon2id password hashing;
- login с server-side sessions;
- случайный session token в `HttpOnly` cookie;
- хранение только SHA-256 hash session token в PostgreSQL;
- срок жизни session и server-side revocation;
- `GET /me`;
- `PATCH /me/profile` с allowlist только для `displayName`;
- logout с отзывом текущей session;
- rate limiting для registration и login;
- integration и negative security tests.

## Security decisions

- Клиентским `userId`, `role`, `organizationId` и другим privileged-полям нельзя доверять.
- `passwordHash` и raw session token не возвращаются API.
- `requireAuth` проверяет session по hash, сроку действия и `revokedAt`.
- Logout отзывает session в базе, а не только удаляет cookie.
- Profile update использует строгую allowlist schema, чтобы защититься от mass assignment.

## Быстрый запуск через Docker

```bash
cp .env.example .env

docker compose up --build -d

docker compose ps
docker compose logs migrate --tail=100

curl --fail --show-error http://127.0.0.1:3000/health