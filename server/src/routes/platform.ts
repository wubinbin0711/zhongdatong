import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";

const updateLoginSchema = z.object({
  allowLogin: z.boolean()
});

export const platformRouter = Router();

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
      allowLogin: true
    }
  });
  res.json(users);
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

