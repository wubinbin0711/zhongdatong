import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "PLATFORM_ADMIN" | "ADMIN" | "SUB_ACCOUNT";
type OrderStatus = "COMPLETED" | "TODO" | "OUT_OF_STOCK" | "IN_PROGRESS";

type User = {
  id: string;
  account: string;
  role: Role;
  tenantId: string | null;
  ownerCode: string | null;
  managerUserId?: string | null;
  allowLogin?: boolean;
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
const tokenKey = "zdt.token";
const userKey = "zdt.user";
const API_ORIGIN = API_BASE.replace(/\/api$/, "");

const pageLabels = {
  orders: "订单列表 / Orders",
  create: "新增订单 / Create",
  subAccounts: "子账号管理 / Sub Accounts",
  platform: "平台控制 / Platform"
} as const;

type Page = keyof typeof pageLabels;

const statusLabel: Record<OrderStatus, string> = {
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

function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(tokenKey) ?? "");
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(userKey);
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [activePage, setActivePage] = useState<Page>("orders");
  const [error, setError] = useState("");

  const [orders, setOrders] = useState<Order[]>([]);
  const [tenantUsers, setTenantUsers] = useState<User[]>([]);
  const [platformUsers, setPlatformUsers] = useState<User[]>([]);

  const [loginForm, setLoginForm] = useState({ account: "", password: "" });
  const [createOrderForm, setCreateOrderForm] = useState({
    content: "",
    ownerCode: "1",
    status: "TODO" as OrderStatus,
    image: null as File | null
  });
  const [createSubForm, setCreateSubForm] = useState({
    account: "",
    password: "",
    role: "SUB_ACCOUNT" as Extract<Role, "SUB_ACCOUNT">,
    ownerCode: "1"
  });

  const isLoggedIn = Boolean(token && user);
  const canCreateOrder = user?.role === "ADMIN";
  const canManageSubAccounts = user?.role === "ADMIN";
  const canUsePlatform = user?.role === "PLATFORM_ADMIN";

  const visibleNav = useMemo(() => {
    const pages: Page[] = ["orders"];
    if (canCreateOrder) {
      pages.push("create");
    }
    if (canManageSubAccounts) {
      pages.push("subAccounts");
    }
    if (canUsePlatform) {
      pages.push("platform");
    }
    return pages;
  }, [canCreateOrder, canManageSubAccounts, canUsePlatform]);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }
    void refreshData(activePage);
  }, [activePage, isLoggedIn]);

  const refreshData = async (page: Page): Promise<void> => {
    setError("");
    if (!token || !user) {
      return;
    }
    try {
      if (page === "orders") {
        const rows = await apiFetch<Order[]>("/orders", token);
        setOrders(rows);
      }
      if (page === "subAccounts" && canManageSubAccounts) {
        const rows = await apiFetch<User[]>("/admin/users", token);
        setTenantUsers(rows);
      }
      if (page === "platform" && canUsePlatform) {
        const rows = await apiFetch<User[]>("/platform/users", token);
        setPlatformUsers(rows);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    }
  };

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
      localStorage.setItem(tokenKey, data.token);
      localStorage.setItem(userKey, JSON.stringify(data.user));
      setActivePage("orders");
    } catch {
      setError("网络异常，登录失败");
    }
  };

  const onLogout = (): void => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    setToken("");
    setUser(null);
    setOrders([]);
    setTenantUsers([]);
    setPlatformUsers([]);
    setCreateOrderForm({ content: "", ownerCode: "1", status: "TODO", image: null });
    setCreateSubForm({ account: "", password: "", role: "SUB_ACCOUNT", ownerCode: "1" });
  };

  const onCreateOrder = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!token) {
      return;
    }
    const formData = new FormData();
    formData.append("content", createOrderForm.content);
    formData.append("ownerCode", createOrderForm.ownerCode);
    formData.append("status", createOrderForm.status);
    if (createOrderForm.image) {
      formData.append("image", createOrderForm.image);
    }
    try {
      await apiFetch("/orders", token, { method: "POST", body: formData });
      setCreateOrderForm({ content: "", ownerCode: "1", status: "TODO", image: null });
      setActivePage("orders");
      await refreshData("orders");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "新增订单失败");
    }
  };

  const updateStatus = async (orderId: string, status: OrderStatus): Promise<void> => {
    if (!token) {
      return;
    }
    try {
      await apiFetch(`/orders/${orderId}/status`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      await refreshData("orders");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "更新状态失败");
    }
  };

  const deleteOrder = async (orderId: string): Promise<void> => {
    if (!token) {
      return;
    }
    try {
      await apiFetch(`/orders/${orderId}`, token, { method: "DELETE" });
      await refreshData("orders");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除失败");
    }
  };

  const createSubAccount = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!token) {
      return;
    }
    try {
      await apiFetch("/admin/users", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createSubForm)
      });
      setCreateSubForm({ account: "", password: "", role: "SUB_ACCOUNT", ownerCode: "1" });
      await refreshData("subAccounts");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "新增账号失败");
    }
  };

  const toggleUserLogin = async (targetUser: User, allowLogin: boolean): Promise<void> => {
    if (!token) {
      return;
    }
    const basePath = user?.role === "PLATFORM_ADMIN" ? "/platform/users" : "/admin/users";
    try {
      await apiFetch(`${basePath}/${targetUser.id}/login-access`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowLogin })
      });
      await refreshData(activePage);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "更新登录权限失败");
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="app-bg login-shell">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <form className="glass-card login-card" onSubmit={onLogin}>
          <h1>中大通 ZDT</h1>
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
        <h2>中大通 ZDT</h2>
        <p>{user?.tenantId ? `Tenant: ${user.tenantId}` : "Platform account"}</p>
        {visibleNav.map((page) => (
          <button
            key={page}
            className={activePage === page ? "nav-btn active" : "nav-btn"}
            onClick={() => setActivePage(page)}
            type="button"
          >
            {pageLabels[page]}
          </button>
        ))}
        <button className="nav-btn" type="button" onClick={onLogout}>
          退出登录 Logout
        </button>
      </aside>

      <main className="glass-card content">
        <header className="content-head">
          <h1>{pageLabels[activePage]}</h1>
          <span>
            {user.account} / {user.role}
          </span>
        </header>
        {error ? <div className="error-box">{error}</div> : null}

        {activePage === "orders" ? (
          <section className="panel">
            {orders.map((order) => (
              <article key={order.id} className="order-row">
                <div>
                  <p className="order-content">{order.content}</p>
                  <small>
                    负责人 {order.ownerCode} | {new Date(order.createdAt).toLocaleString("zh-CN")}
                  </small>
                  {order.imageUrl ? (
                    <a href={resolveImageUrl(order.imageUrl)} target="_blank" rel="noreferrer">
                      查看图片 View Image
                    </a>
                  ) : null}
                </div>
                <div className="order-actions">
                  <select
                    value={order.status}
                    onChange={(event) => void updateStatus(order.id, event.target.value as OrderStatus)}
                  >
                    {Object.entries(statusLabel).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {user.role === "ADMIN" ? (
                    <button type="button" onClick={() => void deleteOrder(order.id)}>
                      删除
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {activePage === "create" ? (
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
                {Object.entries(statusLabel).map(([value, label]) => (
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
        ) : null}

        {activePage === "subAccounts" ? (
          <section className="panel">
            <form className="form" onSubmit={createSubAccount}>
              <input
                placeholder="账号"
                value={createSubForm.account}
                onChange={(event) => setCreateSubForm((prev) => ({ ...prev, account: event.target.value }))}
                required
              />
              <input
                placeholder="初始密码"
                type="password"
                value={createSubForm.password}
                onChange={(event) => setCreateSubForm((prev) => ({ ...prev, password: event.target.value }))}
                required
              />
              <div className="row">
                <select
                  value={createSubForm.role}
                  onChange={(event) =>
                    setCreateSubForm((prev) => ({
                      ...prev,
                      role: event.target.value as Extract<Role, "SUB_ACCOUNT">
                    }))
                  }
                >
                  <option value="SUB_ACCOUNT">子账号</option>
                </select>
                <input
                  placeholder="负责人编号(子账号用)"
                  value={createSubForm.ownerCode}
                  onChange={(event) => setCreateSubForm((prev) => ({ ...prev, ownerCode: event.target.value }))}
                />
              </div>
              <button type="submit">新增账号</button>
            </form>
            {tenantUsers.map((item) => (
              <article key={item.id} className="order-row">
                <div>
                  <p className="order-content">{item.account}</p>
                  <small>
                    {item.role} {item.ownerCode ? `| 负责人 ${item.ownerCode}` : ""}
                  </small>
                </div>
                <div className="order-actions">
                  <button type="button" onClick={() => void toggleUserLogin(item, !item.allowLogin)}>
                    {item.allowLogin ? "禁用登录" : "启用登录"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {activePage === "platform" ? (
          <section className="panel">
            {platformUsers.map((item) => (
              <article key={item.id} className="order-row">
                <div>
                  <p className="order-content">{item.account}</p>
                  <small>
                    role: {item.role} | tenant: {item.tenantId ?? "N/A"}
                  </small>
                </div>
                <div className="order-actions">
                  <button type="button" onClick={() => void toggleUserLogin(item, !item.allowLogin)}>
                    {item.allowLogin ? "Disable" : "Enable"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
  const resolveImageUrl = (url: string | null): string => {
    if (!url) {
      return "#";
    }
    return url.startsWith("http://") || url.startsWith("https://") ? url : `${API_ORIGIN}${url}`;
  };
