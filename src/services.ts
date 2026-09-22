import {
  contracts as seedContracts,
  initialProfile,
  invoices as seedInvoices,
  requests as seedRequests,
} from "./data";
import {
  adminStore,
  PRIMARY_CREATOR_ID,
  type AdminProfilePatch,
  type AdminUserFilters,
  type CreateManagedUserInput,
} from "./admin-store";
import {
  isPayoutAccountUsable,
  normalizePayoutProfile,
  syncPayoutAccounts,
} from "./payout-accounts";
import {
  buildCreatorNotifications,
  buildCreatorTasks,
  invoiceInternalIdOf,
  invoiceNumberOf,
  legacyStatusForInvoice,
  migrateInvoice,
  migrateInvoices,
} from "./creator-workflow";
import {
  createInvoicePayoutSnapshot,
  ensureInvoicePayoutSnapshot,
  getSocialAccountName,
  payoutAccountChangedSinceSnapshot,
} from "./creator-display";
import { aggregateRequestProjects, assertAttemptAllowed, failedPaymentSnapshot, legacyPaymentAttempt, linkInvoicesToContracts } from "./payment-relations";
import { managementCreatorDetail, maskedCreatorDetail, maskSnapshot } from "./mock/users";
import { attemptsByCreator } from "./mock/payments";
import {
  assertCreatorOwnsInvoice,
  assertExpectedVersion,
  canCorrectExternalInvoice,
  currentExternalCorrection,
  payoutAccountFingerprint,
  recognitionFieldsFromExtracted,
  validateExternalInvoiceConfirmation,
} from "./invoices/external/workflow";
import { MockAiRecognitionAdapter, demoInvoiceValues, type ExternalInvoiceRecognitionAdapter } from "./invoices/external/recognition";
import { dataUrlToBlob, fileStorageMessage, readInvoiceFile, removeInvoiceFile, saveInvoiceFile } from "./invoices/external/file-store";
import { type AddSocialAccountInput, SocialAccountError, validateSocialAccountAddition } from "./social-accounts";
import { removeSocialScreenshot, saveSocialScreenshot } from "./social-file-store";
import { normalizeSocialEvidence } from "./creator-display";
import type {
  ConfirmExternalInvoiceCommand,
  ConfirmExternalInvoicePageCommand,
  CorrectExternalInvoiceRecognitionCommand,
  ExternalInvoiceCommandBase,
  ExternalInvoiceReviewEvent,
  ResubmitExternalInvoiceCommand,
  RetryExternalInvoiceRecognitionCommand,
  SelectExternalInvoicePayoutAccountCommand,
  UploadExternalInvoiceFileCommand,
} from "./invoices/external/types";
import type {
  AccountStatus,
  AdminBusinessData,
  AdminSettings,
  AdminUserDetail,
  AirwallexBeneficiaryResult,
  AirwallexFormSchema,
  AirwallexSchemaCondition,
  AirwallexSchemaField,
  AirwallexTransferMethodCondition,
  AirwallexTransferMethodOption,
  ApiResult,
  AuditEvent,
  Contract,
  ContractType,
  CreatorNotification,
  CreatorTask,
  CorrectionRequest,
  ExternalInvoiceUploadInput,
  ExternalInvoiceCollectionStatus,
  ExternalBusinessEvent,
  ExternalSyncIssue,
  Invoice,
  PaymentAttempt,
  InvoiceSignature,
  InvoiceStatus,
  InvoiceExtractedData,
  InvoiceFeedbackInput,
  InvoiceUploadInput,
  PaymentAccountCorrectionInput,
  PaymentRetryRequestInput,
  PayoutAccount,
  RequestProject,
  SensitiveFieldKey,
  Session,
  UserAccount,
  UserProfile,
  VerificationStatus,
} from "./types";

const INVOICE_STORAGE_KEY = "comets-creator-invoices-v2";
const PROFILE_STORAGE_KEY = "comets-creator-profile-v2";
const CONTRACT_STORAGE_KEY = "comets-creator-contracts-v1";
const PAYMENT_ATTEMPT_STORAGE_KEY = "comets-creator-payment-attempts-v1";
const CREATOR_NOTIFICATION_STORAGE_KEY = "comets-creator-notifications-v2";

const CONTRACT_TYPES: ContractType[] = ["INDEPENDENT", "FRAMEWORK", "IO"];

const normalizeContractType = (value: unknown): ContractType =>
  typeof value === "string" && CONTRACT_TYPES.includes(value as ContractType)
    ? (value as ContractType)
    : "INDEPENDENT";

const wait = (duration = 240) =>
  new Promise<void>((resolve) => globalThis.setTimeout(resolve, duration));

export const ENGLISH_ACCOUNT_NAME_PATTERN =
  "^[A-Za-z]+(?: [A-Za-z]+)*$";

export const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmailAddress = (value: string) =>
  EMAIL_ADDRESS_PATTERN.test(value.trim());

export interface CurrencyAmountSummary {
  currency: string;
  amount: number;
  count: number;
  formattedAmount: string;
}

export const summarizeAmountsByCurrency = (
  items: Array<{ amount: string }>,
): CurrencyAmountSummary[] => {
  const groups = new Map<string, { amount: number; count: number }>();

  for (const item of items) {
    const [currency = "", rawAmount = ""] = item.amount.trim().split(/\s+/, 2);
    const amount = Number(rawAmount.replace(/,/g, ""));
    if (!currency || !Number.isFinite(amount)) continue;
    const current = groups.get(currency) || { amount: 0, count: 0 };
    groups.set(currency, {
      amount: current.amount + amount,
      count: current.count + 1,
    });
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, summary]) => ({
      currency,
      amount: summary.amount,
      count: summary.count,
      formattedAmount: new Intl.NumberFormat("en-US").format(summary.amount),
    }));
};

export const sanitizeEnglishAccountName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z ]/g, "")
    .replace(/ {2,}/g, " ")
    .replace(/^ +/, "");

export { getSocialAccountName };

export const isEnglishAccountName = (value: string) =>
  new RegExp(ENGLISH_ACCOUNT_NAME_PATTERN).test(value.trim());

const IBAN_LENGTH_BY_COUNTRY: Record<string, number> = {
  FR: 27,
  GB: 22,
};

const accountNumberRuleFor = (condition: AirwallexSchemaCondition) => {
  if (
    condition.transferMethod === "LOCAL" &&
    condition.bankCountryCode === "US" &&
    condition.accountCurrency === "USD"
  ) {
    return {
      pattern: "^\\d{4,17}$",
      validationMessage: "银行账号应为 4 至 17 位数字",
      placeholder: "4 至 17 位数字，不含空格或符号",
      description:
        "格式要求：4 至 17 位数字，不含空格、连字符或其他符号",
      validationRules: [
        {
          name: "DigitsOnly" as const,
          message: "银行账号仅支持数字",
        },
        {
          name: "MinMaxLength" as const,
          parameters: { min: 4, max: 17 },
          message: "银行账号应为 4 至 17 位数字",
        },
      ],
    };
  }

  if (
    condition.transferMethod === "LOCAL" &&
    condition.bankCountryCode === "GB" &&
    condition.accountCurrency === "GBP"
  ) {
    return {
      pattern: "^\\d{8}$",
      validationMessage: "英国本地银行账号应为 8 位数字",
      placeholder: "8 位数字，不含空格或符号",
      description:
        "格式要求：8 位数字，不含空格、连字符或其他符号",
      validationRules: [
        {
          name: "DigitsOnly" as const,
          message: "银行账号仅支持数字",
        },
        {
          name: "Length" as const,
          parameters: { length: 8 },
          message: "英国本地银行账号应为 8 位数字",
        },
      ],
    };
  }

  if (
    condition.transferMethod === "LOCAL" &&
    condition.bankCountryCode === "JP" &&
    condition.accountCurrency === "JPY"
  ) {
    return {
      pattern: "^\\d{7}$",
      validationMessage: "日本本地银行账号应为 7 位数字",
      placeholder: "7 位数字，不含空格或符号",
      description:
        "格式要求：7 位数字，不含空格、连字符或其他符号",
      validationRules: [
        {
          name: "DigitsOnly" as const,
          message: "银行账号仅支持数字",
        },
        {
          name: "Length" as const,
          parameters: { length: 7 },
          message: "日本本地银行账号应为 7 位数字",
        },
      ],
    };
  }

  return {
    pattern: "^[A-Za-z0-9]{6,34}$",
    validationMessage: "银行账号应为 6 至 34 位字母或数字，不包含空格和符号",
    placeholder: "6 至 34 位字母或数字，不含空格或符号",
    description:
      "格式要求：6 至 34 位英文字母或数字，不含空格、连字符或其他符号",
    validationRules: [
      {
        name: "Alphanumeric" as const,
        message: "银行账号仅支持字母和数字",
      },
      {
        name: "MinMaxLength" as const,
        parameters: { min: 6, max: 34 },
        message: "银行账号应为 6 至 34 位字符",
      },
    ],
  };
};

const ibanRuleFor = (countryCode: string) => {
  const expectedLength = IBAN_LENGTH_BY_COUNTRY[countryCode];
  const bodyLength = expectedLength ? expectedLength - 4 : null;
  const structure = bodyLength
    ? `${countryCode} + 2 位校验码 + ${bodyLength} 位大写字母或数字，共 ${expectedLength} 位`
    : `${countryCode} + 2 位校验码 + 11 至 30 位大写字母或数字`;
  const compactStructure = expectedLength
    ? `${countryCode}开头｜共${expectedLength}位｜仅大写字母/数字｜无空格/连字符`
    : `${countryCode}开头｜共15至34位｜仅大写字母/数字｜无空格/连字符`;
  const description = `格式要求：${structure}；不含空格或连字符`;

  return {
    placeholder: compactStructure,
    description,
    pattern: bodyLength
      ? `^${countryCode}\\d{2}[A-Z0-9]{${bodyLength}}$`
      : `^${countryCode}\\d{2}[A-Z0-9]{11,30}$`,
    validationMessage: `IBAN 格式要求：${structure}，不含空格或连字符`,
  };
};

const isValidIbanChecksum = (value: string) => {
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(normalized)) return false;

  const rearranged = `${normalized.slice(4)}${normalized.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const numeric =
      character >= "A"
        ? String(character.charCodeAt(0) - 55)
        : character;
    for (const digit of numeric) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
};

export const normalizeAirwallexSchemaValue = (key: string, value: string) => {
  if (key === "account_name") return sanitizeEnglishAccountName(value);
  if (key === "iban") return value.replace(/[\s-]+/g, "").toUpperCase();
  return value;
};

export const validateAirwallexSchemaValues = (
  schema: AirwallexFormSchema,
  values: Record<string, string>,
) => {
  const errors: Record<string, string> = {};
  const normalizedSchema = normalizeAirwallexFormSchema(schema);

  for (const field of normalizedSchema.fields) {
    const value = values[field.key]?.trim() || "";
    const fieldName = field.label.split(" / ")[0];
    if (field.required && !value) {
      errors[field.key] = `${fieldName}为必填项`;
      continue;
    }
    if (!value) continue;

    if (field.pattern && !new RegExp(field.pattern).test(value)) {
      errors[field.key] =
        field.validationMessage || `${fieldName}格式不正确`;
      continue;
    }

    for (const rule of field.validationRules || []) {
      const parameters = rule.parameters || {};
      const failed =
        (rule.name === "Alphanumeric" &&
          !/^[A-Za-z0-9]+$/.test(value)) ||
        (rule.name === "AlphanumericIncludingPunctuation" &&
          !/^[A-Za-z0-9À-ÖØ-öø-ÿ .,&'()/-]+$/.test(value)) ||
        (rule.name === "DigitsOnly" && !/^\d+$/.test(value)) ||
        (rule.name === "Length" &&
          value.length !== parameters.length) ||
        (rule.name === "MinMaxLength" &&
          (value.length < (parameters.min || 0) ||
            value.length > (parameters.max || Number.POSITIVE_INFINITY))) ||
        (rule.name === "OneOf" &&
          !parameters.values?.includes(value)) ||
        (rule.name === "WhitespaceTrimmed" && value !== value.trim()) ||
        (rule.name === "IbanCountryOneOf" &&
          !parameters.values?.includes(value.slice(0, 2).toUpperCase())) ||
        (rule.name === "IbanIsValid" && !isValidIbanChecksum(value));

      if (failed) {
        errors[field.key] = rule.message;
        break;
      }
    }
  }

  return errors;
};

export class AirwallexBeneficiaryValidationError extends Error {
  fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors)[0] || "Airwallex 付款信息校验失败");
    this.name = "AirwallexBeneficiaryValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export const AIRWALLEX_PROFILE_FIELD_ALIASES = {
  real_name_or_company_name: "legalName",
  telephone: "phone",
  beneficiary_mobile_phone_number: "phone",
  email_address: "email",
  current_address: "address",
  beneficiary_bank_name: "payout.bankName",
  account_name: "payout.accountHolder",
  bank_account_number: "payout.accountNumber",
  beneficiary_type: "payout.beneficiaryType",
  beneficiary_bank_country_region: "payout.bankCountry",
  swift_code: "payout.schemaValues.swift_code",
  iban: "payout.schemaValues.iban",
  branch_code: "payout.schemaValues.branch_code",
  bank_account_type: "payout.schemaValues.account_type",
} as const;

const AIRWALLEX_COUNTRY_CODES: Record<string, string> = {
  France: "FR",
  法国: "FR",
  Japan: "JP",
  日本: "JP",
  "United States": "US",
  美国: "US",
  "United Kingdom": "GB",
  英国: "GB",
  Australia: "AU",
  澳大利亚: "AU",
  Singapore: "SG",
  新加坡: "SG",
  "Hong Kong": "HK",
  "Hong Kong SAR": "HK",
  中国香港: "HK",
};

export const inferAirwallexCountryCode = (country: string) => {
  const normalized = country.trim();
  if (/^[A-Za-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  const matched = Object.entries(AIRWALLEX_COUNTRY_CODES).find(([label]) =>
    normalized.toLowerCase().includes(label.toLowerCase()),
  );
  return matched?.[1] || "FR";
};

export interface ProfileSupplementalField {
  key: string;
  label: string;
  type: "INPUT" | "SELECT";
  options?: Array<{ label: string; value: string }>;
  fullWidth?: boolean;
  example?: string;
  guidance?: string;
}

export interface AuthService {
  login(email: string, password: string): Promise<ApiResult<Session>>;
  register(name: string, email: string, password: string, invitationCode: string): Promise<ApiResult<Session>>;
  requestPasswordReset(email: string): Promise<ApiResult<{
    accepted: true;
    retryAfterSeconds: number;
    maskedEmail: string;
    demoToken?: string;
  }>>;
  verifyPasswordReset(token: string): Promise<ApiResult<{
    valid: boolean;
    maskedEmail?: string;
    reason?: "EXPIRED" | "USED" | "INVALID";
  }>>;
  completePasswordReset(token: string, newPassword: string): Promise<ApiResult<{ completed: true }>>;
  restore(sessionId: string): Promise<ApiResult<Session | undefined>>;
  logout(sessionId: string): Promise<ApiResult<{ revoked: true }>>;
  completeOnboarding(
    userId: string,
    profile: UserProfile,
    sessionId: string,
  ): Promise<ApiResult<Session>>;
}

export interface ProfileService {
  get(userId?: string): Promise<ApiResult<UserProfile>>;
  save(profile: UserProfile): Promise<ApiResult<UserProfile>>;
  addSocialAccount(input: AddSocialAccountInput): Promise<ApiResult<UserProfile>>;
}

export interface RequestProjectService {
  list(creatorId?: string): Promise<ApiResult<RequestProject[]>>;
  get(id: string, creatorId?: string): Promise<ApiResult<RequestProject | undefined>>;
}

export interface ContractService {
  list(creatorId?: string): Promise<ApiResult<Contract[]>>;
  get(id: string, creatorId?: string): Promise<ApiResult<Contract | undefined>>;
  signContract(
    id: string,
    actor: Pick<Session, "userId" | "role">,
    signature: InvoiceSignature,
  ): Promise<ApiResult<Contract>>;
}

export interface InvoiceService {
  list(creatorId?: string): Promise<ApiResult<Invoice[]>>;
  get(id: string, creatorId?: string): Promise<ApiResult<Invoice | undefined>>;
  getDocumentFile(id: string, creatorId: string): Promise<Blob | undefined>;
  signInternalInvoice(
    invoiceId: string,
    signature: InvoiceSignature,
  ): Promise<ApiResult<Invoice>>;
  submitFeedback(
    invoiceId: string,
    input: InvoiceFeedbackInput,
  ): Promise<ApiResult<Invoice>>;
  uploadExternal(input: ExternalInvoiceUploadInput): Promise<ApiResult<Invoice>>;
  confirmExternal(invoiceId: string): Promise<ApiResult<Invoice>>;
  correctExternal(
    invoiceId: string,
    extractedData: InvoiceExtractedData,
  ): Promise<ApiResult<Invoice>>;
  resubmitExternal(input: ExternalInvoiceUploadInput): Promise<ApiResult<Invoice>>;
  selectPayoutAccount(id: string, payoutAccountId: string): Promise<ApiResult<Invoice>>;
  listExternalInvoices(creatorId: string): Promise<ApiResult<Invoice[]>>;
  getExternalInvoice(invoiceId: string, creatorId: string): Promise<ApiResult<Invoice | undefined>>;
  uploadExternalInvoiceFile(input: UploadExternalInvoiceFileCommand): Promise<ApiResult<Invoice>>;
  retryExternalInvoiceRecognition(input: RetryExternalInvoiceRecognitionCommand): Promise<ApiResult<Invoice>>;
  correctExternalInvoiceRecognition(input: CorrectExternalInvoiceRecognitionCommand): Promise<ApiResult<Invoice>>;
  selectExternalInvoicePayoutAccount(input: SelectExternalInvoicePayoutAccountCommand): Promise<ApiResult<Invoice>>;
  confirmExternalInvoice(input: ConfirmExternalInvoiceCommand): Promise<ApiResult<Invoice>>;
  confirmExternalInvoicePage(input: ConfirmExternalInvoicePageCommand): Promise<ApiResult<Invoice>>;
  resubmitExternalInvoice(input: ResubmitExternalInvoiceCommand): Promise<ApiResult<Invoice>>;
  listExternalInvoiceHistory(invoiceId: string, creatorId: string): Promise<ApiResult<ExternalInvoiceReviewEvent[]>>;
}

export interface TaskService {
  list(creatorId?: string): Promise<ApiResult<CreatorTask[]>>;
}

export interface PaymentService {
  listAttempts(invoiceId: string, creatorId: string): Promise<ApiResult<PaymentAttempt[]>>;
  listCreatorAttempts(creatorId: string): Promise<ApiResult<PaymentAttempt[]>>;
  /** Mock system-side confirmation: a creator cannot directly execute a transfer. */
  approveCorrectionAndRetry(invoiceId: string, actor: "SYSTEM"): Promise<ApiResult<PaymentAttempt>>;
  recordAttemptResult(attemptId: string, status: "FAILED" | "PAID", actor: "SYSTEM", reason?: string): Promise<ApiResult<PaymentAttempt>>;
  submitAccountCorrection(
    invoiceId: string,
    input: PaymentAccountCorrectionInput,
  ): Promise<ApiResult<Invoice>>;
  requestPaymentRetry(invoiceId: string, input: PaymentRetryRequestInput): Promise<ApiResult<Invoice>>;
}

export interface PayoutService {
  listTransferMethods(
    condition: AirwallexTransferMethodCondition,
  ): Promise<ApiResult<AirwallexTransferMethodOption[]>>;
  getFormSchema(
    condition: AirwallexSchemaCondition,
  ): Promise<ApiResult<AirwallexFormSchema>>;
  validateBeneficiary(
    schema: AirwallexFormSchema,
    values: Record<string, string>,
  ): Promise<ApiResult<{ valid: true }>>;
  createBeneficiary(
    condition: AirwallexSchemaCondition,
    values: Record<string, string>,
  ): Promise<ApiResult<AirwallexBeneficiaryResult>>;
}

export interface AdminUserService {
  list(filters?: AdminUserFilters): Promise<ApiResult<UserAccount[]>>;
  get(id: string): Promise<ApiResult<AdminUserDetail>>;
  create(
    input: CreateManagedUserInput,
    actorId: string,
  ): Promise<ApiResult<UserAccount>>;
  setStatus(
    ids: string[],
    status: AccountStatus,
    actorId: string,
    reason?: string,
  ): Promise<ApiResult<UserAccount[]>>;
  updateProfile(
    id: string,
    patch: AdminProfilePatch,
    actorId: string,
  ): Promise<ApiResult<AdminUserDetail>>;
  updateVerification(
    id: string,
    status: VerificationStatus,
    actorId: string,
    reason?: string,
  ): Promise<ApiResult<AdminUserDetail>>;
  resetPassword(id: string, actorId: string): Promise<ApiResult<{ sent: true }>>;
  revealSensitive(
    id: string,
    fieldKey: SensitiveFieldKey,
    reason: string,
    actorId: string,
  ): Promise<ApiResult<string>>;
  exportMasked(
    filters: AdminUserFilters,
    actorId: string,
  ): Promise<ApiResult<string>>;
}

export interface AdminBusinessDataService {
  list(): Promise<ApiResult<AdminBusinessData>>;
}

export interface CorrectionService {
  list(userId: string): Promise<ApiResult<CorrectionRequest[]>>;
  create(
    userId: string,
    fieldKey: string,
    fieldLabel: string,
    reason: string,
    actorId: string,
  ): Promise<ApiResult<AdminUserDetail>>;
}

export interface AuditService {
  list(): Promise<ApiResult<AuditEvent[]>>;
}

export interface AdminSettingsService {
  get(): Promise<ApiResult<AdminSettings>>;
  save(
    settings: AdminSettings,
    actorId: string,
  ): Promise<ApiResult<AdminSettings>>;
}

export interface AdminNotificationService {
  list(userId: string): Promise<ApiResult<AdminUserDetail["notifications"]>>;
}

export interface NotificationService {
  list(userId?: string): Promise<ApiResult<CreatorNotification[]>>;
  markRead(id: string, userId?: string): Promise<ApiResult<CreatorNotification>>;
  markAllRead(userId?: string): Promise<ApiResult<CreatorNotification[]>>;
  getUnreadCount(userId?: string): Promise<ApiResult<number>>;
}

export interface ExternalBusinessDataAdapter {
  listIssues(): Promise<ApiResult<ExternalSyncIssue[]>>;
  upsert(
    event: ExternalBusinessEvent,
  ): Promise<
    ApiResult<{
      accepted: boolean;
      duplicate: boolean;
      reason?: string;
    }>
  >;
}

export interface Services {
  creatorScope: {
    read(sessionId: string, creatorId: string): Promise<ApiResult<{
      detail: AdminUserDetail;
      attempts: PaymentAttempt[];
      tasks: CreatorTask[];
    }>>;
    assertWrite(sessionId: string, creatorId: string): void;
    assertInvoiceWrite(sessionId: string, creatorId: string, invoiceId: string): void;
  };
  auth: AuthService;
  profile: ProfileService;
  requests: RequestProjectService;
  contracts: ContractService;
  invoices: InvoiceService;
  tasks: TaskService;
  payments: PaymentService;
  payout: PayoutService;
  adminUsers: AdminUserService;
  adminBusiness: AdminBusinessDataService;
  corrections: CorrectionService;
  audit: AuditService;
  adminSettings: AdminSettingsService;
  notifications: NotificationService;
  adminNotifications: AdminNotificationService;
  externalBusinessData: ExternalBusinessDataAdapter;
}

export const invoicePriority: Record<InvoiceStatus, number> = {
  PENDING_CONFIRMATION: 0,
  DRAFT_SIGNATURE: 0,
  CHANGES_REQUIRED: 1,
  PAYMENT_FAILED: 2,
  PENDING_REVIEW: 3,
  APPROVED: 4,
  PAID: 5,
};

export const createInvoiceId = (issuedAt: string, items: Invoice[]) => {
  const compactDate = issuedAt.replace(/-/g, "");
  const prefix = `INV-${compactDate}-`;
  const sequence = items.reduce((highest, invoice) => {
    if (!invoice.id.startsWith(prefix)) return highest;
    const parsed = Number(invoice.id.slice(prefix.length));
    return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
  }, 0) + 1;
  return `${prefix}${String(sequence).padStart(5, "0")}`;
};

export const payoutAccountPaymentDetails = (account: PayoutAccount) => ({
  account_name: account.accountHolder,
  account_number: account.accountNumber,
  bank_name: account.bankName,
  bank_address: account.schemaValues.bank_street_address || "",
  bank_country: account.bankCountry,
  swift_code: account.swiftCode,
  iban: account.schemaValues.iban || "",
  transfer_method: account.transferMethod,
  beneficiary_type: account.beneficiaryType,
  paypal_email: account.accountEmail || "",
  provider: account.provider,
  payment_method: account.provider === "PayPal" ? "PayPal" : "Bank Transfer",
});

const normalizePaymentDetail = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const compareInvoicePaymentDetails = (
  recognized: Record<string, string>,
  account: PayoutAccount,
) => {
  const accountDetails = payoutAccountPaymentDetails(account);
  // Empty/unrecognized fields inherit the selected account without rewriting AI output.
  const supplied = Object.fromEntries(Object.entries(recognized).filter(([key, value]) => key in accountDetails && value.trim()));
  const compared = Object.entries(recognized)
    .filter(([key, value]) => key in accountDetails && value.trim())
    .map(([key, value]) => ({
      key,
      recognizedValue: value,
      accountValue: accountDetails[key as keyof typeof accountDetails] || "",
      matches:
        normalizePaymentDetail(value) ===
        normalizePaymentDetail(accountDetails[key as keyof typeof accountDetails] || ""),
    }));
  return {
    matches: compared.every((field) => field.matches),
    fields: compared,
    merged: { ...accountDetails, ...supplied },
  };
};

export const sortInvoices = (items: Invoice[]) =>
  [...items].sort(
    (left, right) => invoicePriority[left.status] - invoicePriority[right.status],
  );

type LegacyInvoice = Omit<Invoice, "status"> & {
  status: InvoiceStatus | "REJECTED";
};

export const migrateLegacyInvoiceState = (invoice: LegacyInvoice): Invoice => {
  const legacyStatus = invoice.status;
  if (
    ["INV-260728-R", "INV-20260728-00001"].includes(invoice.id) &&
    (legacyStatus === "REJECTED" ||
      (legacyStatus === "PAYMENT_FAILED" && invoice.paymentIssue?.version !== 1))
  ) {
    const seededPaymentFailure = seedInvoices.find(
      (item) => item.id === "INV-20260728-00001",
    );
    return migrateInvoice(
      seededPaymentFailure
        ? structuredClone(seededPaymentFailure)
        : { ...invoice, status: "PAYMENT_FAILED" },
    );
  }
  if (legacyStatus !== "REJECTED") {
    return migrateInvoice(invoice as Invoice);
  }
  if (invoice.id === "INV-240711-C") {
    const { rejectedReason: _rejectedReason, ...current } = invoice;
    return migrateInvoice({
      ...current,
      status: "PENDING_REVIEW",
      updatedAt: "07-28 15:40",
    });
  }
  return migrateInvoice({ ...invoice, status: "PAYMENT_FAILED" });
};

export const filterRequests = (
  items: RequestProject[],
  query: string,
  status: RequestProject["status"] | "ALL",
) => {
  const normalized = query.trim().toLowerCase();
  return items.filter((item) => {
    const statusMatches = status === "ALL" || item.status === status;
    const queryMatches =
      !normalized ||
      `${item.id}${item.projectName}${item.brand}`.toLowerCase().includes(normalized);
    return statusMatches && queryMatches;
  });
};

const LOCAL_CURRENCY_BY_COUNTRY: Record<string, string> = {
  FR: "EUR",
  JP: "JPY",
  US: "USD",
  GB: "GBP",
  AU: "AUD",
  SG: "SGD",
  HK: "HKD",
};

// Mock-only examples: never derive them from the creator's saved account values.
const exampleIbanFor = (countryCode: string) => {
  if (countryCode === "FR") return "FR7630006000011234567890189";
  if (countryCode === "GB") return "GB82WEST12345698765432";
  return "不适用：该国家/地区无需 IBAN";
};

const payoutExampleFor = (key: string, condition: AirwallexSchemaCondition): string | undefined => {
  const country = condition.bankCountryCode;
  if (key === "account_number") {
    if (condition.transferMethod === "LOCAL" && condition.accountCurrency === LOCAL_CURRENCY_BY_COUNTRY[country]) {
      return { GB: "12345678", JP: "1234567", US: "1234567890" }[country] || "123456789012";
    }
    return "123456789012";
  }
  if (key === "iban") return exampleIbanFor(country);
  if (key === "swift_code") return `EXAM${country}${country === "US" ? "33" : "PP"}`;
  if (key === "bank_street_address") return ({
    FR: "10 Rue Exemple, Paris 75001, France",
    JP: "1-2-3 Chiyoda, Tokyo 100-0001, Japan",
    US: "123 Example Street, New York, NY 10001",
    GB: "10 Example Street, London SW1A 1AA",
    AU: "10 Example Street, Sydney NSW 2000",
    SG: "10 Example Road, Singapore 018956",
    HK: "10 Example Road, Central, Hong Kong",
  })[country] || "10 Example Street, Paris 75001, France";
  return {
    account_name: "Alex Morgan", bank_name: "Example Bank",
    routing_number: "021000021", bank_code: "0001", branch_code: "001",
    primary_routing_code: "123456",
    beneficiary_id_number: "AB1234567", business_registration_number: "AB12345678",
  }[key] || (key === "bank_city" ? ({ JP: "Tokyo", US: "New York", GB: "London", AU: "Sydney", SG: "Singapore", HK: "Hong Kong" })[country] || "Paris"
    : key === "bank_state_province" ? ({ JP: "Tokyo", US: "NY", GB: "Greater London", AU: "NSW", SG: "Central", HK: "Central" })[country] || "Île-de-France"
      : key === "bank_postal_code" ? ({ JP: "100-0001", US: "10001", GB: "SW1A 1AA", AU: "2000", SG: "018956", HK: "000000" })[country] || "75001" : undefined);
};

/** Prototype examples follow the currently loaded form schema, without touching entered values. */
export const fillAirwallexDemoValues = (
  schema: AirwallexFormSchema,
  condition: AirwallexSchemaCondition,
  current: Record<string, string>,
): Record<string, string> => {
  const next = { ...current };
  for (const field of schema.fields) {
    if (next[field.key]?.trim()) continue;
    const example = field.type === "SELECT"
      ? field.options?.[0]?.value
      : payoutExampleFor(field.key, condition);
    if (example) next[field.key] = example;
  }
  return next;
};

export const sortAirwallexTransferMethods = (
  methods: AirwallexTransferMethodOption[],
) => {
  const available = methods
    .filter((method) => method.available)
    .sort((left, right) => {
      const feeDifference =
        left.estimatedFeeAmount - right.estimatedFeeAmount;
      if (feeDifference !== 0) return feeDifference;
      if (left.value === right.value) return 0;
      return left.value === "LOCAL" ? -1 : 1;
    });
  const unavailable = methods
    .filter((method) => !method.available)
    .sort((left, right) => left.label.localeCompare(right.label));

  return [...available, ...unavailable].map((method, index) => ({
    ...method,
    recommended: index === 0 && method.available,
  }));
};

export const resolveAirwallexTransferMethod = (
  methods: AirwallexTransferMethodOption[],
  currentValue: AirwallexTransferMethodOption["value"],
  preserveCurrent: boolean,
): AirwallexTransferMethodOption | undefined => {
  const current = methods.find((method) => method.value === currentValue && method.available);
  const recommended = methods.find((method) => method.recommended && method.available);
  return preserveCurrent && current ? current : recommended || current;
};

export const buildAirwallexMockTransferMethods = (
  condition: AirwallexTransferMethodCondition,
): AirwallexTransferMethodOption[] => {
  const localCurrency = LOCAL_CURRENCY_BY_COUNTRY[condition.bankCountryCode];
  const usesLocalCurrency = localCurrency === condition.accountCurrency;
  const entitySurcharge = condition.entityType === "COMPANY" ? 0.5 : 0;

  return sortAirwallexTransferMethods([
    {
      value: "LOCAL",
      label: "本地转账 / Local transfer",
      available: Boolean(localCurrency),
      estimatedFeeAmount: (usesLocalCurrency ? 1 : 10) + entitySurcharge,
      feeCurrency: condition.accountCurrency,
      arrivalMinBusinessDays: 0,
      arrivalMaxBusinessDays: 2,
      recommended: false,
    },
    {
      value: "SWIFT",
      label: "国际电汇 / SWIFT",
      available: true,
      estimatedFeeAmount: (usesLocalCurrency ? 7.5 : 6) + entitySurcharge,
      feeCurrency: condition.accountCurrency,
      arrivalMinBusinessDays: 1,
      arrivalMaxBusinessDays: 3,
      recommended: false,
    },
  ]);
};

export const buildAirwallexMockSchema = (
  condition: AirwallexSchemaCondition,
): AirwallexFormSchema => {
  const accountNumberRule = accountNumberRuleFor(condition);
  const requiredFields: AirwallexFormSchema["fields"] = [
    {
      key: "account_name",
      path: "beneficiary.bank_details.account_name",
      label: "收款账户名 / Account name",
      type: "INPUT",
      required: true,
      placeholder: "仅英文字母，姓名间用单个空格",
      description:
        "格式要求：仅支持英文字母，姓名各部分用单个空格分隔，不支持数字或符号",
      pattern: ENGLISH_ACCOUNT_NAME_PATTERN,
      validationMessage: "收款账户名仅支持英文字母和单个空格",
      validationRules: [
        {
          name: "WhitespaceTrimmed",
          message: "收款账户名首尾不能包含空格",
        },
      ],
    },
    {
      key: "account_number",
      path: "beneficiary.bank_details.account_number",
      label: "银行账号 / Bank account number",
      type: "INPUT",
      required: true,
      ...accountNumberRule,
    },
    {
      key: "bank_name",
      path: "beneficiary.bank_details.bank_name",
      label: "银行名称 / Bank name",
      type: "INPUT",
      required: true,
      placeholder: "2 至 140 位，可含字母、数字及常用符号",
      description:
        "格式要求：2 至 140 位，可使用字母、数字、空格及 . , & ' ( ) / -",
      pattern: "^[A-Za-z0-9À-ÖØ-öø-ÿ][A-Za-z0-9À-ÖØ-öø-ÿ .,&'()/-]{1,139}$",
      validationMessage: "银行名称应为 2 至 140 位有效字符",
      validationRules: [
        {
          name: "AlphanumericIncludingPunctuation",
          message: "银行名称包含不支持的字符",
        },
        {
          name: "MinMaxLength",
          parameters: { min: 2, max: 140 },
          message: "银行名称应为 2 至 140 位字符",
        },
      ],
    },
    {
      key: "bank_street_address",
      path: "beneficiary.bank_details.bank_street_address",
      label: "银行地址 / Bank address",
      type: "INPUT",
      required: true,
      placeholder: "5 至 200 位英文地址，含街道/城市/州省/邮编",
      description:
        "格式要求：使用 5 至 200 位英文字符，按街道、城市、州/省、邮编顺序填写完整地址",
      validationRules: [
        {
          name: "MinMaxLength",
          parameters: { min: 5, max: 200 },
          message: "银行地址应为 5 至 200 位字符",
        },
        {
          name: "WhitespaceTrimmed",
          message: "银行地址首尾不能包含空格",
        },
      ],
    },
    {
      key: "swift_code",
      path: "beneficiary.bank_details.swift_code",
      label: "国际汇款代码 / SWIFT / BIC",
      type: "INPUT",
      required: true,
      placeholder: "8 或 11 位英文字母/数字，不含空格",
      pattern: "^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$",
      description:
        "格式要求：8 或 11 位英文字母/数字，不含空格；前 4 位为银行代码、接 2 位国家代码和 2 位地区代码，可再加 3 位分行代码",
      validationMessage:
        "SWIFT / BIC 应为 8 或 11 位英文字母/数字",
    },
  ];

  const localFields: AirwallexFormSchema["fields"] =
    condition.bankCountryCode === "US"
      ? [
          {
            key: "routing_number",
            path: "beneficiary.bank_details.account_routing_value1",
            label: "ABA 路由号码 / ABA Routing Number",
            type: "INPUT",
            required: true,
            placeholder: "9 位数字，不含空格或符号",
            pattern: "^\\d{9}$",
            description:
              "格式要求：9 位数字，不含空格或符号",
            validationMessage: "ABA 路由号码应为 9 位数字",
          },
          {
            key: "account_type",
            path: "beneficiary.bank_details.bank_account_category",
            label: "银行账户类型 / Bank account type",
            type: "SELECT",
            required: true,
            options: [
              { label: "支票账户 / Checking", value: "CHECKING" },
              { label: "储蓄账户 / Savings", value: "SAVINGS" },
            ],
          },
        ]
      : condition.bankCountryCode === "JP"
        ? [
            {
              key: "bank_code",
              path: "beneficiary.bank_details.account_routing_value1",
              label: "银行代码 / Bank code",
              type: "INPUT",
              required: true,
              placeholder: "4 位数字，不含空格或符号",
              pattern: "^\\d{4}$",
              description: "格式要求：4 位数字，不含空格或符号",
              validationMessage: "银行代码应为 4 位数字",
            },
            {
              key: "branch_code",
              path: "beneficiary.bank_details.account_routing_value2",
              label: "分行代码 / Branch code",
              type: "INPUT",
              required: true,
              placeholder: "3 位数字，不含空格或符号",
              pattern: "^\\d{3}$",
              description: "格式要求：3 位数字，不含空格或符号",
              validationMessage: "分行代码应为 3 位数字",
            },
            {
              key: "account_type",
              path: "beneficiary.bank_details.bank_account_category",
              label: "银行账户类型 / Bank account type",
              type: "SELECT",
              required: true,
              options: [
                { label: "普通账户 / Ordinary account", value: "ORDINARY" },
                { label: "当座账户 / Current account", value: "CURRENT" },
              ],
            },
          ]
        : [
            {
              key: "iban",
              path: "beneficiary.bank_details.iban",
              label: "国际银行账号 / IBAN",
              type: "INPUT",
              required: true,
              ...ibanRuleFor(condition.bankCountryCode),
              validationRules: [
                ...(IBAN_LENGTH_BY_COUNTRY[condition.bankCountryCode]
                  ? [
                      {
                        name: "Length" as const,
                        parameters: {
                          length:
                            IBAN_LENGTH_BY_COUNTRY[
                              condition.bankCountryCode
                            ],
                        },
                        message: `${condition.bankCountryCode} 的 IBAN 应为 ${IBAN_LENGTH_BY_COUNTRY[condition.bankCountryCode]} 位`,
                      },
                    ]
                  : []),
                {
                  name: "IbanCountryOneOf" as const,
                  parameters: {
                    values: [condition.bankCountryCode],
                  },
                  message: `IBAN 国家代码应与所选国家 ${condition.bankCountryCode} 一致`,
                },
                {
                  name: "IbanIsValid" as const,
                  message: "IBAN 校验位不正确，请核对完整账号",
                  serverSideOnly: true,
                },
              ],
            },
          ];

  return {
    key: `airwallex-${condition.bankCountryCode}-${condition.accountCurrency}-${condition.entityType}-${condition.transferMethod}`,
    condition,
    fields: [
      ...requiredFields,
      ...(condition.transferMethod === "LOCAL" ? localFields : []),
    ].map((field) => ({
      ...field,
      example: field.type === "SELECT"
        ? field.options?.[0]?.label
        : payoutExampleFor(field.key, condition),
    })),
  };
};

export const profileSchemaFieldRequirement = (field: AirwallexSchemaField) => {
  if (field.type === "SELECT") return "请从当前场景提供的有效选项中选择";
  return (field.description || field.validationMessage || field.placeholder || "请按照当前付款场景的字段要求填写")
    .replace(/^格式要求：/, "");
};

const profileSupplementalGuidance = (
  key: string,
  countryCode: string,
): string => {
  if (key === "iban" && !["FR", "GB"].includes(countryCode)) {
    return "当前国家/地区通常无需 IBAN，无此号码可留空";
  }
  return ({
    account_type: "按开户行确认的账户类型选择",
    primary_routing_code_type: "按开户行提供的路由代码类型选择",
    primary_routing_code: "按开户行提供的路由代码填写",
    branch_code: "按开户行提供的分行代码填写",
    swift_code: "如开户行提供 SWIFT / BIC，可填写对应代码",
    iban: "如开户行提供 IBAN，可填写完整号码",
    bank_street_address: "按开户行实际街道地址填写",
    bank_city: "按开户行实际所在城市填写",
    bank_state_province: "按开户行实际所在州或省填写",
    bank_postal_code: "按开户行实际邮政编码填写",
    id_document_type: "按本人有效证件类型选择",
    beneficiary_id_number: "按所选证件上的号码填写",
    business_registration_number: "按企业登记证明上的号码填写",
  } satisfies Record<string, string>)[key] || "根据开户行或主体资料填写";
};

const AIRWALLEX_REQUIRED_FIELD_KEYS = [
  "account_name",
  "account_number",
  "bank_name",
  "bank_street_address",
  "swift_code",
] as const;

const canonicalAirwallexFieldKey = (key: string) =>
  key === "bank_address" ? "bank_street_address" : key;

export const normalizeAirwallexFormSchema = (
  schema: AirwallexFormSchema,
): AirwallexFormSchema => {
  const normalizedSourceFields = schema.fields.map((field) => ({
    ...field,
    key: canonicalAirwallexFieldKey(field.key),
  }));
  const sourceByKey = new Map(
    normalizedSourceFields.map((field) => [field.key, field]),
  );
  const requiredKeySet = new Set<string>(AIRWALLEX_REQUIRED_FIELD_KEYS);
  const requiredFields = buildAirwallexMockSchema(schema.condition).fields
    .filter((field) => requiredKeySet.has(field.key))
    .map((fallbackField) => {
      const sourceField = sourceByKey.get(fallbackField.key);
      return {
        ...fallbackField,
        ...sourceField,
        key: fallbackField.key,
        label: fallbackField.label,
        required: true,
      };
    });
  const dynamicFields = normalizedSourceFields.filter(
    (field) => !requiredKeySet.has(field.key),
  );

  return {
    ...schema,
    fields: [...requiredFields, ...dynamicFields],
  };
};

export const reconcileAirwallexSchemaValues = (
  schema: AirwallexFormSchema,
  values: Record<string, string>,
) =>
  Object.fromEntries(
    normalizeAirwallexFormSchema(schema).fields.map((field) => [
      field.key,
      values[field.key] ||
        (field.key === "bank_street_address" ? values.bank_address : "") ||
        "",
    ]),
  );

export const buildProfileRequiredPayoutFields = (
  profile: UserProfile,
): AirwallexSchemaField[] =>
  buildAirwallexMockSchema({
    bankCountryCode: inferAirwallexCountryCode(profile.payout.bankCountry),
    accountCurrency: profile.payout.currency,
    entityType: profile.payout.beneficiaryType,
    transferMethod: profile.payout.transferMethod,
  }).fields;

export const buildProfileSupplementalFields = (
  profile: UserProfile,
): ProfileSupplementalField[] => {
  const registeredKeys = new Set(
    buildProfileRequiredPayoutFields(profile).map((field) => field.key),
  );
  const isLocal = profile.payout.transferMethod === "LOCAL";
  const isPersonal = profile.payout.beneficiaryType === "PERSONAL";
  const hasPrimaryRoutingCode =
    registeredKeys.has("routing_number") || registeredKeys.has("bank_code");

  const condition: AirwallexSchemaCondition = {
    bankCountryCode: inferAirwallexCountryCode(profile.payout.bankCountry),
    accountCurrency: profile.payout.currency,
    entityType: profile.payout.beneficiaryType,
    transferMethod: profile.payout.transferMethod,
  };

  return ([
    ...(!registeredKeys.has("account_type")
      ? [{
          key: "account_type",
          label: "银行账户类型 / Bank account type",
          type: "SELECT" as const,
          options: [
            { label: "支票账户 / Checking", value: "CHECKING" },
            { label: "收款账户 / Payment", value: "PAYMENT" },
            { label: "储蓄账户 / Savings", value: "SAVINGS" },
          ],
        }]
      : []),
    ...(isLocal
      ? [{
          key: "primary_routing_code_type",
          label: "主要路由代码类型 / Primary routing code type",
          type: "SELECT" as const,
          options: [
            { label: "ABA 路由号码 / ABA routing number", value: "ABA" },
            { label: "银行代码 / Bank code", value: "BANK_CODE" },
            { label: "Sort Code", value: "SORT_CODE" },
            { label: "BSB", value: "BSB" },
            { label: "其他 / Other", value: "OTHER" },
          ],
        }]
      : []),
    ...(isLocal && !hasPrimaryRoutingCode
      ? [{
          key: "primary_routing_code",
          label: "主要路由代码 / Primary routing code",
          type: "INPUT" as const,
        }]
      : []),
    ...(isLocal && !registeredKeys.has("branch_code")
      ? [{
          key: "branch_code",
          label: "分行代码 / Branch code",
          type: "INPUT" as const,
        }]
      : []),
    ...(!registeredKeys.has("swift_code")
      ? [{
          key: "swift_code",
          label: "国际汇款代码 / SWIFT / BIC",
          type: "INPUT" as const,
        }]
      : []),
    ...(!registeredKeys.has("iban")
      ? [{
          key: "iban",
          label: "国际银行账号 / IBAN",
          type: "INPUT" as const,
        }]
      : []),
    ...(!registeredKeys.has("bank_street_address")
      ? [{
          key: "bank_street_address",
          label: "银行街道地址 / Bank street address",
          type: "INPUT" as const,
          fullWidth: true,
        }]
      : []),
    {
      key: "bank_city",
      label: "银行所在城市 / Bank city",
      type: "INPUT",
    },
    {
      key: "bank_state_province",
      label: "银行所在州 / 省 / Bank state / province",
      type: "INPUT",
    },
    {
      key: "bank_postal_code",
      label: "银行邮政编码 / Bank postal code",
      type: "INPUT",
    },
    ...(isPersonal
      ? [
          {
            key: "id_document_type",
            label: "身份证件类型 / ID document type",
            type: "SELECT" as const,
            options: [
              { label: "护照 / Passport", value: "PASSPORT" },
              { label: "身份证 / National ID", value: "NATIONAL_ID" },
              { label: "驾驶证 / Driving licence", value: "DRIVING_LICENCE" },
            ],
          },
          {
            key: "beneficiary_id_number",
            label: "收款人证件号码 / Beneficiary ID number",
            type: "INPUT" as const,
          },
        ]
      : [{
          key: "business_registration_number",
          label: "企业注册号 / Business registration number",
          type: "INPUT" as const,
        }]),
  ] as ProfileSupplementalField[]).map((field) => ({
    ...field,
    guidance: profileSupplementalGuidance(field.key, condition.bankCountryCode),
    example: field.type === "SELECT"
      ? field.options?.find((option) => field.key === "primary_routing_code_type" && option.value === ({ JP: "BANK_CODE", US: "ABA", GB: "SORT_CODE", AU: "BSB" } as Record<string, string>)[condition.bankCountryCode])?.label || field.options?.[0]?.label
      : payoutExampleFor(field.key, condition),
  }));
};

const profileSchemaValue = (profile: UserProfile, key: string) => {
  const directValues: Record<string, string> = {
    account_name: profile.payout.accountHolder,
    account_number: profile.payout.accountNumber,
    bank_name: profile.payout.bankName,
    swift_code: profile.payout.swiftCode,
  };
  return directValues[key] || profile.payout.schemaValues[key] || "";
};

export const validateRequiredProfileFields = (profile: UserProfile) => {
  const requiredValues = [
    ["真实姓名 / Real Name", profile.legalName],
    ["联系电话 / Tel", profile.phone],
    ["联系邮箱 / Email", profile.email],
    ["联系地址 / Address", profile.address],
    ["国家 / Country", profile.payout.bankCountry],
    ["账户币种 / Account currency", profile.payout.currency],
    ["收款人类型 / Recipient type", profile.payout.beneficiaryType],
    ["转账方式 / Transfer method", profile.payout.transferMethod],
  ] as const;
  const missing: string[] = requiredValues
    .filter(([, value]) => !value.trim())
    .map(([label]) => label);

  if (missing.length) {
    throw new Error(`请完成必填字段：${[...new Set(missing)].join("、")}`);
  }
  if (!isValidEmailAddress(profile.email)) {
    throw new Error("请输入有效的联系邮箱地址");
  }

  buildProfileRequiredPayoutFields(profile).forEach((field) => {
    const value = profileSchemaValue(profile, field.key).trim();
    if (field.required && !value) missing.push(field.label);
    if (value && field.pattern && !new RegExp(field.pattern).test(value)) {
      throw new Error(`${field.label.split(" / ")[0]}格式不正确`);
    }
  });

  if (missing.length) {
    throw new Error(`请完成必填字段：${[...new Set(missing)].join("、")}`);
  }
  return true;
};

export class MockApiAdapter implements Services {
  constructor(private readonly aiRecognition: ExternalInvoiceRecognitionAdapter = new MockAiRecognitionAdapter()) {
    this.invoiceData = linkInvoicesToContracts(this.invoiceData, this.contractData, PRIMARY_CREATOR_ID);
    adminStore.syncProfile(this.profileData, false);
  }
  private invoiceData = this.readInvoices();
  private contractData = this.readContracts();
  private profileData = this.readProfile();
  private paymentAttemptData = this.readPaymentAttempts();
  private creatorNotificationData = this.readCreatorNotifications();

  private authorizedCreator(sessionId: string, creatorId: string, write = false): Session {
    const session = adminStore.restoreSession(sessionId);
    if (!session) throw new Error("登录会话已失效，请重新登录");
    const account = adminStore.listUsers({ role: "CREATOR" }).find((item) => item.id === creatorId);
    if (!account) throw new Error("达人不存在或无权查看");
    if (session.role === "CREATOR" && session.userId !== creatorId) throw new Error("无权查看其他达人的资料");
    if (write && (session.role !== "CREATOR" || session.userId !== creatorId)) throw new Error("管理员只读模式不能执行达人操作");
    return session;
  }

  creatorScope: Services["creatorScope"] = {
    assertWrite: (sessionId, creatorId) => { this.authorizedCreator(sessionId, creatorId, true); },
    assertInvoiceWrite: (sessionId, creatorId, invoiceId) => {
      this.authorizedCreator(sessionId, creatorId, true);
      const invoices = creatorId === PRIMARY_CREATOR_ID ? this.invoiceData : adminStore.getUserDetail(creatorId).invoices;
      if (!invoices.some((item) => item.id === invoiceId || item.invoiceId === invoiceId || item.invoiceNumber === invoiceId)) {
        throw new Error("当前账号无权操作该 Invoice");
      }
    },
    read: async (sessionId, creatorId) => {
      const session = this.authorizedCreator(sessionId, creatorId);
      await wait(80);
      // Revalidate after asynchronous work, so disabling an account revokes access immediately.
      this.authorizedCreator(sessionId, creatorId);
      const detail = adminStore.getUserDetail(creatorId, creatorId === PRIMARY_CREATOR_ID ? {
        contracts: this.contractData,
        invoices: this.invoiceData,
        profile: this.profileData,
      } : undefined);
      const attempts = attemptsByCreator(detail.invoices, creatorId === PRIMARY_CREATOR_ID ? this.paymentAttemptData : [], creatorId);
      return { data: {
        detail: session.role === "ADMIN" ? maskedCreatorDetail(detail) : detail,
        attempts: session.role === "ADMIN" ? attempts.map((attempt) => ({
          ...attempt,
          payoutSnapshot: attempt.payoutSnapshot && maskSnapshot(attempt.payoutSnapshot),
        })) : attempts,
        tasks: buildCreatorTasks(detail.contracts, detail.invoices),
      } };
    },
  };

  private readPaymentAttempts(): PaymentAttempt[] {
    const invoiceAttempts = this.invoiceData.flatMap((invoice) => legacyPaymentAttempt(invoice));
    const failure = this.invoiceData.find((invoice) => invoice.id === "INV-20260728-00001");
    if (failure) {
      const current = invoiceAttempts.find((attempt) => attempt.invoiceId === invoiceInternalIdOf(failure));
      if (current) {
        current.sequence = 2;
        invoiceAttempts.push({ ...structuredClone(current), id: `${current.id}:first`, sequence: 1, updatedAt: "2026-07-28T12:00:00.000Z", failureReason: "首次转账未通过银行账户校验" });
      }
    }
    if (typeof window === "undefined") return invoiceAttempts;
    try {
      const stored = JSON.parse(window.localStorage.getItem(PAYMENT_ATTEMPT_STORAGE_KEY) || "[]") as PaymentAttempt[];
      const byId = new Map(invoiceAttempts.map((attempt) => [attempt.id, attempt]));
      stored.forEach((attempt) => byId.set(attempt.id, attempt));
      return [...byId.values()].filter((attempt) => this.invoiceData.some((invoice) => invoiceInternalIdOf(invoice) === attempt.invoiceId));
    } catch {
      return invoiceAttempts;
    }
  }

  private persistPaymentAttempts() {
    if (typeof window !== "undefined") window.localStorage.setItem(PAYMENT_ATTEMPT_STORAGE_KEY, JSON.stringify(this.paymentAttemptData));
  }

  private migratePayoutAccounts(profile: UserProfile) {
    return normalizePayoutProfile(profile);
  }

  private readInvoiceSnapshotAccounts() {
    if (typeof window === "undefined") {
      return structuredClone(initialProfile.payoutAccounts);
    }
    try {
      const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      const profile = stored
        ? JSON.parse(stored) as UserProfile
        : initialProfile;
      return structuredClone(
        profile.payoutAccounts?.length
          ? profile.payoutAccounts
          : [profile.payout],
      );
    } catch {
      return structuredClone(initialProfile.payoutAccounts);
    }
  }

  private attachPayoutSnapshots(items: Invoice[]) {
    const accounts = this.readInvoiceSnapshotAccounts();
    return items.map((invoice) => ensureInvoicePayoutSnapshot(invoice, accounts));
  }

  private prepareInvoiceData(items: Invoice[]) {
    const prepared = sortInvoices(this.attachPayoutSnapshots(items));
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(prepared));
      } catch {
        // Preserve existing legacy JSON. Async migration will move embedded files first.
      }
    }
    return prepared;
  }

  private readInvoices() {
    if (typeof window === "undefined") {
      return this.prepareInvoiceData(migrateInvoices(structuredClone(seedInvoices)));
    }
    try {
      const stored = window.localStorage.getItem(INVOICE_STORAGE_KEY);
      if (!stored) {
        return this.prepareInvoiceData(migrateInvoices(structuredClone(seedInvoices)));
      }

      const legacyIdMap: Record<string, string> = {
        "INV-260727-S": "INV-20260727-00001",
        "INV-260728-R": "INV-20260728-00001",
        "INV-240718": "INV-20260718-00001",
        "INV-240714": "INV-20260714-00001",
        "INV-240625-A": "INV-20260625-00001",
      };
      const storedInvoices = (JSON.parse(stored) as Invoice[]).map((invoice) => ({
        ...invoice,
        id: legacyIdMap[invoice.id] || invoice.id,
      }));
      const storedById = new Map(storedInvoices.map((invoice) => [invoice.id, invoice]));
      const mergedSeedInvoices = seedInvoices.map(
        (invoice) => {
          const storedInvoice = storedById.get(invoice.id);
          const payoutAccountChanged = Boolean(
            storedInvoice
            && storedInvoice.payoutAccountId !== invoice.payoutAccountId,
          );
          // Correct timestamps from the first local-only demo fixture, but never reset an interacted record.
          const pristineDemoTimestamp = (storedInvoice?.version || 1) === 1 && (
            (invoice.id === "INV-20260920-00002" && storedInvoice?.updatedAt === "2026-09-20T09:30:00.000Z")
            || (invoice.id === "INV-20260920-00003" && storedInvoice?.updatedAt === "2026-09-20T10:40:00.000Z")
          );
          return {
            ...structuredClone(invoice),
            ...storedInvoice,
            updatedAt: pristineDemoTimestamp || storedInvoice?.updatedAt === "2026-09-20T09:00:00.000Z"
              ? invoice.updatedAt : storedInvoice?.updatedAt || invoice.updatedAt,
            payoutSnapshot: pristineDemoTimestamp && invoice.id === "INV-20260920-00003"
              ? invoice.payoutSnapshot
              : storedInvoice?.payoutSnapshot
              || (payoutAccountChanged ? undefined : invoice.payoutSnapshot),
            projectId: invoice.projectId,
            projectName: invoice.projectName,
            brand: invoice.brand,
            channel: "Airwallex" as const,
          };
        },
      );
      const customInvoices = storedInvoices.filter(
        (invoice) => !seedInvoices.some((seed) => seed.id === invoice.id),
      ).map((invoice) => ({ ...invoice, channel: "Airwallex" as const }));
      return this.prepareInvoiceData(
        [...mergedSeedInvoices, ...customInvoices].map(migrateLegacyInvoiceState),
      );
    } catch {
      return this.prepareInvoiceData(migrateInvoices(structuredClone(seedInvoices)));
    }
  }

  private readContracts() {
    if (typeof window === "undefined") return structuredClone(seedContracts);
    try {
      const stored = window.localStorage.getItem(CONTRACT_STORAGE_KEY);
      if (!stored) return structuredClone(seedContracts);
      const storedContracts = JSON.parse(stored) as Contract[];
      const storedById = new Map(storedContracts.map((contract) => [contract.id, contract]));
      const migratedContracts = seedContracts.map((contract) => ({
        ...structuredClone(contract),
        ...storedById.get(contract.id),
        projectId: contract.projectId,
        projectName: contract.projectName,
        brand: contract.brand,
        contractType: normalizeContractType(
          storedById.get(contract.id)?.contractType ?? contract.contractType,
        ),
      }));
      window.localStorage.setItem(
        CONTRACT_STORAGE_KEY,
        JSON.stringify(migratedContracts),
      );
      return migratedContracts;
    } catch {
      return structuredClone(seedContracts);
    }
  }

  private readCreatorNotifications() {
    const current = buildCreatorNotifications(this.contractData, this.invoiceData);
    if (typeof window === "undefined") return current;
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(CREATOR_NOTIFICATION_STORAGE_KEY) || "[]",
      ) as CreatorNotification[];
      const readById = new Map(stored.map((item) => [item.id, item.read]));
      return current.map((item) => ({ ...item, read: readById.get(item.id) ?? false }));
    } catch {
      return current;
    }
  }

  private persistInvoices() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(this.invoiceData));
    }
    this.refreshCreatorNotifications();
  }

  /** Upgrade old embedded documents without discarding the original JSON until every byte is safely stored. */
  private async migrateEmbeddedInvoiceFiles() {
    if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
    const candidate = structuredClone(this.invoiceData);
    const written: string[] = [];
    try {
      for (const invoice of candidate) {
        const refs = [invoice.document, ...(invoice.sourceFileVersions || []), ...(invoice.fileVersions || [])];
        for (const ref of refs) {
          if (!ref?.previewUrl?.startsWith("data:")) continue;
          const storageId = ref.storageId || `legacy:${invoiceInternalIdOf(invoice)}:${ref.id}`;
          if (!written.includes(storageId)) {
            await saveInvoiceFile(storageId, await dataUrlToBlob(ref.previewUrl));
            written.push(storageId);
          }
          ref.storageId = storageId;
          delete ref.previewUrl;
        }
      }
      if (!written.length) return;
      window.localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(candidate));
      this.invoiceData = candidate;
    } catch {
      await Promise.allSettled(written.map(removeInvoiceFile));
      // Keep the complete legacy record; a later visit can retry migration.
    }
  }

  /** Upgrade pending records created by the earlier empty mock; keep the original snapshot for audit. */
  private migrateEmptyDemoRecognition() {
    const candidate = structuredClone(this.invoiceData);
    let changed = false;
    for (const invoice of candidate) {
      const original = invoice.recognitionSnapshots?.at(-1);
      const file = invoice.sourceFileVersions?.at(-1);
      if (invoice.documentState?.kind !== "EXTERNAL" || invoice.documentState.status !== "WAITING_CONFIRMATION"
        || !original || !file || original.fileVersionId !== file.fileVersionId
        || original.engineVersion !== "mock-ai-v1" || invoice.confirmedSnapshots?.length
        || [original.fields.PUBLISHER, original.fields.ADVERTISER, original.fields.INVOICE_DATE, original.fields.AMOUNT, original.fields.CURRENCY]
          .some((value) => value?.trim())) continue;
      const extractedData = demoInvoiceValues({
        invoice,
        profile: this.profileData,
        account: this.profileData.payoutAccounts.find((item) => item.id === invoice.payoutAccountId),
      });
      invoice.extractedData = extractedData;
      invoice.recognitionSnapshots = [...invoice.recognitionSnapshots!, {
        recognitionId: `recognition:demo:${invoiceInternalIdOf(invoice)}:${file.fileVersionId}`,
        fileVersionId: file.fileVersionId,
        engineVersion: "mock-ai-v2",
        recognizedAt: new Date().toISOString(),
        fields: recognitionFieldsFromExtracted(invoiceNumberOf(invoice), extractedData),
        extractedData,
      }];
      invoice.pageConfirmations = {};
      invoice.version = (invoice.version || 1) + 1;
      changed = true;
    }
    if (!changed) return;
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(candidate)); }
      catch { return; }
    }
    this.invoiceData = candidate;
  }

  private persistContracts() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(this.contractData));
    }
    this.refreshCreatorNotifications();
  }

  private refreshCreatorNotifications() {
    const readById = new Map(this.creatorNotificationData?.map((item) => [item.id, item.read]) || []);
    this.creatorNotificationData = buildCreatorNotifications(this.contractData, this.invoiceData)
      .map((item) => ({ ...item, read: readById.get(item.id) ?? false }));
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          CREATOR_NOTIFICATION_STORAGE_KEY,
          JSON.stringify(this.creatorNotificationData),
        );
      } catch {
        // Notification storage must not undo a committed Invoice file/metadata pair.
      }
    }
  }

  private findInvoice(resourceId: string) {
    return this.invoiceData.find((invoice) => (
      invoiceInternalIdOf(invoice) === resourceId
      || invoiceNumberOf(invoice) === resourceId
      || invoice.id === resourceId
    ));
  }

  private recordInvoiceOperation(
    invoice: Invoice,
    type: NonNullable<Invoice["operationHistory"]>[number]["type"],
    label: string,
    actor: string,
    reason?: string,
  ) {
    const occurredAt = new Date().toISOString();
    invoice.operationHistory = [
      ...(invoice.operationHistory || []),
      {
        id: `operation:${type}:${Date.now()}`,
        type,
        label,
        actor,
        occurredAt,
        reason,
      },
    ];
    invoice.updatedAt = occurredAt;
    invoice.status = legacyStatusForInvoice(invoice.documentState!, invoice.paymentStatus!);
    return occurredAt;
  }

  private externalCommandInvoice(input: ExternalInvoiceCommandBase) {
    const invoice = this.findInvoice(input.invoiceId);
    if (!invoice) throw new Error("Invoice 不存在");
    if (invoice.documentState?.kind !== "EXTERNAL") {
      throw new Error("当前 Invoice 不是外部 Invoice");
    }
    assertCreatorOwnsInvoice(invoice, input.creatorId);
    if (invoice.processedClientRequestIds?.includes(input.clientRequestId)) {
      return { invoice, duplicate: true };
    }
    assertExpectedVersion(invoice, input.expectedVersion);
    return { invoice, duplicate: false };
  }

  private finishExternalCommand(
    invoice: Invoice,
    clientRequestId: string,
    event: Omit<ExternalInvoiceReviewEvent, "eventId" | "occurredAt">,
  ) {
    const occurredAt = new Date().toISOString();
    invoice.version = (invoice.version || 1) + 1;
    invoice.updatedAt = occurredAt;
    invoice.processedClientRequestIds = [
      ...(invoice.processedClientRequestIds || []),
      clientRequestId,
    ];
    invoice.reviewHistory = [
      ...(invoice.reviewHistory || []),
      {
        ...event,
        eventId: `review:${invoiceInternalIdOf(invoice)}:${invoice.version}:${event.action}`,
        occurredAt,
      },
    ];
    invoice.status = legacyStatusForInvoice(invoice.documentState!, invoice.paymentStatus!);
    this.persistInvoices();
    return structuredClone(invoice);
  }

  private uploadExternalFile(
    input: ExternalInvoiceUploadInput,
    requiredStatus: "WAITING_UPLOAD" | "RETURNED_FOR_REUPLOAD" | "RECOGNITION_FAILED",
  ) {
    const invoice = this.findInvoice(input.invoiceId);
    if (!invoice) throw new Error("Invoice 不存在");
    if (
      invoice.documentState?.kind !== "EXTERNAL"
      || invoice.documentState.status !== requiredStatus
    ) {
      throw new Error(
        requiredStatus === "WAITING_UPLOAD"
          ? "当前 Invoice 不是待上传状态"
          : "当前 Invoice 未被要求重新上传",
      );
    }
    if (!/^(application\/pdf|image\/(png|jpeg))$/.test(input.file.mimeType)) {
      throw new Error("仅支持 PDF、PNG 或 JPEG 文件");
    }
    if (input.file.size <= 0 || input.file.size > 5 * 1024 * 1024) {
      throw new Error("文件大小必须在 5MB 以内");
    }
    const account = this.profileData.payoutAccounts.find(
      (candidate) => candidate.id === input.payoutAccountId,
    );
    if (!account || !isPayoutAccountUsable(account)) {
      throw new Error("请选择已验证且可用于收款的账户");
    }
    const previous = invoice.fileVersions?.at(-1);
    const version = (previous?.version || 0) + 1;
    const uploadedAt = new Date().toISOString();
    const fileVersion = {
      ...structuredClone(input.file),
      version,
      uploadedAt,
      demoHash: `demo-${invoiceInternalIdOf(invoice)}-${version}-${input.file.size}`,
      supersedesFileId: previous?.id,
    };
    invoice.documentState = { kind: "EXTERNAL", status: "RECOGNIZING" };
    invoice.payoutAccountId = input.payoutAccountId;
    invoice.payoutSnapshot = createInvoicePayoutSnapshot(account, uploadedAt);
    invoice.document = structuredClone(input.file);
    invoice.extractedData = structuredClone(input.extractedData);
    invoice.fileVersions = [...(invoice.fileVersions || []), fileVersion];
    invoice.rejectedReason = undefined;
    this.recordInvoiceOperation(
      invoice,
      requiredStatus === "WAITING_UPLOAD"
        ? "EXTERNAL_FILE_UPLOADED"
        : "EXTERNAL_RESUBMITTED",
      requiredStatus === "WAITING_UPLOAD" ? "外部 Invoice 文件已上传" : "外部 Invoice 新版本已上传",
      "达人",
    );
    invoice.documentState = { kind: "EXTERNAL", status: "WAITING_CONFIRMATION" };
    this.recordInvoiceOperation(
      invoice,
      "EXTERNAL_RECOGNIZED",
      `模拟 AI 识别完成 · 文件版本 v${version}`,
      "系统",
    );
    this.persistInvoices();
    return structuredClone(invoice);
  }

  private assertExternalConfirmationReady(invoice: Invoice) {
    if (
      invoice.documentState?.kind !== "EXTERNAL"
      || invoice.documentState.status !== "WAITING_CONFIRMATION"
    ) throw new Error("当前 Invoice 不能确认");
    if (!invoice.extractedData) throw new Error("Invoice 尚未生成 AI 识别结果");
    const account = this.profileData.payoutAccounts.find(
      (candidate) => candidate.id === invoice.payoutAccountId,
    );
    if (!account || !isPayoutAccountUsable(account)) {
      throw new Error("所选收款账户已失效，请重新选择");
    }
    const [, expectedAmount = ""] = invoice.amount.split(/\s+/, 2);
    const expectedCurrency = invoice.amount.split(/\s+/, 1)[0];
    const extracted = invoice.extractedData;
    if (Number(extracted.total.replace(/,/g, "")) !== Number(expectedAmount.replace(/,/g, ""))) {
      throw new Error("Invoice 金额与系统下发金额不一致");
    }
    if (normalizePaymentDetail(extracted.currency) !== normalizePaymentDetail(expectedCurrency)) {
      throw new Error("Invoice 币种与系统下发币种不一致");
    }
    if (normalizePaymentDetail(extracted.invoiceFrom) !== normalizePaymentDetail(this.profileData.legalName)) {
      throw new Error("Invoice From 与个人档案 Real Name 不一致");
    }
    if (normalizePaymentDetail(extracted.billTo) !== normalizePaymentDetail("COMETS INTERNATIONAL LIMITED")) {
      throw new Error("Bill To 必须为 COMETS INTERNATIONAL LIMITED");
    }
  }

  private readProfile() {
    if (typeof window === "undefined") {
      return this.migratePayoutAccounts(structuredClone(initialProfile));
    }
    try {
      const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      const storedProfile = stored
        ? (JSON.parse(stored) as UserProfile)
        : structuredClone(initialProfile);
      const profile = this.migratePayoutAccounts(storedProfile);
      const payoutAccounts = profile.payoutAccounts.map((account) => {
        if (account.provider !== "Airwallex") return account;
        const accountName = sanitizeEnglishAccountName(
          account.accountHolder ||
            account.schemaValues.account_name ||
            "",
        ).trim();
        return {
          ...account,
          accountHolder: accountName,
          schemaValues: {
            ...account.schemaValues,
            account_name: accountName,
          },
        };
      });
      return syncPayoutAccounts(
        profile,
        payoutAccounts,
        profile.defaultPayoutAccountId,
      );
    } catch {
      return this.migratePayoutAccounts(structuredClone(initialProfile));
    }
  }

  auth: AuthService = {
    login: async (email, password) => {
      await wait();
      return { data: adminStore.login(email, password) };
    },
    register: async (name, email, password, invitationCode) => {
      await wait();
      return { data: adminStore.register(name, email, password, invitationCode) };
    },
    requestPasswordReset: async (email) => {
      await wait();
      return { data: adminStore.requestPasswordReset(email) };
    },
    verifyPasswordReset: async (token) => {
      await wait(80);
      return { data: adminStore.verifyPasswordReset(token) };
    },
    completePasswordReset: async (token, newPassword) => {
      await wait();
      adminStore.completePasswordReset(token, newPassword);
      return { data: { completed: true }, message: "密码已更新" };
    },
    restore: async (sessionId) => {
      await wait(40);
      return { data: adminStore.restoreSession(sessionId) };
    },
    logout: async (sessionId) => {
      adminStore.logout(sessionId);
      return { data: { revoked: true } };
    },
    completeOnboarding: async (userId, profile, sessionId) => {
      await wait(120);
      const session = adminStore.completeOnboarding(userId, profile, sessionId);
      if (!session) throw new Error("登录会话已失效，请重新登录");
      return { data: session };
    },
  };

  profile: ProfileService = {
    get: async (userId = "CREATOR-001") => {
      await wait(120);
      const storedProfile = adminStore.getProfile(userId);
      return {
        data: this.migratePayoutAccounts(
          structuredClone(storedProfile || this.profileData),
        ),
      };
    },
    save: async (profile) => {
      await wait();
      const previousProfile = adminStore.getProfile(profile.id);
      const payoutProfile = normalizePayoutProfile(profile);
      const payoutAccounts = payoutProfile.payoutAccounts.map((account) => {
        if (account.provider !== "Airwallex") return account;
        const accountName = sanitizeEnglishAccountName(
          account.accountHolder,
        ).trim();
        return {
          ...account,
          accountHolder: accountName,
          swiftCode:
            account.swiftCode ||
            account.schemaValues.swift_code ||
            "",
          schemaValues: {
            ...account.schemaValues,
            account_name: accountName,
          },
        };
      });
      const normalizedProfile = syncPayoutAccounts(
        payoutProfile,
        payoutAccounts,
        payoutProfile.defaultPayoutAccountId,
      );
      const accountName = normalizedProfile.payout.accountHolder;
      validateRequiredProfileFields(normalizedProfile);
      if (!isEnglishAccountName(accountName)) {
        throw new Error("收款账户名仅支持英文字母和空格");
      }
      if (normalizedProfile.id === PRIMARY_CREATOR_ID) this.profileData = structuredClone(normalizedProfile);
      adminStore.syncProfile(normalizedProfile);
      if (JSON.stringify(previousProfile) !== JSON.stringify(normalizedProfile)) {
        adminStore.recordCreatorAction(normalizedProfile.id, "PROFILE", "保存个人档案或收款账户资料");
      }
      if (typeof window !== "undefined" && normalizedProfile.id === PRIMARY_CREATOR_ID) {
        window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.profileData));
      }
      return { data: structuredClone(normalizedProfile), message: "个人档案已保存" };
    },
    addSocialAccount: async (input) => {
      const actor = browserSession();
      this.authorizedCreator(actor.sessionId, input.creatorId, true);
      const previous = adminStore.getProfile(input.creatorId);
      if (!previous) throw new SocialAccountError("profileUnavailable");
      const url = validateSocialAccountAddition(previous.social, input);
      const storedIds: string[] = [];
      try {
        const screenshots = [];
        for (const file of input.screenshots) {
          const id = `social:${input.creatorId}:${crypto.randomUUID()}`;
          await saveSocialScreenshot(id, file);
          storedIds.push(id);
          screenshots.push({ id, storageId: id, name: file.name, mimeType: file.type, size: file.size });
        }
        // A disabled account or another tab may have changed the profile while bytes were saved.
        this.authorizedCreator(actor.sessionId, input.creatorId, true);
        const latest = adminStore.getProfile(input.creatorId);
        if (!latest) throw new SocialAccountError("profileUnavailable");
        validateSocialAccountAddition(latest.social, input);
        const evidenceByProfileUrl = normalizeSocialEvidence(latest.social);
        evidenceByProfileUrl[url] = screenshots;
        const nextProfile: UserProfile = {
          ...latest,
          social: {
            ...latest.social,
            profileUrls: [...(latest.social.profileUrls?.length ? latest.social.profileUrls : [latest.social.profileUrl]).filter(Boolean), url],
            evidenceByProfileUrl,
            verificationByProfileUrl: {
              ...latest.social.verificationByProfileUrl,
              [url]: { status: "DEMO_VERIFIED", verifiedAt: new Date().toISOString() },
            },
          },
        };
        adminStore.syncProfile(nextProfile, false);
        if (input.creatorId === PRIMARY_CREATOR_ID) {
          this.profileData = structuredClone(nextProfile);
          if (typeof window !== "undefined") window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
        }
        adminStore.recordCreatorAction(input.creatorId, "PROFILE", "添加社媒主页并完成本地演示验证");
        return { data: structuredClone(nextProfile) };
      } catch (error) {
        await Promise.allSettled(storedIds.map((id) => removeSocialScreenshot(id)));
        if (error instanceof SocialAccountError) throw error;
        throw new SocialAccountError("storageFailed");
      }
    },
  };

  requests: RequestProjectService & Pick<
    InvoiceService,
    | "listExternalInvoices"
    | "getExternalInvoice"
    | "uploadExternalInvoiceFile"
    | "retryExternalInvoiceRecognition"
    | "correctExternalInvoiceRecognition"
    | "selectExternalInvoicePayoutAccount"
    | "confirmExternalInvoice"
    | "confirmExternalInvoicePage"
    | "resubmitExternalInvoice"
    | "listExternalInvoiceHistory"
  > = {
    list: async (creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      return {
        data:
          creatorId === PRIMARY_CREATOR_ID
            ? structuredClone(aggregateRequestProjects(seedRequests, this.contractData, this.invoiceData))
            : structuredClone(adminStore.getUserDetail(creatorId).requests),
      };
    },
    get: async (id, creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      if (creatorId !== PRIMARY_CREATOR_ID) return { data: structuredClone(adminStore.getUserDetail(creatorId).requests.find((request) => request.id === id)) };
      const item = aggregateRequestProjects(seedRequests, this.contractData, this.invoiceData).find((entry) => entry.id === id);
      return { data: item ? structuredClone(item) : undefined };
    },
    listExternalInvoices: async (creatorId) => {
      await wait(80);
      await this.migrateEmbeddedInvoiceFiles();
      this.migrateEmptyDemoRecognition();
      return {
        data: creatorId === PRIMARY_CREATOR_ID
          ? structuredClone(this.invoiceData.filter((item) => item.documentState?.kind === "EXTERNAL"))
          : [],
      };
    },
    getExternalInvoice: async (invoiceId, creatorId) => {
      await wait(80);
      await this.migrateEmbeddedInvoiceFiles();
      this.migrateEmptyDemoRecognition();
      const invoice = this.findInvoice(invoiceId);
      if (!invoice || invoice.documentState?.kind !== "EXTERNAL") return { data: undefined };
      if ((invoice.creatorId || PRIMARY_CREATOR_ID) !== creatorId) return { data: undefined };
      return { data: structuredClone(invoice) };
    },
    uploadExternalInvoiceFile: async (input) => {
      await wait(240);
      await this.migrateEmbeddedInvoiceFiles();
      const { invoice, duplicate } = this.externalCommandInvoice(input);
      if (duplicate) return { data: structuredClone(invoice), message: "重复请求已忽略" };
      const state = invoice.documentState!;
      const allowed = state.kind === "EXTERNAL" && [
        "WAITING_UPLOAD",
        "RETURNED_FOR_REUPLOAD",
        "RECOGNITION_FAILED",
      ].includes(state.status);
      if (!allowed) throw new Error("当前状态不允许上传 Invoice 文件");
      if (!/^(application\/pdf|image\/(png|jpeg))$/.test(input.file.mimeType)) {
        throw new Error("仅支持 PDF、PNG 或 JPEG 文件");
      }
      if (input.file.size <= 0 || input.file.size > 5 * 1024 * 1024) {
        throw new Error("文件大小必须在 5MB 以内");
      }
      const previous = invoice.sourceFileVersions?.at(-1);
      const version = (previous?.version || 0) + 1;
      const uploadedAt = new Date().toISOString();
      const fileVersionId = `file:${invoiceInternalIdOf(invoice)}:v${version}`;
      const candidate = structuredClone(invoice);
      const storageId = input.fileBlob ? fileVersionId : undefined;
      if (input.fileBlob) {
        try {
          await saveInvoiceFile(fileVersionId, input.fileBlob);
        } catch {
          throw new Error(fileStorageMessage());
        }
      }
      const savedFile = { ...structuredClone(input.file), storageId };
      // Legacy service fixtures may provide a tiny Data URL instead of a Blob.
      if (storageId) delete savedFile.previewUrl;
      candidate.sourceFileVersions = [
        ...(candidate.sourceFileVersions || []),
        {
          ...savedFile,
          id: fileVersionId,
          fileVersionId,
          fileName: input.file.name,
          version,
          fileHash: `mock-sha256-${input.file.size}-${version}`,
          uploadedAt,
          uploadedBy: input.creatorId,
          supersedesFileVersionId: previous?.fileVersionId,
        },
      ];
      candidate.fileVersions = candidate.sourceFileVersions.map((file) => ({
        ...file,
        demoHash: file.fileHash,
        supersedesFileId: file.supersedesFileVersionId,
      }));
      candidate.document = savedFile;
      candidate.payoutAccountId = undefined;
      candidate.payoutSnapshot = undefined;
      candidate.extractedData = undefined;
      // Keep prior corrections for audit; only the current recognition may supply editable values.
      candidate.pageConfirmations = {};
      const fromStatus = state.status;
      candidate.documentState = { kind: "EXTERNAL", status: "RECOGNIZING" };
      const index = this.invoiceData.indexOf(invoice);
      this.invoiceData[index] = candidate;
      let uploaded: Invoice;
      try {
        uploaded = this.finishExternalCommand(candidate, input.clientRequestId, {
          action: "FILE_UPLOADED",
          actor: input.creatorId,
          fromStatus,
          toStatus: "RECOGNIZING",
        });
      } catch {
        this.invoiceData[index] = invoice;
        if (storageId) await removeInvoiceFile(storageId).catch(() => undefined);
        throw new Error(fileStorageMessage());
      }
      adminStore.recordCreatorAction(input.creatorId, "INVOICE", `上传 Invoice ${invoiceNumberOf(uploaded)}`);
      return { data: uploaded, message: "文件已上传，正在识别 Invoice 信息" };
    },
    retryExternalInvoiceRecognition: async (input) => {
      await wait(420);
      const { invoice, duplicate } = this.externalCommandInvoice(input);
      if (duplicate) return { data: structuredClone(invoice), message: "重复请求已忽略" };
      if (invoice.documentState?.status !== "RECOGNIZING" && invoice.documentState?.status !== "RECOGNITION_FAILED") {
        throw new Error("当前状态不能执行识别");
      }
      const file = invoice.sourceFileVersions?.at(-1);
      if (!file) throw new Error("请先上传 Invoice 文件");
      const fromStatus = invoice.documentState.status;
      if (input.simulateFailure) {
        invoice.documentState = { kind: "EXTERNAL", status: "RECOGNITION_FAILED" };
        invoice.returnReason = "模拟 AI 无法识别当前文件，请重新识别或上传清晰文件。";
        const data = this.finishExternalCommand(invoice, input.clientRequestId, {
          action: "RECOGNITION_FAILED",
          actor: "模拟 AI",
          fromStatus,
          toStatus: "RECOGNITION_FAILED",
          reason: invoice.returnReason,
        });
        this.refreshCreatorNotifications();
        return { data, message: "识别失败" };
      }
      const extractedData = await this.aiRecognition.recognize(file, {
        invoice,
        profile: this.profileData,
        account: this.profileData.payoutAccounts.find((item) => item.id === invoice.payoutAccountId),
      });
      invoice.extractedData = extractedData;
      invoice.recognitionSnapshots = [
        ...(invoice.recognitionSnapshots || []),
        {
          recognitionId: `recognition:${invoiceInternalIdOf(invoice)}:${file.version}`,
          fileVersionId: file.fileVersionId,
          engineVersion: "mock-ai-v1",
          recognizedAt: new Date().toISOString(),
          fields: recognitionFieldsFromExtracted(invoiceNumberOf(invoice), extractedData),
          extractedData,
        },
      ];
      invoice.documentState = { kind: "EXTERNAL", status: "WAITING_CONFIRMATION" };
      invoice.returnReason = undefined;
      const data = this.finishExternalCommand(invoice, input.clientRequestId, {
        action: "RECOGNITION_SUCCEEDED",
        actor: "模拟 AI",
        fromStatus,
        toStatus: "WAITING_CONFIRMATION",
      });
      // Successful recognition is intentionally silent in NotificationService.
      return { data, message: "识别完成，请核对结果" };
    },
    correctExternalInvoiceRecognition: async (input) => {
      await wait(160);
      const { invoice, duplicate } = this.externalCommandInvoice(input);
      if (duplicate) return { data: structuredClone(invoice), message: "重复请求已忽略" };
      if (!invoice.documentState || invoice.documentState.kind !== "EXTERNAL" || !canCorrectExternalInvoice(invoice.documentState.status)) throw new Error("当前状态不允许修改识别结果");
      const recognition = invoice.recognitionSnapshots?.at(-1);
      const file = invoice.sourceFileVersions?.at(-1);
      if (!recognition || !file) throw new Error("缺少识别结果或文件版本");
      const now = new Date().toISOString();
      const currentCorrection = currentExternalCorrection(invoice);
      const previousValues = currentCorrection?.values || recognition.fields;
      const corrections = Object.entries(input.values).filter(([field, value]) => value !== undefined && value !== previousValues[field as keyof typeof previousValues]).map(([field, value]) => ({
        field: field as keyof typeof recognition.fields,
        recognizedValue: recognition.fields[field as keyof typeof recognition.fields],
        confirmedValue: String(value ?? ""),
        correctedBy: input.creatorId,
        correctedAt: now,
      }));
      const values = { ...previousValues, ...input.values };
      if (corrections.length) {
        invoice.pageConfirmations = {
          ...invoice.pageConfirmations,
          ...(corrections.some((item) => item.field !== "PAYMENT_ACCOUNT") ? { INVOICE: undefined } : {}),
        };
      }
      let paymentDetails: Record<string, string> = {};
      try { paymentDetails = JSON.parse(values.PAYMENT_ACCOUNT || "{}"); }
      catch { throw new Error("收款信息格式不正确，请重新核对"); }
      invoice.extractedData = {
        invoiceFrom: values.PUBLISHER,
        billTo: values.ADVERTISER,
        invoiceDate: values.INVOICE_DATE,
        description: values.DESCRIPTION,
        currency: values.CURRENCY,
        total: values.AMOUNT,
        paymentDetails,
        invoiceFromMatchesProfile: normalizePaymentDetail(values.PUBLISHER) === normalizePaymentDetail(this.profileData.legalName),
        billToMatchesComets: normalizePaymentDetail(values.ADVERTISER) === normalizePaymentDetail("COMETS INTERNATIONAL LIMITED"),
      };
      invoice.confirmedSnapshots = [
        ...(invoice.confirmedSnapshots || []),
        {
          confirmationId: `confirmation:draft:${invoiceInternalIdOf(invoice)}:${invoice.version! + 1}`,
          recognitionId: recognition.recognitionId,
          fileVersionId: file.fileVersionId,
          values,
          corrections: [...(currentCorrection?.corrections || []), ...corrections],
          payoutAccountId: invoice.payoutAccountId || "",
          confirmedBy: input.creatorId,
          confirmedAt: now,
        },
      ];
      invoice.documentState = { kind: "EXTERNAL", status: "WAITING_CONFIRMATION" };
      invoice.returnReason = undefined;
      const data = this.finishExternalCommand(invoice, input.clientRequestId, {
        action: "RECOGNITION_CORRECTED",
        actor: input.creatorId,
        fromStatus: "RETURNED_FOR_CORRECTION",
        toStatus: "WAITING_CONFIRMATION",
      });
      if (corrections.length) {
        adminStore.recordCreatorAction(input.creatorId, "INVOICE", `修改 Invoice ${invoiceNumberOf(data)} 信息`);
      }
      return { data, message: "识别结果已修正" };
    },
    selectExternalInvoicePayoutAccount: async (input) => {
      await wait(160);
      const { invoice, duplicate } = this.externalCommandInvoice(input);
      if (duplicate) return { data: structuredClone(invoice), message: "重复请求已忽略" };
      if (!["WAITING_CONFIRMATION", "RETURNED_FOR_CORRECTION"].includes(invoice.documentState!.status)) {
        throw new Error("当前状态不允许更换收款账户");
      }
      const account = this.profileData.payoutAccounts.find((item) => item.id === input.payoutAccountId);
      if (!account || !isPayoutAccountUsable(account)) throw new Error("请选择已验证且可用的收款账户");
      if (account.id === invoice.payoutAccountId) throw new Error("请选择与当前不同的收款账户");
      const fromStatus = invoice.documentState!.status as ExternalInvoiceCollectionStatus;
      invoice.payoutAccountId = account.id;
      invoice.payoutSnapshot = createInvoicePayoutSnapshot(account);
      invoice.pageConfirmations = { ...invoice.pageConfirmations, PAYOUT: undefined };
      const data = this.finishExternalCommand(invoice, input.clientRequestId, {
        action: "PAYOUT_ACCOUNT_SELECTED",
        actor: input.creatorId,
        fromStatus,
        toStatus: fromStatus,
      });
      adminStore.recordCreatorAction(input.creatorId, "INVOICE", `选择 Invoice ${invoiceNumberOf(data)} 收款账户`);
      return { data, message: "收款账户已更新" };
    },
    confirmExternalInvoicePage: async (input) => {
      await wait(100);
      const { invoice, duplicate } = this.externalCommandInvoice(input);
      if (duplicate) return { data: structuredClone(invoice), message: "重复请求已忽略" };
      if (input.page !== "INVOICE" && input.page !== "PAYOUT") throw new Error("核对页不存在");
      if (invoice.documentState?.status !== "WAITING_CONFIRMATION") throw new Error("当前状态不能确认本页");
      const recognition = invoice.recognitionSnapshots?.at(-1);
      const file = invoice.sourceFileVersions?.at(-1);
      if (!recognition || !file || recognition.fileVersionId !== file.fileVersionId) throw new Error("当前文件没有有效模拟识别值");
      const account = this.profileData.payoutAccounts.find((item) => item.id === invoice.payoutAccountId);
      const issues = validateExternalInvoiceConfirmation({ invoice, profile: this.profileData, account });
      const relevant = issues.filter((issue) => input.page === "INVOICE"
        ? issue.field !== "PAYOUT_ACCOUNT"
        : issue.field === "PAYOUT_ACCOUNT");
      if (relevant.length) throw new Error(relevant.map((item) => item.message).join("；"));
      if (invoice.pageConfirmations?.[input.page]?.fileVersionId === file.fileVersionId
        && invoice.pageConfirmations[input.page]?.recognitionId === recognition.recognitionId
        && (input.page !== "PAYOUT" || invoice.pageConfirmations.PAYOUT?.payoutAccountFingerprint === (account ? payoutAccountFingerprint(account) : undefined))) throw new Error("本页已确认；修改字段后才能重新确认");
      invoice.pageConfirmations = {
        ...invoice.pageConfirmations,
        [input.page]: {
          fileVersionId: file.fileVersionId,
          recognitionId: recognition.recognitionId,
          values: structuredClone(currentExternalCorrection(invoice)?.values || recognition.fields),
          payoutAccountId: invoice.payoutAccountId || "",
          ...(input.page === "PAYOUT" && account ? {
            effectivePaymentDetails: payoutAccountPaymentDetails(account),
            payoutAccountFingerprint: payoutAccountFingerprint(account),
          } : {}),
          confirmedBy: input.creatorId,
          confirmedAt: new Date().toISOString(),
        },
      };
      const data = this.finishExternalCommand(invoice, input.clientRequestId, {
        action: "PAGE_CONFIRMED", actor: input.creatorId,
        fromStatus: "WAITING_CONFIRMATION", toStatus: "WAITING_CONFIRMATION",
        reason: input.page === "INVOICE" ? "Invoice 信息已确认" : "收款信息已确认",
      });
      adminStore.recordCreatorAction(input.creatorId, "INVOICE", `确认 ${invoiceNumberOf(data)} 的${input.page === "INVOICE" ? "Invoice 信息" : "收款信息"}`);
      return { data, message: "本页已确认" };
    },
    confirmExternalInvoice: async (input) => {
      await wait(180);
      const { invoice, duplicate } = this.externalCommandInvoice(input);
      if (duplicate) return { data: structuredClone(invoice), message: "重复请求已忽略" };
      if (invoice.documentState?.status !== "WAITING_CONFIRMATION") throw new Error("当前 Invoice 不能提交审核");
      const account = this.profileData.payoutAccounts.find((item) => item.id === invoice.payoutAccountId);
      const issues = validateExternalInvoiceConfirmation({ invoice, profile: this.profileData, account });
      if (issues.length) throw new Error(issues.map((issue) => issue.message).join("；"));
      const recognition = invoice.recognitionSnapshots!.at(-1)!;
      const file = invoice.sourceFileVersions!.at(-1)!;
      if (["INVOICE", "PAYOUT"].some((page) => {
        const record = invoice.pageConfirmations?.[page as "INVOICE" | "PAYOUT"];
        return record?.fileVersionId !== file.fileVersionId || record?.recognitionId !== recognition.recognitionId
          || (page === "PAYOUT" && (record?.payoutAccountId !== invoice.payoutAccountId
            || record?.payoutAccountFingerprint !== (account ? payoutAccountFingerprint(account) : undefined)));
      })) throw new Error("请先分别确认 Invoice 信息与收款信息");
      const current = currentExternalCorrection(invoice);
      invoice.confirmedSnapshots = [
        ...(invoice.confirmedSnapshots || []),
        {
          confirmationId: `confirmation:${invoiceInternalIdOf(invoice)}:${invoice.version! + 1}`,
          recognitionId: recognition.recognitionId,
          fileVersionId: file.fileVersionId,
          values: current?.values || recognition.fields,
          corrections: current?.corrections || [],
          payoutAccountId: invoice.payoutAccountId!,
          effectivePaymentDetails: payoutAccountPaymentDetails(account!),
          confirmedBy: input.creatorId,
          confirmedAt: new Date().toISOString(),
        },
      ];
      invoice.payoutSnapshot = createInvoicePayoutSnapshot(account!);
      invoice.documentState = { kind: "EXTERNAL", status: "WAITING_MEDIA_REVIEW" };
      const data = this.finishExternalCommand(invoice, input.clientRequestId, {
        action: "SUBMITTED",
        actor: input.creatorId,
        fromStatus: "WAITING_CONFIRMATION",
        toStatus: "WAITING_MEDIA_REVIEW",
      });
      adminStore.recordCreatorAction(input.creatorId, "INVOICE", `提交 Invoice ${invoiceNumberOf(data)} 审核`);
      this.refreshCreatorNotifications();
      return { data, message: "Invoice 已提交审核" };
    },
    resubmitExternalInvoice: async (input) => {
      await wait(180);
      const corrected = await this.invoices.correctExternalInvoiceRecognition(input);
      return this.invoices.confirmExternalInvoice({
        invoiceId: input.invoiceId,
        creatorId: input.creatorId,
        expectedVersion: corrected.data.version || input.expectedVersion + 1,
        clientRequestId: `${input.clientRequestId}:submit`,
        acknowledgement: true,
      });
    },
    listExternalInvoiceHistory: async (invoiceId, creatorId) => {
      await wait(60);
      const invoice = this.findInvoice(invoiceId);
      if (!invoice || invoice.documentState?.kind !== "EXTERNAL" || (invoice.creatorId || PRIMARY_CREATOR_ID) !== creatorId) {
        return { data: [] };
      }
      return { data: structuredClone(invoice.reviewHistory || []) };
    },
  };

  contracts: ContractService = {
    list: async (creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      await this.migrateEmbeddedInvoiceFiles();
      this.migrateEmptyDemoRecognition();
      return {
        data:
          creatorId === PRIMARY_CREATOR_ID
            ? structuredClone(this.contractData)
            : structuredClone(adminStore.getUserDetail(creatorId).contracts),
      };
    },
    get: async (id, creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      await this.migrateEmbeddedInvoiceFiles();
      this.migrateEmptyDemoRecognition();
      if (creatorId !== PRIMARY_CREATOR_ID) return { data: structuredClone(adminStore.getUserDetail(creatorId).contracts.find((contract) => contract.id === id)) };
      const item = this.contractData.find((entry) => entry.id === id);
      return { data: item ? structuredClone(item) : undefined };
    },
    signContract: async (id, actor, signature) => {
      await wait();
      if (actor.role !== "CREATOR") {
        throw new Error("管理员只读视图不能替达人签署合同");
      }
      if (actor.userId !== PRIMARY_CREATOR_ID) {
        throw new Error("当前账号无权签署该合同");
      }
      const contract = this.contractData.find((entry) => entry.id === id);
      if (!contract) throw new Error("合同不存在");
      if (contract.status !== "PENDING_SIGNATURE") {
        throw new Error("只有待签署合同可以签署");
      }
      if (!signature?.dataUrl?.startsWith("data:image/png;base64,")
        || !["DRAWN", "GENERATED"].includes(signature.method)
        || !signature.signerName?.trim()) {
        throw new Error("请完成签名并确认签署声明");
      }
      const signedAt = new Date().toISOString();
      contract.status = "ACTIVE";
      contract.signedAt = signedAt;
      contract.updatedAt = signedAt.slice(0, 10);
      contract.signatureRecord = {
        id: `contract-signature:${contract.id}:${Date.now()}`,
        actorId: actor.userId,
        actorRole: actor.role,
        signedAt,
        acknowledgement: "已确认演示合同摘要并提交签署记录",
        signature: structuredClone({ ...signature, signedAt }),
      };
      contract.history = [
        ...(contract.history || []),
        {
          id: `contract-history:${contract.id}:${Date.now()}`,
          action: "SIGNED",
          actorId: actor.userId,
          occurredAt: signedAt,
        },
      ];
      this.persistContracts();
      this.invoiceData = linkInvoicesToContracts(this.invoiceData, this.contractData, PRIMARY_CREATOR_ID);
      this.persistInvoices();
      adminStore.recordCreatorAction(actor.userId, "CONTRACT", `签署合同 ${contract.id}`);
      return { data: structuredClone(contract), message: "合同签署记录已保存" };
    },
  };

  invoices: InvoiceService = {
    getDocumentFile: async (id, creatorId) => {
      if (creatorId !== PRIMARY_CREATOR_ID) return undefined;
      const invoice = this.findInvoice(id);
      if (!invoice || (invoice.creatorId || PRIMARY_CREATOR_ID) !== creatorId) return undefined;
      const storageId = invoice.document?.storageId;
      return storageId ? readInvoiceFile(storageId) : undefined;
    },
    list: async (creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      return {
        data:
          creatorId === PRIMARY_CREATOR_ID
            ? structuredClone(sortInvoices(this.invoiceData))
            : structuredClone(sortInvoices(adminStore.getUserDetail(creatorId).invoices)),
      };
    },
    get: async (id, creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      if (creatorId !== PRIMARY_CREATOR_ID) return { data: structuredClone(adminStore.getUserDetail(creatorId).invoices.find((invoice) => invoice.id === id || invoice.invoiceNumber === id)) };
      const item = this.findInvoice(id);
      return { data: item ? structuredClone(item) : undefined };
    },
    listExternalInvoices: (...args) => this.requests.listExternalInvoices(...args),
    getExternalInvoice: (...args) => this.requests.getExternalInvoice(...args),
    uploadExternalInvoiceFile: (...args) => this.requests.uploadExternalInvoiceFile(...args),
    retryExternalInvoiceRecognition: (...args) => this.requests.retryExternalInvoiceRecognition(...args),
    correctExternalInvoiceRecognition: (...args) => this.requests.correctExternalInvoiceRecognition(...args),
    selectExternalInvoicePayoutAccount: (...args) => this.requests.selectExternalInvoicePayoutAccount(...args),
    confirmExternalInvoice: (...args) => this.requests.confirmExternalInvoice(...args),
    confirmExternalInvoicePage: (...args) => this.requests.confirmExternalInvoicePage(...args),
    resubmitExternalInvoice: (...args) => this.requests.resubmitExternalInvoice(...args),
    listExternalInvoiceHistory: (...args) => this.requests.listExternalInvoiceHistory(...args),
    signInternalInvoice: async (invoiceId, signature) => {
      await wait();
      const invoice = this.findInvoice(invoiceId);
      if (!invoice) throw new Error("Invoice 不存在");
      if (
        invoice.documentState?.kind !== "INTERNAL"
        || invoice.documentState.status !== "WAITING_SIGNATURE"
      ) throw new Error("只有待签署的 Comets内部invoice可以签署");
      if (invoice.signature) throw new Error("该 Invoice 已完成签署，不能重复操作");
      const profile = normalizePayoutProfile(this.profileData);
      const mainAccount = profile.payoutAccounts.find(
        (account) => account.id === profile.defaultPayoutAccountId,
      );
      if (!mainAccount || !isPayoutAccountUsable(mainAccount)) {
        throw new Error("请先在个人档案设置可用的主收款账户，再签署 Invoice");
      }
      invoice.payoutAccountId = mainAccount.id;
      invoice.payoutSnapshot = createInvoicePayoutSnapshot(mainAccount, signature.signedAt);
      invoice.signature = structuredClone(signature);
      invoice.documentState = { kind: "INTERNAL", status: "UNDER_REVIEW" };
      this.recordInvoiceOperation(invoice, "INTERNAL_SIGNED", "Comets内部invoice已签署并提交审核", signature.signerName);
      this.persistInvoices();
      adminStore.recordCreatorAction(invoice.creatorId || PRIMARY_CREATOR_ID, "INVOICE", `签署 Invoice ${invoiceNumberOf(invoice)}`);
      return { data: structuredClone(invoice), message: "Invoice 已签署并提交审核" };
    },
    submitFeedback: async (invoiceId, input) => {
      await wait();
      const invoice = this.findInvoice(invoiceId);
      if (!invoice) throw new Error("Invoice 不存在");
      if (
        invoice.documentState?.kind !== "INTERNAL"
        || invoice.documentState.status !== "WAITING_SIGNATURE"
      ) throw new Error("只有待签署的 Comets内部invoice可以提交信息反馈");
      if (!input.issueType.trim() || !input.details.trim()) {
        throw new Error("问题类型和问题说明不能为空");
      }
      const submittedAt = new Date().toISOString();
      invoice.feedbackRecords = [
        ...(invoice.feedbackRecords || []),
        {
          id: `feedback:${invoiceInternalIdOf(invoice)}:${Date.now()}`,
          issueType: input.issueType.trim(),
          details: input.details.trim(),
          invoiceId: invoiceInternalIdOf(invoice),
          invoiceVersion: Math.max(1, invoice.fileVersions?.at(-1)?.version || 1),
          submittedAt,
          submittedBy: input.submittedBy,
        },
      ];
      invoice.documentState = { kind: "INTERNAL", status: "CREATOR_FEEDBACK" };
      this.recordInvoiceOperation(
        invoice,
        "FEEDBACK_SUBMITTED",
        "Invoice 信息反馈已收到",
        input.submittedBy,
        `${input.issueType.trim()}：${input.details.trim()}`,
      );
      this.persistInvoices();
      return { data: structuredClone(invoice), message: "Invoice 反馈已收到" };
    },
    uploadExternal: async (input) => {
      await wait(480);
      return {
        data: this.uploadExternalFile(input, "WAITING_UPLOAD"),
        message: "Invoice 文件已上传，模拟 AI 识别完成",
      };
    },
    confirmExternal: async (invoiceId) => {
      await wait();
      const invoice = this.findInvoice(invoiceId);
      if (!invoice) throw new Error("Invoice 不存在");
      this.assertExternalConfirmationReady(invoice);
      invoice.documentState = { kind: "EXTERNAL", status: "WAITING_MEDIA_REVIEW" };
      this.recordInvoiceOperation(invoice, "EXTERNAL_CONFIRMED", "外部 Invoice 已确认并提交审核", "达人");
      this.persistInvoices();
      return { data: structuredClone(invoice), message: "Invoice 已确认并提交审核" };
    },
    correctExternal: async (invoiceId, extractedData) => {
      await wait();
      const invoice = this.findInvoice(invoiceId);
      if (!invoice) throw new Error("Invoice 不存在");
      if (
        invoice.documentState?.kind !== "EXTERNAL"
        || invoice.documentState.status !== "RETURNED_FOR_CORRECTION"
      ) throw new Error("当前 Invoice 未被退回修改");
      invoice.extractedData = structuredClone(extractedData);
      invoice.documentState = { kind: "EXTERNAL", status: "WAITING_CONFIRMATION" };
      invoice.rejectedReason = undefined;
      this.recordInvoiceOperation(invoice, "EXTERNAL_CORRECTED", "外部 Invoice 识别信息已修改", "达人");
      this.persistInvoices();
      return { data: structuredClone(invoice), message: "修改已保存，请重新确认" };
    },
    resubmitExternal: async (input) => {
      await wait(480);
      const invoice = this.findInvoice(input.invoiceId);
      const requiredStatus = invoice?.documentState?.kind === "EXTERNAL"
        && invoice.documentState.status === "RECOGNITION_FAILED"
        ? "RECOGNITION_FAILED"
        : "RETURNED_FOR_REUPLOAD";
      return {
        data: this.uploadExternalFile(input, requiredStatus),
        message: "新文件版本已上传，旧版本已保留",
      };
    },
    selectPayoutAccount: async (id, payoutAccountId) => {
      await wait(180);
      const invoice = this.findInvoice(id);
      if (!invoice) throw new Error("Invoice 不存在");
      if (invoice.documentState?.kind !== "EXTERNAL") {
        throw new Error("Comets内部invoice的收款信息由支付管理端同步，不支持修改");
      }
      if (![
        "WAITING_UPLOAD",
        "RECOGNIZING",
        "WAITING_CONFIRMATION",
        "RETURNED_FOR_CORRECTION",
        "RETURNED_FOR_REUPLOAD",
        "RECOGNITION_FAILED",
      ].includes(invoice.documentState.status)) {
        throw new Error("当前 Invoice 状态不允许更换收款账户");
      }
      const account = this.profileData.payoutAccounts.find(
        (candidate) => candidate.id === payoutAccountId,
      );
      if (!account || !isPayoutAccountUsable(account)) {
        throw new Error("请选择已验证且可用于收款的账户");
      }
      if (invoice.payoutAccountId === payoutAccountId) {
        throw new Error("请选择与当前不同的收款账户");
      }
      invoice.payoutAccountId = payoutAccountId;
      invoice.payoutSnapshot = createInvoicePayoutSnapshot(account);
      this.recordInvoiceOperation(invoice, "PAYOUT_ACCOUNT_SELECTED", "已选择新的收款账户", "达人");
      this.persistInvoices();
      return { data: structuredClone(invoice), message: "收款账户已更新" };
    },
  };

  tasks: TaskService = {
    list: async (creatorId = PRIMARY_CREATOR_ID) => {
      await wait(80);
      return {
        data: creatorId === PRIMARY_CREATOR_ID
          ? structuredClone(buildCreatorTasks(this.contractData, this.invoiceData))
          : structuredClone(buildCreatorTasks(adminStore.getUserDetail(creatorId).contracts, adminStore.getUserDetail(creatorId).invoices)),
      };
    },
  };

  payments: PaymentService = {
    requestPaymentRetry: async (invoiceId, input) => {
      await wait();
      const invoice = this.findInvoice(invoiceId);
      if (!invoice) throw new Error("Invoice 不存在");
      assertCreatorOwnsInvoice(invoice, input.submittedBy);
      if (invoice.processedClientRequestIds?.includes(input.clientRequestId)) {
        return { data: structuredClone(invoice), message: "重复请求已忽略" };
      }
      assertExpectedVersion(invoice, input.expectedVersion);
      if (invoice.documentState?.status !== "APPROVED" || invoice.paymentStatus !== "FAILED"
        || invoice.paymentRecoveryStatus !== "AWAITING_CREATOR_UPDATE") {
        throw new Error("当前 Invoice 不能申请重新打款");
      }
      const account = this.profileData.payoutAccounts.find((item) => item.id === input.payoutAccountId);
      if (!account || !isPayoutAccountUsable(account)) throw new Error("请选择当前达人已验证且可用的收款账户");
      const switched = account.id !== invoice.payoutAccountId;
      const failedSnapshot = failedPaymentSnapshot(invoice, this.paymentAttemptData).snapshot;
      const updated = !switched && payoutAccountChangedSinceSnapshot(account, failedSnapshot);
      if ((input.mode === "SWITCH_ACCOUNT") !== switched
        || (input.mode === "UPDATED_ACCOUNT") !== updated
        || (input.mode === "CONFIRM_ORIGINAL") !== (!switched && !updated)) {
        throw new Error("收款账户或资料已变化，请重新核对后提交");
      }
      const now = new Date().toISOString();
      const snapshot = createInvoicePayoutSnapshot(account, now);
      invoice.paymentRetryRequest = {
        mode: input.mode,
        payoutAccountId: account.id,
        payoutSnapshot: structuredClone(snapshot),
        requestedBy: input.submittedBy,
        requestedAt: now,
      };
      invoice.payoutAccountId = account.id;
      invoice.payoutSnapshot = snapshot;
      invoice.paymentRecoveryStatus = "PENDING_FINANCE_CONFIRMATION";
      const reason = input.mode === "SWITCH_ACCOUNT" ? "已切换已验证账户并申请重新打款"
        : input.mode === "UPDATED_ACCOUNT" ? "已更新收款资料并申请重新打款"
          : "已确认原账户未更改并申请重新打款";
      this.recordInvoiceOperation(invoice, "PAYMENT_RETRY_REQUESTED", reason, input.submittedBy);
      invoice.reviewHistory = [...(invoice.reviewHistory || []), {
        eventId: `history:${invoiceInternalIdOf(invoice)}:retry:${invoice.version || 1}`,
        action: "PAYMENT_RETRY_REQUESTED",
        actor: input.submittedBy,
        occurredAt: now,
        fromStatus: "APPROVED",
        toStatus: "APPROVED",
        reason,
      }];
      invoice.version = (invoice.version || 1) + 1;
      invoice.updatedAt = now;
      invoice.processedClientRequestIds = [...(invoice.processedClientRequestIds || []), input.clientRequestId];
      this.persistInvoices();
      adminStore.recordCreatorAction(input.submittedBy, "PAYMENT", `申请重新打款 · Invoice ${invoiceNumberOf(invoice)}`);
      return { data: structuredClone(invoice), message: "重新打款申请已提交财务复核" };
    },
    listAttempts: async (invoiceId, creatorId) => {
      await wait(50);
      if (creatorId !== PRIMARY_CREATOR_ID) {
        const detail = adminStore.getUserDetail(creatorId);
        return { data: attemptsByCreator(detail.invoices, [], creatorId).filter((attempt) => attempt.invoiceId === invoiceId) };
      }
      const invoice = this.findInvoice(invoiceId);
      if (!invoice || creatorId !== (invoice.creatorId || PRIMARY_CREATOR_ID)) return { data: [] };
      return { data: structuredClone(this.paymentAttemptData.filter((attempt) => attempt.invoiceId === invoiceInternalIdOf(invoice) && attempt.creatorId === creatorId).sort((a, b) => b.sequence - a.sequence)) };
    },
    listCreatorAttempts: async (creatorId) => {
      await wait(50);
      return { data: creatorId === PRIMARY_CREATOR_ID
        ? structuredClone(this.paymentAttemptData.filter((attempt) => attempt.creatorId === creatorId))
        : attemptsByCreator(adminStore.getUserDetail(creatorId).invoices, [], creatorId) };
    },
    approveCorrectionAndRetry: async (invoiceId, actor) => {
      await wait();
      if (actor !== "SYSTEM") throw new Error("只有支付系统可发起付款尝试");
      const invoice = this.findInvoice(invoiceId);
      if (!invoice || invoice.paymentStatus !== "FAILED" || invoice.paymentRecoveryStatus !== "PENDING_FINANCE_CONFIRMATION" || invoice.documentState?.status !== "APPROVED") throw new Error("收款资料尚未复核通过");
      const related = this.paymentAttemptData.filter((attempt) => attempt.invoiceId === invoiceInternalIdOf(invoice));
      const now = new Date().toISOString();
      const attempt: PaymentAttempt = {
        id: `attempt:${invoiceInternalIdOf(invoice)}:${Math.max(0, ...related.map((item) => item.sequence)) + 1}`,
        invoiceId: invoiceInternalIdOf(invoice),
        creatorId: invoice.creatorId || PRIMARY_CREATOR_ID,
        sequence: Math.max(0, ...related.map((item) => item.sequence)) + 1,
        channel: invoice.channel,
        payoutAccountId: invoice.payoutAccountId,
        payoutSnapshot: invoice.payoutSnapshot ? structuredClone(invoice.payoutSnapshot) : undefined,
        status: "PROCESSING",
        createdAt: now,
        updatedAt: now,
      };
      assertAttemptAllowed(this.paymentAttemptData, attempt);
      this.paymentAttemptData.push(attempt);
      invoice.paymentStatus = "PROCESSING";
      invoice.paymentRecoveryStatus = "RETRY_SUBMITTED";
      this.recordInvoiceOperation(invoice, "LEGACY_MIGRATED", "收款资料复核通过，已发起新的付款尝试", "系统");
      this.persistPaymentAttempts();
      this.persistInvoices();
      return { data: structuredClone(attempt) };
    },
    recordAttemptResult: async (attemptId, status, actor, reason) => {
      await wait();
      if (actor !== "SYSTEM") throw new Error("只有支付系统可更新付款结果");
      const attempt = this.paymentAttemptData.find((item) => item.id === attemptId);
      if (!attempt || attempt.status !== "PROCESSING") throw new Error("付款尝试不存在或已结束");
      const invoice = this.findInvoice(attempt.invoiceId);
      if (!invoice) throw new Error("Invoice 不存在");
      if (status === "PAID" && this.paymentAttemptData.some((item) => item.invoiceId === attempt.invoiceId && item.status === "PAID")) throw new Error("一张 Invoice 只能有一笔成功付款");
      attempt.status = status;
      attempt.updatedAt = new Date().toISOString();
      attempt.failureReason = status === "FAILED" ? (reason || "付款渠道返回失败") : undefined;
      invoice.paymentStatus = status;
      invoice.paymentRecoveryStatus = status === "FAILED" ? "AWAITING_CREATOR_UPDATE" : "RETRY_SUCCEEDED";
      invoice.paymentFailureReason = attempt.failureReason;
      if (status === "PAID") invoice.paymentCompletedAt = attempt.updatedAt;
      this.recordInvoiceOperation(invoice, "LEGACY_MIGRATED", status === "PAID" ? "付款成功" : "付款失败", "系统", attempt.failureReason);
      this.persistPaymentAttempts();
      this.persistInvoices();
      return { data: structuredClone(attempt) };
    },
    submitAccountCorrection: async (invoiceId, input) => {
      await wait();
      const invoice = this.findInvoice(invoiceId);
      if (!invoice) throw new Error("Invoice 不存在");
      assertCreatorOwnsInvoice(invoice, input.submittedBy);
      if (input.expectedVersion !== undefined) assertExpectedVersion(invoice, input.expectedVersion);
      if (input.clientRequestId && invoice.processedClientRequestIds?.includes(input.clientRequestId)) {
        return { data: structuredClone(invoice), message: "重复请求已忽略" };
      }
      if (invoice.documentState?.status !== "APPROVED" || invoice.paymentStatus !== "FAILED") {
        throw new Error("当前 Invoice 不在付款失败修正流程中");
      }
      if (invoice.paymentRecoveryStatus !== "AWAITING_CREATOR_UPDATE") {
        throw new Error("收款资料已提交，不能重复操作");
      }
      const currentAccountId = invoice.payoutAccountId;
      const changedAccount = Boolean(
        input.payoutAccountId && input.payoutAccountId !== currentAccountId,
      );
      const changedField = Boolean(
        invoice.paymentIssue
        && input.fieldKey === invoice.paymentIssue.fieldKey
        && input.correctedValue?.trim()
        && input.correctedValue.trim() !== invoice.paymentIssue.invalidValue,
      );
      if (!changedAccount && !changedField) {
        throw new Error("请修改错误字段或选择其他已验证收款账户后再提交");
      }
      if (changedAccount) {
        const account = this.profileData.payoutAccounts.find(
          (candidate) => candidate.id === input.payoutAccountId,
        );
        if (!account || !isPayoutAccountUsable(account)) {
          throw new Error("新收款账户必须已通过验证且处于可用状态");
        }
        invoice.payoutAccountId = account.id;
        invoice.payoutSnapshot = createInvoicePayoutSnapshot(account);
      }
      const occurredAt = new Date().toISOString();
      if (invoice.paymentIssue) invoice.paymentIssue.resolvedAt = occurredAt;
      invoice.paymentRecoveryStatus = "PENDING_FINANCE_CONFIRMATION";
      this.recordInvoiceOperation(
        invoice,
        "PAYMENT_ACCOUNT_CORRECTION_SUBMITTED",
        "收款资料已提交复核",
        input.submittedBy,
      );
      invoice.reviewHistory = [
        ...(invoice.reviewHistory || []),
        {
          eventId: `history:${invoiceInternalIdOf(invoice)}:${Date.now()}`,
          action: "PAYMENT_ACCOUNT_CORRECTION_SUBMITTED",
          actor: input.submittedBy,
          occurredAt,
          fromStatus: "APPROVED",
          toStatus: "APPROVED",
        },
      ];
      invoice.version = (invoice.version || 1) + 1;
      if (input.clientRequestId) invoice.processedClientRequestIds = [...(invoice.processedClientRequestIds || []), input.clientRequestId];
      this.persistInvoices();
      return { data: structuredClone(invoice), message: "收款资料已提交复核" };
    },
  };

  payout: PayoutService = {
    listTransferMethods: async (condition) => {
      await wait(140);
      return {
        data: buildAirwallexMockTransferMethods(condition),
      };
    },
    getFormSchema: async (condition) => {
      await wait(360);
      return {
        data: normalizeAirwallexFormSchema(
          buildAirwallexMockSchema(condition),
        ),
      };
    },
    validateBeneficiary: async (schema, values) => {
      await wait(300);
      const fieldErrors = validateAirwallexSchemaValues(schema, values);
      if (Object.keys(fieldErrors).length > 0) {
        throw new AirwallexBeneficiaryValidationError(fieldErrors);
      }
      return { data: { valid: true } };
    },
    createBeneficiary: async (condition) => {
      await wait(520);
      const suffix = `${condition.bankCountryCode}${Date.now().toString().slice(-8)}`;
      return {
        data: {
          beneficiaryId: `bene_${suffix.toLowerCase()}`,
          status: "VALIDATED",
        },
        message: "Airwallex Beneficiary 已创建",
      };
    },
  };

  adminUsers: AdminUserService = {
    list: async (filters = {}) => {
      await wait(120);
      return { data: adminStore.listUsers(filters) };
    },
    get: async (id) => {
      await wait(120);
      return { data: managementCreatorDetail(adminStore.getUserDetail(id, id === PRIMARY_CREATOR_ID ? {
        contracts: this.contractData, invoices: this.invoiceData, profile: this.profileData,
      } : undefined)) };
    },
    create: async (input, actorId) => {
      await wait();
      return {
        data: adminStore.createUser(input, actorId),
        message: input.mode === "INVITE" ? "邀请邮件已模拟发送" : "账号已创建",
      };
    },
    setStatus: async (ids, status, actorId, reason = "") => {
      await wait();
      return {
        data: adminStore.setStatus(ids, status, actorId, reason),
        message: status === "ACTIVE" ? "账号已启用" : "账号已停用",
      };
    },
    updateProfile: async (id, patch, actorId) => {
      await wait();
      const detail = adminStore.updateProfile(id, patch, actorId);
      if (id === "CREATOR-001" && detail.profile) {
        this.profileData = structuredClone(detail.profile);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.profileData));
        }
      }
      return { data: managementCreatorDetail(detail), message: "用户档案已更新" };
    },
    updateVerification: async (id, status, actorId, reason = "") => {
      await wait();
      return {
        data: managementCreatorDetail(adminStore.updateVerification(id, status, actorId, reason)),
        message: status === "VERIFIED" ? "认证已通过" : "认证状态已更新",
      };
    },
    resetPassword: async (id, actorId) => {
      await wait();
      adminStore.resetPassword(id, actorId);
      return { data: { sent: true }, message: "密码重置邮件已模拟发送" };
    },
    revealSensitive: async (id, fieldKey, reason, actorId) => {
      await wait();
      return {
        data: adminStore.revealSensitive(id, fieldKey, reason, actorId),
        message: "本次查看已记录到审计日志",
      };
    },
    exportMasked: async (filters, actorId) => {
      await wait(120);
      return {
        data: adminStore.exportMasked(filters, actorId),
        message: "脱敏用户清单已生成",
      };
    },
  };

  adminBusiness: AdminBusinessDataService = {
    list: async () => {
      await wait(120);
      const rows = adminStore.listAllBusinessData({ contracts: this.contractData, invoices: this.invoiceData, profile: this.profileData });
      return { data: {
        ...rows,
        contracts: rows.contracts.map((entry) => ({ ...entry, record: { ...entry.record, documentUrl: "" } })),
        invoices: rows.invoices.map((entry) => ({ ...entry, record: maskedCreatorDetail({ account: adminStore.listUsers().find((user) => user.id === entry.creator.id)!, contracts: [], invoices: [entry.record], requests: [], corrections: [], notifications: [], loginHistory: [] }).invoices[0] })),
      } };
    },
  };

  corrections: CorrectionService = {
    list: async (userId) => {
      await wait(100);
      return { data: adminStore.listCorrections(userId) };
    },
    create: async (userId, fieldKey, fieldLabel, reason, actorId) => {
      await wait();
      return {
        data: managementCreatorDetail(adminStore.createCorrection(
          userId,
          fieldKey,
          fieldLabel,
          reason,
          actorId,
        )),
        message: "修改要求已通过站内通知和模拟邮件发送",
      };
    },
  };

  audit: AuditService = {
    list: async () => {
      await wait(100);
      return { data: adminStore.listAudits() };
    },
  };

  adminSettings: AdminSettingsService = {
    get: async () => {
      await wait(100);
      return { data: adminStore.getSettings() };
    },
    save: async (settings, actorId) => {
      await wait();
      return {
        data: adminStore.saveSettings(settings, actorId),
        message: "用户管理配置已保存",
      };
    },
  };

  notifications: NotificationService = {
    list: async (userId = PRIMARY_CREATOR_ID) => {
      await wait(60);
      return {
        data: userId === PRIMARY_CREATOR_ID
          ? structuredClone(this.creatorNotificationData)
          : [],
      };
    },
    markRead: async (id, userId = PRIMARY_CREATOR_ID) => {
      await wait(40);
      if (userId !== PRIMARY_CREATOR_ID) throw new Error("通知不存在");
      const item = this.creatorNotificationData.find((candidate) => candidate.id === id);
      if (!item) throw new Error("通知不存在");
      item.read = true;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          CREATOR_NOTIFICATION_STORAGE_KEY,
          JSON.stringify(this.creatorNotificationData),
        );
      }
      return { data: structuredClone(item) };
    },
    markAllRead: async (userId = PRIMARY_CREATOR_ID) => {
      await wait(40);
      if (userId === PRIMARY_CREATOR_ID) {
        this.creatorNotificationData.forEach((item) => { item.read = true; });
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            CREATOR_NOTIFICATION_STORAGE_KEY,
            JSON.stringify(this.creatorNotificationData),
          );
        }
      }
      return { data: structuredClone(this.creatorNotificationData) };
    },
    getUnreadCount: async (userId = PRIMARY_CREATOR_ID) => {
      await wait(20);
      return {
        data: userId === PRIMARY_CREATOR_ID
          ? this.creatorNotificationData.filter((item) => !item.read).length
          : 0,
      };
    },
  };

  adminNotifications: AdminNotificationService = {
    list: async (userId) => {
      await wait(100);
      return { data: adminStore.listNotifications(userId) };
    },
  };

  externalBusinessData: ExternalBusinessDataAdapter = {
    listIssues: async () => {
      await wait(100);
      return { data: adminStore.listSyncIssues() };
    },
    upsert: async (event) => {
      await wait(100);
      return { data: adminStore.upsertExternalEvent(event) };
    },
  };
}

const rawServices = new MockApiAdapter();

/** Browser mock boundary: the authenticated actor is recovered from the store, never from caller input. */
const browserSession = () => {
  if (typeof window === "undefined") throw new Error("需要有效登录会话");
  let sessionId = "";
  try { sessionId = (JSON.parse(window.localStorage.getItem("comets-creator-session") || "null") as Session | null)?.sessionId || ""; }
  catch { /* Invalid local storage is not authorization. */ }
  const session = adminStore.restoreSession(sessionId);
  if (!session) throw new Error("登录会话已失效，请重新登录");
  return session;
};

function creatorGuard<T extends object>(module: T, writeMethods: string[], ownerAt: (method: string, args: unknown[], actor: Session) => string = (_method, _args, actor) => actor.userId): T {
  return new Proxy(module, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver) as unknown;
      if (typeof original !== "function") return original;
      return (...args: unknown[]) => {
        const actor = browserSession();
        const method = String(property);
        const creatorId = ownerAt(method, args, actor);
        rawServices.creatorScope.assertWrite(actor.sessionId, creatorId);
        if (writeMethods.includes(method) && (module === rawServices.invoices || module === rawServices.requests)) {
          const first = args[0] as string | { invoiceId?: string };
          rawServices.creatorScope.assertInvoiceWrite(actor.sessionId, creatorId, typeof first === "string" ? first : first?.invoiceId || "");
        }
        if (method === "approveCorrectionAndRetry" || method === "recordAttemptResult") throw new Error("付款执行只能由外部系统完成");
        if (!writeMethods.includes(method)) return (original as (...values: unknown[]) => unknown)(...args);
        return (original as (...values: unknown[]) => unknown)(...args);
      };
    },
  });
}

function administratorGuard<T extends object>(module: T, actorAt: Record<string, number> = {}): T {
  return new Proxy(module, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver) as unknown;
      if (typeof original !== "function") return original;
      return (...args: unknown[]) => {
        const actor = browserSession();
        if (actor.role !== "ADMIN") throw new Error("仅管理员可访问用户管理资料");
        if (String(property) === "upsert") throw new Error("外部业务数据只能由外部同步适配器写入");
        const index = actorAt[String(property)];
        if (index !== undefined && args[index] !== actor.userId) throw new Error("管理员操作人身份无效");
        return (original as (...values: unknown[]) => unknown)(...args);
      };
    },
  });
}

const secureInvoices = creatorGuard(rawServices.invoices, [
  "signInternalInvoice", "submitFeedback", "uploadExternal", "confirmExternal", "correctExternal",
  "resubmitExternal", "selectPayoutAccount", "uploadExternalInvoiceFile", "retryExternalInvoiceRecognition",
  "correctExternalInvoiceRecognition", "selectExternalInvoicePayoutAccount", "confirmExternalInvoice",
  "confirmExternalInvoicePage", "resubmitExternalInvoice",
], (method, args, actor) => {
  if (["list", "listExternalInvoices"].includes(method)) return String(args[0] || actor.userId);
  if (["get", "getDocumentFile", "getExternalInvoice", "listExternalInvoiceHistory"].includes(method)) return String(args[1] || actor.userId);
  const command = args[0] as { creatorId?: string } | undefined;
  return command?.creatorId || actor.userId;
});

const adminCorrections = administratorGuard(rawServices.corrections, { create: 4 });
const scopedCorrections: CorrectionService = {
  list: (userId) => {
    const actor = browserSession();
    if (actor.role === "ADMIN") {
      if (!adminStore.listUsers({ role: "CREATOR" }).some((user) => user.id === userId)) {
        throw new Error("达人不存在或无权查看");
      }
      return adminCorrections.list(userId);
    }
    rawServices.creatorScope.assertWrite(actor.sessionId, userId);
    return rawServices.corrections.list(userId);
  },
  create: (...args) => adminCorrections.create(...args),
};

export const services: Services = {
  ...rawServices,
  profile: creatorGuard(rawServices.profile, ["save", "addSocialAccount"], (method, args, actor) => method === "get" ? String(args[0] || actor.userId) : method === "addSocialAccount" ? (args[0] as AddSocialAccountInput).creatorId : (args[0] as UserProfile).id),
  contracts: creatorGuard(rawServices.contracts, ["signContract"], (method, args, actor) => method === "list" ? String(args[0] || actor.userId) : method === "get" ? String(args[1] || actor.userId) : actor.userId),
  invoices: secureInvoices,
  requests: creatorGuard(rawServices.requests, ["uploadExternalInvoiceFile", "retryExternalInvoiceRecognition", "correctExternalInvoiceRecognition", "selectExternalInvoicePayoutAccount", "confirmExternalInvoice", "confirmExternalInvoicePage", "resubmitExternalInvoice"], (method, args, actor) => ["list", "listExternalInvoices"].includes(method) ? String(args[0] || actor.userId) : ["get", "getExternalInvoice", "listExternalInvoiceHistory"].includes(method) ? String(args[1] || actor.userId) : (args[0] as { creatorId?: string } | undefined)?.creatorId || actor.userId),
  tasks: creatorGuard(rawServices.tasks, [], (_method, args, actor) => String(args[0] || actor.userId)),
  payments: creatorGuard(rawServices.payments, ["submitAccountCorrection", "requestPaymentRetry"], (method, args, actor) => method === "listAttempts" ? String(args[1] || actor.userId) : method === "listCreatorAttempts" ? String(args[0] || actor.userId) : method === "requestPaymentRetry" ? (args[1] as PaymentRetryRequestInput).submittedBy : actor.userId),
  notifications: creatorGuard(rawServices.notifications, ["markRead", "markAllRead"], (method, args, actor) => method === "markRead" ? String(args[1] || actor.userId) : String(args[0] || actor.userId)),
  adminUsers: administratorGuard(rawServices.adminUsers, { create: 1, setStatus: 2, updateProfile: 2, updateVerification: 2, resetPassword: 1, revealSensitive: 3, exportMasked: 1 }),
  adminBusiness: administratorGuard(rawServices.adminBusiness),
  corrections: scopedCorrections,
  audit: administratorGuard(rawServices.audit),
  adminSettings: administratorGuard(rawServices.adminSettings, { save: 1 }),
  adminNotifications: administratorGuard(rawServices.adminNotifications),
  externalBusinessData: administratorGuard(rawServices.externalBusinessData),
};
