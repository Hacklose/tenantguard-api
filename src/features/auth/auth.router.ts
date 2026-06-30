import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "./password.js";
import { registerInputSchema } from "./register.schema.js";

export const authRouter = Router();

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
