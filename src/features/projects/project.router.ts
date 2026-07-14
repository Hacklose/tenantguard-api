import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../auth/require-auth.js";
import { requireWorkspaceMembership } from "../workspaces/require-workspace-membership.js";
import { requireWorkspaceRole } from "../workspaces/require-workspace-role.js";
import {
  createProjectInputSchema,
  projectIdParamSchema,
  updateProjectInputSchema,
} from "./project.schema.js";

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

projectRouter.get(
  "/:projectId",
  requireAuth,
  requireWorkspaceMembership,
  async (req, res, next) => {
    const workspaceAuth = req.workspaceAuth;

    if (!workspaceAuth) {
      return next(
        new Error("Workspace authorization context is missing."),
      );
    }

    const parsedProjectId = projectIdParamSchema.safeParse(
      req.params.projectId,
    );

    if (!parsedProjectId.success) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    try {
      const project = await prisma.project.findFirst({
        where: {
          id: parsedProjectId.data,
          organizationId: workspaceAuth.organizationId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!project) {
        return res.status(404).json({
          error: "Project not found",
        });
      }

      return res.status(200).json({
        project,
      });
    } catch (error) {
      return next(error);
    }
  },
);
projectRouter.post(
  "/:projectId/submit-review",
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

    const parsedProjectId = projectIdParamSchema.safeParse(
      req.params.projectId,
    );

    if (!parsedProjectId.success) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        /*
         * Первая проверка отвечает на вопрос:
         * существует ли этот проект внутри текущего tenant?
         */
        const existingProject = await tx.project.findFirst({
          where: {
            id: parsedProjectId.data,
            organizationId: workspaceAuth.organizationId,
          },
          select: {
            id: true,
            name: true,
            status: true,
          },
        });

        if (!existingProject) {
          return {
            kind: "not-found" as const,
          };
        }

        /*
         * Перейти в REVIEW можно только из DRAFT.
         */
        if (existingProject.status !== "DRAFT") {
          return {
            kind: "invalid-state" as const,
          };
        }

        const reviewRequestedAt = new Date();

        /*
         * Состояние проверяется повторно внутри UPDATE.
         *
         * Это защищает от ситуации, когда между первым чтением
         * и обновлением другой запрос уже изменил статус проекта.
         */
        const transition = await tx.project.updateMany({
          where: {
            id: existingProject.id,
            organizationId: workspaceAuth.organizationId,
            status: "DRAFT",
          },
          data: {
            status: "REVIEW",
            reviewRequestedAt,
            publishedAt: null,
          },
        });

        if (transition.count !== 1) {
          return {
            kind: "invalid-state" as const,
          };
        }

        const updatedProject = await tx.project.findFirstOrThrow({
          where: {
            id: existingProject.id,
            organizationId: workspaceAuth.organizationId,
          },
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            reviewRequestedAt: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await tx.auditEvent.create({
          data: {
            organizationId: workspaceAuth.organizationId,
            actorUserId: auth.userId,
            action: "PROJECT_REVIEW_SUBMITTED",
            targetType: "Project",
            targetId: existingProject.id,
            metadata: {
              previousStatus: "DRAFT",
              newStatus: "REVIEW",
            },
          },
        });

        return {
          kind: "success" as const,
          project: updatedProject,
        };
      });

      if (result.kind === "not-found") {
        return res.status(404).json({
          error: "Project not found",
        });
      }

      if (result.kind === "invalid-state") {
        return res.status(409).json({
          error: "Only draft projects can be submitted for review",
        });
      }

      return res.status(200).json({
        project: result.project,
      });
    } catch (error) {
      return next(error);
    }
  },
);
projectRouter.patch(
  "/:projectId",
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

    const parsedProjectId = projectIdParamSchema.safeParse(
      req.params.projectId,
    );

    if (!parsedProjectId.success) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const parsedInput = updateProjectInputSchema.safeParse(req.body);

    if (!parsedInput.success) {
      return res.status(422).json({
        error: "Invalid project update data",
      });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingProject = await tx.project.findFirst({
          where: {
            id: parsedProjectId.data,
            organizationId: workspaceAuth.organizationId,
          },
          select: {
            id: true,
            name: true,
            description: true,
          },
        });

        if (!existingProject) {
          return null;
        }

        const updatedProject = await tx.project.update({
          where: {
            id: existingProject.id,
          },
          data: {
            ...(parsedInput.data.name !== undefined
              ? { name: parsedInput.data.name }
              : {}),
            ...(parsedInput.data.description !== undefined
              ? { description: parsedInput.data.description }
              : {}),
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
            action: "PROJECT_UPDATED",
            targetType: "Project",
            targetId: updatedProject.id,
            metadata: {
              previous: {
                name: existingProject.name,
                description: existingProject.description,
              },
              updated: {
                name: updatedProject.name,
                description: updatedProject.description,
              },
            },
          },
        });

        return updatedProject;
      });

      if (!result) {
        return res.status(404).json({
          error: "Project not found",
        });
      }

      return res.status(200).json({
        project: result,
      });
    } catch (error) {
      return next(error);
    }
  },
);
projectRouter.delete(
  "/:projectId",
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

    const parsedProjectId = projectIdParamSchema.safeParse(
      req.params.projectId,
    );

    if (!parsedProjectId.success) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: {
            id: parsedProjectId.data,
            organizationId: workspaceAuth.organizationId,
          },
          select: {
            id: true,
            name: true,
          },
        });

        if (!project) {
          return null;
        }

        await tx.project.delete({
          where: {
            id: project.id,
          },
        });

        await tx.auditEvent.create({
          data: {
            organizationId: workspaceAuth.organizationId,
            actorUserId: auth.userId,
            action: "PROJECT_DELETED",
            targetType: "Project",
            targetId: project.id,
            metadata: {
              name: project.name,
            },
          },
        });

        return project;
      });

      if (!result) {
        return res.status(404).json({
          error: "Project not found",
        });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);