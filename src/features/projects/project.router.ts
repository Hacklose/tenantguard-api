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
import { projectPublicSelect } from "./project-public.select.js";
import { findProjectByIdWithinTenant } from "./project-read.policy.js";
import { findProjectByIdWithoutTenantScope } from "../../labs/bola-001/project-read.policy.js";

export const projectRouter = Router({
  mergeParams: true,
});

/*
 * GET /workspaces/:workspaceSlug/projects
 */
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
        select: projectPublicSelect,
      });

      return res.status(200).json({
        projects,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/*
 * POST /workspaces/:workspaceSlug/projects
 */
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
          select: projectPublicSelect,
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

/*
 * GET /workspaces/:workspaceSlug/projects/:projectId
 */
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
      const findProject =
        req.app.locals.labMode === true
          ? findProjectByIdWithoutTenantScope
          : findProjectByIdWithinTenant;

      const project = await findProject({
        projectId: parsedProjectId.data,
        organizationId: workspaceAuth.organizationId,
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

/*
 * DRAFT -> REVIEW
 */
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
        const existingProject = await tx.project.findFirst({
          where: {
            id: parsedProjectId.data,
            organizationId: workspaceAuth.organizationId,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (!existingProject) {
          return {
            kind: "not-found" as const,
          };
        }

        if (existingProject.status !== "DRAFT") {
          return {
            kind: "invalid-state" as const,
          };
        }

        const transition = await tx.project.updateMany({
          where: {
            id: existingProject.id,
            organizationId: workspaceAuth.organizationId,
            status: "DRAFT",
          },
          data: {
            status: "REVIEW",
            reviewRequestedAt: new Date(),
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
          select: projectPublicSelect,
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

/*
 * REVIEW -> DRAFT
 */
projectRouter.post(
  "/:projectId/reject-review",
  requireAuth,
  requireWorkspaceMembership,
  requireWorkspaceRole("OWNER"),
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
        const existingProject = await tx.project.findFirst({
          where: {
            id: parsedProjectId.data,
            organizationId: workspaceAuth.organizationId,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (!existingProject) {
          return {
            kind: "not-found" as const,
          };
        }

        if (existingProject.status !== "REVIEW") {
          return {
            kind: "invalid-state" as const,
          };
        }

        const transition = await tx.project.updateMany({
          where: {
            id: existingProject.id,
            organizationId: workspaceAuth.organizationId,
            status: "REVIEW",
          },
          data: {
            status: "DRAFT",
            reviewRequestedAt: null,
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
          select: projectPublicSelect,
        });

        await tx.auditEvent.create({
          data: {
            organizationId: workspaceAuth.organizationId,
            actorUserId: auth.userId,
            action: "PROJECT_REVIEW_REJECTED",
            targetType: "Project",
            targetId: existingProject.id,
            metadata: {
              previousStatus: "REVIEW",
              newStatus: "DRAFT",
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
          error: "Only projects in review can be returned to draft",
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

/*
 * REVIEW -> PUBLISHED
 *
 * Только OWNER может публиковать.
 * Проект обязан находиться в REVIEW.
 */
projectRouter.post(
  "/:projectId/publish",
  requireAuth,
  requireWorkspaceMembership,
  requireWorkspaceRole("OWNER"),
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
        const existingProject = await tx.project.findFirst({
          where: {
            id: parsedProjectId.data,
            organizationId: workspaceAuth.organizationId,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (!existingProject) {
          return {
            kind: "not-found" as const,
          };
        }

        if (existingProject.status !== "REVIEW") {
          return {
            kind: "invalid-state" as const,
          };
        }

        const transition = await tx.project.updateMany({
          where: {
            id: existingProject.id,
            organizationId: workspaceAuth.organizationId,
            status: "REVIEW",
          },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
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
          select: projectPublicSelect,
        });

        await tx.auditEvent.create({
          data: {
            organizationId: workspaceAuth.organizationId,
            actorUserId: auth.userId,
            action: "PROJECT_PUBLISHED",
            targetType: "Project",
            targetId: existingProject.id,
            metadata: {
              previousStatus: "REVIEW",
              newStatus: "PUBLISHED",
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
          error: "Project must be in review before publication",
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

/*
 * PATCH /workspaces/:workspaceSlug/projects/:projectId
 *
 * Редактировать можно только DRAFT-проекты.
 */
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
            status: true,
          },
        });

        if (!existingProject) {
          return {
            kind: "not-found" as const,
          };
        }

        /*
         * После отправки на REVIEW содержимое проекта
         * считается замороженным.
         */
        if (existingProject.status !== "DRAFT") {
          return {
            kind: "invalid-state" as const,
          };
        }

        /*
         * Повторно проверяем status непосредственно
         * во время записи в базу.
         */
        const transition = await tx.project.updateMany({
          where: {
            id: existingProject.id,
            organizationId: workspaceAuth.organizationId,
            status: "DRAFT",
          },
          data: {
            ...(parsedInput.data.name !== undefined
              ? {
                  name: parsedInput.data.name,
                }
              : {}),
            ...(parsedInput.data.description !== undefined
              ? {
                  description: parsedInput.data.description,
                }
              : {}),
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
          error: "Only draft projects can be updated",
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

/*
 * DELETE /workspaces/:workspaceSlug/projects/:projectId
 *
 * Удалять можно только DRAFT-проекты.
 */
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
            status: true,
          },
        });

        if (!project) {
          return {
            kind: "not-found" as const,
          };
        }

        if (project.status !== "DRAFT") {
          return {
            kind: "invalid-state" as const,
          };
        }

        /*
         * Удаляем только если проект всё ещё DRAFT.
         */
        const deletion = await tx.project.deleteMany({
          where: {
            id: project.id,
            organizationId: workspaceAuth.organizationId,
            status: "DRAFT",
          },
        });

        if (deletion.count !== 1) {
          return {
            kind: "invalid-state" as const,
          };
        }

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

        return {
          kind: "success" as const,
        };
      });

      if (result.kind === "not-found") {
        return res.status(404).json({
          error: "Project not found",
        });
      }

      if (result.kind === "invalid-state") {
        return res.status(409).json({
          error: "Only draft projects can be deleted",
        });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);
