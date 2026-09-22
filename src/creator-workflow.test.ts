import { describe, expect, it } from "vitest";
import { invoices } from "./data";
import {
  invoiceDetailPaymentMeta,
  invoiceDetailPaymentTimeline,
  invoiceLifecycleTimeline,
  invoiceMatchesStatusFilters,
  invoiceListSummaryGroup,
  invoicePrimaryStatusMeta,
  migrateInvoice,
  summarizeInvoiceList,
} from "./creator-workflow";
import type {
  ExternalInvoiceCollectionStatus,
  InternalInvoiceReviewStatus,
  Invoice,
  PaymentFailureRecoveryStatus,
  PaymentStatus,
} from "./types";

const internalInvoice = (
  reviewStatus: InternalInvoiceReviewStatus,
  paymentStatus: PaymentStatus,
): Invoice => ({
  ...migrateInvoice(structuredClone(invoices[0])),
  documentState: { kind: "INTERNAL", status: reviewStatus },
  paymentStatus,
});

describe("creator homepage Invoice status helpers", () => {
  it.each([
    ["WAITING_SIGNATURE", "WAITING_PAYMENT", "签署 Invoice", "current"],
    ["UNDER_REVIEW", "WAITING_PAYMENT", "资料审核", "current"],
    ["CHANGES_REQUIRED", "WAITING_PAYMENT", "审核未通过", "error"],
    ["APPROVED", "WAITING_PAYMENT", "等待付款", "current"],
    ["APPROVED", "PROCESSING", "付款处理中", "current"],
    ["APPROVED", "FAILED", "付款失败", "error"],
    ["APPROVED", "PAID", "付款成功", "complete"],
  ] as const)("maps internal %s/%s to %s", (reviewStatus, paymentStatus, activeLabel, activeStatus) => {
    const nodes = invoiceLifecycleTimeline(internalInvoice(reviewStatus, paymentStatus));
    expect(nodes.find(([label]) => label === activeLabel)?.[1]).toBe(activeStatus);
    expect(nodes.filter(([, status]) => status === "current")).toHaveLength(paymentStatus === "PAID" ? 0 : 1);
    expect(nodes.filter(([label]) => label === "审核通过")).toHaveLength(1);
    if (reviewStatus !== "APPROVED") {
      expect(nodes.filter(([label]) => ["等待付款", "付款处理中", "付款成功"].includes(label)).every(([, status]) => status === "pending")).toBe(true);
    }
  });

  it.each([
    ["WAITING_UPLOAD", "上传 Invoice", "current"],
    ["RECOGNIZING", "识别与确认", "current"],
    ["WAITING_CONFIRMATION", "识别与确认", "current"],
    ["WAITING_MEDIA_REVIEW", "资料审核", "current"],
    ["RETURNED_FOR_CORRECTION", "审核未通过", "error"],
    ["RETURNED_FOR_REUPLOAD", "上传文件未通过", "error"],
    ["RECOGNITION_FAILED", "识别失败", "error"],
    ["APPROVED", "等待付款", "current"],
  ] as const)("maps external %s to %s", (reviewStatus, label, status) => {
    const invoice: Invoice = {
      ...migrateInvoice(structuredClone(invoices[1])),
      documentState: { kind: "EXTERNAL", status: reviewStatus },
      paymentStatus: "WAITING_PAYMENT",
    };
    const nodes = invoiceLifecycleTimeline(invoice);
    expect(nodes.find(([name]) => name === label)?.[1]).toBe(status);
    expect(nodes.filter(([, stage]) => stage === "current")).toHaveLength(1);
    if (reviewStatus !== "APPROVED") expect(nodes.at(-3)?.[1]).toBe("pending");
  });

  it("keeps a failed payment visible while advancing one repair stage at a time", () => {
    const invoice = internalInvoice("APPROVED", "FAILED");
    for (const [recovery, active] of [
      ["AWAITING_CREATOR_UPDATE", "待确认重试方案"],
      ["PENDING_FINANCE_CONFIRMATION", "重新打款申请已提交复核"],
      ["READY_FOR_RETRY", "等待重新付款"],
      ["RETRY_SUBMITTED", "付款处理中"],
    ] as const) {
      const nodes = invoiceLifecycleTimeline({ ...invoice, paymentRecoveryStatus: recovery });
      expect(nodes.find(([label]) => label === "付款失败")?.[1]).toBe("error");
      expect(nodes.filter(([, status]) => status === "current")).toHaveLength(1);
      expect(nodes.some(([label, status]) => label === active && status === "current")).toBe(true);
    }
    expect(invoiceLifecycleTimeline({ ...invoice, paymentRecoveryStatus: "RETRY_SUCCEEDED" }).filter(([, status]) => status === "current")).toHaveLength(0);
  });
  it("does not start payment stages before document approval", () => {
    for (const status of ["WAITING_SIGNATURE", "UNDER_REVIEW", "CHANGES_REQUIRED"] as const) {
      const invoice = internalInvoice(status, "WAITING_PAYMENT");
      expect(invoiceDetailPaymentMeta(invoice).label).toBe("未开始");
      expect(invoiceDetailPaymentTimeline(invoice).map(([, stage]) => stage)).toEqual(["pending", "pending", "pending", "pending"]);
    }
    expect(invoiceDetailPaymentTimeline(internalInvoice("APPROVED", "WAITING_PAYMENT"))[1]).toEqual(["等待付款", "current"]);
    expect(invoiceDetailPaymentTimeline(internalInvoice("APPROVED", "PAID")).map(([, stage]) => stage)).toEqual(["complete", "complete", "complete", "complete"]);
  });
  it("shows review status until the Invoice is approved", () => {
    expect(invoicePrimaryStatusMeta(
      internalInvoice("WAITING_SIGNATURE", "WAITING_PAYMENT"),
    ).label).toBe("待签署");
    expect(invoicePrimaryStatusMeta(
      internalInvoice("UNDER_REVIEW", "PROCESSING"),
    ).label).toBe("待审核");
  });

  it.each([
    ["WAITING_PAYMENT", "等待付款"],
    ["PROCESSING", "付款处理中"],
    ["FAILED", "付款失败"],
    ["PAID", "付款成功"],
  ] as const)("shows %s after approval", (paymentStatus, expectedLabel) => {
    expect(invoicePrimaryStatusMeta(
      internalInvoice("APPROVED", paymentStatus),
    ).label).toBe(expectedLabel);
  });

  it("combines review and payment filters", () => {
    const invoice = internalInvoice("APPROVED", "PROCESSING");
    expect(invoiceMatchesStatusFilters(
      invoice,
      "INTERNAL:APPROVED",
      "ALL",
    )).toBe(true);
    expect(invoiceMatchesStatusFilters(invoice, "ALL", "PROCESSING"))
      .toBe(true);
    expect(invoiceMatchesStatusFilters(
      invoice,
      "INTERNAL:APPROVED",
      "PROCESSING",
    )).toBe(true);
    expect(invoiceMatchesStatusFilters(
      invoice,
      "INTERNAL:WAITING_SIGNATURE",
      "PROCESSING",
    )).toBe(false);
    expect(invoiceMatchesStatusFilters(
      invoice,
      "INTERNAL:APPROVED",
      "PAID",
    )).toBe(false);
  });
});

describe("creator Invoice list summary", () => {
  const externalInvoice = (
    reviewStatus: ExternalInvoiceCollectionStatus,
    paymentStatus: PaymentStatus = "WAITING_PAYMENT",
    paymentRecoveryStatus?: PaymentFailureRecoveryStatus,
  ): Invoice => ({
    ...migrateInvoice(structuredClone(invoices[0])),
    documentState: { kind: "EXTERNAL", status: reviewStatus },
    paymentStatus,
    paymentRecoveryStatus,
  });

  it.each([
    ["WAITING_SIGNATURE", "TODO"],
    ["CREATOR_FEEDBACK", "TODO"],
    ["CHANGES_REQUIRED", "TODO"],
    ["UNDER_REVIEW", "PROCESSING"],
    ["APPROVED", "PROCESSING"],
  ] as const)("groups internal %s as %s", (reviewStatus, expected) => {
    expect(invoiceListSummaryGroup(internalInvoice(reviewStatus, "WAITING_PAYMENT"))).toBe(expected);
  });

  it.each([
    ["DRAFT", "TODO"],
    ["WAITING_UPLOAD", "TODO"],
    ["RECOGNIZING", "TODO"],
    ["WAITING_CONFIRMATION", "TODO"],
    ["RETURNED_FOR_CORRECTION", "TODO"],
    ["RETURNED_FOR_REUPLOAD", "TODO"],
    ["RECOGNITION_FAILED", "TODO"],
    ["WAITING_MEDIA_REVIEW", "PROCESSING"],
    ["APPROVED", "PROCESSING"],
    ["CANCELLED", "EXCLUDED"],
  ] as const)("groups external %s as %s", (reviewStatus, expected) => {
    expect(invoiceListSummaryGroup(externalInvoice(reviewStatus))).toBe(expected);
  });

  it("moves a payment failure from creator action to processing after correction submission", () => {
    expect(invoiceListSummaryGroup(externalInvoice("APPROVED", "FAILED", "AWAITING_CREATOR_UPDATE"))).toBe("TODO");
    for (const recovery of ["CREATOR_UPDATED", "PENDING_FINANCE_CONFIRMATION", "READY_FOR_RETRY", "RETRY_SUBMITTED", "RETRY_SUCCEEDED"] as const) {
      expect(invoiceListSummaryGroup(externalInvoice("APPROVED", "FAILED", recovery))).toBe("PROCESSING");
    }
  });

  it.each([
    ["WAITING_PAYMENT", undefined, "PROCESSING"],
    ["PROCESSING", undefined, "PROCESSING"],
    ["FAILED", "AWAITING_CREATOR_UPDATE", "TODO"],
    ["PAID", undefined, "PAID"],
  ] as const)("groups approved payment state %s with recovery %s as %s", (paymentStatus, recoveryStatus, expected) => {
    expect(invoiceListSummaryGroup(externalInvoice("APPROVED", paymentStatus, recoveryStatus))).toBe(expected);
  });

  it("prioritizes actual payment execution and keeps the summary equation exact", () => {
    const sample = [
      internalInvoice("WAITING_SIGNATURE", "WAITING_PAYMENT"),
      externalInvoice("WAITING_MEDIA_REVIEW"),
      externalInvoice("APPROVED", "PROCESSING"),
      externalInvoice("APPROVED", "PAID"),
      externalInvoice("CANCELLED"),
    ];
    const summary = summarizeInvoiceList(sample);
    expect(summary).toEqual({ all: 4, todo: 1, processing: 2, paid: 1 });
    expect(summary.all).toBe(summary.todo + summary.processing + summary.paid);
  });
});
