import { FormEvent, useEffect, useMemo, useState } from "react";
import logo from "./assets/logow.png";

type Role = "PLATFORM_ADMIN" | "ADMIN" | "SUB_ACCOUNT";
type OrderStatus = "COMPLETED" | "TODO" | "OUT_OF_STOCK" | "IN_PROGRESS";
type MotherPage = "orders" | "create";

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
const API_ORIGIN = API_BASE.replace(/\/api$/, "");
const TOKEN_KEY = "zdt.token";
const USER_KEY = "zdt.user";

const STATUS_LABELS: Record<OrderStatus, string> = {
  COMPLETED: "已完成",
  TODO: "待完成",
  OUT_OF_STOCK: "缺货",
  IN_PROGRESS: "进行中"
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
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [error, setError] = useState("");
  const [motherPage, setMotherPage] = useState<MotherPage>("orders");

  const [orders, setOrders] = useState<Order[]>([]);
  const [platformUsers, setPlatformUsers] = useState<User[]>([]);

  const [loginForm, setLoginForm] = useState({ account: "", password: "" });
  const [createOrderForm, setCreateOrderForm] = useState({
    content: "",
    ownerCode: "1",
    status: "TODO" as OrderStatus,
    image: null as File | null
  });
  const [accountForm, setAccountForm] = useState({
    account: "",
    password: "",
    role: "ADMIN" as Extract<Role, "ADMIN" | "SUB_ACCOUNT">,
    tenantName: "",
    ownerCode: "1",
    managerUserId: ""
  });

  const isLoggedIn = Boolean(token && user);
  const isPlatformAdmin = user?.role === "PLATFORM_ADMIN";
  const isMotherAccount = user?.role === "ADMIN";
  const isSubAccount = user?.role === "SUB_ACCOUNT";

  const managerCandidates = useMemo(
    () => platformUsers.filter((item) => item.role === "ADMIN"),
    [platformUsers]
  );

  const resolveImageUrl = (url: string | null): string =>
    !url ? "#" : url.startsWith("http") ? url : `${API_ORIGIN}${url}`;

  const refreshOrders = async (): Promise<void> => {
    if (!token) return;
    const rows = await apiFetch<Order[]>("/orders", token);
    setOrders(rows);
  };

  const refreshPlatformUsers = async (): Promise<void> => {
    if (!token || !isPlatformAdmin) return;
    const users = await apiFetch<User[]>("/platform/users", token);
    setPlatformUsers(users);
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    setError("");
    void (async () => {
      try {
        await refreshOrders();
        await refreshPlatformUsers();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "请求失败");
      }
    })();
  }, [isLoggedIn, token, isPlatformAdmin]);

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
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setMotherPage("orders");
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
    setError("");
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
      setMotherPage("orders");
      await refreshOrders();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "新增订单失败");
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
      await refreshOrders();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "状态更新失败");
    }
  };

  const deleteOrder = async (orderId: string): Promise<void> => {
    if (!token) return;
    try {
      await apiFetch(`/orders/${orderId}`, token, { method: "DELETE" });
      await refreshOrders();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除订单失败");
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
          account: accountForm.account,
          password: accountForm.password,
          role: accountForm.role,
          tenantName: accountForm.role === "ADMIN" ? accountForm.tenantName : undefined,
          ownerCode: accountForm.role === "SUB_ACCOUNT" ? accountForm.ownerCode : undefined,
          managerUserId: accountForm.role === "SUB_ACCOUNT" ? accountForm.managerUserId : undefined
        })
      });
      setAccountForm({
        account: "",
        password: "",
        role: "ADMIN",
        tenantName: "",
        ownerCode: "1",
        managerUserId: ""
      });
      await refreshPlatformUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创建账号失败");
    }
  };

  const toggleUserLogin = async (targetUser: User, allowLogin: boolean): Promise<void> => {
    if (!token) return;
    try {
      await apiFetch(`/platform/users/${targetUser.id}/login-access`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowLogin })
      });
      await refreshPlatformUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "登录权限更新失败");
    }
  };

  const renderOrderRows = (allowDelete: boolean) => (
    <section className="stack">
      {orders.map((order) => (
        <article key={order.id} className="order-card">
          <div>
            <p className="order-title">{order.content}</p>
            <small>
              负责人 {order.ownerCode} · {new Date(order.createdAt).toLocaleString("zh-CN")}
            </small>
            {order.imageUrl ? (
              <a href={resolveImageUrl(order.imageUrl)} target="_blank" rel="noreferrer">
                查看图片
              </a>
            ) : null}
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
            {allowDelete ? (
              <button className="danger-btn" type="button" onClick={() => void deleteOrder(order.id)}>
                删除
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );

  const renderLogin = () => (
    <div className="app-bg login-layout">
      <div className="bg-orb orb-left" />
      <div className="bg-orb orb-right" />
      <div className="brand-float">
        <img src={logo} alt="ZDT logo" className="brand-logo-large" />
        <div>
          <h1>中大通 ZDT</h1>
          <p>Future B2B Order Command Center</p>
        </div>
      </div>
      <form className="glass login-card" onSubmit={onLogin}>
        <h2>Sign In / 登录</h2>
        <span>账号密码登录，权限由超级管理员控制</span>
        <input
          placeholder="账号 Account"
          value={loginForm.account}
          onChange={(event) => setLoginForm((prev) => ({ ...prev, account: event.target.value }))}
        />
        <input
          type="password"
          placeholder="密码 Password"
          value={loginForm.password}
          onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
        />
        <button type="submit">进入系统</button>
        {error ? <p className="error-text">{error}</p> : null}
      </form>
    </div>
  );

  const renderMother = () => (
    <div className="app-bg role-layout">
      <div className="bg-orb orb-right" />
      <div className="glass shell">
        <aside className="glass side">
          <div className="brand-inline">
            <img src={logo} alt="ZDT logo" className="brand-logo-small" />
            <div>
              <h3>Mother Account</h3>
              <p>企业母账号</p>
            </div>
          </div>
          <button
            type="button"
            className={motherPage === "orders" ? "side-btn active" : "side-btn"}
            onClick={() => setMotherPage("orders")}
          >
            订单列表
          </button>
          <button
            type="button"
            className={motherPage === "create" ? "side-btn active" : "side-btn"}
            onClick={() => setMotherPage("create")}
          >
            新增订单
          </button>
          <button type="button" className="side-btn ghost" onClick={onLogout}>
            退出登录
          </button>
        </aside>
        <main className="main">
          <header className="main-head">
            <h2>{motherPage === "orders" ? "My Orders" : "Create Order"}</h2>
            <span>{user?.account}</span>
          </header>
          {error ? <p className="error-text">{error}</p> : null}
          {motherPage === "orders" ? (
            <>
              <div className="info-banner">母账号仅可新增/删除订单，不可创建账号</div>
              {renderOrderRows(true)}
            </>
          ) : (
            <form className="glass form-card" onSubmit={onCreateOrder}>
              <textarea
                placeholder="粘贴整段订单文本..."
                value={createOrderForm.content}
                onChange={(event) =>
                  setCreateOrderForm((prev) => ({ ...prev, content: event.target.value }))
                }
                required
              />
              <div className="two-col">
                <select
                  value={createOrderForm.ownerCode}
                  onChange={(event) =>
                    setCreateOrderForm((prev) => ({ ...prev, ownerCode: event.target.value }))
                  }
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
              <button type="submit">提交订单</button>
            </form>
          )}
        </main>
      </div>
    </div>
  );

  const renderSub = () => (
    <div className="app-bg role-layout">
      <div className="bg-orb orb-right purple" />
      <div className="glass shell">
        <aside className="glass side">
          <div className="brand-inline">
            <img src={logo} alt="ZDT logo" className="brand-logo-small" />
            <div>
              <h3>Sub Account</h3>
              <p>企业子账号</p>
            </div>
          </div>
          <button type="button" className="side-btn active">
            我的订单
          </button>
          <button type="button" className="side-btn ghost" onClick={onLogout}>
            退出登录
          </button>
        </aside>
        <main className="main">
          <header className="main-head">
            <h2>Status Workspace</h2>
            <span>{user?.account}</span>
          </header>
          <div className="info-banner">仅查看上级母账号创建的订单；仅可修改状态，不能删除</div>
          {error ? <p className="error-text">{error}</p> : null}
          {renderOrderRows(false)}
        </main>
      </div>
    </div>
  );

  const renderPlatform = () => (
    <div className="app-bg role-layout">
      <div className="bg-orb orb-right" />
      <div className="glass shell">
        <aside className="glass side">
          <div className="brand-inline">
            <img src={logo} alt="ZDT logo" className="brand-logo-small" />
            <div>
              <h3>Super Admin</h3>
              <p>超级管理员</p>
            </div>
          </div>
          <button type="button" className="side-btn active">
            控制台
          </button>
          <button type="button" className="side-btn ghost" onClick={onLogout}>
            退出登录
          </button>
        </aside>
        <main className="main">
          <header className="main-head">
            <h2>Tenant & Account Control</h2>
            <span>{user?.account}</span>
          </header>
          {error ? <p className="error-text">{error}</p> : null}

          <section className="stats-grid">
            <article className="glass stat-item">
              <span>母账号数量</span>
              <strong>{platformUsers.filter((x) => x.role === "ADMIN").length}</strong>
            </article>
            <article className="glass stat-item">
              <span>子账号数量</span>
              <strong>{platformUsers.filter((x) => x.role === "SUB_ACCOUNT").length}</strong>
            </article>
            <article className="glass stat-item">
              <span>总账号</span>
              <strong>{platformUsers.length}</strong>
            </article>
          </section>

          <section className="two-pane">
            <form className="glass form-card" onSubmit={onCreateAccount}>
              <h4>创建企业母账号 / 子账号</h4>
              <div className="two-col">
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
                <input
                  placeholder="企业名称（创建母账号时）"
                  value={accountForm.tenantName}
                  onChange={(event) =>
                    setAccountForm((prev) => ({ ...prev, tenantName: event.target.value }))
                  }
                  required={accountForm.role === "ADMIN"}
                />
              </div>
              <input
                placeholder="账号（母账号需 01/02/03 结尾）"
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
              {accountForm.role === "SUB_ACCOUNT" ? (
                <div className="two-col">
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
                    onChange={(event) =>
                      setAccountForm((prev) => ({ ...prev, ownerCode: event.target.value }))
                    }
                  />
                </div>
              ) : null}
              <button type="submit">创建账号</button>
            </form>

            <div className="glass form-card">
              <h4>创建规则</h4>
              <p>创建企业步骤就是创建母账号，不需要企业编码。</p>
              <p>创建子账号时选择上级母账号，系统自动归属企业。</p>
              <p>母账号只拥有订单新增/删除权限。</p>
            </div>
          </section>

          <section className="stack">
            {platformUsers.map((item) => (
              <article key={item.id} className="order-card">
                <div>
                  <p className="order-title">{item.account}</p>
                  <small>
                    {item.role} · tenant: {item.tenantId ?? "N/A"}
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
        </main>
      </div>
    </div>
  );

  if (!isLoggedIn) return renderLogin();
  if (isPlatformAdmin) return renderPlatform();
  if (isMotherAccount) return renderMother();
  if (isSubAccount) return renderSub();
  return null;
}

export default App;

