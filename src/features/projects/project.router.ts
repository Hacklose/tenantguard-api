import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../auth/require-auth.js";
import { requireWorkspaceMembership } from "../workspaces/require-workspace-membership.js";
import { requireWorkspaceRole } from "../workspaces/require-workspace-role.js";
import { createProjectInputSchema } from "./project.schema.js";

export const projectRouter = Router({
  mergeParams: true,
});

projectRouter.get(
  "/",
  requireAuth,
  requireWorkspaceMembership,
  async (req, res, next) => {
    const workspaceAuth = req.workspaceAuth;

    if (!workspaceAuth) {
      return next(
        new Error("Workspace authorization context is missing."),
      );
    }

    try {
      const projects = await prisma.project.findMany({
        where: {
          organizationId: workspaceAuth.organizationId,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.status(200).json({
        projects,
      });
    } catch (error) {
      return next(error);
    }
  },
);

projectRouter.post(
  "/",
  requireAuth,
  requireWorkspaceMembership,
  requireWorkspaceRole("OWNER", "ADMIN"),
  async (req, res, next) => {
    const workspaceAuth = req.workspaceAuth;
    const auth = req.auth;

    if (!workspaceAuth || !auth) {
      return next(
        new Error("Workspace authorization context is missing."),
      );
    }

    const parsedInput = createProjectInputSchema.safeParse(req.body);

    if (!parsedInput.success) {
      return res.status(422).json({
        error: "Invalid project data",
      });
    }

    try {
      const project = await prisma.$transaction(async (tx) => {
        const createdProject = await tx.project.create({
          data: {
            organizationId: workspaceAuth.organizationId,
            name: parsedInput.data.name,
            description: parsedInput.data.description ?? null,
          },
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await tx.auditEvent.create({
          data: {
            organizationId: workspaceAuth.organizationId,
            actorUserId: auth.userId,
            action: "PROJECT_CREATED",
            targetType: "Project",
            targetId: createdProject.id,
            metadata: {
              name: createdProject.name,
            },
          },
        });

        return createdProject;
      });

      return res.status(201).json({
        project,
      });
    } catch (error) {
      return next(error);
    }
  },
);
