import express from "express";
import { authRouter } from "./features/auth/auth.router.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";

export const app = express();

app.disable("x-powered-by");

app.use(
  express.json({
    limit: "16kb",
  }),
);

app.use("/health", healthRouter);
app.use("/auth", authRouter);

app.use(errorHandler);