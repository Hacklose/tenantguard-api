import express from "express";
import { healthRouter } from "./routes/health.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.use("/health", healthRouter);

app.listen(port, "0.0.0.0", () => {
  console.log(`TenantGuard Labs API is listening on http://localhost:${port}`);
});
