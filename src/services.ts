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
  normalizePayoutProfile,
  syncPayoutAccounts,
} from "./payout-accounts";
import type {
  AccountStatus,
  AdminBusinessData,
  AdminSettings,
  AdminUserDetail,
  AirwallexBeneficiaryResult,
  AirwallexFormSchema,
  AirwallexSchemaCondition,
  AirwallexSchemaField,
  ApiResult,
  AuditEvent,
  Contract,
  CorrectionRequest,
  ExternalBusinessEvent,
  ExternalSyncIssue,
  Invoice,
  InvoiceSignature,
  InvoiceStatus,
  InvoiceUploadInput,
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

export const getSocialAccountName = (profileUrl: string, fallback: string) => {
  try {
    const parsedUrl = new URL(profileUrl);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const accountName = decodeURIComponent(pathSegments.at(-1) || "").trim();

    if (!accountName) return fallback;
    return accountName.startsWith("@") ? accountName : `@${accountName}`;
  } catch {
    return fallback;
  }
};

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
}

export interface InvoiceService {
  list(creatorId?: string): Promise<ApiResult<Invoice[]>>;
  get(id: string, creatorId?: string): Promise<ApiResult<Invoice | undefined>>;
  upload(input: InvoiceUploadInput): Promise<ApiResult<Invoice>>;
  selectPayoutAccount(id: string, payoutAccountId: string): Promise<ApiResult<Invoice>>;
  transition(id: string, status: InvoiceStatus): Promise<ApiResult<Invoice>>;
  resolvePaymentIssue(id: string, correctedValue: string): Promise<ApiResult<Invoice>>;
  sign(id: string, signature: InvoiceSignature): Promise<ApiResult<Invoice>>;
}

export interface PayoutService {
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

export interface NotificationService {
  list(userId: string): Promise<ApiResult<AdminUserDetail["notifications"]>>;
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
  payout: PayoutService;
  adminUsers: AdminUserService;
  adminBusiness: AdminBusinessDataService;
  corrections: CorrectionService;
  audit: AuditService;
  adminSettings: AdminSettingsService;
  notifications: NotificationService;
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
    return seededPaymentFailure
      ? structuredClone(seededPaymentFailure)
      : { ...invoice, status: "PAYMENT_FAILED" };
  }
  if (legacyStatus !== "REJECTED") {
    return invoice as Invoice;
  }
  if (invoice.id === "INV-240711-C") {
    const { rejectedReason: _rejectedReason, ...current } = invoice;
    return {
      ...current,
      status: "PENDING_REVIEW",
      updatedAt: "07-28 15:40",
    };
  }
  return { ...invoice, status: "PAYMENT_FAILED" };
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
            { label: "付款账户 / Payment", value: "PAYMENT" },
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
  private profileData = this.readProfile();

  constructor() {
    adminStore.syncProfile(this.profileData, false);
  }

  private migratePayoutAccounts(profile: UserProfile) {
    const normalized = normalizePayoutProfile(profile);
    if (
      typeof window === "undefined" ||
      normalized.id !== PRIMARY_CREATOR_ID ||
      profile.payoutAccountsVersion === 2
    ) {
      return normalized;
    }
    if (normalized.payoutAccounts.length > 1) return normalized;
    const extraAccounts = initialProfile.payoutAccounts.filter(
      (seedAccount) =>
        seedAccount.id !== initialProfile.defaultPayoutAccountId &&
        !normalized.payoutAccounts.some(
          (account) => account.id === seedAccount.id,
        ),
    );
    return syncPayoutAccounts(
      normalized,
      [...normalized.payoutAccounts, ...structuredClone(extraAccounts)],
      normalized.defaultPayoutAccountId,
    );
  }

  private readInvoices() {
    if (typeof window === "undefined") return sortInvoices(structuredClone(seedInvoices));
    try {
      const stored = window.localStorage.getItem(INVOICE_STORAGE_KEY);
      if (!stored) return sortInvoices(structuredClone(seedInvoices));

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
        (invoice) => ({
          ...structuredClone(invoice),
          ...storedById.get(invoice.id),
          projectId: invoice.projectId,
          projectName: invoice.projectName,
          brand: invoice.brand,
          channel: "Airwallex" as const,
        }),
      );
      const customInvoices = storedInvoices.filter(
        (invoice) => !seedInvoices.some((seed) => seed.id === invoice.id),
      ).map((invoice) => ({ ...invoice, channel: "Airwallex" as const }));
      return sortInvoices(
        [...mergedSeedInvoices, ...customInvoices].map(migrateLegacyInvoiceState),
      );
    } catch {
      return sortInvoices(structuredClone(seedInvoices));
    }
  }

  private readProfile() {
    if (typeof window === "undefined") return structuredClone(initialProfile);
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
      return structuredClone(initialProfile);
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

  requests: RequestProjectService = {
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
  };

  contracts: ContractService = {
    list: async (creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      return {
        data:
          creatorId === PRIMARY_CREATOR_ID
            ? structuredClone(seedContracts)
            : [],
      };
    },
    get: async (id, creatorId = PRIMARY_CREATOR_ID) => {
      await wait(120);
      if (creatorId !== PRIMARY_CREATOR_ID) return { data: undefined };
      const item = seedContracts.find((entry) => entry.id === id);
      return { data: item ? structuredClone(item) : undefined };
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
      const item = this.invoiceData.find((entry) => entry.id === id);
      return { data: item ? structuredClone(item) : undefined };
    },
    upload: async (input) => {
      await wait(480);
      const issuedAt = input.extractedData.invoiceDate;
      const id = createInvoiceId(issuedAt, this.invoiceData);
      const now = new Date().toISOString();
      const invoice: Invoice = {
        id,
        projectId: input.projectId,
        projectName: input.projectName,
        brand: input.brand,
        channel: "Airwallex",
        amount: `${input.extractedData.currency} ${input.extractedData.total}`,
        status: "PENDING_CONFIRMATION",
        issuedAt,
        updatedAt: "刚刚",
        invoiceType: input.invoiceType,
        payoutAccountId: input.payoutAccountId,
        document: structuredClone(input.file),
        extractedData: structuredClone(input.extractedData),
        processHistory: [{
          id: `event-${Date.now()}`,
          status: "PENDING_CONFIRMATION",
          label: "上传待确认",
          actor: "达人",
          occurredAt: now,
        }],
      };
      this.invoiceData = sortInvoices([invoice, ...this.invoiceData]);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(this.invoiceData));
      }
      return { data: structuredClone(invoice), message: "Invoice 已上传，等待确认" };
    },
    selectPayoutAccount: async (id, payoutAccountId) => {
      await wait(180);
      const invoice = this.invoiceData.find((item) => item.id === id);
      if (!invoice) throw new Error("Invoice 不存在");
      invoice.payoutAccountId = payoutAccountId;
      invoice.updatedAt = "刚刚";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(this.invoiceData));
      }
      return { data: structuredClone(invoice), message: "付款账户已更新" };
    },
    transition: async (id, status) => {
      await wait();
      const invoice = this.invoiceData.find((item) => item.id === id);
      if (!invoice) throw new Error("Invoice 不存在");
      const isSubmittingPaymentCorrection =
        invoice.status === "PAYMENT_FAILED" && status === "PENDING_REVIEW";
      if (invoice.status === "PAYMENT_FAILED") {
        if (!isSubmittingPaymentCorrection) {
          throw new Error("付款信息修正后必须先提交资料审核");
        }
        if (!invoice.paymentIssue?.resolvedAt) {
          throw new Error("请先修改错误的付款信息并完成校验");
        }
      }
      invoice.status = status;
      invoice.updatedAt = "刚刚";
      const statusLabels: Record<InvoiceStatus, string> = {
        PENDING_CONFIRMATION: "上传待确认",
        DRAFT_SIGNATURE: "待签署",
        PENDING_REVIEW: "待审核",
        CHANGES_REQUIRED: "待修改",
        APPROVED: "待付款",
        PAYMENT_FAILED: "付款异常",
        PAID: "已付款",
      };
      invoice.processHistory = [
        ...(invoice.processHistory || []),
        {
          id: `event-${Date.now()}`,
          status,
          label: statusLabels[status],
          actor: status === "CHANGES_REQUIRED" ? "审核账号 / 系统" : "系统",
          occurredAt: new Date().toISOString(),
          ...(status === "CHANGES_REQUIRED" && invoice.rejectedReason
            ? { reason: invoice.rejectedReason }
            : {}),
        },
      ];
      if (isSubmittingPaymentCorrection && invoice.paymentIssue) {
        invoice.paymentIssue.resubmittedAt = new Date().toISOString();
      }
      if (status !== "PAYMENT_FAILED") invoice.rejectedReason = undefined;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(this.invoiceData));
      }
      return { data: structuredClone(invoice), message: "Invoice 状态已更新" };
    },
    resolvePaymentIssue: async (id, correctedValue) => {
      await wait();
      const invoice = this.invoiceData.find((item) => item.id === id);
      if (!invoice || invoice.status !== "PAYMENT_FAILED" || !invoice.paymentIssue) {
        throw new Error("当前 Invoice 没有待修复的付款信息");
      }
      if (
        !correctedValue.trim() ||
        correctedValue.trim() === invoice.paymentIssue.invalidValue
      ) {
        throw new Error(`请修改${invoice.paymentIssue.fieldLabel.split(" / ")[0]}`);
      }
      invoice.paymentIssue.resolvedAt = new Date().toISOString();
      invoice.updatedAt = "刚刚";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(this.invoiceData));
      }
      return { data: structuredClone(invoice), message: "付款信息已修改并通过校验" };
    },
    sign: async (id, signature) => {
      await wait();
      const invoice = this.invoiceData.find((item) => item.id === id);
      if (!invoice) throw new Error("Invoice 不存在");
      if (invoice.status !== "DRAFT_SIGNATURE") {
        throw new Error("当前 Invoice 无需签署");
      }
      invoice.signature = structuredClone(signature);
      invoice.status = "PENDING_REVIEW";
      invoice.updatedAt = "刚刚";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(this.invoiceData));
      }
      return { data: structuredClone(invoice), message: "Invoice 已签署并提交审核" };
    },
  };

  payout: PayoutService = {
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
