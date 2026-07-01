import { Router, type Response } from "express";

import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../auth/require-auth.js";
import { requireWorkspaceMembership } from "./require-workspace-membership.js";
import { createWorkspaceInputSchema } from "./workspace.schema.js";

export const workspaceRouter = Router();

function rejectUnauthenticated(response: Response) {
  return response.status(401).json({
    error: "Authentication required",
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

workspaceRouter.post("/", requireAuth, async (req, res, next) => {
  const auth = req.auth;

  if (!auth) {
    return rejectUnauthenticated(res);
  }

  const parsedInput = createWorkspaceInputSchema.safeParse(req.body);

  if (!parsedInput.success) {
    return res.status(422).json({
      error: "Invalid workspace data",
    });
  }

  try {
    const workspace = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: parsedInput.data.name,
          slug: parsedInput.data.slug,
        },
      });

      await tx.membership.create({
        data: {
          userId: auth.userId,
          organizationId: organization.id,
          role: "OWNER",
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorUserId: auth.userId,
          action: "ORGANIZATION_CREATED",
          targetType: "Organization",
          targetId: organization.id,
          metadata: {
            slug: organization.slug,
          },
        },
      });

      return organization;
    });

    return res.status(201).json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.createdAt,
        role: "OWNER",
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({
        error: "Workspace slug already exists",
      });
    }

    return next(error);
  }
});

workspaceRouter.get("/", requireAuth, async (req, res, next) => {
  const auth = req.auth;

  if (!auth) {
    return rejectUnauthenticated(res);
  }

  try {
    const memberships = await prisma.membership.findMany({
      where: {
        userId: auth.userId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
          },
        },
      },
    });

    return res.status(200).json({
      workspaces: memberships.map((membership) => ({
        ...membership.organization,
        role: membership.role,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

workspaceRouter.get(
  "/:workspaceSlug/memberships",
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
      const memberships = await prisma.membership.findMany({
        where: {
          organizationId: workspaceAuth.organizationId,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      });

      return res.status(200).json({
        memberships: memberships.map((membership) => ({
          userId: membership.user.id,
          email: membership.user.email,
          displayName: membership.user.displayName,
          role: membership.role,
          createdAt: membership.createdAt,
        })),
      });
    } catch (error) {
      return next(error);
    }
  },
);