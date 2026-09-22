import { afterEach, describe, expect, it, vi } from "vitest";
import { adminStore, ADMIN_DEMO_CREDENTIALS, CREATOR_DEMO_CREDENTIALS } from "./admin-store";
import { resolveDataScope } from "./hooks/useDataScope";
import { MockApiAdapter, services } from "./services";
import { managementCreatorDetail, maskedCreatorDetail } from "./mock/users";

afterEach(() => vi.unstubAllGlobals());

describe("administrator data scope and read-only projections", () => {
  const admin = adminStore.login(ADMIN_DEMO_CREDENTIALS.email, ADMIN_DEMO_CREDENTIALS.password);
  const creator = adminStore.login(CREATOR_DEMO_CREDENTIALS.email, CREATOR_DEMO_CREDENTIALS.password);
  const api = new MockApiAdapter();

  it("never promotes a creator or falls back for an invalid, missing or admin ID", () => {
    expect(resolveDataScope(creator, "CREATOR-002")).toBe(creator.userId);
    expect(resolveDataScope(admin, null)).toBeUndefined();
    expect(resolveDataScope(admin, "CREATOR-NOPE")).toBeUndefined();
    expect(resolveDataScope(admin, admin.userId)).toBeUndefined();
    expect(resolveDataScope(admin, "CREATOR-002")).toBe("CREATOR-002");
  });

  it("rejects cross-user reads and administrator writes at the service boundary", async () => {
    await expect(api.creatorScope.read(creator.sessionId, "CREATOR-002")).rejects.toThrow(/无权/);
    expect(() => api.creatorScope.assertWrite(admin.sessionId, creator.userId)).toThrow(/只读/);
    await expect(api.creatorScope.read("fake-session", creator.userId)).rejects.toThrow(/失效/);
  });

  it("reads both users from one store, with the administrator's historical snapshots masked", async () => {
    const first = (await api.creatorScope.read(admin.sessionId, creator.userId)).data;
    const second = (await api.creatorScope.read(admin.sessionId, "CREATOR-002")).data;
    expect(first.detail.account.id).toBe(creator.userId);
    expect(first.detail.contracts.length).toBeGreaterThan(0);
    expect(second.detail.account.id).toBe("CREATOR-002");
    expect(second.detail.contracts.every((item) => item.creatorId === "CREATOR-002")).toBe(true);
    expect(first.detail.contracts.every((item) => !item.documentUrl)).toBe(true);
    expect(first.detail.invoices.every((item) => !item.document && !item.sourceFileVersions)).toBe(true);
    expect(first.attempts.every((item) => !item.payoutSnapshot?.accountNumber || item.payoutSnapshot.accountNumber.startsWith("••••"))).toBe(true);
    const full = (await api.creatorScope.read(creator.sessionId, creator.userId)).data;
    expect(JSON.stringify(first.detail)).not.toContain(full.detail.profile?.payout.accountNumber || "UNLIKELY");
    expect(first.detail.account.email).not.toBe(full.detail.account.email);
    expect(first.detail.profile?.email).not.toBe(full.detail.profile?.email);
    expect(first.detail.profile?.payout.swiftCode).not.toBe(full.detail.profile?.payout.swiftCode);
    expect(first.detail.loginHistory).toEqual([]);
    expect(first.detail.invoices.every((item) => !item.signature && !item.recognitionSnapshots)).toBe(true);
    const upload = first.detail.invoices.find((item) => item.invoiceNumber === "INV-20260920-00002");
    const failed = first.detail.invoices.find((item) => item.invoiceNumber === "INV-20260920-00003");
    expect(upload?.documentState).toEqual({ kind: "EXTERNAL", status: "WAITING_UPLOAD" });
    expect(failed?.documentState).toEqual({ kind: "EXTERNAL", status: "APPROVED" });
    expect(failed?.paymentStatus).toBe("FAILED");
    expect(failed?.payoutSnapshot?.accountNumber).not.toBe(full.detail.invoices.find((item) => item.invoiceNumber === "INV-20260920-00003")?.payoutSnapshot?.accountNumber);
    expect(first.attempts.find((item) => item.invoiceId === "invoice-creator-001-external-demo-failed-20260920")?.payoutSnapshot?.accountNumber).toMatch(/^••••/);
  });

  it("strips file evidence and nested recognition/snapshot data", () => {
    const original = adminStore.getUserDetail(creator.userId);
    const masked = maskedCreatorDetail(original);
    expect(masked.profile?.social.screenshots).toEqual([]);
    expect(masked.invoices.every((invoice) => !invoice.recognitionSnapshots && !invoice.confirmedSnapshots && !invoice.pageConfirmations)).toBe(true);
    expect(masked.profile?.payoutAccounts.every((account) => !account.beneficiaryId && !account.accountEmail?.includes("lea.martin"))).toBe(true);
  });

  it("keeps identity management editable while payout data stays masked in every response", async () => {
    const raw = adminStore.getUserDetail(creator.userId);
    const loaded = (await api.adminUsers.get(creator.userId)).data;
    expect(loaded.profile?.email).toBe(raw.profile?.email);
    expect(loaded.profile?.phone).toBe(raw.profile?.phone);
    expect(loaded.loginHistory).toEqual(raw.loginHistory);
    expect(loaded.profile?.payout.accountNumber).not.toBe(raw.profile?.payout.accountNumber);
    const projected = managementCreatorDetail(raw);
    expect(projected.profile?.payout.accountNumber).not.toBe(raw.profile?.payout.accountNumber);
  });

  it("rejects direct administrator calls to creator write and original document services", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
    const active = (await services.auth.login(ADMIN_DEMO_CREDENTIALS.email, ADMIN_DEMO_CREDENTIALS.password)).data;
    values.set("comets-creator-session", JSON.stringify(active));
    expect(() => services.invoices.signInternalInvoice("INV-20260729-00001", {
      method: "DRAWN", signerName: "Moly", dataUrl: "data:image/png;base64,abc", signedAt: new Date().toISOString(),
    })).toThrow(/只读|无权|达人不存在/);
    expect(() => services.profile.save(adminStore.getProfile(creator.userId)!)).toThrow(/只读|无权|达人不存在/);
    expect(() => services.invoices.getDocumentFile("INV-20260729-00001", creator.userId)).toThrow(/只读|无权|达人不存在/);
    const activeCreator = (await services.auth.login(CREATOR_DEMO_CREDENTIALS.email, CREATOR_DEMO_CREDENTIALS.password)).data;
    values.set("comets-creator-session", JSON.stringify(activeCreator));
    expect(() => services.invoices.signInternalInvoice("INV-20260801-00001", {
      method: "DRAWN", signerName: "Léa Martin", dataUrl: "data:image/png;base64,abc", signedAt: new Date().toISOString(),
    })).toThrow(/无权/);
  });

  it("lets a creator read only their own correction requests while creation stays administrator-only", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
    const creatorSession = (await services.auth.login(CREATOR_DEMO_CREDENTIALS.email, CREATOR_DEMO_CREDENTIALS.password)).data;
    values.set("comets-creator-session", JSON.stringify(creatorSession));
    expect((await services.corrections.list(creator.userId)).data).toEqual(expect.any(Array));
    expect(() => services.corrections.list("CREATOR-002")).toThrow(/无权/);
    expect(() => services.corrections.create(creator.userId, "account_number", "银行账号", "请修改", creator.userId)).toThrow(/仅管理员/);

    const adminSession = (await services.auth.login(ADMIN_DEMO_CREDENTIALS.email, ADMIN_DEMO_CREDENTIALS.password)).data;
    values.set("comets-creator-session", JSON.stringify(adminSession));
    expect((await services.corrections.list(creator.userId)).data).toEqual(expect.any(Array));
    expect(() => services.corrections.list("CREATOR-NOPE")).toThrow(/达人不存在/);
    expect(() => services.corrections.create(creator.userId, "account_number", "银行账号", "请修改", creator.userId)).toThrow(/管理员操作人身份无效/);
  });
});
