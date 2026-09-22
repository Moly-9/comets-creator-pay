import type { Invoice, PayoutAccount, UserProfile } from "../../types";
import { isPayoutAccountUsable } from "../../payout-accounts";
import type {
  ExternalInvoiceConfirmedSnapshot,
  ExternalInvoiceCollectionStatus,
  ExternalInvoiceExpectedValues,
  ExternalInvoiceFieldKey,
  ExternalInvoiceRecognitionSnapshot,
} from "./types";

export const canCorrectExternalInvoice = (status: ExternalInvoiceCollectionStatus) =>
  status === "WAITING_CONFIRMATION" || status === "RETURNED_FOR_CORRECTION";

export const EXTERNAL_INVOICE_FIELD_ORDER: ExternalInvoiceFieldKey[] = [
  "SOURCE_INVOICE_NUMBER",
  "INVOICE_DATE",
  "PUBLISHER",
  "ADVERTISER",
  "DESCRIPTION",
  "AMOUNT",
  "CURRENCY",
  "PAYMENT_ACCOUNT",
];

export const EXTERNAL_INVOICE_FIELD_LABEL: Record<ExternalInvoiceFieldKey, string> = {
  SOURCE_INVOICE_NUMBER: "票面 Invoice Number",
  INVOICE_DATE: "Invoice date",
  PUBLISHER: "Invoice From",
  ADVERTISER: "Bill To",
  DESCRIPTION: "Description",
  AMOUNT: "Amount",
  CURRENCY: "Currency",
  PAYMENT_ACCOUNT: "Payment Account",
};

const normalized = (value: string | undefined) =>
  (value || "").trim().replace(/\s+/g, " ").toLowerCase();

const numberValue = (value: string | undefined) =>
  Number((value || "").replace(/[^0-9.-]/g, ""));

export const payoutAccountFields = (account: PayoutAccount) => ({
  account_name: account.accountHolder,
  bank_name: account.bankName,
  bank_address: account.schemaValues.bank_street_address || "",
  bank_country: account.bankCountry,
  account_number: account.accountNumber,
  iban: account.schemaValues.iban || "",
  swift_code: account.swiftCode,
  transfer_method: account.transferMethod,
  beneficiary_type: account.beneficiaryType,
  paypal_email: account.accountEmail || "",
  provider: account.provider,
  payment_method: account.provider === "PayPal" ? "PayPal" : "Bank Transfer",
});

export const payoutAccountFingerprint = (account: PayoutAccount) =>
  JSON.stringify({ ...payoutAccountFields(account), currency: account.currency });

export const recognitionFieldsFromExtracted = (
  _invoiceNumber: string,
  extracted: NonNullable<Invoice["extractedData"]>,
): Record<ExternalInvoiceFieldKey, string> => ({
  SOURCE_INVOICE_NUMBER: "",
  INVOICE_DATE: extracted.invoiceDate,
  PUBLISHER: extracted.invoiceFrom,
  ADVERTISER: extracted.billTo,
  DESCRIPTION: extracted.description || "",
  AMOUNT: extracted.total,
  CURRENCY: extracted.currency,
  PAYMENT_ACCOUNT: JSON.stringify(extracted.paymentDetails),
});

export const confirmedValues = (
  recognition: ExternalInvoiceRecognitionSnapshot,
  confirmation?: ExternalInvoiceConfirmedSnapshot,
) => ({ ...recognition.fields, ...(confirmation?.values || {}) });

export const currentExternalCorrection = (invoice: Invoice) => {
  const recognition = invoice.recognitionSnapshots?.at(-1);
  const correction = invoice.confirmedSnapshots?.at(-1);
  return recognition && recognition.fileVersionId === invoice.sourceFileVersions?.at(-1)?.fileVersionId
    && correction?.recognitionId === recognition.recognitionId
    && correction.fileVersionId === recognition.fileVersionId ? correction : undefined;
};

export type ExternalInvoiceValidationIssue = {
  field: ExternalInvoiceFieldKey | "PAYOUT_ACCOUNT";
  message: string;
};

export const validateExternalInvoiceConfirmation = ({
  invoice,
  profile,
  account,
}: {
  invoice: Invoice;
  profile: UserProfile;
  account?: PayoutAccount;
}): ExternalInvoiceValidationIssue[] => {
  const expected = invoice.expectedValues as ExternalInvoiceExpectedValues | undefined;
  const recognition = invoice.recognitionSnapshots?.at(-1);
  const confirmation = currentExternalCorrection(invoice);
  if (!recognition || recognition.failureReason) {
    return [{ field: "SOURCE_INVOICE_NUMBER", message: "Invoice 尚未生成有效识别结果" }];
  }
  const values = confirmedValues(recognition, confirmation);
  const issues: ExternalInvoiceValidationIssue[] = [];
  if (!values.INVOICE_DATE?.trim()) {
    issues.push({ field: "INVOICE_DATE", message: "请核对并填写 Invoice date" });
  }
  if (!values.DESCRIPTION?.trim()) {
    issues.push({ field: "DESCRIPTION", message: "请对照 Invoice 票面填写 Description" });
  }
  if (!account) issues.push({ field: "PAYOUT_ACCOUNT", message: "请选择收款账户" });
  else if (!isPayoutAccountUsable(account)) issues.push({ field: "PAYOUT_ACCOUNT", message: "所选账户未验证、已停用或正在付款处理中" });
  if (normalized(values.PUBLISHER) !== normalized(profile.legalName)) {
    issues.push({ field: "PUBLISHER", message: "Invoice From 与档案 Real Name 不一致" });
  }
  if (normalized(values.ADVERTISER) !== normalized(expected?.billTo || "COMETS INTERNATIONAL LIMITED")) {
    issues.push({ field: "ADVERTISER", message: "Bill To 应为 COMETS INTERNATIONAL LIMITED" });
  }
  if (!values.AMOUNT?.trim() || numberValue(values.AMOUNT) !== numberValue(expected?.amount)) {
    issues.push({ field: "AMOUNT", message: "Invoice 金额与系统预期金额不一致" });
  }
  if (normalized(values.CURRENCY) !== normalized(expected?.currency)) {
    issues.push({ field: "CURRENCY", message: "Invoice 币种与系统预期币种不一致" });
  }
  return issues;
};

export const assertExpectedVersion = (invoice: Invoice, expectedVersion: number) => {
  if ((invoice.version || 1) !== expectedVersion) {
    throw new Error("Invoice 已更新，请刷新后重试");
  }
};

export const assertCreatorOwnsInvoice = (invoice: Invoice, creatorId: string) => {
  if ((invoice.creatorId || "CREATOR-001") !== creatorId) {
    throw new Error("无权访问该 Invoice");
  }
};
