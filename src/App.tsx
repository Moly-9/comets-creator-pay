import {
  AlertCircle,
  ArrowRight,
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
  KeyRound,
  Link2,
  LogOut,
  Mail,
  Maximize2,
  Menu,
  Minimize2,
  MoreHorizontal,
  Pencil,
  PenLine,
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
  lazy,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link as RouterLink,
  type LinkProps,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import Select from "./Select";
import i18n from "./i18n";
import { useTranslation } from "react-i18next";
import { displayCopy } from "./display-copy";
import { DEMO_INVITATION_CODE, DEMO_SOCIAL_SCREENSHOT, DEMO_SOCIAL_URL, demonstrationRegistrationValues, fillEmptyFields } from "./registration-demo";
import { AuthContext, useAuth } from "./hooks/useAuth";
import { resolveDataScope, useDataScope } from "./hooks/useDataScope";
import AdminBanner from "./components/AdminBanner";
import LangSwitch from "./components/LangSwitch";
import UserProfileCard from "./components/UserProfileCard";
import SelectUser from "./pages/admin/SelectUser";
import { adminReturnPath, clearAdminCreator, rememberAdminCreator } from "./admin-view-context";
import {
  AdminAuditPage,
  AdminContractsPage,
  AdminInvoicesPage,
  AdminLayout,
  AdminSessionProvider,
  AdminRequestProjectsPage,
  AdminUserDetailPage,
  AdminUsersPage,
} from "./AdminPortal";
import CreatorHome from "./CreatorHome";
import ProfileTransferMethods from "./ProfileTransferMethods";
import { passwordRequirements, validateAccountPassword } from "./auth-validation";
import { notificationDisplay } from "./notifications/display";
import { type AddSocialAccountInput, mergeAddedSocialAccount, SocialAccountError, socialProfileIsDemoVerified, validateSocialAccountAddition } from "./social-accounts";
const PdfPages = lazy(() => import("./invoices/external/PdfPages"));
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
  invoiceDetailPaymentMeta,
  invoiceLifecycleTimeline,
  invoiceMatchesStatusFilters,
  summarizeInvoiceList,
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
  payoutAccountChangedSinceSnapshot,
  creatorHomepageSocialSummary,
  creatorInvoiceTypeLabel,
  getSocialAccountName,
  normalizeSocialEvidence,
  payoutSnapshotRows,
} from "./creator-display";
import { relativeUpdateTime, sortInvoicesByUpdatedAtDescending } from "./creator-home";
import { attemptsForInvoice, failedPaymentSnapshot, findLinkedContract, invoicePaymentState, legacyPaymentAttempt, linkInvoicesToContracts, sumInvoiceAmounts } from "./payment-relations";
import {
  type AuthService,
  AirwallexBeneficiaryValidationError,
  buildProfileSupplementalFields,
  fillAirwallexDemoValues,
  isValidEmailAddress,
  normalizeAirwallexSchemaValue,
  reconcileAirwallexSchemaValues,
  resolveAirwallexTransferMethod,
  sanitizeEnglishAccountName,
  services,
  sortInvoices,
  payoutAccountPaymentDetails,
  validateAirwallexSchemaValues,
} from "./services";
import { canCorrectExternalInvoice, currentExternalCorrection, payoutAccountFingerprint } from "./invoices/external/workflow";
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
  PaymentAttempt,
  OnboardingDraft,
  PaymentAccountCorrectionInput,
  PaymentRetryMode,
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
  bank_country: "Bank country",
  swift_code: "SWIFT code",
  iban: "IBAN",
  transfer_method: "Transfer method",
  beneficiary_type: "Beneficiary type",
  paypal_email: "PayPal email",
  payment_method: "付款方式 / Payment method",
};

const fullPayoutIdentifier = (account: PayoutAccount) =>
  account.accountNumber
  || account.schemaValues.account_number
  || account.schemaValues.iban
  || account.accountEmail
  || "待补充";

const creatorPayoutRows = (account: PayoutAccount) => [
  ["付款方式 / Payment method", account.provider === "PayPal" ? "PayPal" : "Bank Transfer"],
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
  const invoice = [...linked].sort((a, b) => {
    const urgency = (status: InvoiceStatus) => ({ PAYMENT_FAILED: 0, CHANGES_REQUIRED: 1, DRAFT_SIGNATURE: 2, PENDING_CONFIRMATION: 3, PENDING_REVIEW: 4, APPROVED: 5, PAID: 6 })[status];
    return urgency(a.status) - urgency(b.status);
  })[0];
  if (!invoice) return request;
  return {
    ...request,
    amount: sumInvoiceAmounts(linked),
    status: invoice.status,
    invoiceStatus: INVOICE_STATUS[invoice.status].label,
    updatedAt: invoice.updatedAt,
    issues: invoice.status === "PAYMENT_FAILED" ? request.issues : [],
    progress: buildInvoiceDrivenRequestProgress(invoice),
  };
};

interface AppState {
  session: Session | null;
  adminDetail: AdminUserDetail | null;
  loadedScopeId: string | null;
  adminLoadError: string;
  profile: UserProfile;
  contracts: Contract[];
  invoices: Invoice[];
  paymentAttempts: PaymentAttempt[];
  tasks: CreatorTask[];
  notifications: CreatorNotification[];
  login(email: string, password: string): Promise<Session>;
  register(name: string, email: string, password: string, invitationCode: string): Promise<void>;
  completeOnboarding(profile: UserProfile): Promise<void>;
  saveProfile(profile: UserProfile): Promise<void>;
  addSocialAccount(input: AddSocialAccountInput): Promise<UserProfile>;
  signContract(id: string, signature: InvoiceSignature): Promise<void>;
  signInternalInvoice(id: string, signature: InvoiceSignature): Promise<void>;
  submitInvoiceFeedback(id: string, input: InvoiceFeedbackInput): Promise<void>;
  uploadExternalInvoice(input: ExternalInvoiceUploadInput): Promise<Invoice>;
  confirmExternalInvoice(id: string): Promise<void>;
  confirmExternalInvoicePage(id: string, page: "INVOICE" | "PAYOUT", payoutDifferenceDecision?: "USE_BOUND_ACCOUNT"): Promise<void>;
  correctExternalInvoice(id: string, extractedData: InvoiceExtractedData): Promise<void>;
  resubmitExternalInvoice(input: ExternalInvoiceUploadInput): Promise<Invoice>;
  retryExternalRecognition(id: string): Promise<void>;
  selectInvoicePayoutAccount(id: string, payoutAccountId: string): Promise<void>;
  submitPaymentAccountCorrection(id: string, input: PaymentAccountCorrectionInput): Promise<void>;
  requestPaymentRetry(id: string, mode: PaymentRetryMode, payoutAccountId: string): Promise<void>;
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

/** Keep the selected Creator ID on every shared-page link. Legacy /admin links are unchanged. */
function Link({ to, ...props }: LinkProps) {
  const auth = useAuth();
  const location = useLocation();
  const selected = new URLSearchParams(location.search).get("userId");
  const scoped = auth?.role === "admin" && selected && typeof to === "string"
    && /^\/(home|contracts|invoices|payments|profile|requests)(\/|\?|$)/.test(to);
  if (!scoped) return <RouterLink to={to} {...props} />;
  const [path, search = ""] = to.split("?");
  const params = new URLSearchParams(search);
  params.set("userId", selected);
  return <RouterLink to={`${path}?${params}`} {...props} />;
}

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
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(readSession);
  const [adminDetail, setAdminDetail] = useState<AdminUserDetail | null>(null);
  const [loadedScopeId, setLoadedScopeId] = useState<string | null>(null);
  const [adminLoadError, setAdminLoadError] = useState("");
  const loadSequence = useRef(0);
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
  const [paymentAttempts, setPaymentAttempts] = useState<PaymentAttempt[]>([]);
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
    const sequence = ++loadSequence.current;
    if (session?.role === "ADMIN") {
      const requestedId = new URLSearchParams(location.search).get("userId");
      const target = /^\/(home|contracts|invoices|payments|profile)(\/|$)/.test(location.pathname)
        ? resolveDataScope(session, requestedId) : undefined;
      setAdminDetail(null);
      setAdminLoadError("");
      setLoadedScopeId(null);
      setContracts([]);
      setInvoices([]);
      setTasks([]);
      setPaymentAttempts([]);
      setNotifications([]);
      if (target) void services.creatorScope.read(session.sessionId, target).then(({ data }) => {
        if (loadSequence.current !== sequence) return;
        rememberAdminCreator(target);
        setAdminDetail(data.detail);
        setProfile(data.detail.profile || initialProfile);
        setContracts(data.detail.contracts);
        setInvoices(data.detail.invoices);
        setPaymentAttempts(data.attempts);
        setTasks(data.tasks);
        setLoadedScopeId(target);
      }).catch((error: unknown) => { if (loadSequence.current === sequence) setAdminLoadError(error instanceof Error ? error.message : "达人资料加载失败"); });
      return;
    }
    if (session?.role === "CREATOR") {
      Promise.all([
        services.invoices.list(session.userId),
        services.contracts.list(session.userId),
        services.payments.listCreatorAttempts(session.userId),
      ]).then(([invoiceResult, contractResult, attemptResult]) => {
        setInvoices(invoiceResult.data);
        setContracts(contractResult.data);
        setPaymentAttempts(attemptResult.data);
      });
      void refreshWorkflowCollections(session.userId);
    } else {
      setInvoices([]);
      setContracts([]);
      setTasks([]);
      setPaymentAttempts([]);
      setNotifications([]);
    }
    if (session?.role === "CREATOR") {
      services.profile
        .get(session.userId)
        .then((result) => setProfile(result.data));
    }
  }, [session?.userId, session?.role, session?.sessionId, session?.role === "ADMIN" ? location.pathname : "", session?.role === "ADMIN" ? location.search : ""]);

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
    adminDetail,
    loadedScopeId,
    adminLoadError,
    profile,
    contracts,
    invoices,
    paymentAttempts,
    tasks,
    notifications,
    login: async (email, password) => {
      const result = await services.auth.login(email, password);
      persistSession(result.data);
      if (result.data.role === "CREATOR") {
        const profileResult = await services.profile.get(result.data.userId);
        setProfile(profileResult.data);
      }
      return result.data;
    },
    register: async (name, email, password, invitationCode) => {
      const result = await services.auth.register(name, email, password, invitationCode);
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
      if (!session) throw new Error("登录会话已失效");
      services.creatorScope.assertWrite(session.sessionId, nextProfile.id);
      const result = await services.profile.save(nextProfile);
      setProfile(result.data);
    },
    addSocialAccount: async (input) => {
      const result = await services.profile.addSocialAccount(input);
      setProfile(result.data);
      return result.data;
    },
    signContract: async (id, signature) => {
      if (!session) throw new Error("登录会话已失效");
      services.creatorScope.assertWrite(session.sessionId, session.userId);
      const result = await services.contracts.signContract(id, session, signature);
      setContracts((items) => items.map((item) => item.id === id ? result.data : item));
      const invoiceResult = await services.invoices.list(session.userId);
      setInvoices(invoiceResult.data);
      await refreshWorkflowCollections(session.userId);
    },
    signInternalInvoice: async (id, signature) => {
      if (session) services.creatorScope.assertWrite(session.sessionId, session.userId);
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
      services.creatorScope.assertWrite(session.sessionId, session.userId);
      const result = await services.invoices.submitFeedback(id, input);
      replaceInvoice(result.data);
      await refreshWorkflowCollections(session.userId);
    },
    uploadExternalInvoice: async (input) => {
      if (!session) throw new Error("登录会话已失效");
      services.creatorScope.assertWrite(session.sessionId, session.userId);
      const current = invoices.find((item) => invoiceInternalIdOf(item) === input.invoiceId);
      if (!current) throw new Error("Invoice 不存在");
      const uploaded = await services.invoices.uploadExternalInvoiceFile({
        invoiceId: input.invoiceId,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("upload"),
        file: input.file,
        fileBlob: input.fileBlob,
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
      services.creatorScope.assertWrite(session.sessionId, session.userId);
      const current = invoices.find((item) => invoiceInternalIdOf(item) === id);
      if (!current) throw new Error("Invoice 不存在");
      const result = await services.invoices.confirmExternalInvoice({
        invoiceId: id,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("confirm"),
      });
      replaceInvoice(result.data);
      if (session) await refreshWorkflowCollections(session.userId);
    },
    confirmExternalInvoicePage: async (id, page, payoutDifferenceDecision) => {
      if (!session) throw new Error("登录会话已失效");
      services.creatorScope.assertWrite(session.sessionId, session.userId);
      const current = invoices.find((item) => invoiceInternalIdOf(item) === id);
      if (!current) throw new Error("Invoice 不存在");
      const result = await services.invoices.confirmExternalInvoicePage({
        invoiceId: id,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId(`confirm-${page.toLowerCase()}`),
        page,
        payoutDifferenceDecision,
      });
      replaceInvoice(result.data);
    },
    correctExternalInvoice: async (id, extractedData) => {
      if (!session) throw new Error("登录会话已失效");
      services.creatorScope.assertWrite(session.sessionId, session.userId);
      const current = invoices.find((item) => invoiceInternalIdOf(item) === id);
      if (!current) throw new Error("Invoice 不存在");
      const result = await services.invoices.correctExternalInvoiceRecognition({
        invoiceId: id,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("correct"),
        values: {
          SOURCE_INVOICE_NUMBER: currentExternalCorrection(current)?.values.SOURCE_INVOICE_NUMBER || current.recognitionSnapshots?.at(-1)?.fields.SOURCE_INVOICE_NUMBER || "",
          INVOICE_DATE: extractedData.invoiceDate,
          PUBLISHER: extractedData.invoiceFrom,
          ADVERTISER: extractedData.billTo,
          DESCRIPTION: extractedData.description || "",
          AMOUNT: extractedData.total,
          CURRENCY: extractedData.currency,
          PAYMENT_ACCOUNT: JSON.stringify(extractedData.paymentDetails),
        },
      });
      replaceInvoice(result.data);
      if (session) await refreshWorkflowCollections(session.userId);
    },
    resubmitExternalInvoice: async (input) => {
      if (!session) throw new Error("登录会话已失效");
      services.creatorScope.assertWrite(session.sessionId, session.userId);
      const current = invoices.find((item) => invoiceInternalIdOf(item) === input.invoiceId);
      if (!current) throw new Error("Invoice 不存在");
      const uploaded = await services.invoices.uploadExternalInvoiceFile({
        invoiceId: input.invoiceId,
        creatorId: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("reupload"),
        file: input.file,
        fileBlob: input.fileBlob,
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
      services.creatorScope.assertWrite(session.sessionId, session.userId);
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
      services.creatorScope.assertWrite(session.sessionId, session.userId);
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
      if (!session) throw new Error("登录会话已失效");
      services.creatorScope.assertWrite(session.sessionId, session.userId);
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
    requestPaymentRetry: async (id, mode, payoutAccountId) => {
      if (!session) throw new Error("登录会话已失效");
      services.creatorScope.assertWrite(session.sessionId, session.userId);
      const current = invoices.find((item) => invoiceInternalIdOf(item) === id);
      if (!current) throw new Error("Invoice 不存在");
      const result = await services.payments.requestPaymentRetry(id, {
        mode,
        payoutAccountId,
        submittedBy: session.userId,
        expectedVersion: current.version || 1,
        clientRequestId: invoiceClientRequestId("payment-retry-request"),
      });
      replaceInvoice(result.data);
      await refreshWorkflowCollections(session.userId);
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
      clearAdminCreator();
      clearOnboardingDraft(session?.userId);
      persistSession(null);
    },
  };

  return <AuthContext.Provider value={session}><AppContext.Provider value={value}>{children}</AppContext.Provider></AuthContext.Provider>;
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
  const { t } = useTranslation();
  return (
    <span className={`status-badge tone-${tone}`}>
      <i aria-hidden="true" />
      {displayCopy(label, t)}
    </span>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <FileText size={26} />
      <strong>{displayCopy(title, t)}</strong>
      <span>{displayCopy(copy, t)}</span>
    </div>
  );
}

function LoadingRows() {
  const { t } = useTranslation();
  return (
    <div className="loading-rows" aria-label={t("common.loading")}>
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
        to="/admin/select-user"
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

function SharedWorkspaceRoute() {
  const { session, loadedScopeId, adminLoadError } = useApp();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace />;
  if (session.role === "CREATOR") {
    if (!session.onboardingComplete) return <Navigate to="/onboarding/social-verification" replace />;
    return <Outlet />;
  }
  const requestedId = new URLSearchParams(location.search).get("userId");
  const target = resolveDataScope(session, requestedId);
  if (!target) return <Navigate to="/admin/select-user" replace state={{ accessDenied: "请选择有效的达人账号。" }} />;
  if (adminLoadError) return <div className="admin-scope-loading" role="alert">{displayCopy(adminLoadError, i18n.t)} · <Link to="/admin/select-user">{i18n.t("admin.backToCreatorSelection")}</Link></div>;
  if (loadedScopeId !== target) return <div className="admin-scope-loading" role="status">{i18n.t("admin.loadingCreatorProfile")}</div>;
  return <Outlet />;
}

function AdminRoute() {
  const { session, logout } = useApp();
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
  return <AdminSessionProvider session={session} logout={logout}><Outlet /></AdminSessionProvider>;
}

function PublicOnlyRoute() {
  const { session } = useApp();
  if (session?.role === "ADMIN") return <Navigate to="/admin/select-user" replace />;
  if (session?.onboardingComplete) return <Navigate to="/" replace />;
  return <Outlet />;
}

function AdminLayoutBridge() {
  const { session, logout } = useApp();
  if (!session) return null;
  return <AdminLayout session={session} logout={logout} />;
}

function SelectUserRoute() {
  const { logout } = useApp();
  const navigate = useNavigate();
  return <SelectUser onLogout={() => { logout(); navigate("/login", { replace: true }); }} />;
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
  const { t } = useTranslation();
  const { session } = useApp();
  const navigate = useNavigate();

  return (
    <nav
      className="auth-progress"
      aria-label={t("auth.registrationProgress", { current: currentStep })}
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
            aria-label={t("auth.stepLabel", { step, state: isComplete ? t("auth.stepCompleted") : isCurrent ? t("auth.currentStep") : "" })}
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

function AuthBrandPanel() {
  return <section className="auth-brand-panel">
    <Brand />
    <div className="auth-brand-copy">
      <span className="eyebrow">COMETS PAYMENT PORTAL</span>
      <h1>Every collaboration, clearly settled.</h1>
      <p>Track contracts, Invoices, and payments in one place—without chasing updates or missing documents.</p>
    </div>
    <div className="auth-benefits">
      <span><ShieldCheck size={17} /> Secure document checks</span>
      <span><Clock3 size={17} /> Approval progress at a glance</span>
      <span><WalletCards size={17} /> Cross-border payment tracking</span>
    </div>
  </section>;
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
      <AuthBrandPanel />
      <section className="auth-form-panel">
        <div className="auth-lang-switch"><LangSwitch /></div>
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
  const { t } = useTranslation();
  const { login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("lea.martin@creator.example");
  const [password, setPassword] = useState("creator2026");
  const [showPassword, setShowPassword] = useState(false);
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
      navigate(session.role === "ADMIN" ? "/admin/select-user" : "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <header>
          <span className="eyebrow">{t("auth.welcomeBack")}</span>
          <h2>{t("auth.accountLogin")}</h2>
          <p>{t("auth.loginDescription")}</p>
        </header>
        {error ? <div className="form-alert danger">{t(error === "请输入有效邮箱和至少 6 位密码" ? "auth.invalidLoginCredentials" : error === "登录失败" ? "auth.loginFailed" : error, { defaultValue: error })}</div> : null}
        <label>
          <span>{t("auth.emailAddress")}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("auth.enterEmail")}
          />
        </label>
        <label>
          <span>{t("auth.password")}</span>
          <span className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.enterPassword")}
            />
            <button
              type="button"
              aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
              title={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        <div className="form-meta">
          <label className="checkbox-label">
            <input type="checkbox" defaultChecked />
            <span>{t("auth.keepSignedIn")}</span>
          </label>
          <Link className="text-button auth-forgot-link" to="/forgot-password" state={{ email }}>{t("auth.forgotPassword")}</Link>
        </div>
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? <RefreshCcw className="spin" size={17} /> : null}
          {submitting ? t("auth.signingIn") : t("auth.signIn")}
        </button>
        <p className="auth-switch">{t("auth.noAccount")} <Link to="/register">{t("auth.signUpNow")}</Link></p>
      </form>
    </AuthShell>
  );
}

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const initialEmail = (location.state as { email?: string } | null)?.email || "";
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<AuthService["requestPasswordReset"]>>["data"] | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (!retryAfter) return;
    const timer = window.setInterval(() => setRetryAfter((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter > 0]);

  const requestReset = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!isValidEmailAddress(email)) {
      setError(t("auth.invalidEmail"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await services.auth.requestPasswordReset(email);
      setResult(response.data);
      setRetryAfter(response.data.retryAfterSeconds);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.passwordResetRequestFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <form className="auth-form password-reset-form" onSubmit={requestReset} noValidate>
        <header>
          <span className="password-reset-icon"><Mail size={21} /></span>
          <span className="eyebrow">{t("auth.accountSecurity")}</span>
          <h2>{t("auth.resetPassword")}</h2>
          <p>{t("auth.resetPasswordDescription")}</p>
        </header>
        {result ? (
          <section className="password-reset-result" aria-live="polite">
            <span className="password-reset-result-icon"><CheckCircle2 size={22} /></span>
            <div>
              <strong>{t("auth.resetEmailSent")}</strong>
              <p>{t("auth.resetEmailSentDescription", { email: result.maskedEmail })}</p>
            </div>
          </section>
        ) : (
          <label>
            <span>{t("auth.emailAddress")}</span>
            <input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder={t("auth.enterEmail")} autoFocus />
          </label>
        )}
        {error ? <div className="form-alert danger" role="alert">{error}</div> : null}
        {result?.demoToken ? (
          <Link className="password-reset-demo-link" to={`/reset-password?token=${encodeURIComponent(result.demoToken)}`}>
            <Sparkles size={16} />
            <span><strong>{t("auth.openDemoResetLink")}</strong><small>{t("auth.demoResetLinkDescription")}</small></span>
            <ChevronRight size={16} />
          </Link>
        ) : null}
        {result ? (
          <div className="password-reset-actions">
            <button className="secondary-button" type="button" disabled={submitting || retryAfter > 0} onClick={() => void requestReset()}>
              {retryAfter > 0 ? t("auth.resendAfter", { seconds: retryAfter }) : t("auth.resendEmail")}
            </button>
            <button className="text-button" type="button" onClick={() => { setResult(null); setRetryAfter(0); setError(""); }}>{t("auth.changeEmail")}</button>
          </div>
        ) : (
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? <RefreshCcw className="spin" size={17} /> : <Mail size={17} />}
            {submitting ? t("auth.sendingResetEmail") : t("auth.sendResetEmail")}
          </button>
        )}
        <p className="auth-switch"><Link to="/login"><ChevronLeft size={14} /> {t("auth.backToLogin")}</Link></p>
      </form>
    </AuthShell>
  );
}

function ResetPasswordPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [verification, setVerification] = useState<"loading" | "valid" | "invalid">("loading");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [invalidReason, setInvalidReason] = useState<"EXPIRED" | "USED" | "INVALID">("INVALID");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const requirements = passwordRequirements(password);

  useEffect(() => {
    let active = true;
    services.auth.verifyPasswordReset(token).then(({ data }) => {
      if (!active) return;
      if (data.valid) {
        setMaskedEmail(data.maskedEmail || "");
        setVerification("valid");
      } else {
        setInvalidReason(data.reason || "INVALID");
        setVerification("invalid");
      }
    }).catch(() => {
      if (active) setVerification("invalid");
    });
    return () => { active = false; };
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateAccountPassword(password);
    if (validation) {
      setError(t(registrationErrorKeys[validation] || "auth.passwordComposition"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await services.auth.completePasswordReset(token, password);
      window.localStorage.removeItem("comets-creator-session");
      setCompleted(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(t({
        "密码需为 8–20 位字符": "auth.passwordLength",
        "密码不能包含空格": "auth.passwordNoSpaces",
        "密码须同时包含大写字母、小写字母和数字": "auth.passwordComposition",
        "新密码不能与当前密码相同": "auth.newPasswordMustDiffer",
        "密码重置链接已失效，请重新申请": "auth.resetLinkExpired",
      }[message] || "auth.passwordResetFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const returnToLogin = () => window.location.assign("/login?reset=success");

  return (
    <AuthShell>
      <form className="auth-form password-reset-form" onSubmit={submit} noValidate>
        {verification === "loading" ? <div className="password-reset-loading" role="status"><RefreshCcw className="spin" size={21} /> {t("auth.verifyingResetLink")}</div> : null}
        {verification === "invalid" ? (
          <>
            <header>
              <span className="password-reset-icon is-error"><AlertCircle size={21} /></span>
              <span className="eyebrow">{t("auth.accountSecurity")}</span>
              <h2>{t("auth.resetLinkUnavailable")}</h2>
              <p>{t(`auth.resetLink${invalidReason === "EXPIRED" ? "Expired" : invalidReason === "USED" ? "Used" : "Invalid"}`)}</p>
            </header>
            <Link className="primary-button" to="/forgot-password">{t("auth.requestNewResetLink")}</Link>
            <p className="auth-switch"><Link to="/login"><ChevronLeft size={14} /> {t("auth.backToLogin")}</Link></p>
          </>
        ) : null}
        {verification === "valid" && !completed ? (
          <>
            <header>
              <span className="password-reset-icon"><KeyRound size={21} /></span>
              <span className="eyebrow">{t("auth.accountSecurity")}</span>
              <h2>{t("auth.createNewPassword")}</h2>
              <p>{t("auth.createNewPasswordDescription", { email: maskedEmail })}</p>
            </header>
            <label>
              <span>{t("auth.newPassword")}</span>
              <div className="password-field">
                <input type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder={t("auth.complexPasswordPlaceholder")} autoFocus />
                <button type="button" aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>
            <div className="password-requirements" aria-label={t("auth.passwordRulesLabel")}>
              {([
                ["length", "auth.passwordRuleLength"],
                ["uppercase", "auth.passwordRuleUppercase"],
                ["lowercase", "auth.passwordRuleLowercase"],
                ["number", "auth.passwordRuleNumber"],
                ["noSpaces", "auth.passwordRuleNoSpaces"],
              ] as const).map(([key, label]) => <span className={requirements[key] ? "is-valid" : ""} key={key}><Check size={12} /> {t(label)}</span>)}
            </div>
            <label>
              <span>{t("auth.confirmNewPassword")}</span>
              <input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} placeholder={t("auth.enterPasswordAgain")} />
            </label>
            {error ? <div className="form-alert danger" role="alert">{error}</div> : null}
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? <RefreshCcw className="spin" size={17} /> : <ShieldCheck size={17} />}
              {submitting ? t("auth.updatingPassword") : t("auth.confirmPasswordReset")}
            </button>
          </>
        ) : null}
        {verification === "valid" && completed ? (
          <>
            <header>
              <span className="password-reset-icon is-success"><CheckCircle2 size={22} /></span>
              <span className="eyebrow">{t("auth.accountSecurity")}</span>
              <h2>{t("auth.passwordUpdated")}</h2>
              <p>{t("auth.passwordUpdatedDescription")}</p>
            </header>
            <button className="primary-button" type="button" onClick={returnToLogin}>{t("auth.returnToSignIn")}</button>
          </>
        ) : null}
      </form>
    </AuthShell>
  );
}

export type RegistrationValues = {
  email: string;
  password: string;
  invitationCode: string;
};

export function validateDemoInvitation(code: string, agreed: boolean): string {
  if (!code.trim()) return "请输入邀请码";
  if (code.trim() !== DEMO_INVITATION_CODE) return "邀请码无效，请使用下方的演示邀请码";
  if (!agreed) return "请阅读并同意服务协议、隐私政策与数据处理协议";
  return "";
}

export function validateRegistration(
  values: RegistrationValues,
  agreed: boolean,
): string {
  if (!isValidEmailAddress(values.email)) {
    return "请输入有效的邮箱地址";
  }
  const passwordError = validateAccountPassword(values.password);
  if (passwordError) return passwordError;
  return validateDemoInvitation(values.invitationCode, agreed);
}

// Validation still returns its established domain messages; only the visible copy is localized.
const registrationErrorKeys: Record<string, string> = {
  "请输入邀请码": "auth.invitationRequired",
  "邀请码无效，请使用下方的演示邀请码": "auth.invalidInvitation",
  "请阅读并同意服务协议、隐私政策与数据处理协议": "auth.agreementRequired",
  "请输入有效的邮箱地址": "auth.invalidEmail",
  "密码需为 8–20 位字符": "auth.passwordLength",
  "密码不能包含空格": "auth.passwordNoSpaces",
  "密码须同时包含大写字母、小写字母和数字": "auth.passwordComposition",
  "账号创建失败，请重试": "auth.registrationFailed",
  "Google 注册失败，请重试": "auth.googleRegistrationFailed",
};

function RegisterPage() {
  const { t } = useTranslation();
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
      const provisionalName = values.email.startsWith("creator.demo+")
        ? "Alex Morgan"
        : values.email.split("@")[0].replace(/[._-]+/g, " ").trim() || "Creator";
      await register(provisionalName, values.email, values.password, values.invitationCode.trim());
      navigate("/onboarding/social-verification");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账号创建失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const registerWithGoogle = async () => {
    const validationError = validateDemoInvitation(values.invitationCode, agreed);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await register("Google Creator", demonstrationRegistrationValues().email, "google-oauth", values.invitationCode.trim());
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
          <div className="register-header-actions"><LangSwitch /><p>{t("auth.haveAccount")} <Link to="/login">{t("auth.signIn")}</Link></p></div>
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
            <h1>{t(reviewingRegistration ? "auth.registrationInformation" : "auth.createAccount")}</h1>
            <p>
              {reviewingRegistration
                ? t("auth.registrationCreatedDescription")
                : t("auth.registrationDescription")}
            </p>
          </header>

          {reviewingRegistration ? (
            <>
              <section className="registered-account-review" aria-label={t("auth.registeredAccount")}>
                <CheckCircle2 size={21} />
                <span>
                  <small>{t("auth.registeredEmail")}</small>
                  <strong>{session?.email}</strong>
                </span>
                <StatusBadge label={t("auth.accountCreated")} tone="success" />
              </section>
              <div className="registered-account-security-note">
                {t("auth.passwordNotStored")}
              </div>
              <button className="register-primary" type="submit">
                {t("auth.continueSocialVerification")} <ChevronRight size={17} />
              </button>
            </>
          ) : (
            <>
              {error ? <div className="form-alert danger" role="alert">{t(registrationErrorKeys[error] || error, { defaultValue: error })}</div> : null}

              <button className="registration-demo-button" type="button" onClick={() => setValues((current) => fillEmptyFields(current, demonstrationRegistrationValues()))}>
                <Sparkles size={15} /> {t("auth.fillDemoData")}
              </button>

              <label>
            <span>{t("auth.emailAddress")} <b>*</b></span>
            <input
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={(event) => setValues({ ...values, email: event.target.value })}
              placeholder="name@example.com"
            />
            <small>{t("auth.useInvitationEmail")}</small>
              </label>

              <label>
            <span>{t("auth.password")} <b>*</b></span>
            <span className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                maxLength={20}
                value={values.password}
                onChange={(event) => setValues({ ...values, password: event.target.value })}
                placeholder={t("auth.complexPasswordPlaceholder")}
                aria-describedby="register-password-requirements"
              />
              <button
                type="button"
                aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
                title={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
            <small id="register-password-requirements">
              {t("auth.passwordRequirements")}
            </small>
              </label>

              <label>
            <span>{t("auth.invitationCode")} <b>*</b></span>
            <input
              required
              value={values.invitationCode}
              onChange={(event) => setValues({ ...values, invitationCode: event.target.value })}
              placeholder={t("auth.invitationCodePlaceholder")}
            />
            <small>{t("auth.demoInvitationCode", { code: DEMO_INVITATION_CODE })}</small>
              </label>

              <label className="register-agreement">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              {t("auth.agreePrefix")} <a href="#terms">{t("auth.terms")}</a>、<a href="#privacy">{t("auth.privacy")}</a>
              {t("auth.and")} <a href="#data">{t("auth.dataProcessing")}</a>
            </span>
              </label>

              <button className="register-primary" type="submit" disabled={submitting}>
            {submitting ? <RefreshCcw className="spin" size={17} /> : null}
            {t(submitting ? "auth.creatingAccount" : "auth.startRegistration")}
              </button>

              <div className="register-divider"><span>{t("auth.or")}</span></div>

              <button
                className="register-google"
                type="button"
                disabled={submitting}
                onClick={registerWithGoogle}
              >
                <Globe2 size={17} />
                {t("auth.registerWithGoogle")}
              </button>

              <p className="register-login-link">{t("auth.haveAccount")} <Link to="/login">{t("auth.signInNow")}</Link></p>
            </>
          )}
        </form>
      </section>

      <aside className="register-story" aria-label="COMETS Creator Pay">
        <AuthBrandPanel />
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
  const { t } = useTranslation();
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
          <span className="eyebrow">{t("auth.socialStep")}</span>
          <h2>{t("auth.socialTitle")}</h2>
          <p>{t("auth.socialDescription")}</p>
        </header>
        {error ? <div className="form-alert danger">{displayCopy(error, t)}</div> : null}
        <button type="button" className="registration-demo-button" onClick={() => {
          setProfileUrls((current) => current.map((url, index) => index === 0 && !url.trim() ? DEMO_SOCIAL_URL : url));
          setFiles((current) => current.length ? current : [DEMO_SOCIAL_SCREENSHOT]);
          setVerification("idle");
          setError("");
        }}><Sparkles size={15} /> {t("auth.fillDemoData")}</button>
        <fieldset className="social-links-fieldset">
          <legend>{t("auth.profileLinks")}</legend>
          <div className="social-link-list">
            {profileUrls.map((url, index) => (
              <div className="social-link-row" key={`profile-url-${index}`}>
                <input
                  aria-label={t("auth.profileLinkNumber", { number: index + 1 })}
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
                    aria-label={t("auth.removeProfileLink", { number: index + 1 })}
                    title={t("auth.removeLink")}
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
            <Plus size={16} /> {t("auth.addProfileLink")}
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
            <strong>{files.length ? t("auth.screenshotsUploaded", { count: files.length }) : t("auth.uploadScreenshots")}</strong>
            <span>{t("auth.screenshotLimit")}</span>
          </label>
          {files.length ? (
            <div className="uploaded-file-list">
              {files.map((file) => (
                <div key={file.id}>
                  {file.previewUrl ? <img className="social-upload-preview" src={file.previewUrl} alt={t("auth.screenshotPreview", { name: file.name })} /> : <FileCheck2 size={16} />}
                  <span><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB</small></span>
                  <button
                    type="button"
                    aria-label={t("auth.removeFile", { name: file.name })}
                    title={t("auth.removeScreenshot")}
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
            <div><strong>{t("auth.accountVerified")}</strong><p>{t("auth.verificationSuccess")}</p></div>
          </div>
        ) : (
          <button
            className="secondary-button social-verify-button"
            type="button"
            disabled={verification === "verifying"}
            onClick={verifyAccount}
          >
            {verification === "verifying" ? <RefreshCcw className="spin" size={17} /> : <ShieldCheck size={17} />}
            {t(verification === "verifying" ? "auth.verifyingOwnership" : "auth.verifyOwnership")}
          </button>
        )}
        <button className="primary-button" type="submit" disabled={verification !== "verified"}>
          {t("auth.continueProfile")} <ChevronRight size={17} />
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

function OnboardingProfilePage() {
  const { t } = useTranslation();
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
  const [transferMethodsExpanded, setTransferMethodsExpanded] = useState(false);
  const [resolvedTransferScenario, setResolvedTransferScenario] = useState("");
  const preserveInitialTransferMethodRef = useRef(Boolean(savedDraft?.profile));
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [providerExpanded, setProviderExpanded] = useState(false);

  const fillDemonstrationProfile = () => {
    setForm((current) => ({
      ...current,
      legalName: current.legalName.trim() || "Alex Morgan",
      phone: current.phone.trim() || "+33 612345678",
      email: current.email.trim() || session?.email || "creator.demo@example.com",
      address: current.address.trim() || "10 Rue Exemple, 75001 Paris, France",
    }));
    if (schema) setSchemaValues((current) => fillAirwallexDemoValues(schema, condition, current));
    setError("");
  };

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
    setTransferMethodsExpanded(false);
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
          <span className="eyebrow">{t("auth.profileStep")}</span>
          <h2>{t("auth.profileTitle")}</h2>
          <p>{t("auth.profileDescription")}</p>
        </header>
        {error ? <div className="form-alert danger">{displayCopy(error, t)}</div> : null}
        <button type="button" className="registration-demo-button" disabled={!schema || schemaLoading || transferMethodsLoading} onClick={fillDemonstrationProfile}>
          <Sparkles size={15} /> {t("auth.fillDemoData")}
        </button>
        <section className="form-section">
          <h3><UserRound size={17} /> {t("auth.basicInformation")}</h3>
          <div className="form-grid">
            <label><span>{t("auth.legalNameCompany")}</span><input value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} placeholder={t("auth.legalNameHint")} /></label>
            <label><span>{t("auth.telephone")}</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder={t("auth.telephoneHint")} /></label>
            <label><span>{t("auth.contactEmail")}</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder={t("auth.emailHint")} /></label>
            <label className="full"><span>{t("auth.contactAddress")}</span><textarea className="basic-address-input" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder={t("auth.addressHint")} /></label>
          </div>
        </section>
        <section className="form-section">
          <h3><Landmark size={17} /> {t("auth.payoutAccount")}</h3>
          <div className="payout-channel-selector payout-channel-groups onboarding-payout-groups" role="group" aria-label={t("auth.payoutMethod")}>
            <div className="payout-bank-choice has-change">
              <button type="button" className="is-selected" aria-pressed="true" onClick={() => setProviderExpanded(false)}>
                <strong>Bank Transfer</strong><span>{t("auth.bankTransferProvider")}</span>
              </button>
              <button type="button" className="payout-provider-change" aria-expanded={providerExpanded} aria-controls="onboarding-bank-providers" onClick={() => setProviderExpanded((value) => !value)}>
                {t(providerExpanded ? "auth.collapseOptions" : "auth.changeProvider")}
              </button>
            </div>
            <button type="button" className="is-upcoming" disabled><strong>PayPal</strong><span>{t("status.unavailable")}</span></button>
          </div>
          {providerExpanded ? <div id="onboarding-bank-providers" className="payout-channel-selector payout-provider-selector onboarding-provider-selector" role="group" aria-label={t("auth.bankProviders")}>
            <button type="button" className="is-selected" aria-pressed="true" onClick={() => { setChannel("AIRWALLEX"); setProviderExpanded(false); }}><strong>Airwallex</strong><span>{t("auth.availableDynamicValidation")}</span></button>
            <button type="button" className="is-upcoming" disabled><strong>PayerMax</strong><span>{t("status.unavailable")}</span></button>
          </div> : null}
          {channel === "AIRWALLEX" ? (
            <div className="airwallex-schema-panel">
              <div className="airwallex-schema-heading">
                <div>
                  <strong>Airwallex Form Schema</strong>
                  <span>{t("auth.schemaDescription")}</span>
                </div>
                <StatusBadge label={t(schemaLoading ? "auth.generatingSchema" : "auth.schemaSynced")} tone={schemaLoading ? "amber" : "success"} />
              </div>
              <div className="form-grid airwallex-condition-grid">
                <label>
                  <span>{t("auth.country")}</span>
                  <Select value={condition.bankCountryCode} onValueChange={(value) => setCondition({ ...condition, bankCountryCode: value })}>
                    {AIRWALLEX_COUNTRIES.map((item) => <option key={item.value} value={item.value}>{displayCopy(item.label, t)}</option>)}
                  </Select>
                </label>
                <label>
                  <span>{t("auth.accountCurrency")}</span>
                  <Select value={condition.accountCurrency} onValueChange={(value) => setCondition({ ...condition, accountCurrency: value })}>
                    {["USD", "EUR", "GBP", "JPY", "AUD", "HKD", "SGD"].map((item) => <option key={item}>{item}</option>)}
                  </Select>
                </label>
                <label>
                  <span>{t("auth.recipientType")}</span>
                  <Select value={condition.entityType} onValueChange={(value) => setCondition({ ...condition, entityType: value as "PERSONAL" | "COMPANY" })}>
                    <option value="PERSONAL">{t("profile.individual")}</option>
                    <option value="COMPANY">{t("profile.company")}</option>
                  </Select>
                </label>
                <ProfileTransferMethods
                  idPrefix="onboarding-transfer-method"
                  methods={transferMethods}
                  selectedValue={condition.transferMethod}
                  editing
                  expanded={transferMethodsExpanded}
                  loading={transferMethodsLoading || resolvedTransferScenario !== transferMethodScenarioKey(condition)}
                  error={transferMethodsError}
                  onSelect={(value) => {
                    setCondition((current) => ({ ...current, transferMethod: value }));
                    setTransferMethodsExpanded(false);
                  }}
                  onExpandedChange={setTransferMethodsExpanded}
                />
              </div>
              {schemaLoading ? (
                <LoadingRows />
              ) : schema ? (
                <>
                  <div className="schema-source-note">
                    <RefreshCcw size={15} />
                    {t("auth.schemaResult", { count: schema.fields.length })} <code>POST /api/v1/beneficiary_form_schemas/generate</code>
                  </div>
                  <div className="form-grid schema-field-grid">
                    {schema.fields.map((field) => (
                      <label key={field.key}>
                        <span>{displayCopy(field.label, t)}{field.required ? " *" : ""}</span>
                        {field.type === "SELECT" ? (
                          <Select value={schemaValues[field.key] || ""} onValueChange={(value) => setSchemaValues({ ...schemaValues, [field.key]: value })}>
                            <option value="">{t("common.select")}</option>
                            {field.options?.map((option) => <option key={option.value} value={option.value}>{displayCopy(option.label, t)}</option>)}
                          </Select>
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
                            placeholder={displayCopy(field.placeholder || "", t)}
                            pattern={field.pattern}
                            title={displayCopy(field.description || "", t)}
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
          <span>{t("auth.agreeTermsPrivacy")}</span>
        </label>
        <button className="primary-button" type="submit" disabled={submitting || schemaLoading || transferMethodsLoading}>
          {submitting ? <RefreshCcw className="spin" size={17} /> : <ShieldCheck size={17} />}
          {t(submitting ? "auth.creatingBeneficiary" : "auth.completeRegistration")}
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
    title: "查看待办与最近更新",
    description: "首页优先显示需要处理的事项，并展示最近三张 Invoice 的付款动态。",
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
    label: "审核中 / 付款中",
    tone: "blue",
    description: "资料已提交后无需重复操作，可在 Invoice 详情跟踪审核和付款状态。",
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
    description: "查看待办、金额概览与最近更新",
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

function AppLayout({ adminOperations = false }: { adminOperations?: boolean }) {
  const { t, i18n } = useTranslation();
  const {
    session,
    adminDetail,
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
  const adminMode = session?.role === "ADMIN";
  const scope = useDataScope();
  const returnPath = adminOperations ? adminReturnPath() : "";
  const selectedQuery = scope.scopeQuery || (returnPath.includes("?userId=") ? `?${returnPath.split("?")[1]}` : "");
  const adminNav = [
    { to: "/admin/select-user", label: "选择达人", icon: UserRound },
    ...(selectedQuery ? [
    { to: "/home", label: "首页", icon: FolderKanban },
    { to: "/contracts", label: "合同", icon: FileText },
    { to: "/invoices", label: "Invoice", icon: ReceiptText },
    { to: "/payments", label: "付款", icon: WalletCards },
    { to: "/profile", label: "达人档案", icon: IdCard },
    ] : []),
    { to: "/admin/settings/users", label: "用户管理", icon: UserRound },
    { to: "/admin/settings/audit-logs", label: "操作日志", icon: FileCheck2 },
  ];

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
        <button className="mobile-menu icon-button" type="button" onClick={() => setOpen(true)} title={t("layout.openNavigation")}><Menu size={20} /></button>
        {adminMode ? <Link to="/admin/select-user"><Brand compact /></Link> : <Brand compact />}
        <div className="topbar-actions" ref={topbarActionsRef}>
          <LangSwitch />
          {!adminMode && <div className="topbar-action-anchor">
            <button
              className={`icon-button ${location.pathname === "/help" ? "is-active" : ""}`}
              type="button"
              title={t("menu.help")}
              aria-label={t("layout.openHelp")}
              onClick={() => navigate("/help")}
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
                    <strong id="topbar-help-title">{t("menu.help")}</strong>
                    <span>{t("layout.guideSubtitle")}</span>
                  </div>
                  <button
                    className="help-close-button"
                    type="button"
                    aria-label={t("layout.closeHelp")}
                    title={t("common.close")}
                    onClick={() => setActiveTopbarMenu(null)}
                  >
                    <X size={16} />
                  </button>
                </header>
                <div className="creator-guide-body">
                  <section className="creator-guide-section" aria-labelledby="creator-guide-flow-title">
                    <h3 id="creator-guide-flow-title">{t("layout.recommendedFlow")}</h3>
                    <ol className="creator-guide-flow">
                      {creatorGuideSteps.map((step, index) => (
                        <li key={step.title}>
                          <span>{index + 1}</span>
                          <div>
                            <strong>{t(`layout.guideSteps.${index}.title`)}</strong>
                            <p>{t(`layout.guideSteps.${index}.description`)}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section className="creator-guide-section" aria-labelledby="creator-guide-status-title">
                    <h3 id="creator-guide-status-title">{t("layout.whenActionNeeded")}</h3>
                    <div className="creator-guide-status-list">
                      {creatorGuideStatuses.map((status, index) => (
                        <div key={status.label}>
                          <span className={`creator-guide-status ${status.tone}`}>
                            {t(`layout.guideStatuses.${index}.label`)}
                          </span>
                          <p>{t(`layout.guideStatuses.${index}.description`)}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="creator-guide-section" aria-labelledby="creator-guide-shortcuts-title">
                    <h3 id="creator-guide-shortcuts-title">{t("layout.shortcuts")}</h3>
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
                              <strong>{t(item.to === "/" ? "menu.home" : item.to === "/contracts" ? "menu.contracts" : item.to === "/invoices" ? "menu.invoices" : "menu.profile")}</strong>
                              <small>{t(`layout.guideShortcuts.${creatorGuideShortcuts.indexOf(item)}`)}</small>
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
                      <strong>{t("layout.verifyBeforeSigning")}</strong>
                      <p>{t("layout.signingReminder")}</p>
                    </div>
                  </aside>
                </div>
              </section>
            ) : null}
          </div>}
          {!adminMode && <div className="topbar-action-anchor">
            <button
              className={`icon-button notification ${location.pathname === "/notifications" ? "is-active" : ""}`}
              type="button"
              title={t("menu.notifications")}
              aria-label={
                unreadCount
                  ? t("layout.unreadNotificationsLabel", { count: unreadCount })
                  : t("layout.noUnreadNotificationsLabel")
              }
              onClick={() => navigate("/notifications")}
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
                    <strong id="topbar-notifications-title">{t("layout.notificationCenter")}</strong>
                    <span>
                      {unreadCount
                        ? t("layout.unreadNotifications", { count: unreadCount })
                        : t("layout.noUnreadNotifications")}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!unreadCount}
                    onClick={() => void markAllNotificationsRead()}
                  >
                    {t("layout.markAllRead")}
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
                              <strong>{notificationDisplay(item, t).title}</strong>
                              <small>{new Date(item.createdAt).toLocaleString(i18n.language === "en" ? "en-US" : "zh-CN", { hour12: false })}</small>
                            </span>
                            <span>{notificationDisplay(item, t).message}</span>
                          </span>
                          {!isRead ? (
                            <i
                              className="notification-unread-dot"
                              aria-label={t("layout.unread")}
                            />
                          ) : null}
                        </button>
                      );
                    })
                  ) : (
                    <div className="notification-empty">
                      <Bell size={22} />
                      <strong>{t("layout.noNotifications")}</strong>
                      <span>{t("layout.noNotificationsDescription")}</span>
                    </div>
                  )}
                </div>
                <footer>{t("layout.recentNotificationsOnly")}</footer>
              </section>
            ) : null}
          </div>}
          <span className="top-avatar">{adminMode ? session.email.slice(0, 1).toUpperCase() : profile.displayName.slice(0, 1)}</span>
        </div>
      </header>
      {open ? <button className="sidebar-scrim" aria-label={t("layout.closeNavigation")} onClick={() => setOpen(false)} /> : null}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-mobile-head">
          <Brand compact />
          <button className="icon-button" onClick={() => setOpen(false)} title={t("layout.closeNavigation")}><X size={19} /></button>
        </div>
        <nav>
          <span className="nav-label">{t(adminMode ? "layout.adminNavigation" : "layout.paymentCollaboration")}</span>
          {(adminMode ? adminNav : navItems).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={adminMode && !item.to.startsWith("/admin") ? `${item.to}${selectedQuery}` : item.to} end={item.to === "/"} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "nav-active" : ""}`}>
                <Icon size={18} />
                <span>{t(item.to === "/" || item.to === "/home" ? "menu.home" : item.to === "/contracts" ? "menu.contracts" : item.to === "/invoices" ? "menu.invoices" : item.to === "/payments" ? "menu.payments" : item.to === "/profile" ? adminMode ? "menu.creatorProfile" : "menu.profile" : item.to === "/admin/select-user" ? "menu.selectCreator" : item.to.endsWith("/users") ? "menu.users" : "menu.auditLogs")}</span>
                <ChevronRight className="nav-arrow" size={15} />
              </NavLink>
            );
          })}
          {!adminMode && (
            <NavLink to="/notifications" aria-label={unreadCount ? t("layout.unreadNotificationsLabel", { count: unreadCount }) : t("menu.notifications")} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item sidebar-notifications ${isActive ? "nav-active" : ""}`}>
              <Bell size={18} aria-hidden="true" />
              <span>{t("menu.notifications")}</span>
              {unreadCount > 0 && <span className="sidebar-unread-count" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span>}
              <ChevronRight className="nav-arrow" size={15} aria-hidden="true" />
            </NavLink>
          )}
        </nav>
        <div className="sidebar-account">
          <span className="mini-avatar">{adminMode ? session.email.slice(0, 1).toUpperCase() : profile.displayName.slice(0, 1)}</span>
          <span><strong>{adminMode ? session.email : profile.displayName}</strong><small>{adminMode ? t("layout.systemAdministrator") : `${profile.social.platform} · ${profile.social.handle}`}</small></span>
          <button type="button" className="icon-button" title={t("menu.signOut")} onClick={signOut}><LogOut size={17} /></button>
        </div>
      </aside>
      <main className={`main-content ${location.pathname === "/" ? "request-home-main" : ""} ${adminOperations ? "admin-operations-main" : ""}`}>
        {adminMode && adminDetail && <AdminBanner name={adminDetail.account.name} />}
        {accessDenied ? (
          <div className="role-access-notice" role="alert">
            <AlertCircle size={16} />
            <span>{displayCopy(accessDenied, t)}</span>
          </div>
        ) : null}
        <Outlet key={adminMode ? scope.targetUserId : undefined} />
      </main>
    </div>
  );
}

function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <header className="page-heading">
      <div><h1>{displayCopy(title, t)}</h1>{subtitle ? <p>{displayCopy(subtitle, t)}</p> : null}</div>
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
  return sortInvoices(linkInvoicesToContracts(invoices, contracts, "CREATOR-001")).flatMap((invoice) => {
    const baseContract = contracts.find((contract) => contract.id === invoice.contractId);
    if (!baseContract) return [];
    const request = requests.find((item) => item.contractIds.includes(baseContract.id));
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
  const { t } = useTranslation();
  return (
    <span className="amount-info-tooltip">
      <button type="button" aria-label={t("legacyHome.viewAmountHelp", { label })} aria-describedby={id}>
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
            : status === "CHANGES_REQUIRED"
              ? ["success", "success", "blocked", "pending"]
              : ["success", "success", "current", "pending"];

  return (
    <div className="request-mini-progress" aria-label={t("admin.currentCollectionStatus", { status: displayCopy(REQUEST_STATUS_FROM_INVOICE[status].label, t) })}>
      {REQUEST_TRACK_LABELS.map((label, index) => {
        const step = steps[index];
        return (
          <div className={`request-mini-step step-${step}`} key={label}>
            <span>{step === "success" ? <Check size={10} /> : null}</span>
            <small>{label === "Invoice" ? label : label === "合同" ? t("menu.contracts") : label === "审批" ? t("admin.reviewStep") : t("admin.paymentStep")}</small>
          </div>
        );
      })}
    </div>
  );
}

function RequestListPage() {
  const { t } = useTranslation();
  const { invoices, profile, tasks } = useApp();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<CreatorTask["group"] | "ALL">("ALL");
  const [reviewFilter, setReviewFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 20 | 50 | 100>(10);
  const normalizedQuery = normalizeInvoiceSearch(query);
  const invoiceGroup = (invoice: Invoice): CreatorTask["group"] => {
    const task = tasks.find((item) => item.resourceId === invoiceInternalIdOf(invoice));
    return task?.group || (invoice.paymentStatus === "PAID" ? "COMPLETED" : "PROCESSING");
  };
  const filtered = useMemo(
    () => sortInvoicesByUpdatedAtDescending(invoices.map(migrateInvoice).filter((invoice) => {
      const matchesGroup = group === "ALL" || invoiceGroup(invoice) === group;
      const matchesQuery = !normalizedQuery || normalizeInvoiceSearch(invoiceNumberOf(invoice)).includes(normalizedQuery);
      return matchesGroup
        && matchesQuery
        && invoiceMatchesStatusFilters(invoice, reviewFilter, paymentFilter);
    })),
    [group, invoices, normalizedQuery, paymentFilter, reviewFilter, tasks],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageInvoices = filtered.slice(pageStart, pageStart + pageSize);
  const paginationPages = Array.from(new Set([
    1,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    pageCount,
  ].filter((value) => value >= 1 && value <= pageCount))).sort((left, right) => left - right);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
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
        <h1>{t("home.greeting", { name: profile.displayName })} <span aria-hidden="true">👋</span></h1>
        <p>{t("home.welcome", { profiles: displayCopy(socialSummary, t) })}</p>
      </header>

      <section className="request-task-groups" aria-label={t("legacyHome.collectionTasks")}>
        {groupedTasks.map((section) => (
          <article className={`request-task-group task-${section.group.toLowerCase()}`} key={section.group}>
            <header>
              <h2>{t(section.group === "TODO" ? "home.todo" : section.group === "PROCESSING" ? "common.processing" : "status.completed")}</h2>
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
                    <span><strong>{displayCopy(task.title, t)}</strong><small>{displayCopy(task.description, t)}</small></span>
                    <ChevronRight size={15} />
                  </Link>
                );
              }) : (
                <div className="request-task-empty">
                  <span aria-hidden="true"><Check size={22} /></span>
                  <p>{t("common.noRecords")}</p>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="request-money-overview" aria-label={t("home.amountOverview")}>
        <article>
          <div>
            <span>
              <i className="coral" />
              {t("legacyHome.awaitingSignatureAmount")}
              <AmountInfoTooltip id="requesting-amount-tip" label={t("legacyHome.awaitingSignatureAmount")}>
                {t("legacyHome.awaitingSignatureHelp")}
              </AmountInfoTooltip>
            </span>
            <strong>{summarizeRequestAmount(todoInvoices)}</strong>
            <small>{t("home.invoiceCount", { count: todoInvoices.length })}</small>
          </div>
        </article>
        <article>
          <div>
            <span>
              <i className="blue" />
              {t("legacyHome.processingAmount")}
              <AmountInfoTooltip id="pending-arrival-amount-tip" label={t("legacyHome.processingAmount")}>
                {t("legacyHome.processingHelp")}
              </AmountInfoTooltip>
            </span>
            <strong>{summarizeRequestAmount(processingInvoices)}</strong>
            <small>{t("home.invoiceCount", { count: processingInvoices.length })}</small>
          </div>
        </article>
        <article>
          <div>
            <span>
              <i className="green" />
              {t("home.paidAmount")}
              <AmountInfoTooltip id="completed-amount-tip" label={t("home.paidAmount")}>
                {t("legacyHome.paidHelp")}
              </AmountInfoTooltip>
            </span>
            <strong>{summarizeRequestAmount(paidInvoices)}</strong>
            <small>{t("home.invoiceCount", { count: paidInvoices.length })}</small>
          </div>
        </article>
      </section>

      <section className="content-card request-project-panel">
        <header><h2>{t("legacyHome.collection")}</h2></header>
        <div className="toolbar request-project-toolbar">
          <div className="request-project-query-controls">
            <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t("invoice.searchNumber")} aria-label={t("invoice.searchNumber")} /></label>
            <label className="request-project-select">
              <FileCheck2 size={16} />
              <Select value={reviewFilter} onValueChange={(value) => { setReviewFilter(value); setPage(1); }} aria-label={t("invoice.filterReview")}>
                <option value="ALL">{t("invoice.allReviewStatuses")}</option>
                {Object.entries(INTERNAL_REVIEW_META).map(([status, meta]) => <option key={`INTERNAL:${status}`} value={`INTERNAL:${status}`}>{t("invoice.internalType")} · {displayCopy(meta.label, t)}</option>)}
                {Object.entries(EXTERNAL_COLLECTION_META).map(([status, meta]) => <option key={`EXTERNAL:${status}`} value={`EXTERNAL:${status}`}>{t("invoice.externalType")} · {displayCopy(meta.label, t)}</option>)}
              </Select>
            </label>
            <label className="request-project-select">
              <WalletCards size={16} />
              <Select value={paymentFilter} onValueChange={(value) => { setPaymentFilter(value as PaymentStatus | "ALL"); setPage(1); }} aria-label={t("invoice.filterPayment")}>
                <option value="ALL">{t("invoice.allPaymentStatuses")}</option>
                {Object.entries(PAYMENT_STATUS_META).map(([status, meta]) => <option key={status} value={status}>{displayCopy(meta.label, t)}</option>)}
              </Select>
            </label>
          </div>
          <div className="filter-tabs">
            {(["ALL", "TODO", "PROCESSING", "COMPLETED"] as const).map((value) => (
              <button type="button" key={value} className={value === group ? "active" : ""} onClick={() => { setGroup(value); setPage(1); }}>
                {t(value === "ALL" ? "common.all" : value === "TODO" ? "home.todo" : value === "PROCESSING" ? "common.processing" : "status.completed")}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <>
            <div className="table-scroll">
              <table className="data-table request-project-table">
                <thead><tr><th>{t("invoice.number")}</th><th>{t("invoice.type")}</th><th>{t("invoice.amount")}</th><th>{t("invoice.reviewStatus")}</th><th>{t("invoice.paymentStatus")}</th><th>{t("invoice.updatedAt")}</th><th>{t("legacyHome.progress")}</th><th /></tr></thead>
                <tbody>
                  {pageInvoices.map((invoice, index) => {
                    const review = invoiceReviewMeta(invoice);
                    const payment = invoicePaymentMeta(invoice);
                    return (
                      <tr className={pageStart + index === 0 && group === "ALL" && !query ? "request-priority-row" : ""} key={invoiceInternalIdOf(invoice)}>
                        <td><Link className="table-primary" to={`/invoices/${invoiceNumberOf(invoice)}`}><strong>{invoiceNumberOf(invoice)}</strong><small>{invoice.updatedAt}</small></Link></td>
                        <td>{displayCopy(creatorInvoiceTypeLabel(invoice), t)}</td>
                        <td className="amount-cell">{invoice.amount}</td>
                        <td><StatusBadge label={review.label} tone={review.tone} /></td>
                        <td><StatusBadge label={payment.label} tone={payment.tone} /></td>
                        <td className="muted-cell"><span className="request-update-time">{invoice.updatedAt}</span></td>
                        <td><RequestMiniProgress status={invoice.status} /></td>
                        <td><Link className="icon-link" title={t("invoice.viewNumber", { number: invoiceNumberOf(invoice) })} to={`/invoices/${invoiceNumberOf(invoice)}`}><ChevronRight size={17} /></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="request-mobile-list">
              {pageInvoices.map((invoice) => {
                const review = invoiceReviewMeta(invoice);
                const payment = invoicePaymentMeta(invoice);
                const primaryStatus = invoicePrimaryStatusMeta(invoice);
                return (
                  <Link to={`/invoices/${invoiceNumberOf(invoice)}`} className="request-mobile-card" key={invoiceInternalIdOf(invoice)}>
                    <header><div><strong>{invoiceNumberOf(invoice)}</strong><small>{displayCopy(creatorInvoiceTypeLabel(invoice), t)}</small></div><StatusBadge label={primaryStatus.label} tone={primaryStatus.tone} /></header>
                    <div className="request-mobile-amount">{invoice.amount}</div>
                    <dl><div><dt>{t("legacyHome.review")}</dt><dd>{displayCopy(review.label, t)}</dd></div><div><dt>{t("legacyHome.payment")}</dt><dd>{displayCopy(payment.label, t)}</dd></div><div><dt>{t("legacyHome.updated")}</dt><dd>{invoice.updatedAt}</dd></div></dl>
                    <RequestMiniProgress status={invoice.status} />
                  </Link>
                );
              })}
            </div>
            <footer className="request-project-footer creator-request-pagination">
              <span className="creator-pagination-meta">
                {t("legacyHome.paginationSummary", { start: pageStart + 1, end: Math.min(pageStart + pageSize, filtered.length), total: filtered.length })}
              </span>
              <div className="creator-pagination-controls" aria-label={t("legacyHome.collectionPagination")}>
                <button type="button" aria-label={t("admin.previousPage")} disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={15} /></button>
                {paginationPages.map((pageNumber, index) => (
                  <span className="creator-pagination-page-slot" key={pageNumber}>
                    {index > 0 && pageNumber - paginationPages[index - 1] > 1 ? <i aria-hidden="true">…</i> : null}
                    <button type="button" className={pageNumber === currentPage ? "active" : ""} aria-label={t("admin.pageNumber", { number: pageNumber })} aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>
                  </span>
                ))}
                <button type="button" aria-label={t("admin.nextPage")} disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight size={15} /></button>
                <label className="creator-page-size">
                  <Select value={pageSize} aria-label={t("legacyHome.pageSize")} onValueChange={(value) => { setPageSize(Number(value) as 10 | 20 | 50 | 100); setPage(1); }}>
                    {[10, 20, 50, 100].map((size) => <option value={size} key={size}>{t("admin.recordsPerPage", { size })}</option>)}
                  </Select>
                </label>
              </div>
            </footer>
          </>
        ) : <EmptyState title={t("legacyHome.noMatchingCollection")} copy={t("legacyHome.adjustFilters")} />}
      </section>
    </div>
  );
}

function CreatorHomeRoute() {
  const { profile, contracts, invoices, tasks, paymentAttempts, adminDetail } = useApp();
  return <>{adminDetail && <UserProfileCard detail={adminDetail} attempts={paymentAttempts} />}<CreatorHome profile={profile} contracts={contracts} invoices={invoices} tasks={tasks} attempts={paymentAttempts} readOnly={Boolean(adminDetail)} /></>;
}

function SharedContractDetail() {
  const { isAdminView } = useDataScope();
  return <ContractDetailPage adminView={isAdminView} />;
}

function SharedInvoiceDetail() {
  const { isAdminView } = useDataScope();
  return <InvoiceDetailPage adminView={isAdminView} />;
}

function PaymentsPage() {
  const { t } = useTranslation();
  const { invoices, paymentAttempts } = useApp();
  const rows = invoices.filter((invoice) => attemptsForInvoice(invoice, paymentAttempts).length || invoice.paymentStatus === "PAID");
  return <div className="page-stack"><PageHeading title={t("invoice.paymentRecords")} subtitle={t("invoice.paymentRecordsDescription")} />
    <section className="content-card admin-payment-panel" aria-label={t("invoice.paymentRecords")}>
      <div className="invoice-list admin-payment-list" role="table" aria-label={t("invoice.paymentRecordsList")}>
        <div className="invoice-table-header admin-payment-header" role="row"><span role="columnheader">{t("invoice.number")}</span><span role="columnheader">{t("invoice.paymentAmount")}</span><span role="columnheader">{t("invoice.paymentStatus")}</span><span role="columnheader">{t("invoice.updatedAt")}</span><span role="columnheader">{t("invoice.actions")}</span></div>
        {rows.map((invoice) => {
          const state = invoicePaymentState(invoice, paymentAttempts);
          const meta = state === "PAID" ? { label: "已付款", tone: "success" } : state === "FAILED" ? { label: "付款异常", tone: "danger" } : { label: "处理中", tone: "blue" };
          return <article key={invoiceInternalIdOf(invoice)} className="invoice-list-row admin-payment-row" role="row">
            <Link className="invoice-identity" role="cell" to={`/invoices/${invoiceNumberOf(invoice)}`}><span className="resource-icon peach"><ReceiptText size={17} /></span><span><strong>{invoiceNumberOf(invoice)}</strong><small>{invoice.issuedAt}</small></span></Link>
            <div className="invoice-amount" role="cell"><strong>{invoice.amount}</strong></div>
            <div className="invoice-status-cell" role="cell"><StatusBadge label={meta.label} tone={meta.tone} /></div>
            <div className="invoice-channel" role="cell">{displayCopy(relativeUpdateTime(invoice.updatedAt), t)}</div>
            <div className="invoice-row-actions" role="cell"><Link to={`/invoices/${invoiceNumberOf(invoice)}`} title={t("invoice.viewNumber", { number: invoiceNumberOf(invoice) })}><Eye size={15} /><span>{t("common.view")}</span></Link></div>
          </article>;
        })}
        {!rows.length && <EmptyState title={t("invoice.noPaymentRecords")} copy={t("invoice.noPaymentRecordsDescription")} />}
      </div>
    </section></div>;
}

function SharedProfilePage() {
  const { adminDetail, paymentAttempts } = useApp();
  const { isAdminView } = useDataScope();
  return <>{isAdminView && adminDetail ? <UserProfileCard detail={adminDetail} attempts={paymentAttempts} /> : null}<ProfilePage adminView={isAdminView} /></>;
}

function CreatorNotificationsPage() {
  const { t } = useTranslation();
  const { notifications, markNotificationRead, markAllNotificationsRead } = useApp();
  const unread = notifications.filter((item) => !item.read).length;
  return <div className="page-stack creator-information-page">
    <PageHeading title={t("layout.notificationCenter")} subtitle={t("notifications.pageSubtitle")} action={<button type="button" className="secondary-button" disabled={!unread} onClick={() => void markAllNotificationsRead()}>{t("layout.markAllRead")}</button>} />
    <section className="content-card creator-information-card">
      {notifications.length ? notifications.map((item) => <Link key={item.id} className={`creator-notification-row ${item.read ? "is-read" : ""}`} to={item.deepLink} onClick={() => { if (!item.read) void markNotificationRead(item.id); }}>
        <span className={`notification-item-icon ${item.tone}`}><Bell size={17} /></span><span><strong>{notificationDisplay(item, t).title}</strong><small>{notificationDisplay(item, t).message}</small></span><time>{item.createdAt}</time><ChevronRight size={16} />
      </Link>) : <EmptyState title={t("layout.noNotifications")} copy={t("notifications.emptyDescription")} />}
    </section>
  </div>;
}

function CreatorHelpPage() {
  const { t } = useTranslation();
  return <div className="page-stack creator-information-page">
    <PageHeading title={t("menu.help")} subtitle={t("layout.guideSubtitle")} />
    <section className="content-card creator-information-card creator-help-card">
      <h2>{t("layout.recommendedFlow")}</h2><ol className="creator-guide-flow">{creatorGuideSteps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><strong>{t(`layout.guideSteps.${index}.title`)}</strong><p>{t(`layout.guideSteps.${index}.description`)}</p></div></li>)}</ol>
      <h2>{t("layout.whenActionNeeded")}</h2><div className="creator-guide-status-list">{creatorGuideStatuses.map((status, index) => <div key={status.label}><span className={`creator-guide-status ${status.tone}`}>{t(`layout.guideStatuses.${index}.label`)}</span><p>{t(`layout.guideStatuses.${index}.description`)}</p></div>)}</div>
      <h2>{t("layout.shortcuts")}</h2><div className="creator-guide-shortcuts">{creatorGuideShortcuts.map((item, index) => <Link key={item.to} to={item.to}><span className={`creator-guide-shortcut-icon ${item.tone}`}><item.icon size={16} /></span><span><strong>{t(item.to === "/" ? "menu.home" : item.to === "/contracts" ? "menu.contracts" : item.to === "/invoices" ? "menu.invoices" : "menu.profile")}</strong><small>{t(`layout.guideShortcuts.${index}`)}</small></span><ChevronRight size={14} /></Link>)}</div>
      <aside className="creator-guide-reminder"><ShieldCheck size={17} /><div><strong>{t("layout.verifyBeforeSigning")}</strong><p>{t("layout.signingReminder")}</p></div></aside>
    </section>
  </div>;
}

function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="back-link" to={to}><ChevronLeft size={16} />{children}</Link>;
}

function useAdminCreatorDetail(creatorId?: string) {
  const { session } = useApp();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [loading, setLoading] = useState(Boolean(creatorId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!creatorId) {
      setDetail(null);
      setAttempts([]);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setDetail(null);
    setAttempts([]);
    setError("");
    services.creatorScope
      .read(session?.sessionId || "", creatorId)
      .then((result) => {
        if (!active) return;
        setDetail(result.data.detail);
        setAttempts(result.data.attempts);
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
  }, [creatorId, session?.sessionId]);

  return { detail, attempts, loading, error };
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
  const { t } = useTranslation();
  return (
    <div className="page-stack">
      <BackLink to={backTo}>{t("admin.backToBusinessList", { type: displayCopy(resourceName, t) })}</BackLink>
      {loading ? (
        <div className="admin-detail-loading">
          <RefreshCcw className="spin" size={20} />
          {t("admin.loadingBusinessDetail", { type: displayCopy(resourceName, t) })}
        </div>
      ) : (
        <EmptyState
          title={t("admin.businessNotFound", { type: displayCopy(resourceName, t) })}
          copy={error ? displayCopy(error, t) : t("admin.businessNotFoundDescription")}
        />
      )}
    </div>
  );
}

function RequestDetailPage({ adminView = false }: { adminView?: boolean }) {
  const { t } = useTranslation();
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
  const linkedInvoices = sortInvoicesByUpdatedAtDescending(availableInvoices.filter((invoice) => (
    baseRequest?.invoiceIds.includes(invoice.id)
    || invoice.projectId === id
  )));
  const linkedInvoice = linkedInvoices[0];
  const baseContract = linkedInvoice
    ? availableContracts.find((contract) => (
        contract.id === linkedInvoice.contractId || baseRequest?.contractIds.includes(contract.id)
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
  return (
    <div className="page-stack">
      <BackLink to={backTo}>{t(adminView ? "admin.backToRequestProjects" : "admin.backToCollection")}</BackLink>
      <PageHeading title={linkedInvoice.projectName} subtitle={`${baseRequest?.id || linkedInvoice.projectId} · ${linkedInvoice.brand}`} action={<StatusBadge label={meta.label} tone={meta.tone} />} />
      <section className="detail-metrics">
        <article><span>{t(adminView ? "admin.requestAmount" : "admin.collectionAmount")}</span><strong>{sumInvoiceAmounts(linkedInvoices)}</strong><small>{t("admin.invoiceAmountSummary")}</small></article>
        <article><span>{t("admin.contractStatus")}</span><strong>{displayCopy(contractStatusLabel[linkedContract.status], t)}</strong><small>{t("admin.linkedInvoiceCount", { count: linkedInvoices.length })}</small></article>
        <article><span>{t("admin.latestInvoiceStatus")}</span><strong>{displayCopy(INVOICE_STATUS[linkedInvoice.status].label, t)}</strong><small>{invoiceNumberOf(linkedInvoice)}</small></article>
      </section>
      {linkedInvoice.status === "PAYMENT_FAILED" ? (
        <section className="blocking-panel">
          <Info size={20} />
          <div><strong>{t("admin.paymentPaused")}</strong><p>{t("admin.paymentCorrectionReview")}</p></div>
          <span>{t("admin.pendingIssueCount", { count: issues.length || 1 })}</span>
        </section>
      ) : null}
      <div className="detail-layout">
        <section className="detail-card">
          <header><div><h2>{t("admin.relatedDocuments")}</h2><p>{t("admin.relatedDocumentsDescription")}</p></div></header>
          <div className="resource-list">
            <Link to={contractTo}>
              <span className="resource-icon purple"><FileText size={19} /></span>
              <div><small>{t("menu.contracts")}</small><strong>{linkedContract.id}</strong><span>{linkedContract.fileName}</span></div>
              <StatusBadge label={contractStatusLabel[linkedContract.status]} tone={CONTRACT_STATUS[linkedContract.status].tone} />
              <ChevronRight size={17} />
            </Link>
            {linkedInvoices.map((item) => <Link key={item.id} to={adminView ? `/admin/invoices/${creatorId}/${item.id}` : `/invoices/${invoiceNumberOf(item)}`}>
              <span className="resource-icon peach"><ReceiptText size={19} /></span>
              <div><small>Invoice</small><strong>{invoiceNumberOf(item)}</strong><span>{item.amount}</span></div>
              <StatusBadge label={INVOICE_STATUS[item.status].label} tone={INVOICE_STATUS[item.status].tone} />
              <ChevronRight size={17} />
            </Link>)}
          </div>
          {issues.length ? (
            <div className="issue-list">
              {issues.map((issue) => (
                <article key={issue.id}>
                  <span><Info size={17} /></span>
                  <div><strong>{displayCopy(issue.title, t)}</strong><p>{displayCopy(issue.reason, t)}</p><small>{t("admin.handledBy", { name: displayCopy(issue.owner, t) })}</small></div>
                  <Link to={adminView ? `/admin/invoices/${creatorId}/${issue.resourceId}` : `/invoices/${issue.resourceId}`}>{t("admin.viewDocuments")} <ExternalLink size={14} /></Link>
                </article>
              ))}
            </div>
          ) : null}
        </section>
        <aside className="detail-card progress-card">
          <header><div><h2>{t(adminView ? "admin.requestProgress" : "admin.collectionProgress")}</h2><p>{displayCopy(meta.description, t)}</p></div></header>
          <div className="timeline">
            {progress.map((node) => (
              <div key={node.id} className={`timeline-item state-${node.state}`}>
                <span>{node.state === "complete" ? <Check size={15} /> : node.state === "blocked" ? <Info size={15} /> : null}</span>
                <div><strong>{displayCopy(node.label, t)}</strong><p>{displayCopy(node.description, t)}</p><small>{displayCopy(node.owner, t)} · {displayCopy(node.time, t)}</small></div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ContractListPage() {
  const { t } = useTranslation();
  const { contracts } = useApp();
  const { isAdminView } = useDataScope();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Contract["status"] | "ALL">("ALL");
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
      <PageHeading title={t("menu.contracts")} subtitle={t("contracts.listDescription")} />
      <section className="contract-overview" aria-label={t("contracts.overview")}>
        <article className="tone-neutral"><span>{t("contracts.allContracts")}</span><strong>{contracts.length}</strong><small>{t("contracts.allDescription")}</small></article>
        <article className="tone-sun"><span>{t("status.awaitingSignature")}</span><strong>{statusCounts.PENDING_SIGNATURE}</strong><small>{t("contracts.pendingDescription")}</small></article>
        <article className="tone-sky"><span>{t("status.active")}</span><strong>{statusCounts.ACTIVE}</strong><small>{t("contracts.activeDescription")}</small></article>
        <article className="tone-cloud"><span>{t("status.expired")}</span><strong>{statusCounts.EXPIRED}</strong><small>{t("contracts.expiredDescription")}</small></article>
      </section>
      <section className="content-card contract-list-panel">
        <div className="invoice-list-toolbar contract-list-toolbar">
          <div className="invoice-toolbar-filters contract-toolbar-filters">
            <label className="invoice-search-field">
              <Search size={16} />
              <input type="search" aria-label={t("contracts.searchNumber")} placeholder={t("contracts.searchNumber")} value={query} onChange={(event) => setQuery(event.target.value)} />
              {query ? <button type="button" title={t("common.clearSearch")} aria-label={t("common.clearSearch")} onClick={() => setQuery("")}><X size={14} /></button> : null}
            </label>
            <label className="invoice-channel-filter contract-status-filter">
              <FileCheck2 size={16} />
              <Select value={status} onValueChange={(value) => setStatus(value as Contract["status"] | "ALL")} aria-label={t("contracts.filterStatus")}>
                <option value="ALL">{t("contracts.allStatuses")}</option>
                {(["PENDING_SIGNATURE", "ACTIVE", "EXPIRED"] as const).map((value) => <option key={value} value={value}>{contractStatusLabel[value]}</option>)}
              </Select>
            </label>
          </div>
        </div>
        <div className="invoice-list contract-invoice-list" role="table" aria-label={t("contracts.list")}>
          <div className="invoice-table-header contract-list-header" role="row">
            <span role="columnheader">{t("contracts.number")}</span><span role="columnheader">{t("contracts.amount")}</span><span role="columnheader">{t("contracts.status")}</span><span role="columnheader">{t("contracts.period")}</span><span role="columnheader">{t("contracts.updatedDate")}</span><span role="columnheader">{t("admin.actions")}</span>
          </div>
          {filtered.map((contract) => (
            <article className="invoice-list-row contract-invoice-row" role="row" key={contract.id}>
              <Link className="invoice-identity contract-identity contract-mobile-title" role="cell" to={`/contracts/${contract.id}`}>
                <span className="resource-icon contract-blue"><FileText size={17} /></span>
                <span><strong>{contract.id}</strong><small>{contract.fileName}</small></span>
              </Link>
              <div className="invoice-amount contract-list-value" role="cell"><span className="contract-mobile-label">{t("contracts.amount")}</span><strong>{contract.amount}</strong></div>
              <div className="invoice-status-cell contract-list-value" role="cell"><span className="contract-mobile-label">{t("contracts.status")}</span><StatusBadge label={contractStatusLabel[contract.status]} tone={CONTRACT_STATUS[contract.status].tone} /></div>
              <div className="invoice-channel contract-period contract-list-value" role="cell"><span className="contract-mobile-label">{t("contracts.period")}</span><span>{displayCopy(contract.servicePeriod, t)}</span></div>
              <div className="invoice-channel contract-updated contract-list-value" role="cell"><span className="contract-mobile-label">{t("contracts.updatedDate")}</span><span>{contract.updatedAt}</span></div>
              <div className="invoice-row-actions contract-list-actions" role="cell">
                <Link to={`/contracts/${contract.id}`} title={t("contracts.viewNumber", { number: contract.id })} aria-label={t("contracts.viewContract", { number: contract.id })}><Eye size={15} /><span>{t("common.view")}</span></Link>
                {!isAdminView && <a href={contract.documentUrl} download={contract.fileName} title={t("contracts.downloadNumber", { number: contract.id })} aria-label={t("contracts.downloadContract", { number: contract.id })}><FileDown size={15} /><span>{t("common.download")}</span></a>}
              </div>
            </article>
          ))}
          {!filtered.length ? <EmptyState title={t("contracts.noMatches")} copy={t("contracts.adjustFilters")} /> : null}
        </div>
      </section>
    </div>
  );
}

function ContractDetailPage({ adminView = false }: { adminView?: boolean }) {
  const { t, i18n } = useTranslation();
  const { id, creatorId } = useParams();
  const { contracts, invoices, profile, signContract, adminDetail } = useApp();
  const legacyAdmin = Boolean(adminView && creatorId);
  const adminCreatorLegacy = useAdminCreatorDetail(legacyAdmin ? creatorId : undefined);
  const adminCreator = legacyAdmin ? adminCreatorLegacy : { detail: adminDetail, attempts: [], loading: false, error: "" };
  const [obligationTab, setObligationTab] = useState<"FULFILLMENT" | "CLAIM">("FULFILLMENT");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signNotice, setSignNotice] = useState("");
  const [signNoticeTone, setSignNoticeTone] = useState<"success" | "danger">("success");
  const baseContract = adminView
    ? adminCreator.detail?.contracts.find((item) => item.id === id)
    : contracts.find((item) => item.id === id);
  const backTo = legacyAdmin ? "/admin/contracts" : "/contracts";
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
  const relatedInvoices = contract.status === "PENDING_SIGNATURE" ? [] : sortInvoicesByUpdatedAtDescending((adminView ? adminCreator.detail?.invoices || [] : invoices).filter((item) => findLinkedContract(item, adminView ? adminCreator.detail?.contracts || [] : contracts)?.id === contract.id));
  const contractProfile = normalizePayoutProfile(
    adminCreator.detail?.profile || profile,
  );
  const contractInformationTabs = [
    {
      id: "FULFILLMENT" as const,
      title: t("contracts.confirmationInformation"),
      description: t("contracts.confirmationDescription"),
      rows: contractConfirmationRows(contract, contractProfile),
    },
    {
      id: "CLAIM" as const,
      title: t("contracts.payoutInformation"),
      description: t(adminView ? "contracts.maskedInformation" : "contracts.defaultAccountInformation"),
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
      <BackLink to={backTo}>{t("contracts.backToList")}</BackLink>
      <PageHeading title={contract.id} action={<StatusBadge label={contractStatusLabel[contract.status]} tone={CONTRACT_STATUS[contract.status].tone} />} />
      {signNotice ? <div className={`form-alert ${signNoticeTone}`}><CheckCircle2 size={17} />{displayCopy(signNotice, t)}</div> : null}
      <section className="invoice-detail-metrics contract-detail-metrics" aria-label={t("contracts.overview")}>
        <article><span>{t("contracts.status")}</span><strong><i className={`invoice-metric-accent tone-${CONTRACT_STATUS[contract.status].tone}`} />{displayCopy(contractStatusLabel[contract.status], t)}</strong><small>{t(`contracts.lifecycle.${contract.status}`)}</small></article>
        <article><span>{t("contracts.amount")}</span><strong>{contract.amount}</strong><small>{t("contracts.contractTextPrevails")}</small></article>
        <article><span>{t("contracts.validity")}</span><strong>{displayCopy(contract.servicePeriod, t)}</strong><small>{t("contracts.agreedPeriod")}</small></article>
      </section>
      {contract.status === "PENDING_SIGNATURE" && !adminView ? <div className="invoice-verification-notice" role="note"><Info size={18} /><div><strong>{t("contracts.verifyBeforeSigning")}</strong><p>{t("contracts.verifyDetailsNotice")}</p><p className="invoice-verification-responsibility">{t("contracts.demoSignatureDisclaimer")}</p></div></div> : null}
      {relatedInvoices.length ? <section className="content-card contract-invoice-links"><header><h2>{t("contracts.relatedInvoices")} <small>{t("contracts.invoiceCount", { count: relatedInvoices.length })}</small></h2></header><div>{relatedInvoices.map((item) => <Link key={item.id} to={legacyAdmin ? `/admin/invoices/${creatorId}/${invoiceNumberOf(item)}` : `/invoices/${invoiceNumberOf(item)}`}><span><strong>{invoiceNumberOf(item)}</strong><small>{item.amount} · {displayCopy(INVOICE_STATUS[item.status].label, t)}</small></span><ChevronRight size={16} /></Link>)}</div></section> : null}
      <div className="contract-document-layout">
        <section className="contract-viewer-card">
          <header>
            <div className="contract-viewer-title">
              <span className="resource-icon purple"><FileText size={20} /></span>
              <div><h2>{t("contracts.fullDocument")}</h2><p>{contract.fileName} · {t("contracts.pageCount", { count: contract.pageCount })}</p></div>
            </div>
            {!adminView && <a className="contract-open-link" href={contract.documentUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />{t("contracts.openNewWindow")}
            </a>}
          </header>
          {adminView ? <div className="invoice-document-empty" role="note"><ShieldCheck size={22} /><strong>{t("contracts.originalUnavailable")}</strong><span>{t("contracts.adminDocumentNotice")}</span></div> : <><iframe
            className="contract-pdf-frame"
            src={`${contract.documentUrl}#page=1&zoom=page-width&toolbar=1&navpanes=0`}
            title={t("contracts.documentTitle", { number: contract.id })}
          />
          <img
            className="contract-pdf-mobile-preview"
            src="/26-kol-standard-terms-template-page-1.png"
            alt={t("contracts.firstPagePreview", { number: contract.id })}
          />
          <footer className="contract-mobile-actions">
            <a className="primary-button" href={contract.documentUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />{t("contracts.openPdf")}
            </a>
            <a className="secondary-button" href={contract.documentUrl} download={contract.fileName}>
              <Download size={16} />{t("contracts.downloadPdf")}
            </a>
          </footer></>}
        </section>
        <aside className="contract-obligations-card">
          <div className="obligation-tabs" role="tablist" aria-label={t("contracts.informationTabs")}>
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
                    <dt>{displayCopy(row.label, t)}</dt>
                    <dd>{displayCopy(row.value, t)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
          {!adminView && contract.status === "PENDING_SIGNATURE" ? <footer className="contract-information-actions"><button className="primary-button" type="button" onClick={() => setSignatureOpen(true)}><PenLine size={16} />{t("contracts.confirmAndSign")}</button></footer> : null}
          {contract.signatureRecord?.signature ? <footer className="contract-signature-record"><img src={contract.signatureRecord.signature.dataUrl} alt={t("contracts.savedSignature")} /><span>{t("contracts.signatureRecord", { name: contract.signatureRecord.signature.signerName, date: new Date(contract.signatureRecord.signedAt).toLocaleString(i18n.language === "en" ? "en-US" : "zh-CN", { hour12: false }) })}</span></footer> : null}
        </aside>
      </div>
      {!adminView && signatureOpen && contract.status === "PENDING_SIGNATURE" ? <SignatureModal document={{ kind: "CONTRACT", number: contract.id }} signerName={contractProfile.legalName} payoutAccountName={contractProfile.payout.accountHolder || contractProfile.legalName} onClose={() => setSignatureOpen(false)} onConfirm={async (signature) => { try { await signContract(contract.id, signature); setSignNoticeTone("success"); setSignNotice("合同演示签署记录已保存，状态已更新为执行中"); } catch (caught) { setSignNoticeTone("danger"); setSignNotice(caught instanceof Error ? caught.message : "合同签署失败，请稍后重试"); throw caught; } }} /> : null}
    </div>
  );
}

const downloadInvoiceDocument = async (invoice?: Invoice) => {
  const anchor = document.createElement("a");
  const stored = invoice?.document?.storageId
    ? await services.invoices.getDocumentFile(invoiceInternalIdOf(invoice), invoice.creatorId || PRIMARY_CREATOR_ID)
    : undefined;
  if (invoice?.document?.storageId && !stored) throw new Error("本地 Invoice 文件不可用，请重新上传文件。");
  const objectUrl = stored ? URL.createObjectURL(stored) : undefined;
  anchor.href = objectUrl || invoice?.document?.previewUrl || "/INV-20260723-001-Alex-Ruiz.pdf";
  const mime = invoice?.document?.mimeType || "application/pdf";
  const extension = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "pdf";
  anchor.download = `${invoice ? invoiceNumberOf(invoice) : "Invoice"}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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
  document,
  signerName,
  payoutAccountName,
  onClose,
  onConfirm,
}: {
  document: { kind: "INVOICE" | "CONTRACT"; number: string };
  signerName: string;
  payoutAccountName: string;
  onClose(): void;
  onConfirm(signature: InvoiceSignature): Promise<void>;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [method, setMethod] = useState<SignatureMethod>("DRAWN");
  const [signatureData, setSignatureData] = useState("");
  const [selectedGeneratedStyle, setSelectedGeneratedStyle] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const documentLabel = document.kind === "CONTRACT" ? "合同" : "Invoice";
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
              <h2 id="signature-modal-title">{t("invoice.signDocument", { document: displayCopy(documentLabel, t) })}</h2>
              <p>{t("invoice.interactiveDemo", { number: document.number })}</p>
            </div>
          </div>
          <button type="button" className="icon-button" aria-label={t("invoice.closeSignature")} disabled={submitting} onClick={onClose}><X size={18} /></button>
        </header>

        <div className="signature-method-tabs" role="tablist" aria-label={t("invoice.signatureMethod")}>
          <button type="button" role="tab" aria-selected={method === "DRAWN"} className={method === "DRAWN" ? "active" : ""} onClick={() => selectMethod("DRAWN")}><PenLine size={16} />{t("invoice.handwritten")}</button>
          <button type="button" role="tab" aria-selected={method === "GENERATED"} className={method === "GENERATED" ? "active" : ""} onClick={() => selectMethod("GENERATED")}><Sparkles size={16} />{t("invoice.generatedSignature")}</button>
        </div>

        {method === "DRAWN" ? (
          <div className="signature-pad-wrap">
            <div className="signature-pad-heading"><span>{t("invoice.signBelow")}</span><button type="button" onClick={clearSignature}><Eraser size={14} />{t("invoice.clearSignature")}</button></div>
            <canvas
              ref={canvasRef}
              className="signature-pad"
              width={720}
              height={220}
              aria-label={t("invoice.signatureCanvas")}
              onPointerDown={startDrawing}
              onPointerMove={drawSignature}
              onPointerUp={finishDrawing}
              onPointerCancel={finishDrawing}
            />
            <p>{t("invoice.drawingHelp")}</p>
          </div>
        ) : (
          <div className="generated-signature-section">
            <div className="generated-signature-heading">
              <div><strong>{t("invoice.chooseSignatureStyle")}</strong><span>{t("invoice.generatedFromName", { name: payoutAccountName || t("profile.notSet") })}</span></div>
              <Sparkles size={17} />
            </div>
            {generatedSignatures.length ? (
              <div className="generated-signature-grid" role="radiogroup" aria-label={t("invoice.signatureStyles")}>
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
                      <img src={style.dataUrl} alt={t("invoice.signaturePreview", { name: payoutAccountName, style: displayCopy(style.label, t) })} />
                      <span>{displayCopy(style.label, t)}</span>
                      {selected ? <i aria-hidden="true"><Check size={12} /></i> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="signature-error" role="alert"><Info size={15} />{t("invoice.completeAccountName")}</div>
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
            <strong>{t("invoice.signingDeclaration")}</strong>
            {t("invoice.signingConsent")}{t(document.kind === "CONTRACT" ? "invoice.contractSignEffect" : "invoice.invoiceSignEffect")}
          </span>
        </label>
        {error ? <div className="signature-error" role="alert"><Info size={15} />{displayCopy(error, t)}</div> : null}
        <footer>
          <p>{t("invoice.checkBeforeConfirmSign", { document: displayCopy(documentLabel, t) })}</p>
          <div>
            <button type="button" className="secondary-button" disabled={submitting} onClick={onClose}>{t("common.cancel")}</button>
            <button type="button" className="primary-button" disabled={!signatureData || !legalAccepted || submitting} onClick={confirmSignature}>{t(submitting ? "invoice.signing" : "invoice.confirmSign")}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function InvoiceUploadModal({
  invoice,
  onClose,
  onUploaded,
}: {
  invoice: Invoice;
  onClose(): void;
  onUploaded(invoice: Invoice): void;
}) {
  const { t } = useTranslation();
  const { uploadExternalInvoice, resubmitExternalInvoice } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedPreview, setSelectedPreview] = useState("");
  useEffect(() => {
    if (!file?.type.startsWith("image/")) { setSelectedPreview(""); return; }
    const url = URL.createObjectURL(file);
    setSelectedPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const migratedInvoice = migrateInvoice(invoice);
  const isReupload = migratedInvoice.documentState?.kind === "EXTERNAL"
    && ["RETURNED_FOR_REUPLOAD", "RECOGNITION_FAILED"].includes(migratedInvoice.documentState.status);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError("请选择 Invoice 文件");
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
      setProgress(55);
      const input: ExternalInvoiceUploadInput = {
        invoiceId: invoiceInternalIdOf(migratedInvoice),
        file: {
          id: `invoice-file-${Date.now()}`,
          name: file.name,
          mimeType: file.type,
          size: file.size,
        },
        fileBlob: file,
        extractedData: {
          invoiceFrom: "",
          billTo: "",
          invoiceDate: "",
          currency: "",
          total: "",
          paymentDetails: {},
          invoiceFromMatchesProfile: false,
          billToMatchesComets: false,
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
            <div><h2 id="invoice-upload-title">{t(isReupload ? "invoice.reuploadTitle" : "invoice.uploadTitle")}</h2><p>{t("invoice.uploadDemoNotice")}</p></div>
          </div>
          <button type="button" className="icon-button" title={t("common.close")} onClick={onClose}><X size={18} /></button>
        </header>
        <div className="invoice-upload-fields">
          <label className="field">
            <span>{t("invoice.number")}</span>
            <input value={invoiceNumberOf(migratedInvoice)} readOnly />
          </label>
        </div>
        <div className="invoice-upload-reminder" role="note"><Info size={17} /><p>{t("invoice.uploadReminder")}</p></div>
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
          <strong>{file ? file.name : t("invoice.chooseOrDropFile")}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : t("invoice.uploadFileLimit")}</span>
        </label>
        {selectedPreview ? <img className="invoice-upload-preview" src={selectedPreview} alt={t("invoice.uploadPreview")} /> : null}
        {submitting ? <div className="invoice-upload-progress" role="status" aria-live="polite"><span style={{ width: `${progress}%` }} /><strong>{t(progress < 55 ? "invoice.uploadingFile" : progress < 100 ? "invoice.recognizingInformation" : "invoice.recognitionComplete")}</strong></div> : null}
        {error ? <div className="signature-error" role="alert"><Info size={15} />{displayCopy(error, t)}</div> : null}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>{t("common.cancel")}</button>
          <button type="submit" className="primary-button" disabled={submitting || !file}>
            {t(submitting ? "invoice.recognizingInformation" : isReupload ? "invoice.uploadNewVersion" : "invoice.confirmUpload")}
          </button>
        </footer>
      </form>
    </div>
  );
}

function InvoiceListPage() {
  const { t } = useTranslation();
  const { invoices, tasks } = useApp();
  const location = useLocation();
  const requestedStatus = new URLSearchParams(location.search).get("status") || "";
  const initialReview = requestedStatus === "DRAFT_SIGNATURE" ? "INTERNAL:WAITING_SIGNATURE" : "ALL";
  const [reviewFilter, setReviewFilter] = useState(initialReview);
  const [paymentFilter, setPaymentFilter] = useState<Invoice["paymentStatus"] | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const migratedInvoices = useMemo(() => invoices.map(migrateInvoice), [invoices]);
  const summary = useMemo(() => summarizeInvoiceList(migratedInvoices), [migratedInvoices]);
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
        subtitle={t("invoice.listDescription")}
      />
      <section className="contract-overview invoice-overview" aria-label={t("invoice.overview") }>
        <article className="tone-neutral"><span>{t("invoice.allInvoices")}</span><strong>{summary.all}</strong><small>{t("invoice.allInvoicesDescription")}</small></article>
        <article className="tone-sun"><span>{t("invoice.todoInvoices")}</span><strong>{summary.todo}</strong><small>{t("invoice.todoInvoicesDescription")}</small></article>
        <article className="tone-processing"><span>{t("invoice.processingInvoices")}</span><strong>{summary.processing}</strong><small>{t("invoice.processingInvoicesDescription")}</small></article>
        <article className="tone-paid"><span>{t("invoice.paidInvoices")}</span><strong>{summary.paid}</strong><small>{t("invoice.paidInvoicesDescription")}</small></article>
      </section>
      <section className="content-card invoice-list-panel">
        <div className="invoice-list-toolbar">
          <div className="invoice-toolbar-filters">
            <label className="invoice-search-field">
              <Search size={16} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("invoice.searchNumber")}
                aria-label={t("invoice.searchNumber")}
              />
              {query ? (
                <button
                  type="button"
                  title={t("common.clearSearch")}
                  aria-label={t("common.clearSearch")}
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              ) : null}
            </label>
            <label className="invoice-channel-filter">
              <FileCheck2 size={16} />
              <Select
                value={reviewFilter}
                onValueChange={setReviewFilter}
                aria-label={t("invoice.filterReview")}
              >
                <option value="ALL">{t("invoice.allReviewStatuses")}</option>
                {Object.entries(INTERNAL_REVIEW_META).map(([status, meta]) => <option key={`INTERNAL:${status}`} value={`INTERNAL:${status}`}>{t("invoice.internalType")} · {displayCopy(meta.label, t)}</option>)}
                {Object.entries(EXTERNAL_COLLECTION_META).map(([status, meta]) => <option key={`EXTERNAL:${status}`} value={`EXTERNAL:${status}`}>{t("invoice.externalShort")} · {displayCopy(meta.label, t)}</option>)}
              </Select>
            </label>
            <label className="invoice-channel-filter">
              <WalletCards size={16} />
              <Select value={paymentFilter || "ALL"} onValueChange={(value) => setPaymentFilter(value as Invoice["paymentStatus"] | "ALL")} aria-label={t("invoice.filterPayment")}>
                <option value="ALL">{t("invoice.allPaymentStatuses")}</option>
                {Object.entries(PAYMENT_STATUS_META).map(([status, meta]) => <option key={status} value={status}>{displayCopy(meta.label, t)}</option>)}
              </Select>
            </label>
          </div>
        </div>
        <div className="invoice-list" role="table" aria-label={t("invoice.list")}>
          <div className="invoice-table-header" role="row">
            <span role="columnheader">{t("invoice.number")}</span>
            <span role="columnheader">{t("invoice.type")}</span>
            <span role="columnheader">{t("invoice.amount")}</span>
            <span role="columnheader">{t("invoice.reviewStatus")}</span>
            <span role="columnheader">{t("invoice.paymentStatus")}</span>
            <span role="columnheader">{t("invoice.updatedAt")}</span>
            <span role="columnheader">{t("invoice.nextAction")}</span>
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
                <div className="invoice-channel" role="cell">{displayCopy(creatorInvoiceTypeLabel(invoice), t)}</div>
                <div className="invoice-amount" role="cell"><strong>{invoice.amount}</strong></div>
                <div className="invoice-status-cell" role="cell"><StatusBadge label={review.label} tone={review.tone} /></div>
                <div className="invoice-status-cell" role="cell"><StatusBadge label={payment.label} tone={payment.tone} /></div>
                <div className="invoice-channel" role="cell">{displayCopy(relativeUpdateTime(invoice.updatedAt), t)}</div>
                <div className="invoice-row-actions" role="cell">
                  <Link to={`/invoices/${invoiceNumberOf(invoice)}`} title={t("invoice.viewNumber", { number: invoiceNumberOf(invoice) })}><Eye size={15} /><span>{t(task?.group === "TODO" ? "home.goHandle" : "common.view")}</span></Link>
                </div>
              </article>
            );
          })}
          {!filtered.length ? (
            <EmptyState
              title={t(query.trim() ? "invoice.noMatches" : "invoice.noInvoices")}
              copy={t(query.trim() ? "invoice.tryOtherNumber" : "invoice.noRecordsForFilter")}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ExternalInvoiceSummaryPanel({
  data,
  original,
  description,
  originalDescription,
  expectedCurrency,
  expectedTotal,
  expectedFrom,
  hasRecognition,
  invoiceFromMatchesProfile: _invoiceFromMatchesProfile,
  billToMatchesComets: _billToMatchesComets,
  editable,
  busy,
  editRequest,
  readOnlyReason,
  confirmedAt,
  fileVersion,
  onConfirm,
  onSave,
}: {
  data: InvoiceExtractedData;
  original?: InvoiceExtractedData;
  description: string;
  originalDescription: string;
  expectedCurrency: string;
  expectedTotal: string;
  expectedFrom: string;
  hasRecognition: boolean;
  invoiceFromMatchesProfile: boolean;
  billToMatchesComets: boolean;
  editable: boolean;
  busy: boolean;
  editRequest: number;
  readOnlyReason?: string;
  confirmedAt?: string;
  fileVersion?: number;
  onConfirm(): Promise<void>;
  onSave(data: InvoiceExtractedData): Promise<void>;
}) {
  const { t } = useTranslation();
  const currentData = useMemo(() => ({ ...data, description }), [data.invoiceFrom, data.billTo, data.invoiceDate, data.currency, data.total, JSON.stringify(data.paymentDetails), data.invoiceFromMatchesProfile, data.billToMatchesComets, description]);
  const [draft, setDraft] = useState(currentData);
  const [editing, setEditing] = useState(false);
  const [handledEditRequest, setHandledEditRequest] = useState(editRequest);
  useEffect(() => { setDraft(currentData); setEditing(false); }, [currentData]);
  useEffect(() => {
    if (editRequest > handledEditRequest && editable) {
      setEditing(true);
      setHandledEditRequest(editRequest);
    }
  }, [editRequest, handledEditRequest, editable]);
  const update = (key: keyof InvoiceExtractedData, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const descriptionMissing = editable && hasRecognition && !draft.description?.trim();
  return (
    <div className="invoice-summary-panel" role="tabpanel">
      <header><span className="resource-icon purple"><FileCheck2 size={17} /></span><div><h2>{t("invoice.informationReview")}</h2><p>{hasRecognition ? `${t("invoice.simulatedRecognition")}${confirmedAt ? t("invoice.fileConfirmed", { version: fileVersion }) : t("invoice.compareOriginal")}` : t("invoice.noRecognition")}</p></div>{editable ? <button className="invoice-inline-edit" type="button" aria-label={t(editing ? "invoice.cancelInformationEdit" : "invoice.editInformation")} onClick={() => { if (editing) setDraft(currentData); setEditing(!editing); }}><Pencil size={14} />{t(editing ? "invoice.cancelInformationEdit" : "invoice.editInformation")}</button> : null}</header>
      {readOnlyReason ? <div className="invoice-edit-readonly-note" role="note"><Info size={16} /><span>{displayCopy(readOnlyReason, t)}</span></div> : null}
      {hasRecognition && editable && !confirmedAt ? <p className="invoice-review-guidance">{t("invoice.reviewGuidance")}</p> : null}
      <dl className="external-ocr-fields">
        {([
          ["Invoice From", "invoiceFrom"],
          ["Bill To", "billTo"],
          ["Invoice date", "invoiceDate"],
          ["Description", "description"],
          ["Currency", "currency"],
          ["Total", "total"],
        ] as const).map(([label, key]) => (
          <div key={key} className="invoice-confirm-row">
            <dt>{label}</dt>
            <dd>{editing && editable ? key === "invoiceDate" ? <input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(draft.invoiceDate) ? draft.invoiceDate : ""} aria-label={label} onChange={(event) => update(key, event.target.value)} /> : key === "currency" ? <Select value={draft.currency} aria-label={label} onValueChange={(value) => update(key, value)}>{Array.from(new Set(["USD", "EUR", "GBP", "JPY", "AUD", "HKD", "SGD", expectedCurrency, draft.currency].filter(Boolean))).map((currency) => <option key={currency} value={currency}>{currency}</option>)}</Select> : key === "description" ? <textarea value={draft.description || ""} aria-label="Description" aria-required="true" aria-invalid={descriptionMissing} aria-describedby={descriptionMissing ? "invoice-description-error" : undefined} rows={2} placeholder={t("invoice.descriptionPlaceholder")} onChange={(event) => update("description", event.target.value)} /> : <input value={String(draft[key] || "")} aria-label={label} placeholder={t("invoice.fillFromDocument")} onChange={(event) => update(key, event.target.value)} /> : <strong>{String(draft[key] || t("invoice.needsReview"))}</strong>}
              <small className="invoice-prescribed-value">{key === "description" ? t("invoice.noPrescribedValue") : t("invoice.prescribedValue", { value: key === "invoiceFrom" ? expectedFrom : key === "billTo" ? "COMETS INTERNATIONAL LIMITED" : key === "currency" ? expectedCurrency : key === "total" ? expectedTotal : t("invoice.noPresetValue") })}</small>
              {confirmedAt ? <small className="invoice-original-value">{t("invoice.originalRecognition", { value: String(key === "description" ? originalDescription || t("invoice.unrecognized") : original?.[key] || t("invoice.unrecognized")) })}</small> : null}
              {key === "description" && descriptionMissing ? <small id="invoice-description-error" className="match-error" role="alert">{t("invoice.descriptionRequired")}</small> : null}
              {key === "invoiceFrom" && draft.invoiceFrom ? <small className={normalizeInvoiceIdentity(draft.invoiceFrom) === normalizeInvoiceIdentity(expectedFrom) ? "match-ok" : "match-error"}>{t(normalizeInvoiceIdentity(draft.invoiceFrom) === normalizeInvoiceIdentity(expectedFrom) ? "invoice.realNameMatches" : "invoice.realNameMismatch")}</small> : null}
              {key === "billTo" && draft.billTo ? <small className={normalizeInvoiceIdentity(draft.billTo) === normalizeInvoiceIdentity("COMETS INTERNATIONAL LIMITED") ? "match-ok" : "match-error"}>{t(normalizeInvoiceIdentity(draft.billTo) === normalizeInvoiceIdentity("COMETS INTERNATIONAL LIMITED") ? "invoice.billToValid" : "invoice.billToExpected")}</small> : null}
              {key === "currency" && draft.currency ? <small className={normalizeInvoiceIdentity(draft.currency) === normalizeInvoiceIdentity(expectedCurrency) ? "match-ok" : "match-error"}>{normalizeInvoiceIdentity(draft.currency) === normalizeInvoiceIdentity(expectedCurrency) ? t("invoice.currencyMatches") : t("invoice.expectedCurrency", { currency: expectedCurrency })}</small> : null}
              {key === "total" && draft.total ? <small className={Number(draft.total.replace(/,/g, "")) === Number(expectedTotal.replace(/,/g, "")) ? "match-ok" : "match-error"}>{Number(draft.total.replace(/,/g, "")) === Number(expectedTotal.replace(/,/g, "")) ? t("invoice.amountMatches") : t("invoice.expectedAmount", { amount: expectedTotal })}</small> : null}
            </dd>
          </div>
        ))}
      </dl>
      {editable ? <div className="invoice-page-actions">{editing ? <button type="button" className="secondary-button" disabled={busy || JSON.stringify(draft) === JSON.stringify(currentData)} onClick={() => void onSave(draft)}><Pencil size={15} />{t("invoice.saveCorrected")}</button> : <button type="button" className="primary-button" disabled={busy || Boolean(confirmedAt) || descriptionMissing} onClick={() => void onConfirm()}><FileCheck2 size={15} />{t(confirmedAt ? "invoice.pageConfirmed" : "invoice.confirmPage")}</button>}</div> : null}
    </div>
  );
}

function ExternalInvoicePayoutPanel({
  hasRecognition, editable, selectable, adminView, busy, account, accounts, rows,
  confirmedAt, confirmedDetails, confirmedCurrency, fileVersion, onSelect, onConfirm,
}: {
  hasRecognition: boolean;
  editable: boolean;
  selectable: boolean;
  adminView: boolean;
  busy: boolean;
  account?: PayoutAccount;
  accounts: PayoutAccount[];
  rows: Array<[string, string]>;
  confirmedAt?: string;
  confirmedDetails?: Record<string, string>;
  confirmedCurrency?: string;
  fileVersion?: number;
  onSelect(id: string): void;
  onConfirm(): Promise<void>;
}) {
  const { t } = useTranslation();
  const details: Record<string, string> | undefined = !selectable && confirmedDetails ? confirmedDetails : account ? payoutAccountPaymentDetails(account) : undefined;
  return (
    <div className="invoice-payout-panel" role="tabpanel">
      <header><div><h2>{t("invoice.payoutConfirmation")}</h2><p>{adminView ? t("invoice.adminMaskedNotice") : confirmedAt ? t("invoice.payoutFileConfirmed", { version: fileVersion }) : t("invoice.chooseInvoiceAccount")}</p></div></header>
      {!adminView ? <p className="invoice-payout-guidance">{t("invoice.payoutGuidance")}</p> : null}
      {!adminView && selectable ? <label className="invoice-account-choice"><span>{t("invoice.accountForInvoice")}</span><Select value={account?.id || ""} aria-label={t("invoice.selectInvoiceAccount")} onValueChange={onSelect}><option value="">{t("invoice.selectPayoutAccount")}</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.provider} · {item.currency} · {fullPayoutIdentifier(item)}</option>)}</Select></label> : null}
      {!adminView && !selectable && account ? <div className="invoice-account-choice"><span>{t("invoice.accountForInvoice")}</span><strong>{account.name} · {account.provider} · {account.currency}</strong></div> : null}
      {!hasRecognition ? <div className="invoice-account-pending" role="note"><Info size={17} />{t("invoice.selectAfterUpload")}</div> : null}
      {hasRecognition && !adminView && !account && !details ? <div className="invoice-account-pending" role="status"><Info size={17} />{t("invoice.selectVerifiedAccount")}</div> : null}
      {hasRecognition && !adminView && details ? <div className="invoice-recognized-payment"><h3>{t("invoice.selectedAccountDetails")}</h3><dl className="invoice-account-detail-rows">{Object.entries(PAYMENT_DETAIL_LABELS).map(([key, label]) => <div className="invoice-confirm-row invoice-payout-row" key={key}><dt className="invoice-row-label">{displayCopy(label, t)}</dt><dd className="invoice-row-value"><strong>{details[key] || t("status.missing")}</strong></dd></div>)}<div className="invoice-confirm-row invoice-payout-row"><dt className="invoice-row-label">Currency</dt><dd className="invoice-row-value"><strong>{confirmedCurrency || account?.currency || t("status.missing")}</strong></dd></div></dl>{editable ? <div className="invoice-page-actions"><button type="button" className="primary-button" disabled={busy || Boolean(confirmedAt)} onClick={() => void onConfirm()}><FileCheck2 size={15} />{t(confirmedAt ? "invoice.pageConfirmed" : "invoice.confirmPage")}</button></div> : null}</div> : null}
      {adminView ? <dl className="invoice-payment-compare-list">{rows.map(([label, value]) => <div key={label}><dt>{displayCopy(label, t)}</dt><dd><strong>{displayCopy(value, t)}</strong></dd></div>)}</dl> : null}
    </div>
  );
}

function FailedPaymentPayoutPanel({ invoice, attempts, account, accounts, selectedId, onSelect, adminView, submitted }: {
  invoice: Invoice;
  attempts: PaymentAttempt[];
  account?: PayoutAccount;
  accounts: PayoutAccount[];
  selectedId: string;
  onSelect(id: string): void;
  adminView: boolean;
  submitted: boolean;
}) {
  const { t, i18n } = useTranslation();
  const failed = failedPaymentSnapshot(invoice, attempts);
  const history = failed.snapshot;
  const proposed = submitted ? invoice.paymentRetryRequest?.payoutSnapshot : undefined;
  const snapshotDetails = (snapshot: NonNullable<typeof history>) => ({
    account_name: snapshot.accountName, account_number: snapshot.accountNumber,
    bank_name: snapshot.bankName, bank_address: snapshot.bankAddress,
    bank_country: snapshot.bankCountry || "", swift_code: snapshot.swiftCode,
    iban: snapshot.iban, transfer_method: snapshot.transferMethod || "",
    beneficiary_type: snapshot.beneficiaryType || "", paypal_email: snapshot.paypalEmail || "",
    payment_method: snapshot.provider === "PayPal" ? "PayPal" : "Bank Transfer",
  });
  const detailRows = (details: Record<string, string>, currency: string) => <dl className="invoice-account-detail-rows">
    {Object.entries(PAYMENT_DETAIL_LABELS).map(([key, label]) => <div className="invoice-confirm-row invoice-payout-row" key={key}><dt className="invoice-row-label">{displayCopy(label, t)}</dt><dd className="invoice-row-value"><strong>{details[key] || t("status.missing")}</strong></dd></div>)}
    <div className="invoice-confirm-row invoice-payout-row"><dt className="invoice-row-label">Currency</dt><dd className="invoice-row-value"><strong>{currency || t("status.missing")}</strong></dd></div>
  </dl>;
  return <div className="invoice-payout-panel invoice-failed-payout-panel" role="tabpanel">
    <header><div><h2>{t(adminView ? "invoice.payoutTab" : "invoice.payoutConfirmation")}</h2><p>{t(adminView ? "invoice.failedPayoutAdmin" : "invoice.failedPayoutCreator")}</p></div></header>
    {!adminView ? <p className="invoice-payout-guidance">{t("invoice.retryPayoutGuidance")}</p> : null}
    <div className="invoice-account-pending" role="status"><Info size={17} /><span>{t("invoice.providerReturnReason", { reason: displayCopy(invoice.paymentFailureReason || invoice.paymentIssue?.message || t("invoice.providerRejected"), t) })}</span></div>
    <section className="invoice-retry-section" aria-label={t("invoice.failedAttemptDetails")}>
      <h3>{t("invoice.failedAttemptDetails")}</h3>
      <p>{failed.occurredAt ? t("invoice.attemptRecordedAt", { date: Number.isNaN(Date.parse(failed.occurredAt)) ? failed.occurredAt : new Date(failed.occurredAt).toLocaleString(i18n.language === "en" ? "en-US" : "zh-CN") }) : t("invoice.attemptTimePending")}{failed.source === "INVOICE" ? t("invoice.legacyInvoiceSnapshot") : ""}</p>
      {history ? adminView
        ? <dl className="invoice-account-detail-rows">{payoutSnapshotRows(history, "ADMIN").map((row) => <div className="invoice-confirm-row invoice-payout-row" key={row.label}><dt className="invoice-row-label">{displayCopy(row.label, t)}</dt><dd className="invoice-row-value"><strong>{displayCopy(row.value, t)}</strong></dd></div>)}</dl>
        : detailRows(snapshotDetails(history), history.currency)
        : <div className="invoice-account-pending" role="status"><Info size={17} />{t("invoice.oldSnapshotMissing")}</div>}
    </section>
    {!adminView ? <section className="invoice-retry-section" aria-label={t("invoice.proposedRetryDetails")}>
      <h3>{t("invoice.proposedRetryDetails")}</h3>
      {submitted ? <p>{t("invoice.submittedSnapshot")}</p>
        : <label className="invoice-account-choice"><span>{t("invoice.retryAccount")}</span><Select value={account?.id || ""} aria-label={t("invoice.retryAccount")} onValueChange={onSelect}><option value="">{t("invoice.selectVerifiedUsable")}</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.provider} · {item.currency} · {fullPayoutIdentifier(item)}</option>)}</Select></label>}
      {proposed ? detailRows(snapshotDetails(proposed), proposed.currency)
        : account ? detailRows(payoutAccountPaymentDetails(account), account.currency)
          : <div className="invoice-account-pending" role="status"><Info size={17} />{t(selectedId ? "invoice.retryAccountUnavailable" : "invoice.chooseRetryAccount")}</div>}
    </section> : null}
  </div>;
}

function InvoiceDetailPage({ adminView = false }: { adminView?: boolean }) {
  const { t } = useTranslation();
  const { id, creatorId } = useParams();
  const {
    session,
    invoices,
    contracts,
    paymentAttempts,
    profile,
    signInternalInvoice,
    submitInvoiceFeedback,
    confirmExternalInvoice,
    confirmExternalInvoicePage,
    correctExternalInvoice,
    retryExternalRecognition,
    selectInvoicePayoutAccount,
    requestPaymentRetry,
  } = useApp();
  const { adminDetail } = useApp();
  const legacyAdmin = Boolean(adminView && creatorId);
  const legacyCreator = useAdminCreatorDetail(legacyAdmin ? creatorId : undefined);
  const adminCreator = legacyAdmin ? legacyCreator : { detail: adminDetail, attempts: paymentAttempts, loading: false, error: "" };
  const navigate = useNavigate();
  const location = useLocation();
  const invoiceSource = adminView
    ? adminCreator.detail?.invoices.find((item) => item.id === id || item.invoiceNumber === id)
    : invoices.find((item) => item.id === id || item.invoiceNumber === id);
  const invoice = invoiceSource ? migrateInvoice(invoiceSource) : undefined;
  const availableContracts = adminView ? adminCreator.detail?.contracts || [] : contracts;
  const currentProfile = normalizePayoutProfile(adminCreator.detail?.profile || profile);
  const backTo = legacyAdmin ? "/admin/invoices" : "/invoices";
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
  const [detailTab, setDetailTab] = useState<"SUMMARY" | "PAYOUT" | "PAYMENT">("SUMMARY");
  const [invoiceEditRequest, setInvoiceEditRequest] = useState(0);
  const [correctionAccountId, setCorrectionAccountId] = useState(() => (location.state as { retryAccountId?: string } | null)?.retryAccountId || "");
  const [retryDialog, setRetryDialog] = useState<"CONFIRM" | null>(null);
  useEffect(() => {
    setCorrectionAccountId((location.state as { retryAccountId?: string } | null)?.retryAccountId || "");
    setRetryDialog(null);
  }, [id, location.key]);
  const [storedDocumentUrl, setStoredDocumentUrl] = useState("");
  const [documentError, setDocumentError] = useState("");
  const storageId = invoice?.document?.storageId;
  const documentInvoiceId = invoice ? invoiceInternalIdOf(invoice) : "";
  const documentCreatorId = invoice?.creatorId || PRIMARY_CREATOR_ID;

  useEffect(() => {
    if (adminView || !storageId) { setStoredDocumentUrl(""); setDocumentError(""); return; }
    let active = true;
    let objectUrl = "";
    setStoredDocumentUrl("");
    setDocumentError("");
    services.invoices.getDocumentFile(documentInvoiceId, documentCreatorId).then((blob) => {
      if (!active) return;
      if (!blob) { setDocumentError("本地 Invoice 文件不可用，请重新上传文件。"); return; }
      objectUrl = URL.createObjectURL(blob);
      setStoredDocumentUrl(objectUrl);
    }).catch(() => {
      if (active) setDocumentError("本地 Invoice 文件读取失败，请重试。");
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [adminView, storageId, documentInvoiceId, documentCreatorId]);

  const downloadDocument = () => {
    if (adminView) { setDocumentError("未确认脱敏的 Invoice 原件不可供管理员下载。"); return; }
    void downloadInvoiceDocument(invoice).catch((error: unknown) => {
      setDocumentError(error instanceof Error ? error.message : "下载失败，请重试。");
    });
  };

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
  if (!invoice) return <div className="page-stack"><BackLink to="/invoices">{t("invoice.backToList")}</BackLink><EmptyState title={t("invoice.notFound")} copy={t("invoice.notFoundDescription")} /></div>;

  const number = invoiceNumberOf(invoice);
  const resourceId = invoiceInternalIdOf(invoice);
  const attemptHistory = attemptsForInvoice(invoice, adminView ? adminCreator.attempts : paymentAttempts);
  const review = invoiceReviewMeta(invoice);
  const payment = invoiceDetailPaymentMeta(invoice);
  const linkedContract = findLinkedContract(invoice, availableContracts);
  const kind = invoiceTypeOf(invoice);
  const state = invoice.documentState!;
  const paymentIssue = invoice.paymentIssue;
  const repairSubmitted = recoveryStatusIsSubmitted(invoice.paymentRecoveryStatus);
  const [amountCurrency = currentProfile.payout.currency || "USD", amountTotal = "0"] = invoice.amount.split(/\s+/, 2);
  const hasCurrentRecognition = kind === "EXTERNAL"
    && !["WAITING_UPLOAD", "RECOGNIZING", "RETURNED_FOR_REUPLOAD", "RECOGNITION_FAILED"].includes(state.status)
    && Boolean(invoice.extractedData);
  const currentFileVersion = invoice.sourceFileVersions?.at(-1);
  const currentRecognition = invoice.recognitionSnapshots?.at(-1);
  const pageConfirmation = (page: "INVOICE" | "PAYOUT") => {
    const confirmation = invoice.pageConfirmations?.[page];
    return confirmation?.fileVersionId === currentFileVersion?.fileVersionId
      && confirmation?.recognitionId === currentRecognition?.recognitionId
      ? confirmation : undefined;
  };
  const invoicePageConfirmation = pageConfirmation("INVOICE");
  const rawPayoutPageConfirmation = pageConfirmation("PAYOUT");
  const extractedData = (kind === "EXTERNAL" && !hasCurrentRecognition ? undefined : invoice.extractedData) || (kind === "EXTERNAL" ? {
    invoiceFrom: "",
    billTo: "",
    invoiceDate: "",
    description: "",
    currency: "",
    total: "",
    paymentDetails: {},
    invoiceFromMatchesProfile: false,
    billToMatchesComets: false,
  } : {
    invoiceFrom: invoice.invoiceFrom || "待同步",
    billTo: "COMETS INTERNATIONAL LIMITED",
    invoiceDate: invoice.issuedAt,
    description: "",
    currency: amountCurrency,
    total: amountTotal.replace(/,/g, ""),
    paymentDetails: payoutAccountPaymentDetails(currentProfile.payout),
    invoiceFromMatchesProfile: true,
    billToMatchesComets: true,
  });
  const usablePayoutAccounts = currentProfile.payoutAccounts.filter(isPayoutAccountUsable);
  const selectedPayoutAccount = (invoice.paymentStatus === "FAILED"
    ? currentProfile.payoutAccounts.find((account) => account.id === invoice.payoutAccountId)
    : usablePayoutAccounts.find((account) => account.id === invoice.payoutAccountId))
    || usablePayoutAccounts.find((account) => account.id === currentProfile.defaultPayoutAccountId)
    || currentProfile.payout;
  const boundPayoutAccount = currentProfile.payoutAccounts.find((account) => account.id === invoice.payoutAccountId);
  const retryAccountId = correctionAccountId || invoice.payoutAccountId || "";
  const retryAccount = usablePayoutAccounts.find((account) => account.id === retryAccountId);
  const lastFailedSnapshot = failedPaymentSnapshot(invoice, attemptHistory).snapshot;
  const retryMode: PaymentRetryMode = correctionAccountId && correctionAccountId !== invoice.payoutAccountId
    ? "SWITCH_ACCOUNT"
    : retryAccount && payoutAccountChangedSinceSnapshot(retryAccount, lastFailedSnapshot)
      ? "UPDATED_ACCOUNT" : "CONFIRM_ORIGINAL";
  const payoutPageConfirmation = rawPayoutPageConfirmation?.payoutAccountId === boundPayoutAccount?.id
    && rawPayoutPageConfirmation?.payoutAccountFingerprint === (boundPayoutAccount ? payoutAccountFingerprint(boundPayoutAccount) : undefined)
    ? rawPayoutPageConfirmation : undefined;
  const invoiceFromMatchesProfile = normalizeInvoiceIdentity(extractedData.invoiceFrom) === normalizeInvoiceIdentity(currentProfile.legalName);
  const billToMatchesComets = normalizeInvoiceIdentity(extractedData.billTo) === normalizeInvoiceIdentity("COMETS INTERNATIONAL LIMITED");
  const [expectedCurrency = amountCurrency, expectedTotal = amountTotal] = invoice.amount.split(/\s+/, 2);
  const amountMatches = Boolean(extractedData.total.trim()) && Number(extractedData.total.replace(/,/g, "")) === Number(expectedTotal.replace(/,/g, ""));
  const currencyMatches = normalizeInvoiceIdentity(extractedData.currency) === normalizeInvoiceIdentity(expectedCurrency);
  const currentDescription = hasCurrentRecognition && currentRecognition?.fileVersionId === currentFileVersion?.fileVersionId
    ? currentExternalCorrection(invoice)?.values.DESCRIPTION ?? extractedData.description ?? currentRecognition?.fields.DESCRIPTION ?? ""
    : "";
  const originalDescription = hasCurrentRecognition && currentRecognition?.fileVersionId === currentFileVersion?.fileVersionId
    ? currentRecognition?.fields.DESCRIPTION ?? currentRecognition?.extractedData.description ?? "" : "";
  const canConfirmExternal = hasCurrentRecognition && Boolean(invoicePageConfirmation) && Boolean(payoutPageConfirmation) && Boolean(extractedData.invoiceDate.trim()) && Boolean(currentDescription.trim()) && invoiceFromMatchesProfile && billToMatchesComets && amountMatches && currencyMatches;
  const isAwaitingSignature = state.kind === "INTERNAL" && state.status === "WAITING_SIGNATURE";
  const canUpload = state.kind === "EXTERNAL" && ["WAITING_UPLOAD", "RETURNED_FOR_REUPLOAD", "RECOGNITION_FAILED"].includes(state.status);
  const mainPayoutAccount = currentProfile.payoutAccounts.find(
    (account) => account.id === currentProfile.defaultPayoutAccountId,
  ) || currentProfile.payout;
  const payoutSnapshot = isAwaitingSignature
    ? createInvoicePayoutSnapshot(mainPayoutAccount, invoice.issuedAt)
    : invoice.payoutSnapshot || (kind === "EXTERNAL"
      ? boundPayoutAccount && createInvoicePayoutSnapshot(boundPayoutAccount, invoice.issuedAt)
      : createInvoicePayoutSnapshot(selectedPayoutAccount, invoice.issuedAt));
  const internalPayoutRows = payoutSnapshotRows(
    payoutSnapshot,
    adminView ? "ADMIN" : "CREATOR",
  );
  const visiblePayoutRows = adminView
    ? payoutSnapshotRows(payoutSnapshot, "ADMIN").map((row) => [row.label, row.value] as [string, string])
    : boundPayoutAccount ? creatorPayoutRows(boundPayoutAccount) : [];
  const paymentIssueCurrentValue = paymentIssue?.maskedValue || maskPayoutIdentifier(selectedPayoutAccount);

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

  const submitRetryRequest = async () => {
    if (!retryAccount) return;
    if (await runAction(() => requestPaymentRetry(resourceId, retryMode, retryAccount.id), "重新打款申请已提交财务复核")) {
      setRetryDialog(null);
      setCorrectionAccountId("");
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

  const lifecycleTimeline = invoiceLifecycleTimeline(invoice);

  return (
    <div className="page-stack">
      <BackLink to={backTo}>{t("invoice.backToList")}</BackLink>
      <PageHeading
        title={number}
        action={!adminView && (invoice.document || kind === "INTERNAL") ? <button type="button" className="secondary-button" onClick={downloadDocument}><Download size={15} />{t("invoice.downloadPdf")}</button> : undefined}
      />
      {notice ? <div className={`form-alert ${noticeTone}`}><CheckCircle2 size={17} />{displayCopy(notice, t)}</div> : null}
      {documentError ? <div className="form-alert danger" role="alert"><Info size={17} />{documentError}</div> : null}
      <div className="invoice-prototype-notice" role="note"><Info size={16} /><p><strong>{t("invoice.prototypeNoticeTitle")}</strong>{t("invoice.prototypeNotice")}</p></div>
      <section className="invoice-detail-metrics" aria-label={t("invoice.overview")}>
        <article><span>{t("invoice.reviewStatus")}</span><strong><i className={`invoice-metric-accent tone-${review.tone}`} />{displayCopy(review.label, t)}</strong><small>{t(kind === "INTERNAL" ? "invoice.internalWorkflow" : "invoice.externalWorkflow")}</small></article>
        <article><span>{t("invoice.invoiceAmount")}</span><strong>{invoice.amount}</strong><small>{kind === "EXTERNAL" ? (hasCurrentRecognition ? t("invoice.mockRecognitionResult", { currency: extractedData.currency || t("invoice.needsVerification") }) : t("invoice.verifyAfterUpload")) : t("invoice.systemGenerated", { currency: extractedData.currency })}</small></article>
        <article><span>{t("invoice.paymentStatus")}</span><strong><i className={`invoice-metric-accent tone-${payment.tone}`} />{displayCopy(payment.label, t)}</strong><small>{invoice.paymentExpectedAt ? t("invoice.expectedProcessing", { date: displayCopy(invoice.paymentExpectedAt, t) }) : t("invoice.independentStatuses")}</small></article>
      </section>

      {linkedContract ? <Link className="invoice-linked-contract" to={legacyAdmin ? `/admin/contracts/${creatorId}/${linkedContract.id}` : `/contracts/${linkedContract.id}`} aria-label={t("invoice.viewLinkedContract", { number: linkedContract.id })}><span className="invoice-linked-contract-icon"><Link2 size={16} /></span><span className="invoice-linked-contract-copy"><strong>{t("invoice.linkedContract")}</strong><small>{linkedContract.id}</small></span><StatusBadge label={contractStatusLabel[linkedContract.status]} tone={CONTRACT_STATUS[linkedContract.status].tone} /><span className="invoice-linked-contract-arrow" aria-hidden="true"><ArrowRight size={16} /></span></Link> : null}

      {invoice.paymentStatus === "FAILED" ? (
        <section className="payment-issue-alert" role="alert">
          <span className="payment-issue-alert-icon"><Info size={18} /></span>
          <div className="payment-issue-alert-content">
            <div><strong>{t("status.failedPayment")}</strong><span>{t(repairSubmitted ? "invoice.retryUnderReview" : "invoice.checkAccountForRetry")}</span></div>
            <p>{displayCopy(invoice.paymentFailureReason || paymentIssue?.message || "收款资料未通过付款校验", t)}</p>
            {paymentIssue ? <dl><div><dt>{t("invoice.errorField")}</dt><dd>{paymentIssue.fieldLabel}</dd></div><div><dt>{t("invoice.currentInformation")}</dt><dd>{paymentIssueCurrentValue || t("status.missing")}</dd></div></dl> : null}
          </div>
        </section>
      ) : invoice.rejectedReason ? <div className="form-alert danger"><Info size={17} /><div><strong>{t("invoice.returnReason")}</strong><p>{invoice.rejectedReason}</p></div></div> : null}

      {isAwaitingSignature && !adminView ? <div className="invoice-verification-notice" role="note"><Info size={18} /><div><strong>{t("invoice.verifyBeforeSigning")}</strong><p>{t("invoice.verifyDetailsNotice")}</p><p className="invoice-verification-responsibility">{t("invoice.demoSignatureDisclaimer")}</p></div></div> : null}

      <div className="document-layout">
        <section className={`invoice-viewer-card ${viewerExpanded ? "is-expanded" : ""}`}>
          <header className="invoice-viewer-toolbar">
            <div><span className="invoice-viewer-icon"><FileText size={18} /></span><span><strong>{t("invoice.fullDocument")}</strong><small>{number} · {t("invoice.fileVersions", { count: invoice.sourceFileVersions?.length || (invoice.document ? 1 : 0) })}</small></span></div>
            <div className="invoice-viewer-actions">
              <button type="button" className="invoice-expand-button" title={t(viewerExpanded ? "invoice.exitExpandedView" : "invoice.expandView")} aria-pressed={viewerExpanded} onClick={() => setViewerExpanded((expanded) => !expanded)}>{viewerExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{t(viewerExpanded ? "invoice.exitExpanded" : "invoice.expand")}</button>
              {!adminView && (invoice.document || kind === "INTERNAL") ? <button type="button" className="invoice-download-button" title={t("invoice.downloadNumber", { number })} onClick={downloadDocument}><Download size={15} />{t("invoice.downloadPdf")}</button> : null}
            </div>
          </header>
          <div className="invoice-document-stage">
            {adminView ? <div className="invoice-document-empty" role="note"><ShieldCheck size={22} /><strong>{t("invoice.originalUnavailable")}</strong><span>{t("invoice.adminDocumentNotice")}</span></div> : invoice.document ? (
              storageId && !storedDocumentUrl ? <div className="invoice-document-empty" role={documentError ? "alert" : "status"}>{documentError || t("invoice.readingFile")}</div>
                : invoice.document.mimeType === "application/pdf" && (storedDocumentUrl || invoice.document.previewUrl)
                  ? <Suspense fallback={<div className="invoice-document-empty" role="status">{t("invoice.preparingReader")}</div>}><PdfPages url={storedDocumentUrl || invoice.document.previewUrl!} signature={invoice.signature?.dataUrl} /></Suspense>
                  : <article className="invoice-paper invoice-source-paper uploaded-invoice-paper"><img className="invoice-source-image" src={storedDocumentUrl || invoice.document.previewUrl || "/INV-20260723-001-Alex-Ruiz-page-1.png"} alt={t("invoice.fullDocumentNumber", { number })} />{invoice.signature ? <img className="invoice-source-signature" src={invoice.signature.dataUrl} alt={t("pdf.savedSignature")} /> : null}</article>
            ) : (
              <div className="invoice-document-empty"><Upload size={28} /><strong>{t(state.kind === "EXTERNAL" ? "invoice.noFileUploaded" : "invoice.loadingDemo")}</strong>{canCreatorAct && canUpload ? <button type="button" className="primary-button" onClick={() => setUploadOpen(true)}><Upload size={16} />{t("invoice.upload")}</button> : null}</div>
            )}
          </div>
        </section>

        <aside className="document-sidebar">
          <section className="invoice-inspection-card">
            <div className="invoice-inspection-tabs" role="tablist" aria-label={t("invoice.detailInformation")}>
              {([ ["SUMMARY", "invoice.informationTab"], ["PAYOUT", "invoice.payoutTab"], ["PAYMENT", "invoice.paymentTab"] ] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={detailTab === value} className={detailTab === value ? "active" : ""} onClick={() => setDetailTab(value)}>{t(label)}</button>)}
            </div>
            <div className="invoice-inspection-body">
            {detailTab === "SUMMARY" && kind === "EXTERNAL" ? <ExternalInvoiceSummaryPanel data={extractedData} original={currentRecognition?.extractedData} description={currentDescription} originalDescription={originalDescription} expectedCurrency={expectedCurrency} expectedTotal={expectedTotal} expectedFrom={currentProfile.legalName} hasRecognition={hasCurrentRecognition} editable={canCreatorAct && hasCurrentRecognition && canCorrectExternalInvoice(state.status as Parameters<typeof canCorrectExternalInvoice>[0])} busy={busy} editRequest={invoiceEditRequest} readOnlyReason={adminView ? "管理员仅可查看外部 Invoice；票面信息须由达人在待确认或退回修改阶段处理。" : state.status === "WAITING_MEDIA_REVIEW" ? "已提交审核，暂不能修改 Invoice 信息；如需调整请等待审核退回。" : state.status === "APPROVED" ? "此 Invoice 已审核通过，票面信息不可修改。付款失败请在“收款信息”页处理账户。" : undefined} invoiceFromMatchesProfile={invoiceFromMatchesProfile} billToMatchesComets={billToMatchesComets} confirmedAt={invoicePageConfirmation?.confirmedAt} fileVersion={currentFileVersion?.version} onConfirm={async () => { if (await runAction(() => confirmExternalInvoicePage(resourceId, "INVOICE"), "Invoice 信息已确认，请继续核对收款信息")) setDetailTab("PAYOUT"); }} onSave={async (next) => { await runAction(() => correctExternalInvoice(resourceId, next), "纠正值已保存，初始模拟值已保留"); }} /> : null}
            {detailTab === "SUMMARY" && kind === "INTERNAL" ? <div className="invoice-summary-panel" role="tabpanel"><header><span className="resource-icon purple"><FileCheck2 size={17} /></span><div><h2>{t("invoice.summary")}</h2><p>{t("invoice.systemInformation")}</p></div></header><dl><div><dt>{t("invoice.number")}</dt><dd><strong>{number}</strong></dd></div><div><dt>{t("invoice.type")}</dt><dd><strong>{displayCopy(creatorInvoiceTypeLabel(invoice), t)}</strong></dd></div><div><dt>Invoice From</dt><dd><strong>{extractedData.invoiceFrom}</strong></dd></div><div><dt>Bill To</dt><dd><strong>{extractedData.billTo}</strong></dd></div><div><dt>Invoice date</dt><dd><strong>{extractedData.invoiceDate}</strong></dd></div><div><dt>Currency / Total</dt><dd><strong>{extractedData.currency} {extractedData.total}</strong></dd></div></dl></div> : null}
            {detailTab === "PAYOUT" && kind === "INTERNAL" ? <div className="invoice-payout-panel invoice-payout-snapshot" role="tabpanel"><header><div><h2>{t("invoice.payoutTab")}</h2><p>{t(isAwaitingSignature ? "invoice.currentAccountSnapshot" : "invoice.signedAccountSnapshot")}</p></div><span className="invoice-snapshot-label">{t(isAwaitingSignature ? "invoice.primaryAccount" : "invoice.readOnlySnapshot")}</span></header><dl className="invoice-payment-compare-list">{internalPayoutRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd><strong>{displayCopy(row.value, t)}</strong></dd></div>)}</dl></div> : null}

            {detailTab === "PAYOUT" && kind === "EXTERNAL" && invoice.paymentStatus === "FAILED" ? <FailedPaymentPayoutPanel invoice={invoice} attempts={attemptHistory} account={retryAccount} accounts={usablePayoutAccounts} selectedId={retryAccountId} onSelect={setCorrectionAccountId} adminView={adminView} submitted={repairSubmitted} /> : null}
            {detailTab === "PAYOUT" && kind === "EXTERNAL" && invoice.paymentStatus !== "FAILED" ? <ExternalInvoicePayoutPanel hasRecognition={hasCurrentRecognition} editable={canCreatorAct && hasCurrentRecognition && state.status === "WAITING_CONFIRMATION"} selectable={canCreatorAct && state.status === "WAITING_CONFIRMATION"} adminView={adminView} busy={busy} account={boundPayoutAccount} accounts={usablePayoutAccounts} rows={visiblePayoutRows} confirmedAt={payoutPageConfirmation?.confirmedAt} confirmedDetails={invoice.confirmedSnapshots?.at(-1)?.effectivePaymentDetails || payoutPageConfirmation?.effectivePaymentDetails} confirmedCurrency={state.status === "WAITING_CONFIRMATION" ? undefined : invoice.payoutSnapshot?.currency} fileVersion={currentFileVersion?.version} onConfirm={async () => { if (await runAction(() => confirmExternalInvoicePage(resourceId, "PAYOUT"), "收款信息已确认")) setDetailTab("SUMMARY"); }} onSelect={(id) => void runAction(() => selectInvoicePayoutAccount(resourceId, id), "收款账户已选择，请核对并确认本页")} /> : null}
            {detailTab === "SUMMARY" && canCreatorAct && state.kind === "EXTERNAL" && (state.status === "WAITING_CONFIRMATION" || state.status === "RETURNED_FOR_CORRECTION" || state.status === "RECOGNITION_FAILED" || canUpload) ? <div className="invoice-action-stack invoice-information-actions">{state.status === "WAITING_CONFIRMATION" ? <>{!canConfirmExternal ? <div className="signature-error" role="alert"><Info size={15} />{t("invoice.confirmBothPagesFirst")}</div> : null}<button className="primary-button" type="button" disabled={busy || !canConfirmExternal} onClick={() => void runAction(() => confirmExternalInvoice(resourceId), "Invoice 已确认并提交审核")}><FileCheck2 size={16} />{t("invoice.submitForReview")}</button></> : null}{state.status === "RETURNED_FOR_CORRECTION" ? <button className="primary-button" type="button" disabled={busy} onClick={() => { setDetailTab("SUMMARY"); setInvoiceEditRequest((current) => current + 1); }}><Pencil size={16} />{t("invoice.editInformation")}</button> : null}{state.status === "RECOGNITION_FAILED" ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void runAction(() => retryExternalRecognition(resourceId), "重新识别完成，请核对结果")}><RefreshCcw size={16} />{t("invoice.retryRecognition")}</button> : null}{canUpload ? <button className="primary-button" type="button" onClick={() => setUploadOpen(true)}><Upload size={16} />{t(state.status === "WAITING_UPLOAD" ? "invoice.upload" : "invoice.reupload")}</button> : null}</div> : null}
            {detailTab === "PAYMENT" ? <div className="invoice-process-panel" role="tabpanel"><header><div><h2>{t("invoice.paymentTab")}</h2><p>{invoice.expectedPaymentAt || invoice.paymentExpectedAt ? t("invoice.expectedPaymentTime", { date: displayCopy(invoice.expectedPaymentAt || invoice.paymentExpectedAt || "", t) }) : t("invoice.progressOnOriginal")}</p></div><StatusBadge label={payment.label} tone={payment.tone} /></header><dl className="invoice-payment-card"><div><dt>{t("invoice.number")}</dt><dd>{number}</dd></div><div><dt>{t("invoice.amountCurrency")}</dt><dd>{invoice.amount}</dd></div><div><dt>{t("invoice.paymentStatus")}</dt><dd>{displayCopy(payment.label, t)}</dd></div>{invoice.paidAt || invoice.paymentCompletedAt ? <div><dt>{t("invoice.completedAt")}</dt><dd>{invoice.paidAt || invoice.paymentCompletedAt}</dd></div> : null}{invoice.paymentFailureReason ? <div><dt>{t("invoice.failureReason")}</dt><dd>{invoice.paymentFailureReason}</dd></div> : null}</dl><div className="compact-timeline invoice-full-timeline" role="list" aria-label={t("invoice.paymentTimeline")}>{lifecycleTimeline.map(([label, status], index) => { const stateLabel = t(status === "complete" ? "invoice.timelineComplete" : status === "current" ? "invoice.timelineCurrent" : status === "error" ? "invoice.timelineError" : "status.notStarted"); return <div className={status} key={`${index}-${label}`} role="listitem" aria-current={status === "current" ? "step" : undefined} aria-label={`${displayCopy(label, t)}, ${stateLabel}`}><span aria-hidden="true">{status === "complete" ? <Check size={13} /> : status === "current" ? <Clock3 size={12} /> : status === "error" ? <Info size={13} /> : null}</span><div><strong>{displayCopy(label, t)}</strong><small>{stateLabel}</small></div></div>; })}</div>{invoice.returnReason || invoice.rejectedReason ? <div className="payment-repair-note"><Info size={17} /><span>{invoice.returnReason || invoice.rejectedReason}</span></div> : null}{repairSubmitted ? <div className="review-note"><Clock3 size={17} /><span>{t("invoice.retryFinanceReviewNotice")}</span></div> : null}</div> : null}
            </div>
            {detailTab === "PAYOUT" && canCreatorAct && invoice.paymentStatus === "FAILED" && !repairSubmitted ? <footer className="payment-retry-footer"><div className="payment-retry-context">{t(!retryAccount ? "invoice.chooseUsableAccount" : retryMode === "SWITCH_ACCOUNT" ? "invoice.proposedSwitch" : retryMode === "UPDATED_ACCOUNT" ? "invoice.updatedAccountRetry" : "invoice.useOriginalAccount", { name: retryAccount?.name })}</div><div className="payment-retry-actions"><button className="payment-edit-button" type="button" disabled={busy || !retryAccount} onClick={() => navigate(`/profile?repairInvoice=${number}&editAccount=${encodeURIComponent(retryAccount!.id)}&field=${paymentIssue?.fieldKey || "account_number"}#payout-information`, { state: { retryAccountId: retryAccount!.id } })}><Pencil size={16} />{t("invoice.editPayoutInformation")}</button><button className="payment-retry-button" type="button" disabled={busy || !retryAccount} onClick={() => setRetryDialog("CONFIRM")}><FileCheck2 size={16} />{t("invoice.confirmRetry")}</button></div></footer> : null}
            {canCreatorAct && isAwaitingSignature ? (
              <footer className="contract-information-actions invoice-signature-actions">
                <button className="invoice-issue-button" type="button" onClick={() => setIssueOpen(true)}><Info size={16} />{t("invoice.informationIssue")}</button>
                <button className="primary-button" type="button" disabled={busy || !isPayoutAccountUsable(mainPayoutAccount)} onClick={() => setSignatureOpen(true)}><PenLine size={16} />{t("contracts.confirmAndSign")}</button>
              </footer>
            ) : null}
          </section>
        </aside>
      </div>

      {canCreatorAct && retryDialog && invoice.paymentStatus === "FAILED" && !repairSubmitted ? <div className="invoice-upload-overlay" role="presentation"><section className="payment-retry-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-retry-dialog-title"><header><div><span className="invoice-issue-modal-icon"><WalletCards size={19} /></span><div><h2 id="payment-retry-dialog-title">{t("invoice.requestRetry")}</h2><p>{t("invoice.retryRecordNotice", { number })}</p></div></div><button type="button" className="icon-button" aria-label={t("common.closeDialog")} onClick={() => setRetryDialog(null)}><X size={18} /></button></header><p>{t(retryMode === "CONFIRM_ORIGINAL" ? "invoice.retryOriginalWarning" : retryMode === "SWITCH_ACCOUNT" ? "invoice.retryAlternateNotice" : "invoice.retryUpdatedNotice")}</p><div className="payment-retry-summary"><span>{t("invoice.requestMethod")}</span><strong>{t(retryMode === "SWITCH_ACCOUNT" ? "invoice.switchAccount" : retryMode === "UPDATED_ACCOUNT" ? "invoice.updatedAccount" : "invoice.originalAccount")}</strong><span>{t("profile.payoutAccount")}</span><strong>{retryAccount?.name} · {retryAccount?.provider} · {retryAccount && fullPayoutIdentifier(retryAccount)}</strong><span>{t("invoice.nextStep")}</span><strong>{t("invoice.financeReviewOnly")}</strong></div><footer><button type="button" className="secondary-button" disabled={busy} onClick={() => setRetryDialog(null)}>{t("common.cancel")}</button><button type="button" className="primary-button" disabled={busy || !retryAccount} onClick={() => void submitRetryRequest()}>{t("invoice.confirmSubmitRequest")}</button></footer></section></div> : null}
      {canCreatorAct && signatureOpen ? <SignatureModal document={{ kind: "INVOICE", number }} signerName={currentProfile.legalName} payoutAccountName={mainPayoutAccount.accountHolder || currentProfile.legalName} onClose={() => setSignatureOpen(false)} onConfirm={sign} /> : null}
      {canCreatorAct && uploadOpen && state.kind === "EXTERNAL" ? <InvoiceUploadModal invoice={invoice} onClose={() => setUploadOpen(false)} onUploaded={() => { setUploadOpen(false); setDetailTab("SUMMARY"); setNoticeTone("success"); setNotice("识别结果已在当前页面展示；核对 Invoice 信息后，请选择收款账户并确认"); }} /> : null}
      {canCreatorAct && issueOpen && isAwaitingSignature ? <div className="invoice-issue-modal-overlay" role="presentation"><form className="invoice-issue-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-issue-title" onSubmit={(event) => void submitIssue(event)}><header><div><span className="invoice-issue-modal-icon"><Info size={19} /></span><div><h2 id="invoice-issue-title">{t("invoice.reportIssue")}</h2><p>{t("invoice.describeIssue")}</p></div></div><button type="button" className="icon-button" title={t("common.close")} onClick={() => setIssueOpen(false)}><X size={18} /></button></header><label className="field"><span>{t("invoice.issueType")}</span><Select value={issueType} onValueChange={setIssueType}><option value="收款信息有误">{t("invoice.payoutIssue")}</option><option value="金额或币种有误">{t("invoice.amountCurrencyIssue")}</option><option value="Invoice 主体有误">{t("invoice.partyIssue")}</option><option value="其他信息有误">{t("invoice.otherIssue")}</option></Select></label><label className="field"><span>{t("invoice.issueDetails")}</span><textarea value={issueDetails} onChange={(event) => setIssueDetails(event.target.value)} placeholder={t("invoice.issuePlaceholder")} required /></label><footer><button type="button" className="secondary-button" onClick={() => setIssueOpen(false)}>{t("common.cancel")}</button><button type="submit" className="primary-button" disabled={!issueDetails.trim() || busy}>{t("invoice.submitFeedback")}</button></footer></form></div> : null}
      {issueSuccessOpen ? <div className="profile-save-overlay" role="presentation"><section className="profile-save-dialog" role="dialog" aria-modal="true" aria-labelledby="invoice-issue-success-title"><span className="profile-save-icon success"><CheckCircle2 size={25} /></span><h2 id="invoice-issue-success-title">{t("invoice.feedbackSuccess")}</h2><p>{t("invoice.feedbackPersisted", { type: displayCopy(submittedIssueType, t) })}</p><button type="button" className="primary-button" onClick={() => setIssueSuccessOpen(false)}>{t("invoice.gotIt")}</button></section></div> : null}
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

export const payoutDisplayGroup = (channel: PayoutAccount["channel"]) =>
  channel === "PAYPAL" ? "PAYPAL" : "BANK_TRANSFER";

export const bankProviderAfterChannelSelection = (
  current: "AIRWALLEX" | "PAYERMAX",
  channel: PayoutAccount["channel"],
): "AIRWALLEX" | "PAYERMAX" => channel === "PAYPAL" ? current : channel;

export const profileContactErrorMessage = (message: string) =>
  message.replaceAll("真实姓名 / Real Name", "真实姓名/公司名 / Real Name/Company Name");

export const preferredProfilePayoutAccount = (profile: UserProfile) =>
  profile.payoutAccounts?.find((account) => account.channel === "AIRWALLEX") || profile.payout;

export const shouldShowSocialEvidence = (status: UserProfile["social"]["verificationStatus"]) =>
  status !== "VERIFIED";

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

function ProfilePage({ adminView = false }: { adminView?: boolean }) {
  const { t } = useTranslation();
  const {
    profile,
    invoices,
    saveProfile,
    addSocialAccount,
  } = useApp();
  const location = useLocation();
  const returningRetryAccountId = (location.state as { retryAccountId?: string } | null)?.retryAccountId;
  const navigate = useNavigate();
  const repairParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const repairInvoiceId = adminView ? null : repairParams.get("repairInvoice");
  const returnInvoiceId = adminView ? null : repairParams.get("returnInvoice");
  const returnInvoice = invoices.find((item) => invoiceNumberOf(item) === returnInvoiceId && item.documentState?.kind === "EXTERNAL");
  const requestedAccount = profile.payoutAccounts.find((account) => account.id === repairParams.get("editAccount"));
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
  const [draft, setDraft] = useState(() => {
    const normalized = normalizePayoutProfile(profile);
    return {
      ...normalized,
      payout: normalized.payoutAccounts.find((account) => account.id === requestedAccount?.id) || preferredProfilePayoutAccount(normalized),
    };
  });
  const preserveDraftOnSocialAddition = useRef(false);
  const socialAddButtonRef = useRef<HTMLButtonElement>(null);
  const [socialAddOpen, setSocialAddOpen] = useState(false);
  const [newSocialUrl, setNewSocialUrl] = useState("");
  const [newSocialFiles, setNewSocialFiles] = useState<File[]>([]);
  const [socialAddError, setSocialAddError] = useState("");
  const [socialAddErrorField, setSocialAddErrorField] = useState<"url" | "files" | null>(null);
  const [socialAddSaving, setSocialAddSaving] = useState(false);
  const [editMode, setEditMode] = useState<ProfileEditMode>(
    !adminView && (repairInvoiceId || returnInvoice) ? "PAYOUT_ACCOUNT" : null,
  );
  const editing = editMode !== null;
  const profileEditing = editMode === "PROFILE";
  const payoutAccountEditing = editMode === "PAYOUT_ACCOUNT";
  const [activePayoutAccountId, setActivePayoutAccountId] = useState(
    requestedAccount?.id || preferredProfilePayoutAccount(profile).id,
  );
  const [selectedPayoutChannel, setSelectedPayoutChannel] = useState<
    PayoutAccount["channel"]
  >(requestedAccount?.channel || "AIRWALLEX");
  const [selectedBankProvider, setSelectedBankProvider] = useState<"AIRWALLEX" | "PAYERMAX">("AIRWALLEX");
  const [bankProviderExpanded, setBankProviderExpanded] = useState(false);
  const [transferMethodsExpanded, setTransferMethodsExpanded] = useState(false);
  const [openPayoutMenuId, setOpenPayoutMenuId] = useState("");
  const [payoutDialog, setPayoutDialog] =
    useState<PayoutAccountDialogState | null>(null);
  const [payoutToast, setPayoutToast] = useState("");
  const [condition, setCondition] = useState<AirwallexSchemaCondition>({
    bankCountryCode: airwallexCountryCode(draft.payout.bankCountry),
    accountCurrency: draft.payout.currency,
    entityType: draft.payout.beneficiaryType,
    transferMethod: draft.payout.transferMethod,
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
    ...draft.payout.schemaValues,
    account_name: draft.payout.accountHolder,
    account_number: draft.payout.accountNumber,
    bank_name: draft.payout.bankName,
    swift_code:
      draft.payout.schemaValues.swift_code || draft.payout.swiftCode,
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
    const displayedAccount = preferredProfilePayoutAccount(normalized);
    setDraft({ ...normalized, payout: displayedAccount });
    setActivePayoutAccountId(displayedAccount.id);
    setBankProviderExpanded(false);
    setTransferMethodsExpanded(false);
    setSelectedPayoutChannel((current) =>
      PAYOUT_CHANNELS.some((channel) => channel.id === current)
        ? current
        : "AIRWALLEX",
    );
    preserveNextTransferMethodRef.current = true;
    setCondition({
      bankCountryCode: airwallexCountryCode(displayedAccount.bankCountry),
      accountCurrency: displayedAccount.currency,
      entityType: displayedAccount.beneficiaryType,
      transferMethod: displayedAccount.transferMethod,
    });
    setSchemaValues({
      ...displayedAccount.schemaValues,
      account_name: displayedAccount.accountHolder,
      account_number: displayedAccount.accountNumber,
      bank_name: displayedAccount.bankName,
      swift_code:
        displayedAccount.schemaValues.swift_code ||
        displayedAccount.swiftCode,
    });
    setSchemaFieldErrors({});
    setSchemaTouched({});
    setPayoutAccountAliasTouched(false);
  };

  useEffect(() => {
    if (preserveDraftOnSocialAddition.current) {
      preserveDraftOnSocialAddition.current = false;
      setDraft((current) => mergeAddedSocialAccount(current, profile));
      return;
    }
    resetFromProfile(profile);
  }, [profile]);

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
    let active = true;
    services.corrections
      .list(profile.id)
      .then((result) => {
        if (active) setAdminCorrections(result.data.filter((item) => item.status === "OPEN"));
      })
      .catch(() => {
        if (active) setAdminCorrections([]);
      });
    return () => { active = false; };
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
    setTransferMethodsExpanded(false);
    setTransferMethodsLoading(true);
    setTransferMethodsError("");
    setTransferMethods([]);
    setResolvedTransferScenario("");
    services.payout
      .listTransferMethods({
        bankCountryCode: condition.bankCountryCode,
        accountCurrency: condition.accountCurrency,
        entityType: condition.entityType,
      })
      .then((result) => {
        if (!active) return;
        setTransferMethods(result.data);
        const nextMethod = resolveAirwallexTransferMethod(
          result.data,
          condition.transferMethod,
          preserveNextTransferMethodRef.current,
        );
        preserveNextTransferMethodRef.current = false;
        if (!nextMethod) {
          setTransferMethodsError("当前场景暂无可用转账方式，请调整付款场景。");
          setSchemaLoading(false);
          setTransferMethodsLoading(false);
          return;
        }
        if (nextMethod && nextMethod.value !== condition.transferMethod) {
          updateCondition({ transferMethod: nextMethod.value });
        }
        setResolvedTransferScenario(scenario);
        setTransferMethodsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setTransferMethodsError("转账方式加载失败，请重试。");
        setTransferMethods([]);
        setSchemaLoading(false);
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
    setTransferMethodsExpanded(false);
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

  const transferMethodReady =
    !transferMethodsLoading &&
    !transferMethodsError &&
    resolvedTransferScenario === transferMethodScenarioKey(condition) &&
    transferMethods.some((method) => method.available && method.value === condition.transferMethod);

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
      if (!schema || schemaLoading || !transferMethodReady) {
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
      await new Promise<void>((resolve) => window.setTimeout(resolve, 650));
      setDraft(validatedDraft);
      setEditMode(null);
      setTransferMethodsExpanded(false);
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
      const errorMessage = caught instanceof Error
        ? caught.message
        : "暂时无法保存，请检查资料后重试。";
      setSaveError(profileEditing ? profileContactErrorMessage(errorMessage) : errorMessage);
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

  const closeSocialAdd = () => {
    setSocialAddOpen(false);
    setSocialAddError("");
    setSocialAddErrorField(null);
    setNewSocialUrl("");
    setNewSocialFiles([]);
    window.requestAnimationFrame(() => socialAddButtonRef.current?.focus());
  };

  const chooseSocialAddFiles = (selected: FileList | null) => {
    const incoming = Array.from(selected || []);
    if (!incoming.length) return;
    const errorCode = incoming.some((file) => !["image/png", "image/jpeg"].includes(file.type))
      ? "invalidScreenshotType"
      : incoming.some((file) => !file.size || file.size > 8 * 1024 * 1024)
        ? "invalidScreenshotSize"
        : newSocialFiles.length + incoming.length > 6
          ? "tooManyScreenshots"
          : "";
    if (errorCode) {
      setSocialAddError(t(`profile.socialErrors.${errorCode}`));
      setSocialAddErrorField("files");
      return;
    }
    setNewSocialFiles((current) => [...current, ...incoming]);
    setSocialAddError("");
    setSocialAddErrorField(null);
  };

  const submitSocialAddition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (socialAddSaving) return;
    const input = { creatorId: profile.id, profileUrl: newSocialUrl, screenshots: newSocialFiles };
    try {
      validateSocialAccountAddition(profile.social, input);
      setSocialAddError("");
      setSocialAddErrorField(null);
      setSocialAddSaving(true);
      const updated = await addSocialAccount(input);
      preserveDraftOnSocialAddition.current = true;
      setDraft((current) => mergeAddedSocialAccount(current, updated));
      closeSocialAdd();
    } catch (error) {
      setSocialAddError(error instanceof SocialAccountError ? t(`profile.socialErrors.${error.code}`) : t("profile.socialErrors.storageFailed"));
      setSocialAddErrorField(error instanceof SocialAccountError
        ? ["invalidUrl", "duplicateUrl"].includes(error.code) ? "url" : error.code === "storageFailed" ? null : "files"
        : null);
    } finally {
      setSocialAddSaving(false);
    }
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
    setSelectedBankProvider((current) => bankProviderAfterChannelSelection(current, account.channel));
    setBankProviderExpanded(false);
    setTransferMethodsExpanded(false);
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
    setSelectedBankProvider("AIRWALLEX");
    setBankProviderExpanded(false);
    setTransferMethodsExpanded(false);
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
        title={t("menu.profile")}
        subtitle={t("profile.pageDescription")}
        action={adminView ? <Link className="secondary-button" to={`/admin/settings/users/${profile.id}`}>{t("profile.goToUserManagement")}</Link> :
          profileEditing ? (
            <div className="button-group">
              <button className="secondary-button" disabled={saving} onClick={cancelEditing}>{t("common.cancel")}</button>
              <button className="primary-button compact" disabled={saving || schemaLoading || Boolean(schemaError) || !transferMethodReady} onClick={save}>{t(saving ? "profile.validating" : "common.saveChanges")}</button>
            </div>
          ) : payoutAccountEditing ? (
            undefined
          ) : (
            <button className="secondary-button" onClick={() => { setEditMode("PROFILE"); setSaveState("idle"); setSaveError(""); }}><Pencil size={16} />{t("profile.editProfile")}</button>
          )
        }
      />

      {returnInvoice ? <section className="profile-invoice-return-banner" role="note"><Info size={17} /><span>{t("profile.returnInvoiceNotice")}</span><button type="button" className="secondary-button" onClick={() => navigate(`/invoices/${encodeURIComponent(invoiceNumberOf(returnInvoice))}`)}>{t("profile.returnToInvoice")}</button></section> : null}

      {adminCorrections.length ? (
        <section className="profile-admin-correction-banner" role="alert">
          <span><AlertCircle size={18} /></span>
          <div>
            <strong>{t("profile.adminCorrections", { count: adminCorrections.length })}</strong>
            <ul>
              {adminCorrections.map((item) => (
                <li key={item.id}>
                  {displayCopy(item.fieldLabel, t)}：{displayCopy(item.reason, t)}
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
            <strong>{t("profile.repairingInvoice", { number: repairInvoiceId })}</strong>
                  <p>{t("profile.repairGuidance", { field: displayCopy(repairIssue.fieldLabel, t) })}</p>
          </div>
        </section>
      ) : null}

      <section className="profile-summary-banner">
        <span className="profile-avatar">{profile.displayName.slice(0, 1)}</span>
        <div className="profile-summary-copy">
          <div>
            <h2>{profile.displayName}</h2>
            <p>{displayCopy(profile.social.handle, t)} · {displayCopy(profile.social.platform, t)}</p>
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
      </section>

      <section className="profile-overview" aria-label={t("profile.overview")}>
        <article><span>{t("profile.socialAccounts")}</span><strong>{t("profile.accountCount", { count: platformProfiles.length })}</strong><small>{[...new Set(platformProfiles.map((item) => displayCopy(item.platform, t)))].join(" · ")}</small></article>
        <article><span>{t("profile.invoiceContact")}</span><strong>{t(draft.legalName ? "profile.complete" : "profile.incomplete")}</strong><small>{draft.email}</small></article>
        <article>
          <span>{t("profile.payoutChannels")}</span>
          <strong>{[...new Set(payoutAccounts.filter((account) => account.status !== "DISABLED").map((account) => account.provider))].join(" · ") || t("profile.addPending")}</strong>
          <small>{t("profile.accountAvailability", { total: payoutAccounts.length, available: usablePayoutAccounts.length })}</small>
        </article>
        <article>
          <span>{t("profile.defaultAccount")}</span>
          <strong>{defaultPayoutAccount?.name || t("profile.notSet")}</strong>
          <small>{defaultPayoutAccount ? payoutAccountSummary(defaultPayoutAccount) : t("profile.noUsableAccount")}</small>
        </article>
      </section>

      <div className="profile-sections">
        <section className="detail-card form-detail-card profile-section-card">
          <header className="profile-social-section-header">
            <div><span className="profile-section-icon profile-section-icon-social"><Globe2 size={17} /></span><div><h2>{t("profile.socialAccounts")}</h2><p>{t("profile.socialGuidance")}</p></div></div>
            {!adminView ? <button ref={socialAddButtonRef} type="button" className="secondary-button profile-add-social-button" onClick={() => setSocialAddOpen(true)}><Plus size={16} aria-hidden="true" />{t("profile.addSocialAccount")}</button> : <ShieldCheck size={19} aria-hidden="true" />}
          </header>
          <div className="profile-social-grid">
            {platformProfiles.map((item) => {
              const demoVerified = socialProfileIsDemoVerified(draft.social, item.url);
              const showEvidence = !demoVerified && shouldShowSocialEvidence(draft.social.verificationStatus);
              return <article className={`profile-social-account-card ${showEvidence ? "" : "is-verified"}`} key={item.url}>
                <div className="profile-social-account-main">
                  <span className={`social-brand-icon social-brand-${item.platform.toLowerCase()}`}><SocialBrandIcon platform={item.platform} /></span>
                  <div><strong>{item.platform}</strong><span>{item.accountName}</span></div>
                  {!profileEditing ? <StatusBadge label={demoVerified ? t("profile.localDemoVerified") : draft.social.verificationStatus === "VERIFIED" ? t("profile.accountVerified") : draft.social.verificationStatus === "CHANGES_REQUESTED" ? t("profile.profileNeedsCorrection") : t("profile.verificationInProgress")} tone={demoVerified || draft.social.verificationStatus === "VERIFIED" ? "success" : "amber"} /> : null}
                  <a href={item.url} target="_blank" rel="noreferrer" aria-label={t("profile.viewSocialProfile", { platform: item.platform })}><ExternalLink size={14} /></a>
                </div>
                {showEvidence ? <div className="profile-social-evidence">
                  <span>{t("profile.verificationScreenshots")}</span>
                  <div className="profile-resource-list">
                    {item.evidence.length
                      ? item.evidence.map((file) => <span key={file.id}>{file.name}</span>)
                      : <span>{t("profile.notUploaded")}</span>}
                  </div>
                  {profileEditing ? (
                    <label className="social-evidence-upload">
                      <Upload size={14} />{t("profile.uploadVerificationScreenshot")}
                      <input type="file" accept="image/png,image/jpeg" multiple onChange={(event) => uploadSocialEvidence(item.url, event)} />
                    </label>
                  ) : null}
                </div> : null}
              </article>;
            })}
          </div>
        </section>

        <section className="detail-card form-detail-card profile-section-card">
          <header>
            <div><span className="profile-section-icon profile-section-icon-contact"><ReceiptText size={17} /></span><div><h2>{t("profile.invoiceContact")}</h2><p>{t("profile.invoiceFromInformation")}</p></div></div>
            <UserRound size={19} />
          </header>
          <div className="form-grid profile-contact-grid">
            <label><span>{t("profile.realNameCompany")} *</span><input disabled={!profileEditing} required value={draft.legalName} onChange={(event) => setDraft({ ...draft, legalName: event.target.value })} /></label>
            <label><span>{t("profile.phone")} *</span><input disabled={!profileEditing} required value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
            <label className={emailInvalid ? "profile-contact-field-error" : undefined}>
              <span>{t("profile.contactEmail")} *</span>
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
                  {t("profile.invalidEmail")}
                </small>
              ) : null}
            </label>
            <label className="full"><span>{t("profile.address")} *</span><input disabled={!profileEditing} required value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
          </div>
        </section>

        <section className="detail-card form-detail-card profile-section-card payout-accounts-card">
          <header>
            <div><span className="profile-section-icon profile-section-icon-payout"><WalletCards size={17} /></span><div><h2>{t("profile.payoutAccount")}</h2><p>{t("profile.payoutGuidance")}</p></div></div>
            <StatusBadge label={t("profile.availableCount", { count: selectedUsablePayoutAccounts.length })} tone={selectedUsablePayoutAccounts.length ? "success" : "danger"} />
          </header>

          <div className="payout-channel-selector payout-channel-groups" role="group" aria-label={t("profile.payoutMethod")}>
            <div className={`payout-bank-choice${payoutDisplayGroup(selectedPayoutChannel) === "BANK_TRANSFER" && !payoutAccountEditing ? " has-change" : ""}`}>
              <button type="button" aria-pressed={payoutDisplayGroup(selectedPayoutChannel) === "BANK_TRANSFER"} disabled={payoutAccountEditing} className={payoutDisplayGroup(selectedPayoutChannel) === "BANK_TRANSFER" ? "is-selected" : ""} onClick={() => { setOpenPayoutMenuId(""); setSelectedPayoutChannel(selectedBankProvider); setBankProviderExpanded(false); }}>
                <strong>Bank Transfer</strong><span>{t("profile.bankTransfer")} · {selectedBankProvider === "AIRWALLEX" ? "Airwallex" : "PayerMax"}</span>
              </button>
              {payoutDisplayGroup(selectedPayoutChannel) === "BANK_TRANSFER" && !payoutAccountEditing ? (
                <button
                  type="button"
                  className="payout-provider-change"
                  aria-expanded={bankProviderExpanded}
                  aria-controls="payout-bank-providers"
                  onClick={() => { setOpenPayoutMenuId(""); setBankProviderExpanded((current) => !current); }}
                >
                  {t(bankProviderExpanded ? "profile.collapseOptions" : "profile.changeChannel")}
                </button>
              ) : null}
            </div>
            <button type="button" aria-pressed={selectedPayoutChannel === "PAYPAL"} disabled={payoutAccountEditing} className={selectedPayoutChannel === "PAYPAL" ? "is-selected is-upcoming" : "is-upcoming"} onClick={() => { setOpenPayoutMenuId(""); setSelectedPayoutChannel("PAYPAL"); setBankProviderExpanded(false); }}>
              <strong>PayPal</strong><span>{t("profile.unavailableAccountCount", { count: payoutAccountsForChannel(payoutAccounts, "PAYPAL").length })}</span>
            </button>
          </div>
          {payoutDisplayGroup(selectedPayoutChannel) === "BANK_TRANSFER" && bankProviderExpanded ? <div id="payout-bank-providers" className="payout-channel-selector payout-provider-selector" role="group" aria-label={t("profile.bankProviders")}>
            {PAYOUT_CHANNELS.filter((channel) => channel.id !== "PAYPAL").map((channel) => {
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
                  aria-pressed={isSelected}
                  disabled={payoutAccountEditing}
                  className={[
                    isSelected ? "is-selected" : "",
                    channel.isAvailable ? "" : "is-upcoming",
                  ].filter(Boolean).join(" ")}
                  onClick={() => {
                    setOpenPayoutMenuId("");
                    setSelectedPayoutChannel(channel.id);
                    setSelectedBankProvider((current) => bankProviderAfterChannelSelection(current, channel.id));
                    setBankProviderExpanded(false);
                  }}
                >
                  <strong>{channel.label}</strong>
                  <span>
                    {channel.isAvailable
                      ? t("profile.accountAvailability", { total: channelAccounts.length, available: channelUsableAccounts.length })
                      : t("profile.unavailableAccountCount", { count: channelAccounts.length })}
                  </span>
                </button>
              );
            })}
          </div> : null}

          <div
            id="payout-channel-accounts"
            className="payout-channel-account-stage"
            role="region"
            aria-label={t("profile.providerAccounts", { provider: selectedPayoutChannelConfig.label })}
          >
            {incompletePayoutAccounts.length ? (
              <aside className="payout-incomplete-notice" role="note">
                <AlertCircle size={16} />
                <div>
                  <strong>{t("profile.incompleteAccountCount", { count: incompletePayoutAccounts.length })}</strong>
                  <span>{t("profile.incompleteAccountsNotice")}</span>
                </div>
              </aside>
            ) : null}

            {!selectedPayoutAccounts.length ? (
              <div className="payout-channel-empty" role="status">
                <WalletCards size={20} />
                <div>
                  <strong>{t("profile.noProviderAccount", { provider: selectedPayoutChannelConfig.label })}</strong>
                  <span>
                    {selectedPayoutChannelConfig.isAvailable
                      ? t("profile.addAndVerifyAccount")
                      : t("profile.channelUnavailableNotice")}
                  </span>
                </div>
              </div>
            ) : !selectedUsablePayoutAccounts.length ? (
              <div className="payout-usable-empty" role="status">
                <WalletCards size={20} />
                <strong>{t("profile.noVerifiedAccount")}</strong>
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
                const destructiveLabel = t(destructiveAction === "DELETE" ? "profile.deleteAccount" : "profile.disableAccount");
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
                        <span className="payout-default-star" aria-label={t("profile.defaultAccount")} title={t("profile.defaultAccount")}>
                          <Star size={14} fill="currentColor" />
                        </span>
                      ) : null}
                      {!adminView && !payoutAccountEditing ? (
                        <button
                          type="button"
                          className="payout-account-menu-trigger"
                          aria-label={t("profile.openAccountMenu", { name: displayAccountName })}
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
                      {!adminView && !payoutAccountEditing && openPayoutMenuId === account.id ? (
                        <div className="payout-account-menu" role="menu" aria-label={t("profile.accountActions", { name: displayAccountName })}>
                          <button type="button" role="menuitem" onClick={() => editPayoutAccount(account)}>
                            <Pencil size={14} />{t("profile.editAccount")}
                          </button>
                          {!isDefault ? (
                            <button
                              type="button"
                              role="menuitem"
                              className={!isPayoutAccountUsable(account) ? "is-disabled" : ""}
                              aria-disabled={!isPayoutAccountUsable(account)}
                              title={!isPayoutAccountUsable(account) ? t("profile.defaultEligibleOnly") : undefined}
                              onClick={() => {
                                setOpenPayoutMenuId("");
                                setDefaultPayoutAccount(account);
                              }}
                            >
                              <Star size={14} />{t("profile.makeDefault")}
                            </button>
                          ) : null}
                          {isDisabled ? (
                            <button type="button" role="menuitem" onClick={() => reactivatePayoutAccount(account)}>
                              <RefreshCcw size={14} />{t("profile.reactivate")}
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
                              title={destructiveAction === "LOCKED" ? t("profile.accountLocked") : undefined}
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
            {!adminView && selectedPayoutChannel === "AIRWALLEX" && !payoutAccountsForChannel(payoutAccounts, "AIRWALLEX").length ? <button type="button" className="secondary-button" disabled={payoutAccountEditing} onClick={addAirwallexAccount}>
              <Plus size={15} />{t("profile.airwallexAccount")}
            </button> : null}
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
                  <h2>{t("profile.accountConfiguration")}</h2>
                  <p>{t("profile.internalNicknameNotice")}</p>
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
                <span>{t("profile.accountNickname")} *</span>
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
                  placeholder={t("profile.nicknamePlaceholder")}
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

        {selectedPayoutChannel === "AIRWALLEX" ? <>
        <section className="detail-card form-detail-card profile-section-card payout-condition-card">
          <header>
            <div><span className="profile-section-icon profile-section-icon-scenario"><RefreshCcw size={17} /></span><div><h2>{t("profile.paymentScenario")}</h2><p>{t("profile.scenarioDescription")}</p></div></div>
            {schemaLoading || transferMethodsLoading ? <StatusBadge label="正在同步" tone="amber" /> : schemaError || transferMethodsError ? <StatusBadge label="同步失败" tone="danger" /> : <StatusBadge label="已同步" tone="success" />}
          </header>
          <div className="form-grid airwallex-condition-grid profile-condition-grid">
            <label>
              <span>{t("profile.country")} *</span>
              <Select disabled={!editing || schemaLoading || transferMethodsLoading} value={condition.bankCountryCode} onValueChange={(value) => updateCondition({ bankCountryCode: value })}>
                {AIRWALLEX_COUNTRIES.map((item) => <option key={item.value} value={item.value}>{displayCopy(item.label, t)}</option>)}
              </Select>
            </label>
            <label>
              <span>{t("profile.recipientType")} *</span>
              <Select disabled={!editing || schemaLoading || transferMethodsLoading} value={condition.entityType} onValueChange={(value) => updateCondition({ entityType: value as "PERSONAL" | "COMPANY" })}>
                <option value="PERSONAL">{t("profile.individual")}</option>
                <option value="COMPANY">{t("profile.company")}</option>
              </Select>
            </label>
            <label>
              <span>{t("profile.accountCurrency")} *</span>
              <Select disabled={!editing || schemaLoading || transferMethodsLoading} value={condition.accountCurrency} onValueChange={(value) => updateCondition({ accountCurrency: value })}>
                {["USD", "EUR", "GBP", "JPY", "AUD", "HKD", "SGD"].map((item) => <option key={item}>{item}</option>)}
              </Select>
            </label>
            <ProfileTransferMethods
              methods={transferMethods}
              selectedValue={condition.transferMethod}
              editing={editing && !schemaLoading && transferMethodReady}
              expanded={transferMethodsExpanded}
              loading={transferMethodsLoading || resolvedTransferScenario !== transferMethodScenarioKey(condition)}
              error={transferMethodsError}
              onSelect={(value) => updateCondition({ transferMethod: value })}
              onExpandedChange={setTransferMethodsExpanded}
            />
          </div>
        </section>

        <section
          id="payout-information"
          ref={payoutDetailRef}
          className={`detail-card form-detail-card profile-section-card payout-detail-card ${isRepairFlow ? "is-repairing" : ""}`}
        >
          <header>
            <div><span className="profile-section-icon profile-section-icon-bank"><Landmark size={17} /></span><div><h2>{t("profile.airwallexPaymentInformation")}</h2><p>{displayCopy(selectedCountry, t)} · {condition.accountCurrency} · {t(condition.transferMethod === "LOCAL" ? "profile.localTransfer" : "profile.internationalTransfer")}</p></div></div>
            {!editing && draft.payout.status === "VALIDATED" ? <StatusBadge label="校验通过" tone="success" /> : null}
          </header>
          {schemaError ? <div className="form-alert danger">{displayCopy(schemaError, t)}</div> : null}
          {transferMethodsError ? <div className="form-alert danger">{t("profile.reloadMethodsAfterScenarioChange")}</div> : null}
          {schemaLoading || transferMethodsLoading ? (
            <LoadingRows />
          ) : transferMethodsError ? null : schema ? (
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
                    <span>{displayCopy(field.label, t)}{field.required ? " *" : ""}</span>
                    {field.type === "SELECT" ? (
                      <Select
                        disabled={!editing}
                        required={field.required}
                        value={schemaValues[field.key] || ""}
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={fieldError ? errorId : undefined}
                        onBlur={() => validateSchemaField(field.key)}
                        onValueChange={(value) => updateSchemaField(field.key, value)}
                      >
                        <option value="">{t("common.select")}</option>
                        {field.options?.map((option) => <option key={option.value} value={option.value}>{displayCopy(option.label, t)}</option>)}
                      </Select>
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
                        placeholder={editing ? displayCopy(field.placeholder || "", t) : undefined}
                        pattern={field.pattern}
                        title={displayCopy(field.description || "", t)}
                        inputMode={field.validationRules?.some((rule) => rule.name === "DigitsOnly") ? "numeric" : undefined}
                        autoCapitalize={field.key === "account_name" ? "words" : field.key === "iban" ? "characters" : undefined}
                        spellCheck={field.key === "account_name" || field.key === "iban" ? false : undefined}
                      />
                    )}
                    {fieldError ? (
                      <small id={errorId} className="profile-schema-field-error-copy" role="alert">
                        {displayCopy(fieldError, t)}
                      </small>
                    ) : null}
                  </label>
                );
              })}
            </div>
          ) : null}
          {!schemaLoading && !transferMethodsError && schema ? (
            <div className="profile-supplemental-panel">
              <div className="profile-payout-section-heading">
                <div><strong>{t("profile.supplementalInformation")}</strong><span>{t("profile.optionalFieldsNotice")}</span></div>
              </div>
              <aside className="profile-supplemental-reminder" role="note">
                <Info size={16} />
                <div>
                  <strong>{t("profile.completeSupplementalInformation")}</strong>
                  <p>{t("profile.supplementalGuidance")}</p>
                </div>
              </aside>
              <div className="form-grid profile-supplemental-fields">
                {supplementalFields.map((field) => (
                  <label key={field.key} className={field.fullWidth ? "full" : undefined}>
                    <span>{displayCopy(field.label, t)}</span>
                    {field.type === "SELECT" ? (
                      <Select disabled={!editing} value={draft.payout.schemaValues[field.key] || ""} onValueChange={(value) => updateSupplementalField(field.key, value)}>
                        <option value="">{t("common.select")}</option>
                        {field.options?.map((option) => <option key={option.value} value={option.value}>{displayCopy(option.label, t)}</option>)}
                      </Select>
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
              aria-label={t("profile.accountEditActions")}
            >
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={cancelEditing}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={saving || schemaLoading || Boolean(schemaError) || !transferMethodReady}
                onClick={save}
              >
                {t(saving ? "profile.validating" : "common.saveChanges")}
              </button>
            </footer>
          ) : null}
        </section>
        </> : null}
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
                  {t(payoutDialog.kind === "REPLACE_DEFAULT"
                    ? "profile.replaceDefaultFirst"
                    : payoutDialog.operation === "DELETE"
                      ? "profile.deleteAccountQuestion"
                      : "profile.disableAccountQuestion")}
                </h2>
                <p id="payout-account-dialog-description">
                  {t(payoutDialog.kind === "REPLACE_DEFAULT"
                    ? "profile.replaceDefaultDescription"
                    : payoutDialog.operation === "DELETE"
                      ? "profile.deleteAccountDescription"
                      : "profile.disableAccountDescription")}
                </p>
              </div>
            </header>

            <dl className="payout-account-dialog-summary">
              <div><dt>{t("profile.accountName")}</dt><dd>{payoutDialogAccount.name}</dd></div>
              <div><dt>{t("profile.accountType")}</dt><dd>{payoutDialogAccount.provider}</dd></div>
              <div><dt>{t("profile.currency")}</dt><dd>{payoutDialogAccount.currency}</dd></div>
              <div><dt>{t("profile.accountOrEmail")}</dt><dd>{maskPayoutIdentifier(payoutDialogAccount)}</dd></div>
            </dl>

            {payoutDialog.kind === "REPLACE_DEFAULT" ? (
              <div className="payout-replacement-section">
                <strong>{t("profile.selectNewDefault")}</strong>
                {replacementAccounts.length ? (
                  <div className="payout-replacement-list" role="radiogroup" aria-label={t("profile.newDefaultAccount")}>
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
                    <span>{t("profile.noReplacementAvailable")}</span>
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
                {t("common.cancel")}
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
                {t(accountMutationSaving
                  ? "common.processing"
                  : payoutDialog.kind === "REPLACE_DEFAULT"
                    ? payoutDialog.operation === "DELETE"
                      ? "profile.replaceAndDelete"
                      : "profile.replaceAndDisable"
                    : payoutDialog.operation === "DELETE"
                      ? "profile.deleteAccount"
                      : "profile.confirmDisable")}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {payoutToast ? (
        <div className="payout-account-toast" role="status" aria-live="polite">
          <CheckCircle2 size={17} />
          <span>{displayCopy(payoutToast, t)}</span>
        </div>
      ) : null}

      {socialAddOpen ? <div className="profile-save-overlay" role="presentation" onKeyDown={(event) => {
        if (event.key === "Escape" && !socialAddSaving) { event.stopPropagation(); closeSocialAdd(); }
        if (event.key !== "Tab") return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)"));
        if (!focusable.length) return;
        if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault();
          focusable.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
          event.preventDefault();
          focusable[0].focus();
        }
      }}>
        <section className="profile-save-dialog profile-social-add-dialog" role="dialog" aria-modal="true" aria-labelledby="social-add-title" aria-describedby="social-add-description">
          <h2 id="social-add-title">{t("profile.addSocialAccount")}</h2>
          <p id="social-add-description">{t("profile.socialDemoNotice")}</p>
          <form onSubmit={submitSocialAddition} noValidate>
            <fieldset className="social-links-fieldset">
              <legend>{t("profile.socialProfileUrl")}</legend>
              <div className="social-link-list"><div className="social-link-row">
                <input autoFocus type="url" required aria-label={t("profile.socialProfileUrl")} value={newSocialUrl} onChange={(event) => { setNewSocialUrl(event.target.value); setSocialAddError(""); setSocialAddErrorField(null); }} placeholder="https://" disabled={socialAddSaving} aria-invalid={socialAddErrorField === "url"} aria-describedby={socialAddErrorField === "url" ? "social-add-error" : undefined} />
              </div></div>
            </fieldset>
            <div className="social-upload-stack">
              <label className={`upload-field profile-social-dropzone ${newSocialFiles.length ? "has-file" : ""}`}>
                <input type="file" accept="image/png,image/jpeg" multiple aria-label={t("auth.uploadScreenshots")} onChange={(event) => { chooseSocialAddFiles(event.target.files); event.target.value = ""; }} disabled={socialAddSaving} aria-invalid={socialAddErrorField === "files"} aria-describedby={socialAddErrorField === "files" ? "social-add-file-guidance social-add-error" : "social-add-file-guidance"} />
                {newSocialFiles.length ? <FileCheck2 size={24} aria-hidden="true" /> : <Upload size={24} aria-hidden="true" />}
                <strong>{newSocialFiles.length ? t("auth.screenshotsUploaded", { count: newSocialFiles.length }) : t("auth.uploadScreenshots")}</strong>
                <span id="social-add-file-guidance">{t("auth.screenshotLimit")}</span>
              </label>
              {newSocialFiles.length ? <div className="uploaded-file-list">
                {newSocialFiles.map((file, index) => <div key={`${file.name}-${index}`}>
                  <FileCheck2 size={16} aria-hidden="true" />
                  <span><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB</small></span>
                  <button type="button" disabled={socialAddSaving} aria-label={t("auth.removeFile", { name: file.name })} title={t("auth.removeScreenshot")} onClick={() => { setNewSocialFiles((current) => current.filter((_, itemIndex) => itemIndex !== index)); setSocialAddError(""); setSocialAddErrorField(null); }}><X size={15} aria-hidden="true" /></button>
                </div>)}
              </div> : null}
            </div>
            {socialAddError ? <p id="social-add-error" className="profile-social-add-error" role="alert">{socialAddError}</p> : null}
            <div className="profile-social-add-actions"><button type="button" className="secondary-button" onClick={closeSocialAdd} disabled={socialAddSaving}>{t("common.cancel")}</button><button type="submit" className="primary-button" disabled={socialAddSaving}>{socialAddSaving ? t("profile.socialVerifying") : t("profile.verifyAndAdd")}</button></div>
          </form>
        </section>
      </div> : null}

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
              {t(saveState === "validating"
                ? "profile.validating"
                : saveState === "success"
                  ? hasRepairContext
                    ? "profile.paymentInformationUpdated"
                    : "profile.saveSucceeded"
                  : "profile.saveFailed")}
            </h2>
            <p id="profile-save-description">
              {saveState === "error" && saveError ? displayCopy(saveError, t) : t(saveState === "validating"
                ? "profile.validatingDescription"
                : saveState === "success"
                  ? hasRepairContext
                    ? "profile.repairSavedDescription"
                    : "profile.savedDescription"
                  : "profile.saveFailureDescription")}
            </p>
            {saveState !== "validating" ? (
              <button
                type="button"
                className={saveState === "success" ? "primary-button" : "secondary-button"}
                onClick={() => {
                  if (saveState === "success" && (repairInvoiceId || returnInvoice)) {
                    navigate(`/invoices/${encodeURIComponent(repairInvoiceId || invoiceNumberOf(returnInvoice!))}`, { state: { retryAccountId: returningRetryAccountId } });
                    return;
                  }
                  setSaveState("idle");
                  setSaveError("");
                }}
              >
                {t(saveState === "success"
                  ? repairInvoiceId || returnInvoice
                    ? "profile.returnToInvoice"
                    : "invoice.gotIt"
                  : "profile.backToEdit")}
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
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route element={<CreatorRoute />}>
          <Route path="/onboarding/social-verification" element={<SocialVerificationPage />} />
          <Route path="/onboarding/profile" element={<OnboardingProfilePage />} />
        </Route>
        <Route element={<SharedWorkspaceRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<CreatorHomeRoute />} />
            <Route path="/home" element={<CreatorHomeRoute />} />
            <Route path="/requests" element={<Navigate to="/" replace />} />
            <Route path="/requests/:id" element={<RequestDetailPage />} />
            <Route path="/contracts" element={<ContractListPage />} />
            <Route path="/contracts/:id" element={<SharedContractDetail />} />
            <Route path="/invoices" element={<InvoiceListPage />} />
            <Route path="/invoices/:id" element={<SharedInvoiceDetail />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/profile" element={<SharedProfilePage />} />
            <Route path="/notifications" element={<CreatorNotificationsPage />} />
            <Route path="/help" element={<CreatorHelpPage />} />
          </Route>
        </Route>
        <Route element={<AdminRoute />}>
          <Route path="/admin/select-user" element={<SelectUserRoute />} />
          <Route element={<AdminLayoutBridge />}>
            <Route path="/admin" element={<AdminRequestProjectsPage />} />
            <Route path="/admin/requests/:creatorId/:id" element={<RequestDetailPage adminView />} />
            <Route path="/admin/contracts" element={<AdminContractsPage />} />
            <Route path="/admin/contracts/:creatorId/:id" element={<ContractDetailPage adminView />} />
            <Route path="/admin/invoices" element={<AdminInvoicesPage />} />
            <Route path="/admin/invoices/:creatorId/:id" element={<InvoiceDetailPage adminView />} />
          </Route>
          <Route element={<AppLayout adminOperations />}>
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
  return <Navigate to={session.role === "ADMIN" ? "/admin/select-user" : "/"} replace />;
}
