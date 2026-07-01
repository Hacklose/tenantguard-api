import { Router, type Response } from "express";

import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../auth/require-auth.js";
import {
  createMembershipInputSchema,
  memberUserIdParamSchema,
  updateMembershipRoleInputSchema,
} from "./membership.schema.js";
import { requireWorkspaceMembership } from "./require-workspace-membership.js";
import { requireWorkspaceRole } from "./require-workspace-role.js";
import { createWorkspaceInputSchema } from "./workspace.schema.js";

export const workspaceRouter = Router();

function rejectUnauthenticated(response: Response) {
  return response.status(401).json({
    error: "Authentication required",
  });
}

function rejectMembershipNotFound(response: Response) {
  return response.status(404).json({
    error: "Membership not found",
  });
}

function rejectFinalOwnerRoleChange(response: Response) {
  return response.status(409).json({
    error: "Cannot change the final OWNER role",
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

workspaceRouter.post(
  "/:workspaceSlug/memberships",
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

    const parsedInput = createMembershipInputSchema.safeParse(req.body);

    if (!parsedInput.success) {
      return res.status(422).json({
        error: "Invalid membership data",
      });
    }

    try {
      const createdMembership = await prisma.$transaction(async (tx) => {
        const invitedUser = await tx.user.findUnique({
          where: {
            email: parsedInput.data.email,
          },
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        });

        if (!invitedUser) {
          return null;
        }

        const membership = await tx.membership.create({
          data: {
            userId: invitedUser.id,
            organizationId: workspaceAuth.organizationId,
            role: parsedInput.data.role,
          },
          select: {
            role: true,
            createdAt: true,
          },
        });

        await tx.auditEvent.create({
          data: {
            organizationId: workspaceAuth.organizationId,
            actorUserId: auth.userId,
            action: "MEMBER_ADDED",
            targetType: "Membership",
            targetId: invitedUser.id,
            metadata: {
              role: membership.role,
            },
          },
        });

        return {
          invitedUser,
          membership,
        };
      });

      if (!createdMembership) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      return res.status(201).json({
        membership: {
          userId: createdMembership.invitedUser.id,
          email: createdMembership.invitedUser.email,
          displayName: createdMembership.invitedUser.displayName,
          role: createdMembership.membership.role,
          createdAt: createdMembership.membership.createdAt,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({
          error: "User is already a workspace member",
        });
      }

      return next(error);
    }
  },
);

workspaceRouter.patch(
  "/:workspaceSlug/memberships/:memberUserId",
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

    const parsedMemberUserId = memberUserIdParamSchema.safeParse(
      req.params.memberUserId,
    );

    if (!parsedMemberUserId.success) {
      return rejectMembershipNotFound(res);
    }

    const parsedInput = updateMembershipRoleInputSchema.safeParse(req.body);

    if (!parsedInput.success) {
      return res.status(422).json({
        error: "Invalid membership update data",
      });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const targetMembership = await tx.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: parsedMemberUserId.data,
              organizationId: workspaceAuth.organizationId,
            },
          },
          select: {
            role: true,
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
              },
            },
          },
        });

        if (!targetMembership) {
          return { type: "not_found" as const };
        }

        if (targetMembership.role === "OWNER") {
          const ownerCount = await tx.membership.count({
            where: {
              organizationId: workspaceAuth.organizationId,
              role: "OWNER",
            },
          });

          if (ownerCount <= 1) {
            return { type: "final_owner" as const };
          }
        }

        const updatedMembership = await tx.membership.update({
          where: {
            userId_organizationId: {
              userId: parsedMemberUserId.data,
              organizationId: workspaceAuth.organizationId,
            },
          },
          data: {
            role: parsedInput.data.role,
          },
          select: {
            role: true,
            createdAt: true,
          },
        });

        await tx.auditEvent.create({
          data: {
            organizationId: workspaceAuth.organizationId,
            actorUserId: auth.userId,
            action: "MEMBER_ROLE_CHANGED",
            targetType: "Membership",
            targetId: parsedMemberUserId.data,
            metadata: {
              previousRole: targetMembership.role,
              newRole: updatedMembership.role,
            },
          },
        });

        return {
          type: "updated" as const,
          membership: {
            userId: targetMembership.user.id,
            email: targetMembership.user.email,
            displayName: targetMembership.user.displayName,
            role: updatedMembership.role,
            createdAt: updatedMembership.createdAt,
          },
        };
      });

      if (result.type === "not_found") {
        return rejectMembershipNotFound(res);
      }

      if (result.type === "final_owner") {
        return rejectFinalOwnerRoleChange(res);
      }

      return res.status(200).json({
        membership: result.membership,
      });
    } catch (error) {
      return next(error);
    }
  },
);
