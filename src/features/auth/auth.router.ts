import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "./password.js";
import { registerInputSchema } from "./register.schema.js";
import { loginInputSchema } from "./login.schema.js";
import { env } from "../../config/env.js";
import { requireAuth } from "./require-auth.js";
import {
  loginRateLimiter,
  registerRateLimiter,
} from "./auth.rate-limit.js";
import {
  createSessionToken,
  getSessionExpiresAt,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_MS,
} from "./session.js";
export const authRouter = Router();
const dummyPasswordHashPromise = hashPassword(
  "tenantguard-login-timing-equalizer",
);

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

authRouter.post("/register", registerRateLimiter, async (req, res, next) => {
  const parsedInput = registerInputSchema.safeParse(req.body);

  if (!parsedInput.success) {
    return res.status(422).json({
      error: "Invalid registration data",
    });
  }
try {
  const passwordHash = await hashPassword(parsedInput.data.password);

  await prisma.user.create({
    data: {
      email: parsedInput.data.email,
      displayName: parsedInput.data.displayName,
      passwordHash,
    },
  });

  return res.status(200).json({
    message: "Registration completed.",
  });
} catch (error) {
  if (isUniqueConstraintError(error)) {
    return res.status(200).json({
      message: "A user with this email already exists.",
    });
  }

  return next(error);
}
});
authRouter.post("/login", loginRateLimiter, async (req, res, next) => {
  const parsedInput = loginInputSchema.safeParse(req.body);

  if (!parsedInput.success) {
    return res.status(422).json({
      error: "Invalid login data",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        email: parsedInput.data.email,
      },
    });

    const passwordHashToVerify =
      user?.passwordHash ?? (await dummyPasswordHashPromise);

    const passwordMatches = await verifyPassword(
      passwordHashToVerify,
      parsedInput.data.password,
    );

    if (!user || !passwordMatches) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const rawSessionToken = createSessionToken();
const expiresAt = getSessionExpiresAt();

await prisma.session.create({
  data: {
    userId: user.id,
    tokenHash: hashSessionToken(rawSessionToken),
    expiresAt,
  },
});

res.cookie(SESSION_COOKIE_NAME, rawSessionToken, {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_LIFETIME_MS,
});

return res.status(200).json({
  message: "Login successful.",
});
  } catch (error) {
    return next(error);
  }
});
authRouter.post("/logout", requireAuth, async (req, res, next) => {
  const auth = req.auth;

  if (!auth) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  try {
    const result = await prisma.session.updateMany({
      where: {
        id: auth.sessionId,
        userId: auth.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});