import type { UserRole } from "@prisma/client";
import type { Request } from "express";

export type AuthUser = {
  id: string;
  role: UserRole;
  tenantId: string | null;
  ownerCode: string | null;
  managerUserId: string | null;
};

export type AuthRequest = Request & {
  user?: AuthUser;
};
