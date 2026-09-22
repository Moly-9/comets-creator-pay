import { describe, expect, it } from "vitest";
import { contracts, initialProfile, invoices } from "./data";
import {
  contractConfirmationRows,
  contractPaymentMethodChannel,
  contractPayoutRows,
  createInvoicePayoutSnapshot,
  creatorHomepageSocialSummary,
  creatorInvoiceTypeLabel,
  ensureInvoicePayoutSnapshot,
  normalizeSocialEvidence,
  payoutSnapshotRows,
  payoutAccountChangedSinceSnapshot,
  primaryVerifiedSocialHandle,
  synchronizeProfileSocialFields,
} from "./creator-display";
import { normalizePayoutProfile } from "./payout-accounts";

describe("creator-facing display helpers", () => {
  it("uses the unified creator label for internal Invoices", () => {
    expect(creatorInvoiceTypeLabel(invoices[0])).toBe("Comets内部invoice");
    expect(creatorInvoiceTypeLabel("EXTERNAL")).toBe("外部 Invoice");
  });

  it("synchronizes Display name from the first verified social handle", () => {
    const profile = synchronizeProfileSocialFields({
      ...structuredClone(initialProfile),
      displayName: "Legacy name",
    });
    expect(primaryVerifiedSocialHandle(profile.social)).toBe("LeaPlayFR");
    expect(profile.displayName).toBe("LeaPlayFR");
  });

  it("keeps the prior name until verification and follows a changed first social account", () => {
    const pending = synchronizeProfileSocialFields({
      ...structuredClone(initialProfile),
      displayName: "Legacy name",
      social: { ...structuredClone(initialProfile.social), verificationStatus: "PENDING" },
    });
    expect(pending.displayName).toBe("Legacy name");
    const reordered = synchronizeProfileSocialFields({
      ...pending,
      social: {
        ...pending.social,
        verificationStatus: "VERIFIED",
        profileUrls: [...pending.social.profileUrls].reverse(),
      },
    });
    expect(reordered.displayName).toBe("leaplayfr");
    expect(reordered.social.profileUrls[0]).toContain("instagram.com");
  });

  it("builds the homepage welcome summary from the first social domain", () => {
    expect(creatorHomepageSocialSummary(initialProfile.social))
      .toBe("@youtube.com 等 2 个主页");
  });

  it("maps legacy screenshots to the first social profile only", () => {
    const social = structuredClone(initialProfile.social);
    social.evidenceByProfileUrl = undefined;
    const evidence = normalizeSocialEvidence(social);
    expect(evidence[social.profileUrls[0]]).toEqual(social.screenshots);
    expect(evidence[social.profileUrls[1]]).toEqual([]);
  });

  it("keeps a payout snapshot after its source account is removed", () => {
    const legacyProfile = structuredClone(initialProfile);
    const removedAccount = legacyProfile.payoutAccounts.find(
      (account) => account.id === "payout-awx-jp-backup",
    )!;
    const sourceInvoice = {
      ...structuredClone(invoices[0]),
      payoutSnapshot: undefined,
      payoutAccountId: removedAccount.id,
    };
    const withSnapshot = ensureInvoicePayoutSnapshot(
      sourceInvoice,
      legacyProfile.payoutAccounts,
    );
    const migratedProfile = normalizePayoutProfile(legacyProfile);

    expect(migratedProfile.payoutAccounts.some(
      (account) => account.id === removedAccount.id,
    )).toBe(false);
    expect(withSnapshot.payoutSnapshot).toMatchObject({
      bankName: "MUFG Bank",
      accountNumber: "0008921",
    });
  });

  it("shows full payout values to creators and masks them for administrators", () => {
    const snapshot = invoices[0].payoutSnapshot!;
    const creatorRows = payoutSnapshotRows(snapshot, "CREATOR");
    const adminRows = payoutSnapshotRows(snapshot, "ADMIN");
    expect(creatorRows.find((row) => row.label === "Account Number")?.value)
      .toBe("FR7630006000011234567890189");
    expect(adminRows.find((row) => row.label === "Account Number")?.value)
      .toBe("•••• 0189");
    expect(adminRows.find((row) => row.label === "IBAN")?.value)
      .toBe("•••• 0189");
  });

  it("captures complete new payout details while comparing only fields present in legacy snapshots", () => {
    const account = structuredClone(initialProfile.payout);
    const fresh = createInvoicePayoutSnapshot(account);
    expect(fresh).toMatchObject({ bankCountry: account.bankCountry, transferMethod: account.transferMethod, beneficiaryType: account.beneficiaryType });
    const legacy = structuredClone(invoices[0].payoutSnapshot!);
    expect(payoutAccountChangedSinceSnapshot(account, legacy)).toBe(false);
    expect(payoutAccountChangedSinceSnapshot({ ...account, accountNumber: "changed" }, legacy)).toBe(true);
  });

  it("builds contract confirmation and payout rows without inventing missing values", () => {
    const profile = normalizePayoutProfile(structuredClone(initialProfile));
    const confirmationRows = contractConfirmationRows(
      { ...contracts[0], feeBearer: undefined },
      profile,
    );
    const payoutRows = contractPayoutRows(profile, "CREATOR");
    expect(confirmationRows).toContainEqual({
      label: "手续费承担方",
      value: "待补充",
    });
    expect(confirmationRows).toContainEqual({
      label: "Advertiser",
      value: contracts[0].brand,
    });
    expect(confirmationRows).toContainEqual({
      label: "付款方式/付款渠道",
      value: "Bank Transfer/Airwallex",
    });
    expect(payoutRows.find((row) => row.label === "Beneficiary Bank Address")?.value)
      .toContain("Boulevard des Italiens");
    expect(payoutRows.find((row) => row.label === "Remittance Information")?.value)
      .toBe("待补充");
  });

  it.each([
    ["AIRWALLEX", "Airwallex", "Bank Transfer/Airwallex"],
    ["PAYERMAX", "PayerMax", "Bank Transfer/Payer Max"],
    ["PAYPAL", "PayPal", "PayPal/PayPal"],
  ] as const)("derives the contract payment method from the default %s account", (channel, provider, expected) => {
    const profile = normalizePayoutProfile(structuredClone(initialProfile));
    const account = {
      ...profile.payout,
      id: `payout-${channel.toLowerCase()}`,
      channel,
      provider,
    };
    expect(contractPaymentMethodChannel({
      ...profile,
      payout: account,
      payoutAccounts: [account],
      defaultPayoutAccountId: account.id,
    })).toBe(expected);
  });

  it("does not fall back to a contract or legacy payout value without a recognized default account", () => {
    const profile = normalizePayoutProfile(structuredClone(initialProfile));
    expect(contractPaymentMethodChannel({
      ...profile,
      defaultPayoutAccountId: "missing-account",
    })).toBe("待补充");
    expect(contractPaymentMethodChannel({
      ...profile,
      payoutAccounts: [{ ...profile.payout, channel: "UNKNOWN" as never }],
      defaultPayoutAccountId: profile.payout.id,
    })).toBe("待补充");
  });
});
