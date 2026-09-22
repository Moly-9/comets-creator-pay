import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contracts, initialProfile, invoices } from "../../data";
import { buildCreatorNotifications, invoiceInternalIdOf, migrateInvoice } from "../../creator-workflow";
import { MockApiAdapter } from "../../services";
import { adminStore } from "../../admin-store";
import { canCorrectExternalInvoice, currentExternalCorrection, payoutAccountFields, validateExternalInvoiceConfirmation } from "./workflow";

const CREATOR_ID = "CREATOR-001";
const accountId = initialProfile.payoutAccounts[0].id;
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

const selectAccount = async (adapter: MockApiAdapter, invoiceId: string, invoice: { version?: number }, suffix: string, payoutAccountId = accountId) =>
  (await settle(adapter.invoices.selectExternalInvoicePayoutAccount({
    invoiceId, ...command(invoice, `${suffix}-select`), payoutAccountId,
  }))).data;

const confirmPages = async (adapter: MockApiAdapter, invoiceId: string, invoice: { version?: number; payoutAccountId?: string; extractedData?: { description?: string } }, suffix: string) => {
  const withDescription = invoice.extractedData?.description?.trim() ? invoice
    : (await settle(adapter.invoices.correctExternalInvoiceRecognition({
      invoiceId, ...command(invoice, `${suffix}-description`), values: { DESCRIPTION: "票面服务描述" },
    }))).data;
  const selected = withDescription.payoutAccountId ? withDescription : await selectAccount(adapter, invoiceId, withDescription, suffix);
  const information = (await settle(adapter.invoices.confirmExternalInvoicePage({
    invoiceId, ...command(selected, `${suffix}-invoice`), page: "INVOICE",
  }))).data;
  return (await settle(adapter.invoices.confirmExternalInvoicePage({
    invoiceId, ...command(information, `${suffix}-payout`), page: "PAYOUT",
  }))).data;
};

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

  it("allows creator invoice corrections only before review or after a field-correction return", () => {
    expect(canCorrectExternalInvoice("WAITING_CONFIRMATION")).toBe(true);
    expect(canCorrectExternalInvoice("RETURNED_FOR_CORRECTION")).toBe(true);
    for (const status of ["WAITING_UPLOAD", "RECOGNIZING", "WAITING_MEDIA_REVIEW", "RETURNED_FOR_REUPLOAD", "APPROVED", "RECOGNITION_FAILED", "CANCELLED"] as const) {
      expect(canCorrectExternalInvoice(status)).toBe(false);
    }
  });

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
    expect(uploaded.data.payoutAccountId).toBeUndefined();
    expect(uploaded.data.payoutSnapshot).toBeUndefined();
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
    expect(recognized.recognitionSnapshots?.at(-1)?.fields.DESCRIPTION).toBe("");
    expect(recognized.extractedData?.description).toBe("");
    expect(buildCreatorNotifications(contracts, [recognized]).filter((item) => item.resourceId === WAITING_UPLOAD_ID)).toHaveLength(0);
  });

  it("uploads without an account, then requires an owned usable account selected after recognition", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, "file-only"), file: file("file-only") }))).data;
    expect(uploaded.payoutAccountId).toBeUndefined();
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, "file-only-recognition") }))).data;
    expect(recognized.recognitionSnapshots?.at(-1)?.fields.PAYMENT_ACCOUNT).toBe("{}");
    await expect(settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "no-account"), page: "PAYOUT" }))).rejects.toThrow("请选择收款账户");
    await expect(settle(adapter.invoices.selectExternalInvoicePayoutAccount({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "foreign-account"), creatorId: "CREATOR-OTHER", payoutAccountId: accountId }))).rejects.toThrow("无权访问");
    await expect(settle(adapter.invoices.selectExternalInvoicePayoutAccount({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "invalid-account"), payoutAccountId: "other-creator-account" }))).rejects.toThrow("已验证且可用");
    await expect(settle(adapter.invoices.selectExternalInvoicePayoutAccount({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "unverified-account"), payoutAccountId: "payout-paypal-backup" }))).rejects.toThrow("已验证且可用");
    const selected = await selectAccount(adapter, WAITING_UPLOAD_ID, recognized, "valid-account");
    expect(selected.payoutAccountId).toBe(accountId);
    expect(selected.documentState?.status).toBe("WAITING_CONFIRMATION");
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
    expect(uploaded.payoutAccountId).toBeUndefined();
    expect(uploaded.payoutSnapshot).toBeUndefined();
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

  it("preserves simulated AI originals while saving corrections in a new confirmation snapshot", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, "upload-correct"), payoutAccountId: initialProfile.payoutAccounts[0].id, file: file("correct") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, "recognize-correct") }))).data;
    expect(recognized.recognitionSnapshots?.[0].engineVersion).toBe("mock-ai-v1");
    expect(recognized.recognitionSnapshots?.[0].fields.AMOUNT).toBe("3240");
    const original = recognized.recognitionSnapshots?.[0].fields.PUBLISHER;
    const corrected = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "correct"), values: { PUBLISHER: "Corrected Name" } }))).data;
    expect(corrected.recognitionSnapshots?.[0].fields.PUBLISHER).toBe(original);
    expect(corrected.confirmedSnapshots?.at(-1)?.values.PUBLISHER).toBe("Corrected Name");
    expect(corrected.confirmedSnapshots?.at(-1)?.corrections[0]).toMatchObject({ recognizedValue: original, confirmedValue: "Corrected Name", correctedBy: CREATOR_ID });
  });

  it("requires a nonblank Description on both page confirmation and final submission, retaining the unrecognized original", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, "description-upload"), file: file("description") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, "description-recognize") }))).data;
    await expect(settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "description-empty"), page: "INVOICE" }))).rejects.toThrow("Description");
    const whitespace = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "description-whitespace"), values: { DESCRIPTION: "  \t " } }))).data;
    await expect(settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(whitespace, "description-blank"), page: "INVOICE" }))).rejects.toThrow("Description");
    const accountSelected = await selectAccount(adapter, WAITING_UPLOAD_ID, whitespace, "description-blank-account");
    await expect(settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(accountSelected, "description-blank-submit") }))).rejects.toThrow("Description");
    const corrected = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(accountSelected, "description-entered"), values: { DESCRIPTION: "  内容合作服务  " } }))).data;
    expect(corrected.recognitionSnapshots?.at(-1)?.fields.DESCRIPTION).toBe("");
    expect(corrected.extractedData?.description).toBe("  内容合作服务  ");
    expect(currentExternalCorrection(corrected)?.values.DESCRIPTION).toBe("  内容合作服务  ");
    const both = await confirmPages(adapter, WAITING_UPLOAD_ID, corrected, "description-pages");
    const submitted = (await settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(both, "description-submit") }))).data;
    expect(submitted.documentState?.status).toBe("WAITING_MEDIA_REVIEW");
    expect(submitted.confirmedSnapshots?.at(-1)?.values.DESCRIPTION).toBe("  内容合作服务  ");
    expect(submitted.recognitionSnapshots?.at(-1)?.fields.DESCRIPTION).toBe("");
  });

  it("reads an already approved historical Invoice without retroactively requiring Description", async () => {
    const adapter = new MockApiAdapter();
    const historical = (await settle(adapter.invoices.getExternalInvoice("invoice-creator-001-external-demo-failed-20260920", CREATOR_ID))).data!;
    expect(historical.documentState?.status).toBe("APPROVED");
    expect(historical.extractedData?.description).toBeUndefined();
    const again = (await settle(adapter.invoices.getExternalInvoice("invoice-creator-001-external-demo-failed-20260920", CREATOR_ID))).data!;
    expect(again.documentState?.status).toBe("APPROVED");
    expect(again.extractedData).toEqual(historical.extractedData);
  });

  it.each([
    ["PUBLISHER", "Someone Else", "Invoice From"],
    ["ADVERTISER", "Other Company", "Bill To"],
    ["AMOUNT", "1", "金额"],
    ["CURRENCY", "EUR", "币种"],
  ] as const)("blocks confirmation when %s is invalid", async (field, value, message) => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, `upload-${field}`), payoutAccountId: initialProfile.payoutAccounts[0].id, file: file(field) }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, `recognize-${field}`) }))).data;
    const corrected = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, `correct-${field}`), values: { [field]: value } }))).data;
    await expect(settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(corrected, `confirm-${field}`), acknowledgement: true }))).rejects.toThrow(message);
  });

  it("submits after both pages are confirmed without a separate acknowledgement", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(REUPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: REUPLOAD_ID, ...command(current, "upload-confirm"), payoutAccountId: initialProfile.payoutAccounts[0].id, file: file("confirm") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: REUPLOAD_ID, ...command(uploaded, "recognize-confirm") }))).data;
    await expect(settle(adapter.invoices.confirmExternalInvoice({ invoiceId: REUPLOAD_ID, ...command(recognized, "before-manual-check") }))).rejects.toThrow("请选择收款账户");
    const corrected = (await settle(adapter.invoices.correctExternalInvoiceRecognition({
      invoiceId: REUPLOAD_ID,
      ...command(recognized, "manual-check"),
      values: { INVOICE_DATE: "2026-07-14", PUBLISHER: initialProfile.legalName, ADVERTISER: "COMETS INTERNATIONAL LIMITED", DESCRIPTION: "产品推广服务", AMOUNT: "1850", CURRENCY: "EUR", PAYMENT_ACCOUNT: "{}" },
    }))).data;
    const pageConfirmed = await confirmPages(adapter, REUPLOAD_ID, corrected, "with-ack");
    const confirmed = await settle(adapter.invoices.confirmExternalInvoice({ invoiceId: REUPLOAD_ID, ...command(pageConfirmed, "submit-confirmed") }));
    expect(confirmed.data.documentState).toEqual({ kind: "EXTERNAL", status: "WAITING_MEDIA_REVIEW" });
    expect(confirmed.data.confirmedSnapshots?.at(-1)?.payoutAccountId).toBe(initialProfile.payoutAccounts[0].id);
  });

  it("confirms the two pages independently and keeps original demo values immutable", async () => {
    const adapter = new MockApiAdapter();
    const auditBefore = adminStore.listAudits().filter((event) => event.action === "CREATOR_BUSINESS_ACTION").length;
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, "pages-upload"), payoutAccountId: accountId, file: file("pages") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, "pages-recognize") }))).data;
    expect(recognized.recognitionSnapshots?.at(-1)?.extractedData.invoiceFrom).toBe(initialProfile.legalName);
    expect(recognized.recognitionSnapshots?.at(-1)?.extractedData.currency).toBe("USD");
    expect(recognized.recognitionSnapshots?.at(-1)?.engineVersion).toBe("mock-ai-v1");
    expect(recognized.payoutAccountId).toBeUndefined();
    expect(recognized.recognitionSnapshots?.at(-1)?.extractedData.paymentDetails).toEqual({});
    await expect(settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "pages-submit-early"), acknowledgement: true }))).rejects.toThrow("请选择收款账户");
    await expect(settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "pages-description-required"), page: "INVOICE" }))).rejects.toThrow("Description");
    const described = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "pages-description"), values: { DESCRIPTION: "票面服务描述" } }))).data;
    const information = (await settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(described, "pages-information"), page: "INVOICE" }))).data;
    expect(information.pageConfirmations?.INVOICE?.fileVersionId).toBe(information.sourceFileVersions?.at(-1)?.fileVersionId);
    expect(information.pageConfirmations?.INVOICE?.confirmedAt).toBeTruthy();
    await expect(settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(information, "pages-information-again"), page: "INVOICE" }))).rejects.toThrow("本页已确认");
    await expect(settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(information, "pages-no-account"), page: "PAYOUT" }))).rejects.toThrow("请选择收款账户");
    const selected = await selectAccount(adapter, WAITING_UPLOAD_ID, information, "pages");
    const both = (await settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(selected, "pages-payout"), page: "PAYOUT" }))).data;
    expect(both.pageConfirmations?.PAYOUT?.confirmedAt).toBeTruthy();
    expect(both.recognitionSnapshots).toEqual(recognized.recognitionSnapshots);
    expect(both.confirmedSnapshots).toHaveLength(1);
    expect(both.pageConfirmations?.INVOICE?.values.DESCRIPTION).toBe("票面服务描述");
    const submitted = (await settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(both, "pages-submit") }))).data;
    expect(submitted.documentState?.status).toBe("WAITING_MEDIA_REVIEW");
    expect(submitted.confirmedSnapshots?.at(-1)?.corrections).toEqual([expect.objectContaining({ field: "DESCRIPTION", recognizedValue: "", confirmedValue: "票面服务描述" })]);
    const actions = adminStore.listAudits().filter((event) => event.action === "CREATOR_BUSINESS_ACTION");
    expect(actions).toHaveLength(auditBefore + 6);
    expect(actions.slice(0, 6).map((event) => event.summary)).toEqual([
      "提交 Invoice INV-20260718-00001 审核",
      "确认 INV-20260718-00001 的收款信息",
      "选择 Invoice INV-20260718-00001 收款账户",
      "确认 INV-20260718-00001 的Invoice 信息",
      "修改 Invoice INV-20260718-00001 信息",
      "上传 Invoice INV-20260718-00001",
    ]);
    const duplicate = await settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(both, "pages-submit") }));
    expect(duplicate.message).toBe("重复请求已忽略");
    expect(adminStore.listAudits().filter((event) => event.action === "CREATOR_BUSINESS_ACTION")).toHaveLength(auditBefore + 6);
    expect(JSON.stringify(actions.slice(0, 6))).not.toContain(initialProfile.payout.accountNumber);
  });

  it("requires correction of a mismatched ticket field and reconfirmation after editing", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, "optional-edit-upload"), payoutAccountId: accountId, file: file("optional-edit") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, "optional-edit-recognize") }))).data;
    const both = await confirmPages(adapter, WAITING_UPLOAD_ID, recognized, "optional-edit-pages");
    const wrong = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(both, "optional-edit-wrong"), values: { AMOUNT: "1" } }))).data;
    expect(wrong.pageConfirmations?.INVOICE).toBeUndefined();
    expect(wrong.pageConfirmations?.PAYOUT).toBeTruthy();
    await expect(settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(wrong, "optional-edit-blocked") }))).rejects.toThrow("金额与系统预期金额不一致");
    await expect(settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(wrong, "optional-edit-confirm-wrong"), page: "INVOICE" }))).rejects.toThrow("金额与系统预期金额不一致");
    const repaired = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(wrong, "optional-edit-repair"), values: { AMOUNT: recognized.extractedData!.total } }))).data;
    await expect(settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(repaired, "optional-edit-before-reconfirm") }))).rejects.toThrow("分别确认");
    const reconfirmed = (await settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(repaired, "optional-edit-reconfirm"), page: "INVOICE" }))).data;
    const submitted = (await settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(reconfirmed, "optional-edit-submit") }))).data;
    expect(submitted.documentState?.status).toBe("WAITING_MEDIA_REVIEW");
    expect(submitted.recognitionSnapshots).toEqual(recognized.recognitionSnapshots);
    expect(submitted.confirmedSnapshots?.at(-1)?.corrections).toEqual(expect.arrayContaining([expect.objectContaining({ field: "AMOUNT", recognizedValue: recognized.extractedData!.total, confirmedValue: "1" })]));
  });

  it("stores account-filled payment values without claiming they were recognized from the file", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, "fallback-upload"), payoutAccountId: accountId, file: file("fallback") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, "fallback-recognize") }))).data;
    const original = recognized.recognitionSnapshots?.at(-1)?.extractedData.paymentDetails;
    const corrected = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "fallback-empty"), values: { PAYMENT_ACCOUNT: JSON.stringify({ account_name: "", account_number: initialProfile.payoutAccounts[0].accountNumber }) } }))).data;
    const both = await confirmPages(adapter, WAITING_UPLOAD_ID, corrected, "fallback-confirm");
    expect(both.pageConfirmations?.PAYOUT?.effectivePaymentDetails?.account_name).toBe(initialProfile.payoutAccounts[0].accountHolder);
    expect(both.pageConfirmations?.PAYOUT?.effectivePaymentDetails?.bank_name).toBe(initialProfile.payoutAccounts[0].bankName);
    expect(both.extractedData?.paymentDetails.account_name).toBe("");
    expect(both.recognitionSnapshots?.at(-1)?.extractedData.paymentDetails).toEqual(original);
    const submitted = (await settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(both, "fallback-submit"), acknowledgement: true }))).data;
    expect(submitted.confirmedSnapshots?.at(-1)?.effectivePaymentDetails?.account_name).toBe(initialProfile.payoutAccounts[0].accountHolder);
    expect(submitted.confirmedSnapshots?.at(-1)?.payoutAccountId).toBe(accountId);
  });

  it("keeps payout confirmation independent from ticket payment fields", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, "invalidate-upload"), payoutAccountId: accountId, file: file("invalidate") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, "invalidate-recognize") }))).data;
    const both = await confirmPages(adapter, WAITING_UPLOAD_ID, recognized, "invalidate-initial");
    const changedInvoice = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(both, "invalidate-invoice"), values: { INVOICE_DATE: "2026-07-19" } }))).data;
    expect(changedInvoice.pageConfirmations?.INVOICE).toBeUndefined();
    expect(changedInvoice.pageConfirmations?.PAYOUT).toEqual(both.pageConfirmations?.PAYOUT);
    const restored = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(changedInvoice, "restore-invoice"), values: { INVOICE_DATE: recognized.extractedData!.invoiceDate } }))).data;
    const information = (await settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(restored, "reconfirm-invoice"), page: "INVOICE" }))).data;
    const changedPayout = (await settle(adapter.invoices.correctExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(information, "invalidate-payout"), values: { PAYMENT_ACCOUNT: JSON.stringify({ account_number: "wrong" }) } }))).data;
    expect(changedPayout.pageConfirmations?.INVOICE).toBeTruthy();
    expect(changedPayout.pageConfirmations?.PAYOUT).toEqual(both.pageConfirmations?.PAYOUT);
    const submitted = (await settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(changedPayout, "independent-submit") }))).data;
    expect(submitted.confirmedSnapshots?.at(-1)?.effectivePaymentDetails?.account_number).toBe(initialProfile.payoutAccounts[0].accountNumber);
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

  it("compares the ticket currency with the expected Invoice, not the payout account currency", () => {
    const invoice = migrateInvoice(invoices.find((item) => invoiceInternalIdOf(item) === WAITING_UPLOAD_ID)!);
    invoice.recognitionSnapshots = [{ recognitionId: "r-currency", fileVersionId: "f-currency", engineVersion: "mock-ai-v1", recognizedAt: new Date().toISOString(), fields: { SOURCE_INVOICE_NUMBER: "", INVOICE_DATE: "2026-09-19", PUBLISHER: initialProfile.legalName, ADVERTISER: "COMETS INTERNATIONAL LIMITED", DESCRIPTION: "Consulting services", AMOUNT: "3240", CURRENCY: "USD", PAYMENT_ACCOUNT: "{}" }, extractedData: { invoiceFrom: initialProfile.legalName, billTo: "COMETS INTERNATIONAL LIMITED", invoiceDate: "2026-09-19", currency: "USD", total: "3240", paymentDetails: {}, invoiceFromMatchesProfile: true, billToMatchesComets: true } }];
    const account = initialProfile.payoutAccounts[0];
    expect(account.currency).toBe("EUR");
    expect(validateExternalInvoiceConfirmation({ invoice, profile: initialProfile, account })).toEqual([]);
  });

  it("keeps simulated originals and submits with the selected account despite ticket differences", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, "upload-payment-fields"), payoutAccountId: initialProfile.payoutAccounts[0].id, file: file("payment-fields") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, "recognize-payment-fields") }))).data;
    const corrected = (await settle(adapter.invoices.correctExternalInvoiceRecognition({
      invoiceId: WAITING_UPLOAD_ID, ...command(recognized, "correct-payment-fields"),
      values: { INVOICE_DATE: "2026-07-18", PUBLISHER: initialProfile.legalName, ADVERTISER: "COMETS INTERNATIONAL LIMITED", DESCRIPTION: "产品内容服务", AMOUNT: "3240", CURRENCY: "USD", PAYMENT_ACCOUNT: JSON.stringify({ account_number: "wrong" }) },
    }))).data;
    expect(corrected.extractedData?.paymentDetails.account_number).toBe("wrong");
    expect(JSON.parse(corrected.recognitionSnapshots?.at(-1)?.fields.PAYMENT_ACCOUNT || "{}")).toEqual({});
    const information = (await settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(corrected, "mismatch-information"), page: "INVOICE" }))).data;
    await expect(settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(information, "mismatch-no-account"), page: "PAYOUT" }))).rejects.toThrow("请选择收款账户");
    const selected = await selectAccount(adapter, WAITING_UPLOAD_ID, information, "mismatch");
    const payout = (await settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(selected, "mismatch-bound"), page: "PAYOUT" }))).data;
    expect(payout.pageConfirmations?.PAYOUT?.effectivePaymentDetails?.account_number).toBe(initialProfile.payoutAccounts[0].accountNumber);
    expect(payout.extractedData?.paymentDetails.account_number).toBe("wrong");
    const submitted = (await settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(payout, "mismatch-submit") }))).data;
    expect(submitted.documentState?.status).toBe("WAITING_MEDIA_REVIEW");
    expect(submitted.confirmedSnapshots?.at(-1)?.effectivePaymentDetails?.account_number).toBe(initialProfile.payoutAccounts[0].accountNumber);
    expect(submitted.confirmedSnapshots?.at(-1)?.payoutMismatchFields).toBeUndefined();
    const profile = (await settle(adapter.profile.get(CREATOR_ID))).data;
    const changed = { ...profile.payoutAccounts[0], bankName: "Updated Bank" };
    await settle(adapter.profile.save({ ...profile, payout: changed, payoutAccounts: [changed, ...profile.payoutAccounts.slice(1)] }));
    const historical = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    expect(historical.confirmedSnapshots?.at(-1)?.effectivePaymentDetails?.bank_name).toBe(initialProfile.payoutAccounts[0].bankName);
  });

  it("invalidates a confirmed payout page when the profile account changes", async () => {
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(WAITING_UPLOAD_ID, CREATOR_ID))).data!;
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({ invoiceId: WAITING_UPLOAD_ID, ...command(current, "account-change-upload"), payoutAccountId: accountId, file: file("account-change") }))).data;
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({ invoiceId: WAITING_UPLOAD_ID, ...command(uploaded, "account-change-recognize") }))).data;
    const both = await confirmPages(adapter, WAITING_UPLOAD_ID, recognized, "account-change-pages");
    const profile = (await settle(adapter.profile.get(CREATOR_ID))).data;
    const changedAccount = { ...profile.payoutAccounts[0], bankName: `${profile.payoutAccounts[0].bankName} Updated` };
    await settle(adapter.profile.save({ ...profile, payout: changedAccount, payoutAccounts: [changedAccount, ...profile.payoutAccounts.slice(1)] }));
    await expect(settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(both, "account-change-submit") }))).rejects.toThrow("分别确认");
    const refreshed = (await settle(adapter.invoices.confirmExternalInvoicePage({ invoiceId: WAITING_UPLOAD_ID, ...command(both, "account-change-reconfirm"), page: "PAYOUT" }))).data;
    const submitted = (await settle(adapter.invoices.confirmExternalInvoice({ invoiceId: WAITING_UPLOAD_ID, ...command(refreshed, "account-change-retry") }))).data;
    expect(submitted.confirmedSnapshots?.at(-1)?.effectivePaymentDetails?.bank_name).toBe(changedAccount.bankName);
    expect(submitted.recognitionSnapshots?.at(-1)?.extractedData.paymentDetails).toEqual({});
  });

  it("shows payment method separately from its Airwallex service provider", () => {
    expect(payoutAccountFields(initialProfile.payoutAccounts[0])).toMatchObject({ provider: "Airwallex", payment_method: "Bank Transfer" });
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
