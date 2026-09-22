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
  Users,
  UserX,
  X,
} from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import Select from "./Select";
import { useTranslation } from "react-i18next";
import { displayCopy } from "./display-copy";
import LangSwitch from "./components/LangSwitch";
import { adminReturnPath } from "./admin-view-context";
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
  ContractType,
  Invoice,
  InvoiceStatus,
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

export function AdminSessionProvider({ session, logout, children }: AdminSessionValue & { children: ReactNode }) {
  return <AdminSessionContext.Provider value={{ session, logout }}>{children}</AdminSessionContext.Provider>;
}

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

const adminContractStatusTone: Record<
  Contract["status"],
  "purple" | "info" | "neutral"
> = {
  PENDING_SIGNATURE: "purple",
  ACTIVE: "info",
  EXPIRED: "neutral",
};

const auditActionLabel: Record<AuditEvent["action"], string> = {
  LOGIN: "登录",
  USER_CREATED: "创建账号",
  USER_INVITED: "邀请用户",
  USER_STATUS_CHANGED: "账号状态变更",
  PASSWORD_RESET_SENT: "密码重置",
  PASSWORD_RESET_COMPLETED: "密码重置完成",
  PROFILE_UPDATED: "档案更新",
  VERIFICATION_UPDATED: "认证状态更新",
  CORRECTION_CREATED: "资料退回",
  CORRECTION_AUTO_RESOLVED: "修正自动关闭",
  SENSITIVE_DATA_REVEALED: "查看敏感信息",
  USERS_EXPORTED: "导出用户",
  SETTINGS_UPDATED: "更新设置",
  EXTERNAL_DATA_SYNCED: "外部数据同步",
  EXTERNAL_DATA_REJECTED: "外部数据拒绝",
  CREATOR_BUSINESS_ACTION: "达人操作",
};

function AdminBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "purple";
}) {
  const { t } = useTranslation();
  return <span className={`admin-badge admin-badge-${tone}`}>{displayCopy(label, t)}</span>;
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
  const { t } = useTranslation();
  return (
    <header className="admin-page-header">
      <div>
        <h1>{displayCopy(title, t)}</h1>
        <p>{displayCopy(description, t)}</p>
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
  const { t } = useTranslation();
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
    <footer className="admin-pagination" aria-label={t("admin.pagination", { unit: displayCopy(unit, t) })}>
      <div className="admin-pagination-content">
        <div className="admin-pagination-meta">{t("admin.totalRecords", { count: totalItems })}</div>
        <nav className="admin-page-buttons" aria-label={t("admin.pageNumbers", { unit: displayCopy(unit, t) })}>
          <button
            type="button"
            aria-label={t("admin.previousPage")}
            title={t("admin.previousPage")}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={13} />
          </button>
          {getAdminPageTokens(page, totalPages).map((token) =>
            typeof token === "number" ? (
              <button
                type="button"
                aria-label={t("admin.pageNumber", { number: token })}
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
                aria-label={t("admin.jumpPage", { unit: displayCopy(unit, t) })}
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
                aria-label={t("admin.enterPage")}
                title={t("admin.enterPage")}
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
            aria-label={t("admin.nextPage")}
            title={t("admin.nextPage")}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={13} />
          </button>
        </nav>
        <label className="admin-page-size">
          <Select
            aria-label={t("admin.pageSize", { unit: displayCopy(unit, t) })}
            value={pageSize}
            onValueChange={(value) =>
              onPageSizeChange(Number(value) as AdminPageSize)
            }
          >
            {ADMIN_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {t("admin.recordsPerPage", { size })}
              </option>
            ))}
          </Select>
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
  const { t } = useTranslation();
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
            <h2 id="admin-modal-title">{displayCopy(title, t)}</h2>
            {description ? <p>{displayCopy(description, t)}</p> : null}
          </div>
          <button
            type="button"
            className="admin-icon-button"
            aria-label={t("common.close")}
            title={t("common.close")}
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

function AdminStatusConfirmModal({
  status,
  count,
  bulk = false,
  onClose,
  onConfirm,
}: {
  status: AccountStatus;
  count: number;
  bulk?: boolean;
  onClose(): void;
  onConfirm(): void;
}) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const disabling = status === "DISABLED";

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const title = bulk
    ? t(disabling ? "admin.confirmBulkDisableTitle" : "admin.confirmBulkEnableTitle", { count })
    : t(disabling ? "admin.confirmDisableTitle" : "admin.confirmEnableTitle");

  return (
    <div className="admin-modal-backdrop admin-confirm-backdrop" role="presentation">
      <section
        className="admin-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-status-confirm-title"
        aria-describedby="admin-status-confirm-description"
      >
        <header>
          <h2 id="admin-status-confirm-title">{title}</h2>
          <p id="admin-status-confirm-description">
            {t(disabling ? "admin.disableAccountDescription" : "admin.enableAccountDescription")}
          </p>
        </header>
        <footer>
          <button ref={cancelRef} type="button" className="admin-ghost-button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={disabling ? "admin-confirm-danger" : "admin-primary-button"}
            onClick={onConfirm}
          >
            {t(disabling ? "admin.confirmDisable" : "admin.confirmEnable")}
          </button>
        </footer>
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
  const { t } = useTranslation();
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="admin-toast" role="status">
      <Check size={16} />
      <span>{displayCopy(message, t)}</span>
      <button type="button" onClick={onClose} aria-label={t("admin.closeReminder")}>
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
  const { t } = useTranslation();
  return (
    <div className="admin-filter-control admin-search-control">
      <Search size={15} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={displayCopy(placeholder, t)}
        aria-label={displayCopy(label, t)}
      />
      {value ? (
        <button
          type="button"
          aria-label={t("common.clearSearch")}
          title={t("common.clearSearch")}
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
  const { t } = useTranslation();
  const active = value !== "ALL" && value !== "";
  return (
    <div
      className={`admin-filter-control admin-select-control${active ? " is-active" : ""}`}
    >
      <span className="admin-filter-leading-icon" aria-hidden="true">
        {icon}
      </span>
      <Select
        value={value}
        onValueChange={onChange}
        aria-label={displayCopy(label, t)}
      >
        {children}
      </Select>
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
  const { t } = useTranslation();
  return (
    <div
      className={`admin-filter-control admin-date-control${value ? " is-active" : ""}`}
    >
      <CalendarDays size={15} aria-hidden="true" />
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={displayCopy(label, t)}
        title={displayCopy(label, t)}
      />
    </div>
  );
}

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
  const { t } = useTranslation();
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
    <>
      <div className="admin-shell">
        <header className="admin-topbar">
          <div className="admin-brand-lockup">
            <button
              type="button"
              className="admin-mobile-menu"
              onClick={() => setDrawerOpen(true)}
              aria-label={t("layout.openNavigation")}
            >
              <Menu size={20} />
            </button>
            <Link to="/admin/select-user" className="admin-brand">
              <img src="/comets-mark.svg" alt="" />
              <span><strong>COMETS</strong><small>{t("admin.portalName")}</small></span>
            </Link>
          </div>
          <div className="admin-topbar-account">
            <LangSwitch />
            <AdminBadge label="系统管理员" tone="purple" />
            <span className="admin-avatar">{session.email.slice(0, 1).toUpperCase()}</span>
            <span><strong>{session.email}</strong><small>{t("admin.identityOperations")}</small></span>
          </div>
        </header>
        <aside className={`admin-sidebar ${drawerOpen ? "admin-sidebar-open" : ""}`}>
          <div className="admin-sidebar-mobile-head">
            <span>{t("admin.navigation")}</span>
            <button
              type="button"
              className="admin-icon-button"
              onClick={() => setDrawerOpen(false)}
              aria-label={t("layout.closeNavigation")}
            >
              <X size={18} />
            </button>
          </div>
          <nav>
            <span className="admin-nav-label">{t("admin.creatorView")}</span>
            <Link className="admin-nav-item" to="/admin/select-user" onClick={() => setDrawerOpen(false)}><Users size={17} /><span>{t("menu.selectCreator")}</span><ChevronRight size={14} /></Link>
            <button
              type="button"
              className={`admin-nav-item admin-nav-group ${location.pathname.startsWith("/admin/settings") ? "admin-nav-group-active" : ""}`}
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings size={17} />
              <span>{t("admin.systemSettings")}</span>
              <ChevronDown className={settingsOpen ? "is-open" : ""} size={14} />
            </button>
            {settingsOpen ? (
              <div className="admin-nav-children">
                {adminSettingsNav.map(({ to, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) =>
                      `admin-nav-child ${isActive ? "admin-nav-child-active" : ""}`
                    }
                  >
                    <Icon size={15} />
                    <span>{t(to.endsWith("/users") ? "menu.users" : "menu.auditLogs")}</span>
                  </NavLink>
                ))}
              </div>
            ) : null}
          </nav>
          <Link className="admin-nav-item" to={adminReturnPath()}><ArrowLeft size={17} /><span>{t("admin.returnToCreatorView")}</span></Link>
          <button type="button" className="admin-sidebar-logout" onClick={doLogout}>
            <LogOut size={17} />
            {t("menu.signOut")}
          </button>
        </aside>
        {drawerOpen ? (
          <button
            type="button"
            className="admin-sidebar-scrim"
            onClick={() => setDrawerOpen(false)}
            aria-label={t("layout.closeNavigation")}
          />
        ) : null}
        <main className="admin-main">
          {accessDenied ? (
            <div className="role-access-notice" role="alert">
              <AlertCircle size={16} />
              <span>{displayCopy(accessDenied, t)}</span>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </>
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
  const { t } = useTranslation();
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
      aria-label={t("admin.currentRequestStatus", { status: displayCopy(adminInvoiceStatus[status].requestLabel, t) })}
    >
      {[t("menu.contracts"), "Invoice", t("admin.reviewStep"), t("admin.paymentStep")].map((label, index) => (
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
  const { t } = useTranslation();
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
          <RefreshCcw className="spin" size={20} /> {t("admin.loadingProjects")}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-stack admin-business-page">
      <PageHeader
        title={t("admin.requestProjects")}
        description={t("admin.projectsDescription")}
      />
      <section
        className="request-money-overview admin-request-money-overview"
        aria-label={t("admin.projectAmountOverview")}
      >
        <article>
          <i className="amber" />
          <div><span>{t("admin.pendingSignatureAmount")}</span><strong>{summarizeAdminAmounts(signatureRows.map((item) => item.request))}</strong></div>
          <small>{t("admin.projectCount", { count: signatureRows.length })}</small>
        </article>
        <article>
          <i className="blue" />
          <div><span>{t("admin.processingAmount")}</span><strong>{summarizeAdminAmounts(processingRows.map((item) => item.request))}</strong></div>
          <small>{t("admin.projectCount", { count: processingRows.length })}</small>
        </article>
        <article>
          <i className="green" />
          <div><span>{t("admin.paidAmount")}</span><strong>{summarizeAdminAmounts(paidRows.map((item) => item.request))}</strong></div>
          <small>{t("admin.projectCount", { count: paidRows.length })}</small>
        </article>
        <article className="admin-request-total-card">
          <i className="purple" />
          <div>
            <span>{t("admin.totalProjects")}</span>
            <strong>{t("admin.projectCount", { count: rows.length })}</strong>
            <div className="admin-currency-breakdown">
              {allProjectAmounts.map((summary) => (
                <span key={summary.currency}>
                  <b>{summary.currency} {summary.formattedAmount}</b>
                  <small>{t("admin.projectCount", { count: summary.count })}</small>
                </span>
              ))}
            </div>
          </div>
        </article>
      </section>
      <section className="admin-panel admin-table-panel">
        <header className="admin-panel-heading">
          <div><h2>{t("admin.allProjects")}</h2><p>{t("admin.matchedProjectsOnly")}</p></div>
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
              <option value="ALL">{t("admin.allCreatorsOption")}</option>
              {creators.map((creator) => (
                <option key={creator.id} value={creator.id}>
                  {creator.name} · {creator.id}
                </option>
              ))}
            </AdminSelectControl>
          </div>
          <div className="admin-status-tabs" role="tablist" aria-label={t("admin.filterRequestStatus")}>
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
                  ? t("common.all")
                  : displayCopy(adminInvoiceStatus[value].requestLabel, t)}
              </button>
            ))}
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-data-table admin-request-table">
            <thead>
              <tr>
                <th>{t("admin.projectRequestNumber")}</th>
                <th>{t("admin.creatorColumn")}</th>
                <th>{t("admin.amountColumn")}</th>
                <th>{t("admin.contractStatusColumn")}</th>
                <th>{t("admin.invoiceStatusColumn")}</th>
                <th>{t("admin.requestStatusColumn")}</th>
                <th>{t("admin.updatedColumn")}</th>
                <th>{t("admin.requestProgress")}</th>
                <th>{t("admin.actions")}</th>
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
                    <td><AdminBadge label={contractStatusLabel[item.contract.status]} tone={adminContractStatusTone[item.contract.status]} /></td>
                    <td><AdminBadge label={meta.label} tone={meta.tone} /></td>
                    <td><AdminBadge label={meta.requestLabel} tone={meta.tone} /></td>
                    <td><span className="admin-table-secondary">{item.request.updatedAt}</span></td>
                    <td><AdminRequestProgress status={item.invoice.status} /></td>
                    <td>
                      <Link
                        className="admin-icon-link"
                        to={`/admin/requests/${item.creator.id}/${item.request.id}`}
                        title={t("admin.viewRequestDetails")}
                      >
                        <Eye size={15} /><span>{t("common.view")}</span>
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
                  <div><dt>{t("admin.creatorColumn")}</dt><dd>{item.creator.name} · {item.creator.id}</dd></div>
                  <div><dt>{t("admin.amountColumn")}</dt><dd>{item.request.amount}</dd></div>
                  <div><dt>{t("admin.contractStatusColumn")}</dt><dd>{displayCopy(contractStatusLabel[item.contract.status], t)}</dd></div>
                  <div><dt>{t("admin.invoiceStatusColumn")}</dt><dd>{displayCopy(meta.label, t)}</dd></div>
                  <div><dt>{t("admin.updatedColumn")}</dt><dd>{item.request.updatedAt}</dd></div>
                </dl>
                <AdminRequestProgress status={item.invoice.status} />
                <Link to={`/admin/requests/${item.creator.id}/${item.request.id}`}>
                  {t("admin.viewRequest")} <ChevronRight size={14} />
                </Link>
              </article>
            );
          })}
        </div>
        {!filtered.length ? <div className="admin-empty">{t("admin.noProjects")}</div> : null}
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
  const { t } = useTranslation();
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
    PENDING_SIGNATURE: rows.filter((item) => item.record.status === "PENDING_SIGNATURE").length,
    ACTIVE: rows.filter((item) => item.record.status === "ACTIVE").length,
    EXPIRED: rows.filter((item) => item.record.status === "EXPIRED").length,
  };

  if (!data) return <div className="admin-page-stack"><div className="admin-loading"><RefreshCcw className="spin" size={20} /> {t("admin.loadingContracts")}</div></div>;

  return (
    <div className="admin-page-stack admin-business-page">
      <PageHeader title={t("menu.contracts")} description={t("admin.contractsDescription")} />
      <section className="admin-business-summary admin-business-summary-card" aria-label={t("admin.contractOverview")}>
        <article><span>{t("admin.allContracts")}</span><strong>{rows.length}</strong><small>{t("admin.allContractsDescription")}</small></article>
        <article><span>{t("status.awaitingSignature")}</span><strong>{counts.PENDING_SIGNATURE}</strong><small>{t("admin.pendingContractsDescription")}</small></article>
        <article><span>{t("status.active")}</span><strong>{counts.ACTIVE}</strong><small>{t("admin.activeContractsDescription")}</small></article>
        <article><span>{t("status.expired")}</span><strong>{counts.EXPIRED}</strong><small>{t("admin.expiredContractsDescription")}</small></article>
      </section>
      <section className="admin-panel admin-table-panel">
        <header className="admin-panel-heading"><div><h2>{t("admin.allContracts")}</h2><p>{t("admin.readOnlyDownload")}</p></div><FileText size={18} /></header>
        <div className="admin-business-toolbar">
          <div className="admin-business-filter-fields">
            <AdminSearchControl value={query} onChange={setQuery} placeholder="搜索合同、项目、品牌、达人或 Creator ID" />
            <AdminSelectControl value={creatorId} onChange={setCreatorId} label="筛选创作者" icon={<Users size={15} />}>
              <option value="ALL">{t("admin.allCreatorsOption")}</option>
              {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name} · {creator.id}</option>)}
            </AdminSelectControl>
          </div>
          <div className="admin-status-tabs" role="tablist" aria-label={t("admin.filterContractStatus")}>
            {(["ALL", "PENDING_SIGNATURE", "ACTIVE", "EXPIRED"] as const).map((value) => (
              <button type="button" role="tab" aria-selected={status === value} className={status === value ? "active" : ""} key={value} onClick={() => setStatus(value)}>
                {value === "ALL" ? t("common.all") : displayCopy(contractStatusLabel[value], t)}
              </button>
            ))}
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-data-table admin-contract-table">
            <thead><tr><th>{t("menu.contracts")}</th><th>{t("admin.projectBrand")}</th><th>{t("admin.creatorColumn")}</th><th>{t("contracts.amount")}</th><th>{t("admin.contractStatusColumn")}</th><th>{t("admin.effectiveDate")}</th><th>{t("admin.updatedDate")}</th><th>{t("admin.actions")}</th></tr></thead>
            <tbody>
              {contractPagination.items.map(({ creator, record }) => (
                <tr key={`${creator.id}-${record.id}`}>
                  <td><strong>{record.id}</strong><small className="admin-table-block">{record.orderId}</small></td>
                  <td><strong>{record.projectName}</strong><small className="admin-table-block">{record.brand}</small></td>
                  <td><strong>{creator.name}</strong><small className="admin-table-block">{creator.id}</small></td>
                  <td><strong>{record.amount}</strong></td>
                  <td><AdminBadge label={contractStatusLabel[record.status]} tone={adminContractStatusTone[record.status]} /></td>
                  <td><span className="admin-table-secondary">{record.effectiveDate}</span></td>
                  <td><span className="admin-table-secondary">{record.updatedAt}</span></td>
                  <td><div className="admin-inline-actions"><Link className="admin-icon-link" to={`/admin/contracts/${creator.id}/${record.id}`} title={t("admin.viewContractDetails")}><Eye size={15} /><span>{t("common.view")}</span></Link><span title={t("admin.originalNotRedacted")}>{t("admin.originalNotAvailable")}</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-business-mobile-list">
          {contractPagination.items.map(({ creator, record }) => (
            <article key={`${creator.id}-${record.id}`}>
              <header><strong>{record.projectName}</strong><AdminBadge label={contractStatusLabel[record.status]} tone={adminContractStatusTone[record.status]} /></header>
              <small className="admin-mobile-record-id">{record.id} · {record.orderId}</small>
              <dl><div><dt>{t("admin.brand")}</dt><dd>{record.brand}</dd></div><div><dt>{t("admin.creatorColumn")}</dt><dd>{creator.name} · {creator.id}</dd></div><div><dt>{t("contracts.amount")}</dt><dd>{record.amount}</dd></div><div><dt>{t("admin.effectiveDate")}</dt><dd>{record.effectiveDate}</dd></div><div><dt>{t("admin.updatedDate")}</dt><dd>{record.updatedAt}</dd></div></dl>
              <div className="admin-business-mobile-actions"><Link to={`/admin/contracts/${creator.id}/${record.id}`}><Eye size={14} /> {t("common.view")}</Link><span>{t("admin.originalNotAvailable")}</span></div>
            </article>
          ))}
        </div>
        {!filtered.length ? <div className="admin-empty">{t("admin.noContracts")}</div> : null}
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
  const { t } = useTranslation();
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

  if (!data) return <div className="admin-page-stack"><div className="admin-loading"><RefreshCcw className="spin" size={20} /> {t("admin.loadingInvoices")}</div></div>;

  return (
    <div className="admin-page-stack admin-business-page">
      <PageHeader title="Invoice" description={t("admin.invoicesDescription")} />
      <section
        className="admin-business-summary admin-business-summary-card admin-invoice-summary"
        aria-label={t("admin.invoiceOverview")}
      >
        <article><span>{t("admin.totalInvoices")}</span><strong>{rows.length}</strong><small>{t("admin.allInvoicesDescription")}</small></article>
        <article><span>{t("status.awaitingSignature")}</span><strong>{statusCounts.DRAFT_SIGNATURE}</strong><small>{t("admin.pendingInvoiceSignature")}</small></article>
        <article><span>{t("status.awaitingReview")}</span><strong>{statusCounts.PENDING_REVIEW}</strong><small>{t("admin.reviewingDocuments")}</small></article>
        <article><span>{t("status.approved")}</span><strong>{statusCounts.APPROVED}</strong><small>{t("admin.approvedAwaitingPayment")}</small></article>
        <article><span>{t("status.paymentIssue")}</span><strong>{statusCounts.PAYMENT_FAILED}</strong><small>{t("admin.paymentNeedsAction")}</small></article>
        <article><span>{t("admin.paidAmount")}</span><strong>{statusCounts.PAID}</strong><small>{t("admin.paymentCompleteDescription")}</small></article>
      </section>
      <section className="admin-panel admin-table-panel">
        <header className="admin-panel-heading"><div><h2>{t("admin.allInvoices")}</h2><p>{t("admin.invoicesExternalNotice")}</p></div><ReceiptText size={18} /></header>
        <div className="admin-business-toolbar">
          <div className="admin-business-filter-fields">
            <AdminSearchControl value={query} onChange={setQuery} placeholder="搜索 Invoice、项目、达人或 Creator ID" />
            <AdminSelectControl value={creatorId} onChange={setCreatorId} label="筛选创作者" icon={<Users size={15} />}>
              <option value="ALL">{t("admin.allCreatorsOption")}</option>
              {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name} · {creator.id}</option>)}
            </AdminSelectControl>
          </div>
          <div className="admin-status-tabs" role="tablist" aria-label={t("admin.filterInvoiceStatus")}>
            {(["ALL", ...adminInvoiceOrder] as const).map((value) => (
              <button type="button" role="tab" aria-selected={status === value} className={status === value ? "active" : ""} key={value} onClick={() => setStatus(value)}>
                {value === "ALL" ? t("common.all") : displayCopy(adminInvoiceStatus[value].label, t)}
                <span>{rows.filter((item) => value === "ALL" || item.record.status === value).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-data-table admin-invoice-table">
            <thead><tr><th>Invoice</th><th>{t("admin.relatedProject")}</th><th>{t("admin.creatorColumn")}</th><th>{t("admin.channel")}</th><th>{t("admin.amountColumn")}</th><th>{t("admin.statusColumn")}</th><th>{t("admin.updatedColumn")}</th><th>{t("admin.actions")}</th></tr></thead>
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
                    <td><div className="admin-inline-actions"><Link className="admin-icon-link" to={`/admin/invoices/${creator.id}/${record.id}`} title={t("admin.viewInvoiceDetails")}><Eye size={15} /><span>{t("common.view")}</span></Link><span title={t("admin.originalNotRedacted")}>{t("admin.originalNotAvailable")}</span></div></td>
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
                <dl><div><dt>{t("admin.creatorColumn")}</dt><dd>{creator.name} · {creator.id}</dd></div><div><dt>{t("admin.channel")}</dt><dd>{record.channel}</dd></div><div><dt>{t("admin.amountColumn")}</dt><dd>{record.amount}</dd></div><div><dt>{t("admin.updatedColumn")}</dt><dd>{record.updatedAt}</dd></div></dl>
                <div className="admin-business-mobile-actions"><Link to={`/admin/invoices/${creator.id}/${record.id}`}><Eye size={14} /> {t("common.view")}</Link><span>{t("admin.originalNotAvailable")}</span></div>
              </article>
            );
          })}
        </div>
        {!filtered.length ? <div className="admin-empty">{t("admin.noInvoices")}</div> : null}
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
  const { t } = useTranslation();
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
  const actionUsers = [
    ...new Map(
      [...pendingVerification, ...correctionUsers].map(
        (user) => [user.id, user],
      ),
    ).values(),
  ];

  return (
    <div className="admin-page-stack">
      <PageHeader
        title={t("admin.dashboardTitle")}
        description={t("admin.dashboardDescription")}
        actions={
          <Link className="admin-primary-button" to="/admin/settings/users">
            <Users size={16} /> {t("admin.manageUsers")}
          </Link>
        }
      />
      <section className="admin-metric-strip" aria-label={t("admin.userMetrics")}>
        {[
          [t("admin.totalUsers"), users.length, t("admin.allUsersDescription")],
          [
            t("admin.enabledDisabled"),
            `${users.filter((user) => user.status === "ACTIVE").length} / ${users.filter((user) => user.status === "DISABLED").length}`,
            t("admin.accountAccessDescription"),
          ],
          [t("status.pendingVerification"), pendingVerification.length, t("admin.cannotSignPending")],
          [t("status.needsCorrection"), correctionCount, t("admin.needsMoreInformation")],
          [t("admin.syncIssues"), syncIssueCount, t("admin.unknownCreatorOrVersion")],
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
            <div><h2>{t("admin.needsAttention")}</h2><p>{t("admin.attentionDescription")}</p></div>
            <Link to="/admin/settings/users">{t("admin.viewAll")} <ChevronRight size={14} /></Link>
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
                      user.hasOpenCorrection
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
              <div className="admin-empty">{t("admin.noAttention")}</div>
            ) : null}
          </div>
        </section>

        <section className="admin-panel">
          <header className="admin-panel-heading">
            <div><h2>{t("admin.recentActions")}</h2><p>{t("admin.recentActionsDescription")}</p></div>
            <Link to="/admin/settings/audit-logs">{t("menu.auditLogs")} <ChevronRight size={14} /></Link>
          </header>
          <div className="admin-activity-list">
            {audits.slice(0, 6).map((event) => (
              <article key={event.id}>
                <span className="admin-activity-icon"><History size={15} /></span>
                <div><strong>{displayCopy(event.summary, t)}</strong><small>{event.actorName} · {event.occurredAt}</small></div>
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
  const { t } = useTranslation();
  const { session } = useAdminSession();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [filters, setFilters] = useState<AdminUserFilters>({
    query: "",
    role: "ALL",
    status: "ALL",
    verificationStatus: "ALL",
    correctionStatus: "ALL",
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [statusAction, setStatusAction] = useState<AccountStatus | null>(null);
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
      );
      setToast(result.message || "账号状态已更新");
      setStatusAction(null);
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
          <button type="button" className="admin-secondary-button" onClick={exportUsers}>
            <Download size={16} /> {t("admin.exportMasked")}
          </button>
        }
      />

      <section className="admin-filter-panel">
        <AdminSearchControl
          value={filters.query || ""}
          onChange={(value) => setFilter("query", value)}
          placeholder="搜索姓名、邮箱或 Creator ID"
        />
        <AdminSelectControl value={filters.role || "ALL"} onChange={(value) => setFilter("role", value as AdminUserFilters["role"])} label="筛选账号角色" icon={<CircleUserRound size={15} />}>
          <option value="ALL">{t("admin.allRoles")}</option>
          <option value="ADMIN">{t("admin.roleAdministrator")}</option>
          <option value="CREATOR">{t("admin.roleCreator")}</option>
        </AdminSelectControl>
        <AdminSelectControl value={filters.status || "ALL"} onChange={(value) => setFilter("status", value as AdminUserFilters["status"])} label="筛选账号状态" icon={<UserCheck size={15} />}>
          <option value="ALL">{t("admin.allAccountStatuses")}</option>
          <option value="ACTIVE">{t("admin.enabled")}</option>
          <option value="DISABLED">{t("admin.disabled")}</option>
        </AdminSelectControl>
        <AdminSelectControl value={filters.verificationStatus || "ALL"} onChange={(value) => setFilter("verificationStatus", value as AdminUserFilters["verificationStatus"])} label="筛选认证状态" icon={<ShieldCheck size={15} />}>
          <option value="ALL">{t("admin.allVerificationStatuses")}</option>
          <option value="PENDING">{t("admin.pendingVerification")}</option>
          <option value="VERIFIED">{t("admin.verified")}</option>
          <option value="CHANGES_REQUESTED">{t("admin.needsCorrection")}</option>
        </AdminSelectControl>
        <AdminSelectControl value={filters.correctionStatus || "ALL"} onChange={(value) => setFilter("correctionStatus", value as AdminUserFilters["correctionStatus"])} label="筛选资料修正状态" icon={<AlertCircle size={15} />}>
          <option value="ALL">{t("admin.allCorrectionStatuses")}</option>
          <option value="OPEN">{t("admin.withCorrections")}</option>
          <option value="CLEAR">{t("admin.withoutCorrections")}</option>
        </AdminSelectControl>
      </section>

      {selected.length ? (
        <section className="admin-bulk-bar">
          <span>{t("admin.selectedAccounts", { count: selected.length })}</span>
          <div>
            <button type="button" onClick={() => setStatusAction("ACTIVE")}><UserCheck size={15} /> {t("admin.bulkEnable")}</button>
            <button type="button" onClick={() => setStatusAction("DISABLED")}><UserX size={15} /> {t("admin.bulkDisable")}</button>
            <button type="button" onClick={() => setSelected([])}>{t("admin.cancelSelection")}</button>
          </div>
        </section>
      ) : null}

      <section className="admin-panel admin-table-panel">
        <header className="admin-panel-heading">
          <div><h2>{t("admin.accountList")}</h2><p>{loading ? t("common.loading") : t("admin.accountCount", { count: users.length })}</p></div>
          <SlidersHorizontal size={17} />
        </header>
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th className="admin-check-cell">
                  <input
                    type="checkbox"
                    aria-label={t("admin.selectAllCurrent")}
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
                <th>{t("admin.accountInformation")}</th>
                <th>{t("admin.role")}</th>
                <th>{t("admin.verification")}</th>
                <th>{t("admin.accountStatus")}</th>
                <th>{t("admin.lastLogin")}</th>
                <th>{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {userPagination.items.map((user) => (
                <tr key={user.id}>
                  <td className="admin-check-cell">
                    <input
                      type="checkbox"
                      aria-label={t("admin.selectUser", { name: user.name })}
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
                  <td><AdminBadge label={accountStatusLabel[user.status]} tone={accountStatusTone(user.status)} /></td>
                  <td><span className="admin-table-secondary">{user.lastLoginAt}</span></td>
                  <td>
                    <Link className="admin-icon-link" to={`/admin/settings/users/${user.id}`} title={t("admin.viewUser")}>
                      <Eye size={15} /><span>{t("common.view")}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !users.length ? <div className="admin-empty">{t("admin.noMatchingUsers")}</div> : null}
        <div className="admin-user-mobile-list">
          {userPagination.items.map((user) => (
            <article key={user.id}>
              <header>
                <input
                  type="checkbox"
                  aria-label={t("admin.selectUser", { name: user.name })}
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
                <div><dt>{t("admin.email")}</dt><dd>{user.email}</dd></div>
                <div><dt>{t("admin.role")}</dt><dd>{displayCopy(roleLabel[user.role], t)}</dd></div>
                <div><dt>{t("admin.verification")}</dt><dd>{displayCopy(verificationLabel[user.verificationStatus], t)}</dd></div>
                <div><dt>{t("admin.lastLogin")}</dt><dd>{user.lastLoginAt}</dd></div>
              </dl>
              <Link to={`/admin/settings/users/${user.id}`}>{t("admin.viewUser")} <ChevronRight size={15} /></Link>
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

      {statusAction ? (
        <AdminStatusConfirmModal
          status={statusAction}
          count={selected.length}
          bulk
          onClose={() => setStatusAction(null)}
          onConfirm={applyBulkStatus}
        />
      ) : null}
      {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
    </div>
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
  { key: "activity", label: "记录" },
];

export function AdminUserDetailPage() {
  const { t } = useTranslation();
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
  const [revealedUserId, setRevealedUserId] = useState("");
  const [statusModal, setStatusModal] = useState(false);

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

  useEffect(() => {
    setRevealed({});
    setRevealedUserId("");
    setRevealField(null);
  }, [id, tab]);

  if (!detail || detail.account.id !== id) {
    return <div className="admin-page-stack"><div className="admin-loading"><RefreshCcw className="spin" size={20} /> {t("admin.userDetailLoading")}</div></div>;
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
      );
      setToast(result.message || "账号状态已更新");
      setStatusModal(false);
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
      <Link className="admin-back-link" to="/admin/settings/users"><ArrowLeft size={15} /> {t("admin.backToUsers")}</Link>
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
          <button type="button" className="admin-secondary-button" onClick={resetPassword}><KeyRound size={15} /> {t("admin.resetPassword")}</button>
          <button
            type="button"
            className={account.status === "ACTIVE" ? "admin-danger-button" : "admin-primary-button"}
            onClick={() => setStatusModal(true)}
            disabled={account.id === session.userId}
          >
            {account.status === "ACTIVE" ? <UserX size={15} /> : <UserCheck size={15} />}
            {t(account.status === "ACTIVE" ? "admin.disableAccount" : "admin.enableAccount")}
          </button>
        </div>
      </section>

      <nav className="admin-detail-tabs" aria-label={t("admin.userDetails")}>
        {userDetailTabs.map((item) => (
          <button
            type="button"
            key={item.key}
            className={tab === item.key ? "active" : ""}
            onClick={() => setSearchParams({ tab: item.key })}
          >
            {t(`admin.${({ overview: "tabOverview", profile: "tabProfile", payout: "tabPayout", contracts: "tabContracts", invoices: "tabInvoices", requests: "tabRequests", activity: "tabActivity" } as Record<UserDetailTab, string>)[item.key]}`)}
            {item.key === "contracts" && detail.contracts.length ? <span>{detail.contracts.length}</span> : null}
            {item.key === "invoices" && detail.invoices.length ? <span>{detail.invoices.length}</span> : null}
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
          revealed={revealedUserId === id ? revealed : {}}
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
            setRevealed((current) => ({ ...(revealedUserId === id ? current : {}), [revealField]: value }));
            setRevealedUserId(id);
            setRevealField(null);
            setToast(value ? message : t("admin.emptyFieldAudited"));
            load();
          }}
        />
      ) : null}
      {statusModal ? (
        <AdminStatusConfirmModal
          status={account.status === "ACTIVE" ? "DISABLED" : "ACTIVE"}
          count={1}
          onClose={() => setStatusModal(false)}
          onConfirm={changeStatus}
        />
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
  const { t } = useTranslation();
  const { account, profile } = detail;
  const openCorrections = detail.corrections.filter((item) => item.status === "OPEN");
  return (
    <div className="admin-detail-grid">
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>{t("admin.accountStatus")}</h2><p>{t("admin.accountStatusIndependent")}</p></div><CircleUserRound size={18} /></header>
        <dl className="admin-description-list">
          <div><dt>{t("admin.role")}</dt><dd>{displayCopy(roleLabel[account.role], t)}</dd></div>
          <div><dt>{t("admin.accessStatus")}</dt><dd><AdminBadge label={accountStatusLabel[account.status]} tone={accountStatusTone(account.status)} /></dd></div>
          <div><dt>{t("admin.registeredAt")}</dt><dd>{account.createdAt}</dd></div>
          <div><dt>{t("admin.lastLogin")}</dt><dd>{account.lastLoginAt}</dd></div>
          <div><dt>{t("admin.profileCorrections")}</dt><dd>{openCorrections.length ? t("admin.pendingItems", { count: openCorrections.length }) : t("admin.noPendingItems")}</dd></div>
        </dl>
      </section>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>{t("admin.socialVerification")}</h2><p>{t("admin.signingRestricted")}</p></div><ShieldCheck size={18} /></header>
        {profile ? (
          <div className="admin-verification-summary">
            <span className="admin-social-mark">{profile.social.platform.slice(0, 1)}</span>
            <div><strong>{profile.social.platform} · {profile.social.handle}</strong><small>{t("admin.socialEvidenceCounts", { links: profile.social.profileUrls.length, screenshots: profile.social.screenshots.length })}</small></div>
            <AdminBadge label={verificationLabel[account.verificationStatus]} tone={verificationTone(account.verificationStatus)} />
          </div>
        ) : <div className="admin-empty">{t("admin.adminNoSocialVerification")}</div>}
        {account.role === "CREATOR" && account.verificationStatus !== "VERIFIED" ? (
          <div className="admin-verification-actions">
            <button type="button" className="admin-primary-button" onClick={() => onVerification("VERIFIED")}><UserCheck size={15} /> {t("admin.approveVerification")}</button>
            <button type="button" className="admin-secondary-button" onClick={onCorrection}><AlertCircle size={15} /> {t("admin.returnSpecificFields")}</button>
          </div>
        ) : null}
      </section>
      <section className="admin-panel admin-detail-wide">
        <header className="admin-panel-heading"><div><h2>{t("admin.relatedBusiness")}</h2><p>{t("admin.externalReadOnly")}</p></div><FileText size={18} /></header>
        <div className="admin-business-summary admin-user-business-summary">
          <article><span>{t("menu.contracts")}</span><strong>{detail.contracts.length}</strong><small>{t("admin.externalSync")}</small></article>
          <article><span>Invoice</span><strong>{detail.invoices.length}</strong><small>{t("admin.externalSync")}</small></article>
          <article><span>{t("admin.recentSync")}</span><strong className="admin-sync-time">{detail.lastSyncedAt || "-"}</strong><small>{t(detail.lastSyncedAt ? "admin.dataLinked" : "admin.noBusinessData")}</small></article>
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
  const { t } = useTranslation();
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
        <div><h2>{t("admin.tabProfile")}</h2><p>{t("admin.profileAdminDescription")}</p></div>
        <div className="admin-inline-actions">
          <button type="button" className="admin-secondary-button" onClick={onCorrection}><AlertCircle size={15} /> {t("admin.returnField")}</button>
          {editing ? (
            <>
              <button type="button" className="admin-ghost-button" onClick={() => onEditingChange(false)}>{t("common.cancel")}</button>
              <button type="button" className="admin-primary-button" onClick={save}><Check size={15} /> {t("common.saveChanges")}</button>
            </>
          ) : (
            <button type="button" className="admin-primary-button" onClick={() => onEditingChange(true)}>{t("admin.editProfile")}</button>
          )}
        </div>
      </header>
      {error ? <div className="admin-inline-alert">{displayCopy(error, t)}</div> : null}
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
            <span>{t(`admin.${({ displayName: "displayName", legalName: "realName", email: "contactEmail", phone: "phone", address: "contactAddress", platform: "socialPlatform", handle: "socialAccount" } as Record<string, string>)[key]}`)}</span>
            {editing ? (
              <input
                value={value}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              />
            ) : <strong>{value || "-"}</strong>}
          </label>
        ))}
        <div className="admin-form-wide admin-profile-links">
          <span>{t("admin.profileLinks")}</span>
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
  const { t } = useTranslation();
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
  const hasStoredValue = (value: string) => Boolean(value && value !== "—" && value !== "-");
  return (
    <section className="admin-panel">
      <header className="admin-panel-heading">
        <div><h2>{t("profile.payoutAccount")}</h2><p>{t("admin.payoutReadOnly")}</p></div>
        <button type="button" className="admin-secondary-button" onClick={onCorrection}><AlertCircle size={15} /> {t("admin.returnField")}</button>
      </header>
      <aside className="admin-security-notice">
        <LockKeyhole size={17} />
        <div><strong>{t("admin.maskedByDefault")}</strong><span>{t("admin.revealRequiresReason")}</span></div>
      </aside>
      <dl className="admin-payout-grid">
        <div><dt>{t("contracts.paymentChannel")}</dt><dd>{payout.provider}</dd></div>
        <div><dt>{t("admin.accountState")}</dt><dd><AdminBadge label={payout.status === "VALIDATED" ? "校验通过" : "待完善"} tone={payout.status === "VALIDATED" ? "success" : "warning"} /></dd></div>
        <div><dt>{t("admin.accountHolder")}</dt><dd>{payout.accountHolder || "-"}</dd></div>
        <div><dt>{t("admin.bank")}</dt><dd>{payout.bankName || "-"}</dd></div>
        <div><dt>{t("admin.countryCurrency")}</dt><dd>{displayCopy(payout.bankCountry, t)} · {payout.currency}</dd></div>
        <div><dt>{t("admin.beneficiaryType")}</dt><dd>{t(payout.beneficiaryType === "PERSONAL" ? "admin.personal" : "admin.company")}</dd></div>
        {sensitive.map((field) => (
          <div key={field.key}>
            <dt>{displayCopy(field.label, t)}</dt>
            <dd className="admin-sensitive-value">
              <span>{Object.hasOwn(revealed, field.key)
                ? (revealed[field.key] || t("admin.unfilled"))
                : (hasStoredValue(field.value) ? maskSensitiveValue(field.value) : t("admin.unfilled"))}</span>
              {hasStoredValue(field.value) && !Object.hasOwn(revealed, field.key) ? (
                <button type="button" onClick={() => onReveal(field.key)}><Eye size={14} /> {t("admin.viewFullValue")}</button>
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
  const { t } = useTranslation();
  const data: Array<Contract | Invoice | RequestProject> = detail[type];
  const title = type === "contracts" ? t("menu.contracts") : type === "invoices" ? "Invoice" : t("admin.requestProjects");
  const contractTypeLabel: Record<ContractType, string> = {
    INDEPENDENT: t("admin.contractTypeIndependent"),
    FRAMEWORK: t("admin.contractTypeFramework"),
    IO: t("admin.contractTypeIo"),
  };
  const pagination = useAdminPagination(
    data,
    `${detail.account.id}|${type}`,
  );
  return (
    <section className="admin-panel admin-table-panel">
      <header className="admin-panel-heading">
        <div><h2>{title}</h2><p>{t("admin.businessReadOnlyDescription")}</p></div>
        <AdminBadge label={t("admin.readOnlyData")} tone="info" />
      </header>
      {!data.length ? (
        <div className="admin-empty">{t("admin.noRelatedBusiness", { type: title })}</div>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{t("admin.recordNumber")}</th>
                {type === "contracts" ? (
                  <th>{t("admin.contractType")}</th>
                ) : type === "requests" ? (
                  <>
                    <th>{t("admin.project")}</th>
                    <th>{t("admin.brand")}</th>
                  </>
                ) : null}
                <th>{t("admin.amountColumn")}</th>
                <th>{t("admin.statusColumn")}</th>
                <th>{t("admin.actionsColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {type === "contracts"
                ? (pagination.items as Contract[]).map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.id}</strong></td>
                      <td>{contractTypeLabel[item.contractType]}</td>
                      <td>{item.amount}</td>
                      <td><AdminBadge label={contractStatusLabel[item.status]} tone={adminContractStatusTone[item.status]} /></td>
                      <td>
                        <div className="admin-inline-actions">
                          <Link className="admin-icon-link" to={`/admin/contracts/${detail.account.id}/${item.id}`}><Eye size={15} /><span>{t("admin.viewSummary")}</span></Link><span>{t("admin.originalNotAvailable")}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                : type === "invoices"
                  ? (pagination.items as Invoice[]).map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.id}</strong></td>
                        <td>{item.amount}</td>
                        <td><AdminBadge label={displayCopy(item.status, t)} tone={item.status === "PAID" ? "success" : item.status === "PAYMENT_FAILED" ? "danger" : "info"} /></td>
                        <td>
                          <div className="admin-inline-actions">
                            <Link className="admin-icon-link" to={`/admin/invoices/${detail.account.id}/${item.id}`}><Eye size={15} /><span>{t("admin.viewSummary")}</span></Link><span>{t("admin.originalNotAvailable")}</span>
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
                        <td><AdminBadge label={displayCopy(item.invoiceStatus, t)} tone={item.status === "PAID" ? "success" : item.status === "PAYMENT_FAILED" ? "danger" : "info"} /></td>
                        <td><span className="admin-table-secondary">{t("admin.externalSync")}</span></td>
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
                      ? contractStatusLabel[detail.contracts.find((entry) => entry.id === item.id)?.status || "PENDING_SIGNATURE"]
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
                {type === "contracts" ? (
                  <div><dt>{t("admin.contractType")}</dt><dd>{contractTypeLabel[(item as Contract).contractType]}</dd></div>
                ) : type === "requests" ? (
                  <>
                    <div><dt>{t("admin.project")}</dt><dd>{item.projectName}</dd></div>
                    <div><dt>{t("admin.brand")}</dt><dd>{item.brand}</dd></div>
                  </>
                ) : null}
                <div><dt>{t("admin.amountColumn")}</dt><dd>{item.amount}</dd></div>
              </dl>
              {type === "contracts" ? (
                <div className="admin-business-mobile-actions">
                  <Link to={`/admin/contracts/${detail.account.id}/${item.id}`}><Eye size={14} /> {t("admin.viewContractSummary")}</Link><span>{t("admin.originalNotAvailable")}</span>
                </div>
              ) : type === "invoices" ? (
                <div className="admin-business-mobile-actions">
                  <Link to={`/admin/invoices/${detail.account.id}/${item.id}`}><Eye size={14} /> {t("admin.viewInvoiceSummary")}</Link><span>{t("admin.originalNotAvailable")}</span>
                </div>
              ) : (
                <span className="admin-table-secondary">{t("admin.externalSyncReadOnly")}</span>
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
  const { t } = useTranslation();
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
        <header className="admin-panel-heading"><div><h2>{t("admin.loginHistory")}</h2><p>{t("admin.recentAccess")}</p></div><History size={18} /></header>
        <div className="admin-activity-list">
          {loginPagination.items.map((record) => (
            <article key={record.id}>
              <span className="admin-activity-icon"><CircleUserRound size={15} /></span>
              <div><strong>{record.device}</strong><small>{record.location} · {record.occurredAt}</small></div>
              <AdminBadge label={t(record.result === "SUCCESS" ? "admin.loginSuccess" : "admin.loginFailure")} tone={record.result === "SUCCESS" ? "success" : "danger"} />
            </article>
          ))}
          {!detail.loginHistory.length ? <div className="admin-empty">{t("admin.noLoginHistory")}</div> : null}
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
        <header className="admin-panel-heading"><div><h2>{t("admin.notificationHistory")}</h2><p>{t("admin.notificationHistoryDescription")}</p></div><Bell size={18} /></header>
        <div className="admin-activity-list">
          {notificationPagination.items.map((item) => (
            <article key={item.id}>
              <span className="admin-activity-icon"><Mail size={15} /></span>
              <div><strong>{displayCopy(item.title, t)}</strong><small>{item.createdAt} · {t(item.emailStatus === "DELIVERED" ? "admin.emailDelivered" : "admin.emailQueued")}</small></div>
            </article>
          ))}
          {!detail.notifications.length ? <div className="admin-empty">{t("admin.noNotificationHistory")}</div> : null}
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
        <header className="admin-panel-heading"><div><h2>{t("admin.activityRecords")}</h2><p>{t("admin.activityDescription")}</p></div><Activity size={18} /></header>
        <div className="admin-audit-compact">
          {auditPagination.items.map((event) => (
            <article key={event.id}>
              <span>{event.occurredAt}</span>
              <strong>{displayCopy(event.summary, t)}</strong>
              <small>{event.actorName} · {t(event.module === "CONTRACT" ? "menu.contracts" : event.module === "INVOICE" ? "menu.invoices" : event.module === "PAYMENT" ? "admin.paymentModule" : event.module === "PROFILE" ? "admin.profileModule" : "admin.moduleUser")}</small>
              <AdminBadge label={auditActionLabel[event.action]} />
            </article>
          ))}
          {!audits.length ? <div className="admin-empty">{t("admin.noActivityHistory")}</div> : null}
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
  const { t } = useTranslation();
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
      title={t("admin.returnSelectedField")}
      description={t("admin.correctionNotice")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="admin-ghost-button" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="admin-primary-button" onClick={save}><Mail size={15} /> {t("admin.sendCorrection")}</button>
        </>
      }
    >
      {error ? <div className="admin-inline-alert">{displayCopy(error, t)}</div> : null}
      <div className="admin-form-field">
        <span>{t("admin.fieldToCorrect")}</span>
        <AdminSelectControl value={fieldKey} onChange={setFieldKey} label={t("admin.fieldToCorrect")} icon={<FileText size={15} />}>
          {fields.map(([key, label]) => <option key={key} value={key}>{displayCopy(label, t)}</option>)}
        </AdminSelectControl>
      </div>
      <div className="admin-form-field">
        <span>{t("admin.correctionReasonRequired")}</span>
        <AdminSelectControl
          value={template}
          onChange={(value) => {
            setTemplate(value);
            if (value) setReason(value);
          }}
          label={t("admin.chooseReasonTemplate")}
          icon={<AlertCircle size={15} />}
        >
          <option value="">{t("admin.reasonTemplate")}</option>
          {templates.map((item) => <option key={item} value={item}>{displayCopy(item, t)}</option>)}
        </AdminSelectControl>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("admin.correctionReasonHint")} />
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
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reveal = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
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
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AdminModal
      title={t("admin.revealSensitive")}
      description={t("admin.revealNotice")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="admin-ghost-button" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="admin-primary-button" onClick={reveal} disabled={submitting}><Eye size={15} /> {t(submitting ? "admin.revealing" : "admin.viewFullValue")}</button>
        </>
      }
    >
      {error ? <div className="admin-inline-alert" role="alert">{displayCopy(error, t)}</div> : null}
      <label className="admin-form-field">
        <span>{t("admin.revealReasonRequired")}</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("admin.revealReasonHint")} />
      </label>
    </AdminModal>
  );
}

export function AdminAuditPage() {
  const { t } = useTranslation();
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

  return (
    <div className="admin-page-stack">
      <PageHeader
        title="操作日志"
        description={t("admin.auditDescription")}
      />
      <section className="admin-filter-panel admin-audit-filters">
        <AdminSearchControl value={query} onChange={setQuery} placeholder="搜索操作者、用户、摘要或原因" />
        <AdminSelectControl value={action} onChange={(value) => setAction(value as AuditEvent["action"] | "ALL")} label="筛选操作类型" icon={<Activity size={15} />}>
          <option value="ALL">{t("admin.allActions")}</option>
          {Object.entries(auditActionLabel).map(([value, label]) => <option key={value} value={value}>{displayCopy(label, t)}</option>)}
        </AdminSelectControl>
        <AdminSelectControl value={actorId} onChange={setActorId} label="筛选操作者" icon={<CircleUserRound size={15} />}>
          <option value="ALL">{t("admin.allActors")}</option>
          {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </AdminSelectControl>
        <AdminSelectControl value={subjectUserId} onChange={setSubjectUserId} label="筛选用户对象" icon={<Users size={15} />}>
          <option value="ALL">{t("admin.allSubjects")}</option>
          {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </AdminSelectControl>
        <AdminSelectControl value={module} onChange={(value) => setModule(value as AuditEvent["module"] | "ALL")} label="筛选操作模块" icon={<FolderKanban size={15} />}>
          <option value="ALL">{t("admin.allModules")}</option>
          <option value="AUTH">{t("admin.moduleAuth")}</option>
          <option value="USER">{t("admin.moduleUser")}</option>
          <option value="PROFILE">{t("admin.moduleProfile")}</option>
          <option value="SECURITY">{t("admin.moduleSecurity")}</option>
          <option value="SETTINGS">{t("admin.moduleSettings")}</option>
          <option value="SYNC">{t("admin.moduleSync")}</option>
        </AdminSelectControl>
        <AdminDateControl value={dateFrom} onChange={setDateFrom} label="开始日期" />
        <AdminDateControl value={dateTo} onChange={setDateTo} label="结束日期" />
      </section>
      <section className="admin-panel admin-table-panel">
        <header className="admin-panel-heading"><div><h2>{t("admin.activityRecords")}</h2><p>{t("admin.recordCount", { count: filtered.length })}</p></div><History size={18} /></header>
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead><tr><th>{t("admin.time")}</th><th>{t("admin.actor")}</th><th>{t("admin.subject")}</th><th>{t("admin.action")}</th><th>{t("admin.summary")}</th><th>{t("admin.reason")}</th></tr></thead>
            <tbody>
              {auditPagination.items.map((event) => (
                <tr key={event.id}>
                  <td><span className="admin-table-secondary">{event.occurredAt}</span></td>
                  <td><strong>{event.actorName}</strong><small className="admin-table-block">{event.actorId}</small></td>
                  <td>{event.subjectName || "-"}</td>
                  <td><AdminBadge label={auditActionLabel[event.action]} /></td>
                  <td>{displayCopy(event.summary, t)}</td>
                  <td><span className="admin-table-secondary">{event.reason || "-"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-audit-mobile-list">
          {auditPagination.items.map((event) => (
            <article key={event.id}>
              <header><strong>{displayCopy(event.summary, t)}</strong><AdminBadge label={auditActionLabel[event.action]} /></header>
              <dl>
                <div><dt>{t("admin.time")}</dt><dd>{event.occurredAt}</dd></div>
                <div><dt>{t("admin.actor")}</dt><dd>{event.actorName}</dd></div>
                <div><dt>{t("admin.subjectUser")}</dt><dd>{event.subjectName || "-"}</dd></div>
                <div><dt>{t("admin.reason")}</dt><dd>{event.reason || "-"}</dd></div>
              </dl>
            </article>
          ))}
          {!filtered.length ? <div className="admin-empty">{t("admin.noAuditRecords")}</div> : null}
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
  const { t } = useTranslation();
  const { session } = useAdminSession();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    services.adminSettings.get().then((result) => setSettings(result.data));
  }, []);

  if (!settings) {
    return <div className="admin-page-stack"><div className="admin-loading"><RefreshCcw className="spin" size={20} /> {t("admin.settingsLoading")}</div></div>;
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
        title={t("admin.settingsTitle")}
        description={t("admin.settingsDescription")}
        actions={
          <button type="button" className="admin-primary-button" onClick={save} disabled={saving}>
            {saving ? <RefreshCcw className="spin" size={15} /> : <Check size={15} />} {t("admin.saveSettings")}
          </button>
        }
      />
      <aside className="admin-scope-notice">
        <ShieldCheck size={18} />
        <div><strong>{t("admin.paymentSettingsNotice")}</strong><span>{t("admin.paymentExternalNotice")}</span></div>
      </aside>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>{t("admin.registrationSettings")}</h2><p>{t("admin.registrationSettingsDescription")}</p></div><CircleUserRound size={18} /></header>
        <div className="admin-settings-grid admin-settings-grid-single">
          <label className="admin-setting-toggle">
            <span><strong>{t("admin.allowCreatorRegistration")}</strong><small>{t("admin.creatorRegistrationOnly")}</small></span>
            <input type="checkbox" checked={settings.registrationEnabled} onChange={(event) => setSettings({ ...settings, registrationEnabled: event.target.checked })} />
          </label>
        </div>
      </section>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>{t("admin.passwordRules")}</h2><p>{t("admin.passwordRulesDescription")}</p></div><KeyRound size={18} /></header>
        <div className="admin-settings-grid">
          <label className="admin-form-field"><span>{t("admin.minCharacters")}</span><input type="number" min={6} max={20} value={settings.passwordMinLength} onChange={(event) => setSettings({ ...settings, passwordMinLength: Number(event.target.value) })} /></label>
          <label className="admin-form-field"><span>{t("admin.maxCharacters")}</span><input type="number" min={8} max={64} value={settings.passwordMaxLength} onChange={(event) => setSettings({ ...settings, passwordMaxLength: Number(event.target.value) })} /></label>
          <label className="admin-setting-check"><input type="checkbox" checked={settings.requireUppercase} onChange={(event) => setSettings({ ...settings, requireUppercase: event.target.checked })} /><span>{t("admin.requireUppercase")}</span></label>
          <label className="admin-setting-check"><input type="checkbox" checked={settings.requireLowercase} onChange={(event) => setSettings({ ...settings, requireLowercase: event.target.checked })} /><span>{t("admin.requireLowercase")}</span></label>
          <label className="admin-setting-check"><input type="checkbox" checked={settings.requireNumber} onChange={(event) => setSettings({ ...settings, requireNumber: event.target.checked })} /><span>{t("admin.requireNumber")}</span></label>
        </div>
      </section>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>{t("admin.agreementLinks")}</h2><p>{t("admin.agreementLinksDescription")}</p></div><FileText size={18} /></header>
        <div className="admin-settings-links">
          <label className="admin-form-field"><span>{t("auth.terms")}</span><input value={settings.serviceAgreementUrl} onChange={(event) => setSettings({ ...settings, serviceAgreementUrl: event.target.value })} /></label>
          <label className="admin-form-field"><span>{t("auth.privacy")}</span><input value={settings.privacyPolicyUrl} onChange={(event) => setSettings({ ...settings, privacyPolicyUrl: event.target.value })} /></label>
          <label className="admin-form-field"><span>{t("auth.dataProcessing")}</span><input value={settings.dataProcessingUrl} onChange={(event) => setSettings({ ...settings, dataProcessingUrl: event.target.value })} /></label>
        </div>
      </section>
      <section className="admin-panel">
        <header className="admin-panel-heading"><div><h2>{t("admin.correctionTemplates")}</h2><p>{t("admin.correctionTemplatesDescription")}</p></div><SlidersHorizontal size={18} /></header>
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
