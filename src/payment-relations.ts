import { invoiceInternalIdOf, migrateInvoice } from "./creator-workflow";
import type { Contract, Invoice, InvoicePayoutSnapshot, PaymentAttempt, RequestProject } from "./types";

export function findLinkedContract(invoice: Invoice, contracts: Contract[]): Contract | undefined {
  if (invoice.linkageStatus !== "LINKED" || !invoice.contractId) return undefined;
  return contracts.find((contract) => contract.status === "ACTIVE"
    && contract.id === invoice.contractId
    && contract.creatorId === invoice.creatorId);
}

/** Only an explicit backend contract ID can link an active, creator-owned contract. */
export function linkInvoicesToContracts(invoices: Invoice[], contracts: Contract[], creatorId: string): Invoice[] {
  return invoices.map((source) => {
    const invoice = migrateInvoice(source);
    if (invoice.creatorId && invoice.creatorId !== creatorId) {
      return { ...invoice, contractId: undefined, linkageStatus: "NEEDS_REVIEW" };
    }
    const linked = invoice.contractId ? contracts.find((contract) =>
      contract.id === invoice.contractId
      && contract.status === "ACTIVE"
      && contract.creatorId === creatorId,
    ) : undefined;
    return {
      ...invoice,
      creatorId: invoice.creatorId || creatorId,
      contractId: linked?.id,
      linkageStatus: linked ? "LINKED" : "NEEDS_REVIEW",
    };
  });
}

export const attemptsForInvoice = (invoice: Invoice, attempts: PaymentAttempt[]) =>
  attempts.filter((attempt) => attempt.invoiceId === invoiceInternalIdOf(invoice)
    && attempt.creatorId === invoice.creatorId)
    .sort((left, right) => right.sequence - left.sequence || right.updatedAt.localeCompare(left.updatedAt));

/** An execution snapshot is authoritative; the Invoice snapshot is a legacy fallback. */
export function failedPaymentSnapshot(invoice: Invoice, attempts: PaymentAttempt[]): {
  snapshot?: InvoicePayoutSnapshot;
  occurredAt?: string;
  source: "ATTEMPT" | "INVOICE" | "MISSING";
} {
  const failed = attemptsForInvoice(invoice, attempts).find((attempt) => attempt.status === "FAILED");
  if (failed?.payoutSnapshot) return { snapshot: failed.payoutSnapshot, occurredAt: failed.updatedAt, source: "ATTEMPT" };
  if (invoice.payoutSnapshot) return { snapshot: invoice.payoutSnapshot, occurredAt: failed?.updatedAt || invoice.updatedAt, source: "INVOICE" };
  return { occurredAt: failed?.updatedAt, source: "MISSING" };
}

export function assertAttemptAllowed(attempts: PaymentAttempt[], next: PaymentAttempt) {
  const existing = attempts.filter((attempt) => attempt.invoiceId === next.invoiceId && attempt.creatorId === next.creatorId);
  if (existing.some((attempt) => attempt.id === next.id || attempt.sequence === next.sequence)) {
    throw new Error("付款尝试编号重复");
  }
  if (existing.some((attempt) => attempt.status === "PAID")) throw new Error("Invoice 已完成付款，不能再次尝试");
  if (existing.some((attempt) => attempt.status === "PROCESSING")) throw new Error("已有付款尝试正在处理中");
}

export function legacyPaymentAttempt(invoice: Invoice): PaymentAttempt[] {
  const status = invoice.paymentStatus === "FAILED" ? "FAILED"
    : invoice.paymentStatus === "PAID" ? "PAID"
      : invoice.paymentStatus === "PROCESSING" ? "PROCESSING" : undefined;
  if (!status) return [];
  return [{
    id: `attempt:legacy:${invoiceInternalIdOf(invoice)}`,
    invoiceId: invoiceInternalIdOf(invoice),
    creatorId: invoice.creatorId || "CREATOR-001",
    sequence: 1,
    channel: invoice.channel,
    payoutAccountId: invoice.payoutAccountId,
    payoutSnapshot: invoice.payoutSnapshot ? structuredClone(invoice.payoutSnapshot) : undefined,
    status,
    createdAt: invoice.issuedAt,
    updatedAt: invoice.updatedAt,
    failureReason: status === "FAILED" ? invoice.paymentFailureReason : undefined,
  }];
}

export function invoicePaymentState(invoice: Invoice, attempts: PaymentAttempt[]) {
  const latest = attemptsForInvoice(invoice, attempts)[0];
  return latest?.status || invoice.paymentStatus || "WAITING_PAYMENT";
}

export function sumInvoiceAmounts(invoices: Invoice[]) {
  const totals = new Map<string, number>();
  invoices.forEach((invoice) => {
    const match = invoice.amount.match(/^([^\s]+)\s+([\d,]+(?:\.\d+)?)$/);
    if (!match) return;
    totals.set(match[1], (totals.get(match[1]) || 0) + Number(match[2].replace(/,/g, "")));
  });
  return [...totals].sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, value]) => `${currency} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`).join(" · ") || "—";
}

export function aggregateRequestProjects(base: RequestProject[], contracts: Contract[], invoices: Invoice[]): RequestProject[] {
  const groups = new Map<string, Invoice[]>();
  invoices.forEach((invoice) => {
    if (!invoice.contractId || !findLinkedContract(invoice, contracts)) return;
    groups.set(invoice.contractId, [...(groups.get(invoice.contractId) || []), invoice]);
  });
  return [...groups].map(([contractId, children]) => {
    const contract = contracts.find((item) => item.id === contractId)!;
    const existing = base.find((request) => request.contractIds.includes(contractId));
    const urgency = (status: Invoice["status"]) => ({ PAYMENT_FAILED: 0, CHANGES_REQUIRED: 1, DRAFT_SIGNATURE: 2, PENDING_CONFIRMATION: 3, PENDING_REVIEW: 4, APPROVED: 5, PAID: 6 })[status];
    const representative = [...children].sort((a, b) => urgency(a.status) - urgency(b.status))[0];
    const latest = [...children].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return {
      ...(existing || {
        id: contract.projectId,
        progress: [],
        issues: [],
      }),
      projectName: contract.projectName,
      brand: contract.brand,
      amount: sumInvoiceAmounts(children),
      status: representative.status,
      contractIds: [contractId],
      invoiceIds: children.map((invoice) => invoice.id),
      contractStatus: contract.status,
      invoiceStatus: ({ PAYMENT_FAILED: "付款异常", CHANGES_REQUIRED: "待修改", DRAFT_SIGNATURE: "待签署", PENDING_CONFIRMATION: "待确认", PENDING_REVIEW: "审核中", APPROVED: "待付款", PAID: "已到账" })[representative.status],
      updatedAt: latest.updatedAt,
      issues: representative.status === "PAYMENT_FAILED" ? existing?.issues || [] : [],
    };
  });
}
