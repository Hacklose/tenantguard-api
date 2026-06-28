# TenantGuard API

Учебная multi-tenant SaaS-лаборатория для практики backend-разработки и AppSec.

## Сейчас реализовано

- TypeScript + Express API
- `GET /health`
- Docker Compose
- PostgreSQL в Docker
- PostgreSQL healthcheck
- Persistent Docker volume для данных базы

## Запуск

```bash
sudo docker compose up --build -d
curl http://localhost:3000/health
```

## Остановка

```bash
sudo docker compose down
```
