import "dotenv/config";
import { UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { hashPassword } from "../utils/password";

type ParsedArgs = {
  role: UserRole;
  account: string;
  password: string;
  tenantName?: string;
  managerAccount?: string;
  ownerCode?: string;
};

const getArg = (name: string): string | undefined => {
  const entry = process.argv.find((item) => item.startsWith(`--${name}=`));
  return entry ? entry.slice(name.length + 3) : undefined;
};

const parseArgs = (): ParsedArgs => {
  const roleRaw = getArg("role");
  const account = getArg("account");
  const password = getArg("password");
  const tenantName = getArg("tenantName");
  const managerAccount = getArg("managerAccount");
  const ownerCode = getArg("ownerCode");

  if (!roleRaw || !account || !password) {
    throw new Error(
      "Missing required args. Example: --role=ADMIN --account=admin001 --password=YourPass123 --tenantName=Acme"
    );
  }

  if (!Object.values(UserRole).includes(roleRaw as UserRole)) {
    throw new Error("Invalid role. Allowed: PLATFORM_ADMIN | ADMIN | SUB_ACCOUNT");
  }

  const role = roleRaw as UserRole;

  if (role === UserRole.ADMIN && !tenantName) {
    throw new Error("ADMIN requires --tenantName");
  }

  if (role === UserRole.SUB_ACCOUNT && !managerAccount) {
    throw new Error("SUB_ACCOUNT requires --managerAccount");
  }

  return { role, account, password, tenantName, managerAccount, ownerCode };
};

const run = async (): Promise<void> => {
  const args = parseArgs();

  const existing = await prisma.user.findUnique({ where: { account: args.account } });
  if (existing) {
    throw new Error(`Account already exists: ${args.account}`);
  }

  let tenantId: string | null = null;
  let managerUserId: string | null = null;

  if (args.role === UserRole.ADMIN) {
    const tenant = await prisma.tenant.create({
      data: {
        name: args.tenantName!,
        code: `tenant-${Date.now()}-${Math.floor(Math.random() * 10000)}`
      }
    });
    tenantId = tenant.id;
  }

  if (args.role === UserRole.SUB_ACCOUNT) {
    const manager = await prisma.user.findUnique({
      where: { account: args.managerAccount! }
    });
    if (!manager || manager.role !== UserRole.ADMIN) {
      throw new Error("managerAccount must be an existing ADMIN account");
    }
    tenantId = manager.tenantId;
    managerUserId = manager.id;
  }

  const created = await prisma.user.create({
    data: {
      tenantId,
      managerUserId,
      account: args.account,
      passwordHash: await hashPassword(args.password),
      role: args.role,
      ownerCode: args.role === UserRole.SUB_ACCOUNT ? args.ownerCode ?? "1" : null,
      allowLogin: true
    },
    select: {
      id: true,
      account: true,
      role: true,
      tenantId: true,
      managerUserId: true,
      allowLogin: true
    }
  });

  console.log("Created account:", created);
};

run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
