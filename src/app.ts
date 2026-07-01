import express from "express";
import { authRouter } from "./features/auth/auth.router.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";
import cookieParser from "cookie-parser";
import { workspaceRouter } from "./features/workspaces/workspace.router.js";
import { meRouter } from "./features/users/me.router.js";
export const app = express();

app.disable("x-powered-by");

app.use(
  express.json({
    limit: "16kb",
  }),
);
app.use(cookieParser());

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/me", meRouter);
app.use("/workspaces", workspaceRouter);
app.use(errorHandler);