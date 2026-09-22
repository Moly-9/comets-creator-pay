import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminStore, ADMIN_DEMO_CREDENTIALS, CREATOR_DEMO_CREDENTIALS } from "./admin-store";
import { initialProfile } from "./data";
import { MockApiAdapter, services } from "./services";
import { mergeAddedSocialAccount, normalizeSocialProfileUrl, socialProfileIsDemoVerified, validateSocialAccountAddition } from "./social-accounts";
import { removeSocialScreenshot, saveSocialScreenshot } from "./social-file-store";
import type { UserProfile } from "./types";

vi.mock("./social-file-store", () => ({
  saveSocialScreenshot: vi.fn(async () => undefined),
  removeSocialScreenshot: vi.fn(async () => undefined),
}));

const screenshot = (name = "console.png", type = "image/png", size = 512) => ({ name, type, size }) as File;
const creatorId = "CREATOR-001";
let original: UserProfile;
let storage: Map<string, string>;

beforeEach(() => {
  original = adminStore.getProfile(creatorId)!;
  storage = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  vi.mocked(saveSocialScreenshot).mockReset().mockResolvedValue(undefined);
  vi.mocked(removeSocialScreenshot).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  adminStore.syncProfile(original, false);
  vi.unstubAllGlobals();
});

const login = (role: "CREATOR" | "ADMIN" = "CREATOR") => {
  const credentials = role === "ADMIN" ? ADMIN_DEMO_CREDENTIALS : CREATOR_DEMO_CREDENTIALS;
  const session = adminStore.login(credentials.email, credentials.password);
  storage.set("comets-creator-session", JSON.stringify(session));
  return session;
};

describe("social account addition (local demonstration)", () => {
  it("validates HTTP(S), canonical duplicate URLs and required file constraints", () => {
    const social = initialProfile.social;
    const input = { creatorId, profileUrl: "https://www.tiktok.com/@newcreator", screenshots: [screenshot()] };
    expect(normalizeSocialProfileUrl("https://www.tiktok.com/@newcreator/?ref=demo#bio")).toBe(input.profileUrl);
    expect(validateSocialAccountAddition(social, input)).toBe(input.profileUrl);
    expect(() => validateSocialAccountAddition(social, { ...input, profileUrl: "ftp://example.com/test" })).toThrow("invalidUrl");
    expect(() => validateSocialAccountAddition(social, { ...input, profileUrl: `${social.profileUrls[0]}/?ref=test` })).toThrow("duplicateUrl");
    expect(() => validateSocialAccountAddition(social, { ...input, screenshots: [] })).toThrow("screenshotsRequired");
    expect(() => validateSocialAccountAddition(social, { ...input, screenshots: Array(7).fill(screenshot()) })).toThrow("tooManyScreenshots");
    expect(() => validateSocialAccountAddition(social, { ...input, screenshots: [screenshot("doc.pdf", "application/pdf")] })).toThrow("invalidScreenshotType");
    expect(() => validateSocialAccountAddition(social, { ...input, screenshots: [screenshot("huge.jpg", "image/jpeg", 8 * 1024 * 1024 + 1)] })).toThrow("invalidScreenshotSize");
  });

  it("persists file references and per-page demo result without changing original accounts or payout", async () => {
    login();
    const before = adminStore.getProfile(creatorId)!;
    const openCorrections = adminStore.getUserDetail(creatorId).corrections.filter((item) => item.status === "OPEN");
    const adapter = new MockApiAdapter();
    const input = { creatorId, profileUrl: "https://www.tiktok.com/@another", screenshots: [screenshot(), screenshot("second.jpg", "image/jpeg")] };
    const saved = (await adapter.profile.addSocialAccount(input)).data;
    expect(saved.social.profileUrls).toEqual([...before.social.profileUrls, input.profileUrl]);
    expect(saved.social.evidenceByProfileUrl?.[input.profileUrl]).toEqual([
      expect.objectContaining({ storageId: expect.any(String), name: "console.png" }),
      expect.objectContaining({ storageId: expect.any(String), name: "second.jpg" }),
    ]);
    expect(saved.social.screenshots).toEqual(before.social.screenshots);
    expect(saved.social.verificationStatus).toBe(before.social.verificationStatus);
    expect(saved.displayName).toBe(before.displayName);
    expect(saved.defaultPayoutAccountId).toBe(before.defaultPayoutAccountId);
    expect(saved.payoutAccounts).toEqual(before.payoutAccounts);
    expect(adminStore.getUserDetail(creatorId).corrections.filter((item) => item.status === "OPEN")).toEqual(openCorrections);
    expect(socialProfileIsDemoVerified(saved.social, input.profileUrl)).toBe(true);
    expect(socialProfileIsDemoVerified(before.social, before.social.profileUrls[0])).toBe(false);
    expect((await new MockApiAdapter().profile.get(creatorId)).data.social.profileUrls).toContain(input.profileUrl);
    expect(vi.mocked(saveSocialScreenshot)).toHaveBeenCalledTimes(2);
  });

  it("rolls back saved files on a storage failure without adding an account", async () => {
    login();
    vi.mocked(saveSocialScreenshot).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("quota"));
    const before = adminStore.getProfile(creatorId)!;
    await expect(new MockApiAdapter().profile.addSocialAccount({ creatorId, profileUrl: "https://tiktok.com/@retry", screenshots: [screenshot(), screenshot("two.jpg", "image/jpeg")] })).rejects.toThrow("storageFailed");
    expect(adminStore.getProfile(creatorId)).toEqual(before);
    expect(vi.mocked(removeSocialScreenshot)).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-creator and administrator commands before storing a screenshot", async () => {
    const input = { creatorId: "CREATOR-002", profileUrl: "https://tiktok.com/@secure", screenshots: [screenshot()] };
    login();
    expect(() => services.profile.addSocialAccount(input)).toThrow(/无权/);
    login("ADMIN");
    expect(() => services.profile.addSocialAccount(input)).toThrow(/只读/);
    expect(saveSocialScreenshot).not.toHaveBeenCalled();
  });

  it("merges the returned social records into an unsaved draft without changing its other edits", () => {
    const draft = { ...structuredClone(initialProfile), phone: "unsaved phone", payout: { ...initialProfile.payout, name: "unsaved payout" } };
    const saved = { ...structuredClone(initialProfile), social: { ...initialProfile.social, profileUrls: [...initialProfile.social.profileUrls, "https://tiktok.com/@new"] } };
    const merged = mergeAddedSocialAccount(draft, saved);
    expect(merged.phone).toBe("unsaved phone");
    expect(merged.payout.name).toBe("unsaved payout");
    expect(merged.social.profileUrls).toHaveLength(initialProfile.social.profileUrls.length + 1);
  });
});
