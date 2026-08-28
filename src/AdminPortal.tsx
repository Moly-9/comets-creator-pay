import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Download,
  Eye,
  FileText,
  FolderKanban,
  History,
  KeyRound,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  ReceiptText,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ADMIN_PAGE_SIZES,
  type AdminPageSize,
  clampAdminPage,
  getAdminPageTokens,
  paginateAdminItems,
} from "./admin-pagination";
import {
  maskSensitiveValue,
  type AdminProfilePatch,
  type AdminUserFilters,
  type CreateManagedUserInput,
} from "./admin-store";
import { contractStatusLabel } from "./contract-status";
import { services, summarizeAmountsByCurrency } from "./services";
import type {
  AccountStatus,
  AdminBusinessData,
  AdminBusinessRecord,
  AdminSettings,
  AdminUserDetail,
  AuditEvent,
  Contract,
  Invoice,
  InvoiceStatus,
  InvitationStatus,
  RequestProject,
  Session,
  SensitiveFieldKey,
  UserAccount,
  UserRole,
  VerificationStatus,
} from "./types";

type AdminSessionValue = {
  session: Session;
  logout(): void;
};

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

const useAdminSession = () => {
  const value = useContext(AdminSessionContext);
  if (!value) throw new Error("Admin session is missing");
  return value;
};

const roleLabel: Record<UserRole, string> = {
  ADMIN: "管理员",
  CREATOR: "创作者",
};

const accountStatusLabel: Record<AccountStatus, string> = {
  ACTIVE: "已启用",
  DISABLED: "已停用",
};

const verificationLabel: Record<VerificationStatus, string> = {
  PENDING: "待认证",
  VERIFIED: "已认证",
  CHANGES_REQUESTED: "待修正",
};

const invitationLabel: Record<InvitationStatus, string> = {
  NOT_REQUIRED: "自主注册",
  PENDING: "待接受",
  ACCEPTED: "已接受",
  EXPIRED: "已过期",
};

const auditActionLabel: Record<AuditEvent["action"], string> = {
  LOGIN: "登录",
  USER_CREATED: "创建账号",
  USER_INVITED: "邀请用户",
  USER_STATUS_CHANGED: "账号状态变更",
  PASSWORD_RESET_SENT: "密码重置",
  PROFILE_UPDATED: "档案更新",
  VERIFICATION_UPDATED: "认证状态更新",
  CORRECTION_CREATED: "资料退回",
  CORRECTION_AUTO_RESOLVED: "修正自动关闭",
  SENSITIVE_DATA_REVEALED: "查看敏感信息",
  USERS_EXPORTED: "导出用户",
  SETTINGS_UPDATED: "更新设置",
  EXTERNAL_DATA_SYNCED: "外部数据同步",
  EXTERNAL_DATA_REJECTED: "外部数据拒绝",
};

function AdminBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "purple";
}) {
  return <span className={`admin-badge admin-badge-${tone}`}>{label}</span>;
}

function accountStatusTone(status: AccountStatus) {
  return status === "ACTIVE" ? "success" : "danger";
}

function verificationTone(status: VerificationStatus) {
  if (status === "VERIFIED") return "success";
  if (status === "CHANGES_REQUESTED") return "danger";
  return "warning";
}

function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  );
}

function useAdminPagination<T>(items: T[], resetKey: string) {
  const [pageSize, setPageSizeState] = useState<AdminPageSize>(20);
  const [page, setPageState] = useState(1);
  const pagination = useMemo(
    () => paginateAdminItems(items, page, pageSize),
    [items, page, pageSize],
  );

  useEffect(() => {
    setPageState(1);
  }, [resetKey]);

  useEffect(() => {
    setPageState((current) =>
      clampAdminPage(current, items.length, pageSize),
    );
  }, [items.length, pageSize]);

  return {
    ...pagination,
    pageSize,
    setPage: (nextPage: number) =>
      setPageState(clampAdminPage(nextPage, items.length, pageSize)),
    setPageSize: (nextPageSize: AdminPageSize) => {
      setPageSizeState(nextPageSize);
      setPageState(1);
    },
  };
}

function AdminPagination({
  totalItems,
  page,
  pageSize,
  totalPages,
  startIndex,
  endIndex,
  unit,
  onPageChange,
  onPageSizeChange,
}: {
  totalItems: number;
  page: number;
  pageSize: AdminPageSize;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  unit: string;
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: AdminPageSize): void;
}) {
  const [jumpValue, setJumpValue] = useState(String(page));
  const [jumpToken, setJumpToken] = useState<
    "start-ellipsis" | "end-ellipsis" | null
  >(null);

  useEffect(() => {
    setJumpValue(String(page));
    setJumpToken(null);
  }, [page]);

  const jumpToPage = () => {
    const parsedPage = Number(jumpValue);
    const targetPage = Number.isFinite(parsedPage)
      ? Math.min(Math.max(Math.trunc(parsedPage), 1), totalPages)
      : page;
    onPageChange(targetPage);
    setJumpValue(String(targetPage));
    setJumpToken(null);
  };

  return (
    <footer className="admin-pagination" aria-label={`${unit}分页`}>
      <div className="admin-pagination-content">
        <div className="admin-pagination-meta">共{totalItems}条</div>
        <nav className="admin-page-buttons" aria-label={`${unit}页码`}>
          <button
            type="button"
            aria-label="上一页"
            title="上一页"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={13} />
          </button>
          {getAdminPageTokens(page, totalPages).map((token) =>
            typeof token === "number" ? (
              <button
                type="button"
                aria-label={`第 ${token} 页`}
                aria-current={token === page ? "page" : undefined}
                className={token === page ? "active" : ""}
                key={token}
                onClick={() => onPageChange(token)}
              >
                {token}
              </button>
            ) : jumpToken === token ? (
              <input
                className="admin-page-jump-input"
                type="number"
                min={1}
                max={totalPages}
                inputMode="numeric"
                aria-label={`跳转${unit}页码`}
                value={jumpValue}
                key={token}
                autoFocus
                onChange={(event) => setJumpValue(event.target.value)}
                onBlur={jumpToPage}
                onKeyDown={(event) => {
                  if (event.key === "Enter") jumpToPage();
                  if (event.key === "Escape") {
                    setJumpValue(String(page));
                    setJumpToken(null);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="admin-page-ellipsis"
                aria-label="输入指定页码"
                title="输入指定页码"
                key={token}
                onClick={() => {
                  setJumpValue(String(page));
                  setJumpToken(token);
                }}
              >
                ...
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="下一页"
            title="下一页"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={13} />
          </button>
        </nav>
        <label className="admin-page-size">
          <select
            aria-label={`${unit}每页条数`}
            value={pageSize}
            onChange={(event) =>
              onPageSizeChange(Number(event.target.value) as AdminPageSize)
            }
          >
            {ADMIN_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}条/页
              </option>
            ))}
          </select>
          <ChevronDown className="admin-page-size-chevron" size={12} />
        </label>
      </div>
    </footer>
  );
}

function AdminModal({
  title,
  description,
  children,
  onClose,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose(): void;
  footer: ReactNode;
}) {
  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <header>
          <div>
            <h2 id="admin-modal-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button
            type="button"
            className="admin-icon-button"
            aria-label="关闭"
            title="关闭"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
        <footer>{footer}</footer>
      </section>
    </div>
  );
}

function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose(): void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="admin-toast" role="status">
      <Check size={16} />
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="关闭提醒">
        <X size={14} />
      </button>
    </div>
  );
}

function AdminSearchControl({
  value,
  onChange,
  placeholder,
  label = placeholder,
}: {
  value: string;
  onChange(value: string): void;
  placeholder: string;
  label?: string;
}) {
  return (
    <div className="admin-filter-control admin-search-control">
      <Search size={15} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      {value ? (
        <button
          type="button"
          aria-label="清空搜索"
          title="清空搜索"
          onClick={() => onChange("")}
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}

function AdminSelectControl({
  value,
  onChange,
  label,
  icon,
  children,
}: {
  value: string;
  onChange(value: string): void;
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const active = value !== "ALL" && value !== "";
  return (
    <div
      className={`admin-filter-control admin-select-control${active ? " is-active" : ""}`}
    >
      <span className="admin-filter-leading-icon" aria-hidden="true">
        {icon}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {children}
      </select>
      <ChevronDown
        className="admin-filter-chevron"
        size={14}
        aria-hidden="true"
      />
    </div>
  );
}

function AdminDateControl({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange(value: string): void;
  label: string;
}) {
  return (
    <div
      className={`admin-filter-control admin-date-control${value ? " is-active" : ""}`}
    >
      <CalendarDays size={15} aria-hidden="true" />
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        title={label}
      />
    </div>
  );
}

const adminBusinessNav = [
  { to: "/admin", label: "请款项目", icon: FolderKanban, end: true },
  { to: "/admin/contracts", label: "合同", icon: FileText },
  { to: "/admin/invoices", label: "Invoice", icon: ReceiptText },
];

const adminSettingsNav = [
  { to: "/admin/settings/users", label: "用户管理", icon: Users },
  { to: "/admin/settings/audit-logs", label: "操作日志", icon: History },
];

export function AdminLayout({
  session,
  logout,
}: {
  session: Session;
  logout(): void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(
    location.pathname.startsWith("/admin/settings"),
  );
  const navigate = useNavigate();
  const accessDenied = (
    location.state as { accessDenied?: string } | null
  )?.accessDenied;
  useEffect(() => {
    if (location.pathname.startsWith("/admin/settings")) {
      setSettingsOpen(true);
    }
  }, [location.pathname]);
  const doLogout = () => {
    logout();
    navigate("/login");
  };
  return (
    <AdminSessionContext.Provider value={{ session, logout }}>
      <div className="admin-shell">
        <header className="admin-topbar">
          <div className="admin-brand-lockup">
            <button
              type="button"
              className="admin-mobile-menu"
              onClick={() => setDrawerOpen(true)}
              aria-label="打开导航"
            >
              <Menu size={20} />
            </button>
            <Link to="/admin" className="admin-brand">
              <img src="/comets-mark.svg" alt="" />
              <span><strong>COMETS</strong><small>Pay · 管理员端</small></span>
            </Link>
          </div>
          <div className="admin-topbar-account">
            <AdminBadge label="系统管理员" tone="purple" />
            <span className="admin-avatar">{session.email.slice(0, 1).toUpperCase()}</span>
            <span><strong>{session.email}</strong><small>用户与身份运营</small></span>
          </div>
        </header>
        <aside className={`admin-sidebar ${drawerOpen ? "admin-sidebar-open" : ""}`}>
          <div className="admin-sidebar-mobile-head">
            <span>管理员导航</span>
            <button
              type="button"
              className="admin-icon-button"
              onClick={() => setDrawerOpen(false)}
              aria-label="关闭导航"
            >
              <X size={18} />
            </button>
          </div>
          <nav>
            <span className="admin-nav-label">业务管理</span>
            {adminBusinessNav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) =>
                  `admin-nav-item ${isActive ? "admin-nav-active" : ""}`
                }
              >
                <Icon size={17} />
                <span>{label}</span>
                <ChevronRight size={14} />
              </NavLink>
            ))}
            <button
              type="button"
              className={`admin-nav-item admin-nav-group ${location.pathname.startsWith("/admin/settings") ? "admin-nav-group-active" : ""}`}
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings size={17} />
              <span>系统设置</span>
              <ChevronDown className={settingsOpen ? "is-open" : ""} size={14} />
            </button>
            {settingsOpen ? (
              <div className="admin-nav-children">
                {adminSettingsNav.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) =>
                      `admin-nav-child ${isActive ? "admin-nav-child-active" : ""}`
                    }
                  >
                    <Icon size={15} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            ) : null}
          </nav>
          <button type="button" className="admin-sidebar-logout" onClick={doLogout}>
            <LogOut size={17} />
            退出登录
          </button>
        </aside>
        {drawerOpen ? (
          <button
            type="button"
            className="admin-sidebar-scrim"
            onClick={() => setDrawerOpen(false)}
            aria-label="关闭导航"
          />
        ) : null}
        <main className="admin-main">
          {accessDenied ? (
            <div className="role-access-notice" role="alert">
              <AlertCircle size={16} />
              <span>{accessDenied}</span>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </AdminSessionContext.Provider>
  );
}

const adminInvoiceStatus: Record<
  InvoiceStatus,
  { label: string; requestLabel: string; tone: "warning" | "info" | "purple" | "danger" | "success" }
> = {
  PENDING_CONFIRMATION: { label: "待确认", requestLabel: "待确认", tone: "warning" },
  DRAFT_SIGNATURE: { label: "待确认", requestLabel: "待确认", tone: "warning" },
  PENDING_REVIEW: { label: "待审核", requestLabel: "审核中", tone: "info" },
  CHANGES_REQUIRED: { label: "待修改", requestLabel: "待修改", tone: "danger" },
  APPROVED: { label: "待付款", requestLabel: "待付款", tone: "purple" },
  PAYMENT_FAILED: { label: "付款异常", requestLabel: "付款异常", tone: "danger" },
  PAID: { label: "已付款", requestLabel: "已完成", tone: "success" },
};

const adminInvoiceOrder: InvoiceStatus[] = [
  "PENDING_CONFIRMATION",
  "DRAFT_SIGNATURE",
  "PENDING_REVIEW",
  "CHANGES_REQUIRED",
  "APPROVED",
  "PAYMENT_FAILED",
  "PAID",
];

const normalizeBusinessSearch = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

const summarizeAdminAmounts = (items: Array<{ amount: string }>) => {
  const summaries = summarizeAmountsByCurrency(items);
  if (!summaries.length) return "-";
  return summaries
    .map(({ currency, formattedAmount }) => `${currency} ${formattedAmount}`)
    .join(" · ");
};

function AdminRequestProgress({ status }: { status: InvoiceStatus }) {
  const steps =
    status === "PAID"
      ? ["success", "success", "success", "success"]
      : status === "PAYMENT_FAILED"
        ? ["success", "success", "success", "blocked"]
        : status === "APPROVED"
          ? ["success", "success", "success", "current"]
          : status === "PENDING_REVIEW"
            ? ["success", "success", "current", "pending"]
            : ["success", "current", "pending", "pending"];
  return (
    <div
      className="request-mini-progress"
      aria-label={`当前请款状态：${adminInvoiceStatus[status].requestLabel}`}
    >
      {["合同", "Invoice", "审批", "付款"].map((label, index) => (
        <div className={`request-mini-step step-${steps[index]}`} key={label}>
          <span>{steps[index] === "success" ? <Check size={10} /> : null}</span>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}

function useAdminBusinessData() {
  const [data, setData] = useState<AdminBusinessData | null>(null);
  useEffect(() => {
    services.adminBusiness.list().then((result) => setData(result.data));
  }, []);
  return data;
}

interface AdminRequestRow {
  creator: AdminBusinessRecord<RequestProject>["creator"];
  request: RequestProject;
  contract: Contract;
  invoice: Invoice;
}

export function AdminRequestProjectsPage() {
  const data = useAdminBusinessData();
  const [query, setQuery] = useState("");
  const [creatorId, setCreatorId] = useState("ALL");
  const [status, setStatus] = useState<InvoiceStatus | "ALL">("ALL");
  const rows = useMemo<AdminRequestRow[]>(() => {
    if (!data) return [];
    return data.requests.flatMap(({ creator, record: request }) => {
      const projectKey = normalizeBusinessSearch(request.projectName);
      const invoice = data.invoices.find(
        (item) =>
          item.creator.id === creator.id &&
          (request.invoiceIds.includes(item.record.id) ||
            normalizeBusinessSearch(item.record.projectName) === projectKey),
      )?.record;
      const contract = data.contracts.find(
        (item) =>
          item.creator.id === creator.id &&
          (request.contractIds.includes(item.record.id) ||
            normalizeBusinessSearch(item.record.projectName) === projectKey),
      )?.record;
      return invoice && contract ? [{ creator, request, invoice, contract }] : [];
    });
  }, [data]);
  const creators = useMemo(
    () =>
      [...new Map(rows.map((item) => [item.creator.id, item.creator])).values()],
    [rows],
  );
  const normalizedQuery = normalizeBusinessSearch(query);
  const filtered = rows.filter((item) => {
    const searchable = normalizeBusinessSearch(
      [
        item.request.projectName,
        item.request.brand,
        item.request.id,
        item.contract.id,
        item.invoice.id,
        item.creator.name,
        item.creator.id,
      ].join(" "),
    );
    return (
      (creatorId === "ALL" || item.creator.id === creatorId) &&
      (status === "ALL" || item.invoice.status === status) &&
      (!normalizedQuery || searchable.includes(normalizedQuery))
    );
  });
  const requestPagination = useAdminPagination(
    filtered,
    `${normalizedQuery}|${creatorId}|${status}`,
  );
  const signatureRows = rows.filter(
    (item) => item.invoice.status === "DRAFT_SIGNATURE",
  );
  const processingRows = rows.filter((item) =>
    ["PENDING_REVIEW", "APPROVED", "PAYMENT_FAILED"].includes(
      item.invoice.status,
    ),
  );
  const paidRows = rows.filter((item) => item.invoice.status === "PAID");
  const allProjectAmounts = useMemo(
    () => summarizeAmountsByCurrency(rows.map((item) => item.request)),
    [rows],
  );

  if (!data) {
    return (
      <div className="admin-page-stack">
        <div className="admin-loading">
          <RefreshCcw className="spin" size={20} /> 正在加载请款项目
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-stack admin-business-page">
      <PageHeader
        title="请款项目"
        description="汇总本系统所有创作者已匹配合同与 Invoice 的请款项目。"
      />
      <section
        className="request-money-overview admin-request-money-overview"
        aria-label="全平台请款金额概览"
      >
        <article>
          <i className="amber" />
          <div><span>待签署金额</span><strong>{summarizeAdminAmounts(signatureRows.map((item) => item.request))}</strong></div>
          <small>{signatureRows.length} 个项目</small>
        </article>
        <article>
          <i className="blue" />
          <div><span>处理中金额</span><strong>{summarizeAdminAmounts(processingRows.map((item) => item.request))}</strong></div>
          <small>{processingRows.length} 个项目</small>
        </article>
        <article>
          <i className="green" />
          <div><span>已打款金额</span><strong>{summarizeAdminAmounts(paidRows.map((item) => item.request))}</strong></div>
          <small>{paidRows.length} 个项目</small>
        </article>
        <article className="admin-request-total-card">
          <i className="purple" />
          <div>
            <span>项目总数</span>
            <strong>{rows.length} 个项目</strong>
            <div className="admin-currency-breakdown">
              {allProjectAmounts.map((summary) => (
                <span key={summary.currency}>
                  <b>{summary.currency} {summary.formattedAmount}</b>
                  <small>{summary.count} 个项目</small>
                </span>
              ))}
            </div>
          </div>
        </article>
      </section>
      <section className="admin-panel admin-table-panel">
        <header className="admin-panel-heading">
          <div><h2>全部请款项目</h2><p>仅展示合同与 Invoice 项目名匹配的数据</p></div>
          <FolderKanban size={18} />
        </header>
        <div className="admin-business-toolbar">
          <div className="admin-business-filter-fields">
            <AdminSearchControl
              value={query}
              onChange={setQuery}
              placeholder="搜索项目、达人、Creator ID、合同或 Invoice"
            />
            <AdminSelectControl
              value={creatorId}
              onChange={setCreatorId}
              label="筛选创作者"
              icon={<Users size={15} />}
            >
              <option value="ALL">全部创作者</option>
              {creators.map((creator) => (
                <option key={creator.id} value={creator.id}>
                  {creator.name} · {creator.id}
                </option>
              ))}
            </AdminSelectControl>
          </div>
          <div className="admin-status-tabs" role="tablist" aria-label="请款状态筛选">
            {(["ALL", ...adminInvoiceOrder] as const).map((value) => (
              <button
                type="button"
                role="tab"
                aria-selected={status === value}
                className={status === value ? "active" : ""}
                key={value}
                onClick={() => setStatus(value)}
              >
                {value === "ALL"
                  ? "全部"
                  : adminInvoiceStatus[value].requestLabel}
              </button>
            ))}
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-data-table admin-request-table">
            <thead>
              <tr>
                <th>项目 / 请款编号</th>
                <th>达人</th>
                <th>金额</th>
                <th>合同状态</th>
                <th>Invoice 状态</th>
                <th>请款状态</th>
                <th>更新时间</th>
                <th>请款进度</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {requestPagination.items.map((item) => {
                const meta = adminInvoiceStatus[item.invoice.status];
                return (
                  <tr key={`${item.creator.id}-${item.request.id}`}>
                    <td><strong>{item.request.projectName}</strong><small className="admin-table-block">{item.request.id} · {item.request.brand}</small></td>
                    <td><strong>{item.creator.name}</strong><small className="admin-table-block">{item.creator.id}</small></td>
                    <td><strong>{item.request.amount}</strong></td>
                    <td><AdminBadge label={contractStatusLabel[item.contract.status]} tone={item.contract.status === "已付款" ? "success" : "info"} /></td>
                    <td><AdminBadge label={meta.label} tone={meta.tone} /></td>
                    <td><AdminBadge label={meta.requestLabel} tone={meta.tone} /></td>
                    <td><span className="admin-table-secondary">{item.request.updatedAt}</span></td>
                    <td><AdminRequestProgress status={item.invoice.status} /></td>
                    <td>
                      <Link
                        className="admin-icon-link"
                        to={`/admin/requests/${item.creator.id}/${item.request.id}`}
                        title="查看请款项目详情"
                      >
                        <Eye size={15} /><span>查看</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="admin-business-mobile-list">
          {requestPagination.items.map((item) => {
            const meta = adminInvoiceStatus[item.invoice.status];
            return (
              <article key={`${item.creator.id}-${item.request.id}`}>
                <header><strong>{item.request.projectName}</strong><AdminBadge label={meta.requestLabel} tone={meta.tone} /></header>
                <small className="admin-mobile-record-id">{item.request.id} · {item.request.brand}</small>
                <dl>
                  <div><dt>达人</dt><dd>{item.creator.name} · {item.creator.id}</dd></div>
                  <div><dt>金额</dt><dd>{item.request.amount}</dd></div>
                  <div><dt>合同状态</dt><dd>{contractStatusLabel[item.contract.status]}</dd></div>
                  <div><dt>Invoice 状态</dt><dd>{meta.label}</dd></div>
                  <div><dt>更新时间</dt><dd>{item.request.updatedAt}</dd></div>
                </dl>
                <AdminRequestProgress status={item.invoice.status} />
                <Link to={`/admin/requests/${item.creator.id}/${item.request.id}`}>
                  查看请款项目 <ChevronRight size={14} />
                </Link>
              </article>
            );
          })}
        </div>
        {!filtered.length ? <div className="admin-empty">没有符合筛选条件的请款项目</div> : null}
        <AdminPagination
          totalItems={filtered.length}
          page={requestPagination.currentPage}
          pageSize={requestPagination.pageSize}
          totalPages={requestPagination.totalPages}
          startIndex={requestPagination.startIndex}
          endIndex={requestPagination.endIndex}
          unit="个项目"
          onPageChange={requestPagination.setPage}
          onPageSizeChange={requestPagination.setPageSize}
        />
      </section>
    </div>
  );
}

export function AdminContractsPage() {
  const data = useAdminBusinessData();
  const [query, setQuery] = useState("");
  const [creatorId, setCreatorId] = useState("ALL");
  const [status, setStatus] = useState<Contract["status"] | "ALL">("ALL");
  const rows = data?.contracts || [];
  const creators = [
    ...new Map(rows.map((item) => [item.creator.id, item.creator])).values(),
  ];
  const normalizedQuery = normalizeBusinessSearch(query);
  const filtered = rows.filter(
    ({ creator, record }) =>
      (creatorId === "ALL" || creator.id === creatorId) &&
      (status === "ALL" || record.status === status) &&
      (!normalizedQuery ||
        normalizeBusinessSearch(
          `${record.projectName} ${record.campaignName} ${record.brand} ${record.id} ${record.orderId} ${creator.name} ${creator.id}`,
        ).includes(normalizedQuery)),
  );
  const contractPagination = useAdminPagination(
    filtered,
    `${normalizedQuery}|${creatorId}|${status}`,
  );
  const counts: Record<Contract["status"], number> = {
    未请款: rows.filter((item) => item.record.status === "未请款").length,
    请款中: rows.filter((item) => item.record.status === "请款中").length,
    已付款: rows.filter((item) => item.record.status === "已付款").length,
  };

  if (!data) return <div className="admin-page-stack"><div className="admin-loading"><RefreshCcw className="spin" size={20} /> 正在加载合同</div></div>;

  return (
    <div className="admin-page-stack admin-business-page">
      <PageHeader title="合同" description="查看本系统所有创作者的合同与当前请款状态。" />
      <section className="admin-business-summary admin-business-summary-card" aria-label="合同概览">
        <article><span>合同总数</span><strong>{rows.length}</strong><small>本系统全部合同</small></article>
        <article><span>未付款</span><strong>{counts.未请款}</strong><small>暂无关联 Invoice</small></article>
        <article><span>付款中</span><strong>{counts.请款中}</strong><small>已进入 Invoice 流程</small></article>
        <article><span>已付款</span><strong>{counts.已付款}</strong><small>款项已完成支付</small></article>
      </section>
      <section className="admin-panel admin-table-panel">
        <header className="admin-panel-heading"><div><h2>全部合同</h2><p>只读查看与下载</p></div><FileText size={18} /></header>
        <div className="admin-business-toolbar">
          <div className="admin-business-filter-fields">
            <AdminSearchControl value={query} onChange={setQuery} placeholder="搜索合同、项目、品牌、达人或 Creator ID" />
            <AdminSelectControl value={creatorId} onChange={setCreatorId} label="筛选创作者" icon={<Users size={15} />}>
              <option value="ALL">全部创作者</option>
              {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name} · {creator.id}</option>)}
            </AdminSelectControl>
          </div>
          <div className="admin-status-tabs" role="tablist" aria-label="合同状态筛选">
            {(["ALL", "未请款", "请款中", "已付款"] as const).map((value) => (
              <button type="button" role="tab" aria-selected={status === value} className={status === value ? "active" : ""} key={value} onClick={() => setStatus(value)}>
                {value === "ALL" ? "全部" : contractStatusLabel[value]}
              </button>
            ))}
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-data-table admin-contract-table">
            <thead><tr><th>合同</th><th>项目 / 品牌</th><th>达人</th><th>合同金额</th><th>合同状态</th><th>生效日期</th><th>更新日期</th><th>操作</th></tr></thead>
            <tbody>
              {contractPagination.items.map(({ creator, record }) => (
                <tr key={`${creator.id}-${record.id}`}>
                  <td><strong>{record.id}</strong><small className="admin-table-block">{record.orderId}</small></td>
                  <td><strong>{record.projectName}</strong><small className="admin-table-block">{record.brand}</small></td>
                  <td><strong>{creator.name}</strong><small className="admin-table-block">{creator.id}</small></td>
                  <td><strong>{record.amount}</strong></td>
                  <td><AdminBadge label={contractStatusLabel[record.status]} tone={record.status === "已付款" ? "success" : record.status === "请款中" ? "info" : "purple"} /></td>
                  <td><span className="admin-table-secondary">{record.effectiveDate}</span></td>
                  <td><span className="admin-table-secondary">{record.updatedAt}</span></td>
                  <td><div className="admin-inline-actions"><Link className="admin-icon-link" to={`/admin/contracts/${creator.id}/${record.id}`} title="查看合同详情"><Eye size={15} /><span>查看</span></Link><a className="admin-icon-link" href={record.documentUrl} download={record.fileName} title="下载合同"><Download size={15} /><span>下载</span></a></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-business-mobile-list">
          {contractPagination.items.map(({ creator, record }) => (
            <article key={`${creator.id}-${record.id}`}>
              <header><strong>{record.projectName}</strong><AdminBadge label={contractStatusLabel[record.status]} tone={record.status === "已付款" ? "success" : record.status === "请款中" ? "info" : "purple"} /></header>
              <small className="admin-mobile-record-id">{record.id} · {record.orderId}</small>
              <dl><div><dt>品牌</dt><dd>{record.brand}</dd></div><div><dt>达人</dt><dd>{creator.name} · {creator.id}</dd></div><div><dt>合同金额</dt><dd>{record.amount}</dd></div><div><dt>生效日期</dt><dd>{record.effectiveDate}</dd></div><div><dt>更新日期</dt><dd>{record.updatedAt}</dd></div></dl>
              <div className="admin-business-mobile-actions"><Link to={`/admin/contracts/${creator.id}/${record.id}`}><Eye size={14} /> 查看</Link><a href={record.documentUrl} download={record.fileName}><Download size={14} /> 下载</a></div>
            </article>
          ))}
        </div>
        {!filtered.length ? <div className="admin-empty">没有符合筛选条件的合同</div> : null}
        <AdminPagination
          totalItems={filtered.length}
          page={contractPagination.currentPage}
          pageSize={contractPagination.pageSize}
          totalPages={contractPagination.totalPages}
          startIndex={contractPagination.startIndex}
          endIndex={contractPagination.endIndex}
          unit="份合同"
          onPageChange={contractPagination.setPage}
          onPageSizeChange={contractPagination.setPageSize}
        />
      </section>
    </div>
  );
}

export function AdminInvoicesPage() {
  const data = useAdminBusinessData();
  const [query, setQuery] = useState("");
  const [creatorId, setCreatorId] = useState("ALL");
  const [status, setStatus] = useState<InvoiceStatus | "ALL">("ALL");
  const rows = useMemo(
    () =>
      [...(data?.invoices || [])].sort(
        (left, right) =>
          right.record.issuedAt.localeCompare(left.record.issuedAt) ||
          right.record.id.localeCompare(left.record.id),
      ),
    [data],
  );
  const statusCounts = useMemo<Record<InvoiceStatus, number>>(
    () => ({
      PENDING_CONFIRMATION: rows.filter(
        (item) => item.record.status === "PENDING_CONFIRMATION",
      ).length,
      DRAFT_SIGNATURE: rows.filter(
        (item) => item.record.status === "DRAFT_SIGNATURE",
      ).length,
      PENDING_REVIEW: rows.filter(
        (item) => item.record.status === "PENDING_REVIEW",
      ).length,
      CHANGES_REQUIRED: rows.filter(
        (item) => item.record.status === "CHANGES_REQUIRED",
      ).length,
      APPROVED: rows.filter(
        (item) => item.record.status === "APPROVED",
      ).length,
      PAYMENT_FAILED: rows.filter(
        (item) => item.record.status === "PAYMENT_FAILED",
      ).length,
      PAID: rows.filter(
        (item) => item.record.status === "PAID",
      ).length,
    }),
    [rows],
  );
  const creators = [
    ...new Map(rows.map((item) => [item.creator.id, item.creator])).values(),
  ];
  const normalizedQuery = normalizeBusinessSearch(query);
  const filtered = rows.filter(
    ({ creator, record }) =>
      (creatorId === "ALL" || creator.id === creatorId) &&
      (status === "ALL" || record.status === status) &&
      (!normalizedQuery ||
        normalizeBusinessSearch(
          `${record.id} ${record.projectName} ${record.brand} ${creator.name} ${creator.id}`,
        ).includes(normalizedQuery)),
  );
  const invoicePagination = useAdminPagination(
    filtered,
    `${normalizedQuery}|${creatorId}|${status}`,
  );

  if (!data) return <div className="admin-page-stack"><div className="admin-loading"><RefreshCcw className="spin" size={20} /> 正在加载 Invoice</div></div>;

  return (
    <div className="admin-page-stack admin-business-page">
      <PageHeader title="Invoice" description="查看本系统所有创作者的 Invoice 与付款状态。" />
      <section
        className="admin-business-summary admin-business-summary-card admin-invoice-summary"
        aria-label="Invoice 数据总览"
      >
        <article><span>Invoice 总数</span><strong>{rows.length}</strong><small>本系统全部 Invoice</small></article>
        <article><span>待签署</span><strong>{statusCounts.DRAFT_SIGNATURE}</strong><small>等待创作者签署</small></article>
        <article><span>待审核</span><strong>{statusCounts.PENDING_REVIEW}</strong><small>正在进行资料审核</small></article>
        <article><span>已通过审核</span><strong>{statusCounts.APPROVED}</strong><small>审核完成，等待付款</small></article>
        <article><span>付款异常</span><strong>{statusCounts.PAYMENT_FAILED}</strong><small>付款流程需要处理</small></article>
        <article><span>已打款</span><strong>{statusCounts.PAID}</strong><small>款项已完成支付</small></article>
      </section>
      <section className="admin-panel admin-table-panel">
        <header className="admin-panel-heading"><div><h2>全部 Invoice</h2><p>业务数据由外部系统同步，仅供查看与下载</p></div><ReceiptText size={18} /></header>
        <div className="admin-business-toolbar">
          <div className="admin-business-filter-fields">
            <AdminSearchControl value={query} onChange={setQuery} placeholder="搜索 Invoice、项目、达人或 Creator ID" />
            <AdminSelectControl value={creatorId} onChange={setCreatorId} label="筛选创作者" icon={<Users size={15} />}>
              <option value="ALL">全部创作者</option>
              {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name} · {creator.id}</option>)}
            </AdminSelectControl>
          </div>
          <div className="admin-status-tabs" role="tablist" aria-label="Invoice 状态筛选">
            {(["ALL", ...adminInvoiceOrder] as const).map((value) => (
              <button type="button" role="tab" aria-selected={status === value} className={status === value ? "active" : ""} key={value} onClick={() => setStatus(value)}>
                {value === "ALL" ? "全部" : adminInvoiceStatus[value].label}
                <span>{rows.filter((item) => value === "ALL" || item.record.status === value).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-data-table admin-invoice-table">
            <thead><tr><th>Invoice</th><th>关联项目</th><th>达人</th><th>渠道</th><th>金额</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
            <tbody>
              {invoicePagination.items.map(({ creator, record }) => {
                const meta = adminInvoiceStatus[record.status];
                return (
                  <tr key={`${creator.id}-${record.id}`}>
                    <td><strong>{record.id}</strong><small className="admin-table-block">{record.issuedAt}</small></td>
                    <td><strong>{record.projectName}</strong><small className="admin-table-block">{record.brand}</small></td>
                    <td><strong>{creator.name}</strong><small className="admin-table-block">{creator.id}</small></td>
                    <td>{record.channel}</td>
                    <td><strong>{record.amount}</strong></td>
                    <td><AdminBadge label={meta.label} tone={meta.tone} /></td>
                    <td><span className="admin-table-secondary">{record.updatedAt}</span></td>
                    <td><div className="admin-inline-actions"><Link className="admin-icon-link" to={`/admin/invoices/${creator.id}/${record.id}`} title="查看 Invoice 详情"><Eye size={15} /><span>查看</span></Link><a className="admin-icon-link" href="/INV-20260723-001-Alex-Ruiz.pdf" download={`${record.id}.pdf`} title="下载 Invoice"><Download size={15} /><span>下载</span></a></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="admin-business-mobile-list">
          {invoicePagination.items.map(({ creator, record }) => {
            const meta = adminInvoiceStatus[record.status];
            return (
              <article key={`${creator.id}-${record.id}`}>
                <header><strong>{record.id}</strong><AdminBadge label={meta.label} tone={meta.tone} /></header>
                <small className="admin-mobile-record-id">{record.projectName} · {record.brand}</small>
                <dl><div><dt>达人</dt><dd>{creator.name} · {creator.id}</dd></div><div><dt>渠道</dt><dd>{record.channel}</dd></div><div><dt>金额</dt><dd>{record.amount}</dd></div><div><dt>更新时间</dt><dd>{record.updatedAt}</dd></div></dl>
                <div className="admin-business-mobile-actions"><Link to={`/admin/invoices/${creator.id}/${record.id}`}><Eye size={14} /> 查看</Link><a href="/INV-20260723-001-Alex-Ruiz.pdf" download={`${record.id}.pdf`}><Download size={14} /> 下载</a></div>
              </article>
            );
          })}
        </div>
        {!filtered.length ? <div className="admin-empty">没有符合筛选条件的 Invoice</div> : null}
        <AdminPagination
          totalItems={filtered.length}
          page={invoicePagination.currentPage}
          pageSize={invoicePagination.pageSize}
          totalPages={invoicePagination.totalPages}
          startIndex={invoicePagination.startIndex}
          endIndex={invoicePagination.endIndex}
          unit="份 Invoice"
          onPageChange={invoicePagination.setPage}
          onPageSizeChange={invoicePagination.setPageSize}
        />
      </section>
    </div>
  );
}

export function AdminDashboardPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [syncIssueCount, setSyncIssueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      services.adminUsers.list(),
      services.audit.list(),
      services.externalBusinessData.listIssues(),
    ]).then(([userResult, auditResult, issueResult]) => {
      setUsers(userResult.data);
      setAudits(auditResult.data);
      setSyncIssueCount(issueResult.data.length);
      setLoading(false);
    });
  }, []);

  const correctionUsers = users.filter((user) => user.hasOpenCorrection);
  const correctionCount = correctionUsers.length;
  const pendingVerification = users.filter(
    (user) => user.role === "CREATOR" && user.verificationStatus === "PENDING",
  );
  const pendingInvitations = users.filter(
    (user) => user.invitationStatus === "PENDING",
  );
  const actionUsers = [
    ...new Map(
      [...pendingVerification, ...correctionUsers, ...pendingInvitations].map(
        (user) => [user.id, user],
      ),
    ).values(),
  ];

  return (
    <div className="admin-page-stack">
      <PageHeader
        title="用户运营概览"
        description="集中查看账号可用性、认证进度、资料修正和外部数据关联状态。"
        actions={
          <Link className="admin-primary-button" to="/admin/settings/users">
            <Users size={16} /> 管理用户
          </Link>
        }
      />
      <section className="admin-metric-strip" aria-label="用户指标">
        {[
          ["用户总数", users.length, "所有管理员与创作者"],
          [
            "启用 / 停用",
            `${users.filter((user) => user.status === "ACTIVE").length} / ${users.filter((user) => user.status === "DISABLED").length}`,
            "账号访问状态",
          ],
          ["待认证", pendingVerification.length, "认证前不可签署 Invoice"],
          ["待修正", correctionCount, "需要用户补充资料"],
          ["待接受邀请", pendingInvitations.length, "尚未完成账号激活"],
          ["同步异常", syncIssueCount, "未知 Creator ID 或数据版本"],
        ].map(([label, value, copy]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{loading ? "-" : value}</strong>
            <small>{copy}</small>
          </article>
        ))}
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <header className="admin-panel-heading">
            <div><h2>需要处理</h2><p>认证、资料修正与邀请事项</p></div>
            <Link to="/admin/settings/users">查看全部 <ChevronRight size={14} /></Link>
          </header>
          <div className="admin-action-queue">
            {actionUsers
              .slice(0, 6)
              .map((user) => (
                <Link to={`/admin/settings/users/${user.id}`} key={user.id}>
                  <span className="admin-user-avatar">{user.name.slice(0, 1)}</span>
                  <span><strong>{user.name}</strong><small>{user.id} · {user.email}</small></span>
                  <AdminBadge
                    label={
                      user.invitationStatus === "PENDING"
                        ? "待接受邀请"
                        : user.hasOpenCorrection
                          ? "待修正"
                        : verificationLabel[user.verificationStatus]
                    }
                    tone={
                      user.hasOpenCorrection ||
                      user.verificationStatus === "CHANGES_REQUESTED"
                        ? "danger"
                        : "warning"
                    }
                  />
                  <ChevronRight size={15} />
                </Link>
              ))}
            {!loading &&
            actionUsers.length === 0 ? (
              <div className="admin-empty">当前没有需要处理的用户事项</div>
            ) : null}
          </div>
        </section>

        <section className="admin-panel">
          <header className="admin-panel-heading">
            <div><h2>最近操作</h2><p>关键账号和安全操作</p></div>
            <Link to="/admin/settings/audit-logs">操作日志 <ChevronRight size={14} /></Link>
          </header>
          <div className="admin-activity-list">
            {audits.slice(0, 6).map((event) => (
              <article key={event.id}>
                <span className="admin-activity-icon"><History size={15} /></span>
                <div><strong>{event.summary}</strong><small>{event.actorName} · {event.occurredAt}</small></div>
                <AdminBadge label={auditActionLabel[event.action]} />
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function downloadTextFile(fileName: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF", content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminUsersPage() {
  const { session } = useAdminSession();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [filters, setFilters] = useState<AdminUserFilters>({
    query: "",
    role: "ALL",
    status: "ALL",
    verificationStatus: "ALL",
    invitationStatus: "ALL",
    correctionStatus: "ALL",
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<AccountStatus | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const result = await services.adminUsers.list(filters);
    setUsers(result.data);
    setSelected((ids) => ids.filter((id) => result.data.some((user) => user.id === id)));
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(load, 120);
    return () => window.clearTimeout(timer);
  }, [filters]);

  const applyBulkStatus = async () => {
    if (!statusAction || !selected.length) return;
    try {
      const result = await services.adminUsers.setStatus(
        selected,
        statusAction,
        session.userId,
        statusReason,
      );
      setToast(result.message || "账号状态已更新");
      setStatusAction(null);
      setStatusReason("");
      setSelected([]);
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "操作失败");
    }
  };

  const exportUsers = async () => {
    const result = await services.adminUsers.exportMasked(filters, session.userId);
    downloadTextFile("comets-users-masked.csv", result.data);
    setToast(result.message || "脱敏用户清单已导出");
  };

  const setFilter = <K extends keyof AdminUserFilters>(
    key: K,
    value: AdminUserFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));
  const userPagination = useAdminPagination(users, JSON.stringify(filters));
  const selectableUsers = userPagination.items.filter(
    (user) => user.id !== session.userId,
  );

  return (
    <div className="admin-page-stack">
      <PageHeader
        title="用户管理"
        description="管理管理员与创作者账号、认证状态和访问权限。"
        actions={
          <>
            <button type="button" className="admin-secondary-button" onClick={exportUsers}>
              <Download size={16} /> 导出脱敏清单
            </button>
            <button type="button" className="admin-primary-button" onClick={() => setCreateOpen(true)}>
              <UserPlus size={16} /> 创建或邀请用户
            </button>
          </>
        }
      />

      <section className="admin-filter-panel">
        <AdminSearchControl
          value={filters.query || ""}
          onChange={(value) => setFilter("query", value)}
          placeholder="搜索姓名、邮箱或 Creator ID"
        />
        <AdminSelectControl value={filters.role || "ALL"} onChange={(value) => setFilter("role", value as AdminUserFilters["role"])} label="筛选账号角色" icon={<CircleUserRound size={15} />}>
          <option value="ALL">全部角色</option>
          <option value="ADMIN">管理员</option>
          <option value="CREATOR">创作者</option>
        </AdminSelectControl>
        <AdminSelectControl value={filters.status || "ALL"} onChange={(value) => setFilter("status", value as AdminUserFilters["status"])} label="筛选账号状态" icon={<UserCheck size={15} />}>
          <option value="ALL">全部账号状态</option>
          <option value="ACTIVE">已启用</option>
          <option value="DISABLED">已停用</option>
        </AdminSelectControl>
        <AdminSelectControl value={filters.verificationStatus || "ALL"} onChange={(value) => setFilter("verificationStatus", value as AdminUserFilters["verificationStatus"])} label="筛选认证状态" icon={<ShieldCheck size={15} />}>
          <option value="ALL">全部认证状态</option>
          <option value="PENDING">待认证</option>
          <option value="VERIFIED">已认证</option>
          <option value="CHANGES_REQUESTED">待修正</option>
        </AdminSelectControl>
        <AdminSelectControl value={filters.invitationStatus || "ALL"} onChange={(value) => setFilter("invitationStatus", value as AdminUserFilters["invitationStatus"])} label="筛选邀请状态" icon={<Mail size={15} />}>
          <option value="ALL">全部邀请状态</option>
          <option value="PENDING">待接受</option>
          <option value="ACCEPTED">已接受</option>
          <option value="NOT_REQUIRED">自主注册</option>
          <option value="EXPIRED">已过期</option>
        </AdminSelectControl>
        <AdminSelectControl value={filters.correctionStatus || "ALL"} onChange={(value) => setFilter("correctionStatus", value as AdminUserFilters["correctionStatus"])} label="筛选资料修正状态" icon={<AlertCircle size={15} />}>
          <option value="ALL">全部修正状态</option>
          <option value="OPEN">有待修正字段</option>
          <option value="CLEAR">无待修正字段</option>
        </AdminSelectControl>
      </section>

      {selected.length ? (
        <section className="admin-bulk-bar">
          <span>已选择 <strong>{selected.length}</strong> 个账号</span>
          <div>
            <button type="button" onClick={() => setStatusAction("ACTIVE")}><UserCheck size={15} /> 批量启用</button>
            <button type="button" onClick={() => setStatusAction("DISABLED")}><UserX size={15} /> 批量停用</button>
            <button type="button" onClick={() => setSelected([])}>取消选择</button>
          </div>
        </section>
      ) : null}

      <section className="admin-panel admin-table-panel">
        <header className="admin-panel-heading">
          <div><h2>账号列表</h2><p>{loading ? "正在加载" : `共 ${users.length} 个账号`}</p></div>
          <SlidersHorizontal size={17} />
        </header>
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th className="admin-check-cell">
                  <input
                    type="checkbox"
                    aria-label="全选当前页用户"
                    checked={
                      selectableUsers.length > 0 &&
                      selectableUsers.every((user) =>
                        selected.includes(user.id),
                      )
                    }
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [
                              ...new Set([
                                ...current,
                                ...selectableUsers.map((user) => user.id),
                              ]),
                            ]
                          : current.filter(
                              (id) =>
                                !selectableUsers.some((user) => user.id === id),
                            ),
                      )
                    }
                  />
                </th>
                <th>账号信息</th>
                <th>角色</th>
                <th>认证</th>
                <th>邀请</th>
                <th>账号状态</th>
                <th>最后登录</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {userPagination.items.map((user) => (
                <tr key={user.id}>
                  <td className="admin-check-cell">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${user.name}`}
                      checked={selected.includes(user.id)}
                      disabled={user.id === session.userId}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, user.id]
                            : current.filter((id) => id !== user.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <Link className="admin-user-cell" to={`/admin/settings/users/${user.id}`}>
                      <span className="admin-user-avatar">{user.name.slice(0, 1)}</span>
                      <span><strong>{user.name}</strong><small>{user.id} · {user.email}</small></span>
                    </Link>
                  </td>
                  <td><AdminBadge label={roleLabel[user.role]} tone={user.role === "ADMIN" ? "purple" : "info"} /></td>
                  <td><AdminBadge label={verificationLabel[user.verificationStatus]} tone={verificationTone(user.verificationStatus)} /></td>
                  <td><span className="admin-table-secondary">{invitationLabel[user.invitationStatus]}</span></td>
                  <td><AdminBadge label={accountStatusLabel[user.status]} tone={accountStatusTone(user.status)} /></td>
                  <td><span className="admin-table-secondary">{user.lastLoginAt}</span></td>
                  <td>
                    <Link className="admin-icon-link" to={`/admin/settings/users/${user.id}`} title="查看用户详情">
                      <Eye size={15} /><span>查看</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !users.length ? <div className="admin-empty">没有符合筛选条件的用户</div> : null}
        <div className="admin-user-mobile-list">
          {userPagination.items.map((user) => (
            <article key={user.id}>
              <header>
                <input
                  type="checkbox"
                  aria-label={`选择 ${user.name}`}
                  checked={selected.includes(user.id)}
                  disabled={user.id === session.userId}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, user.id]
                        : current.filter((id) => id !== user.id),
                    )
                  }
                />
                <span className="admin-user-avatar">{user.name.slice(0, 1)}</span>
                <div><strong>{user.name}</strong><small>{user.id}</small></div>
                <AdminBadge label={accountStatusLabel[user.status]} tone={accountStatusTone(user.status)} />
              </header>
              <dl>
                <div><dt>邮箱</dt><dd>{user.email}</dd></div>
                <div><dt>角色</dt><dd>{roleLabel[user.role]}</dd></div>
                <div><dt>认证</dt><dd>{verificationLabel[user.verificationStatus]}</dd></div>
                <div><dt>最后登录</dt><dd>{user.lastLoginAt}</dd></div>
              </dl>
              <Link to={`/admin/settings/users/${user.id}`}>查看用户详情 <ChevronRight size={15} /></Link>
            </article>
          ))}
        </div>
        <AdminPagination
          totalItems={users.length}
          page={userPagination.currentPage}
          pageSize={userPagination.pageSize}
          totalPages={userPagination.totalPages}
          startIndex={userPagination.startIndex}
          endIndex={userPagination.endIndex}
          unit="个账号"
          onPageChange={userPagination.setPage}
          onPageSizeChange={userPagination.setPageSize}
        />
      </section>

      {createOpen ? (
        <CreateUserModal
          actorId={session.userId}
          onClose={() => setCreateOpen(false)}
          onCreated={async (message) => {
            setCreateOpen(false);
            setToast(message);
            await load();
          }}
        />
      ) : null}
      {statusAction ? (
        <AdminModal
          title={statusAction === "ACTIVE" ? "启用所选账号" : "停用所选账号"}
          description={`将变更 ${selected.length} 个账号的访问状态，并逐条写入审计日志。`}
          onClose={() => setStatusAction(null)}
          footer={
            <>
              <button type="button" className="admin-ghost-button" onClick={() => setStatusAction(null)}>取消</button>
              <button type="button" className={statusAction === "DISABLED" ? "admin-danger-button" : "admin-primary-button"} onClick={applyBulkStatus}>
                确认{statusAction === "ACTIVE" ? "启用" : "停用"}
              </button>
            </>
          }
        >
          <label className="admin-form-field">
            <span>操作原因</span>
            <textarea
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              placeholder="说明本次账号状态变更原因"
            />
          </label>
        </AdminModal>
      ) : null}
      {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
    </div>
  );
}

function CreateUserModal({
  actorId,
  onClose,
  onCreated,
}: {
  actorId: string;
  onClose(): void;
  onCreated(message: string): void;
}) {
  const [form, setForm] = useState<CreateManagedUserInput>({
    name: "",
    email: "",
    role: "CREATOR",
    mode: "INVITE",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.includes("@")) {
      setError("请填写用户姓名和有效邮箱");
      return;
    }
    setSubmitting(true);
    try {
      const result = await services.adminUsers.create(form, actorId);
      onCreated(result.message || "用户已创建");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
      setSubmitting(false);
    }
  };

  return (
    <AdminModal
      title="创建或邀请用户"
      description="公开注册只能创建创作者；管理员账号必须由现有管理员创建。"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="admin-ghost-button" onClick={onClose}>取消</button>
          <button type="submit" form="create-admin-user" className="admin-primary-button" disabled={submitting}>
            {submitting ? <RefreshCcw className="spin" size={15} /> : <Mail size={15} />}
            {form.mode === "INVITE" ? "发送邀请" : "创建账号"}
          </button>
        </>
      }
    >
      <form id="create-admin-user" className="admin-form-grid" onSubmit={submit}>
        {error ? <div className="admin-inline-alert admin-form-wide">{error}</div> : null}
        <label className="admin-form-field">
          <span>姓名 *</span>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="输入用户姓名" />
        </label>
        <label className="admin-form-field">
          <span>邮箱 *</span>
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" />
        </label>
        <div className="admin-form-field">
          <span>账号角色</span>
          <AdminSelectControl value={form.role} onChange={(value) => setForm({ ...form, role: value as UserRole })} label="账号角色" icon={<CircleUserRound size={15} />}>
            <option value="CREATOR">创作者</option>
            <option value="ADMIN">管理员</option>
          </AdminSelectControl>
        </div>
        <div className="admin-form-field">
          <span>创建方式</span>
          <AdminSelectControl value={form.mode} onChange={(value) => setForm({ ...form, mode: value as CreateManagedUserInput["mode"] })} label="创建方式" icon={<Mail size={15} />}>
            <option value="INVITE">发送邀请邮件</option>
            <option value="CREATE">立即创建账号</option>
          </AdminSelectControl>
        </div>
      </form>
    </AdminModal>
  );
}

type UserDetailTab =
  | "overview"
  | "profile"
  | "payout"
  | "contracts"
  | "invoices"
  | "requests"
  | "activity";

const userDetailTabs: Array<{ key: UserDetailTab; label: string }> = [
  { key: "overview", label: "账号概览" },
  { key: "profile", label: "基本与社媒资料" },
  { key: "payout", label: "收款账户" },
  { key: "contracts", label: "合同" },
  { key: "invoices", label: "Invoice" },
  { key: "requests", label: "请款项目" },
  { key: "activity", label: "记录" },
];

export function AdminUserDetailPage() {
  const { id = "" } = useParams();
  const { session } = useAdminSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") || "overview") as UserDetailTab;
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [toast, setToast] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [revealField, setRevealField] = useState<SensitiveFieldKey | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [statusModal, setStatusModal] = useState(false);
  const [statusReason, setStatusReason] = useState("");

  const load = async () => {
    const [userResult, auditResult] = await Promise.all([
      services.adminUsers.get(id),
      services.audit.list(),
    ]);
    setDetail(userResult.data);
    setAudits(
      auditResult.data.filter(
        (event) => event.subjectUserId === id || event.actorId === id,
      ),
    );
  };

  useEffect(() => {
    load();
  }, [id]);

  if (!detail) {
    return <div className="admin-page-stack"><div className="admin-loading"><RefreshCcw className="spin" size={20} /> 正在加载用户详情</div></div>;
  }

  const account = detail.account;
  const profile = detail.profile;

  const changeStatus = async () => {
    try {
      const next = account.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
      const result = await services.adminUsers.setStatus(
        [account.id],
        next,
        session.userId,
        statusReason,
      );
      setToast(result.message || "账号状态已更新");
      setStatusModal(false);
      setStatusReason("");
      await load();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "操作失败");
    }
  };

  const resetPassword = async () => {
    const result = await services.adminUsers.resetPassword(account.id, session.userId);
    setToast(result.message || "密码重置邮件已发送");
    await load();
  };

  const updateVerification = async (status: VerificationStatus) => {
    const result = await services.adminUsers.updateVerification(
      account.id,
      status,
      session.userId,
    );
    setDetail(result.data);
    setToast(result.message || "认证状态已更新");
  };

  return (
    <div className="admin-page-stack">
      <Link className="admin-back-link" to="/admin/settings/users"><ArrowLeft size={15} /> 返回用户列表</Link>
      <section className="admin-user-hero">
        <span className="admin-user-hero-avatar">{account.name.slice(0, 1)}</span>
        <div className="admin-user-hero-copy">
          <span>{account.id}</span>
          <h1>{account.name}</h1>
          <p>{account.email}</p>
        </div>
        <div className="admin-user-hero-badges">
          <AdminBadge label={roleLabel[account.role]} tone={account.role === "ADMIN" ? "purple" : "info"} />
          <AdminBadge label={accountStatusLabel[account.status]} tone={accountStatusTone(account.status)} />
          <AdminBadge label={verificationLabel[account.verificationStatus]} tone={verificationTone(account.verificationStatus)} />
        </div>
        <div className="admin-user-hero-actions">
          <button type="button" className="admin-secondary-button" onClick={resetPassword}><KeyRound size={15} /> 重置密码</button>
          <button
            type="button"
            className={account.status === "ACTIVE" ? "admin-danger-button" : "admin-primary-button"}
            onClick={() => setStatusModal(true)}
            disabled={account.id === session.userId}
          >
            {account.status === "ACTIVE" ? <UserX size={15} /> : <UserCheck size={15} />}
            {account.status === "ACTIVE" ? "停用账号" : "启用账号"}
          </button>
        </div>
      </section>

      <nav className="admin-detail-tabs" aria-label="用户详情">
        {userDetailTabs.map((item) => (
          <button
            type="button"
            key={item.key}
            className={tab === item.key ? "active" : ""}
            onClick={() => setSearchParams({ tab: item.key })}
          >
            {item.label}
            {item.key === "contracts" && detail.contracts.length ? <span>{detail.contracts.length}</span> : null}
            {item.key === "invoices" && detail.invoices.length ? <span>{detail.invoices.length}</span> : null}
            {item.key === "requests" && detail.requests.length ? <span>{detail.requests.length}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <UserOverview
          detail={detail}
          onVerification={updateVerification}
          onCorrection={() => setCorrectionOpen(true)}
        />
      ) : null}
      {tab === "profile" && profile ? (
        <AdminProfilePanel
          detail={detail}
          editing={profileEditing}
          onEditingChange={setProfileEditing}
          actorId={session.userId}
          onSaved={(next, message) => {
            setDetail(next);
            setToast(message);
            setProfileEditing(false);
          }}
          onCorrection={() => setCorrectionOpen(true)}
        />
      ) : null}
      {tab === "payout" && profile ? (
        <PayoutReadOnlyPanel
          detail={detail}
          revealed={revealed}
          onReveal={setRevealField}
          onCorrection={() => setCorrectionOpen(true)}
        />
      ) : null}
      {tab === "contracts" ? (
        <BusinessTable type="contracts" detail={detail} />
      ) : null}
      {tab === "invoices" ? (
        <BusinessTable type="invoices" detail={detail} />
      ) : null}
      {tab === "requests" ? (
        <BusinessTable type="requests" detail={detail} />
      ) : null}
      {tab === "activity" ? (
        <UserActivityPanel detail={detail} audits={audits} />
      ) : null}

      {correctionOpen && profile ? (
        <CorrectionModal
          userId={account.id}
          actorId={session.userId}
          onClose={() => setCorrectionOpen(false)}
          onSaved={(next, message) => {
            setDetail(next);
            setCorrectionOpen(false);
            setToast(message);
          }}
        />
      ) : null}
      {revealField ? (
        <RevealSensitiveModal
          userId={account.id}
          actorId={session.userId}
          field={revealField}
          onClose={() => setRevealField(null)}
          onRevealed={(value, message) => {
            setRevealed((current) => ({ ...current, [revealField]: value }));
            setRevealField(null);
            setToast(message);
            load();
          }}
        />
      ) : null}
      {statusModal ? (
        <AdminModal
          title={account.status === "ACTIVE" ? "停用账号" : "启用账号"}
          description="账号数据会保留；停用后该用户将无法继续访问系统。"
          onClose={() => setStatusModal(false)}
          footer={
            <>
              <button type="button" className="admin-ghost-button" onClick={() => setStatusModal(false)}>取消</button>
              <button type="button" className={account.status === "ACTIVE" ? "admin-danger-button" : "admin-primary-button"} onClick={changeStatus}>
                确认{account.status === "ACTIVE" ? "停用" : "启用"}
              </button>
            </>
          }
        >
          <label className="admin-form-field">
            <span>操作原因</span>
            <textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)} placeholder="填写账号状态变更原因" />
          </label>
        </AdminModal>
      ) : null}
      {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
    </div>
  );
}

function UserOverview({
  detail,
  onVerification,
  onCorrection,
}: {
  detail: AdminUserDetail;
  onVerification(status: VerificationStatus): void;
  onCorrection(): void;
}) {
  const { account, profile } = detail;
  const openCorrections = detail.corrections.filter((item) => item.status === "OPEN");
  return (
    <div className="admin-detail-grid">
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>账号状态</h2><p>访问、邀请和认证状态相互独立</p></div><CircleUserRound size={18} /></header>
        <dl className="admin-description-list">
          <div><dt>账号角色</dt><dd>{roleLabel[account.role]}</dd></div>
          <div><dt>访问状态</dt><dd><AdminBadge label={accountStatusLabel[account.status]} tone={accountStatusTone(account.status)} /></dd></div>
          <div><dt>邀请状态</dt><dd>{invitationLabel[account.invitationStatus]}</dd></div>
          <div><dt>注册时间</dt><dd>{account.createdAt}</dd></div>
          <div><dt>最后登录</dt><dd>{account.lastLoginAt}</dd></div>
          <div><dt>资料修正</dt><dd>{openCorrections.length ? `${openCorrections.length} 项待处理` : "无待处理事项"}</dd></div>
        </dl>
      </section>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>社媒认证</h2><p>认证通过前创作者不能签署 Invoice</p></div><ShieldCheck size={18} /></header>
        {profile ? (
          <div className="admin-verification-summary">
            <span className="admin-social-mark">{profile.social.platform.slice(0, 1)}</span>
            <div><strong>{profile.social.platform} · {profile.social.handle}</strong><small>{profile.social.profileUrls.length} 条主页链接 · {profile.social.screenshots.length} 张认证截图</small></div>
            <AdminBadge label={verificationLabel[account.verificationStatus]} tone={verificationTone(account.verificationStatus)} />
          </div>
        ) : <div className="admin-empty">管理员账号不需要社媒认证</div>}
        {account.role === "CREATOR" && account.verificationStatus !== "VERIFIED" ? (
          <div className="admin-verification-actions">
            <button type="button" className="admin-primary-button" onClick={() => onVerification("VERIFIED")}><UserCheck size={15} /> 通过认证</button>
            <button type="button" className="admin-secondary-button" onClick={onCorrection}><AlertCircle size={15} /> 退回具体字段</button>
          </div>
        ) : null}
      </section>
      <section className="admin-panel admin-detail-wide">
        <header className="admin-panel-heading"><div><h2>关联业务数据</h2><p>来自外部系统，只读展示</p></div><FileText size={18} /></header>
        <div className="admin-business-summary">
          <article><span>合同</span><strong>{detail.contracts.length}</strong><small>外部系统同步</small></article>
          <article><span>Invoice</span><strong>{detail.invoices.length}</strong><small>外部系统同步</small></article>
          <article><span>请款项目</span><strong>{detail.requests.length}</strong><small>按稳定 Creator ID 关联</small></article>
          <article><span>最近同步</span><strong className="admin-sync-time">{detail.lastSyncedAt || "-"}</strong><small>{detail.lastSyncedAt ? "数据已关联" : "暂无业务数据"}</small></article>
        </div>
      </section>
    </div>
  );
}

function AdminProfilePanel({
  detail,
  editing,
  onEditingChange,
  actorId,
  onSaved,
  onCorrection,
}: {
  detail: AdminUserDetail;
  editing: boolean;
  onEditingChange(value: boolean): void;
  actorId: string;
  onSaved(detail: AdminUserDetail, message: string): void;
  onCorrection(): void;
}) {
  const profile = detail.profile!;
  const [form, setForm] = useState<AdminProfilePatch>({
    displayName: profile.displayName,
    legalName: profile.legalName,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    platform: profile.social.platform,
    handle: profile.social.handle,
    profileUrls: [...profile.social.profileUrls],
  });
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      displayName: profile.displayName,
      legalName: profile.legalName,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      platform: profile.social.platform,
      handle: profile.social.handle,
      profileUrls: [...profile.social.profileUrls],
    });
  }, [profile.id, profile.email, profile.social.handle]);

  const save = async () => {
    setError("");
    try {
      const result = await services.adminUsers.updateProfile(
        detail.account.id,
        form,
        actorId,
      );
      onSaved(result.data, result.message || "用户档案已更新");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "用户档案保存失败");
    }
  };

  return (
    <section className="admin-panel">
      <header className="admin-panel-heading">
        <div><h2>基本与社媒资料</h2><p>管理员可直接修改非收款资料，所有变更写入审计日志。</p></div>
        <div className="admin-inline-actions">
          <button type="button" className="admin-secondary-button" onClick={onCorrection}><AlertCircle size={15} /> 退回字段</button>
          {editing ? (
            <>
              <button type="button" className="admin-ghost-button" onClick={() => onEditingChange(false)}>取消</button>
              <button type="button" className="admin-primary-button" onClick={save}><Check size={15} /> 保存修改</button>
            </>
          ) : (
            <button type="button" className="admin-primary-button" onClick={() => onEditingChange(true)}>编辑资料</button>
          )}
        </div>
      </header>
      {error ? <div className="admin-inline-alert">{error}</div> : null}
      <div className="admin-profile-form">
        {[
          ["displayName", "显示名称", form.displayName],
          ["legalName", "真实姓名", form.legalName],
          ["email", "联系邮箱", form.email],
          ["phone", "联系电话", form.phone],
          ["address", "联系地址", form.address],
          ["platform", "社媒平台", form.platform],
          ["handle", "社媒账号", form.handle],
        ].map(([key, label, value]) => (
          <label className={key === "address" ? "admin-form-wide" : ""} key={key}>
            <span>{label}</span>
            {editing ? (
              <input
                value={value}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              />
            ) : <strong>{value || "-"}</strong>}
          </label>
        ))}
        <div className="admin-form-wide admin-profile-links">
          <span>主页链接</span>
          {form.profileUrls.map((url, index) => (
            editing ? (
              <input
                key={`${url}-${index}`}
                value={url}
                onChange={(event) =>
                  setForm({
                    ...form,
                    profileUrls: form.profileUrls.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  })
                }
              />
            ) : <a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>
          ))}
        </div>
      </div>
    </section>
  );
}

function PayoutReadOnlyPanel({
  detail,
  revealed,
  onReveal,
  onCorrection,
}: {
  detail: AdminUserDetail;
  revealed: Record<string, string>;
  onReveal(field: SensitiveFieldKey): void;
  onCorrection(): void;
}) {
  const payout = detail.profile!.payout;
  const sensitive = [
    {
      key: "accountNumber" as const,
      label: "银行账号",
      value: payout.accountNumber || payout.schemaValues.account_number || "",
    },
    {
      key: "iban" as const,
      label: "IBAN",
      value: payout.schemaValues.iban || "",
    },
    {
      key: "swiftCode" as const,
      label: "SWIFT / BIC",
      value: payout.swiftCode || payout.schemaValues.swift_code || "",
    },
    {
      key: "beneficiaryIdNumber" as const,
      label: "个人证件号",
      value:
        payout.schemaValues.beneficiary_id_number ||
        payout.schemaValues.personal_id_number ||
        "",
    },
    {
      key: "businessRegistrationNumber" as const,
      label: "公司注册号",
      value: payout.schemaValues.business_registration_number || "",
    },
  ];
  return (
    <section className="admin-panel">
      <header className="admin-panel-heading">
        <div><h2>收款账户</h2><p>管理员只能核对和退回字段，不能代替创作者修改。</p></div>
        <button type="button" className="admin-secondary-button" onClick={onCorrection}><AlertCircle size={15} /> 退回字段</button>
      </header>
      <aside className="admin-security-notice">
        <LockKeyhole size={17} />
        <div><strong>敏感信息默认脱敏</strong><span>查看完整值必须填写业务原因，操作会写入审计日志。</span></div>
      </aside>
      <dl className="admin-payout-grid">
        <div><dt>付款渠道</dt><dd>{payout.provider}</dd></div>
        <div><dt>账户状态</dt><dd><AdminBadge label={payout.status === "VALIDATED" ? "校验通过" : "待完善"} tone={payout.status === "VALIDATED" ? "success" : "warning"} /></dd></div>
        <div><dt>账户名称</dt><dd>{payout.accountHolder || "-"}</dd></div>
        <div><dt>银行</dt><dd>{payout.bankName || "-"}</dd></div>
        <div><dt>国家与币种</dt><dd>{payout.bankCountry} · {payout.currency}</dd></div>
        <div><dt>收款人类型</dt><dd>{payout.beneficiaryType === "PERSONAL" ? "个人" : "公司"}</dd></div>
        {sensitive.map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd className="admin-sensitive-value">
              <span>{revealed[field.key] || maskSensitiveValue(field.value)}</span>
              {field.value && !revealed[field.key] ? (
                <button type="button" onClick={() => onReveal(field.key)}><Eye size={14} /> 查看完整值</button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BusinessTable({
  type,
  detail,
}: {
  type: "contracts" | "invoices" | "requests";
  detail: AdminUserDetail;
}) {
  const data: Array<Contract | Invoice | RequestProject> = detail[type];
  const title = type === "contracts" ? "合同" : type === "invoices" ? "Invoice" : "请款项目";
  const pagination = useAdminPagination(
    data,
    `${detail.account.id}|${type}`,
  );
  return (
    <section className="admin-panel admin-table-panel">
      <header className="admin-panel-heading">
        <div><h2>{title}</h2><p>来自外部系统，管理员仅可查看和下载。</p></div>
        <AdminBadge label="只读数据" tone="info" />
      </header>
      {!data.length ? (
        <div className="admin-empty">该用户暂无已关联的{title}数据</div>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>项目</th>
                <th>品牌</th>
                <th>金额</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {type === "contracts"
                ? (pagination.items as Contract[]).map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.id}</strong></td>
                      <td>{item.projectName}</td>
                      <td>{item.brand}</td>
                      <td>{item.amount}</td>
                      <td><AdminBadge label={contractStatusLabel[item.status]} tone={item.status === "已付款" ? "success" : "info"} /></td>
                      <td>
                        <div className="admin-inline-actions">
                          <a className="admin-icon-link" href={item.documentUrl} target="_blank" rel="noreferrer"><Eye size={15} /><span>查看</span></a>
                          <a className="admin-icon-link" href={item.documentUrl} download={item.fileName}><Download size={15} /><span>下载</span></a>
                        </div>
                      </td>
                    </tr>
                  ))
                : type === "invoices"
                  ? (pagination.items as Invoice[]).map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.id}</strong></td>
                        <td>{item.projectName}</td>
                        <td>{item.brand}</td>
                        <td>{item.amount}</td>
                        <td><AdminBadge label={item.status} tone={item.status === "PAID" ? "success" : item.status === "PAYMENT_FAILED" ? "danger" : "info"} /></td>
                        <td>
                          <div className="admin-inline-actions">
                            <a className="admin-icon-link" href="/INV-20260723-001-Alex-Ruiz.pdf" target="_blank" rel="noreferrer"><Eye size={15} /><span>查看</span></a>
                            <a className="admin-icon-link" href="/INV-20260723-001-Alex-Ruiz.pdf" download={`${item.id}.pdf`}><Download size={15} /><span>下载</span></a>
                          </div>
                        </td>
                      </tr>
                    ))
                  : (pagination.items as RequestProject[]).map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.id}</strong></td>
                        <td>{item.projectName}</td>
                        <td>{item.brand}</td>
                        <td>{item.amount}</td>
                        <td><AdminBadge label={item.invoiceStatus} tone={item.status === "PAID" ? "success" : item.status === "PAYMENT_FAILED" ? "danger" : "info"} /></td>
                        <td><span className="admin-table-secondary">外部系统同步</span></td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      )}
      {data.length ? (
        <div className="admin-business-mobile-list">
          {pagination.items.map((item) => (
            <article key={item.id}>
              <header>
                <strong>{item.id}</strong>
                <AdminBadge
                  label={
                    type === "contracts"
                      ? detail.contracts.find((entry) => entry.id === item.id)?.status || "-"
                      : type === "invoices"
                        ? detail.invoices.find((entry) => entry.id === item.id)?.status || "-"
                        : detail.requests.find((entry) => entry.id === item.id)?.invoiceStatus || "-"
                  }
                  tone={
                    "status" in item && item.status === "PAID"
                      ? "success"
                      : "status" in item && item.status === "PAYMENT_FAILED"
                        ? "danger"
                        : "info"
                  }
                />
              </header>
              <dl>
                <div><dt>项目</dt><dd>{item.projectName}</dd></div>
                <div><dt>品牌</dt><dd>{item.brand}</dd></div>
                <div><dt>金额</dt><dd>{item.amount}</dd></div>
              </dl>
              {type === "contracts" ? (
                <div className="admin-business-mobile-actions">
                  <a href={detail.contracts.find((entry) => entry.id === item.id)?.documentUrl} target="_blank" rel="noreferrer">
                    <Eye size={14} /> 查看合同
                  </a>
                  <a href={detail.contracts.find((entry) => entry.id === item.id)?.documentUrl} download={detail.contracts.find((entry) => entry.id === item.id)?.fileName}>
                    <Download size={14} /> 下载
                  </a>
                </div>
              ) : type === "invoices" ? (
                <div className="admin-business-mobile-actions">
                  <a href="/INV-20260723-001-Alex-Ruiz.pdf" target="_blank" rel="noreferrer">
                    <Eye size={14} /> 查看 Invoice
                  </a>
                  <a href="/INV-20260723-001-Alex-Ruiz.pdf" download={`${item.id}.pdf`}>
                    <Download size={14} /> 下载
                  </a>
                </div>
              ) : (
                <span className="admin-table-secondary">外部系统同步，只读展示</span>
              )}
            </article>
          ))}
        </div>
      ) : null}
      <AdminPagination
        totalItems={data.length}
        page={pagination.currentPage}
        pageSize={pagination.pageSize}
        totalPages={pagination.totalPages}
        startIndex={pagination.startIndex}
        endIndex={pagination.endIndex}
        unit={
          type === "contracts"
            ? "份合同"
            : type === "invoices"
              ? "份 Invoice"
              : "个项目"
        }
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </section>
  );
}

function UserActivityPanel({
  detail,
  audits,
}: {
  detail: AdminUserDetail;
  audits: AuditEvent[];
}) {
  const loginPagination = useAdminPagination(
    detail.loginHistory,
    `${detail.account.id}|login-history`,
  );
  const notificationPagination = useAdminPagination(
    detail.notifications,
    `${detail.account.id}|notifications`,
  );
  const auditPagination = useAdminPagination(
    audits,
    `${detail.account.id}|account-audits`,
  );
  return (
    <div className="admin-detail-grid">
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>登录历史</h2><p>账号最近的访问记录</p></div><History size={18} /></header>
        <div className="admin-activity-list">
          {loginPagination.items.map((record) => (
            <article key={record.id}>
              <span className="admin-activity-icon"><CircleUserRound size={15} /></span>
              <div><strong>{record.device}</strong><small>{record.location} · {record.occurredAt}</small></div>
              <AdminBadge label={record.result === "SUCCESS" ? "成功" : "失败"} tone={record.result === "SUCCESS" ? "success" : "danger"} />
            </article>
          ))}
          {!detail.loginHistory.length ? <div className="admin-empty">暂无登录记录</div> : null}
        </div>
        <AdminPagination
          totalItems={detail.loginHistory.length}
          page={loginPagination.currentPage}
          pageSize={loginPagination.pageSize}
          totalPages={loginPagination.totalPages}
          startIndex={loginPagination.startIndex}
          endIndex={loginPagination.endIndex}
          unit="条登录记录"
          onPageChange={loginPagination.setPage}
          onPageSizeChange={loginPagination.setPageSize}
        />
      </section>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>通知记录</h2><p>站内通知与模拟邮件状态</p></div><Bell size={18} /></header>
        <div className="admin-activity-list">
          {notificationPagination.items.map((item) => (
            <article key={item.id}>
              <span className="admin-activity-icon"><Mail size={15} /></span>
              <div><strong>{item.title}</strong><small>{item.createdAt} · 邮件{item.emailStatus === "DELIVERED" ? "已送达" : "排队中"}</small></div>
            </article>
          ))}
          {!detail.notifications.length ? <div className="admin-empty">暂无通知记录</div> : null}
        </div>
        <AdminPagination
          totalItems={detail.notifications.length}
          page={notificationPagination.currentPage}
          pageSize={notificationPagination.pageSize}
          totalPages={notificationPagination.totalPages}
          startIndex={notificationPagination.startIndex}
          endIndex={notificationPagination.endIndex}
          unit="条通知"
          onPageChange={notificationPagination.setPage}
          onPageSizeChange={notificationPagination.setPageSize}
        />
      </section>
      <section className="admin-panel admin-detail-wide">
        <header className="admin-panel-heading"><div><h2>操作记录</h2><p>与该账号相关的审计事件</p></div><Activity size={18} /></header>
        <div className="admin-audit-compact">
          {auditPagination.items.map((event) => (
            <article key={event.id}>
              <span>{event.occurredAt}</span>
              <strong>{event.summary}</strong>
              <small>{event.actorName}</small>
              <AdminBadge label={auditActionLabel[event.action]} />
            </article>
          ))}
          {!audits.length ? <div className="admin-empty">暂无操作记录</div> : null}
        </div>
        <AdminPagination
          totalItems={audits.length}
          page={auditPagination.currentPage}
          pageSize={auditPagination.pageSize}
          totalPages={auditPagination.totalPages}
          startIndex={auditPagination.startIndex}
          endIndex={auditPagination.endIndex}
          unit="条操作记录"
          onPageChange={auditPagination.setPage}
          onPageSizeChange={auditPagination.setPageSize}
        />
      </section>
    </div>
  );
}

function CorrectionModal({
  userId,
  actorId,
  onClose,
  onSaved,
}: {
  userId: string;
  actorId: string;
  onClose(): void;
  onSaved(detail: AdminUserDetail, message: string): void;
}) {
  const fields = [
    ["social.profileUrls", "主页链接"],
    ["social.screenshots", "社媒认证截图"],
    ["legalName", "真实姓名"],
    ["email", "联系邮箱"],
    ["phone", "联系电话"],
    ["address", "联系地址"],
    ["payout.accountHolder", "收款账户名称"],
    ["payout.accountNumber", "银行账号"],
    ["payout.schemaValues.iban", "IBAN"],
    ["payout.swiftCode", "SWIFT / BIC"],
    ["payout.schemaValues.beneficiary_id_number", "个人证件号"],
    ["payout.schemaValues.business_registration_number", "公司注册号"],
  ];
  const [fieldKey, setFieldKey] = useState(fields[0][0]);
  const [reason, setReason] = useState("");
  const [templates, setTemplates] = useState<string[]>([]);
  const [template, setTemplate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    services.adminSettings
      .get()
      .then((result) => setTemplates(result.data.correctionReasonTemplates));
  }, []);

  const save = async () => {
    try {
      const fieldLabel = fields.find(([key]) => key === fieldKey)?.[1] || fieldKey;
      const result = await services.corrections.create(
        userId,
        fieldKey,
        fieldLabel,
        reason,
        actorId,
      );
      onSaved(result.data, result.message || "修改要求已发送");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发送失败");
    }
  };

  return (
    <AdminModal
      title="退回指定字段"
      description="用户会收到站内通知和模拟邮件；字段通过对应校验后自动关闭。"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="admin-ghost-button" onClick={onClose}>取消</button>
          <button type="button" className="admin-primary-button" onClick={save}><Mail size={15} /> 发送修改要求</button>
        </>
      }
    >
      {error ? <div className="admin-inline-alert">{error}</div> : null}
      <div className="admin-form-field">
        <span>需要修改的字段</span>
        <AdminSelectControl value={fieldKey} onChange={setFieldKey} label="需要修改的字段" icon={<FileText size={15} />}>
          {fields.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </AdminSelectControl>
      </div>
      <div className="admin-form-field">
        <span>退回原因 *</span>
        <AdminSelectControl
          value={template}
          onChange={(value) => {
            setTemplate(value);
            if (value) setReason(value);
          }}
          label="选择退回原因模板"
          icon={<AlertCircle size={15} />}
        >
          <option value="">选择原因模板</option>
          {templates.map((item) => <option key={item} value={item}>{item}</option>)}
        </AdminSelectControl>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="清楚说明问题和需要用户完成的修改" />
      </div>
    </AdminModal>
  );
}

function RevealSensitiveModal({
  userId,
  actorId,
  field,
  onClose,
  onRevealed,
}: {
  userId: string;
  actorId: string;
  field: SensitiveFieldKey;
  onClose(): void;
  onRevealed(value: string, message: string): void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const reveal = async () => {
    try {
      const result = await services.adminUsers.revealSensitive(
        userId,
        field,
        reason,
        actorId,
      );
      onRevealed(result.data, result.message || "查看已记录");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法查看");
    }
  };
  return (
    <AdminModal
      title="查看完整敏感信息"
      description="仅限处理当前用户资料问题，查看行为会记录到审计日志。"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="admin-ghost-button" onClick={onClose}>取消</button>
          <button type="button" className="admin-primary-button" onClick={reveal}><Eye size={15} /> 查看完整值</button>
        </>
      }
    >
      {error ? <div className="admin-inline-alert">{error}</div> : null}
      <label className="admin-form-field">
        <span>查看原因 *</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="填写与当前业务处理直接相关的查看原因" />
      </label>
    </AdminModal>
  );
}

export function AdminAuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<AuditEvent["action"] | "ALL">("ALL");
  const [actorId, setActorId] = useState("ALL");
  const [subjectUserId, setSubjectUserId] = useState("ALL");
  const [module, setModule] = useState<AuditEvent["module"] | "ALL">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    services.audit.list().then((result) => setEvents(result.data));
  }, []);

  const filtered = useMemo(
    () =>
      events.filter(
        (event) => {
          const eventDate = event.occurredAt.replaceAll("/", "-").slice(0, 10);
          return (
          (action === "ALL" || event.action === action) &&
          (actorId === "ALL" || event.actorId === actorId) &&
          (subjectUserId === "ALL" || event.subjectUserId === subjectUserId) &&
          (module === "ALL" || event.module === module) &&
          (!dateFrom || eventDate >= dateFrom) &&
          (!dateTo || eventDate <= dateTo) &&
          (!query.trim() ||
            [
              event.actorName,
              event.subjectName,
              event.summary,
              event.reason,
            ]
              .join(" ")
              .toLowerCase()
              .includes(query.trim().toLowerCase()))
          );
        },
      ),
    [events, query, action, actorId, subjectUserId, module, dateFrom, dateTo],
  );
  const auditPagination = useAdminPagination(
    filtered,
    `${query.trim().toLowerCase()}|${action}|${actorId}|${subjectUserId}|${module}|${dateFrom}|${dateTo}`,
  );
  const actors = [
    ...new Map(events.map((event) => [event.actorId, event.actorName])).entries(),
  ];
  const subjects = [
    ...new Map(
      events
        .filter((event) => event.subjectUserId)
        .map((event) => [event.subjectUserId!, event.subjectName || event.subjectUserId!]),
    ).entries(),
  ];

  const exportAudit = () => {
    const csv = [
      ["时间", "操作者", "对象", "动作", "摘要", "原因"],
      ...filtered.map((event) => [
        event.occurredAt,
        event.actorName,
        event.subjectName || "-",
        auditActionLabel[event.action],
        event.summary,
        event.reason || "-",
      ]),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    downloadTextFile("comets-audit-logs.csv", csv);
  };

  return (
    <div className="admin-page-stack">
      <PageHeader
        title="操作日志"
        description="追踪账号、资料、敏感信息和系统配置的关键操作。"
        actions={<button type="button" className="admin-secondary-button" onClick={exportAudit}><Download size={16} /> 导出日志</button>}
      />
      <section className="admin-filter-panel admin-audit-filters">
        <AdminSearchControl value={query} onChange={setQuery} placeholder="搜索操作者、用户、摘要或原因" />
        <AdminSelectControl value={action} onChange={(value) => setAction(value as AuditEvent["action"] | "ALL")} label="筛选操作类型" icon={<Activity size={15} />}>
          <option value="ALL">全部操作</option>
          {Object.entries(auditActionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </AdminSelectControl>
        <AdminSelectControl value={actorId} onChange={setActorId} label="筛选操作者" icon={<CircleUserRound size={15} />}>
          <option value="ALL">全部操作者</option>
          {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </AdminSelectControl>
        <AdminSelectControl value={subjectUserId} onChange={setSubjectUserId} label="筛选用户对象" icon={<Users size={15} />}>
          <option value="ALL">全部用户对象</option>
          {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </AdminSelectControl>
        <AdminSelectControl value={module} onChange={(value) => setModule(value as AuditEvent["module"] | "ALL")} label="筛选操作模块" icon={<FolderKanban size={15} />}>
          <option value="ALL">全部模块</option>
          <option value="AUTH">登录认证</option>
          <option value="USER">账号管理</option>
          <option value="PROFILE">用户档案</option>
          <option value="SECURITY">安全操作</option>
          <option value="SETTINGS">系统设置</option>
          <option value="SYNC">外部同步</option>
        </AdminSelectControl>
        <AdminDateControl value={dateFrom} onChange={setDateFrom} label="开始日期" />
        <AdminDateControl value={dateTo} onChange={setDateTo} label="结束日期" />
      </section>
      <section className="admin-panel admin-table-panel">
        <header className="admin-panel-heading"><div><h2>操作记录</h2><p>共 {filtered.length} 条</p></div><History size={18} /></header>
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead><tr><th>时间</th><th>操作者</th><th>对象</th><th>动作</th><th>摘要</th><th>原因</th></tr></thead>
            <tbody>
              {auditPagination.items.map((event) => (
                <tr key={event.id}>
                  <td><span className="admin-table-secondary">{event.occurredAt}</span></td>
                  <td><strong>{event.actorName}</strong><small className="admin-table-block">{event.actorId}</small></td>
                  <td>{event.subjectName || "-"}</td>
                  <td><AdminBadge label={auditActionLabel[event.action]} /></td>
                  <td>{event.summary}</td>
                  <td><span className="admin-table-secondary">{event.reason || "-"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-audit-mobile-list">
          {auditPagination.items.map((event) => (
            <article key={event.id}>
              <header><strong>{event.summary}</strong><AdminBadge label={auditActionLabel[event.action]} /></header>
              <dl>
                <div><dt>时间</dt><dd>{event.occurredAt}</dd></div>
                <div><dt>操作者</dt><dd>{event.actorName}</dd></div>
                <div><dt>用户对象</dt><dd>{event.subjectName || "-"}</dd></div>
                <div><dt>原因</dt><dd>{event.reason || "-"}</dd></div>
              </dl>
            </article>
          ))}
          {!filtered.length ? <div className="admin-empty">没有符合筛选条件的审计记录</div> : null}
        </div>
        <AdminPagination
          totalItems={filtered.length}
          page={auditPagination.currentPage}
          pageSize={auditPagination.pageSize}
          totalPages={auditPagination.totalPages}
          startIndex={auditPagination.startIndex}
          endIndex={auditPagination.endIndex}
          unit="条日志"
          onPageChange={auditPagination.setPage}
          onPageSizeChange={auditPagination.setPageSize}
        />
      </section>
    </div>
  );
}

export function AdminSettingsPage() {
  const { session } = useAdminSession();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    services.adminSettings.get().then((result) => setSettings(result.data));
  }, []);

  if (!settings) {
    return <div className="admin-page-stack"><div className="admin-loading"><RefreshCcw className="spin" size={20} /> 正在加载系统设置</div></div>;
  }

  const save = async () => {
    setSaving(true);
    try {
      const result = await services.adminSettings.save(settings, session.userId);
      setSettings(result.data);
      setToast(result.message || "设置已保存");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "设置保存失败");
    } finally {
      setSaving(false);
    }
  };

  const updateReason = (index: number, value: string) =>
    setSettings({
      ...settings,
      correctionReasonTemplates: settings.correctionReasonTemplates.map((reason, reasonIndex) =>
        reasonIndex === index ? value : reason,
      ),
    });

  return (
    <div className="admin-page-stack">
      <PageHeader
        title="系统设置"
        description="仅配置用户注册、邀请、安全规则与资料退回模板。"
        actions={
          <button type="button" className="admin-primary-button" onClick={save} disabled={saving}>
            {saving ? <RefreshCcw className="spin" size={15} /> : <Check size={15} />} 保存设置
          </button>
        }
      />
      <aside className="admin-scope-notice">
        <ShieldCheck size={18} />
        <div><strong>支付业务不在此配置</strong><span>付款渠道、合同、Invoice、审核和付款由外部系统负责。</span></div>
      </aside>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>注册与邀请</h2><p>控制公开注册和邀请链接的有效期</p></div><UserPlus size={18} /></header>
        <div className="admin-settings-grid">
          <label className="admin-setting-toggle">
            <span><strong>开放创作者自主注册</strong><small>公开注册始终创建 CREATOR 账号</small></span>
            <input type="checkbox" checked={settings.registrationEnabled} onChange={(event) => setSettings({ ...settings, registrationEnabled: event.target.checked })} />
          </label>
          <label className="admin-form-field">
            <span>邀请有效期（天）</span>
            <input type="number" min={1} max={30} value={settings.invitationValidDays} onChange={(event) => setSettings({ ...settings, invitationValidDays: Number(event.target.value) })} />
          </label>
        </div>
      </section>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>密码规则</h2><p>适用于管理员创建和用户注册</p></div><KeyRound size={18} /></header>
        <div className="admin-settings-grid">
          <label className="admin-form-field"><span>最少字符</span><input type="number" min={6} max={20} value={settings.passwordMinLength} onChange={(event) => setSettings({ ...settings, passwordMinLength: Number(event.target.value) })} /></label>
          <label className="admin-form-field"><span>最多字符</span><input type="number" min={8} max={64} value={settings.passwordMaxLength} onChange={(event) => setSettings({ ...settings, passwordMaxLength: Number(event.target.value) })} /></label>
          <label className="admin-setting-check"><input type="checkbox" checked={settings.requireUppercase} onChange={(event) => setSettings({ ...settings, requireUppercase: event.target.checked })} /><span>必须包含大写字母</span></label>
          <label className="admin-setting-check"><input type="checkbox" checked={settings.requireLowercase} onChange={(event) => setSettings({ ...settings, requireLowercase: event.target.checked })} /><span>必须包含小写字母</span></label>
          <label className="admin-setting-check"><input type="checkbox" checked={settings.requireNumber} onChange={(event) => setSettings({ ...settings, requireNumber: event.target.checked })} /><span>必须包含数字</span></label>
        </div>
      </section>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>协议链接</h2><p>注册页面展示的法律协议地址</p></div><FileText size={18} /></header>
        <div className="admin-settings-links">
          <label className="admin-form-field"><span>服务协议</span><input value={settings.serviceAgreementUrl} onChange={(event) => setSettings({ ...settings, serviceAgreementUrl: event.target.value })} /></label>
          <label className="admin-form-field"><span>隐私政策</span><input value={settings.privacyPolicyUrl} onChange={(event) => setSettings({ ...settings, privacyPolicyUrl: event.target.value })} /></label>
          <label className="admin-form-field"><span>数据处理协议</span><input value={settings.dataProcessingUrl} onChange={(event) => setSettings({ ...settings, dataProcessingUrl: event.target.value })} /></label>
        </div>
      </section>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>资料退回原因模板</h2><p>管理员仍可在退回时补充具体说明</p></div><SlidersHorizontal size={18} /></header>
        <div className="admin-reason-list">
          {settings.correctionReasonTemplates.map((reason, index) => (
            <label key={index}><span>{index + 1}</span><input value={reason} onChange={(event) => updateReason(index, event.target.value)} /></label>
          ))}
        </div>
      </section>
      {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
    </div>
  );
}
