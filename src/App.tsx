import {
  AlertCircle,
  Ban,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CircleDollarSign,
  Clock3,
  Download,
  Eraser,
  Eye,
  EyeOff,
  ExternalLink,
  FileDown,
  FileCheck2,
  FileText,
  FolderKanban,
  Globe2,
  IdCard,
  Info,
  Landmark,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  MoreHorizontal,
  Pencil,
  PenLine,
  Play,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  createContext,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  AdminAuditPage,
  AdminContractsPage,
  AdminInvoicesPage,
  AdminLayout,
  AdminRequestProjectsPage,
  AdminUserDetailPage,
  AdminUsersPage,
} from "./AdminPortal";
import {
  adminStore,
  ADMIN_STORE_KEY,
  PRIMARY_CREATOR_ID,
} from "./admin-store";
import {
  contracts as seedContracts,
  initialProfile,
  invoices as seedInvoices,
  requests as seedRequests,
} from "./data";
import { contractStatusLabel } from "./contract-status";
import {
  isPayoutAccountProcessing,
  isPayoutAccountUsable,
  maskPayoutIdentifier,
  normalizePayoutAccountAlias,
  normalizePayoutProfile,
  PAYOUT_ACCOUNT_ALIAS_MAX_LENGTH,
  payoutAccountsForChannel,
  payoutAccountDestructiveAction,
  payoutAccountStatusLabel,
  payoutAccountStatusTone,
  payoutAccountSummary,
  syncPayoutAccounts,
  validatePayoutAccountAlias,
} from "./payout-accounts";
import {
  AirwallexBeneficiaryValidationError,
  buildProfileSupplementalFields,
  compareInvoicePaymentDetails,
  getSocialAccountName,
  isValidEmailAddress,
  normalizeAirwallexSchemaValue,
  reconcileAirwallexSchemaValues,
  sanitizeEnglishAccountName,
  services,
  sortInvoices,
  payoutAccountPaymentDetails,
  validateAirwallexSchemaValues,
} from "./services";
import type {
  AdminUserDetail,
  AirwallexFormSchema,
  AirwallexSchemaCondition,
  Contract,
  CorrectionRequest,
  FileRef,
  Invoice,
  InvoiceSignature,
  InvoiceStatus,
  InvoiceUploadInput,
  PayoutAccount,
  RequestProject,
  Session,
  UserProfile,
} from "./types";

const INVOICE_STATUS: Record<
  InvoiceStatus,
  { label: string; tone: string; description: string }
> = {
  PENDING_CONFIRMATION: { label: "待确认", tone: "amber", description: "请核对识别结果与付款账户" },
  DRAFT_SIGNATURE: { label: "待确认", tone: "amber", description: "请核对内容并完成确认" },
  PENDING_REVIEW: { label: "待审核", tone: "blue", description: "资料已提交，等待审核" },
  CHANGES_REQUIRED: { label: "待修改", tone: "danger", description: "审核未通过，请按原因修改" },
  PAYMENT_FAILED: { label: "付款异常", tone: "danger", description: "付款处理中断，请修正收款信息" },
  APPROVED: { label: "待付款", tone: "purple", description: "审核完成，等待付款" },
  PAID: { label: "已付款", tone: "success", description: "款项已完成支付" },
};

const REQUEST_STATUS_FROM_INVOICE: Record<
  InvoiceStatus,
  { label: string; tone: string; description: string }
> = {
  PENDING_CONFIRMATION: { label: "待确认", tone: "amber", description: "等待确认 Invoice 识别结果" },
  DRAFT_SIGNATURE: { label: "待确认", tone: "amber", description: "等待你确认关联 Invoice" },
  PENDING_REVIEW: { label: "审核中", tone: "blue", description: "Invoice 已提交，正在审核" },
  CHANGES_REQUIRED: { label: "待修改", tone: "danger", description: "审核退回，等待修改 Invoice" },
  PAYMENT_FAILED: { label: "付款异常", tone: "danger", description: "付款处理中断，需要修正收款信息" },
  APPROVED: { label: "待付款", tone: "purple", description: "Invoice 已通过审核，等待付款" },
  PAID: { label: "已完成", tone: "success", description: "关联 Invoice 已完成付款" },
};

const PAYMENT_DETAIL_LABELS: Record<string, string> = {
  account_name: "Account name",
  account_number: "Account number",
  bank_name: "Bank name",
  bank_address: "Bank address",
  swift_code: "SWIFT code",
  iban: "IBAN",
};

export const shouldShowInvoicePreSigningControls = (status: InvoiceStatus) =>
  status === "DRAFT_SIGNATURE";

const normalizeInvoiceSearch = (value: string) =>
  value.toLocaleLowerCase().replace(/[\s,_./-]+/g, "");

const normalizeInvoiceIdentity = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const filterInvoiceList = (
  invoices: Invoice[],
  query: string,
  status: InvoiceStatus | "ALL",
  channel = "ALL",
) => {
  const statusFiltered = invoices.filter(
    (invoice) =>
      (status === "ALL" ||
        invoice.status === status ||
        (status === "PENDING_CONFIRMATION" && invoice.status === "DRAFT_SIGNATURE")) &&
      (channel === "ALL" || invoice.channel === channel),
  );
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return statusFiltered;

  return statusFiltered.filter((invoice) => {
    const searchable = normalizeInvoiceSearch(
      [invoice.id, invoice.projectName].join(" "),
    );
    return terms.every((term) =>
      searchable.includes(normalizeInvoiceSearch(term)),
    );
  });
};

const CONTRACT_STATUS: Record<
  Contract["status"],
  { tone: string; description: string }
> = {
  未请款: { tone: "purple", description: "尚未创建关联 Invoice，当前未进入请款流程" },
  请款中: { tone: "blue", description: "合同已进入请款流程，等待审核或款项支付" },
  已付款: { tone: "success", description: "合同款项已完成支付" },
};

export const deriveContractStatus = (invoiceStatus: InvoiceStatus): Contract["status"] => {
  if (invoiceStatus === "PAID") return "已付款";
  return "请款中";
};

export const syncContractWithInvoices = (
  contract: Contract,
  invoices: Invoice[],
): Contract => {
  const invoice = invoices.find((item) => (
    item.projectId === contract.projectId
    && item.projectName === contract.projectName
    && item.brand === contract.brand
  ));
  return invoice ? { ...contract, status: deriveContractStatus(invoice.status) } : contract;
};

export const syncRequestWithInvoices = (
  request: RequestProject,
  invoices: Invoice[],
): RequestProject => {
  const linked = invoices.filter((invoice) => request.invoiceIds.includes(invoice.id));
  const invoice = sortInvoices(linked)[0];
  if (!invoice) return request;
  return {
    ...request,
    amount: invoice.amount,
    status: invoice.status,
    contractStatus: deriveContractStatus(invoice.status),
    invoiceStatus: INVOICE_STATUS[invoice.status].label,
    updatedAt: invoice.updatedAt,
    issues: invoice.status === "PAYMENT_FAILED" ? request.issues : [],
    progress: buildInvoiceDrivenRequestProgress(invoice),
  };
};

interface AppState {
  session: Session | null;
  profile: UserProfile;
  invoices: Invoice[];
  login(email: string, password: string): Promise<Session>;
  register(name: string, email: string, password: string): Promise<void>;
  completeOnboarding(profile: UserProfile): Promise<void>;
  saveProfile(profile: UserProfile): Promise<void>;
  uploadInvoice(input: InvoiceUploadInput): Promise<Invoice>;
  selectInvoicePayoutAccount(id: string, payoutAccountId: string): Promise<void>;
  updateInvoice(id: string, status: InvoiceStatus): Promise<void>;
  resolveInvoicePaymentIssue(id: string, correctedValue: string): Promise<void>;
  signInvoice(id: string, signature: InvoiceSignature): Promise<void>;
  logout(): void;
}

const AppContext = createContext<AppState | null>(null);

const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppContext is missing");
  return context;
};

const readSession = (): Session | null => {
  try {
    const value = window.localStorage.getItem("comets-creator-session");
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<Session>;
    if (!parsed.userId || !parsed.email) return null;
    const restored = parsed.sessionId
      ? adminStore.restoreSession(parsed.sessionId)
      : undefined;
    if (restored) return restored;
    const migrated = adminStore.migrateLegacyCreatorSession(
      parsed.userId,
      parsed.email,
    );
    if (migrated) {
      window.localStorage.setItem(
        "comets-creator-session",
        JSON.stringify(migrated),
      );
      return migrated;
    }
    window.localStorage.removeItem("comets-creator-session");
    return null;
  } catch {
    return null;
  }
};

function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession);
  const [profile, setProfile] = useState<UserProfile>(() =>
    session?.role === "CREATOR"
      ? adminStore.getProfile(session.userId) || initialProfile
      : initialProfile,
  );
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    session?.role === "CREATOR" && session.userId === PRIMARY_CREATOR_ID
      ? sortInvoices(seedInvoices)
      : [],
  );

  useEffect(() => {
    if (session?.role === "CREATOR") {
      services.invoices
        .list(session.userId)
        .then((result) => setInvoices(result.data));
    } else {
      setInvoices([]);
    }
    if (session?.role === "CREATOR") {
      services.profile
        .get(session.userId)
        .then((result) => setProfile(result.data));
    }
  }, [session?.userId, session?.role]);

  const persistSession = (next: Session | null) => {
    setSession(next);
    if (next) {
      window.localStorage.setItem("comets-creator-session", JSON.stringify(next));
    } else {
      window.localStorage.removeItem("comets-creator-session");
    }
  };

  useEffect(() => {
    if (!session) return;
    const revalidateSession = (event: StorageEvent) => {
      if (event.key !== ADMIN_STORE_KEY) return;
      const restored = adminStore.restoreSession(session.sessionId);
      if (!restored) {
        persistSession(null);
        return;
      }
      if (JSON.stringify(restored) !== JSON.stringify(session)) {
        persistSession(restored);
      }
    };
    window.addEventListener("storage", revalidateSession);
    return () => window.removeEventListener("storage", revalidateSession);
  }, [session]);

  const value: AppState = {
    session,
    profile,
    invoices,
    login: async (email, password) => {
      const result = await services.auth.login(email, password);
      if (result.data.role === "CREATOR") {
        const profileResult = await services.profile.get(result.data.userId);
        setProfile(profileResult.data);
      }
      persistSession(result.data);
      return result.data;
    },
    register: async (name, email, password) => {
      const result = await services.auth.register(name, email, password);
      persistSession(result.data);
      setProfile((current) => ({
        ...current,
        id: result.data.userId,
        displayName: name,
        legalName: name,
        email,
        social: {
          ...current.social,
          verificationStatus: "PENDING",
        },
      }));
    },
    completeOnboarding: async (nextProfile) => {
      setProfile(nextProfile);
      if (session) {
        const result = await services.auth.completeOnboarding(
          session.userId,
          nextProfile,
          session.sessionId,
        );
        persistSession(result.data);
      }
    },
    saveProfile: async (nextProfile) => {
      const result = await services.profile.save(nextProfile);
      setProfile(result.data);
    },
    uploadInvoice: async (input) => {
      const result = await services.invoices.upload(input);
      setInvoices((items) => sortInvoices([result.data, ...items]));
      return result.data;
    },
    selectInvoicePayoutAccount: async (id, payoutAccountId) => {
      const result = await services.invoices.selectPayoutAccount(id, payoutAccountId);
      setInvoices((items) =>
        sortInvoices(items.map((item) => (item.id === id ? result.data : item))),
      );
    },
    updateInvoice: async (id, status) => {
      const result = await services.invoices.transition(id, status);
      setInvoices((items) =>
        sortInvoices(items.map((item) => (item.id === id ? result.data : item))),
      );
    },
    resolveInvoicePaymentIssue: async (id, correctedValue) => {
      const result = await services.invoices.resolvePaymentIssue(id, correctedValue);
      setInvoices((items) =>
        sortInvoices(items.map((item) => (item.id === id ? result.data : item))),
      );
    },
    signInvoice: async (id, signature) => {
      if (
        session?.role !== "CREATOR" ||
        !session.permissions.includes("INVOICE_SIGN")
      ) {
        throw new Error("当前账号没有 Invoice 签署权限");
      }
      if (session.verificationStatus !== "VERIFIED") {
        throw new Error("完成社媒认证后才能签署 Invoice");
      }
      const result = await services.invoices.sign(id, signature);
      setInvoices((items) =>
        sortInvoices(items.map((item) => (item.id === id ? result.data : item))),
      );
    },
    logout: () => {
      if (session) void services.auth.logout(session.sessionId);
      persistSession(null);
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <img src="/comets-mark.svg" alt="" />
      <span>
        <strong>COMETS</strong>
        <small>Creator Pay</small>
      </span>
    </span>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`status-badge tone-${tone}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <FileText size={26} />
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="loading-rows" aria-label="正在加载">
      <span />
      <span />
      <span />
    </div>
  );
}

function CreatorRoute() {
  const { session } = useApp();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.role === "ADMIN") {
    return (
      <Navigate
        to="/admin"
        replace
        state={{ accessDenied: "当前管理员账号无权进入创作者工作台。" }}
      />
    );
  }
  if (!session.onboardingComplete && !location.pathname.startsWith("/onboarding")) {
    return <Navigate to="/onboarding/social-verification" replace />;
  }
  return <Outlet />;
}

function AdminRoute() {
  const { session } = useApp();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.role !== "ADMIN") {
    return (
      <Navigate
        to="/"
        replace
        state={{ accessDenied: "当前创作者账号无权进入系统管理员工作台。" }}
      />
    );
  }
  return <Outlet />;
}

function PublicOnlyRoute() {
  const { session } = useApp();
  if (session?.role === "ADMIN") return <Navigate to="/admin" replace />;
  if (session?.onboardingComplete) return <Navigate to="/" replace />;
  return <Outlet />;
}

function AdminLayoutBridge() {
  const { session, logout } = useApp();
  if (!session) return null;
  return <AdminLayout session={session} logout={logout} />;
}

function AuthShell({ children, step }: { children: ReactNode; step?: number }) {
  return (
    <main className="auth-layout">
      <section className="auth-brand-panel">
        <Brand />
        <div className="auth-brand-copy">
          <span className="eyebrow">COMETS PAYMENT PORTAL</span>
          <h1>让每一次合作结算，都清晰可追踪。</h1>
          <p>集中查看请款、合同与 Invoice，减少反复沟通和资料遗漏。</p>
        </div>
        <div className="auth-benefits">
          <span><ShieldCheck size={17} /> 资料安全校验</span>
          <span><Clock3 size={17} /> 审批进度可见</span>
          <span><WalletCards size={17} /> 跨境付款追踪</span>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-mobile-brand"><Brand compact /></div>
        {step ? (
          <div className="auth-progress" aria-label={`注册进度，第 ${step} 步，共 3 步`}>
            {[1, 2, 3].map((item) => (
              <span key={item} className={item <= step ? "active" : ""}>
                {item < step ? <Check size={13} /> : item}
              </span>
            ))}
          </div>
        ) : null}
        {children}
      </section>
    </main>
  );
}

function LoginPage() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("lea.martin@creator.example");
  const [password, setPassword] = useState("creator2026");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.includes("@") || password.length < 6) {
      setError("请输入有效邮箱和至少 6 位密码");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const session = await login(email, password);
      navigate(session.role === "ADMIN" ? "/admin" : "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <header>
          <span className="eyebrow">欢迎回来</span>
          <h2>账号登录</h2>
          <p>登录后继续处理你的合作款项与资料。</p>
        </header>
        {error ? <div className="form-alert danger">{error}</div> : null}
        <label>
          <span>邮箱地址 / Email address</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="请输入邮箱"
          />
        </label>
        <label>
          <span>密码 / Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
          />
        </label>
        <div className="form-meta">
          <label className="checkbox-label">
            <input type="checkbox" defaultChecked />
            <span>保持登录</span>
          </label>
          <button type="button" className="text-button">忘记密码？</button>
        </div>
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? <RefreshCcw className="spin" size={17} /> : null}
          {submitting ? "正在登录" : "登录"}
        </button>
        <p className="auth-switch">还没有账号？ <Link to="/register">立即注册</Link></p>
      </form>
    </AuthShell>
  );
}

export type RegistrationValues = {
  email: string;
  password: string;
  invitationCode?: string;
};

export function validateRegistration(
  values: RegistrationValues,
  agreed: boolean,
): string {
  if (!isValidEmailAddress(values.email)) {
    return "请输入有效的邮箱地址";
  }
  if (values.password.length < 8 || values.password.length > 20) {
    return "密码需为 8–20 位字符";
  }
  if (/\s/u.test(values.password)) {
    return "密码不能包含空格";
  }
  if (
    !/\p{Lu}/u.test(values.password) ||
    !/\p{Ll}/u.test(values.password) ||
    !/\p{N}/u.test(values.password)
  ) {
    return "密码须同时包含大写字母、小写字母和数字";
  }
  if (!agreed) {
    return "请阅读并同意服务协议、隐私政策与数据处理协议";
  }
  return "";
}

function RegisterPage() {
  const { register } = useApp();
  const navigate = useNavigate();
  const [values, setValues] = useState({
    email: "",
    password: "",
    invitationCode: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateRegistration(values, agreed);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const provisionalName =
        values.email.split("@")[0].replace(/[._-]+/g, " ").trim() || "Creator";
      await register(provisionalName, values.email, values.password);
      navigate("/onboarding/social-verification");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账号创建失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const registerWithGoogle = async () => {
    setError("");
    setSubmitting(true);
    try {
      await register("Google Creator", "creator.google@example.com", "google-oauth");
      navigate("/onboarding/social-verification");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google 注册失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="register-page">
      <section className="register-form-pane">
        <header className="register-brand-row">
          <Brand />
          <p>已有账号？ <Link to="/login">登录</Link></p>
        </header>

        <form className="register-form" onSubmit={submit} noValidate>
          <header>
            <img className="register-comets-mark" src="/comets-mark.svg" alt="" />
            <span className="eyebrow">CREATOR ACCOUNT</span>
            <h1>创建你的账号</h1>
            <p>注册 COMETS Pay，开始管理合作款项与付款进度。</p>
          </header>

          {error ? <div className="form-alert danger" role="alert">{error}</div> : null}

          <label>
            <span>邮箱地址 / Email address <b>*</b></span>
            <input
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={(event) => setValues({ ...values, email: event.target.value })}
              placeholder="name@example.com"
            />
            <small>请使用接收品牌合作邀请的邮箱注册。</small>
          </label>

          <label>
            <span>密码 / Password <b>*</b></span>
            <span className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                maxLength={20}
                value={values.password}
                onChange={(event) => setValues({ ...values, password: event.target.value })}
                placeholder="8–20 位复合密码"
                aria-describedby="register-password-requirements"
              />
              <button
                type="button"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                title={showPassword ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
            <small id="register-password-requirements">
              必须同时包含大写字母、小写字母和数字，不可包含空格。
            </small>
          </label>

          <label>
            <span>邀请码 / Invitation code</span>
            <input
              value={values.invitationCode}
              onChange={(event) => setValues({ ...values, invitationCode: event.target.value })}
              placeholder="输入品牌或经纪人提供的邀请码"
            />
          </label>

          <label className="register-agreement">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              我已阅读并同意 <a href="#terms">服务协议</a>、<a href="#privacy">隐私政策</a>
              与 <a href="#data">数据处理协议</a>
            </span>
          </label>

          <button className="register-primary" type="submit" disabled={submitting}>
            {submitting ? <RefreshCcw className="spin" size={17} /> : null}
            {submitting ? "正在创建账号" : "开始注册"}
          </button>

          <div className="register-divider"><span>或</span></div>

          <button
            className="register-google"
            type="button"
            disabled={submitting}
            onClick={registerWithGoogle}
          >
            <Globe2 size={17} />
            使用 Google 账号注册
          </button>

          <p className="register-login-link">已经有账号？ <Link to="/login">立即登录</Link></p>
        </form>
      </section>

      <aside className="register-story" aria-label="创作者故事">
        <img src="/creator-registration-story.png" alt="创作者在工作室录制视频" />
        <div className="register-story-copy">
          <span className="eyebrow">真实创作者 · 真实合作</span>
          <h2>让创作价值，按时抵达。</h2>
          <blockquote>
            “从合同确认到款项到账，我随时都知道进度。少了反复追问，我可以把时间留给真正重要的创作。”
          </blockquote>
          <footer>
            <div>
              <strong>林悦 · Lifestyle Creator</strong>
              <span>已完成 28 次品牌合作</span>
            </div>
            <span className="register-story-play" aria-hidden="true">
              <Play size={16} fill="currentColor" />
            </span>
          </footer>
        </div>
      </aside>
    </main>
  );
}

export function validateSocialVerification(
  profileUrls: string[],
  files: FileRef[],
): string {
  if (!profileUrls.length || profileUrls.some((url) => !url.trim())) {
    return "请填写完整的主页链接";
  }
  if (
    profileUrls.some((url) => {
      try {
        const parsed = new URL(url);
        return !["http:", "https:"].includes(parsed.protocol);
      } catch {
        return true;
      }
    })
  ) {
    return "请输入以 http:// 或 https:// 开头的有效主页链接";
  }
  if (!files.length) {
    return "请至少上传一张社媒账号后台截图";
  }
  return "";
}

function SocialVerificationPage() {
  const { profile } = useApp();
  const navigate = useNavigate();
  const [profileUrls, setProfileUrls] = useState<string[]>(
    profile.social.profileUrls?.length
      ? profile.social.profileUrls
      : [profile.social.profileUrl || ""],
  );
  const [files, setFiles] = useState<FileRef[]>(
    profile.social.screenshots?.length
      ? profile.social.screenshots
      : profile.social.screenshot
        ? [profile.social.screenshot]
        : [],
  );
  const [error, setError] = useState("");
  const [verification, setVerification] = useState<
    "idle" | "verifying" | "verified"
  >("idle");

  const chooseFiles = (selected: FileList | null) => {
    if (!selected?.length) return;
    const incoming = Array.from(selected);
    if (
      incoming.some(
        (file) =>
          !["image/png", "image/jpeg"].includes(file.type) ||
          file.size > 8_000_000,
      )
    ) {
      setError("请上传 8MB 以内的 PNG 或 JPG 截图");
      return;
    }
    if (files.length + incoming.length > 6) {
      setError("后台截图最多上传 6 张");
      return;
    }
    setError("");
    setVerification("idle");
    setFiles((current) => [
      ...current,
      ...incoming.map((file, index) => ({
        id: `FILE-${Date.now()}-${index}`,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateSocialVerification(
      profileUrls,
      files,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    if (verification !== "verified") {
      setError("请先完成账号归属验证");
      return;
    }
    const normalizedUrls = profileUrls.map((url) => url.trim());
    const primaryHost = new URL(normalizedUrls[0]).hostname.replace(/^www\./, "");
    window.sessionStorage.setItem(
      "comets-social-draft",
      JSON.stringify({
        platform: "多平台",
        handle: `${primaryHost} 等 ${normalizedUrls.length} 个主页`,
        profileUrl: normalizedUrls[0],
        profileUrls: normalizedUrls,
        screenshot: files[0],
        screenshots: files,
        verificationStatus: "VERIFIED",
      }),
    );
    navigate("/onboarding/profile");
  };

  const verifyAccount = async () => {
    const validationError = validateSocialVerification(profileUrls, files);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setVerification("verifying");
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    setVerification("verified");
  };

  return (
    <AuthShell step={2}>
      <form className="auth-form dense" onSubmit={submit}>
        <header>
          <span className="eyebrow">第 2 步</span>
          <h2>认证社媒账号</h2>
          <p>提交账号主页和后台截图，验证账号归属后继续。</p>
        </header>
        {error ? <div className="form-alert danger">{error}</div> : null}
        <fieldset className="social-links-fieldset">
          <legend>主页链接</legend>
          <div className="social-link-list">
            {profileUrls.map((url, index) => (
              <div className="social-link-row" key={`profile-url-${index}`}>
                <input
                  aria-label={`主页链接 ${index + 1}`}
                  value={url}
                  onChange={(event) =>
                    {
                      setVerification("idle");
                      setProfileUrls((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      );
                    }
                  }
                  placeholder="https://"
                />
                {profileUrls.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`删除主页链接 ${index + 1}`}
                    title="删除链接"
                    onClick={() =>
                      {
                        setVerification("idle");
                        setProfileUrls((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        );
                      }
                    }
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            className="add-social-link"
            type="button"
            onClick={() => {
              setVerification("idle");
              setProfileUrls((current) => [...current, ""]);
            }}
          >
            <Plus size={16} /> 添加主页链接
          </button>
        </fieldset>
        <div className="social-upload-stack">
          <label className={`upload-field ${files.length ? "has-file" : ""}`}>
            <input
              type="file"
              accept="image/png,image/jpeg"
              multiple
              onChange={(event) => chooseFiles(event.target.files)}
            />
            {files.length ? <FileCheck2 size={24} /> : <Upload size={24} />}
            <strong>{files.length ? `已上传 ${files.length} 张后台截图` : "上传社媒后台截图"}</strong>
            <span>PNG 或 JPG，单张最大 8MB，最多 6 张</span>
          </label>
          {files.length ? (
            <div className="uploaded-file-list">
              {files.map((file) => (
                <div key={file.id}>
                  <FileCheck2 size={16} />
                  <span><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB</small></span>
                  <button
                    type="button"
                    aria-label={`移除 ${file.name}`}
                    title="移除截图"
                    onClick={() =>
                      {
                        setVerification("idle");
                        setFiles((current) => current.filter((item) => item.id !== file.id));
                      }
                    }
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {verification === "verified" ? (
          <div className="form-alert social-verification-success">
            <CheckCircle2 size={18} />
            <div><strong>账号验证通过</strong><p>主页链接与后台资料匹配，可继续填写付款资料。</p></div>
          </div>
        ) : (
          <button
            className="secondary-button social-verify-button"
            type="button"
            disabled={verification === "verifying"}
            onClick={verifyAccount}
          >
            {verification === "verifying" ? <RefreshCcw className="spin" size={17} /> : <ShieldCheck size={17} />}
            {verification === "verifying" ? "正在验证账号归属" : "验证账号归属"}
          </button>
        )}
        <button className="primary-button" type="submit" disabled={verification !== "verified"}>
          继续填写资料 <ChevronRight size={17} />
        </button>
      </form>
    </AuthShell>
  );
}

const AIRWALLEX_COUNTRIES = [
  { label: "法国 / France", value: "FR" },
  { label: "日本 / Japan", value: "JP" },
  { label: "美国 / United States", value: "US" },
  { label: "英国 / United Kingdom", value: "GB" },
  { label: "澳大利亚 / Australia", value: "AU" },
  { label: "新加坡 / Singapore", value: "SG" },
  { label: "中国香港 / Hong Kong SAR", value: "HK" },
];

const airwallexCountryCode = (country: string) =>
  AIRWALLEX_COUNTRIES.find(
    (item) => item.value === country || item.label === country,
  )?.value ||
  ({
    France: "FR",
    Japan: "JP",
    "United States": "US",
    "United Kingdom": "GB",
    Australia: "AU",
    Singapore: "SG",
    "Hong Kong": "HK",
  }[country] ?? "JP");

function OnboardingProfilePage() {
  const { profile, completeOnboarding } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState(profile);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<"AIRWALLEX" | "PAYPAL" | "PAYERMAX">(
    profile.payout.channel || "AIRWALLEX",
  );
  const [condition, setCondition] = useState<AirwallexSchemaCondition>({
    bankCountryCode: airwallexCountryCode(profile.payout.bankCountry),
    accountCurrency: profile.payout.currency || "USD",
    entityType: profile.payout.beneficiaryType || "PERSONAL",
    transferMethod: profile.payout.transferMethod || "LOCAL",
  });
  const [schema, setSchema] = useState<AirwallexFormSchema | null>(null);
  const [schemaValues, setSchemaValues] = useState<Record<string, string>>(
    profile.payout.schemaValues || {},
  );
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const draft = window.sessionStorage.getItem("comets-social-draft");
    if (draft) {
      const social = JSON.parse(draft) as UserProfile["social"];
      setForm((current) => ({ ...current, social }));
    }
  }, []);

  useEffect(() => {
    let active = true;
    setSchemaLoading(true);
    setError("");
    services.payout.getFormSchema(condition).then((result) => {
      if (!active) return;
      setSchema(result.data);
      setSchemaValues((current) =>
        reconcileAirwallexSchemaValues(result.data, current),
      );
      setSchemaLoading(false);
    });
    return () => {
      active = false;
    };
  }, [
    condition.accountCurrency,
    condition.bankCountryCode,
    condition.entityType,
    condition.transferMethod,
  ]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.legalName.trim() || !form.address.trim() || !form.phone.trim() || !form.email.trim()) {
      setError("请完成所有基本信息");
      return;
    }
    if (!agreed) {
      setError("请阅读并同意服务协议与隐私政策");
      return;
    }
    if (channel !== "AIRWALLEX" || !schema) {
      setError("请选择已开放的收款渠道并等待表单加载");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await services.payout.validateBeneficiary(schema, schemaValues);
      const beneficiary = await services.payout.createBeneficiary(
        condition,
        schemaValues,
      );
      const completedPayout: PayoutAccount = {
        ...form.payout,
        id: form.payout.id || `payout-${form.id.toLowerCase()}-primary`,
        name: `${condition.accountCurrency} Airwallex 主账户`,
        provider: "Airwallex",
        channel,
        accountHolder: schemaValues.account_name || "",
        bankCountry:
          AIRWALLEX_COUNTRIES.find(
            (item) => item.value === condition.bankCountryCode,
          )?.label || condition.bankCountryCode,
        bankName: schemaValues.bank_name || "",
        currency: condition.accountCurrency,
        beneficiaryType: condition.entityType,
        transferMethod: condition.transferMethod,
        accountNumber: schemaValues.account_number || "",
        swiftCode: schemaValues.swift_code || "",
        status: beneficiary.data.status,
        beneficiaryId: beneficiary.data.beneficiaryId,
        linkages: {
          projectCount: 0,
          invoiceCount: 0,
          paymentBatchCount: 0,
          transactionCount: 0,
        },
        hasActivePayment: false,
        schemaValues,
      };
      const completedProfile: UserProfile = {
        ...form,
        payout: completedPayout,
        payoutAccounts: [completedPayout],
        defaultPayoutAccountId: completedPayout.id,
      };
      await services.profile.save(completedProfile);
      await completeOnboarding(completedProfile);
      navigate("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "付款信息校验失败");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell step={3}>
      <form className="auth-form wide dense" onSubmit={submit}>
        <header>
          <span className="eyebrow">第 3 步</span>
          <h2>个人与付款资料</h2>
          <p>完善支付通用信息，并创建已校验的收款账户。</p>
        </header>
        {error ? <div className="form-alert danger">{error}</div> : null}
        <section className="form-section">
          <h3><UserRound size={17} /> 基本信息</h3>
          <div className="form-grid">
            <label><span>真实姓名 / Real Name *</span><input value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} placeholder="与身份证件姓名一致" /></label>
            <label><span>联系电话 / Tel *</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="包含国家区号" /></label>
            <label><span>联系邮箱 / Email *</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="用于接收付款通知" /></label>
            <label className="full"><span>联系地址 / Address *</span><textarea className="basic-address-input" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="国家、州/省、城市、街道及门牌号" /></label>
          </div>
        </section>
        <section className="form-section">
          <h3><Landmark size={17} /> 收款账户 / Payout account</h3>
          <div className="payout-channel-grid" aria-label="选择付款渠道">
            <button
              type="button"
              className={channel === "AIRWALLEX" ? "active" : ""}
              onClick={() => setChannel("AIRWALLEX")}
            >
              <strong>Airwallex</strong>
              <span>已开放 · 动态校验</span>
            </button>
            <button type="button" disabled>
              <strong>PayPal</strong>
              <span>暂未开放</span>
            </button>
            <button type="button" disabled>
              <strong>PayerMax</strong>
              <span>暂未开放</span>
            </button>
          </div>
          {channel === "AIRWALLEX" ? (
            <div className="airwallex-schema-panel">
              <div className="airwallex-schema-heading">
                <div>
                  <strong>Airwallex Form Schema</strong>
                  <span>根据付款场景动态生成并校验必填字段</span>
                </div>
                <StatusBadge label={schemaLoading ? "正在生成" : "Schema 已同步"} tone={schemaLoading ? "amber" : "success"} />
              </div>
              <div className="form-grid airwallex-condition-grid">
                <label>
                  <span>国家 / Country *</span>
                  <select value={condition.bankCountryCode} onChange={(event) => setCondition({ ...condition, bankCountryCode: event.target.value })}>
                    {AIRWALLEX_COUNTRIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>账户币种 / Account currency *</span>
                  <select value={condition.accountCurrency} onChange={(event) => setCondition({ ...condition, accountCurrency: event.target.value })}>
                    {["USD", "EUR", "GBP", "JPY", "AUD", "HKD", "SGD"].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span>收款人类型 / Recipient type *</span>
                  <select value={condition.entityType} onChange={(event) => setCondition({ ...condition, entityType: event.target.value as "PERSONAL" | "COMPANY" })}>
                    <option value="PERSONAL">个人 / Individual</option>
                    <option value="COMPANY">企业 / Company</option>
                  </select>
                </label>
                <label>
                  <span>转账方式 / Transfer method *</span>
                  <select value={condition.transferMethod} onChange={(event) => setCondition({ ...condition, transferMethod: event.target.value as "LOCAL" | "SWIFT" })}>
                    <option value="LOCAL">本地转账 / Local transfer</option>
                    <option value="SWIFT">国际电汇 / SWIFT</option>
                  </select>
                </label>
              </div>
              {schemaLoading ? (
                <LoadingRows />
              ) : schema ? (
                <>
                  <div className="schema-source-note">
                    <RefreshCcw size={15} />
                    已调用 <code>POST /api/v1/beneficiary_form_schemas/generate</code>，返回 {schema.fields.length} 个字段
                  </div>
                  <div className="form-grid schema-field-grid">
                    {schema.fields.map((field) => (
                      <label key={field.key}>
                        <span>{field.label}{field.required ? " *" : ""}</span>
                        {field.type === "SELECT" ? (
                          <select value={schemaValues[field.key] || ""} onChange={(event) => setSchemaValues({ ...schemaValues, [field.key]: event.target.value })}>
                            <option value="">请选择</option>
                            {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        ) : (
                          <input
                            value={schemaValues[field.key] || ""}
                            onChange={(event) =>
                              setSchemaValues({
                                ...schemaValues,
                                [field.key]: normalizeAirwallexSchemaValue(
                                  field.key,
                                  event.target.value,
                                ),
                              })
                            }
                            placeholder={field.placeholder}
                            pattern={field.pattern}
                            title={field.description}
                            autoCapitalize={field.key === "account_name" ? "words" : undefined}
                            spellCheck={field.key === "account_name" ? false : undefined}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
        <label className="checkbox-label agreement">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>我已阅读并同意《服务协议》和《隐私政策》</span>
        </label>
        <button className="primary-button" type="submit" disabled={submitting || schemaLoading}>
          {submitting ? <RefreshCcw className="spin" size={17} /> : <ShieldCheck size={17} />}
          {submitting ? "正在校验并创建 Beneficiary" : "校验付款信息并完成注册"}
        </button>
      </form>
    </AuthShell>
  );
}

const navItems = [
  { to: "/", label: "请款项目", icon: FolderKanban },
  { to: "/contracts", label: "合同", icon: FileText },
  { to: "/invoices", label: "Invoice", icon: ReceiptText },
  { to: "/profile", label: "个人档案", icon: IdCard },
];

const TOPBAR_NOTIFICATION_READ_STORAGE_KEY =
  "comets-creator-notification-read-v1";

const creatorGuideSteps = [
  {
    title: "查看请款项目",
    description: "确认项目金额、关联合同、Invoice 状态和当前审批进度。",
  },
  {
    title: "核对合同内容",
    description: "查看履约要求、请款条款以及合同约定的付款信息。",
  },
  {
    title: "处理 Invoice",
    description: "待签署时核对项目、金额、币种和收款资料，再完成签署。",
  },
  {
    title: "跟踪审批与付款",
    description: "通过通知查看进度；发生付款异常时按提示修正收款资料。",
  },
];

const creatorGuideStatuses = [
  {
    label: "待签署",
    tone: "amber",
    description: "需要打开对应 Invoice 核对并签署。",
  },
  {
    label: "审批中",
    tone: "blue",
    description: "无需重复提交，等待 PM 或财务处理。",
  },
  {
    label: "待补资料 / 付款异常",
    tone: "danger",
    description: "需要按页面提示补充资料或更正付款信息。",
  },
];

const creatorGuideShortcuts = [
  {
    to: "/",
    label: "请款项目",
    description: "查看全部请款进度",
    icon: FolderKanban,
    tone: "request",
  },
  {
    to: "/contracts",
    label: "合同",
    description: "核对履约与请款条款",
    icon: FileText,
    tone: "contract",
  },
  {
    to: "/invoices",
    label: "Invoice",
    description: "签署并跟踪审核付款",
    icon: ReceiptText,
    tone: "invoice",
  },
  {
    to: "/profile",
    label: "个人档案",
    description: "维护认证与收款资料",
    icon: IdCard,
    tone: "profile",
  },
];

type TopbarNotificationTone = "purple" | "amber" | "danger" | "success";

export interface TopbarNotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  to: string;
  tone: TopbarNotificationTone;
}

export function buildTopbarNotifications(
  invoices: Invoice[],
): TopbarNotificationItem[] {
  const paymentFailed = invoices.find(
    (invoice) => invoice.status === "PAYMENT_FAILED",
  );
  const unsigned = invoices.find(
    (invoice) => invoice.status === "DRAFT_SIGNATURE",
  );
  const pendingReview = invoices.find(
    (invoice) => invoice.status === "PENDING_REVIEW",
  );
  const paid = invoices.find((invoice) => invoice.status === "PAID");

  return [
    ...(paymentFailed
      ? [
          {
            id: `payment-failed-${paymentFailed.id}`,
            title: "付款信息待修复",
            description: `${paymentFailed.id} 付款失败，请核对并修改收款信息。`,
            time: "刚刚",
            to: `/invoices/${paymentFailed.id}`,
            tone: "danger" as const,
          },
        ]
      : []),
    ...(unsigned
      ? [
          {
            id: `invoice-sign-${unsigned.id}`,
            title: "Invoice 待签署",
            description: `${unsigned.id} 等待你的签署，签署后将进入审核。`,
            time: "今天 14:30",
            to: `/invoices/${unsigned.id}`,
            tone: "amber" as const,
          },
        ]
      : []),
    ...(pendingReview
      ? [
          {
            id: `invoice-review-${pendingReview.id}`,
            title: "Invoice 已提交审核",
            description: `${pendingReview.id} 已进入审核流程，可查看最新进度。`,
            time: "今天 10:12",
            to: `/invoices/${pendingReview.id}`,
            tone: "purple" as const,
          },
        ]
      : []),
    ...(paid
      ? [
          {
            id: `invoice-paid-${paid.id}`,
            title: "款项已完成",
            description: `${paid.id} 已完成付款，可查看付款参考号。`,
            time: "07-16 14:32",
            to: `/invoices/${paid.id}`,
            tone: "success" as const,
          },
        ]
      : []),
  ];
}

function AppLayout() {
  const { profile, invoices, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const accessDenied = (
    location.state as { accessDenied?: string } | null
  )?.accessDenied;
  const [open, setOpen] = useState(false);
  const [activeTopbarMenu, setActiveTopbarMenu] = useState<
    "help" | "notifications" | null
  >(null);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(
    () => {
      try {
        const stored = JSON.parse(
          window.localStorage.getItem(
            TOPBAR_NOTIFICATION_READ_STORAGE_KEY,
          ) || "[]",
        );
        return Array.isArray(stored)
          ? stored.filter((item): item is string => typeof item === "string")
          : [];
      } catch {
        return [];
      }
    },
  );
  const topbarActionsRef = useRef<HTMLDivElement>(null);
  const notifications = useMemo(
    () => buildTopbarNotifications(invoices),
    [invoices],
  );
  const unreadCount = notifications.filter(
    (item) => !readNotificationIds.includes(item.id),
  ).length;

  useEffect(() => {
    if (!activeTopbarMenu) return;

    const closeOnPointerDown = (event: Event) => {
      if (
        event.target instanceof Node &&
        !topbarActionsRef.current?.contains(event.target)
      ) {
        setActiveTopbarMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveTopbarMenu(null);
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeTopbarMenu]);

  const signOut = () => {
    logout();
    navigate("/login");
  };

  const persistReadNotificationIds = (ids: string[]) => {
    const uniqueIds = [...new Set(ids)];
    setReadNotificationIds(uniqueIds);
    window.localStorage.setItem(
      TOPBAR_NOTIFICATION_READ_STORAGE_KEY,
      JSON.stringify(uniqueIds),
    );
  };

  const markNotificationRead = (id: string) => {
    if (readNotificationIds.includes(id)) return;
    persistReadNotificationIds([...readNotificationIds, id]);
  };

  const markAllNotificationsRead = () => {
    persistReadNotificationIds(notifications.map((item) => item.id));
  };

  const openNotification = (item: TopbarNotificationItem) => {
    markNotificationRead(item.id);
    setActiveTopbarMenu(null);
    navigate(item.to);
  };

  const openGuideSection = (to: string) => {
    setActiveTopbarMenu(null);
    navigate(to);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="mobile-menu icon-button" type="button" onClick={() => setOpen(true)} title="打开导航"><Menu size={20} /></button>
        <Brand compact />
        <div className="topbar-actions" ref={topbarActionsRef}>
          <div className="topbar-action-anchor">
            <button
              className={`icon-button ${activeTopbarMenu === "help" ? "is-active" : ""}`}
              type="button"
              title="使用说明"
              aria-label="打开使用说明"
              aria-haspopup="dialog"
              aria-expanded={activeTopbarMenu === "help"}
              aria-controls="topbar-help-panel"
              onClick={() =>
                setActiveTopbarMenu((current) =>
                  current === "help" ? null : "help",
                )
              }
            >
              <CircleHelp size={18} />
            </button>
            {activeTopbarMenu === "help" ? (
              <section
                id="topbar-help-panel"
                className="topbar-popover help-popover"
                role="dialog"
                aria-modal="false"
                aria-labelledby="topbar-help-title"
              >
                <header className="topbar-popover-heading">
                  <div>
                    <strong id="topbar-help-title">使用说明</strong>
                    <span>达人请款与收款操作指南</span>
                  </div>
                  <button
                    className="help-close-button"
                    type="button"
                    aria-label="关闭使用说明"
                    title="关闭"
                    onClick={() => setActiveTopbarMenu(null)}
                  >
                    <X size={16} />
                  </button>
                </header>
                <div className="creator-guide-body">
                  <section className="creator-guide-section" aria-labelledby="creator-guide-flow-title">
                    <h3 id="creator-guide-flow-title">推荐操作流程</h3>
                    <ol className="creator-guide-flow">
                      {creatorGuideSteps.map((step, index) => (
                        <li key={step.title}>
                          <span>{index + 1}</span>
                          <div>
                            <strong>{step.title}</strong>
                            <p>{step.description}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section className="creator-guide-section" aria-labelledby="creator-guide-status-title">
                    <h3 id="creator-guide-status-title">什么时候需要你处理</h3>
                    <div className="creator-guide-status-list">
                      {creatorGuideStatuses.map((status) => (
                        <div key={status.label}>
                          <span className={`creator-guide-status ${status.tone}`}>
                            {status.label}
                          </span>
                          <p>{status.description}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="creator-guide-section" aria-labelledby="creator-guide-shortcuts-title">
                    <h3 id="creator-guide-shortcuts-title">常用入口</h3>
                    <div className="creator-guide-shortcuts">
                      {creatorGuideShortcuts.map((item) => {
                        const ShortcutIcon = item.icon;
                        return (
                          <button
                            type="button"
                            key={item.to}
                            onClick={() => openGuideSection(item.to)}
                          >
                            <span className={`creator-guide-shortcut-icon ${item.tone}`}>
                              <ShortcutIcon size={16} />
                            </span>
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.description}</small>
                            </span>
                            <ChevronRight size={14} />
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <aside className="creator-guide-reminder">
                    <ShieldCheck size={17} />
                    <div>
                      <strong>签署前请再次核对</strong>
                      <p>
                        Invoice 项目、金额、币种和收款信息确认无误后再签署；收款资料变化时请先更新个人档案。
                      </p>
                    </div>
                  </aside>
                </div>
              </section>
            ) : null}
          </div>
          <div className="topbar-action-anchor">
            <button
              className={`icon-button notification ${activeTopbarMenu === "notifications" ? "is-active" : ""}`}
              type="button"
              title="通知"
              aria-label={
                unreadCount
                  ? `通知，${unreadCount} 条未读`
                  : "通知，无未读消息"
              }
              aria-haspopup="dialog"
              aria-expanded={activeTopbarMenu === "notifications"}
              aria-controls="topbar-notifications-panel"
              onClick={() =>
                setActiveTopbarMenu((current) =>
                  current === "notifications" ? null : "notifications",
                )
              }
            >
              <Bell size={18} />
              {unreadCount ? (
                <span className="notification-count" aria-hidden="true">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>
            {activeTopbarMenu === "notifications" ? (
              <section
                id="topbar-notifications-panel"
                className="topbar-popover notifications-popover"
                role="dialog"
                aria-modal="false"
                aria-labelledby="topbar-notifications-title"
              >
                <header className="topbar-popover-heading">
                  <div>
                    <strong id="topbar-notifications-title">通知中心</strong>
                    <span>
                      {unreadCount
                        ? `${unreadCount} 条未读通知`
                        : "暂无未读通知"}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!unreadCount}
                    onClick={markAllNotificationsRead}
                  >
                    全部已读
                  </button>
                </header>
                <div className="notification-list">
                  {notifications.length ? (
                    notifications.map((item) => {
                      const isRead = readNotificationIds.includes(item.id);
                      const NotificationIcon =
                        item.tone === "danger"
                          ? Info
                          : item.tone === "success"
                            ? CircleDollarSign
                            : item.tone === "amber"
                              ? ReceiptText
                              : Clock3;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={`notification-item ${isRead ? "is-read" : "is-unread"}`}
                          onClick={() => openNotification(item)}
                        >
                          <span
                            className={`notification-item-icon ${item.tone}`}
                          >
                            <NotificationIcon size={17} />
                          </span>
                          <span className="notification-item-copy">
                            <span>
                              <strong>{item.title}</strong>
                              <small>{item.time}</small>
                            </span>
                            <span>{item.description}</span>
                          </span>
                          {!isRead ? (
                            <i
                              className="notification-unread-dot"
                              aria-label="未读"
                            />
                          ) : null}
                        </button>
                      );
                    })
                  ) : (
                    <div className="notification-empty">
                      <Bell size={22} />
                      <strong>暂无通知</strong>
                      <span>新的审批和付款进度会显示在这里</span>
                    </div>
                  )}
                </div>
                <footer>仅展示最近的项目、Invoice 与付款动态</footer>
              </section>
            ) : null}
          </div>
          <span className="top-avatar">{profile.displayName.slice(0, 1)}</span>
        </div>
      </header>
      {open ? <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setOpen(false)} /> : null}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-mobile-head">
          <Brand compact />
          <button className="icon-button" onClick={() => setOpen(false)} title="关闭导航"><X size={19} /></button>
        </div>
        <nav>
          <span className="nav-label">支付协作</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "nav-active" : ""}`}>
                <Icon size={18} />
                <span>{item.label}</span>
                <ChevronRight className="nav-arrow" size={15} />
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-account">
          <span className="mini-avatar">{profile.displayName.slice(0, 1)}</span>
          <span><strong>{profile.displayName}</strong><small>{profile.social.platform} · {profile.social.handle}</small></span>
          <button type="button" className="icon-button" title="退出登录" onClick={signOut}><LogOut size={17} /></button>
        </div>
      </aside>
      <main className="main-content">
        {accessDenied ? (
          <div className="role-access-notice" role="alert">
            <AlertCircle size={16} />
            <span>{accessDenied}</span>
          </div>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}

function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className="page-heading">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {action}
    </header>
  );
}

const REQUEST_TRACK_LABELS = ["合同", "Invoice", "审批", "付款"] as const;

interface LinkedRequestProject {
  id: string;
  projectName: string;
  brand: string;
  amount: string;
  updatedAt: string;
  request?: RequestProject;
  contract: Contract;
  invoice: Invoice;
}

export const normalizeProjectMatchKey = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function buildLinkedRequestProjects(
  requests: RequestProject[],
  contracts: Contract[],
  invoices: Invoice[],
): LinkedRequestProject[] {
  const contractsByProject = new Map(
    contracts.map((contract) => [normalizeProjectMatchKey(contract.projectName), contract]),
  );
  const requestsByProject = new Map(
    requests.map((request) => [normalizeProjectMatchKey(request.projectName), request]),
  );

  return sortInvoices(invoices).flatMap((invoice) => {
    const projectKey = normalizeProjectMatchKey(invoice.projectName);
    const baseContract = contractsByProject.get(projectKey);
    if (!baseContract) return [];
    const contract = syncContractWithInvoices(baseContract, [invoice]);
    const request = requestsByProject.get(projectKey);
    return [{
      id: request?.id || invoice.projectId,
      projectName: invoice.projectName,
      brand: invoice.brand,
      amount: invoice.amount,
      updatedAt: invoice.updatedAt,
      request,
      contract,
      invoice,
    }];
  });
}

function summarizeRequestAmount(items: Array<{ amount: string }>) {
  if (!items.length) return "-";
  const parsed = items.map((item) => {
    const [currency = "", rawAmount = "0"] = item.amount.split(/\s+/, 2);
    return { currency, value: Number(rawAmount.replace(/,/g, "")) };
  });
  if (parsed.some((item) => !Number.isFinite(item.value))) return "-";
  const totals = new Map<string, number>();
  parsed.forEach((item) => totals.set(item.currency, (totals.get(item.currency) || 0) + item.value));
  return Array.from(totals).sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, total]) => `${currency} ${new Intl.NumberFormat("en-US").format(total)}`)
    .join(" · ");
}

function AmountInfoTooltip({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <span className="amount-info-tooltip">
      <button type="button" aria-label={`查看${label}说明`} aria-describedby={id}>
        <Info size={12} />
      </button>
      <span id={id} role="tooltip">{children}</span>
    </span>
  );
}

function buildInvoiceDrivenRequestProgress(invoice: Invoice): RequestProject["progress"] {
  const signatureComplete = invoice.status !== "DRAFT_SIGNATURE";
  const reviewComplete = ["APPROVED", "PAYMENT_FAILED", "PAID"].includes(invoice.status);
  const paymentComplete = invoice.status === "PAID";
  const isPaymentCorrectionReview =
    invoice.status === "PENDING_REVIEW" &&
    Boolean(invoice.paymentIssue?.resubmittedAt);
  return [
    {
      id: "contract",
      label: "合同匹配",
      state: "complete",
      description: "已匹配当前账号下的同名合同",
      owner: "系统",
      time: "已完成",
    },
    {
      id: "invoice",
      label: "Invoice 签署",
      state: signatureComplete ? "complete" : "current",
      description: signatureComplete ? "Invoice 已完成签署" : "等待你核对并签署 Invoice",
      owner: signatureComplete ? "系统" : "你",
      time: signatureComplete ? "已完成" : "待处理",
    },
    {
      id: "review",
      label: "Invoice 审核",
      state: reviewComplete ? "complete" : signatureComplete ? "current" : "pending",
      description: reviewComplete
        ? "Invoice 已通过审核"
        : isPaymentCorrectionReview
          ? "付款资料修正后已从资料审核节点重新开始"
          : signatureComplete
            ? "Invoice 正在审核"
            : "签署后进入审核",
      owner: "系统",
      time: reviewComplete ? "已完成" : signatureComplete ? "处理中" : "未开始",
    },
    {
      id: "payment",
      label: "完成付款",
      state: paymentComplete ? "complete" : invoice.status === "PAYMENT_FAILED" ? "blocked" : reviewComplete ? "current" : "pending",
      description: paymentComplete
        ? "款项已完成支付"
        : invoice.status === "PAYMENT_FAILED"
          ? "付款信息校验失败，需要修正后提交审核"
          : reviewComplete
            ? "等待付款处理"
            : "Invoice 审核通过后进入付款",
      owner: "系统",
      time: paymentComplete ? invoice.updatedAt : invoice.status === "PAYMENT_FAILED" ? "已暂停" : reviewComplete ? "处理中" : "未开始",
    },
  ];
}

function RequestMiniProgress({ status }: { status: InvoiceStatus }) {
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
    <div className="request-mini-progress" aria-label={`当前请款状态：${REQUEST_STATUS_FROM_INVOICE[status].label}`}>
      {REQUEST_TRACK_LABELS.map((label, index) => {
        const step = steps[index];
        return (
          <div className={`request-mini-step step-${step}`} key={label}>
            <span>{["amber", "blue", "success"].includes(step) ? <Check size={10} /> : null}</span>
            <small>{label}</small>
          </div>
        );
      })}
    </div>
  );
}

function RequestListPage() {
  const { invoices, profile } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "ALL">("ALL");
  const homeItems = useMemo(
    () => buildLinkedRequestProjects(seedRequests, seedContracts, invoices),
    [invoices],
  );
  const normalizedQuery = normalizeProjectMatchKey(query);
  const filtered = useMemo(() => homeItems.filter((item) => {
    const matchesStatus = status === "ALL" || item.invoice.status === status;
    const matchesQuery = !normalizedQuery || normalizeProjectMatchKey(
      `${item.projectName} ${item.brand} ${item.id} ${item.contract.id} ${item.invoice.id}`,
    ).includes(normalizedQuery);
    return matchesStatus && matchesQuery;
  }), [homeItems, normalizedQuery, status]);
  const statusOptions: Array<InvoiceStatus | "ALL"> = [
    "ALL",
    "DRAFT_SIGNATURE",
    "PENDING_REVIEW",
    "APPROVED",
    "PAYMENT_FAILED",
    "PAID",
  ];
  const linkedInvoices = homeItems.map((item) => item.invoice);
  const unsignedInvoices = linkedInvoices.filter((invoice) => invoice.status === "DRAFT_SIGNATURE");
  const paymentIssueInvoice = linkedInvoices.find((invoice) => invoice.status === "PAYMENT_FAILED");
  const signatureItems = homeItems.filter((item) => item.invoice.status === "DRAFT_SIGNATURE");
  const processingItems = homeItems.filter((item) => ["PENDING_REVIEW", "APPROVED", "PAYMENT_FAILED"].includes(item.invoice.status));
  const paidItems = homeItems.filter((item) => item.invoice.status === "PAID");
  const creatorHandle = profile.social.handle.replace(/^@/, "");

  return (
    <div className="page-stack request-home-page">
      <header className="request-home-greeting">
        <h1>你好，{profile.displayName}</h1>
        <p>欢迎回来，@{creatorHandle}</p>
      </header>

      <section className="request-action-panel">
        <h2>待我处理</h2>
        <div className="request-action-list">
          <article>
            <span className="request-action-icon purple"><ReceiptText size={21} /></span>
            <div>
              <strong>{unsignedInvoices.length} 份 Invoice 待签署</strong>
              <p>请尽快签署以推进审批流程</p>
            </div>
            <Link to="/invoices?status=DRAFT_SIGNATURE">去签署 <ChevronRight size={15} /></Link>
          </article>
          <article>
            <span className="request-action-icon pink"><Pencil size={20} /></span>
            <div>
              <strong>{paymentIssueInvoice ? 1 : 0} 项付款资料待修改</strong>
              <p>完善付款资料以便顺利收款</p>
            </div>
            <Link
              className="pink"
              to={paymentIssueInvoice
                ? `/profile?repairInvoice=${paymentIssueInvoice.id}&field=${paymentIssueInvoice.paymentIssue?.fieldKey || "account_number"}#payout-information`
                : "/profile#payout-information"}
            >
              去修改 <ChevronRight size={15} />
            </Link>
          </article>
        </div>
      </section>

      <section className="request-money-overview" aria-label="请款金额概览">
        <article>
          <i className="amber" />
          <div>
            <span>
              待签署金额
              <AmountInfoTooltip id="requesting-amount-tip" label="待签署金额">
                当前账号下已匹配合同、但关联 Invoice 仍待你签署的项目金额合计。
              </AmountInfoTooltip>
            </span>
            <strong>{summarizeRequestAmount(signatureItems)}</strong>
          </div>
          <small>{signatureItems.length} 个项目</small>
        </article>
        <article>
          <i className="blue" />
          <div>
            <span>
              处理中金额
              <AmountInfoTooltip id="pending-arrival-amount-tip" label="处理中金额">
                关联 Invoice 正在审核、等待付款或发生付款异常的项目金额合计。
              </AmountInfoTooltip>
            </span>
            <strong>{summarizeRequestAmount(processingItems)}</strong>
          </div>
          <small>{processingItems.length} 个项目</small>
        </article>
        <article>
          <i className="green" />
          <div>
            <span>
              已打款金额
              <AmountInfoTooltip id="completed-amount-tip" label="已打款金额">
                关联 Invoice 已完成付款的项目金额合计。
              </AmountInfoTooltip>
            </span>
            <strong>{summarizeRequestAmount(paidItems)}</strong>
          </div>
          <small>{paidItems.length} 个项目</small>
        </article>
      </section>

      <section className="content-card request-project-panel">
        <header><h2>请款项目</h2></header>
        <div className="toolbar request-project-toolbar">
          <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目、品牌或请款编号" /></label>
          <div className="filter-tabs">
            {statusOptions.map((value) => (
              <button type="button" key={value} className={value === status ? "active" : ""} onClick={() => setStatus(value)}>
                {value === "ALL" ? "全部" : REQUEST_STATUS_FROM_INVOICE[value].label}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <>
            <div className="table-scroll">
              <table className="data-table request-project-table">
                <thead><tr><th>项目 / 请款编号</th><th>金额</th><th>合同状态</th><th>Invoice 状态</th><th>请款状态</th><th>更新时间</th><th aria-label="请款进度" /><th /></tr></thead>
                <tbody>
                  {filtered.map((item, index) => {
                    const meta = REQUEST_STATUS_FROM_INVOICE[item.invoice.status];
                    return (
                      <tr className={index === 0 && status === "ALL" && !query ? "request-priority-row" : ""} key={item.id}>
                        <td><Link className="table-primary" to={`/requests/${item.id}`}><strong>{item.projectName}</strong><small>{item.id} · {item.brand}</small></Link></td>
                        <td className="amount-cell">{item.amount}</td>
                        <td><span className="resource-state"><FileText size={15} />{contractStatusLabel[item.contract.status]}</span></td>
                        <td><span className="resource-state"><ReceiptText size={15} />{INVOICE_STATUS[item.invoice.status].label}</span></td>
                        <td><StatusBadge label={meta.label} tone={meta.tone} /></td>
                        <td className="muted-cell"><span className="request-update-time">{item.updatedAt}</span></td>
                        <td><RequestMiniProgress status={item.invoice.status} /></td>
                        <td><Link className="icon-link" title="查看项目" to={`/requests/${item.id}`}><ChevronRight size={17} /></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="request-mobile-list">
              {filtered.map((item) => {
                const meta = REQUEST_STATUS_FROM_INVOICE[item.invoice.status];
                return (
                  <Link to={`/requests/${item.id}`} className="request-mobile-card" key={item.id}>
                    <header><div><strong>{item.projectName}</strong><small>{item.id} · {item.brand}</small></div><StatusBadge label={meta.label} tone={meta.tone} /></header>
                    <div className="request-mobile-amount">{item.amount}</div>
                    <dl><div><dt>合同</dt><dd>{contractStatusLabel[item.contract.status]}</dd></div><div><dt>Invoice</dt><dd>{INVOICE_STATUS[item.invoice.status].label}</dd></div><div><dt>更新</dt><dd>{item.updatedAt}</dd></div></dl>
                    <RequestMiniProgress status={item.invoice.status} />
                  </Link>
                );
              })}
            </div>
            <footer className="request-project-footer">显示 {filtered.length} 个项目，共 {homeItems.length} 个</footer>
          </>
        ) : <EmptyState title="没有匹配的关联项目" copy="仅展示当前账号中合同与 Invoice 项目名一致的项目。" />}
      </section>
    </div>
  );
}

function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="back-link" to={to}><ChevronLeft size={16} />{children}</Link>;
}

function useAdminCreatorDetail(creatorId?: string) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(creatorId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!creatorId) {
      setDetail(null);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    services.adminUsers
      .get(creatorId)
      .then((result) => {
        if (!active) return;
        setDetail(result.data);
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        setDetail(null);
        setError(
          caught instanceof Error ? caught.message : "暂时无法加载创作者数据",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [creatorId]);

  return { detail, loading, error };
}

function AdminBusinessDetailFallback({
  backTo,
  loading,
  error,
  resourceName,
}: {
  backTo: string;
  loading: boolean;
  error: string;
  resourceName: string;
}) {
  return (
    <div className="page-stack">
      <BackLink to={backTo}>返回{resourceName}列表</BackLink>
      {loading ? (
        <div className="admin-detail-loading">
          <RefreshCcw className="spin" size={20} />
          正在加载{resourceName}详情
        </div>
      ) : (
        <EmptyState
          title={`${resourceName}不存在`}
          copy={error || "该记录可能已移除，或未关联至当前创作者。"}
        />
      )}
    </div>
  );
}

function RequestDetailPage({ adminView = false }: { adminView?: boolean }) {
  const { id, creatorId } = useParams();
  const { invoices } = useApp();
  const adminCreator = useAdminCreatorDetail(
    adminView ? creatorId : undefined,
  );
  const availableRequests = adminView
    ? adminCreator.detail?.requests || []
    : seedRequests;
  const availableInvoices = adminView
    ? adminCreator.detail?.invoices || []
    : invoices;
  const availableContracts = adminView
    ? adminCreator.detail?.contracts || []
    : seedContracts;
  const baseRequest = availableRequests.find((item) => item.id === id);
  const linkedInvoice = availableInvoices.find((invoice) => (
    invoice.projectId === id
    || (baseRequest && normalizeProjectMatchKey(invoice.projectName) === normalizeProjectMatchKey(baseRequest.projectName))
  ));
  const baseContract = linkedInvoice
    ? availableContracts.find((contract) => (
        normalizeProjectMatchKey(contract.projectName) === normalizeProjectMatchKey(linkedInvoice.projectName)
      ))
    : undefined;
  const backTo = adminView ? "/admin" : "/";
  if (adminView && (adminCreator.loading || !adminCreator.detail || !linkedInvoice || !baseContract)) {
    return (
      <AdminBusinessDetailFallback
        backTo={backTo}
        loading={adminCreator.loading}
        error={adminCreator.error}
        resourceName="请款项目"
      />
    );
  }
  if (!linkedInvoice || !baseContract) return <Navigate to="/" replace />;
  const linkedContract = syncContractWithInvoices(baseContract, [linkedInvoice]);
  const meta = REQUEST_STATUS_FROM_INVOICE[linkedInvoice.status];
  const progress = buildInvoiceDrivenRequestProgress(linkedInvoice);
  const issues = linkedInvoice.status === "PAYMENT_FAILED" ? (baseRequest?.issues || []) : [];
  const contractTo = adminView
    ? `/admin/contracts/${creatorId}/${linkedContract.id}`
    : `/contracts/${linkedContract.id}`;
  const invoiceTo = adminView
    ? `/admin/invoices/${creatorId}/${linkedInvoice.id}`
    : `/invoices/${linkedInvoice.id}`;

  return (
    <div className="page-stack">
      <BackLink to={backTo}>返回请款项目</BackLink>
      <PageHeading title={linkedInvoice.projectName} subtitle={`${baseRequest?.id || linkedInvoice.projectId} · ${linkedInvoice.brand}`} action={<StatusBadge label={meta.label} tone={meta.tone} />} />
      <section className="detail-metrics">
        <article><span>请款金额</span><strong>{linkedInvoice.amount}</strong><small>以关联 Invoice 为准</small></article>
        <article><span>合同状态</span><strong>{contractStatusLabel[linkedContract.status]}</strong><small>按项目名匹配 1 份合同</small></article>
        <article><span>Invoice 状态</span><strong>{INVOICE_STATUS[linkedInvoice.status].label}</strong><small>按项目名匹配 1 份 Invoice</small></article>
      </section>
      {linkedInvoice.status === "PAYMENT_FAILED" ? (
        <section className="blocking-panel">
          <Info size={20} />
          <div><strong>付款流程已暂停，等待修正收款资料</strong><p>资料校验通过后需提交审核，审核将从资料审核节点重新开始。</p></div>
          <span>{issues.length || 1} 项待处理</span>
        </section>
      ) : null}
      <div className="detail-layout">
        <section className="detail-card">
          <header><div><h2>关联资料</h2><p>合同与 Invoice 已按项目名匹配。</p></div></header>
          <div className="resource-list">
            <Link to={contractTo}>
              <span className="resource-icon purple"><FileText size={19} /></span>
              <div><small>合同</small><strong>{linkedContract.id}</strong><span>{linkedContract.fileName}</span></div>
              <StatusBadge label={contractStatusLabel[linkedContract.status]} tone={CONTRACT_STATUS[linkedContract.status].tone} />
              <ChevronRight size={17} />
            </Link>
            <Link to={invoiceTo}>
              <span className="resource-icon peach"><ReceiptText size={19} /></span>
              <div><small>Invoice</small><strong>{linkedInvoice.id}</strong><span>{linkedInvoice.amount}</span></div>
              <StatusBadge label={INVOICE_STATUS[linkedInvoice.status].label} tone={INVOICE_STATUS[linkedInvoice.status].tone} />
              <ChevronRight size={17} />
            </Link>
          </div>
          {issues.length ? (
            <div className="issue-list">
              {issues.map((issue) => (
                <article key={issue.id}>
                  <span><Info size={17} /></span>
                  <div><strong>{issue.title}</strong><p>{issue.reason}</p><small>处理人：{issue.owner}</small></div>
                  <Link to={adminView ? `/admin/invoices/${creatorId}/${issue.resourceId}` : `/invoices/${issue.resourceId}`}>查看资料 <ExternalLink size={14} /></Link>
                </article>
              ))}
            </div>
          ) : null}
        </section>
        <aside className="detail-card progress-card">
          <header><div><h2>请款进程</h2><p>{meta.description}</p></div></header>
          <div className="timeline">
            {progress.map((node) => (
              <div key={node.id} className={`timeline-item state-${node.state}`}>
                <span>{node.state === "complete" ? <Check size={15} /> : node.state === "blocked" ? <Info size={15} /> : null}</span>
                <div><strong>{node.label}</strong><p>{node.description}</p><small>{node.owner} · {node.time}</small></div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ContractListPage() {
  const { invoices, session } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Contract["status"] | "ALL">("ALL");
  const tabs: Array<Contract["status"] | "ALL"> = ["ALL", "未请款", "请款中", "已付款"];
  const contracts = useMemo(
    () =>
      (session?.userId === PRIMARY_CREATOR_ID ? seedContracts : []).map(
        (contract) => syncContractWithInvoices(contract, invoices),
      ),
    [invoices, session?.userId],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return contracts.filter((contract) => {
      const statusMatches = status === "ALL" || contract.status === status;
      const queryMatches =
        !normalized ||
        `${contract.projectName}${contract.id}${contract.orderId}${contract.campaignName}${contract.brand}`
          .toLowerCase()
          .includes(normalized);
      return statusMatches && queryMatches;
    });
  }, [contracts, query, status]);
  const statusCounts = {
    未请款: contracts.filter((contract) => contract.status === "未请款").length,
    请款中: contracts.filter((contract) => contract.status === "请款中").length,
    已付款: contracts.filter((contract) => contract.status === "已付款").length,
  };

  return (
    <div className="page-stack">
      <PageHeading title="合同" subtitle="查看与你相关的合作合同、当前状态和完整合同文件。" />
      <section className="contract-overview" aria-label="合同概览">
        <article className="tone-peach"><span>未付款</span><strong>{statusCounts.未请款}</strong><small>尚未创建关联 Invoice</small></article>
        <article className="tone-sun"><span>付款中</span><strong>{statusCounts.请款中}</strong><small>合同已进入审核或付款流程</small></article>
        <article className="tone-mint"><span>已付款</span><strong>{statusCounts.已付款}</strong><small>合同款项已完成支付</small></article>
      </section>
      <section className="contract-list-panel">
        <div className="contract-list-toolbar">
          <label className="contract-search">
            <Search size={16} />
            <input
              aria-label="搜索合同"
              placeholder="搜索合同名称、编号、项目或品牌"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="contract-status-tabs" role="tablist" aria-label="合同状态筛选">
            {tabs.map((value) => (
              <button
                type="button"
                role="tab"
                aria-selected={status === value}
                className={status === value ? "active" : ""}
                key={value}
                onClick={() => setStatus(value)}
              >
                {value === "ALL" ? "全部" : contractStatusLabel[value]}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <>
            <div className="contract-table-scroll">
              <table className="contract-table">
                <thead><tr><th>合同</th><th>项目 / 品牌</th><th>合同金额</th><th>合同状态</th><th>生效日期</th><th>更新日期</th><th>操作</th></tr></thead>
                <tbody>
                  {filtered.map((contract) => (
                    <tr key={contract.id}>
                      <td><Link className="contract-table-title" to={`/contracts/${contract.id}`}><strong>{contract.projectName}</strong><small>{contract.id} · {contract.orderId}</small></Link></td>
                      <td><div className="contract-project-cell"><strong>{contract.campaignName}</strong><small>{contract.brand}</small></div></td>
                      <td className="amount-cell">{contract.amount}</td>
                      <td><StatusBadge label={contractStatusLabel[contract.status]} tone={CONTRACT_STATUS[contract.status].tone} /></td>
                      <td className="muted-cell">{contract.effectiveDate}</td>
                      <td className="muted-cell">{contract.updatedAt}</td>
                      <td>
                        <div className="invoice-row-actions contract-row-actions">
                          <Link to={`/contracts/${contract.id}`} title={`查看 ${contract.id}`}><Eye size={15} /><span>查看</span></Link>
                          <a href={contract.documentUrl} download={contract.fileName} title={`下载 ${contract.id}`}><FileDown size={15} /><span>下载</span></a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="contract-mobile-list">
              {filtered.map((contract) => (
                <article className="contract-mobile-row" key={contract.id}>
                  <header><span className="resource-icon purple"><FileText size={19} /></span><StatusBadge label={contractStatusLabel[contract.status]} tone={CONTRACT_STATUS[contract.status].tone} /></header>
                  <div>
                    <Link className="contract-mobile-title" to={`/contracts/${contract.id}`}><strong>{contract.projectName}</strong></Link>
                    <small>{contract.id} · {contract.orderId}</small>
                  </div>
                  <dl><div><dt>项目 / 品牌</dt><dd>{contract.campaignName}<small>{contract.brand}</small></dd></div><div><dt>合同金额</dt><dd>{contract.amount}</dd></div><div><dt>生效日期</dt><dd>{contract.effectiveDate}</dd></div></dl>
                  <footer>
                    <span>{contract.updatedAt}</span>
                    <div className="invoice-row-actions contract-list-mobile-actions">
                      <Link to={`/contracts/${contract.id}`} title={`查看 ${contract.id}`}><Eye size={15} /><span>查看</span></Link>
                      <a href={contract.documentUrl} download={contract.fileName} title={`下载 ${contract.id}`}><FileDown size={15} /><span>下载</span></a>
                    </div>
                  </footer>
                </article>
              ))}
            </div>
          </>
        ) : <EmptyState title="没有匹配的合同" copy="调整关键词或合同状态后再试。" />}
      </section>
    </div>
  );
}

function ContractDetailPage({ adminView = false }: { adminView?: boolean }) {
  const { id, creatorId } = useParams();
  const { invoices, session } = useApp();
  const adminCreator = useAdminCreatorDetail(
    adminView ? creatorId : undefined,
  );
  const [obligationTab, setObligationTab] = useState<"FULFILLMENT" | "CLAIM">("FULFILLMENT");
  const baseContract = adminView
    ? adminCreator.detail?.contracts.find((item) => item.id === id)
    : session?.userId === PRIMARY_CREATOR_ID
      ? seedContracts.find((item) => item.id === id)
      : undefined;
  const scopedInvoices = adminView
    ? adminCreator.detail?.invoices || []
    : invoices;
  const backTo = adminView ? "/admin/contracts" : "/contracts";
  if (adminView && (adminCreator.loading || !adminCreator.detail || !baseContract)) {
    return (
      <AdminBusinessDetailFallback
        backTo={backTo}
        loading={adminCreator.loading}
        error={adminCreator.error}
        resourceName="合同"
      />
    );
  }
  if (!baseContract) return <Navigate to="/contracts" replace />;
  const contract = syncContractWithInvoices(baseContract, scopedInvoices);
  const statusOrder: Contract["status"][] = ["未请款", "请款中", "已付款"];
  const currentStatusIndex = statusOrder.indexOf(contract.status);
  const obligationGroups = [
    {
      id: "FULFILLMENT" as const,
      title: "履约内容",
      description: "用于内容交付与发布履约",
      items: contract.obligations.filter((item) => item.stage === "履约中"),
    },
    {
      id: "CLAIM" as const,
      title: "请款内容",
      description: "用于终验后的请款资料准备",
      items: contract.obligations.filter((item) => item.stage === "请款前"),
    },
  ];
  const activeObligationGroup = obligationGroups.find((group) => group.id === obligationTab) ?? obligationGroups[0];
  const claimRules = [
    {
      label: "Invoice",
      value: "终验后3个工作日内开具",
      source: "标准条款3.2 · 第4页",
      status: "confirmed" as const,
    },
    {
      label: "付款",
      value: "一次性支付100%，验收通过且收到Invoice后45个工作日内付款",
      source: "IO第5条 · 第15页",
      status: "confirmed" as const,
    },
    {
      label: "付款方式",
      value: "通过Airwallex银行转账",
      source: "标准条款3.3 · 第4-5页",
      status: "confirmed" as const,
    },
    {
      label: "转账费用",
      value: "由Advertiser承担转账手续费",
      source: "标准条款3.5 · 第5页",
      status: "confirmed" as const,
    },
    {
      label: "收款账户",
      value: "Léa Martin · BNP Paribas · 尾号4821",
      source: "标准条款3.3 · 第4-5页",
      status: "confirmed" as const,
    },
    {
      label: "账户要求",
      value: "合同与Invoice的账户必须一致有效；错误资料导致的费用或延误由Publisher承担",
      source: "标准条款3.3、3.6 · 第5-6页",
      status: "confirmed" as const,
    },
  ];
  return (
    <div className="page-stack">
      <BackLink to={backTo}>返回合同列表</BackLink>
      <PageHeading title={contract.projectName} subtitle={`${contract.id} · ${contract.orderId} · ${contract.creatorName}`} action={<StatusBadge label={contractStatusLabel[contract.status]} tone={CONTRACT_STATUS[contract.status].tone} />} />
      <aside className="contract-source-notice" role="note">
        <span><Info size={16} /></span>
        <div>
          <strong>合同来源说明</strong>
          <p>当前原型中的合同文件统一使用同一份演示模板，仅用于功能预览。正式上线后，系统将自动同步管理端上传并关联至对应项目的实际合同，达人可在此查看、下载和核对合同内容。演示合同不作为履约或请款依据。</p>
        </div>
      </aside>
      <section className="contract-status-board">
        <header><div><h2>合同状态</h2><p>{CONTRACT_STATUS[contract.status].description}</p></div><StatusBadge label={contractStatusLabel[contract.status]} tone={CONTRACT_STATUS[contract.status].tone} /></header>
        <div className="contract-status-facts">
          <div><span>合同金额</span><strong>{contract.amount}</strong></div>
          <div><span>生效日期</span><strong>{contract.effectiveDate}</strong></div>
          <div><span>服务周期</span><strong>{contract.servicePeriod}</strong></div>
          <div><span>最近更新</span><strong>{contract.updatedAt}</strong></div>
        </div>
        <div className="contract-status-track" aria-label={`当前合同状态：${contractStatusLabel[contract.status]}`}>
          {statusOrder.map((item, index) => {
            const state = index < currentStatusIndex ? "complete" : index === currentStatusIndex ? "current" : "pending";
            return (
              <div className={`contract-status-step ${state}`} key={item}>
                <span>{state === "complete" ? <Check size={14} /> : state === "current" ? <Clock3 size={14} /> : null}</span>
                <div><strong>{contractStatusLabel[item]}</strong><small>{state === "complete" ? "已完成" : state === "current" ? "当前阶段" : "待开始"}</small></div>
              </div>
            );
          })}
        </div>
      </section>
      <div className="contract-document-layout">
        <section className="contract-viewer-card">
          <header>
            <div className="contract-viewer-title">
              <span className="resource-icon purple"><FileText size={20} /></span>
              <div><h2>合同全文</h2><p>{contract.fileName} · {contract.pageCount}页</p></div>
            </div>
            <a className="contract-open-link" href={contract.documentUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />新窗口打开
            </a>
          </header>
          <iframe
            className="contract-pdf-frame"
            src={`${contract.documentUrl}#page=1&zoom=page-width&toolbar=1&navpanes=0`}
            title={`${contract.projectName} PDF`}
          />
          <img
            className="contract-pdf-mobile-preview"
            src="/26-kol-standard-terms-template-page-1.png"
            alt={`${contract.projectName} 首页预览`}
          />
          <footer className="contract-mobile-actions">
            <a className="primary-button" href={contract.documentUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />打开合同 PDF
            </a>
            <a className="secondary-button" href={contract.documentUrl} download={contract.fileName}>
              <Download size={16} />下载合同
            </a>
          </footer>
        </section>
        <aside className="contract-obligations-card">
          <div className="obligation-tabs" role="tablist" aria-label="我的履约事项">
            {obligationGroups.map((group) => (
              <button
                className={obligationTab === group.id ? "active" : ""}
                key={group.id}
                onClick={() => setObligationTab(group.id)}
                role="tab"
                aria-selected={obligationTab === group.id}
                type="button"
              >
                {group.title}<span>{group.id === "CLAIM" ? claimRules.length : group.items.length}</span>
              </button>
            ))}
          </div>
          <div className="contract-obligation-content">
            {obligationTab === "CLAIM" ? (
              <section className="contract-claim-rules">
                <aside className="contract-claim-demo-notice" role="note">
                  <span><Info size={15} /></span>
                  <div>
                    <strong>演示数据说明</strong>
                    <p>当前合同请款信息为演示数据，不作为实际请款或付款依据。正式版本将自动解析合同及关联IO，同步Invoice时限、付款安排、付款方式、费用承担和收款账户；合同中的空白项或未勾选项将标记为待确认，补充确认后再用于请款。</p>
                  </div>
                </aside>
                <header className="obligation-panel-heading">
                  <span className="resource-icon purple"><ReceiptText size={18} /></span>
                  <div><h2>合同请款信息</h2><p>关键请款条款与收款信息</p></div>
                </header>
                <dl className="claim-rule-list">
                  {claimRules.map((rule) => (
                    <div key={rule.label}>
                      <dt>
                        <span>{rule.label}</span>
                        <small className={`claim-rule-status ${rule.status}`}>
                          合同已明确
                        </small>
                      </dt>
                      <dd><span>{rule.value}</span><small>{rule.source}</small></dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : (
              <>
                <header className="obligation-panel-heading">
                  <span className="resource-icon purple"><FileCheck2 size={18} /></span>
                  <div><h2>{activeObligationGroup.title}事项</h2><p>{activeObligationGroup.description} · 根据合同原文自动提取</p></div>
                </header>
                <ol className="contract-obligation-list">
                  {activeObligationGroup.items.map((obligation, index) => (
                    <li key={obligation.id}>
                      <span className="obligation-index">{index + 1}</span>
                      <div className="obligation-item-copy">
                        <strong>{obligation.title}</strong>
                        <p>{obligation.summary}</p>
                        <small>{obligation.clause}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

const downloadInvoiceDocument = (invoice?: Invoice) => {
  const anchor = document.createElement("a");
  anchor.href = invoice?.document?.previewUrl || "/INV-20260723-001-Alex-Ruiz.pdf";
  anchor.download = invoice?.document?.name || `${invoice?.id || "INV-20260723-001"}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

type SignatureMethod = "DRAWN" | "GENERATED";

const GENERATED_SIGNATURE_STYLES = [
  { id: "classic", label: "经典", font: 'Snell Roundhand, "Segoe Script", cursive', rotation: -2 },
  { id: "flowing", label: "流畅", font: '"Apple Chancery", "URW Chancery L", cursive', rotation: -4 },
  { id: "minimal", label: "简约", font: '"Brush Script MT", "Segoe Script", cursive', rotation: 0 },
  { id: "personal", label: "个性", font: '"Bradley Hand", "Comic Sans MS", cursive', rotation: -3 },
] as const;

const createGeneratedSignature = (
  name: string,
  fontFamily: string,
  rotation: number,
) => {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 220;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const normalizedName = name.trim();
  const fontSize = Math.max(
    44,
    Math.min(78, 620 / Math.max(normalizedName.length * 0.58, 1)),
  );
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.fillStyle = "#17171d";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${fontSize}px ${fontFamily}`;
  context.fillText(normalizedName, 0, 0);
  context.restore();
  return canvas.toDataURL("image/png");
};

function SignatureModal({
  invoice,
  signerName,
  payoutAccountName,
  onClose,
  onConfirm,
}: {
  invoice: Invoice;
  signerName: string;
  payoutAccountName: string;
  onClose(): void;
  onConfirm(signature: InvoiceSignature): Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [method, setMethod] = useState<SignatureMethod>("DRAWN");
  const [signatureData, setSignatureData] = useState("");
  const [selectedGeneratedStyle, setSelectedGeneratedStyle] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const generatedSignatures = useMemo(
    () => payoutAccountName.trim()
      ? GENERATED_SIGNATURE_STYLES.map((style) => ({
          ...style,
          dataUrl: createGeneratedSignature(
            payoutAccountName,
            style.font,
            style.rotation,
          ),
        }))
      : [],
    [payoutAccountName],
  );

  const canvasPoint = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): [number, number] => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * canvas.width,
      ((event.clientY - rect.top) / rect.height) * canvas.height,
    ];
  };

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = canvasPoint(event);
    context.beginPath();
    context.moveTo(x, y);
    context.strokeStyle = "#17171d";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    isDrawingRef.current = true;
    setError("");
  };

  const drawSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const [x, y] = canvasPoint(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const finishDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();
    isDrawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setSignatureData(event.currentTarget.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData("");
    setSelectedGeneratedStyle("");
    setError("");
  };

  const selectMethod = (nextMethod: SignatureMethod) => {
    setMethod(nextMethod);
    setLegalAccepted(false);
    clearSignature();
  };

  const chooseGeneratedSignature = (styleId: string, dataUrl: string) => {
    setSelectedGeneratedStyle(styleId);
    setSignatureData(dataUrl);
    setError("");
  };

  const confirmSignature = async () => {
    if (!signatureData) {
      setError(method === "DRAWN" ? "请先在签名板完成签名" : "请先选择一种电子签名样式");
      return;
    }
    if (!legalAccepted) {
      setError("请阅读并同意签署声明");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onConfirm({
        method,
        dataUrl: signatureData,
        signerName,
        signedAt: new Date().toISOString(),
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "签署失败，请稍后重试");
      setSubmitting(false);
    }
  };

  return (
    <div className="signature-modal-overlay" role="presentation">
      <section
        className="signature-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-modal-title"
      >
        <header>
          <div>
            <span className="signature-modal-icon"><PenLine size={20} /></span>
            <div>
              <h2 id="signature-modal-title">签署 Invoice</h2>
              <p>{invoice.id} · {invoice.projectName}</p>
            </div>
          </div>
          <button type="button" className="icon-button" aria-label="关闭签名窗口" disabled={submitting} onClick={onClose}><X size={18} /></button>
        </header>

        <div className="signature-method-tabs" role="tablist" aria-label="签名方式">
          <button type="button" role="tab" aria-selected={method === "DRAWN"} className={method === "DRAWN" ? "active" : ""} onClick={() => selectMethod("DRAWN")}><PenLine size={16} />手写签名</button>
          <button type="button" role="tab" aria-selected={method === "GENERATED"} className={method === "GENERATED" ? "active" : ""} onClick={() => selectMethod("GENERATED")}><Sparkles size={16} />生成电子签名</button>
        </div>

        {method === "DRAWN" ? (
          <div className="signature-pad-wrap">
            <div className="signature-pad-heading"><span>请在下方签名</span><button type="button" onClick={clearSignature}><Eraser size={14} />清除</button></div>
            <canvas
              ref={canvasRef}
              className="signature-pad"
              width={720}
              height={220}
              aria-label="手写签名区域"
              onPointerDown={startDrawing}
              onPointerMove={drawSignature}
              onPointerUp={finishDrawing}
              onPointerCancel={finishDrawing}
            />
            <p>可使用鼠标、触控板或触屏书写</p>
          </div>
        ) : (
          <div className="generated-signature-section">
            <div className="generated-signature-heading">
              <div><strong>选择电子签名样式</strong><span>根据收款账户名 {payoutAccountName || "未设置"} 生成</span></div>
              <Sparkles size={17} />
            </div>
            {generatedSignatures.length ? (
              <div className="generated-signature-grid" role="radiogroup" aria-label="电子签名样式">
                {generatedSignatures.map((style) => {
                  const selected = selectedGeneratedStyle === style.id;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={selected ? "selected" : ""}
                      key={style.id}
                      onClick={() => chooseGeneratedSignature(style.id, style.dataUrl)}
                    >
                      <img src={style.dataUrl} alt={`${payoutAccountName} ${style.label}签名预览`} />
                      <span>{style.label}</span>
                      {selected ? <i aria-hidden="true"><Check size={12} /></i> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="signature-error" role="alert"><Info size={15} />请先在个人档案中完善收款账户名，再生成电子签名。</div>
            )}
          </div>
        )}

        <label className="signature-legal-consent">
          <input
            type="checkbox"
            checked={legalAccepted}
            onChange={(event) => {
              setLegalAccepted(event.target.checked);
              setError("");
            }}
          />
          <span>
            <strong>签署声明</strong>
            我确认该签名由本人创建或选择，并授权用于签署本 Invoice；该电子签名与本人手写签名具有同等法律效力。确认签署后，签名将写入 Invoice 并提交审核。
          </span>
        </label>
        {error ? <div className="signature-error" role="alert"><Info size={15} />{error}</div> : null}
        <footer>
          <p>请确认签名及 Invoice 信息准确无误。</p>
          <div>
            <button type="button" className="secondary-button" disabled={submitting} onClick={onClose}>取消</button>
            <button type="button" className="primary-button" disabled={!signatureData || !legalAccepted || submitting} onClick={confirmSignature}>{submitting ? "签署中" : "确认签署"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败，请重新选择"));
    reader.readAsDataURL(file);
  });

function InvoiceUploadModal({
  invoices,
  profile,
  onClose,
  onUploaded,
}: {
  invoices: Invoice[];
  profile: UserProfile;
  onClose(): void;
  onUploaded(invoice: Invoice): void;
}) {
  const { uploadInvoice } = useApp();
  const availableContracts = seedContracts.filter(
    (contract) =>
      !invoices.some((invoice) => invoice.projectId === contract.projectId),
  );
  const payoutAccounts = profile.payoutAccounts.filter(isPayoutAccountUsable);
  const [projectId, setProjectId] = useState(availableContracts[0]?.projectId || "");
  const [payoutAccountId, setPayoutAccountId] = useState(
    payoutAccounts.find((account) => account.id === profile.defaultPayoutAccountId)?.id ||
      payoutAccounts[0]?.id ||
      "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedContract = availableContracts.find(
    (contract) => contract.projectId === projectId,
  );
  const selectedAccount = payoutAccounts.find(
    (account) => account.id === payoutAccountId,
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedContract || !selectedAccount || !file) {
      setError("请完成项目、付款账户和 Invoice 文件选择");
      return;
    }
    if (!/application\/pdf|image\/(png|jpeg)/.test(file.type)) {
      setError("仅支持 PDF、PNG 或 JPG 文件");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("文件大小不能超过 5MB");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const previewUrl = await fileToDataUrl(file);
      const [currency = selectedAccount.currency, rawTotal = "0"] =
        selectedContract.amount.split(/\s+/, 2);
      const issuedAt = new Date().toISOString().slice(0, 10);
      const uploaded = await uploadInvoice({
        projectId: selectedContract.projectId,
        projectName: selectedContract.projectName,
        brand: selectedContract.brand,
        amount: selectedContract.amount,
        payoutAccountId: selectedAccount.id,
        invoiceType: "EXTERNAL_CONTRACT",
        file: {
          id: `invoice-file-${Date.now()}`,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          previewUrl,
        },
        extractedData: {
          invoiceFrom: profile.legalName,
          billTo: "COMETS INTERNATIONAL LIMITED",
          invoiceDate: issuedAt,
          currency,
          total: rawTotal.replace(/,/g, ""),
          paymentDetails: payoutAccountPaymentDetails(selectedAccount),
          invoiceFromMatchesProfile: true,
          billToMatchesComets: true,
        },
      });
      onUploaded(uploaded);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="invoice-upload-overlay" role="presentation">
      <form className="invoice-upload-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-upload-title" onSubmit={submit}>
        <header>
          <div>
            <span><Upload size={20} /></span>
            <div><h2 id="invoice-upload-title">上传 Invoice</h2><p>系统将识别 Invoice 内容并生成待确认记录。</p></div>
          </div>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="invoice-upload-fields">
          <label className="field">
            <span>Project name *</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
              {!availableContracts.length ? <option value="">暂无可上传 Invoice 的合同项目</option> : null}
              {availableContracts.map((contract) => (
                <option key={contract.id} value={contract.projectId}>{contract.projectName} · {contract.brand}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Payment information *</span>
            <select value={payoutAccountId} onChange={(event) => setPayoutAccountId(event.target.value)} required>
              {!payoutAccounts.length ? <option value="">暂无可用付款账户</option> : null}
              {payoutAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} · {account.currency} · {maskPayoutIdentifier(account)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="invoice-upload-reminder" role="note">
          <Info size={17} />
          <p><strong>请确认付款方式一致</strong>请选择与 Invoice 中 Payment information 一致的付款账户。若不一致，请先前往个人档案修改付款信息，或重新上传与所选账户一致的 Invoice。</p>
        </div>
        <label className={`invoice-file-dropzone ${file ? "has-file" : ""}`}>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setError("");
            }}
          />
          <Upload size={22} />
          <strong>{file ? file.name : "选择或拖入 Invoice 文件"}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF、PNG、JPG，最大 5MB"}</span>
        </label>
        {error ? <div className="signature-error" role="alert"><Info size={15} />{error}</div> : null}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button" disabled={submitting || !selectedContract || !selectedAccount || !file}>
            {submitting ? "识别并上传中" : "确认上传"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function InvoiceListPage() {
  const { invoices, profile } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedStatus = new URLSearchParams(location.search).get("status");
  const initialTab = ["PENDING_CONFIRMATION", "DRAFT_SIGNATURE", "PENDING_REVIEW", "CHANGES_REQUIRED", "APPROVED", "PAYMENT_FAILED", "PAID"].includes(requestedStatus || "")
    ? (requestedStatus === "DRAFT_SIGNATURE" ? "PENDING_CONFIRMATION" : requestedStatus) as InvoiceStatus
    : "ALL";
  const [tab, setTab] = useState<InvoiceStatus | "ALL">(initialTab);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<Invoice["channel"] | "ALL">("ALL");
  const [uploadOpen, setUploadOpen] = useState(false);
  const channelOptions = [...new Set(invoices.map((invoice) => invoice.channel))];
  const filtered = filterInvoiceList(invoices, query, tab, channel);
  const tabs: Array<InvoiceStatus | "ALL"> = ["ALL", "PENDING_CONFIRMATION", "PENDING_REVIEW", "CHANGES_REQUIRED", "APPROVED", "PAYMENT_FAILED", "PAID"];
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  return (
    <div className="page-stack">
      <PageHeading
        title="Invoice"
        subtitle="上传并核对 Invoice 识别结果，确认付款账户一致后提交审核。"
        action={<button type="button" className="primary-button invoice-upload-trigger" onClick={() => setUploadOpen(true)}><Upload size={16} />上传 Invoice</button>}
      />
      <section className="content-card">
        <div className="invoice-list-toolbar">
          <div className="invoice-tabs">
            {tabs.map((value) => (
              <button key={value} type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
                {value === "ALL" ? "全部" : INVOICE_STATUS[value].label}
                <span>{invoices.filter((item) => value === "ALL" || item.status === value || (value === "PENDING_CONFIRMATION" && item.status === "DRAFT_SIGNATURE")).length}</span>
              </button>
            ))}
          </div>
          <div className="invoice-toolbar-filters">
            <label className="invoice-search-field">
              <Search size={16} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 Invoice、关联项目"
                aria-label="搜索 Invoice 或关联项目"
              />
              {query ? (
                <button
                  type="button"
                  title="清除搜索"
                  aria-label="清除搜索"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              ) : null}
            </label>
            <label className="invoice-channel-filter">
              <WalletCards size={16} />
              <select
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as Invoice["channel"] | "ALL")
                }
                aria-label="筛选付款渠道"
              >
                <option value="ALL">全部渠道</option>
                {channelOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="invoice-list" role="table" aria-label="Invoice 列表">
          <div className="invoice-table-header" role="row">
            <span role="columnheader">Invoice</span>
            <span role="columnheader">关联项目</span>
            <span role="columnheader">渠道</span>
            <span role="columnheader">金额</span>
            <span role="columnheader">状态</span>
            <span role="columnheader">操作</span>
          </div>
          {filtered.map((invoice) => {
            const meta = INVOICE_STATUS[invoice.status];
            return (
              <article className="invoice-list-row" role="row" key={invoice.id}>
                <Link className="invoice-identity" role="cell" to={`/invoices/${invoice.id}`}>
                  <span className="resource-icon peach"><ReceiptText size={17} /></span>
                  <span><strong>{invoice.id}</strong><small>{invoice.issuedAt}</small></span>
                </Link>
                <div className="invoice-project" role="cell"><strong>{invoice.projectName}</strong><span>{invoice.brand}</span></div>
                <div className="invoice-channel" role="cell">{invoice.channel}</div>
                <div className="invoice-amount" role="cell"><strong>{invoice.amount}</strong><span>{invoice.updatedAt}</span></div>
                <div className="invoice-status-cell" role="cell"><StatusBadge label={meta.label} tone={meta.tone} /></div>
                <div className="invoice-row-actions" role="cell">
                  <Link to={`/invoices/${invoice.id}`} title={`查看 ${invoice.id}`}><Eye size={15} /><span>查看</span></Link>
                  <button type="button" title={`下载 ${invoice.id}`} onClick={() => downloadInvoiceDocument(invoice)}><FileDown size={15} /><span>下载</span></button>
                </div>
              </article>
            );
          })}
          {!filtered.length ? (
            <EmptyState
              title={query.trim() ? "未找到匹配的 Invoice" : "暂无 Invoice"}
              copy={query.trim() ? "请尝试搜索其他 Invoice 编号或关联项目。" : "当前筛选条件下没有记录。"}
            />
          ) : null}
        </div>
      </section>
      {uploadOpen ? (
        <InvoiceUploadModal
          invoices={invoices}
          profile={profile}
          onClose={() => setUploadOpen(false)}
          onUploaded={(invoice) => {
            setUploadOpen(false);
            navigate(`/invoices/${invoice.id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function InvoiceDetailPage({ adminView = false }: { adminView?: boolean }) {
  const { id, creatorId } = useParams();
  const { invoices, profile, signInvoice, updateInvoice, selectInvoicePayoutAccount } = useApp();
  const adminCreator = useAdminCreatorDetail(
    adminView ? creatorId : undefined,
  );
  const navigate = useNavigate();
  const invoice = adminView
    ? adminCreator.detail?.invoices.find((item) => item.id === id)
    : invoices.find((item) => item.id === id);
  const currentProfile = adminCreator.detail?.profile || profile;
  const backTo = adminView ? "/admin/invoices" : "/invoices";
  const canCreatorAct = !adminView;
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueSuccessOpen, setIssueSuccessOpen] = useState(false);
  const [viewerExpanded, setViewerExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "danger">("success");
  const [issueType, setIssueType] = useState("付款项目有误");
  const [submittedIssueType, setSubmittedIssueType] = useState("");
  const [issueDetails, setIssueDetails] = useState("");
  const [detailTab, setDetailTab] = useState<"SUMMARY" | "PAYOUT" | "PROCESS">("SUMMARY");

  useEffect(() => {
    if (!viewerExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [viewerExpanded]);

  if (adminView && (adminCreator.loading || !adminCreator.detail || !invoice)) {
    return (
      <AdminBusinessDetailFallback
        backTo={backTo}
        loading={adminCreator.loading}
        error={adminCreator.error}
        resourceName="Invoice"
      />
    );
  }
  if (!invoice) {
    return (
      <div className="page-stack">
        <BackLink to="/invoices">返回 Invoice 列表</BackLink>
        <EmptyState title="Invoice 不存在" copy="该记录可能已被移除，或当前账号无权查看。" />
      </div>
    );
  }
  const meta = INVOICE_STATUS[invoice.status];
  const isAwaitingSignature = shouldShowInvoicePreSigningControls(
    invoice.status,
  );
  const paymentIssue = invoice.paymentIssue;
  const isPaymentRepair = invoice.status === "PAYMENT_FAILED" && Boolean(paymentIssue);
  const paymentIssueResolved = Boolean(paymentIssue?.resolvedAt);
  const isPaymentCorrectionReview =
    invoice.status === "PENDING_REVIEW" &&
    Boolean(paymentIssue?.resubmittedAt);
  const [amountCurrency = currentProfile.payout.currency || "USD", amountTotal = "0"] =
    invoice.amount.split(/\s+/, 2);
  const extractedData = invoice.extractedData || {
    invoiceFrom: currentProfile.legalName,
    billTo: "COMETS INTERNATIONAL LIMITED",
    invoiceDate: invoice.issuedAt,
    currency: amountCurrency,
    total: amountTotal.replace(/,/g, ""),
    paymentDetails: payoutAccountPaymentDetails(currentProfile.payout),
    invoiceFromMatchesProfile: true,
    billToMatchesComets: true,
  };
  const usablePayoutAccounts = currentProfile.payoutAccounts.filter(isPayoutAccountUsable);
  const selectedPayoutAccount =
    usablePayoutAccounts.find((account) => account.id === invoice.payoutAccountId) ||
    usablePayoutAccounts.find((account) => account.id === currentProfile.defaultPayoutAccountId) ||
    currentProfile.payout;
  const paymentComparison = compareInvoicePaymentDetails(
    extractedData.paymentDetails,
    selectedPayoutAccount,
  );
  const invoiceFromMatchesProfile =
    normalizeInvoiceIdentity(extractedData.invoiceFrom) ===
    normalizeInvoiceIdentity(currentProfile.legalName);
  const billToMatchesComets =
    normalizeInvoiceIdentity(extractedData.billTo) ===
    normalizeInvoiceIdentity("COMETS INTERNATIONAL LIMITED");
  const channelId = `${currentProfile.social.platform} · ${currentProfile.social.handle}`;

  const transition = async (status: InvoiceStatus, message: string) => {
    setBusy(true);
    try {
      await updateInvoice(invoice.id, status);
      setNoticeTone("success");
      setNotice(message);
    } catch (caught) {
      setNoticeTone("danger");
      setNotice(caught instanceof Error ? caught.message : "操作失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const sign = async (signature: InvoiceSignature) => {
    setBusy(true);
    try {
      await signInvoice(invoice.id, signature);
      setNoticeTone("success");
      setNotice("Invoice 已签署并提交审核");
    } catch (caught) {
      setNoticeTone("danger");
      setNotice(caught instanceof Error ? caught.message : "暂时无法完成签署");
    } finally {
      setBusy(false);
    }
  };

  const timeline: Array<{
    label: string;
    state: "complete" | "current" | "error" | "pending";
    time: string;
  }> = [
    { label: "上传待确认", state: invoice.status === "PENDING_CONFIRMATION" ? "current" : "complete", time: invoice.processHistory?.[0]?.occurredAt ? new Date(invoice.processHistory[0].occurredAt).toLocaleString("zh-CN", { hour12: false }) : invoice.issuedAt },
    {
      label: "待审核",
      state: invoice.status === "PENDING_REVIEW" ? "current" : ["CHANGES_REQUIRED", "APPROVED", "PAYMENT_FAILED", "PAID"].includes(invoice.status) ? "complete" : "pending",
      time: invoice.status === "PENDING_REVIEW" ? "审核中" : ["CHANGES_REQUIRED", "APPROVED", "PAYMENT_FAILED", "PAID"].includes(invoice.status) ? "已处理" : "待开始",
    },
    {
      label: "待修改",
      state: invoice.status === "CHANGES_REQUIRED" ? "error" : "pending",
      time: invoice.status === "CHANGES_REQUIRED" ? invoice.rejectedReason || "审核账号或系统已退回" : "未触发",
    },
    {
      label: "待付款",
      state: invoice.status === "APPROVED" ? "current" : ["PAYMENT_FAILED", "PAID"].includes(invoice.status) ? "complete" : "pending",
      time: invoice.status === "APPROVED" ? "等待付款" : ["PAYMENT_FAILED", "PAID"].includes(invoice.status) ? "已进入付款" : "待开始",
    },
    {
      label: invoice.status === "PAYMENT_FAILED" ? "付款异常" : "已付款",
      state: invoice.status === "PAID" ? "complete" : invoice.status === "PAYMENT_FAILED" ? "error" : "pending",
      time: invoice.status === "PAID" ? invoice.updatedAt : invoice.status === "PAYMENT_FAILED" ? paymentIssue?.message || "付款处理发生异常" : "待开始",
    },
  ];

  const submitIssue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedIssueType(issueType);
    setIssueOpen(false);
    setIssueSuccessOpen(true);
    setIssueDetails("");
  };

  return (
    <div className="page-stack">
      <BackLink to={backTo}>返回 Invoice 列表</BackLink>
      <PageHeading
        title={invoice.id}
        subtitle={`${channelId} · ${invoice.projectName}`}
        action={<button type="button" className="secondary-button" onClick={() => downloadInvoiceDocument(invoice)}><Download size={15} />下载 PDF</button>}
      />
      {notice ? <div className={`form-alert ${noticeTone}`}><CheckCircle2 size={17} />{notice}</div> : null}
      {!invoice.document ? (
        <div className="invoice-prototype-notice" role="note">
          <Info size={16} />
          <p><strong>原型说明</strong>此历史记录仍使用系统示例文件；新上传的 Invoice 将直接展示对应文件及识别结果。</p>
        </div>
      ) : null}
      <section className="invoice-detail-metrics" aria-label="Invoice 概览">
        <article>
          <span>当前状态</span>
          <strong><i className={`invoice-metric-accent tone-${meta.tone}`} />{meta.label}</strong>
          <small>{meta.description}</small>
        </article>
        <article>
          <span>Invoice 金额</span>
          <strong>{invoice.amount}</strong>
          <small>{extractedData.currency} · OCR 自动识别</small>
        </article>
        <article>
          <span>Invoice 类型</span>
          <strong>{invoice.invoiceType === "INTERNAL_CONTRACT" ? "内部合同" : "外部合同"}</strong>
          <small>{invoice.invoiceType === "INTERNAL_CONTRACT" ? "COMETS 内部项目" : "达人外部合同项目"}</small>
        </article>
      </section>
      {isPaymentRepair && paymentIssue && !paymentIssueResolved ? (
        <section className="payment-issue-alert" role="alert">
          <span className="payment-issue-alert-icon"><Info size={18} /></span>
          <div className="payment-issue-alert-content">
            <div>
              <strong>付款信息校验未通过</strong>
              <span>付款流程已暂停，请修正后提交审核</span>
            </div>
            <dl>
              <div><dt>错误字段</dt><dd>{paymentIssue.fieldLabel}</dd></div>
              <div><dt>当前信息</dt><dd>{paymentIssue.maskedValue}</dd></div>
            </dl>
            <p>{paymentIssue.message}</p>
            <ol>
              <li>前往个人档案修改上述付款信息</li>
              <li>完成 Airwallex 校验并保存修改</li>
              <li>返回本页提交审核</li>
            </ol>
          </div>
        </section>
      ) : isPaymentRepair && paymentIssueResolved ? (
        <div className="form-alert success">
          <CheckCircle2 size={17} />
          <div>
            <strong>付款信息已更新</strong>
            <p>错误字段已通过 Airwallex 校验，请点击“提交审核”继续处理。</p>
          </div>
        </div>
      ) : invoice.rejectedReason ? (
        <div className="form-alert danger"><Info size={17} /><div><strong>处理异常原因</strong><p>{invoice.rejectedReason}</p></div></div>
      ) : null}
      {isAwaitingSignature ? (
        <div className="invoice-verification-notice" role="note">
          <Info size={18} />
          <div>
            <strong>签署前请仔细核对 Invoice 信息</strong>
            <p>请确认付款项目、收款信息、金额及币种准确无误；如有疑问，请先通过“Invoice 信息有误”反馈，确认无误后再签署。</p>
            <p className="invoice-verification-responsibility">签署即表示您已确认上述信息。因信息核对疏漏导致的付款失败、退汇及相关手续费等后果，将由您自行承担。</p>
          </div>
        </div>
      ) : null}
      <div className="document-layout">
        <section className={`invoice-viewer-card ${viewerExpanded ? "is-expanded" : ""}`}>
          <header className="invoice-viewer-toolbar">
            <div>
              <span className="invoice-viewer-icon"><FileText size={18} /></span>
              <span><strong>Invoice 全文</strong><small>{invoice.document?.name || "INV-20260723-001-Alex-Ruiz.pdf"} · 1页</small></span>
            </div>
            <div className="invoice-viewer-actions">
              <button
                type="button"
                className="invoice-expand-button"
                title={viewerExpanded ? "退出放大查看" : "放大查看 Invoice"}
                aria-pressed={viewerExpanded}
                onClick={() => setViewerExpanded((expanded) => !expanded)}
              >
                {viewerExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                {viewerExpanded ? "退出放大" : "放大查看"}
              </button>
              <button
                type="button"
                className="invoice-download-button"
                title="下载可打印 Invoice"
                onClick={() => downloadInvoiceDocument(invoice)}
              >
                <Download size={15} />下载PDF
              </button>
            </div>
          </header>
          <div className="invoice-document-stage">
            <article className={`invoice-paper invoice-source-paper ${invoice.document ? "uploaded-invoice-paper" : ""}`}>
              {invoice.document?.previewUrl && invoice.document.mimeType === "application/pdf" ? (
                <iframe className="invoice-uploaded-pdf" src={invoice.document.previewUrl} title={`${invoice.id} Invoice 文件`} />
              ) : (
                <img
                  className="invoice-source-image"
                  src={invoice.document?.previewUrl || "/INV-20260723-001-Alex-Ruiz-page-1.png"}
                  alt={`${invoice.id} Invoice 全文`}
                />
              )}
              {invoice.signature ? (
                <img
                  className="invoice-source-signature"
                  src={invoice.signature.dataUrl}
                  alt={`${invoice.signature.signerName} 的签名`}
                />
              ) : null}
            </article>
          </div>
        </section>
        <aside className="document-sidebar">
          <section className="invoice-inspection-card">
            <div className="invoice-inspection-tabs" role="tablist" aria-label="Invoice 详情信息">
              {([
                ["SUMMARY", "Invoice 摘要"],
                ["PAYOUT", `收款账户${paymentComparison.matches ? "" : " · 待处理"}`],
                ["PROCESS", "处理状态"],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={detailTab === value} className={detailTab === value ? "active" : ""} onClick={() => setDetailTab(value)}>{label}</button>
              ))}
            </div>
            {detailTab === "SUMMARY" ? (
              <div className="invoice-summary-panel" role="tabpanel">
                <header><span className="resource-icon purple"><FileCheck2 size={17} /></span><div><h2>结构化 Invoice 信息</h2><p>系统识别后自动回填，请逐项核对</p></div></header>
                <dl>
                  <div><dt>Invoice 编号</dt><dd><strong>{invoice.id}</strong><small>系统生成</small></dd></div>
                  <div><dt>Invoice From</dt><dd><strong>{extractedData.invoiceFrom}</strong><small className={invoiceFromMatchesProfile ? "match-ok" : "match-error"}>{invoiceFromMatchesProfile ? "与 Real Name 一致" : `与档案 Real Name（${currentProfile.legalName}）不一致`}</small></dd></div>
                  <div><dt>Bill to</dt><dd><strong>{extractedData.billTo}</strong><small className={billToMatchesComets ? "match-ok" : "match-error"}>{billToMatchesComets ? "COMETS 主体校验通过" : "应为 COMETS INTERNATIONAL LIMITED"}</small></dd></div>
                  <div><dt>Project</dt><dd><strong>{invoice.projectName}</strong><small>{invoice.projectId}</small></dd></div>
                  <div><dt>Invoice date</dt><dd><strong>{extractedData.invoiceDate}</strong><small>已同步至 Invoice 日期</small></dd></div>
                  <div><dt>Currency / Total</dt><dd><strong>{extractedData.currency} {extractedData.total}</strong><small>已同步至币种与金额</small></dd></div>
                </dl>
              </div>
            ) : null}
            {detailTab === "PAYOUT" ? (
              <div className="invoice-payout-panel" role="tabpanel">
                <header>
                  <div><h2>收款账户比对</h2><p>仅比较 Invoice Payment details 中识别到的字段</p></div>
                  <StatusBadge label={paymentComparison.matches ? "信息一致" : "账户不匹配"} tone={paymentComparison.matches ? "success" : "danger"} />
                </header>
                {canCreatorAct ? (
                  <label className="field invoice-account-select"><span>付款账户</span><select value={selectedPayoutAccount.id} onChange={async (event) => { await selectInvoicePayoutAccount(invoice.id, event.target.value); setNoticeTone("success"); setNotice("付款账户已更新，系统已重新完成字段比对"); }}>{usablePayoutAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency} · {maskPayoutIdentifier(account)}</option>)}</select></label>
                ) : null}
                {!paymentComparison.matches ? (
                  <div className="invoice-account-mismatch" role="alert"><Info size={17} /><div><strong>付款账号不匹配</strong><p>请选择新的付款账户，或更换为与所选账户 Payment information 一致的 Invoice。也可前往个人档案修改付款信息后重新比对。</p>{canCreatorAct ? <div><Link to="/profile#payout-information">前往个人档案</Link><Link to="/invoices">重新上传 Invoice</Link></div> : null}</div></div>
                ) : (
                  <div className="invoice-account-match"><CheckCircle2 size={17} /><span>已识别字段均与所选付款账户一致；Invoice 未提供的字段已从该账户补齐。</span></div>
                )}
                <dl className="invoice-payment-compare-list">
                  {Object.entries(paymentComparison.merged).filter(([, value]) => value).map(([key, value]) => {
                    const compared = paymentComparison.fields.find((field) => field.key === key);
                    return <div key={key}><dt>{PAYMENT_DETAIL_LABELS[key] || key}<small>{compared ? "Invoice 已识别" : "付款账户补充"}</small></dt><dd><strong>{value}</strong><span className={compared?.matches === false ? "match-error" : "match-ok"}>{compared?.matches === false ? "不一致" : <Check size={12} />}</span></dd></div>;
                  })}
                </dl>
              </div>
            ) : null}
            {detailTab === "PROCESS" ? (
              <div className="invoice-process-panel" role="tabpanel">
                <header><div><h2>处理状态</h2><p>保留上传、审核、修改与付款的完整记录</p></div><StatusBadge label={meta.label} tone={meta.tone} /></header>
                <div className="compact-timeline invoice-full-timeline">
                  {timeline.map((item) => <div className={item.state} key={item.label}><span>{item.state === "complete" ? <Check size={13} /> : item.state === "current" ? <Clock3 size={12} /> : item.state === "error" ? <Info size={13} /> : null}</span><div><strong>{item.label}</strong><small>{item.time}</small></div></div>)}
                </div>
                {invoice.processHistory?.length ? <div className="invoice-history-log"><h3>操作记录</h3>{invoice.processHistory.map((event) => <article key={event.id}><span>{event.label}</span><div><strong>{event.actor}</strong><small>{new Date(event.occurredAt).toLocaleString("zh-CN", { hour12: false })}</small>{event.reason ? <p>{event.reason}</p> : null}</div></article>)}</div> : null}
                {invoice.status === "PENDING_REVIEW" ? <div className="review-note"><Clock3 size={17} /><span>{isPaymentCorrectionReview ? "付款资料修正已提交，审核从资料审核节点重新开始" : "预计 1-2 个工作日内完成审核"}</span></div> : null}
                {invoice.status === "CHANGES_REQUIRED" ? <div className="payment-repair-note"><Info size={17} /><span>{invoice.rejectedReason || "审核账号或系统要求修改 Invoice 信息"}</span></div> : null}
                <div className="invoice-action-stack">
                  {canCreatorAct && invoice.status === "PENDING_CONFIRMATION" ? <button className="primary-button" type="button" disabled={busy || !paymentComparison.matches || !invoiceFromMatchesProfile || !billToMatchesComets} onClick={() => transition("PENDING_REVIEW", "Invoice 已确认并提交审核")}><FileCheck2 size={16} />确认并提交审核</button> : null}
                  {canCreatorAct && invoice.status === "PAYMENT_FAILED" && !paymentIssueResolved ? <button className="payment-edit-button" type="button" onClick={() => navigate(`/profile?repairInvoice=${invoice.id}&field=${paymentIssue?.fieldKey || "account_number"}#payout-information`)}><Pencil size={16} />修改付款信息</button> : null}
                  {canCreatorAct && invoice.status === "PAYMENT_FAILED" ? <button className="payment-retry-button" type="button" disabled={busy || !paymentIssueResolved} onClick={() => transition("PENDING_REVIEW", "付款信息已提交审核，当前进入资料审核")}><FileCheck2 size={16} />提交审核</button> : null}
                  {canCreatorAct && isAwaitingSignature ? <button className="invoice-issue-button" type="button" onClick={() => setIssueOpen(true)}><Info size={16} />Invoice 信息有误</button> : null}
                  {canCreatorAct && isAwaitingSignature ? <button className="primary-button" disabled={busy} onClick={() => setSignatureOpen(true)}><PenLine size={16} />签署 Invoice</button> : null}
                  <button className="invoice-action-download-button" type="button" onClick={() => downloadInvoiceDocument(invoice)}><Download size={16} />下载 Invoice</button>
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
      {canCreatorAct && signatureOpen ? (
        <SignatureModal
          invoice={invoice}
          signerName={currentProfile.legalName}
          payoutAccountName={currentProfile.payout.accountHolder || currentProfile.legalName}
          onClose={() => setSignatureOpen(false)}
          onConfirm={sign}
        />
      ) : null}
      {canCreatorAct && issueOpen && isAwaitingSignature ? (
        <div className="invoice-issue-modal-overlay" role="presentation">
          <form className="invoice-issue-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-issue-title" onSubmit={submitIssue}>
            <header>
              <div>
                <span className="invoice-issue-modal-icon"><Info size={19} /></span>
                <div><h2 id="invoice-issue-title">反馈 Invoice 信息问题</h2><p>请说明不准确的信息，工作人员会尽快核查。</p></div>
              </div>
              <button type="button" className="icon-button" title="关闭" onClick={() => setIssueOpen(false)}><X size={18} /></button>
            </header>
            <label className="field">
              <span>问题类型</span>
              <select value={issueType} onChange={(event) => setIssueType(event.target.value)}>
                <option>付款项目有误</option>
                <option>付款信息有误</option>
                <option>金额或币种有误</option>
                <option>其他信息有误</option>
              </select>
            </label>
            <label className="field">
              <span>问题说明</span>
              <textarea value={issueDetails} onChange={(event) => setIssueDetails(event.target.value)} placeholder="请描述需要核查或修改的内容" required />
            </label>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setIssueOpen(false)}>取消</button>
              <button type="submit" className="primary-button" disabled={!issueDetails.trim()}>提交反馈</button>
            </footer>
          </form>
        </div>
      ) : null}
      {issueSuccessOpen ? (
        <div className="profile-save-overlay" role="presentation">
          <section
            className="profile-save-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-issue-success-title"
            aria-describedby="invoice-issue-success-description"
          >
            <span className="profile-save-icon success">
              <CheckCircle2 size={25} />
            </span>
            <h2 id="invoice-issue-success-title">反馈提交成功</h2>
            <p id="invoice-issue-success-description">
              “{submittedIssueType}”已提交，工作人员会尽快核查并与您同步处理结果。
            </p>
            <button type="button" className="primary-button" onClick={() => setIssueSuccessOpen(false)}>
              知道了
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}

type PayoutAccountDialogState = {
  kind: "DELETE" | "DISABLE" | "REPLACE_DEFAULT";
  accountId: string;
  operation: "DELETE" | "DISABLE";
  replacementId: string;
};

type ProfileEditMode = "PROFILE" | "PAYOUT_ACCOUNT" | null;

const PAYOUT_CHANNELS: Array<{
  id: PayoutAccount["channel"];
  label: string;
  isAvailable: boolean;
}> = [
  { id: "AIRWALLEX", label: "Airwallex", isAvailable: true },
  { id: "PAYPAL", label: "PayPal", isAvailable: false },
  { id: "PAYERMAX", label: "PayerMax", isAvailable: false },
];

function ProfilePage() {
  const {
    profile,
    invoices,
    saveProfile,
    resolveInvoicePaymentIssue,
  } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const repairParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const repairInvoiceId = repairParams.get("repairInvoice");
  const repairFieldKey = repairParams.get("field") || "";
  const repairInvoice = invoices.find((item) => item.id === repairInvoiceId);
  const repairIssue = repairInvoice?.paymentIssue;
  const hasRepairContext = Boolean(repairInvoiceId && repairIssue);
  const isRepairFlow = Boolean(
    repairInvoiceId &&
      repairInvoice?.status === "PAYMENT_FAILED" &&
      repairIssue &&
      !repairIssue.resolvedAt,
  );
  const payoutConfigRef = useRef<HTMLElement>(null);
  const payoutDetailRef = useRef<HTMLElement>(null);
  const dialogCancelRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(() => normalizePayoutProfile(profile));
  const [editMode, setEditMode] = useState<ProfileEditMode>(
    repairInvoiceId ? "PAYOUT_ACCOUNT" : null,
  );
  const editing = editMode !== null;
  const profileEditing = editMode === "PROFILE";
  const payoutAccountEditing = editMode === "PAYOUT_ACCOUNT";
  const [activePayoutAccountId, setActivePayoutAccountId] = useState(
    profile.defaultPayoutAccountId || profile.payout.id,
  );
  const [selectedPayoutChannel, setSelectedPayoutChannel] = useState<
    PayoutAccount["channel"]
  >(profile.payout.channel || "AIRWALLEX");
  const [openPayoutMenuId, setOpenPayoutMenuId] = useState("");
  const [payoutDialog, setPayoutDialog] =
    useState<PayoutAccountDialogState | null>(null);
  const [payoutToast, setPayoutToast] = useState("");
  const [condition, setCondition] = useState<AirwallexSchemaCondition>({
    bankCountryCode: airwallexCountryCode(profile.payout.bankCountry),
    accountCurrency: profile.payout.currency,
    entityType: profile.payout.beneficiaryType,
    transferMethod: profile.payout.transferMethod,
  });
  const [schema, setSchema] = useState<AirwallexFormSchema | null>(null);
  const [schemaValues, setSchemaValues] = useState<Record<string, string>>({
    ...profile.payout.schemaValues,
    account_name: profile.payout.accountHolder,
    account_number: profile.payout.accountNumber,
    bank_name: profile.payout.bankName,
    swift_code:
      profile.payout.schemaValues.swift_code || profile.payout.swiftCode,
  });
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [schemaFieldErrors, setSchemaFieldErrors] = useState<
    Record<string, string>
  >({});
  const [schemaTouched, setSchemaTouched] = useState<Record<string, boolean>>(
    {},
  );
  const [payoutAccountAliasTouched, setPayoutAccountAliasTouched] =
    useState(false);
  const [saving, setSaving] = useState(false);
  const [accountMutationSaving, setAccountMutationSaving] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "validating" | "success" | "error"
  >("idle");
  const [saveError, setSaveError] = useState("");
  const [adminCorrections, setAdminCorrections] = useState<CorrectionRequest[]>([]);
  const emailInvalid =
    profileEditing &&
    draft.email.trim().length > 0 &&
    !isValidEmailAddress(draft.email);

  const resetFromProfile = (nextProfile: UserProfile) => {
    const normalized = normalizePayoutProfile(nextProfile);
    setDraft(normalized);
    setActivePayoutAccountId(normalized.defaultPayoutAccountId);
    setSelectedPayoutChannel((current) =>
      PAYOUT_CHANNELS.some((channel) => channel.id === current)
        ? current
        : normalized.payout.channel,
    );
    setCondition({
      bankCountryCode: airwallexCountryCode(normalized.payout.bankCountry),
      accountCurrency: normalized.payout.currency,
      entityType: normalized.payout.beneficiaryType,
      transferMethod: normalized.payout.transferMethod,
    });
    setSchemaValues({
      ...normalized.payout.schemaValues,
      account_name: normalized.payout.accountHolder,
      account_number: normalized.payout.accountNumber,
      bank_name: normalized.payout.bankName,
      swift_code:
        normalized.payout.schemaValues.swift_code ||
        normalized.payout.swiftCode,
    });
    setSchemaFieldErrors({});
    setSchemaTouched({});
    setPayoutAccountAliasTouched(false);
  };

  useEffect(() => resetFromProfile(profile), [profile]);

  useEffect(() => {
    const closeMenuOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (
        openPayoutMenuId &&
        target instanceof Element &&
        !target.closest("[data-payout-menu]")
      ) {
        setOpenPayoutMenuId("");
      }
    };
    const closeOverlaysOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (payoutDialog) {
        setPayoutDialog(null);
        return;
      }
      setOpenPayoutMenuId("");
    };
    document.addEventListener("mousedown", closeMenuOnOutsideClick);
    document.addEventListener("keydown", closeOverlaysOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenuOnOutsideClick);
      document.removeEventListener("keydown", closeOverlaysOnEscape);
    };
  }, [openPayoutMenuId, payoutDialog]);

  useEffect(() => {
    if (!openPayoutMenuId) return;
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          `[data-payout-menu="${openPayoutMenuId}"] [role="menuitem"]`,
        )
        ?.focus();
    });
  }, [openPayoutMenuId]);

  useEffect(() => {
    if (!payoutDialog) return;
    window.requestAnimationFrame(() => dialogCancelRef.current?.focus());
  }, [payoutDialog]);

  useEffect(() => {
    if (!payoutToast) return;
    const timer = window.setTimeout(() => setPayoutToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [payoutToast]);

  useEffect(() => {
    services.corrections
      .list(profile.id)
      .then((result) =>
        setAdminCorrections(result.data.filter((item) => item.status === "OPEN")),
      );
  }, [profile.id]);

  useEffect(() => {
    if (!isRepairFlow) return;
    setEditMode("PAYOUT_ACCOUNT");
    if (!schemaLoading && schema) {
      window.requestAnimationFrame(() => {
        payoutDetailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }
  }, [isRepairFlow, schema, schemaLoading]);

  useEffect(() => {
    let active = true;
    setSchemaLoading(true);
    setSchemaError("");
    setSchemaFieldErrors({});
    setSchemaTouched({});
    services.payout
      .getFormSchema(condition)
      .then((result) => {
        if (!active) return;
        const previousKeys = new Set(
          (schema?.fields || []).map((field) => field.key),
        );
        const nextKeys = new Set(result.data.fields.map((field) => field.key));
        const obsoleteKeys = new Set(
          [...previousKeys].filter((key) => !nextKeys.has(key)),
        );
        setSchema(result.data);
        setSchemaValues((current) =>
          reconcileAirwallexSchemaValues(result.data, current),
        );
        setDraft((current) => ({
          ...current,
          payout: {
            ...current.payout,
            schemaValues: Object.fromEntries(
              Object.entries(current.payout.schemaValues).filter(
                ([key]) => !obsoleteKeys.has(key),
              ),
            ),
          },
        }));
        setSchemaLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSchema(null);
        setSchemaError("付款信息加载失败，请重新选择付款场景。");
        setSchemaLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    condition.accountCurrency,
    condition.bankCountryCode,
    condition.entityType,
    condition.transferMethod,
  ]);

  const selectedCountry =
    AIRWALLEX_COUNTRIES.find(
      (item) => item.value === condition.bankCountryCode,
    )?.label || condition.bankCountryCode;

  const updateCondition = (patch: Partial<AirwallexSchemaCondition>) => {
    const nextCondition = { ...condition, ...patch };
    const nextCountry =
      AIRWALLEX_COUNTRIES.find(
        (item) => item.value === nextCondition.bankCountryCode,
      )?.label || nextCondition.bankCountryCode;
    setCondition(nextCondition);
    setDraft((current) => ({
      ...current,
      payout: {
        ...current.payout,
        bankCountry: nextCountry,
        currency: nextCondition.accountCurrency,
        beneficiaryType: nextCondition.entityType,
        transferMethod: nextCondition.transferMethod,
        status: "DRAFT",
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    setSaveState("validating");
    setSaveError("");
    try {
      if (profileEditing && !draft.email.trim()) {
        throw new Error("请完成必填字段：联系邮箱 / Email");
      }
      if (profileEditing && !isValidEmailAddress(draft.email)) {
        throw new Error("请输入有效的联系邮箱地址");
      }
      const payoutAccountAliasError = payoutAccountEditing
        ? validatePayoutAccountAlias(draft.payout.name)
        : "";
      if (payoutAccountAliasError) {
        setPayoutAccountAliasTouched(true);
        throw new Error(payoutAccountAliasError);
      }
      if (!schema || schemaLoading) {
        throw new Error("请等待付款信息加载完成后再保存");
      }
      const fieldErrors = validateAirwallexSchemaValues(schema, schemaValues);
      if (Object.keys(fieldErrors).length > 0) {
        setSchemaFieldErrors(fieldErrors);
        setSchemaTouched(
          Object.fromEntries(schema.fields.map((field) => [field.key, true])),
        );
        throw new Error("请检查 Airwallex 付款信息中的标记字段");
      }
      if (
        isRepairFlow &&
        repairIssue &&
        (schemaValues[repairIssue.fieldKey] || "").trim() ===
          repairIssue.invalidValue
      ) {
        throw new Error(`请修改${repairIssue.fieldLabel.split(" / ")[0]}后再保存`);
      }
      await services.payout.validateBeneficiary(schema, schemaValues);
      const beneficiary = await services.payout.createBeneficiary(
        condition,
        schemaValues,
      );
      const supplementalValues = Object.fromEntries(
        buildProfileSupplementalFields(draft).map((field) => [
          field.key,
          draft.payout.schemaValues[field.key] || "",
        ]),
      );
      const validatedAccount: PayoutAccount = {
        ...draft.payout,
        name: payoutAccountEditing
          ? normalizePayoutAccountAlias(draft.payout.name)
          : draft.payout.name,
        provider: "Airwallex",
        channel: "AIRWALLEX",
        accountHolder: schemaValues.account_name || "",
        bankCountry: selectedCountry,
        bankName: schemaValues.bank_name || "",
        currency: condition.accountCurrency,
        beneficiaryType: condition.entityType,
        transferMethod: condition.transferMethod,
        accountNumber: schemaValues.account_number || "",
        swiftCode: schemaValues.swift_code || "",
        status: beneficiary.data.status,
        statusBeforeDisable: undefined,
        disabledAt: undefined,
        beneficiaryId: beneficiary.data.beneficiaryId,
        schemaValues: {
          ...supplementalValues,
          ...schemaValues,
        },
      };
      const accountDraft = normalizePayoutProfile(draft);
      const nextAccounts = accountDraft.payoutAccounts.some(
        (account) => account.id === validatedAccount.id,
      )
        ? accountDraft.payoutAccounts.map((account) =>
            account.id === validatedAccount.id ? validatedAccount : account,
          )
        : [...accountDraft.payoutAccounts, validatedAccount];
      const validatedDraft = syncPayoutAccounts(
        {
          ...draft,
          social: profileEditing
            ? {
                ...draft.social,
                verificationStatus: "VERIFIED",
              }
            : draft.social,
        },
        nextAccounts,
        draft.defaultPayoutAccountId || validatedAccount.id,
      );
      await saveProfile(validatedDraft);
      if (profileEditing) setAdminCorrections([]);
      if (isRepairFlow && repairInvoiceId && repairIssue) {
        await resolveInvoicePaymentIssue(
          repairInvoiceId,
          schemaValues[repairIssue.fieldKey] || "",
        );
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 650));
      setDraft(validatedDraft);
      setEditMode(null);
      setSaveState("success");
    } catch (caught) {
      if (caught instanceof AirwallexBeneficiaryValidationError) {
        setSchemaFieldErrors(caught.fieldErrors);
        setSchemaTouched(
          Object.fromEntries(
            Object.keys(caught.fieldErrors).map((key) => [key, true]),
          ),
        );
      }
      setSaveError(
        caught instanceof Error
          ? caught.message
          : "暂时无法保存，请检查资料后重试。",
      );
      setSaveState("error");
    } finally {
      setSaving(false);
    }
  };

  const updateSchemaField = (key: string, value: string) => {
    const nextValue = normalizeAirwallexSchemaValue(key, value);
    const nextValues = { ...schemaValues, [key]: nextValue };
    setSchemaValues(nextValues);
    if (schema && (schemaTouched[key] || schemaFieldErrors[key])) {
      const nextError = validateAirwallexSchemaValues(
        schema,
        nextValues,
      )[key];
      setSchemaFieldErrors((errors) => {
        const nextErrors = { ...errors };
        if (nextError) nextErrors[key] = nextError;
        else delete nextErrors[key];
        return nextErrors;
      });
    }
    setDraft((current) => ({
      ...current,
      payout: {
        ...current.payout,
        status: "DRAFT",
      },
    }));
  };

  const validateSchemaField = (key: string) => {
    if (!schema) return;
    const nextError = validateAirwallexSchemaValues(
      schema,
      schemaValues,
    )[key];
    setSchemaTouched((current) => ({ ...current, [key]: true }));
    setSchemaFieldErrors((current) => {
      const nextErrors = { ...current };
      if (nextError) nextErrors[key] = nextError;
      else delete nextErrors[key];
      return nextErrors;
    });
  };

  const supplementalFields = buildProfileSupplementalFields(draft);
  const platformProfiles = (
    draft.social.profileUrls?.length
      ? draft.social.profileUrls
      : [draft.social.profileUrl]
  ).map((url) => {
    const normalized = url.toLowerCase();
    const platform = normalized.includes("instagram")
      ? "Instagram"
      : normalized.includes("tiktok")
        ? "TikTok"
        : normalized.includes("youtube")
          ? "YouTube"
          : draft.social.platform;
    return {
      platform,
      url,
      accountName: getSocialAccountName(url, draft.social.handle),
    };
  });

  const cancelEditing = () => {
    resetFromProfile(profile);
    setOpenPayoutMenuId("");
    setEditMode(null);
    setSaveState("idle");
    setSaveError("");
    setSchemaError("");
    setSchemaFieldErrors({});
    setSchemaTouched({});
    setPayoutAccountAliasTouched(false);
  };

  const updateSupplementalField = (key: string, value: string) => {
    setDraft((current) => ({
      ...current,
      payout: {
        ...current.payout,
        status: "DRAFT",
        schemaValues: {
          ...current.payout.schemaValues,
          [key]: value,
        },
      },
    }));
  };

  const normalizedDraft = normalizePayoutProfile(draft);
  const payoutAccounts = normalizedDraft.payoutAccounts.map((account) =>
    payoutAccountEditing && account.id === activePayoutAccountId
      ? { ...account, name: draft.payout.name }
      : account,
  );
  const defaultPayoutAccount = payoutAccounts.find(
    (account) => account.id === normalizedDraft.defaultPayoutAccountId,
  );
  const usablePayoutAccounts = payoutAccounts.filter(isPayoutAccountUsable);
  const selectedPayoutAccounts = payoutAccountsForChannel(
    payoutAccounts,
    selectedPayoutChannel,
  );
  const selectedUsablePayoutAccounts =
    selectedPayoutAccounts.filter(isPayoutAccountUsable);
  const incompletePayoutAccounts = selectedPayoutAccounts.filter((account) =>
    ["DRAFT", "INCOMPLETE", "VALIDATION_FAILED", "PENDING_CONFIRMATION"].includes(
      account.status,
    ),
  );
  const selectedPayoutChannelConfig =
    PAYOUT_CHANNELS.find((channel) => channel.id === selectedPayoutChannel) ||
    PAYOUT_CHANNELS[0];
  const payoutDialogAccount = payoutDialog
    ? payoutAccounts.find((account) => account.id === payoutDialog.accountId)
    : undefined;
  const replacementAccounts = payoutDialogAccount
    ? payoutAccounts.filter(
        (account) =>
          account.id !== payoutDialogAccount.id &&
          isPayoutAccountUsable(account),
      )
    : [];

  const editPayoutAccount = (account: PayoutAccount) => {
    setOpenPayoutMenuId("");
    if (account.provider !== "Airwallex") {
      setPayoutToast(
        `${account.provider} 账户暂未开放，当前仅支持查看账户状态。`,
      );
      return;
    }
    const nextDraft = normalizePayoutProfile(draft);
    setDraft({
      ...nextDraft,
      payout: account,
    });
    setSelectedPayoutChannel(account.channel);
    setActivePayoutAccountId(account.id);
    setCondition({
      bankCountryCode: airwallexCountryCode(account.bankCountry),
      accountCurrency: account.currency,
      entityType: account.beneficiaryType,
      transferMethod: account.transferMethod,
    });
    setSchemaValues({
      ...account.schemaValues,
      account_name: account.accountHolder,
      account_number: account.accountNumber,
      bank_name: account.bankName,
      swift_code: account.schemaValues.swift_code || account.swiftCode,
    });
    setSchemaFieldErrors({});
    setSchemaTouched({});
    setPayoutAccountAliasTouched(false);
    setEditMode("PAYOUT_ACCOUNT");
    setSaveState("idle");
    window.requestAnimationFrame(() =>
      payoutConfigRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };

  const addAirwallexAccount = () => {
    const account: PayoutAccount = {
      id: `payout-awx-${Date.now()}`,
      name: "",
      provider: "Airwallex",
      channel: "AIRWALLEX",
      accountHolder: sanitizeEnglishAccountName(draft.legalName).trim(),
      bankCountry: selectedCountry,
      bankName: "",
      currency: condition.accountCurrency,
      beneficiaryType: condition.entityType,
      transferMethod: condition.transferMethod,
      accountNumber: "",
      swiftCode: "",
      status: "INCOMPLETE",
      beneficiaryId: undefined,
      linkages: {
        projectCount: 0,
        invoiceCount: 0,
        paymentBatchCount: 0,
        transactionCount: 0,
      },
      hasActivePayment: false,
      schemaValues: {
        account_name: sanitizeEnglishAccountName(draft.legalName).trim(),
      },
    };
    const current = normalizePayoutProfile(draft);
    setDraft({
      ...current,
      payout: account,
      payoutAccounts: [...current.payoutAccounts, account],
    });
    setSelectedPayoutChannel("AIRWALLEX");
    setActivePayoutAccountId(account.id);
    setSchemaValues({ ...account.schemaValues });
    setSchemaFieldErrors({});
    setSchemaTouched({});
    setPayoutAccountAliasTouched(false);
    setEditMode("PAYOUT_ACCOUNT");
    setSaveState("idle");
    window.requestAnimationFrame(() =>
      payoutConfigRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };

  const persistPayoutAccounts = async (
    accounts: PayoutAccount[],
    defaultAccountId: string,
    successMessage: string,
  ) => {
    setAccountMutationSaving(true);
    try {
      const nextProfile = syncPayoutAccounts(
        normalizePayoutProfile(profile),
        accounts,
        defaultAccountId,
      );
      await saveProfile(nextProfile);
      setPayoutDialog(null);
      setOpenPayoutMenuId("");
      setPayoutToast(successMessage);
    } catch (caught) {
      setPayoutToast(
        caught instanceof Error ? caught.message : "账户操作失败，请稍后重试。",
      );
    } finally {
      setAccountMutationSaving(false);
    }
  };

  const setDefaultPayoutAccount = (account: PayoutAccount) => {
    if (!isPayoutAccountUsable(account)) {
      setPayoutToast("仅已验证且未停用的账户可设为默认账户。");
      return;
    }
    void persistPayoutAccounts(
      payoutAccounts,
      account.id,
      `已将“${account.name}”设为默认付款账户`,
    );
  };

  const requestPayoutAccountRemoval = (account: PayoutAccount) => {
    const action = payoutAccountDestructiveAction(account);
    setOpenPayoutMenuId("");
    if (action === "LOCKED") {
      setPayoutToast("该账户正在处理中，完成后才能停用。");
      return;
    }
    const operation = action === "DELETE" ? "DELETE" : "DISABLE";
    setPayoutDialog({
      kind:
        account.id === normalizedDraft.defaultPayoutAccountId
          ? "REPLACE_DEFAULT"
          : operation,
      accountId: account.id,
      operation,
      replacementId: "",
    });
  };

  const confirmPayoutAccountMutation = () => {
    if (!payoutDialog || !payoutDialogAccount) return;
    let nextAccounts = payoutAccounts;
    let nextDefaultId = normalizedDraft.defaultPayoutAccountId;
    if (payoutDialog.kind === "REPLACE_DEFAULT") {
      if (!payoutDialog.replacementId) return;
      nextDefaultId = payoutDialog.replacementId;
    }
    if (payoutDialog.operation === "DELETE") {
      nextAccounts = payoutAccounts.filter(
        (account) => account.id !== payoutDialogAccount.id,
      );
      void persistPayoutAccounts(
        nextAccounts,
        nextDefaultId,
        "付款账户已删除",
      );
      return;
    }
    nextAccounts = payoutAccounts.map((account) =>
      account.id === payoutDialogAccount.id
        ? {
            ...account,
            statusBeforeDisable:
              account.status === "DISABLED" ? "VALIDATED" : account.status,
            status: "DISABLED",
            disabledAt: new Date().toISOString(),
          }
        : account,
    );
    void persistPayoutAccounts(
      nextAccounts,
      nextDefaultId,
      "付款账户已停用",
    );
  };

  const reactivatePayoutAccount = (account: PayoutAccount) => {
    const nextAccounts = payoutAccounts.map((item) =>
      item.id === account.id
        ? {
            ...item,
            status:
              item.statusBeforeDisable ||
              (item.beneficiaryId ? "VALIDATED" : "INCOMPLETE"),
            statusBeforeDisable: undefined,
            disabledAt: undefined,
          }
        : item,
    );
    void persistPayoutAccounts(
      nextAccounts,
      normalizedDraft.defaultPayoutAccountId,
      "付款账户已重新启用",
    );
  };

  return (
    <div className="page-stack profile-page">
      <PageHeading
        title="个人档案"
        subtitle="维护社媒账号、Invoice 联系资料和收款账户。"
        action={
          profileEditing ? (
            <div className="button-group">
              <button className="secondary-button" disabled={saving} onClick={cancelEditing}>取消</button>
              <button className="primary-button compact" disabled={saving || schemaLoading || Boolean(schemaError)} onClick={save}>{saving ? "校验中" : "保存修改"}</button>
            </div>
          ) : payoutAccountEditing ? (
            undefined
          ) : (
            <button className="secondary-button" onClick={() => { setEditMode("PROFILE"); setSaveState("idle"); setSaveError(""); }}><Pencil size={16} />编辑档案</button>
          )
        }
      />

      {adminCorrections.length ? (
        <section className="profile-admin-correction-banner" role="alert">
          <span><AlertCircle size={18} /></span>
          <div>
            <strong>管理员退回了 {adminCorrections.length} 项资料</strong>
            <ul>
              {adminCorrections.map((item) => (
                <li key={item.id}>
                  {item.fieldLabel}：{item.reason}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {isRepairFlow && repairInvoiceId && repairIssue ? (
        <section className="profile-payment-repair-banner" role="alert">
          <span><Info size={18} /></span>
          <div>
            <strong>正在修复 {repairInvoiceId} 的付款信息</strong>
            <p>发起付款时发现“{repairIssue.fieldLabel}”无法通过校验。请修改标记字段，完成 Airwallex 校验并保存后，再返回 Invoice 提交审核。</p>
          </div>
        </section>
      ) : null}

      <section className="profile-summary-banner">
        <span className="profile-avatar">{profile.displayName.slice(0, 1)}</span>
        <div className="profile-summary-copy">
          <div>
            <h2>{profile.displayName}</h2>
            <p>{profile.social.handle} · {profile.social.platform}</p>
          </div>
          {!profileEditing ? (
            <StatusBadge
              label={
                profile.social.verificationStatus === "VERIFIED"
                  ? "账号已认证"
                  : profile.social.verificationStatus === "CHANGES_REQUESTED"
                    ? "资料待修正"
                    : "认证中"
              }
              tone={
                profile.social.verificationStatus === "VERIFIED"
                  ? "success"
                  : profile.social.verificationStatus === "CHANGES_REQUESTED"
                    ? "danger"
                    : "amber"
              }
            />
          ) : null}
        </div>
        <span className="profile-id">ID {profile.id}</span>
      </section>

      <section className="profile-overview" aria-label="达人档案概览">
        <article><span>社媒账号</span><strong>{platformProfiles.length} 个</strong><small>{[...new Set(platformProfiles.map((item) => item.platform))].join(" · ")}</small></article>
        <article><span>Invoice 联系资料</span><strong>{draft.legalName ? "已完善" : "待完善"}</strong><small>{draft.email}</small></article>
        <article>
          <span>收款渠道</span>
          <strong>{[...new Set(payoutAccounts.filter((account) => account.status !== "DISABLED").map((account) => account.provider))].join(" · ") || "待添加"}</strong>
          <small>{payoutAccounts.length} 个账户 · {usablePayoutAccounts.length} 个可用</small>
        </article>
        <article>
          <span>默认付款账户</span>
          <strong>{defaultPayoutAccount?.name || "待设置"}</strong>
          <small>{defaultPayoutAccount ? payoutAccountSummary(defaultPayoutAccount) : "暂无可用于付款的账户"}</small>
        </article>
      </section>

      <div className="profile-sections">
        <section className="detail-card form-detail-card profile-section-card">
          <header>
            <div><span className="profile-section-icon profile-section-icon-social"><Globe2 size={17} /></span><div><h2>社媒账号</h2><p>达人在各社媒平台填写的公开账号</p></div></div>
            <ShieldCheck size={19} />
          </header>
          <div className="profile-social-grid">
            {platformProfiles.map((item) => (
              <article key={item.url}>
                <span className="resource-icon peach"><Globe2 size={18} /></span>
                <div><strong>{item.platform}</strong><span>{item.accountName}</span></div>
                {!profileEditing ? <StatusBadge label="已认证" tone="success" /> : null}
                <a href={item.url} target="_blank" rel="noreferrer" aria-label={`查看 ${item.platform} 主页`}><ExternalLink size={14} /></a>
              </article>
            ))}
          </div>
          <dl className="definition-list">
            <div>
              <dt>认证截图</dt>
              <dd className="profile-resource-list">
                {(draft.social.screenshots?.length
                  ? draft.social.screenshots
                  : draft.social.screenshot
                    ? [draft.social.screenshot]
                    : []
                ).map((file) => <span key={file.id}>{file.name}</span>)}
                {!draft.social.screenshots?.length && !draft.social.screenshot ? <span>未上传</span> : null}
              </dd>
            </div>
          </dl>
          {profileEditing ? <label className="secondary-button upload-button"><Upload size={16} />上传认证截图<input type="file" accept="image/png,image/jpeg" /></label> : null}
        </section>

        <section className="detail-card form-detail-card profile-section-card">
          <header>
            <div><span className="profile-section-icon profile-section-icon-contact"><ReceiptText size={17} /></span><div><h2>Invoice 联系资料</h2><p>用于 Invoice 的 From 信息</p></div></div>
            <UserRound size={19} />
          </header>
          <div className="form-grid profile-contact-grid">
            <label><span>显示名称 / Display name</span><input disabled={!profileEditing} value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label>
            <label><span>真实姓名 / Real Name *</span><input disabled={!profileEditing} required value={draft.legalName} onChange={(event) => setDraft({ ...draft, legalName: event.target.value })} /></label>
            <label><span>联系电话 / Tel *</span><input disabled={!profileEditing} required value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
            <label className={emailInvalid ? "profile-contact-field-error" : undefined}>
              <span>联系邮箱 / Email *</span>
              <input
                disabled={!profileEditing}
                required
                type="email"
                autoComplete="email"
                value={draft.email}
                aria-invalid={emailInvalid}
                aria-describedby={emailInvalid ? "profile-contact-email-error" : undefined}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              />
              {emailInvalid ? (
                <small id="profile-contact-email-error" className="profile-contact-field-error-copy" role="alert">
                  请输入有效的邮箱地址，例如 name@example.com
                </small>
              ) : null}
            </label>
            <label className="full"><span>联系地址 / Address *</span><input disabled={!profileEditing} required value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
          </div>
        </section>

        <section className="detail-card form-detail-card profile-section-card payout-accounts-card">
          <header>
            <div><span className="profile-section-icon profile-section-icon-payout"><WalletCards size={17} /></span><div><h2>付款账户</h2><p>按付款渠道查看账户，并指定一个默认账户用于新的付款</p></div></div>
            <StatusBadge label={`${selectedUsablePayoutAccounts.length} 个可用`} tone={selectedUsablePayoutAccounts.length ? "success" : "danger"} />
          </header>

          <div
            className="payout-channel-selector"
            role="tablist"
            aria-label="付款渠道"
          >
            {PAYOUT_CHANNELS.map((channel) => {
              const channelAccounts = payoutAccountsForChannel(
                payoutAccounts,
                channel.id,
              );
              const channelUsableAccounts =
                channelAccounts.filter(isPayoutAccountUsable);
              const isSelected = selectedPayoutChannel === channel.id;
              return (
                <button
                  key={channel.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls="payout-channel-accounts"
                  disabled={payoutAccountEditing}
                  className={[
                    isSelected ? "is-selected" : "",
                    channel.isAvailable ? "" : "is-upcoming",
                  ].filter(Boolean).join(" ")}
                  onClick={() => {
                    setOpenPayoutMenuId("");
                    setSelectedPayoutChannel(channel.id);
                  }}
                >
                  <strong>{channel.label}</strong>
                  <span>
                    {channel.isAvailable
                      ? `${channelAccounts.length} 个账户 · ${channelUsableAccounts.length} 个可用`
                      : `${channelAccounts.length} 个账户 · 暂未开放`}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            id="payout-channel-accounts"
            className="payout-channel-account-stage"
            role="tabpanel"
            aria-label={`${selectedPayoutChannelConfig.label} 付款账户`}
          >
            {incompletePayoutAccounts.length ? (
              <aside className="payout-incomplete-notice" role="note">
                <AlertCircle size={16} />
                <div>
                  <strong>{incompletePayoutAccounts.length} 个账户资料待补充</strong>
                  <span>完善并通过验证后，账户才会进入新项目、Invoice 和付款批次的可选范围。</span>
                </div>
              </aside>
            ) : null}

            {!selectedPayoutAccounts.length ? (
              <div className="payout-channel-empty" role="status">
                <WalletCards size={20} />
                <div>
                  <strong>{selectedPayoutChannelConfig.label} 暂无付款账户</strong>
                  <span>
                    {selectedPayoutChannelConfig.isAvailable
                      ? "新增并完成验证后，账户可用于后续付款。"
                      : "该付款渠道暂未开放，开放后可在这里维护账户。"}
                  </span>
                </div>
              </div>
            ) : !selectedUsablePayoutAccounts.length ? (
              <div className="payout-usable-empty" role="status">
                <WalletCards size={20} />
                <strong>当前渠道暂无可用于付款的账户，请完成验证。</strong>
              </div>
            ) : null}

            <div className="payout-account-grid">
              {selectedPayoutAccounts.map((account) => {
                const displayAccountName =
                  normalizePayoutAccountAlias(account.name) ||
                  "未命名 Airwallex 账户";
                const isDefault =
                  account.id === normalizedDraft.defaultPayoutAccountId;
                const isDisabled =
                  account.status === "DISABLED" || Boolean(account.disabledAt);
                const destructiveAction =
                  payoutAccountDestructiveAction(account);
                const destructiveLabel =
                  destructiveAction === "DELETE" ? "删除账户" : "停用账户";
                return (
                  <article
                    key={account.id}
                    className={[
                      "payout-account-item",
                      isDefault ? "is-default" : "",
                      isDisabled ? "is-disabled" : "",
                      account.id === activePayoutAccountId ? "is-active" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <span className={`payout-account-provider ${account.channel.toLowerCase()}`}>
                      {account.channel === "AIRWALLEX" ? <Landmark size={17} /> : <WalletCards size={17} />}
                    </span>
                    <div className="payout-account-copy">
                      <div className="payout-account-title">
                        <strong>{displayAccountName}</strong>
                      </div>
                      <span>{payoutAccountSummary(account)}</span>
                      <StatusBadge
                        label={payoutAccountStatusLabel(account)}
                        tone={payoutAccountStatusTone(account)}
                      />
                    </div>
                    <div
                      className="payout-account-menu-wrap"
                      data-payout-menu={account.id}
                    >
                      {isDefault ? (
                        <span className="payout-default-star" aria-label="默认付款账户" title="默认付款账户">
                          <Star size={14} fill="currentColor" />
                        </span>
                      ) : null}
                      {!payoutAccountEditing ? (
                        <button
                          type="button"
                          className="payout-account-menu-trigger"
                          aria-label={`打开${displayAccountName}操作菜单`}
                          aria-haspopup="menu"
                          aria-expanded={openPayoutMenuId === account.id}
                          onClick={() =>
                            setOpenPayoutMenuId((current) =>
                              current === account.id ? "" : account.id,
                            )
                          }
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      ) : null}
                      {!payoutAccountEditing && openPayoutMenuId === account.id ? (
                        <div className="payout-account-menu" role="menu" aria-label={`${displayAccountName}账户操作`}>
                          <button type="button" role="menuitem" onClick={() => editPayoutAccount(account)}>
                            <Pencil size={14} />编辑账户
                          </button>
                          {!isDefault ? (
                            <button
                              type="button"
                              role="menuitem"
                              className={!isPayoutAccountUsable(account) ? "is-disabled" : ""}
                              aria-disabled={!isPayoutAccountUsable(account)}
                              title={!isPayoutAccountUsable(account) ? "仅已验证且未停用的账户可设为默认账户" : undefined}
                              onClick={() => {
                                setOpenPayoutMenuId("");
                                setDefaultPayoutAccount(account);
                              }}
                            >
                              <Star size={14} />设为默认
                            </button>
                          ) : null}
                          {isDisabled ? (
                            <button type="button" role="menuitem" onClick={() => reactivatePayoutAccount(account)}>
                              <RefreshCcw size={14} />重新启用
                            </button>
                          ) : (
                            <button
                              type="button"
                              role="menuitem"
                              className={[
                                destructiveAction === "LOCKED" ? "is-disabled" : "",
                                destructiveAction === "DELETE" ? "is-danger" : "",
                              ].filter(Boolean).join(" ")}
                              aria-disabled={destructiveAction === "LOCKED"}
                              title={destructiveAction === "LOCKED" ? "该账户正在处理中，完成后才能停用。" : undefined}
                              onClick={() => requestPayoutAccountRemoval(account)}
                            >
                              {destructiveAction === "DELETE" ? <Trash2 size={14} /> : <Ban size={14} />}
                              {destructiveLabel}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="payout-account-add-actions">
            <button type="button" className="secondary-button" disabled={payoutAccountEditing} onClick={addAirwallexAccount}>
              <Plus size={15} />Airwallex 账户
            </button>
            <button
              type="button"
              className="secondary-button is-upcoming"
              disabled={payoutAccountEditing}
              aria-disabled="true"
              title="PayPal 账户暂未开放"
              onClick={() => {
                setSelectedPayoutChannel("PAYPAL");
                setPayoutToast("PayPal 账户暂未开放");
              }}
            >
              <Plus size={15} />PayPal 账户<span>暂未开放</span>
            </button>
            <button
              type="button"
              className="secondary-button is-upcoming"
              disabled={payoutAccountEditing}
              aria-disabled="true"
              title="PayerMax 账户暂未开放"
              onClick={() => {
                setSelectedPayoutChannel("PAYERMAX");
                setPayoutToast("PayerMax 账户暂未开放");
              }}
            >
              <Plus size={15} />PayerMax 账户<span>暂未开放</span>
            </button>
          </div>
        </section>

        {payoutAccountEditing ? (
          <section
            ref={payoutConfigRef}
            className="detail-card form-detail-card profile-section-card payout-account-config-card"
          >
            <header>
              <div>
                <span className="profile-section-icon profile-section-icon-account-config">
                  <Landmark size={17} />
                </span>
                <div>
                  <h2>账户配置</h2>
                  <p>以下为 MUSE Pay 内部账户字段，不会提交到 Airwallex Beneficiary API</p>
                </div>
              </div>
            </header>
            <div className="payout-account-config-body">
              <label
                className={[
                  "profile-payout-account-alias-field",
                  payoutAccountAliasTouched &&
                  validatePayoutAccountAlias(draft.payout.name)
                    ? "profile-payout-account-alias-error"
                    : "",
                ].filter(Boolean).join(" ")}
              >
                <span>账户别名 *</span>
                <small>Internal nickname</small>
                <input
                  required
                  autoComplete="off"
                  maxLength={PAYOUT_ACCOUNT_ALIAS_MAX_LENGTH}
                  value={draft.payout.name}
                  aria-invalid={Boolean(
                    payoutAccountAliasTouched &&
                      validatePayoutAccountAlias(draft.payout.name),
                  )}
                  aria-describedby={
                    payoutAccountAliasTouched &&
                    validatePayoutAccountAlias(draft.payout.name)
                      ? "profile-payout-account-alias-error"
                      : undefined
                  }
                  placeholder="2–40 个字符，仅用于系统内识别"
                  onBlur={() => setPayoutAccountAliasTouched(true)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      payout: {
                        ...current.payout,
                        name: event.target.value,
                      },
                    }))
                  }
                />
                {payoutAccountAliasTouched &&
                validatePayoutAccountAlias(draft.payout.name) ? (
                  <small
                    id="profile-payout-account-alias-error"
                    className="profile-payout-account-alias-error-copy"
                    role="alert"
                  >
                    {validatePayoutAccountAlias(draft.payout.name)}
                  </small>
                ) : null}
              </label>
            </div>
          </section>
        ) : null}

        <section className="detail-card form-detail-card profile-section-card payout-condition-card">
          <header>
            <div><span className="profile-section-icon profile-section-icon-scenario"><RefreshCcw size={17} /></span><div><h2>付款场景</h2><p>修改条件后会重新同步对应付款字段</p></div></div>
            {schemaLoading ? <StatusBadge label="正在同步" tone="amber" /> : schemaError ? <StatusBadge label="同步失败" tone="danger" /> : <StatusBadge label="已同步" tone="success" />}
          </header>
          <div className="form-grid airwallex-condition-grid profile-condition-grid">
            <label>
              <span>国家 / Country *</span>
              <select disabled={!editing || schemaLoading} value={condition.bankCountryCode} onChange={(event) => updateCondition({ bankCountryCode: event.target.value })}>
                {AIRWALLEX_COUNTRIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>收款人类型 / Recipient type *</span>
              <select disabled={!editing || schemaLoading} value={condition.entityType} onChange={(event) => updateCondition({ entityType: event.target.value as "PERSONAL" | "COMPANY" })}>
                <option value="PERSONAL">个人 / Individual</option>
                <option value="COMPANY">企业 / Company</option>
              </select>
            </label>
            <label>
              <span>账户币种 / Account currency *</span>
              <select disabled={!editing || schemaLoading} value={condition.accountCurrency} onChange={(event) => updateCondition({ accountCurrency: event.target.value })}>
                {["USD", "EUR", "GBP", "JPY", "AUD", "HKD", "SGD"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>转账方式 / Transfer method *</span>
              <select disabled={!editing || schemaLoading} value={condition.transferMethod} onChange={(event) => updateCondition({ transferMethod: event.target.value as "LOCAL" | "SWIFT" })}>
                <option value="LOCAL">本地转账 / Local transfer</option>
                <option value="SWIFT">国际电汇 / SWIFT</option>
              </select>
            </label>
          </div>
        </section>

        <section
          id="payout-information"
          ref={payoutDetailRef}
          className={`detail-card form-detail-card profile-section-card payout-detail-card ${isRepairFlow ? "is-repairing" : ""}`}
        >
          <header>
            <div><span className="profile-section-icon profile-section-icon-bank"><Landmark size={17} /></span><div><h2>Airwallex 付款信息</h2><p>{selectedCountry} · {condition.accountCurrency} · {condition.transferMethod === "LOCAL" ? "本地转账" : "国际电汇"}</p></div></div>
            {!editing && draft.payout.status === "VALIDATED" ? <StatusBadge label="校验通过" tone="success" /> : null}
          </header>
          {schemaError ? <div className="form-alert danger">{schemaError}</div> : null}
          {schemaLoading ? (
            <LoadingRows />
          ) : schema ? (
            <div className="form-grid schema-field-grid profile-schema-fields">
              {schema.fields.map((field) => {
                const fieldError =
                  schemaFieldErrors[field.key] ||
                  (isRepairFlow && field.key === repairFieldKey
                    ? "此项未通过付款校验，请填写正确的信息。"
                    : "");
                const errorId = `profile-schema-${field.key}-error`;
                return (
                  <label
                    key={field.key}
                    className={
                      fieldError ? "profile-schema-field-error" : undefined
                    }
                  >
                    <span>{field.label}{field.required ? " *" : ""}</span>
                    {field.type === "SELECT" ? (
                      <select
                        disabled={!editing}
                        required={field.required}
                        value={schemaValues[field.key] || ""}
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={fieldError ? errorId : undefined}
                        onBlur={() => validateSchemaField(field.key)}
                        onChange={(event) => updateSchemaField(field.key, event.target.value)}
                      >
                        <option value="">请选择</option>
                        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : (
                      <input
                        disabled={!editing}
                        required={field.required}
                        type={!editing && field.key === "account_number" ? "password" : "text"}
                        value={schemaValues[field.key] || ""}
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={fieldError ? errorId : undefined}
                        onBlur={() => validateSchemaField(field.key)}
                        onChange={(event) => updateSchemaField(field.key, event.target.value)}
                        placeholder={editing ? field.placeholder : undefined}
                        pattern={field.pattern}
                        title={field.description}
                        inputMode={field.validationRules?.some((rule) => rule.name === "DigitsOnly") ? "numeric" : undefined}
                        autoCapitalize={field.key === "account_name" ? "words" : field.key === "iban" ? "characters" : undefined}
                        spellCheck={field.key === "account_name" || field.key === "iban" ? false : undefined}
                      />
                    )}
                    {fieldError ? (
                      <small id={errorId} className="profile-schema-field-error-copy" role="alert">
                        {fieldError}
                      </small>
                    ) : null}
                  </label>
                );
              })}
            </div>
          ) : null}
          {!schemaLoading && schema ? (
            <div className="profile-supplemental-panel">
              <div className="profile-payout-section-heading">
                <div><strong>补充资料</strong><span>未标记 * 的字段不影响保存</span></div>
              </div>
              <aside className="profile-supplemental-reminder" role="note">
                <Info size={16} />
                <div>
                  <strong>建议尽可能完善补充资料</strong>
                  <p>资料越完整，后续调整收款国家、币种、账户类型或转账方式时，系统越能快速匹配并校验新的付款要求，减少资料补交、付款退回和重复修改。</p>
                </div>
              </aside>
              <div className="form-grid profile-supplemental-fields">
                {supplementalFields.map((field) => (
                  <label key={field.key} className={field.fullWidth ? "full" : undefined}>
                    <span>{field.label}</span>
                    {field.type === "SELECT" ? (
                      <select disabled={!editing} value={draft.payout.schemaValues[field.key] || ""} onChange={(event) => updateSupplementalField(field.key, event.target.value)}>
                        <option value="">请选择</option>
                        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : (
                      <input disabled={!editing} value={draft.payout.schemaValues[field.key] || ""} onChange={(event) => updateSupplementalField(field.key, event.target.value)} />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {payoutAccountEditing ? (
            <footer
              className="profile-payout-edit-actions"
              aria-label="付款账户编辑操作"
            >
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={cancelEditing}
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={saving || schemaLoading || Boolean(schemaError)}
                onClick={save}
              >
                {saving ? "校验中" : "保存修改"}
              </button>
            </footer>
          ) : null}
        </section>
      </div>

      {payoutDialog && payoutDialogAccount ? (
        <div className="payout-account-dialog-overlay" role="presentation">
          <section
            className="payout-account-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payout-account-dialog-title"
            aria-describedby="payout-account-dialog-description"
          >
            <header>
              <span className={`payout-account-dialog-icon ${payoutDialog.operation === "DELETE" ? "danger" : "warning"}`}>
                {payoutDialog.operation === "DELETE" ? <Trash2 size={19} /> : <Ban size={19} />}
              </span>
              <div>
                <h2 id="payout-account-dialog-title">
                  {payoutDialog.kind === "REPLACE_DEFAULT"
                    ? "请先更换默认付款账户"
                    : payoutDialog.operation === "DELETE"
                      ? "删除付款账户？"
                      : "停用付款账户？"}
                </h2>
                <p id="payout-account-dialog-description">
                  {payoutDialog.kind === "REPLACE_DEFAULT"
                    ? "该账户是当前默认付款账户，请选择一个新的默认账户后继续。"
                    : payoutDialog.operation === "DELETE"
                      ? "删除后将无法恢复，该账户将不再用于后续付款。"
                      : "停用后，该账户不能用于新的付款，但历史项目、Invoice 和付款记录仍会保留。"}
                </p>
              </div>
            </header>

            <dl className="payout-account-dialog-summary">
              <div><dt>账户名称</dt><dd>{payoutDialogAccount.name}</dd></div>
              <div><dt>账户类型</dt><dd>{payoutDialogAccount.provider}</dd></div>
              <div><dt>币种</dt><dd>{payoutDialogAccount.currency}</dd></div>
              <div><dt>账号或邮箱</dt><dd>{maskPayoutIdentifier(payoutDialogAccount)}</dd></div>
            </dl>

            {payoutDialog.kind === "REPLACE_DEFAULT" ? (
              <div className="payout-replacement-section">
                <strong>选择新的默认付款账户</strong>
                {replacementAccounts.length ? (
                  <div className="payout-replacement-list" role="radiogroup" aria-label="新的默认付款账户">
                    {replacementAccounts.map((account) => (
                      <label key={account.id}>
                        <input
                          type="radio"
                          name="replacement-payout-account"
                          value={account.id}
                          checked={payoutDialog.replacementId === account.id}
                          onChange={() =>
                            setPayoutDialog((current) =>
                              current
                                ? { ...current, replacementId: account.id }
                                : current,
                            )
                          }
                        />
                        <span>
                          <b>{account.name}</b>
                          <small>{payoutAccountSummary(account)}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="payout-replacement-empty">
                    <Info size={16} />
                    <span>当前没有其他可用账户，请先新增付款账户并完成验证。</span>
                  </div>
                )}
              </div>
            ) : null}

            <footer>
              <button
                ref={dialogCancelRef}
                type="button"
                className="secondary-button"
                disabled={accountMutationSaving}
                onClick={() => setPayoutDialog(null)}
              >
                取消
              </button>
              <button
                type="button"
                className={payoutDialog.operation === "DELETE" ? "danger-button" : "primary-button"}
                disabled={
                  accountMutationSaving ||
                  (payoutDialog.kind === "REPLACE_DEFAULT" &&
                    !payoutDialog.replacementId)
                }
                onClick={confirmPayoutAccountMutation}
              >
                {accountMutationSaving
                  ? "处理中"
                  : payoutDialog.kind === "REPLACE_DEFAULT"
                    ? payoutDialog.operation === "DELETE"
                      ? "更换并删除"
                      : "更换并停用"
                    : payoutDialog.operation === "DELETE"
                      ? "删除账户"
                      : "确认停用"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {payoutToast ? (
        <div className="payout-account-toast" role="status" aria-live="polite">
          <CheckCircle2 size={17} />
          <span>{payoutToast}</span>
        </div>
      ) : null}

      {saveState !== "idle" ? (
        <div className="profile-save-overlay" role="presentation">
          <section
            className="profile-save-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-save-title"
            aria-describedby="profile-save-description"
          >
            <span className={`profile-save-icon ${saveState}`}>
              {saveState === "validating" ? <RefreshCcw className="spin" size={24} /> : null}
              {saveState === "success" ? <CheckCircle2 size={25} /> : null}
              {saveState === "error" ? <Info size={25} /> : null}
            </span>
            <h2 id="profile-save-title">
              {saveState === "validating"
                ? "校验中"
                : saveState === "success"
                  ? hasRepairContext
                    ? "付款信息已更新"
                    : "保存成功"
                  : "保存失败"}
            </h2>
            <p id="profile-save-description">
              {saveState === "validating"
                ? "正在校验个人资料与收款账户，请稍候。"
                : saveState === "success"
                  ? hasRepairContext
                    ? "Airwallex 校验已通过，可以返回 Invoice 提交审核。"
                    : "个人档案已保存，最新资料已同步更新。"
                  : saveError || "暂时无法保存，请检查资料后重试。"}
            </p>
            {saveState !== "validating" ? (
              <button
                type="button"
                className={saveState === "success" ? "primary-button" : "secondary-button"}
                onClick={() => {
                  if (saveState === "success" && repairInvoiceId) {
                    navigate(`/invoices/${repairInvoiceId}`);
                    return;
                  }
                  setSaveState("idle");
                  setSaveError("");
                }}
              >
                {saveState === "success"
                  ? repairInvoiceId
                    ? "返回 Invoice"
                    : "知道了"
                  : "返回修改"}
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route element={<CreatorRoute />}>
          <Route path="/onboarding/social-verification" element={<SocialVerificationPage />} />
          <Route path="/onboarding/profile" element={<OnboardingProfilePage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<RequestListPage />} />
            <Route path="/requests" element={<Navigate to="/" replace />} />
            <Route path="/requests/:id" element={<RequestDetailPage />} />
            <Route path="/contracts" element={<ContractListPage />} />
            <Route path="/contracts/:id" element={<ContractDetailPage />} />
            <Route path="/invoices" element={<InvoiceListPage />} />
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route element={<AdminRoute />}>
          <Route element={<AdminLayoutBridge />}>
            <Route path="/admin" element={<AdminRequestProjectsPage />} />
            <Route path="/admin/requests/:creatorId/:id" element={<RequestDetailPage adminView />} />
            <Route path="/admin/contracts" element={<AdminContractsPage />} />
            <Route path="/admin/contracts/:creatorId/:id" element={<ContractDetailPage adminView />} />
            <Route path="/admin/invoices" element={<AdminInvoicesPage />} />
            <Route path="/admin/invoices/:creatorId/:id" element={<InvoiceDetailPage adminView />} />
            <Route path="/admin/settings" element={<Navigate to="/admin/settings/users" replace />} />
            <Route path="/admin/settings/users" element={<AdminUsersPage />} />
            <Route path="/admin/settings/users/:id" element={<AdminUserDetailPage />} />
            <Route path="/admin/settings/audit-logs" element={<AdminAuditPage />} />
            <Route path="/admin/users" element={<Navigate to="/admin/settings/users" replace />} />
            <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
            <Route path="/admin/audit-logs" element={<Navigate to="/admin/settings/audit-logs" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<RoleHomeRedirect />} />
      </Routes>
    </AppProvider>
  );
}

function RoleHomeRedirect() {
  const { session } = useApp();
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={session.role === "ADMIN" ? "/admin" : "/"} replace />;
}
