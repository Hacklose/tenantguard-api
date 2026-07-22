#!/bin/sh

set -eu

test_database="${POSTGRES_TEST_DB:-tenantguard_test}"

case "$test_database" in
  ""|*[!a-zA-Z0-9_]*)
    echo "Invalid POSTGRES_TEST_DB name: $test_database" >&2
    exit 1
    ;;
esac

if [ "$test_database" = "$POSTGRES_DB" ]; then
  echo "POSTGRES_TEST_DB must differ from POSTGRES_DB." >&2
  exit 1
fi

database_exists="$(
  psql \
    --username "$POSTGRES_USER" \
    --dbname postgres \
    --tuples-only \
    --no-align \
    --command \
      "SELECT 1 FROM pg_database WHERE datname = '$test_database';"
)"

if [ "$database_exists" = "1" ]; then
  echo "Test database \"$test_database\" already exists."
  exit 0
fi

createdb \
  --username "$POSTGRES_USER" \
  "$test_database"

echo "Test database \"$test_database\" created."
