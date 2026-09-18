import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contracts, initialProfile, invoices } from "../../data";
import { buildCreatorNotifications, invoiceInternalIdOf, migrateInvoice } from "../../creator-workflow";
import { MockApiAdapter } from "../../services";
import { validateExternalInvoiceConfirmation } from "./workflow";

const CREATOR_ID = "CREATOR-001";
const WAITING_UPLOAD_ID = "invoice-creator-001-external-003";
const REUPLOAD_ID = "invoice-creator-001-external-004";

const settle = async <T>(promise: Promise<T>): Promise<T> => {
  const outcome = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  const result = await outcome;
  if ("error" in result) throw result.error;
  return result.value;
};

const command = (invoice: { version?: number }, suffix: string) => ({
  creatorId: CREATOR_ID,
  expectedVersion: invoice.version || 1,
  clientRequestId: `test:${suffix}`,
});

const file = (id: string) => ({
  id,
  name: `${id}.pdf`,
  mimeType: "application/pdf",
  size: 2048,
  previewUrl: "data:application/pdf;base64,AA==",
});

describe("external Invoice collection workflow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows a first upload only from WAITING_UPLOAD", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = await settle(adapter.invoices.uploadExternalInvoiceFile({
      invoiceId: WAITING_UPLOAD_ID,
      ...command(current, "upload-first"),
      payoutAccountId: initialProfile.payoutAccounts[0].id,
      file: file("first"),
    }));
    expect(uploaded.data.documentState).toEqual({ kind: "EXTERNAL", status: "RECOGNIZING" });
    await expect(settle(adapter.invoices.uploadExternalInvoiceFile({
      invoiceId: WAITING_UPLOAD_ID,
      ...command(uploaded.data, "upload-again"),
      payoutAccountId: initialProfile.payoutAccounts[0].id,
      file: file("second"),
    }))).rejects.toThrow("当前状态不允许上传");
  });

  it("recognizes on the current Invoice and creates no recognition-complete notification", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({
      invoiceId: WAITING_UPLOAD_ID,
      ...command(current, "upload-recognize"),
      payoutAccountId: initialProfile.payoutAccounts[0].id,
      file: file("recognize"),
    }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({
      invoiceId: WAITING_UPLOAD_ID,
      ...command(uploaded, "recognize"),
    }))).data;
    expect(recognized.documentState).toEqual({ kind: "EXTERNAL", status: "WAITING_CONFIRMATION" });
    expect(recognized.recognitionSnapshots).toHaveLength(1);
    expect(buildCreatorNotifications(contracts, [recognized]).filter((item) => item.resourceId === WAITING_UPLOAD_ID)).toHaveLength(0);
  });

  it("keeps old files and appends a superseding version on re-upload", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(REUPLOAD_ID, CREATOR_ID))).data!;
    const previous = current.sourceFileVersions?.at(-1);
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({
      invoiceId: REUPLOAD_ID,
      ...command(current, "reupload"),
      payoutAccountId: initialProfile.payoutAccounts[0].id,
      file: file("replacement"),
    }))).data;
    expect(uploaded.sourceFileVersions?.length).toBe((current.sourceFileVersions?.length || 0) + 1);
    expect(uploaded.sourceFileVersions?.at(-1)?.supersedesFileVersionId).toBe(previous?.fileVersionId);
    expect(uploaded.sourceFileVersions?.[0]).toEqual(current.sourceFileVersions?.[0]);
  });

  it("permits re-upload from recognition failure and blocks confirmation", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({
      invoiceId: WAITING_UPLOAD_ID,
      ...command(current, "upload-fail"),
      payoutAccountId: initialProfile.payoutAccounts[0].id,
      file: file("unreadable"),
    }))).data;
    const failed = (await settle(adapter.invoices.retryExternalInvoiceRecognition({
      invoiceId: WAITING_UPLOAD_ID,
      ...command(uploaded, "recognize-fail"),
      simulateFailure: true,
    }))).data;
    expect(failed.documentState).toEqual({ kind: "EXTERNAL", status: "RECOGNITION_FAILED" });
    await expect(settle(adapter.invoices.confirmExternalInvoice({
      invoiceId: WAITING_UPLOAD_ID,
      ...command(failed, "confirm-failed"),
      acknowledgement: true,
    }))).rejects.toThrow("不能提交审核");
    const reuploaded = await settle(adapter.invoices.uploadExternalInvoiceFile({
      invoiceId: WAITING_UPLOAD_ID,
      ...command(failed, "replace-failed"),
      payoutAccountId: initialProfile.payoutAccounts[0].id,
      file: file("clear-copy"),
    }));
    expect(reuploaded.data.documentState?.status).toBe("RECOGNIZING");
  });

  it("preserves OCR originals while saving corrections in a new confirmation snapshot", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, "upload-correct"), payoutAccountId: initialProfile.payoutAccounts[0].id, file: file("correct") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, "recognize-correct") }))).data;
    const original = recognized.recognitionSnapshots?.[0].fields.PUBLISHER;
    const corrected = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "correct"), values: { PUBLISHER: "Corrected Name" } }))).data;
    expect(corrected.recognitionSnapshots?.[0].fields.PUBLISHER).toBe(original);
    expect(corrected.confirmedSnapshots?.at(-1)?.values.PUBLISHER).toBe("Corrected Name");
    expect(corrected.confirmedSnapshots?.at(-1)?.corrections[0]).toMatchObject({ recognizedValue: original, confirmedValue: "Corrected Name", correctedBy: CREATOR_ID });
  });

  it.each([
    ["PUBLISHER", "Someone Else", "Invoice From"],
    ["ADVERTISER", "Other Company", "Bill To"],
    ["AMOUNT", "1", "金额"],
    ["CURRENCY", "EUR", "币种"],
    ["PAYMENT_ACCOUNT", JSON.stringify({ account_number: "wrong" }), "收款账户不匹配"],
  ] as const)("blocks confirmation when %s is invalid", async (field, value, message) => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, `upload-${field}`), payoutAccountId: initialProfile.payoutAccounts[0].id, file: file(field) }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, `recognize-${field}`) }))).data;
    const corrected = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, `correct-${field}`), values: { [field]: value } }))).data;
    await expect(settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(corrected, `confirm-${field}`), acknowledgement: true }))).rejects.toThrow(message);
  });

  it("requires an explicit acknowledgement and then enters media review", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(REUPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: REUPLOAD_ID, ...command(current, "upload-confirm"), payoutAccountId: initialProfile.payoutAccounts[0].id, file: file("confirm") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: REUPLOAD_ID, ...command(uploaded, "recognize-confirm") }))).data;
    await expect(settle(adapter.invoices.confirmExternalInvoice({ invoiceId: REUPLOAD_ID, ...command(recognized, "without-ack"), acknowledgement: false as true }))).rejects.toThrow("核对声明");
    const confirmed = await settle(adapter.invoices.confirmExternalInvoice({ invoiceId: REUPLOAD_ID, ...command(recognized, "with-ack"), acknowledgement: true }));
    expect(confirmed.data.documentState).toEqual({ kind: "EXTERNAL", status: "WAITING_MEDIA_REVIEW" });
    expect(confirmed.data.confirmedSnapshots?.at(-1)?.payoutAccountId).toBe(initialProfile.payoutAccounts[0].id);
  });

  it("rejects stale versions, cross-creator access and cross-creator mutations", async () => {
    const adapter = new MockApiAdapter();
    expect((await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, "CREATOR-OTHER"))).data).toBeUndefined();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    await expect(settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, creatorId: "CREATOR-OTHER", expectedVersion: current.version || 1, clientRequestId: "cross-owner", payoutAccountId: initialProfile.payoutAccounts[0].id, file: file("cross") }))).rejects.toThrow("无权访问");
    await expect(settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, creatorId: CREATOR_ID, expectedVersion: 999, clientRequestId: "stale", payoutAccountId: initialProfile.payoutAccounts[0].id, file: file("stale") }))).rejects.toThrow("已更新");
  });

  it("treats duplicate client requests idempotently without adding a second record", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const input = { invoiceId: WAITING_UPLOAD_ID, ...command(current, "idempotent"), payoutAccountId: initialProfile.payoutAccounts[0].id, file: file("idempotent") };
    const first = await settle(adapter.invoices.uploadExternalInvoiceFile(input));
    const duplicate = await settle(adapter.invoices.uploadExternalInvoiceFile(input));
    expect(duplicate.data.version).toBe(first.data.version);
    expect(duplicate.data.sourceFileVersions).toHaveLength(first.data.sourceFileVersions?.length || 0);
    expect((await settle(adapter.invoices.listExternalInvoices(CREATOR_ID))).data.filter((item) => invoiceInternalIdOf(item) === WAITING_UPLOAD_ID)).toHaveLength(1);
  });

  it("reports every concrete blocker and never requires missing OCR payout fields", () => {
    const invoice = migrateInvoice(invoices.find((item) => invoiceInternalIdOf(item) === WAITING_UPLOAD_ID)!);
    invoice.recognitionSnapshots = [{ recognitionId: "r1", fileVersionId: "f1", engineVersion: "mock", recognizedAt: new Date().toISOString(), fields: { SOURCE_INVOICE_NUMBER: invoice.invoiceNumber!, INVOICE_DATE: "2026-09-19", PUBLISHER: "Wrong", ADVERTISER: "Wrong", DESCRIPTION: "Services", AMOUNT: "1", CURRENCY: "EUR", PAYMENT_ACCOUNT: "{}" }, extractedData: { invoiceFrom: "Wrong", billTo: "Wrong", invoiceDate: "2026-09-19", currency: "EUR", total: "1", paymentDetails: {}, invoiceFromMatchesProfile: false, billToMatchesComets: false } }];
    const issues = validateExternalInvoiceConfirmation({ invoice, profile: initialProfile });
    expect(issues.map((item) => item.field)).toEqual(expect.arrayContaining(["PAYOUT_ACCOUNT", "PUBLISHER", "ADVERTISER", "AMOUNT", "CURRENCY"]));
  });

  it("keeps payment failure approved and records an owned account correction", async () => {
    const adapter = new MockApiAdapter();
    const failed = (await settle(adapter.invoices.getExternalInvoice("invoice-creator-001-external-002", CREATOR_ID))).data!;
    expect(failed.documentState).toEqual({ kind: "EXTERNAL", status: "APPROVED" });
    const corrected = await settle(adapter.payments.submitAccountCorrection(invoiceInternalIdOf(failed), { fieldKey: "account_number", correctedValue: "998877665544", submittedBy: CREATOR_ID, expectedVersion: failed.version, clientRequestId: "payment-correction" }));
    expect(corrected.data.documentState).toEqual({ kind: "EXTERNAL", status: "APPROVED" });
    expect(corrected.data.paymentStatus).toBe("FAILED");
    expect(corrected.data.paymentRecoveryStatus).toBe("PENDING_FINANCE_CONFIRMATION");
    await expect(settle(adapter.payments.submitAccountCorrection(invoiceInternalIdOf(failed), { fieldKey: "account_number", correctedValue: "112233", submittedBy: "CREATOR-OTHER" }))).rejects.toThrow("无权访问");
  });

  it("keeps creator notifications free of bank data, project names and payment execution identifiers", () => {
    const notifications = buildCreatorNotifications(contracts, invoices);
    const serialized = JSON.stringify(notifications);
    expect(serialized).not.toContain(initialProfile.payoutAccounts[0].accountNumber);
    expect(serialized).not.toMatch(/七月联名|Mellow Home|Payment Order|Payout ID|Payment Batch|Transfer ID/);
    expect(serialized).not.toMatch(/识别完成|查看识别结果/);
  });
});
