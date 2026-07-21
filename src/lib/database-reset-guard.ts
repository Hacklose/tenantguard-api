export type DatabaseResetGuardInput = {
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
  confirmation: string | undefined;
};

export type SafeDatabaseResetTarget = {
  environment: "development" | "test";
  hostname: string;
  databaseName: string;
};

const allowedHosts = new Set([
  "127.0.0.1",
  "localhost",
  "postgres",
]);

const allowedDatabaseNames = new Set([
  "tenantguard",
  "tenantguard_test",
]);

const requiredConfirmation = "RESET_TENANTGUARD";

export function assertSafeDatabaseReset({
  nodeEnv,
  databaseUrl,
  confirmation,
}: DatabaseResetGuardInput): SafeDatabaseResetTarget {
  if (nodeEnv === "production") {
    throw new Error(
      "Database reset is forbidden when NODE_ENV=production.",
    );
  }

  if (nodeEnv !== "development" && nodeEnv !== "test") {
    throw new Error(
      'Database reset requires NODE_ENV="development" or "test".',
    );
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  let parsedDatabaseUrl: URL;

  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  if (
    parsedDatabaseUrl.protocol !== "postgresql:" &&
    parsedDatabaseUrl.protocol !== "postgres:"
  ) {
    throw new Error(
      "Database reset supports only PostgreSQL URLs.",
    );
  }

  const hostname = parsedDatabaseUrl.hostname.toLowerCase();
  const databaseName = decodeURIComponent(
    parsedDatabaseUrl.pathname.replace(/^\/+/, ""),
  );

  if (!allowedHosts.has(hostname)) {
    throw new Error(
      `Refusing to reset non-local database host "${hostname}".`,
    );
  }

  if (!allowedDatabaseNames.has(databaseName)) {
    throw new Error(
      `Refusing to reset unexpected database "${databaseName}".`,
    );
  }

  if (confirmation !== requiredConfirmation) {
    throw new Error(
      `Explicit confirmation is required: DB_RESET_CONFIRM=${requiredConfirmation}`,
    );
  }

  return {
    environment: nodeEnv,
    hostname,
    databaseName,
  };
}
