import cookieParser from "cookie-parser";
import express from "express";

import { env } from "./config/env.js";
import { authRouter } from "./features/auth/auth.router.js";
import { projectRouter } from "./features/projects/project.router.js";
import { meRouter } from "./features/users/me.router.js";
import { workspaceRouter } from "./features/workspaces/workspace.router.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";

export type CreateAppOptions = {
  labMode?: boolean;
};

export function createApp(options: CreateAppOptions = {}) {
  const application = express();
  const labMode = options.labMode ?? env.LAB_MODE;

  if (env.NODE_ENV === "production" && labMode) {
    throw new Error(
      "Refusing to start: LAB_MODE cannot be enabled in production.",
    );
  }

  application.locals.labMode = labMode;

  application.disable("x-powered-by");

  application.use(
    express.json({
      limit: "16kb",
    }),
  );

  application.use(cookieParser());

  application.use("/health", healthRouter);
  application.use("/auth", authRouter);
  application.use("/me", meRouter);
  application.use("/workspaces", workspaceRouter);
  application.use(
    "/workspaces/:workspaceSlug/projects",
    projectRouter,
  );

  application.use(errorHandler);

  return application;
}

export const app = createApp();
