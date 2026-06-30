import { Router, type Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../auth/require-auth.js";
import { updateProfileInputSchema } from "./profile.schema.js";

export const meRouter = Router();

function rejectUnauthenticated(response: Response) {
  return response.status(401).json({
    error: "Authentication required",
  });
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

meRouter.get("/", requireAuth, async (req, res, next) => {
  const auth = req.auth;

  if (!auth) {
    return rejectUnauthenticated(res);
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        id: auth.userId,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
      },
    });

    if (!user) {
      return rejectUnauthenticated(res);
    }

    return res.status(200).json({
      user,
    });
  } catch (error) {
    return next(error);
  }
});

meRouter.patch("/profile", requireAuth, async (req, res, next) => {
  const auth = req.auth;

  if (!auth) {
    return rejectUnauthenticated(res);
  }

  const parsedInput = updateProfileInputSchema.safeParse(req.body);

  if (!parsedInput.success) {
    return res.status(422).json({
      error: "Invalid profile data",
    });
  }

  try {
    const user = await prisma.user.update({
      where: {
        id: auth.userId,
      },
      data: {
        displayName: parsedInput.data.displayName,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      user,
    });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return rejectUnauthenticated(res);
    }

    return next(error);
  }
});