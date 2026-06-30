FROM node:24-alpine AS dependencies

WORKDIR /app

COPY package*.json ./

RUN npm ci


FROM dependencies AS migrate

COPY prisma.config.ts ./
COPY prisma ./prisma

CMD ["npx", "prisma", "migrate", "deploy"]


FROM dependencies AS build

COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Нужен только для Prisma generate во время build.
# К реальной БД этот адрес не подключается.
ENV DATABASE_URL="postgresql://tenantguard:docker-build-only@localhost:5432/tenantguard?schema=public"

RUN npx prisma generate
RUN npm run build


FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["npm", "start"]