import { Router } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import type { AuthRequest } from "../types";
import { hashPassword } from "../utils/password";

const createUserSchema = z.object({
  account: z.string().min(3),
  password: z.string().min(6),
  role: z.enum([UserRole.ADMIN, UserRole.SUB_ACCOUNT]),
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

adminUsersRouter.get("/", async (req: AuthRequest, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(400).json({ message: "Tenant is required" });
    return;
  }

  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      account: true,
      role: true,
      ownerCode: true,
      allowLogin: true,
      createdAt: true
    }
  });

  res.json(users);
});

adminUsersRouter.post("/", async (req: AuthRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload" });
    return;
  }

  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(400).json({ message: "Tenant is required" });
    return;
  }

  const exists = await prisma.user.findUnique({ where: { account: parsed.data.account } });
  if (exists) {
    res.status(409).json({ message: "Account already exists" });
    return;
  }

  const created = await prisma.user.create({
    data: {
      account: parsed.data.account,
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
      ownerCode: parsed.data.ownerCode,
      allowLogin: parsed.data.allowLogin,
      tenantId
    },
    select: {
      id: true,
      account: true,
      role: true,
      ownerCode: true,
      allowLogin: true
    }
  });

  res.status(201).json(created);
});

adminUsersRouter.patch("/:userId/login-access", async (req: AuthRequest, res) => {
  const parsed = loginAccessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload" });
    return;
  }

  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(400).json({ message: "Tenant is required" });
    return;
  }

  const updated = await prisma.user.updateMany({
    where: { id: req.params.userId, tenantId },
    data: { allowLogin: parsed.data.allowLogin }
  });

  if (!updated.count) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({ message: "Login access updated" });
});

adminUsersRouter.post("/:userId/reset-password", async (req: AuthRequest, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload" });
    return;
  }

  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(400).json({ message: "Tenant is required" });
    return;
  }

  const updated = await prisma.user.updateMany({
    where: { id: req.params.userId, tenantId },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) }
  });

  if (!updated.count) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({ message: "Password reset complete" });
});

