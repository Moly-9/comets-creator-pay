import { describe, expect, it } from "vitest";
import { contracts, invoices } from "./data";
import { buildCreatorTasks, invoiceInternalIdOf } from "./creator-workflow";
import { buildHomeTodos, buildRecentUpdates } from "./creator-home";
import { aggregateRequestProjects, assertAttemptAllowed, attemptsForInvoice, failedPaymentSnapshot, findLinkedContract, linkInvoicesToContracts, sumInvoiceAmounts } from "./payment-relations";
import { MockApiAdapter } from "./services";
import type { PaymentAttempt } from "./types";

describe("contract and payment relationships", () => {
  it("shows the latest failed execution snapshot before any live account or legacy Invoice fallback", () => {
    const invoice = { ...structuredClone(invoices.find((item) => item.id === "INV-20260728-00001")!), creatorId: "CREATOR-001", invoiceId: "invoice-creator-001-external-002" };
    const first: PaymentAttempt = {
      id: "attempt-1", invoiceId: invoice.invoiceId!, creatorId: invoice.creatorId!, sequence: 1,
      channel: "Airwallex", status: "FAILED", createdAt: "2026-07-28T08:00:00Z", updatedAt: "2026-07-28T09:00:00Z",
      payoutSnapshot: { ...invoice.payoutSnapshot!, accountNumber: "historical-first" },
    };
    const latest = { ...first, id: "attempt-2", sequence: 2, updatedAt: "2026-07-28T12:00:00Z", payoutSnapshot: { ...first.payoutSnapshot!, accountNumber: "historical-latest" } };
    expect(failedPaymentSnapshot(invoice, [first, latest])).toMatchObject({ source: "ATTEMPT", occurredAt: latest.updatedAt, snapshot: { accountNumber: "historical-latest" } });
    expect(failedPaymentSnapshot(invoice, [{ ...latest, payoutSnapshot: undefined }])).toMatchObject({ source: "INVOICE", snapshot: { accountNumber: invoice.payoutSnapshot?.accountNumber } });
    expect(failedPaymentSnapshot({ ...invoice, payoutSnapshot: undefined }, [])).toEqual({ source: "MISSING", occurredAt: undefined });
  });
  it("links only explicit active creator-owned contracts", () => {
    const linked = linkInvoicesToContracts(invoices, contracts, "CREATOR-001");
    expect(linked.filter((invoice) => invoice.contractId === "CON-260711-KOL-04")).toHaveLength(3);
    expect(linked[0]).toMatchObject({ contractId: undefined, linkageStatus: "NEEDS_REVIEW" });
    expect(findLinkedContract(linked[0], contracts)).toBeUndefined();
    expect(findLinkedContract(linked.find((invoice) => invoice.contractId === "CON-260711-KOL-04")!, contracts)?.id).toBe("CON-260711-KOL-04");
    const withoutBackendId = { ...invoices[1], contractId: undefined };
    expect(linkInvoicesToContracts([withoutBackendId], contracts, "CREATOR-001")[0].linkageStatus).toBe("NEEDS_REVIEW");
    const otherCreatorContract = { ...contracts[3], creatorId: "CREATOR-OTHER" };
    expect(linkInvoicesToContracts([invoices[1]], [otherCreatorContract], "CREATOR-001")[0].linkageStatus).toBe("NEEDS_REVIEW");
    expect(sumInvoiceAmounts(linked.filter((invoice) => invoice.contractId === "CON-260711-KOL-04"))).toBe("USD 3,730");
  });

  it("does not infer or restore an unsigned/expired link without a new backend reference", () => {
    const pending = contracts.find((item) => item.status === "PENDING_SIGNATURE")!;
    const invoice = { ...invoices[0], projectId: pending.projectId, projectName: pending.projectName, brand: pending.brand, contractId: pending.id, linkageStatus: "LINKED" as const };
    const [before] = linkInvoicesToContracts([invoice], contracts, "CREATOR-001");
    expect(before).toMatchObject({ contractId: undefined, linkageStatus: "NEEDS_REVIEW" });
    expect(findLinkedContract(invoice, contracts)).toBeUndefined();
    expect(aggregateRequestProjects([], contracts, [invoice])).toEqual([]);
    const signedContracts = contracts.map((item) => item.id === pending.id ? { ...item, status: "ACTIVE" as const } : item);
    const [after] = linkInvoicesToContracts([before], signedContracts, "CREATOR-001");
    expect(after).toMatchObject({ contractId: undefined, linkageStatus: "NEEDS_REVIEW" });
    const [reissued] = linkInvoicesToContracts([{ ...before, contractId: pending.id }], signedContracts, "CREATOR-001");
    expect(reissued).toMatchObject({ contractId: pending.id, linkageStatus: "LINKED" });
    const expired = { ...invoices[1], contractId: contracts[6].id };
    expect(linkInvoicesToContracts([expired], contracts, "CREATOR-001")[0]).toMatchObject({ contractId: undefined, linkageStatus: "NEEDS_REVIEW" });
  });

  it("guards a single successful payment and a single in-flight attempt", () => {
    const attempt: PaymentAttempt = { id: "a1", invoiceId: "i1", creatorId: "CREATOR-001", sequence: 1, channel: "Airwallex", status: "PAID", createdAt: "2026-09-18", updatedAt: "2026-09-18" };
    expect(() => assertAttemptAllowed([attempt], { ...attempt, id: "a2", sequence: 2, status: "PROCESSING" })).toThrow("已完成付款");
    expect(() => assertAttemptAllowed([{ ...attempt, status: "PROCESSING" }], { ...attempt, id: "a2", sequence: 2, status: "PROCESSING" })).toThrow("正在处理中");
    expect(attemptsForInvoice({ ...invoices[0], creatorId: "CREATOR-001" }, [attempt])).toEqual([]);
  });

  it("shows urgent to-dos first and limits updates to the latest three Invoice records", () => {
    const linked = linkInvoicesToContracts(invoices, contracts, "CREATOR-001");
    const attempts: PaymentAttempt[] = [{ id: "failed", invoiceId: "invoice-creator-001-external-002", creatorId: "CREATOR-001", sequence: 1, channel: "Airwallex", status: "FAILED", createdAt: "2026-07-28", updatedAt: "2026-07-28" }];
    const todos = buildHomeTodos(contracts, linked, buildCreatorTasks(contracts, linked), attempts);
    expect(todos[0].label).toBe("付款失败");
    expect(todos.find((todo) => todo.number === "INV-20260729-00001")?.contractNumber).toBe("CON-260711-KOL-04");
    expect(buildRecentUpdates(contracts, linked, attempts).map((item) => item.number)).toEqual(["INV-20260729-00001", "INV-20260728-00001", "INV-20260727-00001"]);
  });

  it("keeps empty home lists empty and derives payment status from the latest attempt", () => {
    expect(buildHomeTodos([], [], [], [])).toEqual([]);
    expect(buildRecentUpdates([], [], [])).toEqual([]);
    const invoice = { ...invoices[0], creatorId: "CREATOR-001", updatedAt: "今天 12:00", paymentStatus: "WAITING_PAYMENT" as const };
    const base: PaymentAttempt = {
      id: "attempt-1", invoiceId: invoiceInternalIdOf(invoice), creatorId: "CREATOR-001", sequence: 1,
      channel: "Airwallex", status: "FAILED", createdAt: "今天 10:00", updatedAt: "今天 10:00",
    };
    const active = { ...base, id: "attempt-2", sequence: 2, status: "PROCESSING" as const, updatedAt: "今天 11:00" };
    expect(buildRecentUpdates([], [invoice], [base, active])[0].status).toBe("付款中");
    expect(buildRecentUpdates([], [invoice], [base, { ...active, status: "PAID" }])[0].status).toBe("已到账");
  });

  it("keeps Invoice content and old failures immutable through review and retry", async () => {
    const adapter = new MockApiAdapter();
    const invoiceId = "INV-20260728-00001";
    const before = (await adapter.invoices.get(invoiceId)).data!;
    const previous = (await adapter.payments.listAttempts(invoiceId, "CREATOR-001")).data;
    expect(previous).toHaveLength(2);
    expect((await adapter.payments.listAttempts(invoiceId, "CREATOR-002")).data).toEqual([]);
    await expect(adapter.payments.approveCorrectionAndRetry(invoiceId, "SYSTEM")).rejects.toThrow("尚未复核");
    await adapter.payments.submitAccountCorrection(invoiceId, {
      submittedBy: "CREATOR-001",
      fieldKey: "account_number",
      correctedValue: "FR7630006000011234567890190",
    });
    const retry = (await adapter.payments.approveCorrectionAndRetry(invoiceId, "SYSTEM")).data;
    expect(retry.sequence).toBe(3);
    const after = (await adapter.invoices.get(invoiceId)).data!;
    expect(after.document).toEqual(before.document);
    expect(after.extractedData).toEqual(before.extractedData);
    expect(after.documentState).toEqual(before.documentState);
    expect((await adapter.payments.listAttempts(invoiceId, "CREATOR-001")).data.slice(1)).toEqual(previous);
    await adapter.payments.recordAttemptResult(retry.id, "PAID", "SYSTEM");
    await expect(adapter.payments.approveCorrectionAndRetry(invoiceId, "SYSTEM")).rejects.toThrow();
  });
});
