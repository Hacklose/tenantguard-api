import { app } from "./app.js";
import { env } from "./config/env.js";

app.listen(env.PORT, env.HOST, () => {
  const address = `http://${env.HOST}:${env.PORT}`;

  if (env.LAB_MODE) {
    console.warn(
      [
        "",
        "======================================================",
        " WARNING: INTENTIONALLY VULNERABLE LAB MODE ENABLED",
        " BOLA-001 IS ACTIVE ON THE NORMAL PROJECT ENDPOINT",
        ` Server: ${address}`,
        " LOCAL SECURITY TRAINING ONLY",
        "======================================================",
        "",
      ].join("\n"),
    );

    return;
  }

  console.log(`TenantGuard API started in SECURE mode: ${address}`);
});
