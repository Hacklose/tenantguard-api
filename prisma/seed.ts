import "dotenv/config";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AuditAction,
  MembershipRole,
  PrismaClient,
} from "../src/generated/prisma/client.js";

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

const connectionString = requiredEnv("DATABASE_URL");
const demoAccountPassword = requiredEnv("DEMO_ACCOUNT_PASSWORD");

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

  acmeCrm: "a0a00000-0000-4000-8000-000000000001",
  acmeBilling: "a0a00000-0000-4000-8000-000000000002",
  globexAnalytics: "b0b00000-0000-4000-8000-000000000001",
  globexMobile: "b0b00000-0000-4000-8000-000000000002",

  acmeCreatedEvent: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
  globexCreatedEvent: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
} as const;

async function upsertSeedUser(user: SeedUser) {
  // Новый hash на каждый seed-user: у каждого будет своя соль.
  const passwordHash = await argon2.hash(demoAccountPassword, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });

  return prisma.user.upsert({
    where: {
      email: user.email,
    },

    update: {
      displayName: user.displayName
    },

    create: {
      ...user,
      passwordHash,
    },
  });
}

async function main() {
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

  await prisma.project.upsert({
    where: {
      id: ids.acmeCrm,
    },

    update: {
      name: "Acme CRM",
      description: "Customer relationship management platform",
      organizationId: acme.id,
    },

    create: {
      id: ids.acmeCrm,
      name: "Acme CRM",
      description: "Customer relationship management platform",
      organizationId: acme.id,
    },
  });

  await prisma.project.upsert({
    where: {
      id: ids.acmeBilling,
    },

    update: {
      name: "Acme Billing",
      description: "Internal billing service",
      organizationId: acme.id,
    },

    create: {
      id: ids.acmeBilling,
      name: "Acme Billing",
      description: "Internal billing service",
      organizationId: acme.id,
    },
  });

  await prisma.project.upsert({
    where: {
      id: ids.globexAnalytics,
    },

    update: {
      name: "Globex Analytics",
      description: "Analytics dashboard",
      organizationId: globex.id,
    },

    create: {
      id: ids.globexAnalytics,
      name: "Globex Analytics",
      description: "Analytics dashboard",
      organizationId: globex.id,
    },
  });

  await prisma.project.upsert({
    where: {
      id: ids.globexMobile,
    },

    update: {
      name: "Globex Mobile",
      description: "Mobile application platform",
      organizationId: globex.id,
    },

    create: {
      id: ids.globexMobile,
      name: "Globex Mobile",
      description: "Mobile application platform",
      organizationId: globex.id,
    },
  });

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
  console.log("Created or updated: 4 users, 2 organizations, 5 memberships, 4 projects.");
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