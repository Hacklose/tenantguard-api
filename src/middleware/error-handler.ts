import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      error: "Invalid JSON body",
    });
    return;
  }

  console.error("Unhandled request error", error);

  res.status(500).json({
    error: "Internal server error",
  });
};
