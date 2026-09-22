import { invoiceInternalIdOf } from "../creator-workflow";
import { legacyPaymentAttempt } from "../payment-relations";
import type { Invoice, PaymentAttempt } from "../types";

export const attemptsByCreator = (
  invoices: Invoice[], attempts: PaymentAttempt[], creatorId: string,
): PaymentAttempt[] => {
  const owned = invoices.filter((invoice) => invoice.creatorId === creatorId);
  const ids = new Set(owned.map(invoiceInternalIdOf));
  const stored = attempts.filter((attempt) => attempt.creatorId === creatorId && ids.has(attempt.invoiceId));
  const withFallback = [...stored];
  owned.forEach((invoice) => {
    if (!stored.some((attempt) => attempt.invoiceId === invoiceInternalIdOf(invoice))) {
      withFallback.push(...legacyPaymentAttempt(invoice));
    }
  });
  return structuredClone(withFallback);
};

export const paidAmountsByCurrency = (invoices: Invoice[], attempts: PaymentAttempt[]) => {
  const latest = new Map<string, PaymentAttempt>();
  attempts.forEach((attempt) => {
    const previous = latest.get(attempt.invoiceId);
    if (!previous || attempt.sequence > previous.sequence) latest.set(attempt.invoiceId, attempt);
  });
  const totals = new Map<string, number>();
  invoices.forEach((invoice) => {
    const attempt = latest.get(invoiceInternalIdOf(invoice));
    if (attempt?.status !== "PAID") return;
    const match = invoice.amount.match(/^([A-Z]{3})\s+([\d,]+(?:\.\d+)?)$/);
    if (!match) return;
    totals.set(match[1], (totals.get(match[1]) || 0) + Number(match[2].replaceAll(",", "")));
  });
  return [...totals].map(([currency, amount]) => ({ currency, amount }));
};
