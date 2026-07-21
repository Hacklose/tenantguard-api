import { spawnSync } from "node:child_process";

import { config } from "dotenv";

import { assertSafeDatabaseReset } from "../src/lib/database-reset-guard.js";

config({
  path:
    process.env.NODE_ENV === "test"
      ? ".env.test"
      : ".env",
});

function runCommand(
  command: "npx" | "npm",
  args: string[],
): void {
  const executable =
    process.platform === "win32"
      ? `${command}.cmd`
      : command;

  const result = spawnSync(executable, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
}

function main(): void {
  const target = assertSafeDatabaseReset({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    confirmation: process.env.DB_RESET_CONFIRM,
  });

  console.warn(
    [
      "",
      "======================================================",
      " DESTRUCTIVE LOCAL DATABASE RESET",
      ` Environment: ${target.environment}`,
      ` Host: ${target.hostname}`,
      ` Database: ${target.databaseName}`,
      " All existing data in this database will be deleted.",
      "======================================================",
      "",
    ].join("\n"),
  );

  runCommand("npx", [
    "prisma",
    "migrate",
    "reset",
    "--force",
  ]);

  /*
   * Prisma 7 does not guarantee automatic generation or seeding
   * as part of development migration commands.
   */
  runCommand("npx", ["prisma", "generate"]);
  runCommand("npm", ["run", "db:seed"]);

  console.log(
    `Database "${target.databaseName}" reset and seeded successfully.`,
  );
}

try {
  main();
} catch (error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown database reset error.";

  console.error(`Database reset aborted: ${message}`);
  process.exitCode = 1;
}
