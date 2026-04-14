import { Router } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import type { AuthRequest } from "../types";
import { asyncHandler } from "../utils/asyncHandler";

const createUserSchema = z.object({
  account: z.string().min(3),
  password: z.string().min(6),
  role: z.literal(UserRole.SUB_ACCOUNT),
  ownerCode: z.string().min(1).max(8).optional(),
  allowLogin: z.boolean().default(true)
});

const loginAccessSchema = z.object({
  allowLogin: z.boolean()
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6)
});

export const adminUsersRouter = Router();

adminUsersRouter.get(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const tenantId = req.user?.tenantId;
    const managerUserId = req.user?.id;
    if (!tenantId) {
      res.status(400).json({ message: "Tenant is required" });
      return;
    }

    const users = await prisma.user.findMany({
      where: { tenantId, role: UserRole.SUB_ACCOUNT, managerUserId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        account: true,
        role: true,
        ownerCode: true,
        allowLogin: true,
        createdAt: true,
        managerUserId: true
      }
    });

    res.json(users);
  })
);

adminUsersRouter.post(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const _parsed = createUserSchema.safeParse(req.body);
    res.status(403).json({ message: "Enterprise manager account cannot create accounts" });
  })
);

adminUsersRouter.patch(
  "/:userId/login-access",
  asyncHandler(async (req: AuthRequest, res) => {
    const _parsed = loginAccessSchema.safeParse(req.body);
    res.status(403).json({ message: "Enterprise manager account cannot manage account login access" });
  })
);

adminUsersRouter.post(
  "/:userId/reset-password",
  asyncHandler(async (req: AuthRequest, res) => {
    const _parsed = resetPasswordSchema.safeParse(req.body);
    res.status(403).json({ message: "Enterprise manager account cannot reset account password" });
  })
);
