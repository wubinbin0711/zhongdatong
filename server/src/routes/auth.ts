import { Router } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { env } from "../config";
import { prisma } from "../prisma";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

const loginSchema = z.object({
  account: z.string().min(3),
  password: z.string().min(6)
});

const bootstrapSchema = z.object({
  key: z.string().min(8),
  tenantName: z.string().min(2),
  tenantCode: z.string().min(2),
  account: z.string().min(3),
  password: z.string().min(6)
});

const bootstrapPlatformSchema = z.object({
  key: z.string().min(8),
  account: z.string().min(3),
  password: z.string().min(6)
});

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid login input" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { account: parsed.data.account } });
  if (!user) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const isPasswordValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!isPasswordValid) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  if (!user.allowLogin) {
    res.status(403).json({ message: "Login disabled by admin" });
    return;
  }

  const token = signToken({
    id: user.id,
    role: user.role,
    tenantId: user.tenantId ?? null,
    ownerCode: user.ownerCode ?? null,
    managerUserId: user.managerUserId ?? null
  });

  res.json({
    token,
    user: {
      id: user.id,
      account: user.account,
      role: user.role,
      tenantId: user.tenantId,
      ownerCode: user.ownerCode,
      managerUserId: user.managerUserId
    }
  });
});

authRouter.post("/bootstrap-admin", async (req, res) => {
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid bootstrap payload" });
    return;
  }

  if (parsed.data.key !== env.BOOTSTRAP_KEY) {
    res.status(403).json({ message: "Invalid bootstrap key" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { account: parsed.data.account } });
  if (existing) {
    res.status(409).json({ message: "Account already exists" });
    return;
  }
  const tenant =
    (await prisma.tenant.findUnique({ where: { code: parsed.data.tenantCode } })) ??
    (await prisma.tenant.create({
      data: { code: parsed.data.tenantCode, name: parsed.data.tenantName }
    }));

  const admin = await prisma.user.create({
    data: {
      account: parsed.data.account,
      passwordHash: await hashPassword(parsed.data.password),
      role: UserRole.ADMIN,
      tenantId: tenant.id,
      allowLogin: true,
      managerUserId: null
    }
  });

  res.status(201).json({
    message: "Admin created",
    admin: { id: admin.id, account: admin.account, role: admin.role, tenantId: admin.tenantId }
  });
});

authRouter.post("/bootstrap-platform", async (req, res) => {
  const parsed = bootstrapPlatformSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid bootstrap payload" });
    return;
  }
  if (parsed.data.key !== env.BOOTSTRAP_KEY) {
    res.status(403).json({ message: "Invalid bootstrap key" });
    return;
  }
  const existing = await prisma.user.findUnique({ where: { account: parsed.data.account } });
  if (existing) {
    res.status(409).json({ message: "Account already exists" });
    return;
  }

  const platformAdmin = await prisma.user.create({
    data: {
      account: parsed.data.account,
      passwordHash: await hashPassword(parsed.data.password),
      role: UserRole.PLATFORM_ADMIN,
      allowLogin: true,
      managerUserId: null
    }
  });

  res.status(201).json({
    message: "Platform admin created",
    user: { id: platformAdmin.id, account: platformAdmin.account, role: platformAdmin.role }
  });
});
