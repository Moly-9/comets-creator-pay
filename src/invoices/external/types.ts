import type { FileRef, InvoiceExtractedData } from "../../types";

export type ExternalInvoiceCollectionStatus =
  | "DRAFT"
  | "WAITING_UPLOAD"
  | "RECOGNIZING"
  | "WAITING_CONFIRMATION"
  | "WAITING_MEDIA_REVIEW"
  | "RETURNED_FOR_CORRECTION"
  | "RETURNED_FOR_REUPLOAD"
  | "APPROVED"
  | "RECOGNITION_FAILED"
  | "CANCELLED";

export type ExternalInvoiceFieldKey =
  | "SOURCE_INVOICE_NUMBER"
  | "INVOICE_DATE"
  | "PUBLISHER"
  | "ADVERTISER"
  | "DESCRIPTION"
  | "AMOUNT"
  | "CURRENCY"
  | "PAYMENT_ACCOUNT";

export type ExternalInvoiceExpectedValues = {
  amount: string;
  currency: string;
  billTo: string;
  creatorLegalName: string;
  dueAt?: string;
};

export type ExternalInvoiceFileVersion = FileRef & {
  fileVersionId: string;
  version: number;
  fileName: string;
  fileHash: string;
  uploadedAt: string;
  uploadedBy: string;
  supersedesFileVersionId?: string;
};

export type ExternalInvoiceRecognitionSnapshot = {
  recognitionId: string;
  fileVersionId: string;
  engineVersion: string;
  recognizedAt: string;
  fields: Record<ExternalInvoiceFieldKey, string>;
  extractedData: InvoiceExtractedData;
  failureReason?: string;
};

export type ExternalInvoiceCorrection = {
  field: ExternalInvoiceFieldKey;
  recognizedValue: string;
  confirmedValue: string;
  correctedBy: string;
  correctedAt: string;
};

export type ExternalInvoiceConfirmedSnapshot = {
  confirmationId: string;
  recognitionId: string;
  fileVersionId: string;
  values: Record<ExternalInvoiceFieldKey, string>;
  corrections: ExternalInvoiceCorrection[];
  payoutAccountId: string;
  effectivePaymentDetails?: Record<string, string>;
  payoutDifferenceDecision?: "USE_BOUND_ACCOUNT";
  payoutMismatchFields?: string[];
  confirmedBy: string;
  confirmedAt: string;
};

export type ExternalInvoicePageConfirmation = {
  fileVersionId: string;
  recognitionId: string;
  values: Record<ExternalInvoiceFieldKey, string>;
  payoutAccountId: string;
  effectivePaymentDetails?: Record<string, string>;
  payoutAccountFingerprint?: string;
  payoutDifferenceDecision?: "USE_BOUND_ACCOUNT";
  payoutMismatchFields?: string[];
  confirmedBy: string;
  confirmedAt: string;
};

export type ExternalInvoiceReviewEvent = {
  eventId: string;
  action:
    | "TASK_PUBLISHED"
    | "FILE_UPLOADED"
    | "RECOGNITION_STARTED"
    | "RECOGNITION_SUCCEEDED"
    | "RECOGNITION_FAILED"
    | "RECOGNITION_CORRECTED"
    | "PAYOUT_ACCOUNT_SELECTED"
    | "PAGE_CONFIRMED"
    | "SUBMITTED"
    | "RETURNED_FOR_CORRECTION"
    | "RETURNED_FOR_REUPLOAD"
    | "APPROVED"
    | "PAYMENT_STATUS_CHANGED"
    | "PAYMENT_ACCOUNT_CORRECTION_SUBMITTED"
    | "PAYMENT_RETRY_REQUESTED";
  actor: string;
  occurredAt: string;
  fromStatus?: ExternalInvoiceCollectionStatus;
  toStatus: ExternalInvoiceCollectionStatus;
  reason?: string;
};

export type ExternalInvoiceCommandBase = {
  invoiceId: string;
  creatorId: string;
  expectedVersion: number;
  clientRequestId: string;
};

export type UploadExternalInvoiceFileCommand = ExternalInvoiceCommandBase & {
  /** Ignored legacy upload parameter; select the account after recognition. */
  payoutAccountId?: string;
  file: FileRef;
  fileBlob?: Blob;
};

export type RetryExternalInvoiceRecognitionCommand = ExternalInvoiceCommandBase & {
  simulateFailure?: boolean;
};

export type CorrectExternalInvoiceRecognitionCommand = ExternalInvoiceCommandBase & {
  values: Partial<Record<ExternalInvoiceFieldKey, string>>;
};

export type SelectExternalInvoicePayoutAccountCommand = ExternalInvoiceCommandBase & {
  payoutAccountId: string;
};

export type ConfirmExternalInvoiceCommand = ExternalInvoiceCommandBase & {
  /** Legacy callers may send this; the two page confirmations are authoritative. */
  acknowledgement?: boolean;
};

export type ConfirmExternalInvoicePageCommand = ExternalInvoiceCommandBase & {
  page: "INVOICE" | "PAYOUT";
  payoutDifferenceDecision?: "USE_BOUND_ACCOUNT";
};

export type ResubmitExternalInvoiceCommand = ExternalInvoiceCommandBase & {
  values: Partial<Record<ExternalInvoiceFieldKey, string>>;
};
