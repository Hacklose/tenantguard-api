import type { RequestHandler, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "./session.js";

function rejectUnauthenticated(response: Response) {
  return response.status(401).json({
    error: "Authentication required",
  });
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const rawSessionToken = req.cookies[SESSION_COOKIE_NAME];

  if (
    typeof rawSessionToken !== "string" ||
    rawSessionToken.length === 0
  ) {
    return rejectUnauthenticated(res);
  }

  try {
    const session = await prisma.session.findUnique({
      where: {
        tokenHash: hashSessionToken(rawSessionToken),
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    const now = new Date();

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= now
    ) {
      return rejectUnauthenticated(res);
    }

    req.auth = {
      userId: session.userId,
      sessionId: session.id,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
