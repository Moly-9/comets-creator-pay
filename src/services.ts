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
} from "./creator-display";
import {
  assertCreatorOwnsInvoice,
  assertExpectedVersion,
  recognitionFieldsFromExtracted,
  validateExternalInvoiceConfirmation,
} from "./invoices/external/workflow";
import type {
  ConfirmExternalInvoiceCommand,
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
  CreatorNotification,
  CreatorTask,
  CorrectionRequest,
  ExternalInvoiceUploadInput,
  ExternalInvoiceCollectionStatus,
  ExternalBusinessEvent,
  ExternalSyncIssue,
  Invoice,
  InvoiceSignature,
  InvoiceStatus,
  InvoiceExtractedData,
  InvoiceFeedbackInput,
  InvoiceUploadInput,
  PaymentAccountCorrectionInput,
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
const CREATOR_NOTIFICATION_STORAGE_KEY = "comets-creator-notifications-v2";

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
}

export interface AuthService {
  login(email: string, password: string): Promise<ApiResult<Session>>;
  register(name: string, email: string, password: string): Promise<ApiResult<Session>>;
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
  ): Promise<ApiResult<Contract>>;
}

export interface InvoiceService {
  list(creatorId?: string): Promise<ApiResult<Invoice[]>>;
  get(id: string, creatorId?: string): Promise<ApiResult<Invoice | undefined>>;
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
  resubmitExternalInvoice(input: ResubmitExternalInvoiceCommand): Promise<ApiResult<Invoice>>;
  listExternalInvoiceHistory(invoiceId: string, creatorId: string): Promise<ApiResult<ExternalInvoiceReviewEvent[]>>;
}

export interface TaskService {
  list(creatorId?: string): Promise<ApiResult<CreatorTask[]>>;
}

export interface PaymentService {
  submitAccountCorrection(
    invoiceId: string,
    input: PaymentAccountCorrectionInput,
  ): Promise<ApiResult<Invoice>>;
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
    reason: string,
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
  swift_code: account.swiftCode,
  iban: account.schemaValues.iban || "",
});

const normalizePaymentDetail = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const compareInvoicePaymentDetails = (
  recognized: Record<string, string>,
  account: PayoutAccount,
) => {
  const accountDetails = payoutAccountPaymentDetails(account);
  const compared = Object.entries(recognized)
    .filter(([, value]) => value.trim())
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
    merged: { ...accountDetails, ...recognized },
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
      recommended: false,
    },
    {
      value: "SWIFT",
      label: "国际电汇 / SWIFT",
      available: true,
      estimatedFeeAmount: (usesLocalCurrency ? 7.5 : 6) + entitySurcharge,
      feeCurrency: condition.accountCurrency,
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
    ],
  };
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

  return [
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
  ];
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
  private invoiceData = this.readInvoices();
  private contractData = this.readContracts();
  private profileData = this.readProfile();
  private creatorNotificationData = this.readCreatorNotifications();

  constructor() {
    adminStore.syncProfile(this.profileData, false);
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
      window.localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(prepared));
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
          return {
            ...structuredClone(invoice),
            ...storedInvoice,
            payoutSnapshot: storedInvoice?.payoutSnapshot
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
      return seedContracts.map((contract) => ({
        ...structuredClone(contract),
        ...storedById.get(contract.id),
        projectId: contract.projectId,
        projectName: contract.projectName,
        brand: contract.brand,
      }));
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
      window.localStorage.setItem(
        CREATOR_NOTIFICATION_STORAGE_KEY,
        JSON.stringify(this.creatorNotificationData),
      );
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

  private mockRecognizedData(invoice: Invoice) {
    const expected = invoice.expectedValues!;
    const account = this.profileData.payoutAccounts.find(
      (candidate) => candidate.id === invoice.payoutAccountId,
    );
    return {
      invoiceFrom: expected.creatorLegalName,
      billTo: expected.billTo,
      invoiceDate: new Date().toISOString().slice(0, 10),
      currency: expected.currency,
      total: expected.amount,
      paymentDetails: account ? payoutAccountPaymentDetails(account) : {},
      invoiceFromMatchesProfile: true,
      billToMatchesComets: true,
    } satisfies InvoiceExtractedData;
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
      `OCR 识别完成 · 文件版本 v${version}`,
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
    if (!invoice.extractedData) throw new Error("Invoice 尚未生成 OCR 识别结果");
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
    if (!compareInvoicePaymentDetails(extracted.paymentDetails, account).matches) {
      throw new Error("Invoice 收款信息与所选账户不一致");
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
    register: async (name, email, password) => {
      await wait();
      return { data: adminStore.register(name, email, password) };
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
      this.profileData = structuredClone(normalizedProfile);
      adminStore.syncProfile(this.profileData);
      if (typeof window !== "undefined" && normalizedProfile.id === "CREATOR-001") {
        window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.profileData));
      }
      return { data: structuredClone(this.profileData), message: "个人档案已保存" };
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
    | "resubmitExternalInvoice"
    | "listExternalInvoiceHistory"
  > = {
    list: async (creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      return {
        data:
          creatorId === PRIMARY_CREATOR_ID
            ? structuredClone(seedRequests)
            : [],
      };
    },
    get: async (id, creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      if (creatorId !== PRIMARY_CREATOR_ID) return { data: undefined };
      const item = seedRequests.find((entry) => entry.id === id);
      return { data: item ? structuredClone(item) : undefined };
    },
    listExternalInvoices: async (creatorId) => {
      await wait(80);
      return {
        data: creatorId === PRIMARY_CREATOR_ID
          ? structuredClone(this.invoiceData.filter((item) => item.documentState?.kind === "EXTERNAL"))
          : [],
      };
    },
    getExternalInvoice: async (invoiceId, creatorId) => {
      await wait(80);
      const invoice = this.findInvoice(invoiceId);
      if (!invoice || invoice.documentState?.kind !== "EXTERNAL") return { data: undefined };
      if ((invoice.creatorId || PRIMARY_CREATOR_ID) !== creatorId) return { data: undefined };
      return { data: structuredClone(invoice) };
    },
    uploadExternalInvoiceFile: async (input) => {
      await wait(240);
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
      const account = this.profileData.payoutAccounts.find((item) => item.id === input.payoutAccountId);
      if (!account || !isPayoutAccountUsable(account)) throw new Error("请选择已验证且可用的收款账户");
      const previous = invoice.sourceFileVersions?.at(-1);
      const version = (previous?.version || 0) + 1;
      const uploadedAt = new Date().toISOString();
      const fileVersionId = `file:${invoiceInternalIdOf(invoice)}:v${version}`;
      invoice.sourceFileVersions = [
        ...(invoice.sourceFileVersions || []),
        {
          ...structuredClone(input.file),
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
      invoice.fileVersions = invoice.sourceFileVersions.map((file) => ({
        ...file,
        demoHash: file.fileHash,
        supersedesFileId: file.supersedesFileVersionId,
      }));
      invoice.document = structuredClone(input.file);
      invoice.payoutAccountId = account.id;
      invoice.payoutSnapshot = createInvoicePayoutSnapshot(account, uploadedAt);
      invoice.extractedData = undefined;
      invoice.confirmedSnapshots = [];
      const fromStatus = state.status;
      invoice.documentState = { kind: "EXTERNAL", status: "RECOGNIZING" };
      const data = this.finishExternalCommand(invoice, input.clientRequestId, {
        action: "FILE_UPLOADED",
        actor: input.creatorId,
        fromStatus,
        toStatus: "RECOGNIZING",
      });
      return { data, message: "文件已上传，正在识别 Invoice 信息" };
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
        invoice.returnReason = "Mock OCR 无法识别当前文件，请重新识别或上传清晰文件。";
        const data = this.finishExternalCommand(invoice, input.clientRequestId, {
          action: "RECOGNITION_FAILED",
          actor: "Mock OCR",
          fromStatus,
          toStatus: "RECOGNITION_FAILED",
          reason: invoice.returnReason,
        });
        this.refreshCreatorNotifications();
        return { data, message: "识别失败" };
      }
      const extractedData = this.mockRecognizedData(invoice);
      invoice.extractedData = extractedData;
      invoice.recognitionSnapshots = [
        ...(invoice.recognitionSnapshots || []),
        {
          recognitionId: `recognition:${invoiceInternalIdOf(invoice)}:${file.version}`,
          fileVersionId: file.fileVersionId,
          engineVersion: "mock-ocr-v1",
          recognizedAt: new Date().toISOString(),
          fields: recognitionFieldsFromExtracted(invoiceNumberOf(invoice), extractedData),
          extractedData,
        },
      ];
      invoice.documentState = { kind: "EXTERNAL", status: "WAITING_CONFIRMATION" };
      invoice.returnReason = undefined;
      const data = this.finishExternalCommand(invoice, input.clientRequestId, {
        action: "RECOGNITION_SUCCEEDED",
        actor: "Mock OCR",
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
      if (!invoice.documentState || invoice.documentState.kind !== "EXTERNAL" || ![
        "WAITING_CONFIRMATION",
        "RETURNED_FOR_CORRECTION",
      ].includes(invoice.documentState.status)) throw new Error("当前状态不允许修改识别结果");
      const recognition = invoice.recognitionSnapshots?.at(-1);
      const file = invoice.sourceFileVersions?.at(-1);
      if (!recognition || !file) throw new Error("缺少识别结果或文件版本");
      const now = new Date().toISOString();
      const corrections = Object.entries(input.values).filter(([, value]) => value !== undefined).map(([field, value]) => ({
        field: field as keyof typeof recognition.fields,
        recognizedValue: recognition.fields[field as keyof typeof recognition.fields],
        confirmedValue: String(value ?? ""),
        correctedBy: input.creatorId,
        correctedAt: now,
      }));
      const values = { ...recognition.fields, ...input.values };
      invoice.confirmedSnapshots = [
        ...(invoice.confirmedSnapshots || []),
        {
          confirmationId: `confirmation:draft:${invoiceInternalIdOf(invoice)}:${invoice.version! + 1}`,
          recognitionId: recognition.recognitionId,
          fileVersionId: file.fileVersionId,
          values,
          corrections,
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
      return { data, message: "识别结果已修正" };
    },
    selectExternalInvoicePayoutAccount: async (input) => {
      await wait(160);
      const { invoice, duplicate } = this.externalCommandInvoice(input);
      if (duplicate) return { data: structuredClone(invoice), message: "重复请求已忽略" };
      if (!["WAITING_UPLOAD", "WAITING_CONFIRMATION", "RETURNED_FOR_CORRECTION", "RETURNED_FOR_REUPLOAD", "RECOGNITION_FAILED"].includes(invoice.documentState!.status)) {
        throw new Error("当前状态不允许更换收款账户");
      }
      const account = this.profileData.payoutAccounts.find((item) => item.id === input.payoutAccountId);
      if (!account || !isPayoutAccountUsable(account)) throw new Error("请选择已验证且可用的收款账户");
      if (account.id === invoice.payoutAccountId) throw new Error("请选择与当前不同的收款账户");
      const fromStatus = invoice.documentState!.status as ExternalInvoiceCollectionStatus;
      invoice.payoutAccountId = account.id;
      invoice.payoutSnapshot = createInvoicePayoutSnapshot(account);
      const data = this.finishExternalCommand(invoice, input.clientRequestId, {
        action: "PAYOUT_ACCOUNT_SELECTED",
        actor: input.creatorId,
        fromStatus,
        toStatus: fromStatus,
      });
      return { data, message: "收款账户已更新" };
    },
    confirmExternalInvoice: async (input) => {
      await wait(180);
      const { invoice, duplicate } = this.externalCommandInvoice(input);
      if (duplicate) return { data: structuredClone(invoice), message: "重复请求已忽略" };
      if (input.acknowledgement !== true) throw new Error("请先确认 Invoice 核对声明");
      if (invoice.documentState?.status !== "WAITING_CONFIRMATION") throw new Error("当前 Invoice 不能提交审核");
      const account = this.profileData.payoutAccounts.find((item) => item.id === invoice.payoutAccountId);
      const issues = validateExternalInvoiceConfirmation({ invoice, profile: this.profileData, account });
      if (issues.length) throw new Error(issues.map((issue) => issue.message).join("；"));
      const recognition = invoice.recognitionSnapshots!.at(-1)!;
      const file = invoice.sourceFileVersions!.at(-1)!;
      const current = invoice.confirmedSnapshots?.at(-1);
      invoice.confirmedSnapshots = [
        ...(invoice.confirmedSnapshots || []),
        {
          confirmationId: `confirmation:${invoiceInternalIdOf(invoice)}:${invoice.version! + 1}`,
          recognitionId: recognition.recognitionId,
          fileVersionId: file.fileVersionId,
          values: current?.values || recognition.fields,
          corrections: current?.corrections || [],
          payoutAccountId: invoice.payoutAccountId!,
          confirmedBy: input.creatorId,
          confirmedAt: new Date().toISOString(),
        },
      ];
      invoice.documentState = { kind: "EXTERNAL", status: "WAITING_MEDIA_REVIEW" };
      const data = this.finishExternalCommand(invoice, input.clientRequestId, {
        action: "SUBMITTED",
        actor: input.creatorId,
        fromStatus: "WAITING_CONFIRMATION",
        toStatus: "WAITING_MEDIA_REVIEW",
      });
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
      return {
        data:
          creatorId === PRIMARY_CREATOR_ID
            ? structuredClone(this.contractData)
            : [],
      };
    },
    get: async (id, creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      if (creatorId !== PRIMARY_CREATOR_ID) return { data: undefined };
      const item = this.contractData.find((entry) => entry.id === id);
      return { data: item ? structuredClone(item) : undefined };
    },
    signContract: async (id, actor) => {
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
      return { data: structuredClone(contract), message: "合同签署记录已保存" };
    },
  };

  invoices: InvoiceService = {
    list: async (creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      return {
        data:
          creatorId === PRIMARY_CREATOR_ID
            ? structuredClone(sortInvoices(this.invoiceData))
            : [],
      };
    },
    get: async (id, creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      if (creatorId !== PRIMARY_CREATOR_ID) return { data: undefined };
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
      invoice.signature = structuredClone(signature);
      invoice.documentState = { kind: "INTERNAL", status: "UNDER_REVIEW" };
      this.recordInvoiceOperation(invoice, "INTERNAL_SIGNED", "Comets内部invoice已签署并提交审核", signature.signerName);
      this.persistInvoices();
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
        message: "Invoice 文件已上传，OCR 识别完成",
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
          : [],
      };
    },
  };

  payments: PaymentService = {
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
      return { data: adminStore.getUserDetail(id) };
    },
    create: async (input, actorId) => {
      await wait();
      return {
        data: adminStore.createUser(input, actorId),
        message: input.mode === "INVITE" ? "邀请邮件已模拟发送" : "账号已创建",
      };
    },
    setStatus: async (ids, status, actorId, reason) => {
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
      return { data: detail, message: "用户档案已更新" };
    },
    updateVerification: async (id, status, actorId, reason = "") => {
      await wait();
      return {
        data: adminStore.updateVerification(id, status, actorId, reason),
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
      return { data: adminStore.listAllBusinessData() };
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
        data: adminStore.createCorrection(
          userId,
          fieldKey,
          fieldLabel,
          reason,
          actorId,
        ),
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

export const services = new MockApiAdapter();
