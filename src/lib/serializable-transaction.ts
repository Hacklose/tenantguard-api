import { Prisma } from "../generated/prisma/client.js";

import { prisma } from "./prisma.js";

const maximumTransactionAttempts = 5;

const retryablePostgresTransactionCodes = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/*
 * Prisma без driver adapter обычно сообщает такой конфликт
 * через code=P2034.
 *
 * @prisma/adapter-pg может вернуть DriverAdapterError:
 *
 * cause.kind = "TransactionWriteConflict"
 * cause.originalCode = "40001"
 *
 * Поэтому проверяем как Prisma-код, так и PostgreSQL SQLSTATE.
 */
function isTransactionConflict(error: unknown): boolean {
  let current: unknown = error;

  const visitedObjects = new Set<object>();

  while (isRecord(current)) {
    if (visitedObjects.has(current)) {
      return false;
    }

    visitedObjects.add(current);

    if (current.code === "P2034") {
      return true;
    }

    if (current.kind === "TransactionWriteConflict") {
      return true;
    }

    const databaseCode =
      typeof current.originalCode === "string"
        ? current.originalCode
        : typeof current.code === "string"
          ? current.code
          : undefined;

    if (
      databaseCode &&
      retryablePostgresTransactionCodes.has(databaseCode)
    ) {
      return true;
    }

    current = current.cause;
  }

  return false;
}

/*
 * Повторяется вся read-modify-write транзакция.
 *
 * После retry заново выполняются:
 * - чтение target membership;
 * - подсчёт OWNER;
 * - решение, разрешена ли операция;
 * - UPDATE/DELETE;
 * - AuditEvent.
 */
export async function runSerializableTransactionWithRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= maximumTransactionAttempts;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const hasAttemptsRemaining =
        attempt < maximumTransactionAttempts;

      if (
        !isTransactionConflict(error) ||
        !hasAttemptsRemaining
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    "Serializable transaction retry loop terminated unexpectedly.",
  );
}
