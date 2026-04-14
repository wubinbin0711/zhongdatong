import { FormEvent, useEffect, useMemo, useState } from "react";
import logo from "./assets/logow.png";

type Role = "PLATFORM_ADMIN" | "ADMIN" | "SUB_ACCOUNT";
type OrderStatus = "COMPLETED" | "TODO" | "OUT_OF_STOCK" | "IN_PROGRESS";
type Page = "orders" | "create" | "platform";

type User = {
  id: string;
  account: string;
  role: Role;
  tenantId: string | null;
  ownerCode: string | null;
  managerUserId?: string | null;
  allowLogin?: boolean;
};

type Tenant = {
  id: string;
  name: string;
  code: string;
};

type Order = {
  id: string;
  content: string;
  ownerCode: string;
  status: OrderStatus;
  imageUrl: string | null;
  createdAt: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api";
const API_ORIGIN = API_BASE.replace(/\/api$/, "");
const TOKEN_KEY = "zdt.token";
const USER_KEY = "zdt.user";

const PAGE_LABELS: Record<Page, string> = {
  orders: "订单列表 / Orders",
  create: "新增订单 / Create",
  platform: "超级管理员 / Super Admin"
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  COMPLETED: "已完成 Completed",
  TODO: "待完成 Todo",
  OUT_OF_STOCK: "缺货 Out of stock",
  IN_PROGRESS: "进行中 In progress"
};

async function apiFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }
  return (await response.json()) as T;
}

function defaultPageByRole(role: Role): Page {
  return role === "PLATFORM_ADMIN" ? "platform" : "orders";
}

function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [activePage, setActivePage] = useState<Page>(() =>
    user ? defaultPageByRole(user.role) : "orders"
  );
  const [error, setError] = useState("");

  const [orders, setOrders] = useState<Order[]>([]);
  const [platformUsers, setPlatformUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  const [loginForm, setLoginForm] = useState({ account: "", password: "" });
  const [createOrderForm, setCreateOrderForm] = useState({
    content: "",
    ownerCode: "1",
    status: "TODO" as OrderStatus,
    image: null as File | null
  });
  const [tenantForm, setTenantForm] = useState({ name: "", code: "" });
  const [accountForm, setAccountForm] = useState({
    tenantId: "",
    account: "",
    password: "",
    role: "ADMIN" as Extract<Role, "ADMIN" | "SUB_ACCOUNT">,
    ownerCode: "1",
    managerUserId: ""
  });

  const isLoggedIn = Boolean(token && user);
  const isPlatformAdmin = user?.role === "PLATFORM_ADMIN";
  const isMotherAccount = user?.role === "ADMIN";

  const navPages = useMemo(() => {
    if (!user) return [] as Page[];
    if (user.role === "PLATFORM_ADMIN") return ["platform"] as Page[];
    if (user.role === "ADMIN") return ["orders", "create"] as Page[];
    return ["orders"] as Page[];
  }, [user]);

  const managerCandidates = useMemo(
    () =>
      platformUsers.filter(
        (item) => item.role === "ADMIN" && item.tenantId === accountForm.tenantId
      ),
    [platformUsers, accountForm.tenantId]
  );

  useEffect(() => {
    if (!isLoggedIn) return;
    void refreshData(activePage);
  }, [activePage, isLoggedIn]);

  const refreshData = async (page: Page): Promise<void> => {
    if (!token || !user) return;
    setError("");
    try {
      if (page === "orders") {
        const rows = await apiFetch<Order[]>("/orders", token);
        setOrders(rows);
      }
      if (page === "platform" && isPlatformAdmin) {
        const [users, tenantRows] = await Promise.all([
          apiFetch<User[]>("/platform/users", token),
          apiFetch<Tenant[]>("/platform/tenants", token)
        ]);
        setPlatformUsers(users);
        setTenants(tenantRows);
        setAccountForm((prev) => ({ ...prev, tenantId: prev.tenantId || tenantRows[0]?.id || "" }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    }
  };

  const resolveImageUrl = (url: string | null): string =>
    !url ? "#" : url.startsWith("http") ? url : `${API_ORIGIN}${url}`;

  const onLogin = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm)
      });
      if (!response.ok) {
        setError("登录失败，请检查账号密码或登录权限");
        return;
      }
      const data = (await response.json()) as { token: string; user: User };
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setActivePage(defaultPageByRole(data.user.role));
    } catch {
      setError("网络异常，登录失败");
    }
  };

  const onLogout = (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken("");
    setUser(null);
    setOrders([]);
    setPlatformUsers([]);
    setTenants([]);
    setActivePage("orders");
  };

  const onCreateOrder = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!token) return;
    const formData = new FormData();
    formData.append("content", createOrderForm.content);
    formData.append("ownerCode", createOrderForm.ownerCode);
    formData.append("status", createOrderForm.status);
    if (createOrderForm.image) formData.append("image", createOrderForm.image);

    try {
      await apiFetch("/orders", token, { method: "POST", body: formData });
      setCreateOrderForm({ content: "", ownerCode: "1", status: "TODO", image: null });
      setActivePage("orders");
      await refreshData("orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "新增订单失败");
    }
  };

  const updateStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
    if (!token) return;
    try {
      await apiFetch(`/orders/${orderId}/status`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      await refreshData("orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新状态失败");
    }
  };

  const deleteOrder = async (orderId: string): Promise<void> => {
    if (!token) return;
    try {
      await apiFetch(`/orders/${orderId}`, token, { method: "DELETE" });
      await refreshData("orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const onCreateTenant = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!token) return;
    try {
      await apiFetch("/platform/tenants", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tenantForm)
      });
      setTenantForm({ name: "", code: "" });
      await refreshData("platform");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建企业失败");
    }
  };

  const onCreateAccount = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!token) return;
    try {
      await apiFetch("/platform/users", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...accountForm,
          managerUserId: accountForm.role === "SUB_ACCOUNT" ? accountForm.managerUserId : undefined
        })
      });
      setAccountForm((prev) => ({
        ...prev,
        account: "",
        password: "",
        ownerCode: "1",
        managerUserId: ""
      }));
      await refreshData("platform");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建账号失败");
    }
  };

  const toggleLogin = async (targetUser: User, allowLogin: boolean): Promise<void> => {
    if (!token) return;
    try {
      await apiFetch(`/platform/users/${targetUser.id}/login-access`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowLogin })
      });
      await refreshData("platform");
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新登录权限失败");
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="app-bg login-shell">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <form className="glass-card login-card" onSubmit={onLogin}>
          <div className="brand-row">
            <img src={logo} alt="ZDT logo" className="brand-logo" />
            <h1>中大通 ZDT</h1>
          </div>
          <p>Sign in / 登录</p>
          <input
            placeholder="账号 Account"
            value={loginForm.account}
            onChange={(e) => setLoginForm((prev) => ({ ...prev, account: e.target.value }))}
          />
          <input
            placeholder="密码 Password"
            type="password"
            value={loginForm.password}
            onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
          />
          <button type="submit">进入系统 Enter</button>
          {error ? <span className="error-text">{error}</span> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="app-bg app-shell">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <aside className="glass-card sidebar">
        <div className="brand-row">
          <img src={logo} alt="ZDT logo" className="brand-logo side" />
          <h2>中大通 ZDT</h2>
        </div>
        <p>{user?.tenantId ? `Tenant: ${user.tenantId}` : "Platform account"}</p>
        {navPages.map((page) => (
          <button
            key={page}
            className={activePage === page ? "nav-btn active" : "nav-btn"}
            onClick={() => setActivePage(page)}
            type="button"
          >
            {PAGE_LABELS[page]}
          </button>
        ))}
        <button className="nav-btn" type="button" onClick={onLogout}>
          退出登录 Logout
        </button>
      </aside>

      <main className="glass-card content">
        <header className="content-head">
          <h1>{PAGE_LABELS[activePage]}</h1>
          <span>
            {user.account} / {user.role}
          </span>
        </header>
        {error ? <div className="error-box">{error}</div> : null}

        {activePage === "orders" && (
          <section className="panel">
            {orders.map((order) => (
              <article key={order.id} className="order-row">
                <div>
                  <p className="order-content">{order.content}</p>
                  <small>
                    负责人 {order.ownerCode} | {new Date(order.createdAt).toLocaleString("zh-CN")}
                  </small>
                  {order.imageUrl && (
                    <a href={resolveImageUrl(order.imageUrl)} target="_blank" rel="noreferrer">
                      查看图片 View Image
                    </a>
                  )}
                </div>
                <div className="order-actions">
                  <select
                    value={order.status}
                    onChange={(event) => void updateStatus(order.id, event.target.value as OrderStatus)}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {isMotherAccount && (
                    <button type="button" onClick={() => void deleteOrder(order.id)}>
                      删除
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}

        {activePage === "create" && (
          <form className="panel form" onSubmit={onCreateOrder}>
            <textarea
              placeholder="粘贴整段订单内容..."
              value={createOrderForm.content}
              onChange={(event) => setCreateOrderForm((prev) => ({ ...prev, content: event.target.value }))}
              required
            />
            <div className="row">
              <select
                value={createOrderForm.ownerCode}
                onChange={(event) => setCreateOrderForm((prev) => ({ ...prev, ownerCode: event.target.value }))}
              >
                <option value="1">负责人 1</option>
                <option value="2">负责人 2</option>
                <option value="3">负责人 3</option>
                <option value="4">负责人 4</option>
              </select>
              <select
                value={createOrderForm.status}
                onChange={(event) =>
                  setCreateOrderForm((prev) => ({ ...prev, status: event.target.value as OrderStatus }))
                }
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(event) =>
                setCreateOrderForm((prev) => ({ ...prev, image: event.target.files?.[0] ?? null }))
              }
            />
            <button type="submit">提交订单 Submit</button>
          </form>
        )}

        {activePage === "platform" && (
          <section className="panel">
            <form className="form" onSubmit={onCreateTenant}>
              <p>创建企业（租户）</p>
              <div className="row">
                <input
                  placeholder="企业名称"
                  value={tenantForm.name}
                  onChange={(event) => setTenantForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
                <input
                  placeholder="企业编码（唯一）"
                  value={tenantForm.code}
                  onChange={(event) => setTenantForm((prev) => ({ ...prev, code: event.target.value }))}
                  required
                />
              </div>
              <button type="submit">创建企业</button>
            </form>

            <form className="form" onSubmit={onCreateAccount}>
              <p>创建企业母账号 / 子账号</p>
              <div className="row">
                <select
                  value={accountForm.tenantId}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, tenantId: event.target.value }))}
                  required
                >
                  <option value="">选择企业</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.code})
                    </option>
                  ))}
                </select>
                <select
                  value={accountForm.role}
                  onChange={(event) =>
                    setAccountForm((prev) => ({
                      ...prev,
                      role: event.target.value as Extract<Role, "ADMIN" | "SUB_ACCOUNT">
                    }))
                  }
                >
                  <option value="ADMIN">企业母账号</option>
                  <option value="SUB_ACCOUNT">企业子账号</option>
                </select>
              </div>
              <div className="row">
                <input
                  placeholder="账号（母账号需01/02/03结尾）"
                  value={accountForm.account}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, account: event.target.value }))}
                  required
                />
                <input
                  type="password"
                  placeholder="初始密码"
                  value={accountForm.password}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </div>
              {accountForm.role === "SUB_ACCOUNT" && (
                <div className="row">
                  <select
                    value={accountForm.managerUserId}
                    onChange={(event) =>
                      setAccountForm((prev) => ({ ...prev, managerUserId: event.target.value }))
                    }
                    required
                  >
                    <option value="">选择上级母账号</option>
                    {managerCandidates.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.account}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="负责人编号"
                    value={accountForm.ownerCode}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, ownerCode: event.target.value }))}
                  />
                </div>
              )}
              <button type="submit">创建账号</button>
            </form>

            {platformUsers.map((item) => (
              <article key={item.id} className="order-row">
                <div>
                  <p className="order-content">{item.account}</p>
                  <small>
                    role: {item.role} | tenant: {item.tenantId ?? "N/A"}
                  </small>
                </div>
                <div className="order-actions">
                  <button type="button" onClick={() => void toggleLogin(item, !item.allowLogin)}>
                    {item.allowLogin ? "禁用登录" : "启用登录"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;

