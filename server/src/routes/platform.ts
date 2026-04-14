import { Router } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { hashPassword } from "../utils/password";
import { isValidManagerAccount } from "../utils/accountRules";

const updateLoginSchema = z.object({
  allowLogin: z.boolean()
});

const createEnterpriseUserSchema = z
  .object({
    account: z.string().min(3),
    password: z.string().min(6),
    role: z.enum([UserRole.ADMIN, UserRole.SUB_ACCOUNT]),
    tenantName: z.string().min(2).optional(),
    ownerCode: z.string().min(1).max(8).optional(),
    managerUserId: z.string().min(1).optional(),
    allowLogin: z.boolean().default(true)
  })
  .superRefine((value, ctx) => {
    if (value.role === UserRole.ADMIN && !isValidManagerAccount(value.account)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["account"],
        message: "Enterprise manager account must end with 01, 02, or 03"
      });
    }
    if (value.role === UserRole.SUB_ACCOUNT && !value.managerUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["managerUserId"],
        message: "managerUserId is required for sub account creation"
      });
    }
  });

export const platformRouter = Router();

platformRouter.get("/tenants", async (_req, res) => {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      code: true
    }
  });
  res.json(tenants);
});

platformRouter.get("/users", async (req, res) => {
  const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  const users = await prisma.user.findMany({
    where: tenantId ? { tenantId } : {},
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      account: true,
      role: true,
      tenantId: true,
      allowLogin: true,
      ownerCode: true,
      managerUserId: true
    }
  });
  res.json(users);
});

platformRouter.post("/users", async (req, res) => {
  const parsed = createEnterpriseUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { account: parsed.data.account } });
  if (existing) {
    res.status(409).json({ message: "Account already exists" });
    return;
  }

  let tenantId: string | null = null;

  if (parsed.data.role === UserRole.ADMIN) {
    const safeCode = `tenant-${Date.now()}-${Math.round(Math.random() * 10000)}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: parsed.data.tenantName ?? `企业-${parsed.data.account}`,
        code: safeCode
      }
    });
    tenantId = tenant.id;
  }

  if (parsed.data.role === UserRole.SUB_ACCOUNT) {
    const manager = await prisma.user.findFirst({
      where: {
        id: parsed.data.managerUserId,
        role: UserRole.ADMIN
      }
    });
    if (!manager) {
      res.status(400).json({ message: "Valid enterprise manager account is required" });
      return;
    }
    tenantId = manager.tenantId;
  }

  const created = await prisma.user.create({
    data: {
      tenantId,
      account: parsed.data.account,
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
      ownerCode: parsed.data.ownerCode,
      managerUserId: parsed.data.role === UserRole.SUB_ACCOUNT ? parsed.data.managerUserId : null,
      allowLogin: parsed.data.allowLogin
    },
    select: {
      id: true,
      tenantId: true,
      account: true,
      role: true,
      ownerCode: true,
      managerUserId: true,
      allowLogin: true
    }
  });

  res.status(201).json(created);
});

platformRouter.patch("/users/:userId/login-access", async (req, res) => {
  const parsed = updateLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload" });
    return;
  }

  const updated = await prisma.user.updateMany({
    where: { id: req.params.userId },
    data: { allowLogin: parsed.data.allowLogin }
  });

  if (!updated.count) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({ message: "Updated" });
});
