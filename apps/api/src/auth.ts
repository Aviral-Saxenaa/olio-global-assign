import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Membership } from "@olio/db";
import { env } from "./env.js";

const COOKIE_NAME = "olio_session";

export async function hashPassword(value: string) {
  return bcrypt.hash(value, 10);
}

export async function comparePassword(value: string, hash: string) {
  return bcrypt.compare(value, hash);
}

type SessionPayload = {
  userId: string;
  workspaceId: string;
};

export function signSession(payload: SessionPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function setSessionCookie(res: Response, token: string) {
  const production = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: production ? "none" : "lax",
    secure: production,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME);
}

export type AuthedRequest = Request & {
  auth: SessionPayload;
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as SessionPayload;
    const membership = await Membership.findOne({
      where: { userId: payload.userId, workspaceId: payload.workspaceId },
    });

    if (!membership) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    (req as AuthedRequest).auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
