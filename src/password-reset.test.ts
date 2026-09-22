import { describe, expect, it } from "vitest";
import {
  ADMIN_DEMO_CREDENTIALS,
  CREATOR_DEMO_CREDENTIALS,
  MockAdminStore,
  PRIMARY_CREATOR_ID,
} from "./admin-store";

describe("password reset flow", () => {
  it("uses a one-time link, changes the password, and revokes existing sessions", () => {
    const store = new MockAdminStore(false);
    const existingSession = store.login(
      CREATOR_DEMO_CREDENTIALS.email,
      CREATOR_DEMO_CREDENTIALS.password,
    );
    const request = store.requestPasswordReset(CREATOR_DEMO_CREDENTIALS.email);
    expect(request.accepted).toBe(true);
    expect(request.demoToken).toBeTruthy();
    expect(request.maskedEmail).toContain("***@");
    expect(store.verifyPasswordReset(request.demoToken!).valid).toBe(true);

    store.completePasswordReset(request.demoToken!, "NewCreator2026");

    expect(store.restoreSession(existingSession.sessionId)).toBeUndefined();
    expect(store.verifyPasswordReset(request.demoToken!)).toMatchObject({
      valid: false,
      reason: "USED",
    });
    expect(() => store.login(
      CREATOR_DEMO_CREDENTIALS.email,
      CREATOR_DEMO_CREDENTIALS.password,
    )).toThrow("邮箱或密码不正确");
    expect(store.login(CREATOR_DEMO_CREDENTIALS.email, "NewCreator2026").userId)
      .toBe(PRIMARY_CREATOR_ID);
  });

  it("returns the same public result shape for an unknown email without issuing a link", () => {
    const store = new MockAdminStore(false);
    expect(store.requestPasswordReset("unknown@example.com")).toEqual({
      accepted: true,
      retryAfterSeconds: 60,
      maskedEmail: "u***@example.com",
    });
  });

  it("administrator reset sends a link without silently replacing the password", () => {
    const store = new MockAdminStore(false);
    const admin = store.login(
      ADMIN_DEMO_CREDENTIALS.email,
      ADMIN_DEMO_CREDENTIALS.password,
    );
    store.resetPassword(PRIMARY_CREATOR_ID, admin.userId);
    expect(store.login(
      CREATOR_DEMO_CREDENTIALS.email,
      CREATOR_DEMO_CREDENTIALS.password,
    ).userId).toBe(PRIMARY_CREATOR_ID);
  });

  it("rejects weak and unchanged passwords", () => {
    const store = new MockAdminStore(false);
    const weak = store.requestPasswordReset(CREATOR_DEMO_CREDENTIALS.email).demoToken!;
    expect(() => store.completePasswordReset(weak, "weak"))
      .toThrow("密码需为 8–20 位字符");
    expect(() => store.completePasswordReset(weak, CREATOR_DEMO_CREDENTIALS.password))
      .toThrow("新密码不能与当前密码相同");
  });
});
