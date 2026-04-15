import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import { OrderStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { uploadsDir } from "../config";
import { prisma } from "../prisma";
import type { AuthRequest } from "../types";
import { storageProvider } from "../services/storage";
import { asyncHandler } from "../utils/asyncHandler";

const createOrderSchema = z.object({
  content: z.string().min(1),
  ownerCode: z.string().min(1).max(8),
  status: z.nativeEnum(OrderStatus).default(OrderStatus.TODO)
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus)
});

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const dot = file.originalname.lastIndexOf(".");
    const ext = dot > -1 ? file.originalname.slice(dot) : "";
    const safeSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeSuffix}${ext}`);
  }
});

const upload = multer({ storage });

export const ordersRouter = Router();

ordersRouter.get(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user;
    if (!user?.tenantId) {
      res.status(400).json({ message: "Tenant is required" });
      return;
    }

    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const ownerCode = typeof req.query.ownerCode === "string" ? req.query.ownerCode : undefined;

    const where: {
      tenantId: string;
      status?: OrderStatus;
      ownerCode?: string;
      createdByUserId?: string;
    } = {
      tenantId: user.tenantId,
      status: status as OrderStatus | undefined
    };

    if (user.role === UserRole.SUB_ACCOUNT) {
      if (!user.managerUserId) {
        res.status(403).json({ message: "Sub account is not linked to an enterprise manager account" });
        return;
      }
      where.createdByUserId = user.managerUserId;
    }

    if (ownerCode) {
      where.ownerCode = ownerCode;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });

    res.json(orders);
  })
);

ordersRouter.post(
  "/",
  upload.single("image"),
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user;
    if (!user?.tenantId) {
      res.status(400).json({ message: "Tenant is required" });
      return;
    }

    if (user.role !== UserRole.ADMIN) {
      res.status(403).json({ message: "Only admin can create orders" });
      return;
    }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload" });
      return;
    }

    const imageUrl = req.file ? (await storageProvider.upload(req.file)).url : null;

    const created = await prisma.order.create({
      data: {
        tenantId: user.tenantId,
        content: parsed.data.content,
        ownerCode: parsed.data.ownerCode,
        status: parsed.data.status,
        imageUrl,
        createdByUserId: user.id
      }
    });

    res.status(201).json(created);
  })
);

ordersRouter.patch(
  "/:orderId/status",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user;
    if (!user?.tenantId) {
      res.status(400).json({ message: "Tenant is required" });
      return;
    }

    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload" });
      return;
    }

    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, tenantId: user.tenantId }
    });

    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    if (user.role === UserRole.SUB_ACCOUNT) {
      if (!user.managerUserId || order.createdByUserId !== user.managerUserId) {
        res.status(403).json({ message: "You can only update orders created by your enterprise manager account" });
        return;
      }
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: parsed.data.status }
    });

    res.json(updated);
  })
);

ordersRouter.delete(
  "/:orderId",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user;
    if (!user?.tenantId) {
      res.status(400).json({ message: "Tenant is required" });
      return;
    }

    if (user.role !== UserRole.ADMIN) {
      res.status(403).json({ message: "Only admin can delete orders" });
      return;
    }

    const deleted = await prisma.order.deleteMany({
      where: { id: req.params.orderId, tenantId: user.tenantId }
    });

    if (!deleted.count) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    res.json({ message: "Order deleted" });
  })
);
