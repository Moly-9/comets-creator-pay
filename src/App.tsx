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
import { contractStatusLabel, contractStatusTone } from "./contract-status";
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
  EXTERNAL_COLLECTION_META,
  INTERNAL_REVIEW_META,
  PAYMENT_STATUS_META,
  invoiceInternalIdOf,
  invoiceMatchesStatusFilters,
  invoiceNumberOf,
  invoicePaymentMeta,
  invoicePrimaryStatusMeta,
  invoiceReviewFilterValue,
  invoiceReviewMeta,
  invoiceTypeOf,
  migrateInvoice,
  recoveryStatusIsSubmitted,
} from "./creator-workflow";
import {
  contractConfirmationRows,
  contractPayoutRows,
  createInvoicePayoutSnapshot,
  creatorHomepageSocialSummary,
  creatorInvoiceTypeLabel,
  getSocialAccountName,
  normalizeSocialEvidence,
  payoutSnapshotRows,
} from "./creator-display";
import {
  AirwallexBeneficiaryValidationError,
  buildProfileSupplementalFields,
  compareInvoicePaymentDetails,
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
  AirwallexTransferMethodOption,
  Contract,
  CorrectionRequest,
  CreatorNotification,
  CreatorTask,
  ExternalInvoiceUploadInput,
  FileRef,
  Invoice,
  InvoiceExtractedData,
  InvoiceFeedbackInput,
  InvoiceSignature,
  InvoiceStatus,
  OnboardingDraft,
  PaymentAccountCorrectionInput,
  PaymentStatus,
  PayoutAccount,
  RequestProject,
  Session,
  UserProfile,
} from "./types";

const INVOICE_STATUS: Record<
  InvoiceStatus,
  { label: string; tone: string; description: string }
> = {
  PENDING_CONFIRMATION: { label: "待确认", tone: "amber", description: "请核对识别结果与收款账户" },
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

const fullPayoutIdentifier = (account: PayoutAccount) =>
  account.accountNumber
  || account.schemaValues.account_number
  || account.schemaValues.iban
  || account.accountEmail
  || "待补充";

const creatorPayoutRows = (account: PayoutAccount) => [
  ["Provider", account.provider],
  ["Account Holder / Account Name", account.accountHolder || account.schemaValues.account_name],
  ["Bank Name", account.bankName || account.schemaValues.bank_name],
  ["Bank Country", account.bankCountry],
  ["Currency", account.currency],
  ["Account Number", account.accountNumber || account.schemaValues.account_number],
  ["IBAN", account.schemaValues.iban],
  ["SWIFT/BIC", account.swiftCode || account.schemaValues.swift_code],
  ["Transfer Method", account.transferMethod],
  ["Beneficiary Type", account.beneficiaryType],
  ["PayPal Email", account.accountEmail],
].filter(([, value]) => Boolean(value)) as Array<[string, string]>;

export const shouldShowInvoicePreSigningControls = (status: InvoiceStatus) =>
  status === "DRAFT_SIGNATURE";

const normalizeInvoiceSearch = (value: string) =>
  value.toLocaleLowerCase().replace(/[\s,_./-]+/g, "");

const normalizeInvoiceIdentity = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

const invoiceClientRequestId = (action: string) =>
  `${action}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;

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
    const searchable = normalizeInvoiceSearch(invoiceNumberOf(invoice));
    return terms.every((term) =>
      searchable.includes(normalizeInvoiceSearch(term)),
    );
  });
};

const CONTRACT_STATUS: Record<
  Contract["status"],
  { tone: string; description: string }
> = {
  PENDING_SIGNATURE: { tone: contractStatusTone.PENDING_SIGNATURE, description: "合同等待签署，完成签署后进入履约执行阶段" },
  ACTIVE: { tone: contractStatusTone.ACTIVE, description: "合同已完成签署，当前处于服务履约执行期" },
  EXPIRED: { tone: contractStatusTone.EXPIRED, description: "合同已完成签署，且约定服务周期已结束" },
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
    invoiceStatus: INVOICE_STATUS[invoice.status].label,
    updatedAt: invoice.updatedAt,
    issues: invoice.status === "PAYMENT_FAILED" ? request.issues : [],
    progress: buildInvoiceDrivenRequestProgress(invoice),
  };
};

interface AppState {
  session: Session | null;
  profile: UserProfile;
  contracts: Contract[];
  invoices: Invoice[];
  tasks: CreatorTask[];
  notifications: CreatorNotification[];
  login(email: string, password: string): Promise<Session>;
  register(name: string, email: string, password: string): Promise<void>;
  completeOnboarding(profile: UserProfile): Promise<void>;
  saveProfile(profile: UserProfile): Promise<void>;
  signContract(id: string): Promise<void>;
  signInternalInvoice(id: string, signature: InvoiceSignature): Promise<void>;
  submitInvoiceFeedback(id: string, input: InvoiceFeedbackInput): Promise<void>;
  uploadExternalInvoice(input: ExternalInvoiceUploadInput): Promise<Invoice>;
  confirmExternalInvoice(id: string): Promise<void>;
  correctExternalInvoice(id: string, extractedData: InvoiceExtractedData): Promise<void>;
  resubmitExternalInvoice(input: ExternalInvoiceUploadInput): Promise<Invoice>;
  retryExternalRecognition(id: string): Promise<void>;
  selectInvoicePayoutAccount(id: string, payoutAccountId: string): Promise<void>;
  submitPaymentAccountCorrection(id: string, input: PaymentAccountCorrectionInput): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  logout(): void;
}

const AppContext = createContext<AppState | null>(null);

const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppContext is missing");
  return context;
};

const ONBOARDING_DRAFT_STORAGE_PREFIX = "comets-onboarding-draft-v1";

export const onboardingDraftStorageKey = (userId: string) =>
  `${ONBOARDING_DRAFT_STORAGE_PREFIX}:${userId}`;

export const readOnboardingDraft = (
  userId: string | undefined,
): OnboardingDraft | null => {
  if (!userId || typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(
      onboardingDraftStorageKey(userId),
    );
    if (!stored) return null;
    const parsed = JSON.parse(stored) as OnboardingDraft;
    return parsed.userId === userId ? parsed : null;
  } catch {
    return null;
  }
};

export const writeOnboardingDraft = (draft: OnboardingDraft) => {
  if (typeof window === "undefined") return;
  const serializableDraft: OnboardingDraft = {
    userId: draft.userId,
    maxVisitedStep: draft.maxVisitedStep,
    registrationEmail: draft.registrationEmail,
    social: draft.social,
    profile: draft.profile,
    updatedAt: draft.updatedAt,
  };
  window.sessionStorage.setItem(
    onboardingDraftStorageKey(draft.userId),
    JSON.stringify(serializableDraft),
  );
};

export const clearOnboardingDraft = (userId: string | undefined) => {
  if (!userId || typeof window === "undefined") return;
  window.sessionStorage.removeItem(onboardingDraftStorageKey(userId));
  window.sessionStorage.removeItem("comets-social-draft");
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
  const [contracts, setContracts] = useState<Contract[]>(() =>
    session?.role === "CREATOR" && session.userId === PRIMARY_CREATOR_ID
      ? seedContracts
      : [],
  );
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    session?.role === "CREATOR" && session.userId === PRIMARY_CREATOR_ID
      ? sortInvoices(seedInvoices.map(migrateInvoice))
      : [],
  );
  const [tasks, setTasks] = useState<CreatorTask[]>([]);
  const [notifications, setNotifications] = useState<CreatorNotification[]>([]);

  const refreshWorkflowCollections = async (userId: string) => {
    const [taskResult, notificationResult] = await Promise.all([
      services.tasks.list(userId),
      services.notifications.list(userId),
    ]);
    setTasks(taskResult.data);
    setNotifications(notificationResult.data);
  };

  const replaceInvoice = (next: Invoice) => {
    setInvoices((items) => sortInvoices(items.map((item) => (
      invoiceInternalIdOf(item) === invoiceInternalIdOf(next) ? next : item
    ))));
  };

  useEffect(() => {
    if (session?.role === "CREATOR") {
      Promise.all([
        services.invoices.list(session.userId),
        services.contracts.list(session.userId),
      ]).then(([invoiceResult, contractResult]) => {
        setInvoices(invoiceResult.data);
        setContracts(contractResult.data);
      });
      void refreshWorkflowCollections(session.userId);
    } else {
      setInvoices([]);
      setContracts([]);
      setTasks([]);
      setNotifications([]);
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
    contracts,
    invoices,
    tasks,
    notifications,
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
        clearOnboardingDraft(session.userId);
      }
    },
    saveProfile: async (nextProfile) => {
      const result = await services.profile.save(nextProfile);
      setProfile(result.data);
    },
    signContract: async (id) => {
      if (!session) throw new Error("登录会话已失效");
      const result = await services.contracts.signContract(id, session);
      setContracts((items) => items.map((item) => item.id === id ? result.data : item));
      await refreshWorkflowCollections(session.userId);
    },
    signInternalInvoice: async (id, signature) => {
      if (
        session?.role !== "CREATOR" ||
        !session.permissions.includes("INVOICE_SIGN")
      ) throw new Error("当前账号没有 Invoice 签署权限");
      if (session.verificationStatus !== "VERIFIED") {
        throw new Error("完成社媒认证后才能签署 Invoice");
      }
      const result = await services.invoices.signInternalInvoice(id, signature);
      replaceInvoice(result.data);
      await refreshWorkflowCollections(session.userId);
    },
    submitInvoiceFeedback: async (id, input) => {
      if (!session) throw new Error("登录会话已失效");
      const result = await services.invoices.submitFeedback(id, input);
      replaceInvoice(result.data);
      await refreshWorkflowCollections(session.userId);
    },
    uploadExternalInvoice: async (input) => {
      if (!session) throw new Error("登录会话已失效");
      const current = invoices.find((item) => invoiceInternalIdOf(item) === input.invoiceId);
      if (!current) throw new Error("Invoice 不存在");
      const uploaded = await services.invoices.uploadExternalInvoiceFile({
        invoiceId: input.invoiceId,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("upload"),
        payoutAccountId: input.payoutAccountId,
        file: input.file,
      });
      replaceInvoice(uploaded.data);
      const result = await services.invoices.retryExternalInvoiceRecognition({
        invoiceId: input.invoiceId,
        creatorId: session.userId,
        expectedVersion: uploaded.data.version || 1,
        clientRequestId: invoiceClientRequestId("recognize"),
      });
      replaceInvoice(result.data);
      if (session) await refreshWorkflowCollections(session.userId);
      return result.data;
    },
    confirmExternalInvoice: async (id) => {
      if (!session) throw new Error("登录会话已失效");
      const current = invoices.find((item) => invoiceInternalIdOf(item) === id);
      if (!current) throw new Error("Invoice 不存在");
      const result = await services.invoices.confirmExternalInvoice({
        invoiceId: id,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("confirm"),
        acknowledgement: true,
      });
      replaceInvoice(result.data);
      if (session) await refreshWorkflowCollections(session.userId);
    },
    correctExternalInvoice: async (id, extractedData) => {
      if (!session) throw new Error("登录会话已失效");
      const current = invoices.find((item) => invoiceInternalIdOf(item) === id);
      if (!current) throw new Error("Invoice 不存在");
      const result = await services.invoices.correctExternalInvoiceRecognition({
        invoiceId: id,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("correct"),
        values: {
          SOURCE_INVOICE_NUMBER: invoiceNumberOf(current),
          INVOICE_DATE: extractedData.invoiceDate,
          PUBLISHER: extractedData.invoiceFrom,
          ADVERTISER: extractedData.billTo,
          DESCRIPTION: current.invoiceType || "External Invoice",
          AMOUNT: extractedData.total,
          CURRENCY: extractedData.currency,
          PAYMENT_ACCOUNT: extractedData.paymentDetails.account_number || extractedData.paymentDetails.iban || "",
        },
      });
      replaceInvoice(result.data);
      if (session) await refreshWorkflowCollections(session.userId);
    },
    resubmitExternalInvoice: async (input) => {
      if (!session) throw new Error("登录会话已失效");
      const current = invoices.find((item) => invoiceInternalIdOf(item) === input.invoiceId);
      if (!current) throw new Error("Invoice 不存在");
      const uploaded = await services.invoices.uploadExternalInvoiceFile({
        invoiceId: input.invoiceId,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("reupload"),
        payoutAccountId: input.payoutAccountId,
        file: input.file,
      });
      replaceInvoice(uploaded.data);
      const result = await services.invoices.retryExternalInvoiceRecognition({
        invoiceId: input.invoiceId,
        creatorId: session.userId,
        expectedVersion: uploaded.data.version || 1,
        clientRequestId: invoiceClientRequestId("recognize-reupload"),
      });
      replaceInvoice(result.data);
      await refreshWorkflowCollections(session.userId);
      return result.data;
    },
    retryExternalRecognition: async (id) => {
      if (!session) throw new Error("登录会话已失效");
      const current = invoices.find((item) => invoiceInternalIdOf(item) === id);
      if (!current) throw new Error("Invoice 不存在");
      const result = await services.invoices.retryExternalInvoiceRecognition({
        invoiceId: id,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("retry-recognition"),
      });
      replaceInvoice(result.data);
      await refreshWorkflowCollections(session.userId);
    },
    selectInvoicePayoutAccount: async (id, payoutAccountId) => {
      if (!session) throw new Error("登录会话已失效");
      const current = invoices.find((item) => invoiceInternalIdOf(item) === id);
      if (!current) throw new Error("Invoice 不存在");
      const result = await services.invoices.selectExternalInvoicePayoutAccount({
        invoiceId: id,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("select-payout"),
        payoutAccountId,
      });
      replaceInvoice(result.data);
      if (session) await refreshWorkflowCollections(session.userId);
    },
    submitPaymentAccountCorrection: async (id, input) => {
      const current = invoices.find((item) => invoiceInternalIdOf(item) === id);
      if (!current) throw new Error("Invoice 不存在");
      const result = await services.payments.submitAccountCorrection(id, {
        ...input,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("payment-account-correction"),
      });
      replaceInvoice(result.data);
      if (session) await refreshWorkflowCollections(session.userId);
    },
    markNotificationRead: async (id) => {
      if (!session) return;
      const result = await services.notifications.markRead(id, session.userId);
      setNotifications((items) => items.map((item) => item.id === id ? result.data : item));
    },
    markAllNotificationsRead: async () => {
      if (!session) return;
      const result = await services.notifications.markAllRead(session.userId);
      setNotifications(result.data);
    },
    logout: () => {
      if (session) void services.auth.logout(session.sessionId);
      clearOnboardingDraft(session?.userId);
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

const ONBOARDING_STEP_ROUTES: Record<1 | 2 | 3, string> = {
  1: "/register",
  2: "/onboarding/social-verification",
  3: "/onboarding/profile",
};

export const canVisitOnboardingStep = (
  step: 1 | 2 | 3,
  hasCreatorSession: boolean,
  maxVisitedStep: 1 | 2 | 3,
) =>
  step === 1 ||
  (step === 2 && hasCreatorSession) ||
  (step === 3 && maxVisitedStep >= 3);

function OnboardingProgress({
  currentStep,
  maxVisitedStep,
}: {
  currentStep: 1 | 2 | 3;
  maxVisitedStep: 1 | 2 | 3;
}) {
  const { session } = useApp();
  const navigate = useNavigate();

  return (
    <nav
      className="auth-progress"
      aria-label={`注册进度，第 ${currentStep} 步，共 3 步`}
    >
      {[1, 2, 3].map((item) => {
        const step = item as 1 | 2 | 3;
        const isCurrent = step === currentStep;
        const isComplete = step < maxVisitedStep;
        const canVisit = canVisitOnboardingStep(
          step,
          Boolean(session?.role === "CREATOR"),
          maxVisitedStep,
        );
        return (
          <button
            key={step}
            type="button"
            className={`${step <= maxVisitedStep ? "active" : ""} ${
              isCurrent ? "current" : ""
            }`}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={`第 ${step} 步${isComplete ? "，已完成" : isCurrent ? "，当前步骤" : ""}`}
            disabled={!canVisit || isCurrent}
            onClick={() => navigate(ONBOARDING_STEP_ROUTES[step])}
          >
            {isComplete ? <Check size={13} /> : step}
          </button>
        );
      })}
    </nav>
  );
}

function AuthShell({
  children,
  step,
  maxVisitedStep = step,
}: {
  children: ReactNode;
  step?: 1 | 2 | 3;
  maxVisitedStep?: 1 | 2 | 3;
}) {
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
          <OnboardingProgress
            currentStep={step}
            maxVisitedStep={maxVisitedStep || step}
          />
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
  const { register, session } = useApp();
  const navigate = useNavigate();
  const reviewingRegistration = Boolean(
    session?.role === "CREATOR" && !session.onboardingComplete,
  );
  const savedDraft = readOnboardingDraft(session?.userId);
  const maxVisitedStep = savedDraft?.maxVisitedStep || (session ? 2 : 1);
  const [values, setValues] = useState({
    email: session?.email || "",
    password: "",
    invitationCode: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (reviewingRegistration) {
      navigate("/onboarding/social-verification");
      return;
    }
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

        <div className="register-progress">
          <OnboardingProgress
            currentStep={1}
            maxVisitedStep={maxVisitedStep}
          />
        </div>

        <form className="register-form" onSubmit={submit} noValidate>
          <header>
            <img className="register-comets-mark" src="/comets-mark.svg" alt="" />
            <span className="eyebrow">CREATOR ACCOUNT</span>
            <h1>{reviewingRegistration ? "账号注册信息" : "创建你的账号"}</h1>
            <p>
              {reviewingRegistration
                ? "账号已创建，你可以查看注册邮箱并继续完成认证。"
                : "注册 COMETS Pay，开始管理合作款项与付款进度。"}
            </p>
          </header>

          {reviewingRegistration ? (
            <>
              <section className="registered-account-review" aria-label="已注册账号">
                <CheckCircle2 size={21} />
                <span>
                  <small>注册邮箱 / Registered email</small>
                  <strong>{session?.email}</strong>
                </span>
                <StatusBadge label="账号已创建" tone="success" />
              </section>
              <div className="registered-account-security-note">
                为保护账号安全，密码不会在注册完成后显示或保存在浏览器草稿中。
              </div>
              <button className="register-primary" type="submit">
                继续认证社媒账号 <ChevronRight size={17} />
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
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
  const { profile, session } = useApp();
  const navigate = useNavigate();
  const savedDraft = readOnboardingDraft(session?.userId);
  const [profileUrls, setProfileUrls] = useState<string[]>(
    savedDraft?.social?.profileUrls?.length
      ? savedDraft.social.profileUrls
      : profile.social.profileUrls?.length
      ? profile.social.profileUrls
      : [profile.social.profileUrl || ""],
  );
  const [files, setFiles] = useState<FileRef[]>(
    savedDraft?.social?.files?.length
      ? savedDraft.social.files
      : profile.social.screenshots?.length
      ? profile.social.screenshots
      : profile.social.screenshot
        ? [profile.social.screenshot]
        : [],
  );
  const [error, setError] = useState("");
  const [verification, setVerification] = useState<
    "idle" | "verifying" | "verified"
  >(savedDraft?.social?.verification === "verifying"
    ? "idle"
    : savedDraft?.social?.verification ||
        (profile.social.verificationStatus === "VERIFIED"
          ? "verified"
          : "idle"));

  useEffect(() => {
    if (!session) return;
    const current = readOnboardingDraft(session.userId);
    writeOnboardingDraft({
      userId: session.userId,
      maxVisitedStep: current?.maxVisitedStep || 2,
      registrationEmail: session.email,
      social: {
        profileUrls,
        files,
        verification,
      },
      profile: current?.profile,
      updatedAt: new Date().toISOString(),
    });
  }, [files, profileUrls, session, verification]);

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
    if (session) {
      const current = readOnboardingDraft(session.userId);
      writeOnboardingDraft({
        userId: session.userId,
        maxVisitedStep: 3,
        registrationEmail: session.email,
        social: {
          profileUrls: normalizedUrls,
          files,
          verification: "verified",
        },
        profile: current?.profile,
        updatedAt: new Date().toISOString(),
      });
    }
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
    <AuthShell
      step={2}
      maxVisitedStep={
        verification === "verified" && savedDraft?.maxVisitedStep === 3
          ? 3
          : 2
      }
    >
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

const transferMethodScenarioKey = (
  condition: Pick<
    AirwallexSchemaCondition,
    "bankCountryCode" | "accountCurrency" | "entityType"
  >,
) =>
  `${condition.bankCountryCode}:${condition.accountCurrency}:${condition.entityType}`;

const transferMethodLabel = (method: AirwallexTransferMethodOption) =>
  `${method.label}${method.recommended ? "（费用最低）" : ""}`;

function OnboardingProfilePage() {
  const { profile, completeOnboarding, session } = useApp();
  const navigate = useNavigate();
  const savedDraft = readOnboardingDraft(session?.userId);
  const [form, setForm] = useState(savedDraft?.profile?.form || profile);
  const [agreed, setAgreed] = useState(savedDraft?.profile?.agreed || false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<"AIRWALLEX" | "PAYPAL" | "PAYERMAX">(
    savedDraft?.profile?.channel || profile.payout.channel || "AIRWALLEX",
  );
  const [condition, setCondition] = useState<AirwallexSchemaCondition>({
    bankCountryCode:
      savedDraft?.profile?.condition.bankCountryCode ||
      airwallexCountryCode(profile.payout.bankCountry),
    accountCurrency:
      savedDraft?.profile?.condition.accountCurrency ||
      profile.payout.currency ||
      "USD",
    entityType:
      savedDraft?.profile?.condition.entityType ||
      profile.payout.beneficiaryType ||
      "PERSONAL",
    transferMethod:
      savedDraft?.profile?.condition.transferMethod ||
      profile.payout.transferMethod ||
      "LOCAL",
  });
  const [schema, setSchema] = useState<AirwallexFormSchema | null>(null);
  const [schemaValues, setSchemaValues] = useState<Record<string, string>>(
    savedDraft?.profile?.schemaValues || profile.payout.schemaValues || {},
  );
  const [transferMethods, setTransferMethods] = useState<
    AirwallexTransferMethodOption[]
  >([]);
  const [transferMethodsLoading, setTransferMethodsLoading] = useState(true);
  const [transferMethodsError, setTransferMethodsError] = useState("");
  const [resolvedTransferScenario, setResolvedTransferScenario] = useState("");
  const preserveInitialTransferMethodRef = useRef(Boolean(savedDraft?.profile));
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (savedDraft?.social?.profileUrls.length) {
      const normalizedUrls = savedDraft.social.profileUrls.map((url) =>
        url.trim(),
      );
      const primaryHost = (() => {
        try {
          return new URL(normalizedUrls[0]).hostname.replace(/^www\./, "");
        } catch {
          return "多平台";
        }
      })();
      setForm((current) => ({
        ...current,
        social: {
          platform: "多平台",
          handle: `${primaryHost} 等 ${normalizedUrls.length} 个主页`,
          profileUrl: normalizedUrls[0],
          profileUrls: normalizedUrls,
          screenshot: savedDraft.social?.files[0],
          screenshots: savedDraft.social?.files || [],
          verificationStatus:
            savedDraft.social?.verification === "verified"
              ? "VERIFIED"
              : "PENDING",
        },
      }));
      return;
    }
    const legacyDraft = window.sessionStorage.getItem("comets-social-draft");
    if (legacyDraft) {
      const social = JSON.parse(legacyDraft) as UserProfile["social"];
      setForm((current) => ({ ...current, social }));
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const current = readOnboardingDraft(session.userId);
    writeOnboardingDraft({
      userId: session.userId,
      maxVisitedStep: 3,
      registrationEmail: session.email,
      social: current?.social,
      profile: {
        form,
        channel,
        condition,
        schemaValues,
        agreed,
      },
      updatedAt: new Date().toISOString(),
    });
  }, [agreed, channel, condition, form, schemaValues, session]);

  useEffect(() => {
    let active = true;
    const scenario = transferMethodScenarioKey(condition);
    setTransferMethodsLoading(true);
    setTransferMethodsError("");
    services.payout
      .listTransferMethods({
        bankCountryCode: condition.bankCountryCode,
        accountCurrency: condition.accountCurrency,
        entityType: condition.entityType,
      })
      .then((result) => {
        if (!active) return;
        setTransferMethods(result.data);
        const currentMethod = result.data.find(
          (method) =>
            method.value === condition.transferMethod && method.available,
        );
        const recommended = result.data.find(
          (method) => method.recommended && method.available,
        );
        const nextMethod =
          preserveInitialTransferMethodRef.current && currentMethod
            ? currentMethod
            : recommended || currentMethod;
        preserveInitialTransferMethodRef.current = false;
        if (nextMethod && nextMethod.value !== condition.transferMethod) {
          setCondition((current) => ({
            ...current,
            transferMethod: nextMethod.value,
          }));
        }
        setResolvedTransferScenario(scenario);
        setTransferMethodsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setTransferMethodsError("转账方式加载失败，请重试。");
        setResolvedTransferScenario(scenario);
        setTransferMethodsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    condition.accountCurrency,
    condition.bankCountryCode,
    condition.entityType,
  ]);

  useEffect(() => {
    if (
      transferMethodsLoading ||
      resolvedTransferScenario !== transferMethodScenarioKey(condition)
    ) {
      return;
    }
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
    resolvedTransferScenario,
    transferMethodsLoading,
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
    if (channel !== "AIRWALLEX" || !schema || transferMethodsLoading) {
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
                  <select
                    value={condition.transferMethod}
                    disabled={transferMethodsLoading}
                    onChange={(event) =>
                      setCondition({
                        ...condition,
                        transferMethod: event.target.value as "LOCAL" | "SWIFT",
                      })
                    }
                  >
                    {transferMethods.length ? (
                      transferMethods.map((method) => (
                        <option
                          key={method.value}
                          value={method.value}
                          disabled={!method.available}
                        >
                          {transferMethodLabel(method)}
                        </option>
                      ))
                    ) : (
                      <option value={condition.transferMethod}>
                        {condition.transferMethod === "LOCAL"
                          ? "本地转账 / Local transfer"
                          : "国际电汇 / SWIFT"}
                      </option>
                    )}
                  </select>
                </label>
              </div>
              {transferMethodsError ? (
                <div className="form-alert danger">{transferMethodsError}</div>
              ) : null}
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
        <button className="primary-button" type="submit" disabled={submitting || schemaLoading || transferMethodsLoading}>
          {submitting ? <RefreshCcw className="spin" size={17} /> : <ShieldCheck size={17} />}
          {submitting ? "正在校验并创建 Beneficiary" : "校验付款信息并完成注册"}
        </button>
      </form>
    </AuthShell>
  );
}

const navItems = [
  { to: "/", label: "首页", icon: FolderKanban },
  { to: "/contracts", label: "合同", icon: FileText },
  { to: "/invoices", label: "Invoice", icon: ReceiptText },
  { to: "/profile", label: "个人档案", icon: IdCard },
];

const creatorGuideSteps = [
  {
    title: "查看收款",
    description: "确认收款金额、关联合同、Invoice 状态和当前审批进度。",
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
    label: "首页",
    description: "查看全部收款进度",
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

function AppLayout() {
  const {
    profile,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    logout,
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const accessDenied = (
    location.state as { accessDenied?: string } | null
  )?.accessDenied;
  const [open, setOpen] = useState(false);
  const [activeTopbarMenu, setActiveTopbarMenu] = useState<
    "help" | "notifications" | null
  >(null);
  const topbarActionsRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((item) => !item.read).length;

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

  const openNotification = async (item: CreatorNotification) => {
    if (!item.read) await markNotificationRead(item.id);
    setActiveTopbarMenu(null);
    navigate(item.deepLink);
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
                        Invoice 金额、币种和收款信息确认无误后再签署；收款资料变化时请先更新个人档案。
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
                    onClick={() => void markAllNotificationsRead()}
                  >
                    全部已读
                  </button>
                </header>
                <div className="notification-list">
                  {notifications.length ? (
                    notifications.map((item) => {
                      const isRead = item.read;
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
                              <small>{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</small>
                            </span>
                            <span>{item.message}</span>
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
      <main className={`main-content ${location.pathname === "/" ? "request-home-main" : ""}`}>
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
    const request = requestsByProject.get(projectKey);
    return [{
      id: request?.id || invoice.projectId,
      projectName: invoice.projectName,
      brand: invoice.brand,
      amount: invoice.amount,
      updatedAt: invoice.updatedAt,
      request,
      contract: baseContract,
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
    <div className="request-mini-progress" aria-label={`当前收款状态：${REQUEST_STATUS_FROM_INVOICE[status].label}`}>
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
  const { invoices, profile, tasks } = useApp();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<CreatorTask["group"] | "ALL">("ALL");
  const [reviewFilter, setReviewFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "ALL">("ALL");
  const normalizedQuery = normalizeInvoiceSearch(query);
  const invoiceGroup = (invoice: Invoice): CreatorTask["group"] => {
    const task = tasks.find((item) => item.resourceId === invoiceInternalIdOf(invoice));
    return task?.group || (invoice.paymentStatus === "PAID" ? "COMPLETED" : "PROCESSING");
  };
  const filtered = useMemo(
    () => invoices.map(migrateInvoice).filter((invoice) => {
      const matchesGroup = group === "ALL" || invoiceGroup(invoice) === group;
      const matchesQuery = !normalizedQuery || normalizeInvoiceSearch(invoiceNumberOf(invoice)).includes(normalizedQuery);
      return matchesGroup
        && matchesQuery
        && invoiceMatchesStatusFilters(invoice, reviewFilter, paymentFilter);
    }),
    [group, invoices, normalizedQuery, paymentFilter, reviewFilter, tasks],
  );
  const groupedTasks = (["TODO", "PROCESSING", "COMPLETED"] as const).map((taskGroup) => ({
    group: taskGroup,
    items: tasks.filter((task) => task.group === taskGroup),
  }));
  const todoInvoices = invoices.map(migrateInvoice).filter((invoice) => invoiceGroup(invoice) === "TODO");
  const processingInvoices = invoices.map(migrateInvoice).filter((invoice) => invoiceGroup(invoice) === "PROCESSING");
  const paidInvoices = invoices.map(migrateInvoice).filter((invoice) => invoice.paymentStatus === "PAID");
  const socialSummary = creatorHomepageSocialSummary(profile.social);

  return (
    <div className="page-stack request-home-page">
      <header className="request-home-greeting">
        <h1>你好，{profile.displayName} <span aria-hidden="true">👋</span></h1>
        <p>欢迎回来，{socialSummary}</p>
      </header>

      <section className="request-task-groups" aria-label="收款任务">
        {groupedTasks.map((section) => (
          <article className={`request-task-group task-${section.group.toLowerCase()}`} key={section.group}>
            <header>
              <h2>{{ TODO: "待我处理", PROCESSING: "处理中", COMPLETED: "已完成" }[section.group]}</h2>
              <span>{section.items.length}</span>
            </header>
            <div>
              {section.items.length ? section.items.map((task) => {
                const TaskIcon = section.group === "COMPLETED"
                  ? CheckCircle2
                  : task.type === "CONTRACT_SIGNATURE"
                    ? FileText
                    : ReceiptText;
                return (
                  <Link to={task.deepLink} key={task.id}>
                    <span className="request-action-icon purple"><TaskIcon size={18} /></span>
                    <span><strong>{task.title}</strong><small>{task.description}</small></span>
                    <ChevronRight size={15} />
                  </Link>
                );
              }) : (
                <div className="request-task-empty">
                  <span aria-hidden="true"><Check size={22} /></span>
                  <p>暂无记录</p>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="request-money-overview" aria-label="收款金额概览">
        <article>
          <div>
            <span>
              <i className="coral" />
              待签署金额
              <AmountInfoTooltip id="requesting-amount-tip" label="待签署金额">
                当前账号下已匹配合同、但关联 Invoice 仍待你签署的项目金额合计。
              </AmountInfoTooltip>
            </span>
            <strong>{summarizeRequestAmount(todoInvoices)}</strong>
            <small>{todoInvoices.length} 份 Invoice</small>
          </div>
        </article>
        <article>
          <div>
            <span>
              <i className="blue" />
              处理中金额
              <AmountInfoTooltip id="pending-arrival-amount-tip" label="处理中金额">
                当前正在审核、等待付款或收款资料复核中的 Invoice 金额合计。
              </AmountInfoTooltip>
            </span>
            <strong>{summarizeRequestAmount(processingInvoices)}</strong>
            <small>{processingInvoices.length} 份 Invoice</small>
          </div>
        </article>
        <article>
          <div>
            <span>
              <i className="green" />
              已打款金额
              <AmountInfoTooltip id="completed-amount-tip" label="已打款金额">
                关联 Invoice 已完成付款的项目金额合计。
              </AmountInfoTooltip>
            </span>
            <strong>{summarizeRequestAmount(paidInvoices)}</strong>
            <small>{paidInvoices.length} 份 Invoice</small>
          </div>
        </article>
      </section>

      <section className="content-card request-project-panel">
        <header><h2>收款</h2></header>
        <div className="toolbar request-project-toolbar">
          <div className="request-project-query-controls">
            <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Invoice 编号" aria-label="搜索 Invoice 编号" /></label>
            <label className="request-project-select">
              <FileCheck2 size={16} />
              <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)} aria-label="筛选 Invoice 审核状态">
                <option value="ALL">全部审核状态</option>
                {Object.entries(INTERNAL_REVIEW_META).map(([status, meta]) => <option key={`INTERNAL:${status}`} value={`INTERNAL:${status}`}>Comets内部合同 · {meta.label}</option>)}
                {Object.entries(EXTERNAL_COLLECTION_META).map(([status, meta]) => <option key={`EXTERNAL:${status}`} value={`EXTERNAL:${status}`}>外部 Invoice · {meta.label}</option>)}
              </select>
            </label>
            <label className="request-project-select">
              <WalletCards size={16} />
              <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as PaymentStatus | "ALL")} aria-label="筛选付款状态">
                <option value="ALL">全部付款状态</option>
                {Object.entries(PAYMENT_STATUS_META).map(([status, meta]) => <option key={status} value={status}>{meta.label}</option>)}
              </select>
            </label>
          </div>
          <div className="filter-tabs">
            {(["ALL", "TODO", "PROCESSING", "COMPLETED"] as const).map((value) => (
              <button type="button" key={value} className={value === group ? "active" : ""} onClick={() => setGroup(value)}>
                {{ ALL: "全部", TODO: "待我处理", PROCESSING: "处理中", COMPLETED: "已完成" }[value]}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <>
            <div className="table-scroll">
              <table className="data-table request-project-table">
                <thead><tr><th>Invoice 编号</th><th>类型</th><th>金额</th><th>审核状态</th><th>付款状态</th><th>更新时间</th><th>下一步</th><th /></tr></thead>
                <tbody>
                  {filtered.map((invoice, index) => {
                    const review = invoiceReviewMeta(invoice);
                    const payment = invoicePaymentMeta(invoice);
                    const task = tasks.find((item) => item.resourceId === invoiceInternalIdOf(invoice));
                    return (
                      <tr className={index === 0 && group === "ALL" && !query ? "request-priority-row" : ""} key={invoiceInternalIdOf(invoice)}>
                        <td><Link className="table-primary" to={`/invoices/${invoiceNumberOf(invoice)}`}><strong>{invoiceNumberOf(invoice)}</strong><small>{invoice.updatedAt}</small></Link></td>
                        <td>{creatorInvoiceTypeLabel(invoice)}</td>
                        <td className="amount-cell">{invoice.amount}</td>
                        <td><StatusBadge label={review.label} tone={review.tone} /></td>
                        <td><StatusBadge label={payment.label} tone={payment.tone} /></td>
                        <td className="muted-cell"><span className="request-update-time">{invoice.updatedAt}</span></td>
                        <td>{task?.group === "TODO" ? task.title.replace(`Invoice ${invoiceNumberOf(invoice)} `, "") : "查看进度"}</td>
                        <td><Link className="icon-link" title={`查看 Invoice ${invoiceNumberOf(invoice)}`} to={`/invoices/${invoiceNumberOf(invoice)}`}><ChevronRight size={17} /></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="request-mobile-list">
              {filtered.map((invoice) => {
                const review = invoiceReviewMeta(invoice);
                const payment = invoicePaymentMeta(invoice);
                const primaryStatus = invoicePrimaryStatusMeta(invoice);
                return (
                  <Link to={`/invoices/${invoiceNumberOf(invoice)}`} className="request-mobile-card" key={invoiceInternalIdOf(invoice)}>
                    <header><div><strong>{invoiceNumberOf(invoice)}</strong><small>{creatorInvoiceTypeLabel(invoice)}</small></div><StatusBadge label={primaryStatus.label} tone={primaryStatus.tone} /></header>
                    <div className="request-mobile-amount">{invoice.amount}</div>
                    <dl><div><dt>审核</dt><dd>{review.label}</dd></div><div><dt>付款</dt><dd>{payment.label}</dd></div><div><dt>更新</dt><dd>{invoice.updatedAt}</dd></div></dl>
                  </Link>
                );
              })}
            </div>
            <footer className="request-project-footer">显示 {filtered.length} 份 Invoice，共 {invoices.length} 份</footer>
          </>
        ) : <EmptyState title="没有匹配的收款" copy="请调整 Invoice 编号、任务分组或状态筛选后再试。" />}
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
  if (!adminView) {
    return linkedInvoice
      ? <Navigate to={`/invoices/${invoiceNumberOf(linkedInvoice)}`} replace />
      : <Navigate to="/" replace />;
  }
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
  const linkedContract = baseContract;
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
      <BackLink to={backTo}>{adminView ? "返回请款项目" : "返回收款"}</BackLink>
      <PageHeading title={linkedInvoice.projectName} subtitle={`${baseRequest?.id || linkedInvoice.projectId} · ${linkedInvoice.brand}`} action={<StatusBadge label={meta.label} tone={meta.tone} />} />
      <section className="detail-metrics">
        <article><span>{adminView ? "请款金额" : "收款金额"}</span><strong>{linkedInvoice.amount}</strong><small>以关联 Invoice 为准</small></article>
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
          <header><div><h2>{adminView ? "请款进程" : "收款进度"}</h2><p>{meta.description}</p></div></header>
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
  const { contracts } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Contract["status"] | "ALL">("ALL");
  const tabs: Array<Contract["status"] | "ALL"> = ["ALL", "PENDING_SIGNATURE", "ACTIVE", "EXPIRED"];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return contracts.filter((contract) => {
      const statusMatches = status === "ALL" || contract.status === status;
      const queryMatches =
        !normalized ||
        `${contract.id}${contract.fileName}${contract.amount}`
          .toLowerCase()
          .includes(normalized);
      return statusMatches && queryMatches;
    });
  }, [contracts, query, status]);
  const statusCounts = {
    PENDING_SIGNATURE: contracts.filter((contract) => contract.status === "PENDING_SIGNATURE").length,
    ACTIVE: contracts.filter((contract) => contract.status === "ACTIVE").length,
    EXPIRED: contracts.filter((contract) => contract.status === "EXPIRED").length,
  };

  return (
    <div className="page-stack">
      <PageHeading title="合同" subtitle="查看与你相关的合作合同、当前状态和完整合同文件。" />
      <section className="contract-overview" aria-label="合同概览">
        <article className="tone-neutral"><span>全部合同</span><strong>{contracts.length}</strong><small>当前账号下的所有合同</small></article>
        <article className="tone-sun"><span>待签署</span><strong>{statusCounts.PENDING_SIGNATURE}</strong><small>等待完成合同签署</small></article>
        <article className="tone-sky"><span>执行中</span><strong>{statusCounts.ACTIVE}</strong><small>当前处于履约服务周期</small></article>
        <article className="tone-cloud"><span>已过期</span><strong>{statusCounts.EXPIRED}</strong><small>合同服务周期已结束</small></article>
      </section>
      <section className="contract-list-panel">
        <div className="contract-list-toolbar">
          <label className="contract-search">
            <Search size={16} />
            <input
              aria-label="搜索合同"
              placeholder="搜索合同编号"
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
                <thead><tr><th>合同编号</th><th>合同金额</th><th>合同状态</th><th>服务周期</th><th>更新日期</th><th>操作</th></tr></thead>
                <tbody>
                  {filtered.map((contract) => (
                    <tr key={contract.id}>
                      <td><Link className="contract-table-title" to={`/contracts/${contract.id}`}><strong>{contract.id}</strong><small>{contract.fileName}</small></Link></td>
                      <td className="amount-cell">{contract.amount}</td>
                      <td><StatusBadge label={contractStatusLabel[contract.status]} tone={CONTRACT_STATUS[contract.status].tone} /></td>
                      <td className="muted-cell">{contract.servicePeriod}</td>
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
                    <Link className="contract-mobile-title" to={`/contracts/${contract.id}`}><strong>{contract.id}</strong></Link>
                    <small>{contract.fileName}</small>
                  </div>
                  <dl><div><dt>合同金额</dt><dd>{contract.amount}</dd></div><div><dt>服务周期</dt><dd>{contract.servicePeriod}</dd></div><div><dt>生效日期</dt><dd>{contract.effectiveDate}</dd></div></dl>
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
  const { contracts, profile, signContract } = useApp();
  const adminCreator = useAdminCreatorDetail(
    adminView ? creatorId : undefined,
  );
  const [obligationTab, setObligationTab] = useState<"FULFILLMENT" | "CLAIM">("FULFILLMENT");
  const [acknowledged, setAcknowledged] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signNotice, setSignNotice] = useState("");
  const [signNoticeTone, setSignNoticeTone] = useState<"success" | "danger">("success");
  const baseContract = adminView
    ? adminCreator.detail?.contracts.find((item) => item.id === id)
    : contracts.find((item) => item.id === id);
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
  const contract = baseContract;
  const contractProfile = normalizePayoutProfile(
    adminCreator.detail?.profile || profile,
  );
  const statusOrder: Contract["status"][] = ["PENDING_SIGNATURE", "ACTIVE", "EXPIRED"];
  const currentStatusIndex = statusOrder.indexOf(contract.status);
  const contractInformationTabs = [
    {
      id: "FULFILLMENT" as const,
      title: "合同确认信息",
      description: "签署前需要确认的合同主体与付款信息",
      rows: contractConfirmationRows(contract, contractProfile),
    },
    {
      id: "CLAIM" as const,
      title: "收款信息",
      description: adminView ? "敏感字段已脱敏" : "当前默认收款账户的完整信息",
      rows: contractPayoutRows(
        contractProfile,
        adminView ? "ADMIN" : "CREATOR",
      ),
    },
  ];
  const activeInformationTab = contractInformationTabs.find(
    (group) => group.id === obligationTab,
  ) ?? contractInformationTabs[0];
  return (
    <div className="page-stack">
      <BackLink to={backTo}>返回合同列表</BackLink>
      <PageHeading title={contract.id} subtitle={`合同文件 · 更新于 ${contract.updatedAt}`} action={<StatusBadge label={contractStatusLabel[contract.status]} tone={CONTRACT_STATUS[contract.status].tone} />} />
      {signNotice ? <div className={`form-alert ${signNoticeTone}`}><CheckCircle2 size={17} />{signNotice}</div> : null}
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
        {!adminView && contract.status === "PENDING_SIGNATURE" ? (
          <div className="contract-sign-panel">
            <div className="contract-sign-summary">
              <div><span>合同编号</span><strong>{contract.id}</strong></div>
              <div><span>合同金额</span><strong>{contract.amount}</strong></div>
              <div><span>服务周期</span><strong>{contract.servicePeriod}</strong></div>
              <div><span>付款方式</span><strong>Airwallex 银行转账</strong></div>
              <div><span>收款账户</span><strong>{maskPayoutIdentifier(profile.payout)}</strong></div>
            </div>
            <label className="signature-legal-consent">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span><strong>确认条款</strong>我已阅读演示合同及上述摘要，并确认提交本次演示签署记录。该功能不是真实电子签平台，不表示已完成具有法律效力的签署。</span>
            </label>
            <button
              className="primary-button"
              type="button"
              disabled={!acknowledged || signing}
              onClick={async () => {
                setSigning(true);
                try {
                  await signContract(contract.id);
                  setSignNoticeTone("success");
                  setSignNotice("合同演示签署记录已保存，状态已更新为执行中");
                } catch (caught) {
                  setSignNoticeTone("danger");
                  setSignNotice(caught instanceof Error ? caught.message : "合同签署失败，请稍后重试");
                } finally {
                  setSigning(false);
                }
              }}
            >
              <PenLine size={16} />{signing ? "签署中" : "确认并签署"}
            </button>
          </div>
        ) : null}
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
            title={`${contract.id} 合同 PDF`}
          />
          <img
            className="contract-pdf-mobile-preview"
            src="/26-kol-standard-terms-template-page-1.png"
            alt={`${contract.id} 合同首页预览`}
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
          <div className="obligation-tabs" role="tablist" aria-label="合同与收款信息">
            {contractInformationTabs.map((group) => (
              <button
                className={obligationTab === group.id ? "active" : ""}
                key={group.id}
                onClick={() => setObligationTab(group.id)}
                role="tab"
                aria-selected={obligationTab === group.id}
                type="button"
              >
                {group.title}<span>{group.rows.length}</span>
              </button>
            ))}
          </div>
          <div className="contract-obligation-content">
            <section className="contract-confirmation-information">
              <header className="obligation-panel-heading">
                <span className="resource-icon purple">
                  {obligationTab === "CLAIM" ? <Landmark size={18} /> : <FileCheck2 size={18} />}
                </span>
                <div><h2>{activeInformationTab.title}</h2><p>{activeInformationTab.description}</p></div>
              </header>
              <dl className="contract-information-list">
                {activeInformationTab.rows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

const downloadInvoiceDocument = (invoice?: Invoice) => {
  const anchor = document.createElement("a");
  anchor.href = invoice?.document?.previewUrl || "/INV-20260723-001-Alex-Ruiz.pdf";
  const mime = invoice?.document?.mimeType || "application/pdf";
  const extension = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "pdf";
  anchor.download = `${invoice ? invoiceNumberOf(invoice) : "Invoice"}.${extension}`;
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
              <p>{invoiceNumberOf(invoice)} · 交互演示</p>
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
            我确认该签名由本人创建或选择，并同意在本地原型中记录签署动作。本页仅演示业务流程，不是真实电子签服务，不构成具有法律效力的签署。确认后，签名将写入演示 Invoice 并进入审核状态。
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
  invoice,
  profile,
  onClose,
  onUploaded,
}: {
  invoice: Invoice;
  profile: UserProfile;
  onClose(): void;
  onUploaded(invoice: Invoice): void;
}) {
  const { uploadExternalInvoice, resubmitExternalInvoice } = useApp();
  const payoutAccounts = profile.payoutAccounts.filter(isPayoutAccountUsable);
  const [payoutAccountId, setPayoutAccountId] = useState(
    payoutAccounts.find((account) => account.id === profile.defaultPayoutAccountId)?.id ||
      payoutAccounts[0]?.id ||
      "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const selectedAccount = payoutAccounts.find(
    (account) => account.id === payoutAccountId,
  );
  const migratedInvoice = migrateInvoice(invoice);
  const isReupload = migratedInvoice.documentState?.kind === "EXTERNAL"
    && ["RETURNED_FOR_REUPLOAD", "RECOGNITION_FAILED"].includes(migratedInvoice.documentState.status);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAccount || !file) {
      setError("请完成收款账户和 Invoice 文件选择");
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
    setProgress(20);
    setError("");
    try {
      const previewUrl = await fileToDataUrl(file);
      setProgress(55);
      const [currency = selectedAccount.currency, rawTotal = "0"] =
        migratedInvoice.amount.split(/\s+/, 2);
      const issuedAt = new Date().toISOString().slice(0, 10);
      const input: ExternalInvoiceUploadInput = {
        invoiceId: invoiceInternalIdOf(migratedInvoice),
        payoutAccountId: selectedAccount.id,
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
      };
      const uploaded = isReupload
        ? await resubmitExternalInvoice(input)
        : await uploadExternalInvoice(input);
      setProgress(100);
      onUploaded(uploaded);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const acceptFile = (nextFile: File | null) => {
    setFile(nextFile);
    setError("");
    setProgress(0);
  };

  return (
    <div className="invoice-upload-overlay" role="presentation">
      <form className="invoice-upload-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-upload-title" onSubmit={submit}>
        <header>
          <div>
            <span><Upload size={20} /></span>
            <div><h2 id="invoice-upload-title">{isReupload ? "重新上传 Invoice" : "上传 Invoice"}</h2><p>系统将保留文件版本并模拟 OCR 识别。</p></div>
          </div>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="invoice-upload-fields">
          <label className="field">
            <span>Invoice 编号</span>
            <input value={invoiceNumberOf(migratedInvoice)} readOnly />
          </label>
          <label className="field">
            <span>Payment information *</span>
            <select value={payoutAccountId} onChange={(event) => setPayoutAccountId(event.target.value)} required>
              {!payoutAccounts.length ? <option value="">暂无可用收款账户</option> : null}
              {payoutAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} · {account.provider} · {account.currency} · {fullPayoutIdentifier(account)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="invoice-upload-reminder" role="note">
          <Info size={17} />
          <p><strong>请确认付款方式一致</strong>请选择与 Invoice 中 Payment information 一致的收款账户。若不一致，请先前往个人档案修改收款信息，或重新上传与所选账户一致的 Invoice。</p>
        </div>
        <label
          className={`invoice-file-dropzone ${file ? "has-file" : ""}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); acceptFile(event.dataTransfer.files?.[0] || null); }}
        >
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(event) => {
              acceptFile(event.target.files?.[0] || null);
            }}
          />
          <Upload size={22} />
          <strong>{file ? file.name : "选择或拖入 Invoice 文件"}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF、PNG、JPG，最大 5MB"}</span>
        </label>
        {file?.type.startsWith("image/") ? <img className="invoice-upload-preview" src={URL.createObjectURL(file)} alt="待上传 Invoice 预览" /> : null}
        {submitting ? <div className="invoice-upload-progress" role="status" aria-live="polite"><span style={{ width: `${progress}%` }} /><strong>{progress < 55 ? "正在上传 Invoice 文件" : progress < 100 ? "正在识别 Invoice 信息" : "识别完成"}</strong></div> : null}
        {error ? <div className="signature-error" role="alert"><Info size={15} />{error}</div> : null}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button" disabled={submitting || !selectedAccount || !file}>
            {submitting ? "正在识别 Invoice 信息" : isReupload ? "上传新版本" : "确认上传"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function InvoiceListPage() {
  const { invoices, tasks } = useApp();
  const location = useLocation();
  const requestedStatus = new URLSearchParams(location.search).get("status") || "";
  const initialReview = requestedStatus === "DRAFT_SIGNATURE" ? "INTERNAL:WAITING_SIGNATURE" : "ALL";
  const [reviewFilter, setReviewFilter] = useState(initialReview);
  const [paymentFilter, setPaymentFilter] = useState<Invoice["paymentStatus"] | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const migratedInvoices = useMemo(() => invoices.map(migrateInvoice), [invoices]);
  const filtered = useMemo(() => migratedInvoices.filter((invoice) => (
    (!query.trim() || normalizeInvoiceSearch(invoiceNumberOf(invoice)).includes(normalizeInvoiceSearch(query)))
    && (reviewFilter === "ALL" || invoiceReviewFilterValue(invoice) === reviewFilter)
    && (paymentFilter === "ALL" || invoice.paymentStatus === paymentFilter)
  )), [migratedInvoices, paymentFilter, query, reviewFilter]);
  useEffect(() => {
    setReviewFilter(initialReview);
  }, [initialReview]);
  return (
    <div className="page-stack">
      <PageHeading
        title="Invoice"
        subtitle="按 Invoice 编号查看文档审核和付款进度，外部 Invoice 请从对应待办记录进入上传。"
      />
      <section className="content-card">
        <div className="invoice-list-toolbar">
          <div className="invoice-toolbar-filters">
            <label className="invoice-search-field">
              <Search size={16} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 Invoice 编号"
                aria-label="搜索 Invoice 编号"
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
              <FileCheck2 size={16} />
              <select
                value={reviewFilter}
                onChange={(event) => setReviewFilter(event.target.value)}
                aria-label="筛选 Invoice 审核状态"
              >
                <option value="ALL">全部审核状态</option>
                {Object.entries(INTERNAL_REVIEW_META).map(([status, meta]) => <option key={`INTERNAL:${status}`} value={`INTERNAL:${status}`}>Comets内部合同 · {meta.label}</option>)}
                {Object.entries(EXTERNAL_COLLECTION_META).map(([status, meta]) => <option key={`EXTERNAL:${status}`} value={`EXTERNAL:${status}`}>外部 · {meta.label}</option>)}
              </select>
            </label>
            <label className="invoice-channel-filter">
              <WalletCards size={16} />
              <select value={paymentFilter || "ALL"} onChange={(event) => setPaymentFilter(event.target.value as Invoice["paymentStatus"] | "ALL")} aria-label="筛选付款状态">
                <option value="ALL">全部付款状态</option>
                {Object.entries(PAYMENT_STATUS_META).map(([status, meta]) => <option key={status} value={status}>{meta.label}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="invoice-list" role="table" aria-label="Invoice 列表">
          <div className="invoice-table-header" role="row">
            <span role="columnheader">Invoice 编号</span>
            <span role="columnheader">Invoice 类型</span>
            <span role="columnheader">金额</span>
            <span role="columnheader">审核状态</span>
            <span role="columnheader">付款状态</span>
            <span role="columnheader">更新时间</span>
            <span role="columnheader">待处理操作</span>
          </div>
          {filtered.map((invoice) => {
            const review = invoiceReviewMeta(invoice);
            const payment = invoicePaymentMeta(invoice);
            const task = tasks.find((item) => item.resourceId === invoiceInternalIdOf(invoice));
            return (
              <article className="invoice-list-row invoice-centric-row" role="row" key={invoiceInternalIdOf(invoice)}>
                <Link className="invoice-identity" role="cell" to={`/invoices/${invoiceNumberOf(invoice)}`}>
                  <span className="resource-icon peach"><ReceiptText size={17} /></span>
                  <span><strong>{invoiceNumberOf(invoice)}</strong><small>{invoice.issuedAt}</small></span>
                </Link>
                <div className="invoice-channel" role="cell">{creatorInvoiceTypeLabel(invoice)}</div>
                <div className="invoice-amount" role="cell"><strong>{invoice.amount}</strong></div>
                <div className="invoice-status-cell" role="cell"><StatusBadge label={review.label} tone={review.tone} /></div>
                <div className="invoice-status-cell" role="cell"><StatusBadge label={payment.label} tone={payment.tone} /></div>
                <div className="invoice-channel" role="cell">{invoice.updatedAt}</div>
                <div className="invoice-row-actions" role="cell">
                  <Link to={`/invoices/${invoiceNumberOf(invoice)}`} title={`查看 Invoice ${invoiceNumberOf(invoice)}`}><Eye size={15} /><span>{task?.group === "TODO" ? "去处理" : "查看"}</span></Link>
                </div>
              </article>
            );
          })}
          {!filtered.length ? (
            <EmptyState
              title={query.trim() ? "未找到匹配的 Invoice" : "暂无 Invoice"}
              copy={query.trim() ? "请尝试搜索其他 Invoice 编号。" : "当前筛选条件下没有记录。"}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ExternalInvoiceSummaryPanel({
  data,
  editable,
  busy,
  invoiceFromMatchesProfile,
  billToMatchesComets,
  onSave,
}: {
  data: InvoiceExtractedData;
  editable: boolean;
  busy: boolean;
  invoiceFromMatchesProfile: boolean;
  billToMatchesComets: boolean;
  onSave(data: InvoiceExtractedData): Promise<void>;
}) {
  const [draft, setDraft] = useState(data);
  useEffect(() => setDraft(data), [data]);
  const update = (key: keyof InvoiceExtractedData, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  return (
    <div className="invoice-summary-panel" role="tabpanel">
      <header><span className="resource-icon purple"><FileCheck2 size={17} /></span><div><h2>Invoice 摘要</h2><p>Mock OCR 识别结果与达人确认值</p></div></header>
      <dl className="external-ocr-fields">
        {([
          ["Invoice From", "invoiceFrom"],
          ["Bill To", "billTo"],
          ["Invoice date", "invoiceDate"],
          ["Currency", "currency"],
          ["Total", "total"],
        ] as const).map(([label, key]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{editable ? <input value={String(draft[key] || "")} onChange={(event) => update(key, event.target.value)} /> : <strong>{String(draft[key] || "待识别")}</strong>}
              {key === "invoiceFrom" && draft.invoiceFrom ? <small className={invoiceFromMatchesProfile ? "match-ok" : "match-error"}>{invoiceFromMatchesProfile ? "与 Real Name 一致" : "与档案 Real Name 不一致"}</small> : null}
              {key === "billTo" && draft.billTo ? <small className={billToMatchesComets ? "match-ok" : "match-error"}>{billToMatchesComets ? "主体校验通过" : "应为 COMETS INTERNATIONAL LIMITED"}</small> : null}
            </dd>
          </div>
        ))}
      </dl>
      {editable ? <button type="button" className="secondary-button external-ocr-save" disabled={busy} onClick={() => void onSave(draft)}><Pencil size={15} />保存纠正值</button> : null}
    </div>
  );
}

function InvoiceDetailPage({ adminView = false }: { adminView?: boolean }) {
  const { id, creatorId } = useParams();
  const {
    session,
    invoices,
    profile,
    signInternalInvoice,
    submitInvoiceFeedback,
    confirmExternalInvoice,
    correctExternalInvoice,
    retryExternalRecognition,
    selectInvoicePayoutAccount,
    submitPaymentAccountCorrection,
  } = useApp();
  const adminCreator = useAdminCreatorDetail(adminView ? creatorId : undefined);
  const navigate = useNavigate();
  const invoiceSource = adminView
    ? adminCreator.detail?.invoices.find((item) => item.id === id || item.invoiceNumber === id)
    : invoices.find((item) => item.id === id || item.invoiceNumber === id);
  const invoice = invoiceSource ? migrateInvoice(invoiceSource) : undefined;
  const currentProfile = normalizePayoutProfile(adminCreator.detail?.profile || profile);
  const backTo = adminView ? "/admin/invoices" : "/invoices";
  const canCreatorAct = !adminView;
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueSuccessOpen, setIssueSuccessOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerExpanded, setViewerExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "danger">("success");
  const [issueType, setIssueType] = useState("收款信息有误");
  const [submittedIssueType, setSubmittedIssueType] = useState("");
  const [issueDetails, setIssueDetails] = useState("");
  const [detailTab, setDetailTab] = useState<"SUMMARY" | "PAYOUT" | "PROCESS" | "PAYMENT">("SUMMARY");
  const [correctionAccountId, setCorrectionAccountId] = useState("");
  const [confirmationAccepted, setConfirmationAccepted] = useState(false);

  useEffect(() => {
    if (!viewerExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setViewerExpanded(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [viewerExpanded]);

  if (adminView && (adminCreator.loading || !adminCreator.detail || !invoice)) {
    return <AdminBusinessDetailFallback backTo={backTo} loading={adminCreator.loading} error={adminCreator.error} resourceName="Invoice" />;
  }
  if (!invoice) return <div className="page-stack"><BackLink to="/invoices">返回 Invoice 列表</BackLink><EmptyState title="Invoice 不存在" copy="该记录可能已被移除，或当前账号无权查看。" /></div>;

  const number = invoiceNumberOf(invoice);
  const resourceId = invoiceInternalIdOf(invoice);
  const review = invoiceReviewMeta(invoice);
  const payment = invoicePaymentMeta(invoice);
  const kind = invoiceTypeOf(invoice);
  const state = invoice.documentState!;
  const paymentIssue = invoice.paymentIssue;
  const repairSubmitted = recoveryStatusIsSubmitted(invoice.paymentRecoveryStatus);
  const [amountCurrency = currentProfile.payout.currency || "USD", amountTotal = "0"] = invoice.amount.split(/\s+/, 2);
  const extractedData = invoice.extractedData || (kind === "EXTERNAL" ? {
    invoiceFrom: "",
    billTo: "",
    invoiceDate: "",
    currency: "",
    total: "",
    paymentDetails: {},
    invoiceFromMatchesProfile: false,
    billToMatchesComets: false,
  } : {
    invoiceFrom: currentProfile.legalName,
    billTo: "COMETS INTERNATIONAL LIMITED",
    invoiceDate: invoice.issuedAt,
    currency: amountCurrency,
    total: amountTotal.replace(/,/g, ""),
    paymentDetails: payoutAccountPaymentDetails(currentProfile.payout),
    invoiceFromMatchesProfile: true,
    billToMatchesComets: true,
  });
  const usablePayoutAccounts = currentProfile.payoutAccounts.filter(isPayoutAccountUsable);
  const selectedPayoutAccount = usablePayoutAccounts.find((account) => account.id === invoice.payoutAccountId)
    || usablePayoutAccounts.find((account) => account.id === currentProfile.defaultPayoutAccountId)
    || currentProfile.payout;
  const paymentComparison = compareInvoicePaymentDetails(extractedData.paymentDetails, selectedPayoutAccount);
  const payoutCurrencyMatches = normalizeInvoiceIdentity(selectedPayoutAccount.currency) === normalizeInvoiceIdentity(extractedData.currency);
  const payoutInformationMatches = paymentComparison.matches && payoutCurrencyMatches;
  const invoiceFromMatchesProfile = normalizeInvoiceIdentity(extractedData.invoiceFrom) === normalizeInvoiceIdentity(currentProfile.legalName);
  const billToMatchesComets = normalizeInvoiceIdentity(extractedData.billTo) === normalizeInvoiceIdentity("COMETS INTERNATIONAL LIMITED");
  const [expectedCurrency = amountCurrency, expectedTotal = amountTotal] = invoice.amount.split(/\s+/, 2);
  const amountMatches = Number(extractedData.total.replace(/,/g, "")) === Number(expectedTotal.replace(/,/g, ""));
  const currencyMatches = normalizeInvoiceIdentity(extractedData.currency) === normalizeInvoiceIdentity(expectedCurrency);
  const canConfirmExternal = payoutInformationMatches && invoiceFromMatchesProfile && billToMatchesComets && amountMatches && currencyMatches;
  const isAwaitingSignature = state.kind === "INTERNAL" && state.status === "WAITING_SIGNATURE";
  const canUpload = state.kind === "EXTERNAL" && ["WAITING_UPLOAD", "RETURNED_FOR_REUPLOAD", "RECOGNITION_FAILED"].includes(state.status);
  const payoutSnapshot = invoice.payoutSnapshot
    || createInvoicePayoutSnapshot(selectedPayoutAccount, invoice.issuedAt);
  const internalPayoutRows = payoutSnapshotRows(
    payoutSnapshot,
    adminView ? "ADMIN" : "CREATOR",
  );
  const fullSelectedIdentifier = fullPayoutIdentifier(selectedPayoutAccount);
  const visiblePayoutRows = adminView
    ? payoutSnapshotRows(payoutSnapshot, "ADMIN").map((row) => [row.label, row.value] as [string, string])
    : creatorPayoutRows(selectedPayoutAccount);
  const paymentIssueCurrentValue = fullSelectedIdentifier;

  const runAction = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setNotice("");
    try {
      await action();
      setNoticeTone("success");
      setNotice(success);
      return true;
    } catch (caught) {
      setNoticeTone("danger");
      setNotice(caught instanceof Error ? caught.message : "操作失败，请稍后重试");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sign = async (signature: InvoiceSignature) => {
    setBusy(true);
    try {
      await signInternalInvoice(resourceId, signature);
      setNoticeTone("success");
      setNotice("Invoice 已签署并进入审核");
    } catch (caught) {
      setNoticeTone("danger");
      setNotice(caught instanceof Error ? caught.message : "签署失败，请稍后重试");
      throw caught;
    } finally {
      setBusy(false);
    }
  };

  const submitIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const succeeded = await runAction(
        () => submitInvoiceFeedback(resourceId, {
          issueType,
          details: issueDetails,
          submittedBy: session?.userId || currentProfile.id,
        }),
        "Invoice 反馈已提交",
      );
      if (!succeeded) return;
      setSubmittedIssueType(issueType);
      setIssueOpen(false);
      setIssueSuccessOpen(true);
      setIssueDetails("");
    } catch {
      // Error is rendered by the shared page notice.
    }
  };

  const paymentTimeline = invoice.paymentStatus === "FAILED"
    ? [
        ["审核通过", "complete"],
        ["待付款", "complete"],
        ["付款处理中", "complete"],
        ["付款失败", "error"],
        ["等待修改收款信息", repairSubmitted ? "complete" : "current"],
        ["收款资料已提交复核", repairSubmitted ? "current" : "pending"],
        ["等待重新付款", ["READY_FOR_RETRY", "RETRY_SUBMITTED", "RETRY_SUCCEEDED"].includes(invoice.paymentRecoveryStatus || "") ? "current" : "pending"],
        ["付款处理中", invoice.paymentRecoveryStatus === "RETRY_SUBMITTED" ? "current" : "pending"],
        ["付款成功", invoice.paymentRecoveryStatus === "RETRY_SUCCEEDED" ? "complete" : "pending"],
      ] as const
    : [
        ["审核通过", state.status === "APPROVED" ? "complete" : "pending"],
        ["等待付款", invoice.paymentStatus === "WAITING_PAYMENT" ? "current" : "complete"],
        ["付款处理中", invoice.paymentStatus === "PROCESSING" ? "current" : invoice.paymentStatus === "PAID" ? "complete" : "pending"],
        ["付款成功", invoice.paymentStatus === "PAID" ? "complete" : "pending"],
      ] as const;

  return (
    <div className="page-stack">
      <BackLink to={backTo}>返回 Invoice 列表</BackLink>
      <PageHeading
        title={number}
        subtitle={`${creatorInvoiceTypeLabel(invoice)} · ${currentProfile.social.platform} ${currentProfile.social.handle} · 更新于 ${invoice.updatedAt}`}
        action={invoice.document || kind === "INTERNAL" ? <button type="button" className="secondary-button" onClick={() => downloadInvoiceDocument(invoice)}><Download size={15} />下载 PDF</button> : undefined}
      />
      {notice ? <div className={`form-alert ${noticeTone}`}><CheckCircle2 size={17} />{notice}</div> : null}
      <div className="invoice-prototype-notice" role="note"><Info size={16} /><p><strong>原型说明</strong>当前文件、OCR、签署、审核和付款进度均为本地 MockApiAdapter 演示，不是真实支付或生产系统记录。</p></div>
      <section className="invoice-detail-metrics" aria-label="Invoice 概览">
        <article><span>审核状态</span><strong><i className={`invoice-metric-accent tone-${review.tone}`} />{review.label}</strong><small>{kind === "INTERNAL" ? "Comets内部合同流程" : "外部 Invoice 收集流程"}</small></article>
        <article><span>Invoice 金额</span><strong>{invoice.amount}</strong><small>{kind === "EXTERNAL" ? (invoice.extractedData ? `${extractedData.currency} · Mock OCR 识别` : "等待上传后识别") : `${extractedData.currency} · 系统生成`}</small></article>
        <article><span>付款状态</span><strong><i className={`invoice-metric-accent tone-${payment.tone}`} />{payment.label}</strong><small>{invoice.paymentExpectedAt ? `预计处理：${invoice.paymentExpectedAt}` : "与 Invoice 审核状态独立"}</small></article>
      </section>

      {invoice.paymentStatus === "FAILED" ? (
        <section className="payment-issue-alert" role="alert">
          <span className="payment-issue-alert-icon"><Info size={18} /></span>
          <div className="payment-issue-alert-content">
            <div><strong>付款失败</strong><span>{repairSubmitted ? "收款资料已提交复核" : "等待修改收款信息"}</span></div>
            <p>{invoice.paymentFailureReason || paymentIssue?.message || "收款资料未通过付款校验"}</p>
            {paymentIssue ? <dl><div><dt>错误字段</dt><dd>{paymentIssue.fieldLabel}</dd></div><div><dt>当前信息</dt><dd>{paymentIssueCurrentValue || "待补充"}</dd></div></dl> : null}
          </div>
        </section>
      ) : invoice.rejectedReason ? <div className="form-alert danger"><Info size={17} /><div><strong>退回原因</strong><p>{invoice.rejectedReason}</p></div></div> : null}

      {isAwaitingSignature ? <div className="invoice-verification-notice" role="note"><Info size={18} /><div><strong>签署前请仔细核对 Invoice 信息</strong><p>请确认收款信息、金额及币种准确无误；如有疑问，请先提交信息反馈。</p><p className="invoice-verification-responsibility">本地签署仅用于演示核对和审核流程，不是真实电子签服务。</p></div></div> : null}

      <div className="document-layout">
        <section className={`invoice-viewer-card ${viewerExpanded ? "is-expanded" : ""}`}>
          <header className="invoice-viewer-toolbar">
            <div><span className="invoice-viewer-icon"><FileText size={18} /></span><span><strong>Invoice 全文</strong><small>{number} · {invoice.sourceFileVersions?.length || (invoice.document ? 1 : 0)} 个文件版本</small></span></div>
            <div className="invoice-viewer-actions">
              <button type="button" className="invoice-expand-button" title={viewerExpanded ? "退出放大查看" : "放大查看 Invoice"} aria-pressed={viewerExpanded} onClick={() => setViewerExpanded((expanded) => !expanded)}>{viewerExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{viewerExpanded ? "退出放大" : "放大查看"}</button>
              {invoice.document || kind === "INTERNAL" ? <button type="button" className="invoice-download-button" title={`下载 Invoice ${number}`} onClick={() => downloadInvoiceDocument(invoice)}><Download size={15} />下载 PDF</button> : null}
            </div>
          </header>
          <div className="invoice-document-stage">
            {invoice.document ? (
              <article className="invoice-paper invoice-source-paper uploaded-invoice-paper">
                {invoice.document.previewUrl && invoice.document.mimeType === "application/pdf" ? <iframe className="invoice-uploaded-pdf" src={invoice.document.previewUrl} title={`Invoice ${number} 文件`} /> : <img className="invoice-source-image" src={invoice.document.previewUrl || "/INV-20260723-001-Alex-Ruiz-page-1.png"} alt={`Invoice ${number} 全文`} />}
                {invoice.signature ? <img className="invoice-source-signature" src={invoice.signature.dataUrl} alt="已保存的签名" /> : null}
              </article>
            ) : (
              <div className="invoice-document-empty"><Upload size={28} /><strong>{state.kind === "EXTERNAL" ? "尚未上传 Invoice 文件" : "正在加载演示 Invoice"}</strong>{canCreatorAct && canUpload ? <button type="button" className="primary-button" onClick={() => setUploadOpen(true)}><Upload size={16} />上传 Invoice</button> : null}</div>
            )}
          </div>
        </section>

        <aside className="document-sidebar">
          <section className="invoice-inspection-card">
            <div className="invoice-inspection-tabs" role="tablist" aria-label="Invoice 详情信息">
              {([ ["SUMMARY", "Invoice 摘要"], ["PAYOUT", "收款信息"], ["PROCESS", "处理状态"], ["PAYMENT", "付款状态"] ] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={detailTab === value} className={detailTab === value ? "active" : ""} onClick={() => setDetailTab(value)}>{label}</button>)}
            </div>
            {detailTab === "SUMMARY" && kind === "EXTERNAL" ? <ExternalInvoiceSummaryPanel data={extractedData} editable={canCreatorAct && ["WAITING_CONFIRMATION", "RETURNED_FOR_CORRECTION"].includes(state.status)} busy={busy} invoiceFromMatchesProfile={invoiceFromMatchesProfile} billToMatchesComets={billToMatchesComets} onSave={async (next) => { await runAction(() => correctExternalInvoice(resourceId, next), "纠正值已保存，原始 OCR 结果已保留"); }} /> : null}
            {detailTab === "SUMMARY" && kind === "INTERNAL" ? <div className="invoice-summary-panel" role="tabpanel"><header><span className="resource-icon purple"><FileCheck2 size={17} /></span><div><h2>Invoice 摘要</h2><p>系统生成信息</p></div></header><dl><div><dt>Invoice 编号</dt><dd><strong>{number}</strong></dd></div><div><dt>Invoice 类型</dt><dd><strong>{creatorInvoiceTypeLabel(invoice)}</strong></dd></div><div><dt>Invoice From</dt><dd><strong>{extractedData.invoiceFrom}</strong></dd></div><div><dt>Bill To</dt><dd><strong>{extractedData.billTo}</strong></dd></div><div><dt>Invoice date</dt><dd><strong>{extractedData.invoiceDate}</strong></dd></div><div><dt>Currency / Total</dt><dd><strong>{extractedData.currency} {extractedData.total}</strong></dd></div></dl></div> : null}
            {detailTab === "PAYOUT" && kind === "INTERNAL" ? <div className="invoice-payout-panel invoice-payout-snapshot" role="tabpanel"><header><div><h2>收款信息</h2><p>由支付管理端同步</p></div><span className="invoice-snapshot-label">只读快照</span></header><dl className="invoice-payment-compare-list">{internalPayoutRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd><strong>{row.value}</strong></dd></div>)}</dl></div> : null}
            {detailTab === "PAYOUT" && kind === "EXTERNAL" ? <div className="invoice-payout-panel" role="tabpanel"><header><div><h2>收款账户比对</h2><p>{adminView ? "管理员只读视图按既有规则隐藏敏感值" : "仅当前登录达人可查看自己的完整收款信息"}</p></div><StatusBadge label={payoutInformationMatches ? "信息一致" : "账户不匹配"} tone={payoutInformationMatches ? "success" : "danger"} /></header>{canCreatorAct && invoice.paymentStatus !== "FAILED" && ["WAITING_UPLOAD", "WAITING_CONFIRMATION", "RETURNED_FOR_CORRECTION", "RETURNED_FOR_REUPLOAD", "RECOGNITION_FAILED"].includes(state.status) ? <label className="field invoice-account-select"><span>收款账户</span><select value={selectedPayoutAccount.id} onChange={(event) => void runAction(() => selectInvoicePayoutAccount(resourceId, event.target.value), "收款账户已更新")}>{usablePayoutAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.provider} · {account.currency} · {fullPayoutIdentifier(account)}</option>)}</select></label> : null}{!payoutInformationMatches ? <div className="invoice-account-mismatch" role="alert"><Info size={17} /><div><strong>收款账户不匹配</strong><p>{!payoutCurrencyMatches ? `所选账户币种 ${selectedPayoutAccount.currency} 与 Invoice 币种 ${extractedData.currency || "待识别"} 不一致。` : "请核对下方标记为“不一致”的具体字段。"} 请选择其他已验证账户、更新个人档案，或上传与账户一致的 Invoice。</p></div></div> : <div className="invoice-account-match"><CheckCircle2 size={17} /><span>Invoice 已识别的收款字段及币种均与所选账户一致。</span></div>}<dl className="invoice-payment-compare-list">{visiblePayoutRows.map(([label, value]) => { const key = Object.entries(PAYMENT_DETAIL_LABELS).find(([, currentLabel]) => currentLabel === label)?.[0]; const compared = key ? paymentComparison.fields.find((field) => field.key === key) : undefined; return <div key={label}><dt>{label}</dt><dd><strong>{value}</strong>{label === "Currency" && !payoutCurrencyMatches ? <span className="match-error">不一致</span> : compared ? <span className={compared.matches === false ? "match-error" : "match-ok"}>{compared.matches === false ? "不一致" : <Check size={12} />}</span> : null}</dd></div>; })}</dl></div> : null}
            {detailTab === "PROCESS" ? <div className="invoice-process-panel" role="tabpanel"><header><div><h2>处理状态</h2><p>采集、审核与付款进度都记录在同一个 Invoice 下</p></div><StatusBadge label={review.label} tone={review.tone} /></header>{invoice.returnReason || invoice.rejectedReason ? <div className="payment-repair-note"><Info size={17} /><span>{invoice.returnReason || invoice.rejectedReason}</span></div> : null}<div className="invoice-history-log"><h3>完整操作记录</h3>{[...(invoice.reviewHistory || [])].reverse().map((event) => <article key={event.eventId}><span>{event.action}</span><div><strong>{event.actor}</strong><small>{new Date(event.occurredAt).toLocaleString("zh-CN", { hour12: false })}</small>{event.reason ? <p>{event.reason}</p> : null}</div></article>)}{!invoice.reviewHistory?.length ? invoice.operationHistory?.map((event) => <article key={event.id}><span>{event.label}</span><div><strong>{event.actor}</strong><small>{new Date(event.occurredAt).toLocaleString("zh-CN", { hour12: false })}</small>{event.reason ? <p>{event.reason}</p> : null}</div></article>) : null}</div><div className="invoice-action-stack">{canCreatorAct && state.kind === "EXTERNAL" && state.status === "WAITING_CONFIRMATION" ? <><label className="invoice-confirmation-check"><input type="checkbox" checked={confirmationAccepted} onChange={(event) => setConfirmationAccepted(event.target.checked)} /><span>我已核对 Invoice 文件、金额、币种、开票主体及收款信息，并确认以上信息准确。</span></label>{!canConfirmExternal ? <div className="signature-error" role="alert"><Info size={15} />请先修正页面中标记的开票主体、Bill To、金额、币种或收款账户字段。</div> : null}<button className="primary-button" type="button" disabled={busy || !canConfirmExternal || !confirmationAccepted} onClick={() => void runAction(() => confirmExternalInvoice(resourceId), "Invoice 已确认并提交审核")}><FileCheck2 size={16} />确认并提交审核</button></> : null}{canCreatorAct && state.kind === "EXTERNAL" && state.status === "RETURNED_FOR_CORRECTION" ? <button className="primary-button" type="button" disabled={busy} onClick={() => { setDetailTab("SUMMARY"); }}><Pencil size={16} />修改并重新提交</button> : null}{canCreatorAct && state.kind === "EXTERNAL" && state.status === "RECOGNITION_FAILED" ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void runAction(() => retryExternalRecognition(resourceId), "重新识别完成，请核对结果")}><RefreshCcw size={16} />重新识别</button> : null}{canCreatorAct && canUpload ? <button className="primary-button" type="button" onClick={() => setUploadOpen(true)}><Upload size={16} />{state.kind === "EXTERNAL" && state.status === "WAITING_UPLOAD" ? "上传 Invoice" : "重新上传 Invoice"}</button> : null}{canCreatorAct && isAwaitingSignature ? <button className="invoice-issue-button" type="button" onClick={() => setIssueOpen(true)}><Info size={16} />Invoice 信息有误</button> : null}{canCreatorAct && isAwaitingSignature ? <button className="primary-button" disabled={busy} onClick={() => setSignatureOpen(true)}><PenLine size={16} />签署 Invoice</button> : null}<button className="invoice-action-download-button" type="button" onClick={() => downloadInvoiceDocument(invoice)}><Download size={16} />下载 Invoice</button></div></div> : null}
            {detailTab === "PAYMENT" ? <div className="invoice-process-panel" role="tabpanel"><header><div><h2>付款状态</h2><p>{invoice.expectedPaymentAt || invoice.paymentExpectedAt ? `预计付款时间：${invoice.expectedPaymentAt || invoice.paymentExpectedAt}` : "付款进度更新至原 Invoice"}</p></div><StatusBadge label={payment.label} tone={payment.tone} /></header><dl className="invoice-payment-card"><div><dt>Invoice 编号</dt><dd>{number}</dd></div><div><dt>金额和币种</dt><dd>{invoice.amount}</dd></div>{visiblePayoutRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}{invoice.paidAt || invoice.paymentCompletedAt ? <div><dt>付款完成时间</dt><dd>{invoice.paidAt || invoice.paymentCompletedAt}</dd></div> : null}{invoice.paymentFailureReason ? <div><dt>付款失败原因</dt><dd>{invoice.paymentFailureReason}</dd></div> : null}</dl><div className="compact-timeline invoice-full-timeline">{paymentTimeline.map(([label, status]) => <div className={status} key={label}><span>{status === "complete" ? <Check size={13} /> : status === "current" ? <Clock3 size={12} /> : status === "error" ? <Info size={13} /> : null}</span><div><strong>{label}</strong></div></div>)}</div>{canCreatorAct && invoice.paymentStatus === "FAILED" && !repairSubmitted ? <div className="invoice-action-stack"><button className="payment-edit-button" type="button" onClick={() => navigate(`/profile?repairInvoice=${number}&field=${paymentIssue?.fieldKey || "account_number"}#payout-information`)}><Pencil size={16} />修改收款信息</button><label className="field invoice-account-select"><span>或选择其他已验证账户</span><select value={correctionAccountId} onChange={(event) => setCorrectionAccountId(event.target.value)}><option value="">请选择</option>{usablePayoutAccounts.filter((account) => account.id !== invoice.payoutAccountId).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.provider} · {account.currency} · {fullPayoutIdentifier(account)}</option>)}</select></label><button className="payment-retry-button" type="button" disabled={!correctionAccountId || busy} onClick={() => void runAction(() => submitPaymentAccountCorrection(resourceId, { payoutAccountId: correctionAccountId, submittedBy: session?.userId || currentProfile.id }), "收款资料已提交复核")}><FileCheck2 size={16} />提交资料复核</button></div> : null}{repairSubmitted ? <div className="review-note"><Clock3 size={17} /><span>收款资料已提交复核，后续财务复核和重新付款由系统处理。</span></div> : null}</div> : null}
          </section>
        </aside>
      </div>

      {canCreatorAct && signatureOpen ? <SignatureModal invoice={invoice} signerName={currentProfile.legalName} payoutAccountName={currentProfile.payout.accountHolder || currentProfile.legalName} onClose={() => setSignatureOpen(false)} onConfirm={sign} /> : null}
      {canCreatorAct && uploadOpen && state.kind === "EXTERNAL" ? <InvoiceUploadModal invoice={invoice} profile={currentProfile} onClose={() => setUploadOpen(false)} onUploaded={() => { setUploadOpen(false); setDetailTab("SUMMARY"); setNoticeTone("success"); setNotice("识别结果已在当前页面展示，请逐项核对后提交审核"); }} /> : null}
      {canCreatorAct && issueOpen && isAwaitingSignature ? <div className="invoice-issue-modal-overlay" role="presentation"><form className="invoice-issue-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-issue-title" onSubmit={(event) => void submitIssue(event)}><header><div><span className="invoice-issue-modal-icon"><Info size={19} /></span><div><h2 id="invoice-issue-title">反馈 Invoice 信息问题</h2><p>请说明不准确的信息，工作人员会尽快核查。</p></div></div><button type="button" className="icon-button" title="关闭" onClick={() => setIssueOpen(false)}><X size={18} /></button></header><label className="field"><span>问题类型</span><select value={issueType} onChange={(event) => setIssueType(event.target.value)}><option>收款信息有误</option><option>金额或币种有误</option><option>Invoice 主体有误</option><option>其他信息有误</option></select></label><label className="field"><span>问题说明</span><textarea value={issueDetails} onChange={(event) => setIssueDetails(event.target.value)} placeholder="请描述需要核查或修改的内容" required /></label><footer><button type="button" className="secondary-button" onClick={() => setIssueOpen(false)}>取消</button><button type="submit" className="primary-button" disabled={!issueDetails.trim() || busy}>提交反馈</button></footer></form></div> : null}
      {issueSuccessOpen ? <div className="profile-save-overlay" role="presentation"><section className="profile-save-dialog" role="dialog" aria-modal="true" aria-labelledby="invoice-issue-success-title"><span className="profile-save-icon success"><CheckCircle2 size={25} /></span><h2 id="invoice-issue-success-title">反馈提交成功</h2><p>“{submittedIssueType}”已持久化记录，可在操作历史中查看。</p><button type="button" className="primary-button" onClick={() => setIssueSuccessOpen(false)}>知道了</button></section></div> : null}
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

function SocialBrandIcon({ platform }: { platform: string }) {
  if (platform === "YouTube") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ff0033" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z"/><path fill="#fff" d="m9.6 15.6 6.2-3.6-6.2-3.6v7.2Z"/></svg>;
  }
  if (platform === "Instagram") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="instagram-brand-gradient" x1="2" y1="22" x2="22" y2="2"><stop stopColor="#ffd600"/><stop offset=".45" stopColor="#ff0069"/><stop offset="1" stopColor="#7638fa"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#instagram-brand-gradient)"/><circle cx="12" cy="12" r="4.25" fill="none" stroke="#fff" strokeWidth="1.8"/><circle cx="17.7" cy="6.4" r="1.15" fill="#fff"/></svg>;
  }
  if (platform === "TikTok") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#25f4ee" d="M14.2 3h2.6a4.7 4.7 0 0 0 3.1 3.8v2.7a7.3 7.3 0 0 1-3.1-1v6.4a5.9 5.9 0 1 1-5.1-5.8v2.8a3.1 3.1 0 1 0 2.5 3V3Z" transform="translate(-.7 .35)"/><path fill="#fe2c55" d="M14.2 3h2.6a4.7 4.7 0 0 0 3.1 3.8v2.7a7.3 7.3 0 0 1-3.1-1v6.4a5.9 5.9 0 1 1-5.1-5.8v2.8a3.1 3.1 0 1 0 2.5 3V3Z" transform="translate(.7 -.35)"/><path fill="#17171d" d="M14.2 3h2.6a4.7 4.7 0 0 0 3.1 3.8v2.7a7.3 7.3 0 0 1-3.1-1v6.4a5.9 5.9 0 1 1-5.1-5.8v2.8a3.1 3.1 0 1 0 2.5 3V3Z"/></svg>;
  }
  return <Globe2 size={20} aria-hidden="true" />;
}

function ProfilePage() {
  const {
    profile,
    invoices,
    saveProfile,
    submitPaymentAccountCorrection,
  } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const repairParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const repairInvoiceId = repairParams.get("repairInvoice");
  const repairFieldKey = repairParams.get("field") || "";
  const repairInvoice = invoices.find((item) => item.id === repairInvoiceId || invoiceNumberOf(item) === repairInvoiceId);
  const repairIssue = repairInvoice?.paymentIssue;
  const hasRepairContext = Boolean(repairInvoiceId && repairIssue);
  const isRepairFlow = Boolean(
    repairInvoiceId &&
      repairInvoice?.paymentStatus === "FAILED" &&
      repairInvoice?.paymentRecoveryStatus === "AWAITING_CREATOR_UPDATE" &&
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
  const [transferMethods, setTransferMethods] = useState<
    AirwallexTransferMethodOption[]
  >([]);
  const [transferMethodsLoading, setTransferMethodsLoading] = useState(true);
  const [transferMethodsError, setTransferMethodsError] = useState("");
  const [resolvedTransferScenario, setResolvedTransferScenario] = useState("");
  const preserveNextTransferMethodRef = useRef(true);
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
    preserveNextTransferMethodRef.current = true;
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
    const scenario = transferMethodScenarioKey(condition);
    setTransferMethodsLoading(true);
    setTransferMethodsError("");
    services.payout
      .listTransferMethods({
        bankCountryCode: condition.bankCountryCode,
        accountCurrency: condition.accountCurrency,
        entityType: condition.entityType,
      })
      .then((result) => {
        if (!active) return;
        setTransferMethods(result.data);
        const currentMethod = result.data.find(
          (method) =>
            method.value === condition.transferMethod && method.available,
        );
        const recommended = result.data.find(
          (method) => method.recommended && method.available,
        );
        const nextMethod =
          preserveNextTransferMethodRef.current && currentMethod
            ? currentMethod
            : recommended || currentMethod;
        preserveNextTransferMethodRef.current = false;
        if (nextMethod && nextMethod.value !== condition.transferMethod) {
          updateCondition({ transferMethod: nextMethod.value });
        }
        setResolvedTransferScenario(scenario);
        setTransferMethodsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setTransferMethodsError("转账方式加载失败，请重试。");
        setResolvedTransferScenario(scenario);
        setTransferMethodsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    condition.accountCurrency,
    condition.bankCountryCode,
    condition.entityType,
  ]);

  useEffect(() => {
    let active = true;
    if (
      transferMethodsLoading ||
      resolvedTransferScenario !== transferMethodScenarioKey(condition)
    ) {
      return;
    }
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
    resolvedTransferScenario,
    transferMethodsLoading,
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
      if (!schema || schemaLoading || transferMethodsLoading) {
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
        await submitPaymentAccountCorrection(
          repairInvoiceId,
          {
            fieldKey: repairIssue.fieldKey,
            correctedValue: schemaValues[repairIssue.fieldKey] || "",
            submittedBy: profile.id,
          },
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
  const socialEvidence = normalizeSocialEvidence(draft.social);
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
      evidence: socialEvidence[url] || [],
    };
  });

  const uploadSocialEvidence = (
    profileUrl: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;
    setDraft((current) => {
      const evidenceByProfileUrl = normalizeSocialEvidence(current.social);
      const fileRefs = selectedFiles.map((file, index) => ({
        id: `social-proof-${Date.now()}-${index}`,
        name: file.name,
        mimeType: file.type || "image/png",
        size: file.size,
      }));
      const nextEvidence = {
        ...evidenceByProfileUrl,
        [profileUrl]: fileRefs,
      };
      const flattened = Object.values(nextEvidence).flat();
      return {
        ...current,
        social: {
          ...current.social,
          evidenceByProfileUrl: nextEvidence,
          screenshots: flattened,
          screenshot: flattened[0],
        },
      };
    });
    event.target.value = "";
  };

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
    preserveNextTransferMethodRef.current = true;
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
    if (payoutAccountsForChannel(normalizePayoutProfile(draft).payoutAccounts, "AIRWALLEX").length) {
      setPayoutToast("每个收款渠道最多保留一个账户。");
      return;
    }
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
      `已将“${account.name}”设为默认收款账户`,
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
        "收款账户已删除",
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
      "收款账户已停用",
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
      "收款账户已重新启用",
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
            <p>发起付款时发现“{repairIssue.fieldLabel}”无法通过校验。请修改标记字段并完成 Airwallex 校验；保存成功后系统将自动提交收款资料复核。</p>
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
          <span>默认收款账户</span>
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
              <article className="profile-social-account-card" key={item.url}>
                <div className="profile-social-account-main">
                  <span className={`social-brand-icon social-brand-${item.platform.toLowerCase()}`}><SocialBrandIcon platform={item.platform} /></span>
                  <div><strong>{item.platform}</strong><span>{item.accountName}</span></div>
                  {!profileEditing ? <StatusBadge label="已认证" tone="success" /> : null}
                  <a href={item.url} target="_blank" rel="noreferrer" aria-label={`查看 ${item.platform} 主页`}><ExternalLink size={14} /></a>
                </div>
                <div className="profile-social-evidence">
                  <span>认证截图</span>
                  <div className="profile-resource-list">
                    {item.evidence.length
                      ? item.evidence.map((file) => <span key={file.id}>{file.name}</span>)
                      : <span>未上传</span>}
                  </div>
                  {profileEditing ? (
                    <label className="social-evidence-upload">
                      <Upload size={14} />上传认证截图
                      <input type="file" accept="image/png,image/jpeg" multiple onChange={(event) => uploadSocialEvidence(item.url, event)} />
                    </label>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="detail-card form-detail-card profile-section-card">
          <header>
            <div><span className="profile-section-icon profile-section-icon-contact"><ReceiptText size={17} /></span><div><h2>Invoice 联系资料</h2><p>用于 Invoice 的 From 信息</p></div></div>
            <UserRound size={19} />
          </header>
          <div className="form-grid profile-contact-grid">
            <label><span>显示名称 / Display name</span><input readOnly aria-readonly="true" value={normalizedDraft.displayName} /></label>
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
            <div><span className="profile-section-icon profile-section-icon-payout"><WalletCards size={17} /></span><div><h2>收款账户</h2><p>按收款渠道查看账户，并指定一个默认账户用于新的付款</p></div></div>
            <StatusBadge label={`${selectedUsablePayoutAccounts.length} 个可用`} tone={selectedUsablePayoutAccounts.length ? "success" : "danger"} />
          </header>

          <div
            className="payout-channel-selector"
            role="tablist"
            aria-label="收款渠道"
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
            aria-label={`${selectedPayoutChannelConfig.label} 收款账户`}
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
                  <strong>{selectedPayoutChannelConfig.label} 暂无收款账户</strong>
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
                        <span className="payout-default-star" aria-label="默认收款账户" title="默认收款账户">
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
            {!payoutAccountsForChannel(payoutAccounts, "AIRWALLEX").length ? <button type="button" className="secondary-button" disabled={payoutAccountEditing} onClick={addAirwallexAccount}>
              <Plus size={15} />Airwallex 账户
            </button> : null}
            {!payoutAccountsForChannel(payoutAccounts, "PAYPAL").length ? <button
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
            </button> : null}
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
            {schemaLoading || transferMethodsLoading ? <StatusBadge label="正在同步" tone="amber" /> : schemaError || transferMethodsError ? <StatusBadge label="同步失败" tone="danger" /> : <StatusBadge label="已同步" tone="success" />}
          </header>
          <div className="form-grid airwallex-condition-grid profile-condition-grid">
            <label>
              <span>国家 / Country *</span>
              <select disabled={!editing || schemaLoading || transferMethodsLoading} value={condition.bankCountryCode} onChange={(event) => updateCondition({ bankCountryCode: event.target.value })}>
                {AIRWALLEX_COUNTRIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>收款人类型 / Recipient type *</span>
              <select disabled={!editing || schemaLoading || transferMethodsLoading} value={condition.entityType} onChange={(event) => updateCondition({ entityType: event.target.value as "PERSONAL" | "COMPANY" })}>
                <option value="PERSONAL">个人 / Individual</option>
                <option value="COMPANY">企业 / Company</option>
              </select>
            </label>
            <label>
              <span>账户币种 / Account currency *</span>
              <select disabled={!editing || schemaLoading || transferMethodsLoading} value={condition.accountCurrency} onChange={(event) => updateCondition({ accountCurrency: event.target.value })}>
                {["USD", "EUR", "GBP", "JPY", "AUD", "HKD", "SGD"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>转账方式 / Transfer method *</span>
              <select disabled={!editing || schemaLoading || transferMethodsLoading} value={condition.transferMethod} onChange={(event) => updateCondition({ transferMethod: event.target.value as "LOCAL" | "SWIFT" })}>
                {transferMethods.length ? (
                  transferMethods.map((method) => (
                    <option key={method.value} value={method.value} disabled={!method.available}>
                      {transferMethodLabel(method)}
                    </option>
                  ))
                ) : (
                  <option value={condition.transferMethod}>
                    {condition.transferMethod === "LOCAL" ? "本地转账 / Local transfer" : "国际电汇 / SWIFT"}
                  </option>
                )}
              </select>
            </label>
          </div>
          {transferMethodsError ? <div className="form-alert danger">{transferMethodsError}</div> : null}
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
          {schemaLoading || transferMethodsLoading ? (
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
              aria-label="收款账户编辑操作"
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
                    ? "请先更换默认收款账户"
                    : payoutDialog.operation === "DELETE"
                      ? "删除收款账户？"
                      : "停用收款账户？"}
                </h2>
                <p id="payout-account-dialog-description">
                  {payoutDialog.kind === "REPLACE_DEFAULT"
                    ? "该账户是当前默认收款账户，请选择一个新的默认账户后继续。"
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
                <strong>选择新的默认收款账户</strong>
                {replacementAccounts.length ? (
                  <div className="payout-replacement-list" role="radiogroup" aria-label="新的默认收款账户">
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
                    <span>当前没有其他可用账户，请先新增收款账户并完成验证。</span>
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
                    ? "Airwallex 校验已通过，收款资料已提交复核。"
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
