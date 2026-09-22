import { invoiceInternalIdOf, invoiceNumberOf, migrateInvoice, recoveryStatusIsSubmitted } from "./creator-workflow";
import { attemptsForInvoice, findLinkedContract, invoicePaymentState } from "./payment-relations";
import type { Contract, CreatorTask, Invoice, PaymentAttempt } from "./types";

const timeOfDayMinutes = (value: string) => {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};

const invoiceUpdatedAtRank = (invoice: Invoice) => {
  const value = invoice.updatedAt.trim();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  if (value === "刚刚") return Date.now();
  if (value.startsWith("今天")) return dayStart.getTime() + timeOfDayMinutes(value) * 60_000;
  if (value.startsWith("昨天")) return dayStart.getTime() - 86_400_000 + timeOfDayMinutes(value) * 60_000;

  const shortDate = value.match(/^(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (shortDate) {
    const year = Number(invoice.issuedAt.slice(0, 4)) || new Date().getFullYear();
    return Date.UTC(
      year,
      Number(shortDate[1]) - 1,
      Number(shortDate[2]),
      Number(shortDate[3] || 0),
      Number(shortDate[4] || 0),
    );
  }

  const updatedAt = Date.parse(value);
  if (Number.isFinite(updatedAt)) return updatedAt;
  const issuedAt = Date.parse(invoice.issuedAt);
  return Number.isFinite(issuedAt) ? issuedAt : 0;
};

export const sortInvoicesByUpdatedAtDescending = (items: Invoice[]) =>
  items
    .map((invoice, index) => ({ invoice, index, rank: invoiceUpdatedAtRank(invoice) }))
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map(({ invoice }) => invoice);

/** The visible window ends after three complete rows, even when text wraps. */
export function firstThreeRowHeight(rowHeights: number[], gap: number, verticalPadding: number) {
  const visible = rowHeights.slice(0, 3);
  return visible.reduce((sum, height) => sum + height, verticalPadding)
    + Math.max(0, visible.length - 1) * gap;
}

export type HomeAmountBucket = "PENDING" | "PROCESSING" | "PAID";

/** One current Invoice contributes to at most one home amount card. */
export function homeAmountBucket(source: Invoice, attempts: PaymentAttempt[]): HomeAmountBucket | null {
  const invoice = migrateInvoice(source);
  const status = invoice.documentState!.status;
  if (!["WAITING_SIGNATURE", "UNDER_REVIEW", "WAITING_MEDIA_REVIEW", "APPROVED"].includes(status)) return null;
  const payment = invoicePaymentState(invoice, attempts);
  if (payment === "PAID") return "PAID";
  if (payment === "FAILED") {
    return recoveryStatusIsSubmitted(invoice.paymentRecoveryStatus) ? "PROCESSING" : "PENDING";
  }
  if (payment === "PROCESSING") return "PROCESSING";
  if (status === "WAITING_SIGNATURE") return "PENDING";
  if (["UNDER_REVIEW", "WAITING_MEDIA_REVIEW", "APPROVED"].includes(status)) return "PROCESSING";
  return null;
}

export function groupHomeAmountInvoices(invoices: Invoice[], attempts: PaymentAttempt[]) {
  const groups: Record<HomeAmountBucket, Invoice[]> = { PENDING: [], PROCESSING: [], PAID: [] };
  invoices.forEach((invoice) => {
    const bucket = homeAmountBucket(invoice, attempts);
    if (bucket) groups[bucket].push(invoice);
  });
  return groups;
}

export function relativeUpdateTime(value: string) {
  if (/^(今天|昨天|刚刚)/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const clock = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (date.toDateString() === now.toDateString()) return `今天 ${clock}`;
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${clock}`;
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${clock}`;
}

export interface HomeTodo {
  id: string;
  label: string;
  number: string;
  contractNumber: string;
  amount: string;
  description: string;
  action: string;
  to: string;
  tone: "danger" | "amber" | "blue";
  priority: number;
  updatedAt: string;
}

const taskPresentation: Record<CreatorTask["type"], { label: string; action: string; tone: HomeTodo["tone"]; priority: number }> = {
  PAYMENT_ACCOUNT_CORRECTION: { label: "付款失败", action: "去处理", tone: "danger", priority: 0 },
  INTERNAL_INVOICE_SIGNATURE: { label: "待签署 Invoice", action: "去签署", tone: "amber", priority: 1 },
  CONTRACT_SIGNATURE: { label: "待签署合同", action: "去签署", tone: "amber", priority: 2 },
  EXTERNAL_INVOICE_UPLOAD: { label: "待处理 Invoice", action: "去处理", tone: "blue", priority: 3 },
  EXTERNAL_INVOICE_CORRECTION: { label: "待修改 Invoice", action: "去处理", tone: "blue", priority: 3 },
  EXTERNAL_INVOICE_REUPLOAD: { label: "待重传 Invoice", action: "去处理", tone: "blue", priority: 3 },
  INVOICE_FEEDBACK_PROCESSING: { label: "待修改 Invoice", action: "去处理", tone: "blue", priority: 3 },
  INVOICE_PROCESSING: { label: "处理中", action: "查看", tone: "blue", priority: 4 },
  PAYMENT_COMPLETED: { label: "已到账", action: "查看", tone: "blue", priority: 4 },
};

export function buildHomeTodos(contracts: Contract[], invoices: Invoice[], tasks: CreatorTask[], attempts: PaymentAttempt[]): HomeTodo[] {
  return tasks.filter((task) => task.group === "TODO").flatMap((task) => {
    const invoice = invoices.find((item) => invoiceInternalIdOf(item) === task.resourceId);
    const contract = task.type === "CONTRACT_SIGNATURE"
      ? contracts.find((item) => item.id === task.resourceId)
      : invoice ? findLinkedContract(invoice, contracts) : undefined;
    if (invoice && task.type === "PAYMENT_ACCOUNT_CORRECTION" && (
      invoicePaymentState(invoice, attempts) !== "FAILED"
      || invoice.paymentRecoveryStatus !== "AWAITING_CREATOR_UPDATE"
    )) return [];
    const meta = taskPresentation[task.type];
    return [{
      id: task.id,
      label: meta.label,
      number: invoice ? invoiceNumberOf(invoice) : contract?.id || task.resourceNumber,
      contractNumber: invoice ? contract?.id || "—" : "—",
      amount: invoice?.amount || "—",
      description: task.type === "PAYMENT_ACCOUNT_CORRECTION" ? "请更新收款信息" : task.type === "INTERNAL_INVOICE_SIGNATURE" || task.type === "CONTRACT_SIGNATURE" ? "待您签署" : task.description,
      action: meta.action,
      to: task.deepLink,
      tone: meta.tone,
      priority: meta.priority,
      updatedAt: task.updatedAt,
    }];
  }).sort((a, b) => a.priority - b.priority || updateRank(b.updatedAt) - updateRank(a.updatedAt));
}

const updateRank = (value: string) => invoiceUpdatedAtRank({ updatedAt: value, issuedAt: "2026-07-01" } as Invoice);

export interface HomeUpdate {
  id: string;
  number: string;
  contractNumber: string;
  amount: string;
  status: string;
  tone: "danger" | "amber" | "blue" | "success";
  updatedAt: string;
  action: string;
  to: string;
}

export function buildRecentUpdates(contracts: Contract[], invoices: Invoice[], attempts: PaymentAttempt[]): HomeUpdate[] {
  return sortInvoicesByUpdatedAtDescending(invoices.map(migrateInvoice)).slice(0, 3).map((invoice) => {
    const payment = invoicePaymentState(invoice, attempts);
    const review = invoice.documentState?.status;
    const failed = payment === "FAILED" && invoice.paymentRecoveryStatus === "AWAITING_CREATOR_UPDATE";
    const status = failed ? "付款失败" : payment === "PAID" ? "已到账"
      : payment === "PROCESSING" ? "付款中"
        : payment === "FAILED" ? "审核中"
        : review === "WAITING_SIGNATURE" ? "待签署"
          : ["UNDER_REVIEW", "WAITING_MEDIA_REVIEW"].includes(review || "") ? "审核中"
            : review === "APPROVED" ? "待付款" : "待确认";
    const contract = findLinkedContract(invoice, contracts);
    return {
      id: invoiceInternalIdOf(invoice),
      number: invoiceNumberOf(invoice),
      contractNumber: contract?.id || "待核对关联",
      amount: invoice.amount,
      status,
      tone: failed ? "danger" : payment === "PAID" ? "success" : status === "待签署" ? "amber" : "blue",
      updatedAt: relativeUpdateTime(invoice.updatedAt),
      action: failed && invoice.paymentRecoveryStatus === "AWAITING_CREATOR_UPDATE" ? "去处理" : "查看详情",
      to: `/invoices/${invoiceNumberOf(invoice)}`,
    };
  });
}
