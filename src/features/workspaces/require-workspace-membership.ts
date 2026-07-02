import type { RequestHandler, Response } from "express";

import { prisma } from "../../lib/prisma.js";

function rejectUnauthenticated(response: Response) {
  return response.status(401).json({
    error: "Authentication required",
  });
}

function rejectWorkspaceNotFound(response: Response) {
  return response.status(404).json({
    error: "Workspace not found",
  });
}

export const requireWorkspaceMembership: RequestHandler = async (
  req,
  res,
  next,
) => {
  const auth = req.auth;
  const workspaceSlug = req.params.workspaceSlug;

  if (!auth) {
    return rejectUnauthenticated(res);
  }

  if (typeof workspaceSlug !== "string" || workspaceSlug.length === 0) {
    return rejectWorkspaceNotFound(res);
  }

  try {
    const organization = await prisma.organization.findUnique({
      where: {
        slug: workspaceSlug,
      },
      select: {
        id: true,
        slug: true,
      },
    });

    if (!organization) {
      return rejectWorkspaceNotFound(res);
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: auth.userId,
          organizationId: organization.id,
        },
      },
      select: {
        role: true,
      },
    });

    if (!membership) {
      return rejectWorkspaceNotFound(res);
    }

    req.workspaceAuth = {
      organizationId: organization.id,
      workspaceSlug: organization.slug,
      role: membership.role,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
