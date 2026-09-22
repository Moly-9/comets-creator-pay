import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialProfile, invoices } from "../../data";
import { MockApiAdapter } from "../../services";
import { currentExternalCorrection } from "./workflow";

const files = vi.hoisted(() => new Map<string, Blob>());
const failure = vi.hoisted(() => ({ save: false }));
vi.mock("./file-store", () => ({
  saveInvoiceFile: vi.fn(async (id: string, blob: Blob) => {
    if (failure.save) throw new Error("QuotaExceededError");
    files.set(id, blob);
  }),
  readInvoiceFile: vi.fn(async (id: string) => files.get(id)),
  removeInvoiceFile: vi.fn(async (id: string) => { files.delete(id); }),
  dataUrlToBlob: vi.fn(async (url: string) => new Blob([url])),
  fileStorageMessage: () => "Invoice 文件未能保存在此浏览器，请检查可用存储空间后重试；本次上传未提交。",
}));

const invoiceId = "invoice-creator-001-external-003";
const creatorId = "CREATOR-001";
const accountId = initialProfile.payoutAccounts[0].id;
const settle = async <T>(promise: Promise<T>): Promise<T> => {
  const outcome = promise.then((value) => ({ value }), (error: unknown) => ({ error }));
  await vi.runAllTimersAsync();
  const result = await outcome;
  if ("error" in result) throw result.error;
  return result.value;
};

describe("external Invoice binary storage", () => {
  const storage = new Map<string, string>();
  let failMetadata = false;
  beforeEach(() => {
    vi.useFakeTimers();
    files.clear();
    storage.clear();
    failure.save = false;
    failMetadata = false;
    vi.stubGlobal("indexedDB", {});
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (value.length > 500_000 || (failMetadata && key === "comets-creator-invoices-v2")) throw new Error("QuotaExceededError");
          storage.set(key, value);
        },
        removeItem: (key: string) => storage.delete(key),
      },
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const upload = async (adapter: MockApiAdapter, blob: Blob, requestId: string) => {
    const current = (await settle(adapter.invoices.getExternalInvoice(invoiceId, creatorId))).data!;
    return settle(adapter.invoices.uploadExternalInvoiceFile({
      invoiceId,
      creatorId,
      expectedVersion: current.version || 1,
      clientRequestId: requestId,
      payoutAccountId: accountId,
      file: { id: `selected:${requestId}`, name: "sample.pdf", mimeType: blob.type, size: blob.size },
      fileBlob: blob,
    }));
  };

  it("stores a 3.59 MB PDF outside localStorage and restores it after refresh", async () => {
    const blob = new Blob([new Uint8Array(3_590_000)], { type: "application/pdf" });
    const adapter = new MockApiAdapter();
    const uploaded = (await upload(adapter, blob, "large-upload")).data;
    expect(uploaded.documentState).toEqual({ kind: "EXTERNAL", status: "RECOGNIZING" });
    expect(uploaded.document?.storageId).toBe(uploaded.sourceFileVersions?.at(-1)?.fileVersionId);
    expect(uploaded.document?.previewUrl).toBeUndefined();
    expect(storage.get("comets-creator-invoices-v2")?.length).toBeLessThan(500_000);
    expect(await adapter.invoices.getDocumentFile(invoiceId, creatorId)).toBe(blob);
    expect(await adapter.invoices.getDocumentFile(invoiceId, "CREATOR-OTHER")).toBeUndefined();
    const restored = new MockApiAdapter();
    expect(await restored.invoices.getDocumentFile(invoiceId, creatorId)).toBe(blob);
    const recognized = (await settle(restored.invoices.retryExternalInvoiceRecognition({
      invoiceId, creatorId, expectedVersion: uploaded.version!, clientRequestId: "recognize-large",
    }))).data;
    expect(recognized.documentState).toEqual({ kind: "EXTERNAL", status: "WAITING_CONFIRMATION" });
    expect(recognized.sourceFileVersions).toHaveLength(1);
  });

  it("rejects an unavailable file store without advancing state and permits retry", async () => {
    const adapter = new MockApiAdapter();
    const blob = new Blob([new Uint8Array(128)], { type: "image/png" });
    failure.save = true;
    await expect(upload(adapter, blob, "first-try")).rejects.toThrow("文件未能保存");
    const current = (await settle(adapter.invoices.getExternalInvoice(invoiceId, creatorId))).data!;
    expect(current.documentState).toEqual({ kind: "EXTERNAL", status: "WAITING_UPLOAD" });
    expect(current.sourceFileVersions || []).toHaveLength(0);
    failure.save = false;
    expect((await upload(adapter, blob, "retry-upload")).data.documentState?.status).toBe("RECOGNIZING");
  });

  it("rolls back the stored image if Invoice metadata cannot commit", async () => {
    const adapter = new MockApiAdapter();
    const blob = new Blob([new Uint8Array(64)], { type: "image/png" });
    failMetadata = true;
    await expect(upload(adapter, blob, "metadata-fails")).rejects.toThrow("本次上传未提交");
    expect(files.size).toBe(0);
    failMetadata = false;
    const current = (await settle(adapter.invoices.getExternalInvoice(invoiceId, creatorId))).data!;
    expect(current.documentState?.status).toBe("WAITING_UPLOAD");
    expect((await upload(adapter, blob, "metadata-retry")).data.sourceFileVersions).toHaveLength(1);
  });

  it("migrates an embedded legacy document without losing its file history", async () => {
    const old = structuredClone(invoices.find((item) => item.invoiceId === "invoice-creator-001-external-004")!);
    old.document = { id: "old-file", name: "old.pdf", mimeType: "application/pdf", size: 3, previewUrl: "data:application/pdf;base64,AA==" };
    old.sourceFileVersions = [{ ...old.document, fileVersionId: "old-version", fileName: "old.pdf", version: 1, fileHash: "old-hash", uploadedAt: "2026-07-17", uploadedBy: creatorId }];
    storage.set("comets-creator-invoices-v2", JSON.stringify([old]));
    const adapter = new MockApiAdapter();
    const migrated = (await settle(adapter.invoices.getExternalInvoice(old.invoiceId!, creatorId))).data!;
    expect(migrated.document?.storageId).toBe(`legacy:${old.invoiceId}:old-file`);
    expect(migrated.document?.previewUrl).toBeUndefined();
    expect(migrated.sourceFileVersions?.[0].storageId).toBe(migrated.document?.storageId);
    expect(migrated.sourceFileVersions).toHaveLength(1);
    expect(storage.get("comets-creator-invoices-v2")).not.toContain("data:application/pdf");
    expect(await adapter.invoices.getDocumentFile(old.invoiceId!, creatorId)).toBeInstanceOf(Blob);
  });

  it("upgrades a previously uploaded blank mock result while keeping its original snapshot", async () => {
    const old = structuredClone(invoices.find((item) => item.invoiceId === invoiceId)!);
    old.documentState = { kind: "EXTERNAL", status: "WAITING_CONFIRMATION" };
    old.sourceFileVersions = [{ id: "old-file", fileVersionId: "old-file", name: "old.pdf", fileName: "old.pdf", mimeType: "application/pdf", size: 3, fileHash: "hash", version: 1, uploadedAt: "2026-07-18", uploadedBy: creatorId }];
    const blank = { invoiceFrom: "", billTo: "", invoiceDate: "", currency: "", total: "", paymentDetails: {}, invoiceFromMatchesProfile: false, billToMatchesComets: false };
    old.extractedData = blank;
    old.recognitionSnapshots = [{ recognitionId: "old-recognition", fileVersionId: "old-file", engineVersion: "mock-ai-v1", recognizedAt: "2026-07-18", extractedData: blank, fields: { SOURCE_INVOICE_NUMBER: "", INVOICE_DATE: "", PUBLISHER: "", ADVERTISER: "", DESCRIPTION: "", AMOUNT: "", CURRENCY: "", PAYMENT_ACCOUNT: "{}" } }];
    storage.set("comets-creator-invoices-v2", JSON.stringify([old]));
    const adapter = new MockApiAdapter();
    const migrated = (await settle(adapter.invoices.getExternalInvoice(invoiceId, creatorId))).data!;
    expect(migrated.recognitionSnapshots).toHaveLength(2);
    expect(migrated.recognitionSnapshots?.[0]).toEqual(old.recognitionSnapshots[0]);
    expect(migrated.recognitionSnapshots?.at(-1)?.engineVersion).toBe("mock-ai-v2");
    expect(migrated.extractedData?.invoiceFrom).toBe(initialProfile.legalName);
    expect((await settle(adapter.invoices.getExternalInvoice(invoiceId, creatorId))).data?.recognitionSnapshots).toHaveLength(2);
  });

  it("re-upload keeps the old file version but revokes both page confirmations", async () => {
    const old = structuredClone(invoices.find((item) => item.invoiceId === "invoice-creator-001-external-004")!);
    const oldFile = { id: "old", fileVersionId: "old", name: "old.pdf", fileName: "old.pdf", mimeType: "application/pdf", size: 5, fileHash: "hash", version: 1, uploadedAt: "2026-07-14", uploadedBy: creatorId };
    old.sourceFileVersions = [oldFile];
    const confirmation = { fileVersionId: "old", recognitionId: "old-r", values: { SOURCE_INVOICE_NUMBER: "", INVOICE_DATE: "", PUBLISHER: "", ADVERTISER: "", DESCRIPTION: "", AMOUNT: "", CURRENCY: "", PAYMENT_ACCOUNT: "{}" }, payoutAccountId: accountId, confirmedBy: creatorId, confirmedAt: "2026-07-14" };
    old.pageConfirmations = { INVOICE: confirmation, PAYOUT: confirmation };
    old.recognitionSnapshots = [{ recognitionId: "old-r", fileVersionId: "old", engineVersion: "mock-ai-v1", recognizedAt: "2026-07-14", fields: confirmation.values, extractedData: { invoiceFrom: "", billTo: "", invoiceDate: "", currency: "", total: "", paymentDetails: {}, invoiceFromMatchesProfile: false, billToMatchesComets: false } }];
    old.confirmedSnapshots = [{ confirmationId: "old-confirmation", recognitionId: "old-r", fileVersionId: "old", values: { ...confirmation.values, DESCRIPTION: "Original service description" }, corrections: [{ field: "DESCRIPTION", recognizedValue: "", confirmedValue: "Original service description", correctedBy: creatorId, correctedAt: "2026-07-14" }], payoutAccountId: accountId, confirmedBy: creatorId, confirmedAt: "2026-07-14" }];
    storage.set("comets-creator-invoices-v2", JSON.stringify([old]));
    const adapter = new MockApiAdapter();
    const current = (await settle(adapter.invoices.getExternalInvoice(old.invoiceId!, creatorId))).data!;
    const blob = new Blob(["replacement"], { type: "application/pdf" });
    const uploaded = (await settle(adapter.invoices.uploadExternalInvoiceFile({
      invoiceId: old.invoiceId!, creatorId, expectedVersion: current.version || 1, clientRequestId: "replace-old",
      payoutAccountId: accountId,
      file: { id: "replacement", name: "replacement.pdf", mimeType: blob.type, size: blob.size }, fileBlob: blob,
    }))).data;
    expect(uploaded.sourceFileVersions).toHaveLength(2);
    expect(uploaded.sourceFileVersions?.[0]).toEqual(current.sourceFileVersions?.[0]);
    expect(uploaded.pageConfirmations).toEqual({});
    expect(uploaded.confirmedSnapshots).toEqual(current.confirmedSnapshots);
    expect(currentExternalCorrection(uploaded)).toBeUndefined();
    const recognized = (await settle(adapter.invoices.retryExternalInvoiceRecognition({
      invoiceId: old.invoiceId!, creatorId, expectedVersion: uploaded.version || 1, clientRequestId: "recognize-replacement",
    }))).data;
    expect(recognized.recognitionSnapshots).toHaveLength(2);
    expect(recognized.recognitionSnapshots?.[0]).toEqual(current.recognitionSnapshots?.[0]);
    expect(recognized.recognitionSnapshots?.at(-1)?.fields.DESCRIPTION).toBe("");
    expect(currentExternalCorrection(recognized)).toBeUndefined();
    await expect(settle(adapter.invoices.confirmExternalInvoicePage({
      invoiceId: old.invoiceId!, creatorId, expectedVersion: recognized.version || 1, clientRequestId: "no-description-reuse", page: "INVOICE",
    }))).rejects.toThrow("Description");
  });
});
