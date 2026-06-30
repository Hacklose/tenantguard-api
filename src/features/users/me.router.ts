import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../auth/require-auth.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req, res, next) => {
  const auth = req.auth;

  if (!auth) {
    return res.status(401).json({
      error: "Authentication required",
    });
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
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    return res.status(200).json({
      user,
    });
  } catch (error) {
    return next(error);
  }
});
