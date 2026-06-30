import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "./password.js";
import { registerInputSchema } from "./register.schema.js";
import { loginInputSchema } from "./login.schema.js";
import { env } from "../../config/env.js";
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

authRouter.post("/register", async (req, res, next) => {
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
authRouter.post("/login", async (req, res, next) => {
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
