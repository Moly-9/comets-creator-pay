import { describe, expect, it } from "vitest";
import { initialProfile } from "./data";
import {
  calculatePayoutProfileCompleteness,
  isPayoutAccountUsable,
  maskPayoutIdentifier,
  normalizePayoutAccountAlias,
  normalizePayoutProfile,
  payoutAccountsForChannel,
  payoutAccountDestructiveAction,
  syncPayoutAccounts,
  validatePayoutAccountAlias,
} from "./payout-accounts";
import type { PayoutAccount } from "./types";

const account = (
  patch: Partial<PayoutAccount> = {},
): PayoutAccount => ({
  ...structuredClone(initialProfile.payout),
  id: "test-account",
  name: "Test account",
  beneficiaryId: undefined,
  status: "INCOMPLETE",
  linkages: {
    projectCount: 0,
    invoiceCount: 0,
    paymentBatchCount: 0,
    transactionCount: 0,
  },
  hasActivePayment: false,
  ...patch,
});

describe("payout account lifecycle rules", () => {
  it("normalizes and validates user-defined payout account aliases", () => {
    expect(normalizePayoutAccountAlias("  法国   EUR 主账户  ")).toBe(
      "法国 EUR 主账户",
    );
    expect(validatePayoutAccountAlias("")).toBe("请填写账户别名");
    expect(validatePayoutAccountAlias("A")).toBe(
      "账户别名至少需要 2 个字符",
    );
    expect(validatePayoutAccountAlias("法国 EUR 主账户")).toBe("");
    expect(validatePayoutAccountAlias("A".repeat(41))).toBe(
      "账户别名不能超过 40 个字符",
    );
  });

  it("allows physical deletion only before verification and without history", () => {
    expect(payoutAccountDestructiveAction(account())).toBe("DELETE");
    expect(
      payoutAccountDestructiveAction(
        account({ status: "PENDING_CONFIRMATION" }),
      ),
    ).toBe("DELETE");
  });

  it("keeps verified, beneficiary-backed, and historically linked accounts", () => {
    expect(
      payoutAccountDestructiveAction(account({ status: "VALIDATED" })),
    ).toBe("DISABLE");
    expect(
      payoutAccountDestructiveAction(
        account({ beneficiaryId: "bene_test_001" }),
      ),
    ).toBe("DISABLE");
    expect(
      payoutAccountDestructiveAction(
        account({
          linkages: {
            projectCount: 1,
            invoiceCount: 0,
            paymentBatchCount: 0,
            transactionCount: 0,
          },
        }),
      ),
    ).toBe("DISABLE");
  });

  it("locks destructive actions during review, validation, or payment", () => {
    expect(
      payoutAccountDestructiveAction(account({ status: "UNDER_REVIEW" })),
    ).toBe("LOCKED");
    expect(
      payoutAccountDestructiveAction(account({ status: "VALIDATING" })),
    ).toBe("LOCKED");
    expect(
      payoutAccountDestructiveAction(
        account({ status: "VALIDATED", hasActivePayment: true }),
      ),
    ).toBe("LOCKED");
  });

  it("only exposes validated active accounts to new payments", () => {
    expect(isPayoutAccountUsable(account({ status: "VALIDATED" }))).toBe(true);
    expect(
      isPayoutAccountUsable(
        account({
          status: "DISABLED",
          disabledAt: "2026-08-03T10:00:00.000Z",
        }),
      ),
    ).toBe(false);
  });

  it("groups every account under its selected payment channel", () => {
    const profile = normalizePayoutProfile(structuredClone(initialProfile));

    expect(
      payoutAccountsForChannel(profile.payoutAccounts, "AIRWALLEX").map(
        (item) => item.id,
      ),
    ).toEqual(["payout-awx-fr-primary", "payout-awx-jp-backup"]);
    expect(
      payoutAccountsForChannel(profile.payoutAccounts, "PAYPAL").map(
        (item) => item.id,
      ),
    ).toEqual(["payout-paypal-backup"]);
    expect(
      payoutAccountsForChannel(profile.payoutAccounts, "PAYERMAX"),
    ).toEqual([]);
  });

  it("atomically synchronizes the compatibility payout to a new default", () => {
    const profile = normalizePayoutProfile(structuredClone(initialProfile));
    const replacement = profile.payoutAccounts[1];
    const next = syncPayoutAccounts(
      profile,
      profile.payoutAccounts,
      replacement.id,
    );

    expect(next.defaultPayoutAccountId).toBe(replacement.id);
    expect(next.payout.id).toBe(replacement.id);
    expect(next.payout.name).toBe(replacement.name);
  });

  it("updates masked identifiers and profile completeness from account state", () => {
    const profile = normalizePayoutProfile(structuredClone(initialProfile));
    expect(maskPayoutIdentifier(profile.payout)).toBe("•••• 0189");
    expect(calculatePayoutProfileCompleteness(profile)).toBe(100);

    const withoutUsableAccount = syncPayoutAccounts(
      profile,
      profile.payoutAccounts.map((item) => ({
        ...item,
        status: "DISABLED" as const,
        disabledAt: "2026-08-03T10:00:00.000Z",
      })),
      profile.defaultPayoutAccountId,
    );
    expect(calculatePayoutProfileCompleteness(withoutUsableAccount)).toBe(83);
  });
});
