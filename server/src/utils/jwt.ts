import jwt from "jsonwebtoken";
import type { AuthUser } from "../types";
import { env } from "../config";

type TokenPayload = {
  id: string;
  role: AuthUser["role"];
  tenantId: string | null;
  ownerCode: string | null;
};

export const signToken = (payload: TokenPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });

export const verifyToken = (token: string): TokenPayload =>
  jwt.verify(token, env.JWT_SECRET) as TokenPayload;

