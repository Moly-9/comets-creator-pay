import { adminStore } from "../admin-store";
import { normalizePayoutProfile } from "../payout-accounts";
import type { AdminUserDetail, Invoice, InvoicePayoutSnapshot, PayoutAccount, UserAccount, UserProfile } from "../types";

export const creatorAccount = (id: string): UserAccount | undefined =>
  adminStore.listUsers({ role: "CREATOR" }).find((user) => user.id === id);

export const creatorAccounts = (): UserAccount[] =>
  adminStore.listUsers({ role: "CREATOR" });

export const maskAccountValue = (value: string): string => {
  if (!value || value === "—") return "—";
  if (value.startsWith("••••")) return value;
  const compact = value.replace(/\s/g, "");
  return compact.length > 4 ? `•••• ${compact.slice(-4)}` : "••••";
};

const maskEmail = (value: string): string => {
  if (!value) return "";
  const domain = value.split("@")[1];
  return domain ? `••••@${domain}` : "••••";
};

const maskPayout = (account: PayoutAccount): PayoutAccount => ({
  ...account,
  accountNumber: maskAccountValue(account.accountNumber),
  accountEmail: account.accountEmail ? maskEmail(account.accountEmail) : undefined,
  swiftCode: maskAccountValue(account.swiftCode),
  beneficiaryId: undefined,
  schemaValues: Object.fromEntries(Object.entries(account.schemaValues || {}).map(([key, value]) => [
    key,
    /account|iban|routing|swift|email|address|document|id_number|tax|registration|beneficiary/i.test(key)
      ? maskAccountValue(value) : value,
  ])),
});

export const maskSnapshot = (snapshot: InvoicePayoutSnapshot): InvoicePayoutSnapshot => ({
  ...snapshot,
  accountNumber: maskAccountValue(snapshot.accountNumber),
  bankAddress: maskAccountValue(snapshot.bankAddress),
  swiftCode: maskAccountValue(snapshot.swiftCode),
  iban: maskAccountValue(snapshot.iban),
  paypalEmail: snapshot.paypalEmail ? maskEmail(snapshot.paypalEmail) : undefined,
  remittanceInformation: snapshot.remittanceInformation ? "内容已脱敏" : "",
});

/** A deny-by-default projection for document bytes and historical payment fields. */
export const maskedInvoice = (source: Invoice): Invoice => {
  const invoice = structuredClone(source);
  invoice.document = undefined;
  invoice.fileVersions = undefined;
  invoice.sourceFileVersions = undefined;
  invoice.signature = undefined;
  invoice.payoutSnapshot = invoice.payoutSnapshot && maskSnapshot(invoice.payoutSnapshot);
  invoice.paymentRetryRequest = invoice.paymentRetryRequest && {
    ...invoice.paymentRetryRequest,
    payoutSnapshot: maskSnapshot(invoice.paymentRetryRequest.payoutSnapshot),
  };
  invoice.paymentIssue = invoice.paymentIssue && { ...invoice.paymentIssue, invalidValue: "••••" };
  invoice.feedbackRecords = invoice.feedbackRecords?.map((record) => ({ ...record, details: "内容已脱敏" }));
  invoice.operationHistory = invoice.operationHistory?.map((event) => ({ ...event, description: "详情已脱敏", reason: event.reason ? "原因已脱敏" : undefined }));
  invoice.processHistory = invoice.processHistory?.map((event) => ({ ...event, reason: event.reason ? "原因已脱敏" : undefined }));
  invoice.reviewHistory = invoice.reviewHistory?.map((event) => ({ ...event, reason: event.reason ? "原因已脱敏" : undefined }));
  invoice.extractedData = invoice.extractedData && {
    ...invoice.extractedData,
    paymentDetails: Object.fromEntries(Object.entries(invoice.extractedData.paymentDetails).map(([key, value]) => [key, maskAccountValue(value)])),
  };
  invoice.recognitionSnapshots = undefined;
  invoice.confirmedSnapshots = undefined;
  invoice.pageConfirmations = undefined;
  invoice.expectedValues = undefined;
  return invoice;
};

export const maskedCreatorProfile = (source: UserProfile): UserProfile => {
  const profile = normalizePayoutProfile(source);
  return ({
  ...structuredClone(profile),
  email: maskEmail(profile.email),
  phone: maskAccountValue(profile.phone),
  address: profile.address ? "••••" : "",
  social: { ...structuredClone(profile.social), screenshot: undefined, screenshots: [], evidenceByProfileUrl: {} },
  payout: maskPayout(profile.payout),
  payoutAccounts: profile.payoutAccounts.map(maskPayout),
  });
};

/** The selected-user read model never contains full payout values or file bytes. */
export const maskedCreatorDetail = (detail: AdminUserDetail): AdminUserDetail => ({
  ...structuredClone(detail),
  account: { ...detail.account, email: maskEmail(detail.account.email) },
  profile: detail.profile ? maskedCreatorProfile(detail.profile) : undefined,
  // Identity operations use their separately authorized management service.
  corrections: [],
  notifications: [],
  loginHistory: [],
  requests: detail.requests.map((request) => ({
    ...structuredClone(request),
    progress: request.progress.map((node) => ({ ...node, description: "详情已脱敏" })),
    issues: request.issues.map((issue) => ({ ...issue, reason: "原因已脱敏" })),
  })),
  contracts: detail.contracts.map((contract) => ({
    ...structuredClone(contract),
    documentUrl: "",
    signatureRecord: contract.signatureRecord
      ? { ...contract.signatureRecord, signature: undefined } : undefined,
  })),
  invoices: detail.invoices.map(maskedInvoice),
});

/** Identity operations retain editable contact and audit data, never unmasked payout data. */
export const managementCreatorDetail = (detail: AdminUserDetail): AdminUserDetail => {
  const masked = maskedCreatorDetail(detail);
  return {
    ...masked,
    account: structuredClone(detail.account),
    profile: masked.profile && detail.profile ? {
      ...masked.profile,
      email: detail.profile.email,
      phone: detail.profile.phone,
      address: detail.profile.address,
    } : undefined,
    corrections: structuredClone(detail.corrections),
    notifications: structuredClone(detail.notifications),
    loginHistory: structuredClone(detail.loginHistory),
  };
};
