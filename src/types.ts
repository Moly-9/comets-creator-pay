export type ProgressState = "complete" | "current" | "pending" | "blocked";

export type UserRole = "ADMIN" | "CREATOR";

export type AccountStatus = "ACTIVE" | "DISABLED";

export type InvitationStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "ACCEPTED"
  | "EXPIRED";

export type VerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "CHANGES_REQUESTED";

export type SensitiveFieldKey =
  | "accountNumber"
  | "iban"
  | "swiftCode"
  | "beneficiaryIdNumber"
  | "businessRegistrationNumber";

export type UserPermission =
  | "CREATOR_WORKSPACE_VIEW"
  | "CREATOR_PROFILE_EDIT"
  | "CREATOR_PAYOUT_EDIT"
  | "INVOICE_SIGN"
  | "USER_VIEW_ALL"
  | "USER_MANAGE"
  | "USER_BASIC_PROFILE_EDIT"
  | "USER_SOCIAL_PROFILE_EDIT"
  | "USER_CORRECTION_CREATE"
  | "SENSITIVE_DATA_REVEAL"
  | "AUDIT_VIEW"
  | "ADMIN_SETTINGS_MANAGE";

export type InvoiceStatus =
  | "PENDING_CONFIRMATION"
  | "DRAFT_SIGNATURE"
  | "PENDING_REVIEW"
  | "CHANGES_REQUIRED"
  | "PAYMENT_FAILED"
  | "APPROVED"
  | "PAID";

export type RequestStatus = InvoiceStatus;

export interface InvoiceSignature {
  method: "DRAWN" | "UPLOADED" | "GENERATED";
  dataUrl: string;
  signerName: string;
  signedAt: string;
}

export type InvoiceType = "EXTERNAL_CONTRACT" | "INTERNAL_CONTRACT";

export interface InvoiceExtractedData {
  invoiceFrom: string;
  billTo: string;
  invoiceDate: string;
  currency: string;
  total: string;
  paymentDetails: Record<string, string>;
  invoiceFromMatchesProfile: boolean;
  billToMatchesComets: boolean;
}

export interface InvoiceProcessEvent {
  id: string;
  status: InvoiceStatus;
  label: string;
  actor: string;
  occurredAt: string;
  reason?: string;
}

export interface InvoiceUploadInput {
  projectId: string;
  projectName: string;
  brand: string;
  amount: string;
  payoutAccountId: string;
  invoiceType: InvoiceType;
  file: FileRef;
  extractedData: InvoiceExtractedData;
}

export interface ApiResult<T> {
  data: T;
  message?: string;
}

export interface FileRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
}

export interface SocialAccount {
  platform: string;
  handle: string;
  profileUrl: string;
  profileUrls: string[];
  verificationStatus: VerificationStatus;
  screenshot?: FileRef;
  screenshots: FileRef[];
}

export interface PayoutAccount {
  id: string;
  name: string;
  provider: "Airwallex" | "PayPal" | "PayerMax";
  channel: "AIRWALLEX" | "PAYPAL" | "PAYERMAX";
  accountHolder: string;
  accountEmail?: string;
  bankCountry: string;
  bankName: string;
  currency: string;
  beneficiaryType: "PERSONAL" | "COMPANY";
  transferMethod: "LOCAL" | "SWIFT";
  accountNumber: string;
  swiftCode: string;
  status:
    | "DRAFT"
    | "INCOMPLETE"
    | "VALIDATION_FAILED"
    | "PENDING_CONFIRMATION"
    | "UNDER_REVIEW"
    | "VALIDATING"
    | "PAYMENT_PROCESSING"
    | "VALIDATED"
    | "DISABLED";
  statusBeforeDisable?: Exclude<PayoutAccount["status"], "DISABLED">;
  disabledAt?: string;
  beneficiaryId?: string;
  linkages: {
    projectCount: number;
    invoiceCount: number;
    paymentBatchCount: number;
    transactionCount: number;
  };
  hasActivePayment: boolean;
  schemaValues: Record<string, string>;
}

export interface AirwallexSchemaCondition {
  bankCountryCode: string;
  accountCurrency: string;
  entityType: "PERSONAL" | "COMPANY";
  transferMethod: "LOCAL" | "SWIFT";
}

export interface AirwallexSchemaOption {
  label: string;
  value: string;
}

export interface AirwallexSchemaValidationRule {
  name:
    | "Alphanumeric"
    | "AlphanumericIncludingPunctuation"
    | "DigitsOnly"
    | "IbanCountryOneOf"
    | "IbanIsValid"
    | "Length"
    | "MinMaxLength"
    | "OneOf"
    | "WhitespaceTrimmed";
  parameters?: {
    length?: number;
    min?: number;
    max?: number;
    values?: string[];
  };
  message: string;
  serverSideOnly?: boolean;
}

export interface AirwallexSchemaField {
  key: string;
  path: string;
  label: string;
  type: "INPUT" | "SELECT";
  required: boolean;
  placeholder?: string;
  description?: string;
  options?: AirwallexSchemaOption[];
  pattern?: string;
  validationMessage?: string;
  validationRules?: AirwallexSchemaValidationRule[];
}

export interface AirwallexFormSchema {
  key: string;
  condition: AirwallexSchemaCondition;
  fields: AirwallexSchemaField[];
}

export interface AirwallexBeneficiaryResult {
  beneficiaryId: string;
  status: "VALIDATED";
}

export interface UserProfile {
  id: string;
  displayName: string;
  legalName: string;
  email: string;
  phone: string;
  country: string;
  address: string;
  social: SocialAccount;
  payout: PayoutAccount;
  payoutAccounts: PayoutAccount[];
  defaultPayoutAccountId: string;
  payoutAccountsVersion?: 2;
}

export interface ContractObligation {
  id: string;
  category: "交付" | "发布" | "合规" | "保密" | "请款";
  title: string;
  summary: string;
  clause: string;
  timing: string;
  stage: "履约中" | "请款前";
}

export interface Contract {
  id: string;
  orderId: string;
  projectId: string;
  projectName: string;
  campaignName: string;
  brand: string;
  creatorName: string;
  amount: string;
  effectiveDate: string;
  servicePeriod: string;
  status: "未请款" | "请款中" | "已付款";
  obligations: ContractObligation[];
  fileName: string;
  documentUrl: string;
  pageCount: number;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  projectId: string;
  projectName: string;
  brand: string;
  channel: "Airwallex";
  amount: string;
  status: InvoiceStatus;
  issuedAt: string;
  updatedAt: string;
  invoiceType?: InvoiceType;
  payoutAccountId?: string;
  document?: FileRef;
  extractedData?: InvoiceExtractedData;
  processHistory?: InvoiceProcessEvent[];
  paymentReference?: string;
  rejectedReason?: string;
  paymentIssue?: {
    version: 1;
    code: "INVALID_ACCOUNT_NUMBER";
    fieldKey: "account_number";
    fieldLabel: string;
    maskedValue: string;
    invalidValue: string;
    message: string;
    resolvedAt?: string;
    resubmittedAt?: string;
  };
  signature?: InvoiceSignature;
}

export interface RequestProgressNode {
  id: string;
  label: string;
  state: ProgressState;
  description: string;
  owner: string;
  time: string;
}

export interface RequestMaterialIssue {
  id: string;
  type: "CONTRACT" | "INVOICE" | "PAYOUT";
  title: string;
  reason: string;
  resourceId: string;
  owner: string;
  resolved: boolean;
}

export interface RequestProject {
  id: string;
  projectName: string;
  brand: string;
  amount: string;
  status: RequestStatus;
  contractIds: string[];
  invoiceIds: string[];
  contractStatus: Contract["status"];
  invoiceStatus: string;
  updatedAt: string;
  progress: RequestProgressNode[];
  issues: RequestMaterialIssue[];
}

export interface Session {
  userId: string;
  email: string;
  onboardingComplete: boolean;
  role: UserRole;
  permissions: UserPermission[];
  sessionId: string;
  verificationStatus: VerificationStatus;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  invitationStatus: InvitationStatus;
  verificationStatus: VerificationStatus;
  onboardingComplete: boolean;
  createdAt: string;
  lastLoginAt: string;
  lastActiveAt: string;
  hasOpenCorrection?: boolean;
}

export interface Invitation {
  id: string;
  userId: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
}

export interface UserLoginRecord {
  id: string;
  userId: string;
  occurredAt: string;
  device: string;
  location: string;
  result: "SUCCESS" | "FAILED";
}

export type CorrectionStatus = "OPEN" | "RESOLVED" | "CANCELED";

export interface CorrectionRequest {
  id: string;
  userId: string;
  fieldKey: string;
  fieldLabel: string;
  reason: string;
  status: CorrectionStatus;
  createdBy: string;
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface AdminNotification {
  id: string;
  userId: string;
  type: "INVITATION" | "PASSWORD_RESET" | "CORRECTION" | "ACCOUNT_STATUS";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  emailStatus: "QUEUED" | "DELIVERED" | "NOT_REQUESTED";
}

export type AuditAction =
  | "LOGIN"
  | "USER_CREATED"
  | "USER_INVITED"
  | "USER_STATUS_CHANGED"
  | "PASSWORD_RESET_SENT"
  | "PROFILE_UPDATED"
  | "VERIFICATION_UPDATED"
  | "CORRECTION_CREATED"
  | "CORRECTION_AUTO_RESOLVED"
  | "SENSITIVE_DATA_REVEALED"
  | "USERS_EXPORTED"
  | "SETTINGS_UPDATED"
  | "EXTERNAL_DATA_SYNCED"
  | "EXTERNAL_DATA_REJECTED";

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  subjectUserId?: string;
  subjectName?: string;
  action: AuditAction;
  module: "AUTH" | "USER" | "PROFILE" | "SECURITY" | "SETTINGS" | "SYNC";
  summary: string;
  reason?: string;
  occurredAt: string;
  before?: Record<string, string>;
  after?: Record<string, string>;
}

export interface AdminSettings {
  registrationEnabled: boolean;
  invitationValidDays: number;
  passwordMinLength: number;
  passwordMaxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  serviceAgreementUrl: string;
  privacyPolicyUrl: string;
  dataProcessingUrl: string;
  correctionReasonTemplates: string[];
}

export interface ExternalSyncIssue {
  id: string;
  eventId: string;
  creatorId: string;
  resourceType: "CONTRACT" | "INVOICE" | "PAYMENT_STATUS";
  message: string;
  occurredAt: string;
}

export interface ExternalBusinessEvent<T = Record<string, unknown>> {
  eventId: string;
  creatorId: string;
  externalRecordId: string;
  resourceType: "CONTRACT" | "INVOICE" | "PAYMENT_STATUS";
  version: number;
  occurredAt: string;
  payload: T;
}

export interface AdminUserDetail {
  account: UserAccount;
  profile?: UserProfile;
  corrections: CorrectionRequest[];
  notifications: AdminNotification[];
  loginHistory: UserLoginRecord[];
  contracts: Contract[];
  invoices: Invoice[];
  requests: RequestProject[];
  lastSyncedAt?: string;
}

export interface AdminBusinessRecord<T> {
  creator: Pick<UserAccount, "id" | "name" | "email">;
  record: T;
}

export interface AdminBusinessData {
  requests: AdminBusinessRecord<RequestProject>[];
  contracts: AdminBusinessRecord<Contract>[];
  invoices: AdminBusinessRecord<Invoice>[];
}
