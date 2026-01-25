import type { Request, Response, NextFunction } from "express";

export const requireSessionAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.session?.figmaUserId) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  next();
};
