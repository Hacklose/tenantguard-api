import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";

import {
  AuditAction,
  MembershipRole,
  PrismaClient,
  ProjectStatus,
} from "../src/generated/prisma/client.js";

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

const connectionString = requiredEnv("DATABASE_URL");
const demoAccountPassword = requiredEnv(
  "DEMO_ACCOUNT_PASSWORD",
);

if (demoAccountPassword.length < 12) {
  throw new Error(
    "DEMO_ACCOUNT_PASSWORD must be at least 12 characters long",
  );
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

type SeedUser = {
  id: string;
  email: string;
  displayName: string;
};

const ids = {
  acme: "11111111-1111-4111-8111-111111111111",
  globex: "22222222-2222-4222-8222-222222222222",

  alice: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  bob: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  carol: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  dave: "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",

  /*
   * Используем прежние четыре UUID проектов.
   *
   * Благодаря этому повторный seed обновит существующие
   * проекты, а не создаст новые дубликаты.
   */
  acmeDraft: "a0a00000-0000-4000-8000-000000000001",
  acmeReview: "a0a00000-0000-4000-8000-000000000002",
  acmePublished:
    "b0b00000-0000-4000-8000-000000000001",
  globexDraft:
    "b0b00000-0000-4000-8000-000000000002",

  acmeCreatedEvent:
    "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
  globexCreatedEvent:
    "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
} as const;

const reviewRequestedAt = new Date(
  "2026-07-14T10:00:00.000Z",
);

const publishedAt = new Date(
  "2026-07-14T12:00:00.000Z",
);

async function upsertSeedUser(user: SeedUser) {
  /*
   * Для каждого нового seed-user создаётся отдельный
   * Argon2id hash со своей солью.
   */
  const passwordHash = await argon2.hash(
    demoAccountPassword,
    {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    },
  );

  return prisma.user.upsert({
    where: {
      email: user.email,
    },

    update: {
      displayName: user.displayName,
    },

    create: {
      ...user,
      passwordHash,
    },
  });
}

async function main() {
  /*
   * Organizations
   */

  const acme = await prisma.organization.upsert({
    where: {
      slug: "acme",
    },

    update: {
      name: "Acme",
    },

    create: {
      id: ids.acme,
      name: "Acme",
      slug: "acme",
    },
  });

  const globex = await prisma.organization.upsert({
    where: {
      slug: "globex",
    },

    update: {
      name: "Globex",
    },

    create: {
      id: ids.globex,
      name: "Globex",
      slug: "globex",
    },
  });

  /*
   * Users
   */

  const alice = await upsertSeedUser({
    id: ids.alice,
    email: "alice@acme.local",
    displayName: "Alice Chen",
  });

  const bob = await upsertSeedUser({
    id: ids.bob,
    email: "bob@acme.local",
    displayName: "Bob Smith",
  });

  const carol = await upsertSeedUser({
    id: ids.carol,
    email: "carol@acme.local",
    displayName: "Carol Davis",
  });

  const dave = await upsertSeedUser({
    id: ids.dave,
    email: "dave@globex.local",
    displayName: "Dave Miller",
  });

  /*
   * Memberships
   */

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: alice.id,
        organizationId: acme.id,
      },
    },

    update: {
      role: MembershipRole.OWNER,
    },

    create: {
      userId: alice.id,
      organizationId: acme.id,
      role: MembershipRole.OWNER,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: alice.id,
        organizationId: globex.id,
      },
    },

    update: {
      role: MembershipRole.MEMBER,
    },

    create: {
      userId: alice.id,
      organizationId: globex.id,
      role: MembershipRole.MEMBER,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: bob.id,
        organizationId: acme.id,
      },
    },

    update: {
      role: MembershipRole.ADMIN,
    },

    create: {
      userId: bob.id,
      organizationId: acme.id,
      role: MembershipRole.ADMIN,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: carol.id,
        organizationId: acme.id,
      },
    },

    update: {
      role: MembershipRole.MEMBER,
    },

    create: {
      userId: carol.id,
      organizationId: acme.id,
      role: MembershipRole.MEMBER,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: dave.id,
        organizationId: globex.id,
      },
    },

    update: {
      role: MembershipRole.OWNER,
    },

    create: {
      userId: dave.id,
      organizationId: globex.id,
      role: MembershipRole.OWNER,
    },
  });

  /*
   * Acme DRAFT project
   *
   * Можно редактировать, удалять и отправлять на review.
   */

  await prisma.project.upsert({
    where: {
      id: ids.acmeDraft,
    },

    update: {
      name: "Acme Draft Project",
      description:
        "Editable Acme project prepared for workflow testing",
      organizationId: acme.id,
      status: ProjectStatus.DRAFT,
      reviewRequestedAt: null,
      publishedAt: null,
    },

    create: {
      id: ids.acmeDraft,
      name: "Acme Draft Project",
      description:
        "Editable Acme project prepared for workflow testing",
      organizationId: acme.id,
      status: ProjectStatus.DRAFT,
      reviewRequestedAt: null,
      publishedAt: null,
    },
  });

  /*
   * Acme REVIEW project
   *
   * Нельзя редактировать или удалять.
   * OWNER может вернуть его в DRAFT или опубликовать.
   */

  await prisma.project.upsert({
    where: {
      id: ids.acmeReview,
    },

    update: {
      name: "Acme Review Project",
      description:
        "Acme project waiting for owner review",
      organizationId: acme.id,
      status: ProjectStatus.REVIEW,
      reviewRequestedAt,
      publishedAt: null,
    },

    create: {
      id: ids.acmeReview,
      name: "Acme Review Project",
      description:
        "Acme project waiting for owner review",
      organizationId: acme.id,
      status: ProjectStatus.REVIEW,
      reviewRequestedAt,
      publishedAt: null,
    },
  });

  /*
   * Acme PUBLISHED project
   *
   * Проект уже прошёл review и опубликован.
   * Обычные PATCH и DELETE должны быть запрещены.
   */

  await prisma.project.upsert({
    where: {
      id: ids.acmePublished,
    },

    update: {
      name: "Acme Published Project",
      description:
        "Acme project that completed the review workflow",
      organizationId: acme.id,
      status: ProjectStatus.PUBLISHED,
      reviewRequestedAt,
      publishedAt,
    },

    create: {
      id: ids.acmePublished,
      name: "Acme Published Project",
      description:
        "Acme project that completed the review workflow",
      organizationId: acme.id,
      status: ProjectStatus.PUBLISHED,
      reviewRequestedAt,
      publishedAt,
    },
  });

  /*
   * Globex DRAFT project
   *
   * Используется для проверки tenant isolation:
   * пользователи Acme не должны получать к нему доступ.
   */

  await prisma.project.upsert({
    where: {
      id: ids.globexDraft,
    },

    update: {
      name: "Globex Draft Project",
      description:
        "Globex draft used for tenant-isolation testing",
      organizationId: globex.id,
      status: ProjectStatus.DRAFT,
      reviewRequestedAt: null,
      publishedAt: null,
    },

    create: {
      id: ids.globexDraft,
      name: "Globex Draft Project",
      description:
        "Globex draft used for tenant-isolation testing",
      organizationId: globex.id,
      status: ProjectStatus.DRAFT,
      reviewRequestedAt: null,
      publishedAt: null,
    },
  });

  /*
   * Initial audit events
   */

  await prisma.auditEvent.upsert({
    where: {
      id: ids.acmeCreatedEvent,
    },

    update: {},

    create: {
      id: ids.acmeCreatedEvent,
      organizationId: acme.id,
      actorUserId: alice.id,
      action: AuditAction.ORGANIZATION_CREATED,
      targetType: "Organization",
      targetId: acme.id,
      metadata: {
        source: "seed",
      },
    },
  });

  await prisma.auditEvent.upsert({
    where: {
      id: ids.globexCreatedEvent,
    },

    update: {},

    create: {
      id: ids.globexCreatedEvent,
      organizationId: globex.id,
      actorUserId: dave.id,
      action: AuditAction.ORGANIZATION_CREATED,
      targetType: "Organization",
      targetId: globex.id,
      metadata: {
        source: "seed",
      },
    },
  });

  console.log("Seed completed successfully.");

  console.log(
    "Created or updated: 4 users, 2 organizations, 5 memberships, 4 projects.",
  );

  console.log(
    "Projects: Acme DRAFT, Acme REVIEW, Acme PUBLISHED, Globex DRAFT.",
  );
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });