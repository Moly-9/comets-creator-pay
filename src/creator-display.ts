import type {
  Contract,
  FileRef,
  Invoice,
  InvoicePayoutSnapshot,
  PayoutAccount,
  SocialAccount,
  UserProfile,
  UserRole,
} from "./types";

export interface DisplayFieldRow {
  label: string;
  value: string;
}

export const CREATOR_INTERNAL_INVOICE_LABEL = "Comets内部invoice";
export const MISSING_DISPLAY_VALUE = "待补充";

export const contractPaymentMethodChannel = (profile: UserProfile): string => {
  const defaultAccount = profile.payoutAccounts?.find(
    (account) => account.id === profile.defaultPayoutAccountId,
  );
  if (!defaultAccount) return MISSING_DISPLAY_VALUE;
  const labels: Partial<Record<PayoutAccount["channel"], string>> = {
    AIRWALLEX: "Bank Transfer/Airwallex",
    PAYERMAX: "Bank Transfer/Payer Max",
    PAYPAL: "PayPal/PayPal",
  };
  return labels[defaultAccount.channel] || MISSING_DISPLAY_VALUE;
};

export const creatorInvoiceTypeLabel = (
  invoiceOrKind: Invoice | "INTERNAL" | "EXTERNAL",
) => {
  const kind = typeof invoiceOrKind === "string"
    ? invoiceOrKind
    : invoiceOrKind.documentState?.kind
      || (invoiceOrKind.invoiceType === "INTERNAL"
        || invoiceOrKind.invoiceType === "INTERNAL_CONTRACT"
        ? "INTERNAL"
        : "EXTERNAL");
  return kind === "INTERNAL" ? CREATOR_INTERNAL_INVOICE_LABEL : "外部 Invoice";
};

export const getSocialAccountName = (profileUrl: string, fallback = "") => {
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

export const primaryVerifiedSocialHandle = (
  social: SocialAccount,
) => {
  if (social.verificationStatus !== "VERIFIED") return "";
  const firstUrl = social.profileUrls?.find((url) => url.trim())
    || social.profileUrl;
  return getSocialAccountName(firstUrl, social.handle).replace(/^@/, "");
};

export const creatorHomepageSocialSummary = (social: SocialAccount) => {
  const profileUrls = Array.from(new Set(
    (social.profileUrls?.length ? social.profileUrls : [social.profileUrl])
      .map((url) => url.trim())
      .filter(Boolean),
  ));
  const firstProfileUrl = profileUrls[0];
  let accountLabel = social.handle || "社媒账号";

  if (firstProfileUrl) {
    try {
      const hostname = new URL(firstProfileUrl).hostname.replace(/^www\./i, "");
      if (hostname) accountLabel = `@${hostname}`;
    } catch {
      // Keep the saved handle as a readable fallback for legacy invalid URLs.
    }
  }

  return `${accountLabel} 等 ${profileUrls.length || 1} 个主页`;
};

export const normalizeSocialEvidence = (
  social: SocialAccount,
): Record<string, FileRef[]> => {
  const urls = (social.profileUrls?.length
    ? social.profileUrls
    : [social.profileUrl]).filter(Boolean);
  const current = social.evidenceByProfileUrl || {};
  const normalized = Object.fromEntries(
    urls.map((url) => [url, structuredClone(current[url] || [])]),
  );
  const legacyFiles = social.screenshots?.length
    ? social.screenshots
    : social.screenshot
      ? [social.screenshot]
      : [];
  if (urls[0] && !normalized[urls[0]].length && legacyFiles.length) {
    normalized[urls[0]] = structuredClone(legacyFiles);
  }
  return normalized;
};

export const synchronizeProfileSocialFields = (
  profile: UserProfile,
): UserProfile => {
  const evidenceByProfileUrl = normalizeSocialEvidence(profile.social);
  const derivedDisplayName = primaryVerifiedSocialHandle(profile.social);
  return {
    ...profile,
    displayName: derivedDisplayName || profile.displayName,
    social: {
      ...profile.social,
      evidenceByProfileUrl,
    },
  };
};

const schemaValue = (account: PayoutAccount, ...keys: string[]) => {
  const values = account.schemaValues || {};
  return keys.map((key) => values[key]).find((value) => value?.trim()) || "";
};

export const createInvoicePayoutSnapshot = (
  account: PayoutAccount,
  capturedAt = new Date().toISOString(),
): InvoicePayoutSnapshot => ({
  provider: account.provider,
  currency: account.currency,
  bankCountry: account.bankCountry,
  transferMethod: account.transferMethod,
  beneficiaryType: account.beneficiaryType,
  paypalEmail: account.accountEmail || "",
  accountName: account.accountHolder || schemaValue(account, "account_name"),
  accountNumber: account.accountNumber || schemaValue(account, "account_number"),
  bankName: account.bankName || schemaValue(account, "bank_name"),
  bankAddress: schemaValue(
    account,
    "bank_street_address",
    "bank_address",
    "beneficiary_bank_address",
  ),
  swiftCode: account.swiftCode || schemaValue(account, "swift_code"),
  iban: schemaValue(account, "iban"),
  remittanceInformation: schemaValue(
    account,
    "remittance_information",
    "remittance_info",
  ),
  capturedAt,
});

export const payoutAccountChangedSinceSnapshot = (
  account: PayoutAccount,
  snapshot?: InvoicePayoutSnapshot,
) => {
  if (!snapshot) return false;
  const current = createInvoicePayoutSnapshot(account, snapshot.capturedAt);
  return Object.keys(current).some((key) => key !== "capturedAt"
    && snapshot[key as keyof InvoicePayoutSnapshot] !== undefined
    && current[key as keyof InvoicePayoutSnapshot] !== snapshot[key as keyof InvoicePayoutSnapshot]);
};

export const ensureInvoicePayoutSnapshot = (
  invoice: Invoice,
  accounts: PayoutAccount[],
) => {
  if (invoice.payoutSnapshot) return invoice;
  const account = accounts.find((item) => item.id === invoice.payoutAccountId);
  if (!account) return invoice;
  return {
    ...invoice,
    payoutSnapshot: createInvoicePayoutSnapshot(account, invoice.issuedAt),
  };
};

export const maskSensitivePayoutValue = (value: string) => {
  const compact = value.replace(/\s/g, "");
  return compact ? `•••• ${compact.slice(-4)}` : MISSING_DISPLAY_VALUE;
};

export const payoutSnapshotRows = (
  snapshot: InvoicePayoutSnapshot | undefined,
  role: UserRole,
): DisplayFieldRow[] => {
  const value = (raw: string) => raw?.trim() || MISSING_DISPLAY_VALUE;
  const sensitive = (raw: string) => role === "ADMIN"
    ? maskSensitivePayoutValue(raw)
    : value(raw);
  return [
    { label: "Account Name", value: value(snapshot?.accountName || "") },
    { label: "Account Number", value: sensitive(snapshot?.accountNumber || "") },
    { label: "Beneficiary Bank Name", value: value(snapshot?.bankName || "") },
    { label: "Beneficiary Bank Address", value: value(snapshot?.bankAddress || "") },
    { label: "SWIFT Code", value: value(snapshot?.swiftCode || "") },
    { label: "IBAN", value: sensitive(snapshot?.iban || "") },
    { label: "Remittance Information", value: value(snapshot?.remittanceInformation || "") },
  ];
};

export const contractConfirmationRows = (
  contract: Contract,
  profile: UserProfile,
): DisplayFieldRow[] => [
  { label: "Advertiser", value: contract.brand?.trim() || MISSING_DISPLAY_VALUE },
  {
    label: "Publisher",
    value: contract.creatorName?.trim()
      || profile.legalName?.trim()
      || MISSING_DISPLAY_VALUE,
  },
  { label: "合同金额", value: contract.amount?.trim() || MISSING_DISPLAY_VALUE },
  { label: "手续费承担方", value: contract.feeBearer?.trim() || MISSING_DISPLAY_VALUE },
  {
    label: "付款方式/付款渠道",
    value: contractPaymentMethodChannel(profile),
  },
];

export const contractPayoutRows = (
  profile: UserProfile,
  role: UserRole,
): DisplayFieldRow[] => payoutSnapshotRows(
  createInvoicePayoutSnapshot(profile.payout, ""),
  role,
);
