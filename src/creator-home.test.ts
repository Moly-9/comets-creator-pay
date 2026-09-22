import { describe, expect, it, vi } from "vitest";
import { invoices } from "./data";
import { invoiceInternalIdOf, invoiceNumberOf, migrateInvoice } from "./creator-workflow";
import { firstThreeRowHeight, groupHomeAmountInvoices, homeAmountBucket, sortInvoicesByUpdatedAtDescending } from "./creator-home";
import { sumInvoiceAmounts } from "./payment-relations";
import type { Invoice, PaymentAttempt } from "./types";

describe("creator home Invoice ordering", () => {
  it("sorts updates newest first without mutating the source list", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T12:00:00+08:00"));
    try {
      const source = invoices.map(migrateInvoice);
      const originalOrder = source.map(invoiceNumberOf);

      const sorted = sortInvoicesByUpdatedAtDescending(source);

      expect(sorted.map((invoice) => invoice.updatedAt)).toEqual([
        "今天 17:05",
        "今天 16:20",
        "今天 14:30",
        "2026-09-21T02:30:00.000Z",
        "今天 10:12",
        "今天 09:00",
        "2026-09-20T04:40:00.000Z",
        "2026-09-20T03:30:00.000Z",
        "07-19 09:30",
        "07-16 14:32",
      ]);
      expect(source.map(invoiceNumberOf)).toEqual(originalOrder);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sizes the visible list to complete rows, never a partial fourth row", () => {
    expect(firstThreeRowHeight([], 10, 20)).toBe(20);
    expect(firstThreeRowHeight([140], 10, 20)).toBe(160);
    expect(firstThreeRowHeight([140, 160, 180], 10, 20)).toBe(520);
    expect(firstThreeRowHeight([140, 160, 180, 200], 10, 20)).toBe(520);
  });

  it("partitions the seeded Invoices into action required, processing and paid without overlap", () => {
    const groups = groupHomeAmountInvoices(invoices, []);
    expect(groups.PENDING.map(invoiceNumberOf)).toEqual(["INV-20260727-00001", "INV-20260728-00001", "INV-20260729-00001", "INV-20260920-00003"]);
    expect(sumInvoiceAmounts(groups.PENDING)).toBe("USD 5,830");
    expect(groups.PROCESSING).toEqual([]);
    expect(groups.PAID).toHaveLength(1);
    expect(sumInvoiceAmounts(groups.PAID)).toBe("USD 3,800");
    expect(new Set(Object.values(groups).flat().map(invoiceInternalIdOf)).size).toBe(5);
  });

  it("uses current review, payment and recovery states, including the latest attempt", () => {
    const base = migrateInvoice(invoices[0]);
    const make = (id: string, changes: Partial<Invoice>): Invoice => ({
      ...base, ...changes, id, invoiceId: id, invoiceNumber: id,
    });
    const pending = make("pending", { amount: "EUR 100", documentState: { kind: "INTERNAL", status: "WAITING_SIGNATURE" } });
    const internalReview = make("review", { documentState: { kind: "INTERNAL", status: "UNDER_REVIEW" } });
    const externalReview = make("external-review", { documentState: { kind: "EXTERNAL", status: "WAITING_MEDIA_REVIEW" } });
    const waitingPayment = make("waiting-payment", { documentState: { kind: "INTERNAL", status: "APPROVED" } });
    const failed = make("failed", { documentState: { kind: "INTERNAL", status: "APPROVED" }, paymentStatus: "FAILED", paymentRecoveryStatus: "AWAITING_CREATOR_UPDATE" });
    const correctionSubmitted = make("submitted", { ...failed, paymentRecoveryStatus: "PENDING_FINANCE_CONFIRMATION" });
    const inPayment = make("in-payment", { documentState: { kind: "INTERNAL", status: "APPROVED" }, paymentStatus: "PROCESSING" });
    const paid = make("paid", { documentState: { kind: "INTERNAL", status: "APPROVED" }, paymentStatus: "PAID" });
    const excluded = ["WAITING_UPLOAD", "RECOGNIZING", "WAITING_CONFIRMATION", "RETURNED_FOR_CORRECTION", "RETURNED_FOR_REUPLOAD", "RECOGNITION_FAILED", "CANCELLED"].map((status, index) =>
      make(`excluded-${index}`, { documentState: { kind: "EXTERNAL", status: status as "WAITING_UPLOAD" }, document: invoices[4].document }),
    );
    excluded.push(make("internal-return", { documentState: { kind: "INTERNAL", status: "CHANGES_REQUIRED" } }));
    const cases = [pending, internalReview, externalReview, waitingPayment, failed, correctionSubmitted, inPayment, paid, ...excluded];
    const groups = groupHomeAmountInvoices(cases, []);
    expect(groups.PENDING.map(invoiceInternalIdOf)).toEqual(["pending", "failed"]);
    expect(sumInvoiceAmounts(groups.PENDING)).toBe("EUR 100 · USD 2,100");
    expect(groups.PROCESSING.map(invoiceInternalIdOf)).toEqual(["review", "external-review", "waiting-payment", "submitted", "in-payment"]);
    expect(groups.PAID.map(invoiceInternalIdOf)).toEqual(["paid"]);
    expect(Object.values(groups).flat()).toHaveLength(8);

    const attempt: PaymentAttempt = {
      id: "attempt-1", invoiceId: invoiceInternalIdOf(waitingPayment), creatorId: waitingPayment.creatorId!,
      sequence: 1, channel: "Airwallex", status: "FAILED", createdAt: "2026-09-19", updatedAt: "2026-09-19",
    };
    expect(homeAmountBucket(waitingPayment, [attempt])).toBe("PENDING");
    expect(homeAmountBucket(waitingPayment, [attempt, { ...attempt, id: "attempt-2", sequence: 2, status: "PROCESSING" }])).toBe("PROCESSING");
    expect(homeAmountBucket(waitingPayment, [attempt, { ...attempt, id: "attempt-2", sequence: 2, status: "PAID" }])).toBe("PAID");
    expect(homeAmountBucket(waitingPayment, [{ ...attempt, creatorId: "another-creator" }])).toBe("PROCESSING");
    expect(homeAmountBucket(excluded[0], [{ ...attempt, invoiceId: invoiceInternalIdOf(excluded[0]), status: "PROCESSING" }])).toBeNull();
  });
});
