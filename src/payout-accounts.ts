import type { PayoutAccount, UserProfile } from "./types";

export type PayoutDestructiveAction = "DELETE" | "DISABLE" | "LOCKED";

export const PAYOUT_ACCOUNT_ALIAS_MAX_LENGTH = 40;

export const normalizePayoutAccountAlias = (value: string) =>
  value.replace(/\s+/g, " ").trim();

export const validatePayoutAccountAlias = (value: string) => {
  const normalized = normalizePayoutAccountAlias(value);
  const length = Array.from(normalized).length;
  if (!normalized) return "请填写账户别名";
  if (length < 2) return "账户别名至少需要 2 个字符";
  if (length > PAYOUT_ACCOUNT_ALIAS_MAX_LENGTH) {
    return `账户别名不能超过 ${PAYOUT_ACCOUNT_ALIAS_MAX_LENGTH} 个字符`;
  }
  return "";
};

const DELETE_ELIGIBLE_STATUSES: PayoutAccount["status"][] = [
  "DRAFT",
  "INCOMPLETE",
  "VALIDATION_FAILED",
  "PENDING_CONFIRMATION",
];

const PROCESSING_STATUSES: PayoutAccount["status"][] = [
  "UNDER_REVIEW",
  "VALIDATING",
  "PAYMENT_PROCESSING",
];

export const isPayoutAccountProcessing = (account: PayoutAccount) =>
  PROCESSING_STATUSES.includes(account.status) || account.hasActivePayment;

export const hasPayoutAccountHistory = (account: PayoutAccount) =>
  Object.values(account.linkages).some((count) => count > 0);

export const isPayoutAccountUsable = (account: PayoutAccount) =>
  account.status === "VALIDATED" &&
  !account.disabledAt &&
  !isPayoutAccountProcessing(account);

export const payoutAccountsForChannel = (
  accounts: PayoutAccount[],
  channel: PayoutAccount["channel"],
) => accounts.filter((account) => account.channel === channel);

export const payoutAccountDestructiveAction = (
  account: PayoutAccount,
): PayoutDestructiveAction => {
  if (isPayoutAccountProcessing(account)) return "LOCKED";
  if (
    DELETE_ELIGIBLE_STATUSES.includes(account.status) &&
    !account.beneficiaryId &&
    !hasPayoutAccountHistory(account)
  ) {
    return "DELETE";
  }
  return "DISABLE";
};

export const payoutAccountStatusLabel = (account: PayoutAccount) => {
  if (account.status === "DISABLED" || account.disabledAt) return "已停用";
  const labels: Record<PayoutAccount["status"], string> = {
    DRAFT: "草稿",
    INCOMPLETE: "资料待补充",
    VALIDATION_FAILED: "验证失败",
    PENDING_CONFIRMATION: "待确认",
    UNDER_REVIEW: "审核中",
    VALIDATING: "验证中",
    PAYMENT_PROCESSING: "付款处理中",
    VALIDATED: "账户已验证",
    DISABLED: "已停用",
  };
  return labels[account.status];
};

export const payoutAccountStatusTone = (
  account: PayoutAccount,
): "success" | "amber" | "danger" | "blue" | "neutral" => {
  if (account.status === "DISABLED" || account.disabledAt) return "neutral";
  if (account.status === "VALIDATED") return "success";
  if (account.status === "VALIDATION_FAILED") return "danger";
  if (isPayoutAccountProcessing(account)) return "blue";
  return "amber";
};

export const maskPayoutIdentifier = (account: PayoutAccount) => {
  if (account.provider === "PayPal") {
    const email = account.accountEmail || account.schemaValues.paypal_email || "";
    const [local = "", domain = ""] = email.split("@");
    if (!domain) return "未填写邮箱";
    return `${local.slice(0, 2)}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
  }
  const value =
    account.accountNumber ||
    account.schemaValues.iban ||
    account.schemaValues.account_number ||
    "";
  const compact = value.replace(/\s/g, "");
  return compact ? `•••• ${compact.slice(-4)}` : "未填写账号";
};

export const payoutAccountSummary = (account: PayoutAccount) => {
  if (account.provider === "PayPal") {
    return `PayPal · ${maskPayoutIdentifier(account)}`;
  }
  if (account.provider === "PayerMax") {
    return `PayerMax · ${account.currency} · ${maskPayoutIdentifier(account)}`;
  }
  const method = account.transferMethod === "LOCAL" ? "LOCAL" : "SWIFT";
  return [account.currency, method, account.bankName, maskPayoutIdentifier(account)]
    .filter(Boolean)
    .join(" · ");
};

const ensureAccountDefaults = (
  account: PayoutAccount,
  fallbackId: string,
): PayoutAccount => {
  const fallbackName =
    `${account.bankCountry || account.currency || "Airwallex"} 账户`;
  return {
    ...account,
    id: account.id || fallbackId,
    name: normalizePayoutAccountAlias(account.name || fallbackName),
    accountEmail: account.accountEmail || account.schemaValues?.paypal_email,
    linkages: account.linkages || {
      projectCount: 0,
      invoiceCount: 0,
      paymentBatchCount: 0,
      transactionCount: 0,
    },
    hasActivePayment: Boolean(account.hasActivePayment),
    schemaValues: account.schemaValues || {},
  };
};

export const normalizePayoutProfile = (profile: UserProfile): UserProfile => {
  const fallbackAccount = ensureAccountDefaults(
    profile.payout,
    `payout-${profile.id.toLowerCase()}-primary`,
  );
  const requestedDefault = profile.defaultPayoutAccountId;
  const accounts =
    profile.payoutAccounts?.length
      ? profile.payoutAccounts.map((account, index) =>
          ensureAccountDefaults({
            ...account,
            ...(account.id === fallbackAccount.id ||
            (!fallbackAccount.id && account.id === requestedDefault)
              ? fallbackAccount
              : {}),
          }, `payout-${profile.id.toLowerCase()}-${index + 1}`),
        )
      : [fallbackAccount];
  const defaultAccount =
    accounts.find((account) => account.id === requestedDefault) ||
    accounts.find(isPayoutAccountUsable) ||
    accounts[0] ||
    fallbackAccount;
  return {
    ...profile,
    payout: defaultAccount,
    payoutAccounts: accounts,
    defaultPayoutAccountId: defaultAccount.id,
    payoutAccountsVersion: 2,
  };
};

export const syncPayoutAccounts = (
  profile: UserProfile,
  accounts: PayoutAccount[],
  defaultPayoutAccountId: string,
): UserProfile => {
  const defaultAccount =
    accounts.find((account) => account.id === defaultPayoutAccountId) ||
    accounts.find(isPayoutAccountUsable) ||
    accounts[0];
  if (!defaultAccount) {
    return {
      ...profile,
      payoutAccounts: [],
      defaultPayoutAccountId: "",
    };
  }
  return {
    ...profile,
    payout: defaultAccount,
    payoutAccounts: accounts,
    defaultPayoutAccountId: defaultAccount.id,
  };
};

export const calculatePayoutProfileCompleteness = (profile: UserProfile) => {
  const normalized = normalizePayoutProfile(profile);
  const checks = [
    Boolean(normalized.legalName.trim()),
    Boolean(normalized.phone.trim()),
    Boolean(normalized.email.trim()),
    Boolean(normalized.address.trim()),
    normalized.social.verificationStatus === "VERIFIED",
    normalized.payoutAccounts.some(isPayoutAccountUsable),
  ];
  return Math.round(
    (checks.filter(Boolean).length / Math.max(1, checks.length)) * 100,
  );
};
