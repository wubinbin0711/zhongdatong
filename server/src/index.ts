import fs from "node:fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { UserRole } from "@prisma/client";
import { env, uploadsDir } from "./config";
import { authRouter } from "./routes/auth";
import { requireAuth } from "./middleware/auth";
import { requireRoles } from "./middleware/role";
import { ordersRouter } from "./routes/orders";
import { adminUsersRouter } from "./routes/adminUsers";
import { platformRouter } from "./routes/platform";

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  })
);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
if (env.STORAGE_PROVIDER === "local") {
  app.use("/uploads", express.static(uploadsDir));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/orders", requireAuth, ordersRouter);
app.use("/api/admin/users", requireAuth, requireRoles(UserRole.ADMIN), adminUsersRouter);
app.use("/api/platform", requireAuth, requireRoles(UserRole.PLATFORM_ADMIN), platformRouter);

app.listen(env.PORT, () => {
  console.log(`ZDT API server running at http://localhost:${env.PORT}`);
});
