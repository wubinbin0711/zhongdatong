import { Router } from "express";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { hashPassword } from "../utils/password";
import { asyncHandler } from "../utils/asyncHandler";

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().min(1).optional()
);

const updateLoginSchema = z.object({
  allowLogin: z.boolean()
});

const createEnterpriseUserSchema = z
  .object({
    account: z.string().trim().min(3),
    password: z.string().min(6),
    role: z.enum([UserRole.ADMIN, UserRole.SUB_ACCOUNT]),
    tenantName: optionalText,
    ownerCode: optionalText,
    managerUserId: optionalText,
    allowLogin: z.boolean().default(true)
  })
  .superRefine((value, ctx) => {
    if (value.role === UserRole.ADMIN && !value.tenantName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tenantName"],
        message: "tenantName is required for enterprise manager account creation"
      });
    }

    if (value.role === UserRole.SUB_ACCOUNT && !value.managerUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["managerUserId"],
        message: "managerUserId is required for sub account creation"
      });
    }

    if (value.ownerCode && value.ownerCode.length > 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerCode"],
        message: "ownerCode must be <= 8 chars"
      });
    }
  });

export const platformRouter = Router();

platformRouter.get(
  "/tenants",
  asyncHandler(async (_req, res) => {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        code: true
      }
    });

    res.json(tenants);
  })
);

platformRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
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
  })
);

platformRouter.post(
  "/users",
  asyncHandler(async (req, res) => {
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

    try {
      const passwordHash = await hashPassword(parsed.data.password);

      const created = await prisma.$transaction(async (tx) => {
        let tenantId: string | null = null;

        if (parsed.data.role === UserRole.ADMIN) {
          const tenant = await tx.tenant.create({
            data: {
              name: parsed.data.tenantName!,
              code: `tenant-${Date.now()}-${Math.round(Math.random() * 10000)}`
            }
          });
          tenantId = tenant.id;
        }

        if (parsed.data.role === UserRole.SUB_ACCOUNT) {
          const manager = await tx.user.findFirst({
            where: {
              id: parsed.data.managerUserId,
              role: UserRole.ADMIN
            },
            select: {
              id: true,
              tenantId: true
            }
          });

          if (!manager || !manager.tenantId) {
            throw new HttpError(400, "Valid enterprise manager account is required");
          }

          tenantId = manager.tenantId;
        }

        return tx.user.create({
          data: {
            tenantId,
            account: parsed.data.account,
            passwordHash,
            role: parsed.data.role,
            ownerCode: parsed.data.role === UserRole.SUB_ACCOUNT ? parsed.data.ownerCode ?? "1" : null,
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
      });

      res.status(201).json(created);
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.status).json({ message: error.message });
        return;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ message: "Account already exists" });
        return;
      }

      throw error;
    }
  })
);

platformRouter.patch(
  "/users/:userId/login-access",
  asyncHandler(async (req, res) => {
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
  })
);
