FROM node:24-alpine AS dependencies

WORKDIR /app

COPY package*.json ./

RUN npm ci


# Одноразовый контейнер для применения production migrations.
FROM dependencies AS migrate

COPY prisma.config.ts ./
COPY prisma ./prisma

CMD ["npx", "prisma", "migrate", "deploy"]


# Общая стадия с сгенерированным Prisma Client.
# Её используют seed и backend build.
FROM dependencies AS prisma-client

COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Prisma требует DATABASE_URL во время generate,
# но подключение к этой базе не выполняется.
ENV DATABASE_URL="postgresql://tenantguard:docker-build-only@localhost:5432/tenantguard?schema=public"

RUN npx prisma generate


# Одноразовый контейнер для воспроизводимого seed.
FROM prisma-client AS seed

CMD ["npm", "run", "db:seed"]


# Компиляция TypeScript.
FROM prisma-client AS build

COPY tsconfig.json ./

RUN npm run build


# Минимальный backend runtime.
FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 3000

CMD ["npm", "start"]
