import { afterEach, describe, expect, it, vi } from "vitest";
import { contracts, initialProfile, invoices, requests } from "./data";
import {
  ADMIN_STORE_KEY,
  ADMIN_DEMO_CREDENTIALS,
  CREATOR_DEMO_CREDENTIALS,
  MockAdminStore,
  adminStore,
} from "./admin-store";
import {
  ADMIN_PAGE_SIZES,
  clampAdminPage,
  getAdminPageTokens,
  paginateAdminItems,
} from "./admin-pagination";
import { contractStatusLabel } from "./contract-status";
import {
  buildLinkedRequestProjects,
  bankProviderAfterChannelSelection,
  canVisitOnboardingStep,
  clearOnboardingDraft,
  filterInvoiceList,
  normalizeProjectMatchKey,
  onboardingDraftStorageKey,
  readOnboardingDraft,
  shouldShowInvoicePreSigningControls,
  payoutDisplayGroup,
  profileContactErrorMessage,
  preferredProfilePayoutAccount,
  shouldShowSocialEvidence,
  syncRequestWithInvoices,
  validateRegistration,
  validateDemoInvitation,
  validateSocialVerification,
  writeOnboardingDraft,
} from "./App";
import {
  buildCreatorNotifications,
  buildCreatorTasks,
  invoiceInternalIdOf,
  invoiceLifecycleTimeline,
  invoiceNumberOf,
  migrateInvoice,
} from "./creator-workflow";
import { failedPaymentSnapshot } from "./payment-relations";
import { DEMO_INVITATION_CODE, DEMO_SOCIAL_SCREENSHOT, DEMO_SOCIAL_URL, demonstrationRegistrationValues, fillEmptyFields } from "./registration-demo";
import {
  buildAirwallexMockSchema,
  fillAirwallexDemoValues,
  buildAirwallexMockTransferMethods,
  buildProfileSupplementalFields,
  compareInvoicePaymentDetails,
  createInvoiceId,
  filterRequests,
  getSocialAccountName,
  isValidEmailAddress,
  migrateLegacyInvoiceState,
  MockApiAdapter,
  normalizeAirwallexFormSchema,
  normalizeAirwallexSchemaValue,
  profileSchemaFieldRequirement,
  payoutAccountPaymentDetails,
  reconcileAirwallexSchemaValues,
  resolveAirwallexTransferMethod,
  sanitizeEnglishAccountName,
  summarizeAmountsByCurrency,
  sortInvoices,
  sortAirwallexTransferMethods,
  validateAirwallexSchemaValues,
  validateRequiredProfileFields,
} from "./services";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("creator profile display and payout examples", () => {
  it("uses the profile-specific legal-name wording without changing the stored field", () => {
    const error = "请完成必填字段：真实姓名 / Real Name";
    expect(profileContactErrorMessage(error)).toBe("请完成必填字段：真实姓名/公司名 / Real Name/Company Name");
    expect(initialProfile.legalName).toBe("Léa Martin");
  });

  it("hides verified evidence without mutating saved screenshots, while preserving correction materials", () => {
    const social = structuredClone(initialProfile.social);
    expect(shouldShowSocialEvidence("VERIFIED")).toBe(false);
    expect(shouldShowSocialEvidence("CHANGES_REQUESTED")).toBe(true);
    expect(shouldShowSocialEvidence("PENDING")).toBe(true);
    expect(social).toEqual(initialProfile.social);
  });

  it("groups bank providers without rewriting the stored default account", () => {
    const savedDefault = initialProfile.defaultPayoutAccountId;
    expect(payoutDisplayGroup("AIRWALLEX")).toBe("BANK_TRANSFER");
    expect(payoutDisplayGroup("PAYERMAX")).toBe("BANK_TRANSFER");
    expect(payoutDisplayGroup("PAYPAL")).toBe("PAYPAL");
    expect(bankProviderAfterChannelSelection("PAYERMAX", "PAYPAL")).toBe("PAYERMAX");
    expect(bankProviderAfterChannelSelection("PAYERMAX", "AIRWALLEX")).toBe("AIRWALLEX");
    expect(bankProviderAfterChannelSelection("AIRWALLEX", "PAYERMAX")).toBe("PAYERMAX");
    expect(initialProfile.defaultPayoutAccountId).toBe(savedDefault);
    const paypal = initialProfile.payoutAccounts.find((account) => account.channel === "PAYPAL")!;
    const alternateDefault = { ...initialProfile, payout: paypal, defaultPayoutAccountId: paypal.id };
    expect(preferredProfilePayoutAccount(alternateDefault).channel).toBe("AIRWALLEX");
    expect(alternateDefault.defaultPayoutAccountId).toBe(paypal.id);
  });

  it("provides independent, format-compatible examples for country-specific Schema and supplements", () => {
    for (const [country, currency, length] of [["US", "USD", 10], ["JP", "JPY", 7], ["GB", "GBP", 8]] as const) {
      const condition = { bankCountryCode: country, accountCurrency: currency, entityType: "PERSONAL" as const, transferMethod: "LOCAL" as const };
      const schema = buildAirwallexMockSchema(condition);
      expect(schema.fields.every((field) => Boolean(field.example))).toBe(true);
      const account = schema.fields.find((field) => field.key === "account_number")!;
      expect(account.example).toHaveLength(length);
      expect(account.example).toMatch(new RegExp(account.pattern!));
      expect(schema.fields.find((field) => field.key === "account_type")?.example).toBe(schema.fields.find((field) => field.key === "account_type")?.options?.[0].label);
      expect(schema.fields.find((field) => field.key === "swift_code")?.example).toContain(country);
    }
    const french = buildAirwallexMockSchema({ bankCountryCode: "FR", accountCurrency: "EUR", entityType: "COMPANY", transferMethod: "LOCAL" });
    const exampleValues = Object.fromEntries(french.fields.map((field) => [field.key, (field.type === "SELECT" ? field.options?.[0].value : field.example) || ""]));
    expect(validateAirwallexSchemaValues(french, exampleValues)).toEqual({});
    const emptyValues = Object.fromEntries(french.fields.map((field) => [field.key, ""]));
    validateAirwallexSchemaValues(french, emptyValues);
    expect(emptyValues.account_number).toBe("");
    const supplements = buildProfileSupplementalFields({ ...initialProfile, payout: { ...initialProfile.payout, bankCountry: "US", currency: "USD", beneficiaryType: "COMPANY", transferMethod: "LOCAL" } });
    expect(supplements.every((field) => Boolean(field.example))).toBe(true);
    expect(supplements.find((field) => field.key === "business_registration_number")?.example).toBe("AB12345678");
    expect(supplements.find((field) => field.key === "iban")?.example).toContain("不适用");
  });

  it("separates enforced Schema requirements from non-mandatory supplemental guidance", () => {
    for (const country of ["FR", "JP", "US", "GB"]) {
      for (const entityType of ["PERSONAL", "COMPANY"] as const) {
        const condition = { bankCountryCode: country, accountCurrency: country === "JP" ? "JPY" : country === "US" ? "USD" : country === "GB" ? "GBP" : "EUR", entityType, transferMethod: "LOCAL" as const };
        const schema = buildAirwallexMockSchema(condition);
        expect(schema.fields.every((field) => profileSchemaFieldRequirement(field).length > 0 && Boolean(field.example))).toBe(true);
        expect(profileSchemaFieldRequirement(schema.fields.find((field) => field.key === "account_name")!)).toContain("仅支持英文字母");
        const accountType = schema.fields.find((field) => field.key === "account_type");
        if (accountType) expect(profileSchemaFieldRequirement(accountType)).toContain("有效选项");
        const supplements = buildProfileSupplementalFields({ ...initialProfile, payout: { ...initialProfile.payout, bankCountry: country, currency: condition.accountCurrency, beneficiaryType: entityType, transferMethod: "LOCAL" } });
        expect(supplements.every((field) => Boolean(field.guidance) && Boolean(field.example))).toBe(true);
        if (country === "FR" || country === "GB") {
          expect(schema.fields.find((field) => field.key === "iban")?.required).toBe(true);
        } else {
          expect(supplements.find((field) => field.key === "iban")?.guidance).toContain("可留空");
        }
      }
    }
  });
});

describe("onboarding navigation and draft persistence", () => {
  it("only enables completed or currently available onboarding steps", () => {
    expect(canVisitOnboardingStep(1, false, 1)).toBe(true);
    expect(canVisitOnboardingStep(2, false, 1)).toBe(false);
    expect(canVisitOnboardingStep(2, true, 2)).toBe(true);
    expect(canVisitOnboardingStep(3, true, 2)).toBe(false);
    expect(canVisitOnboardingStep(3, true, 3)).toBe(true);
  });

  it("isolates drafts by creator and never persists a password property", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    const draft = {
      userId: "CREATOR-DRAFT",
      maxVisitedStep: 3 as const,
      registrationEmail: "creator@example.com",
      social: {
        profileUrls: ["https://youtube.com/@creator"],
        files: [],
        verification: "verified" as const,
      },
      updatedAt: "2026-09-18T00:00:00.000Z",
    };

    writeOnboardingDraft({ ...draft, password: "Secret123" } as typeof draft & {
      password: string;
    });

    expect(readOnboardingDraft("CREATOR-DRAFT")).toMatchObject(draft);
    expect(readOnboardingDraft("CREATOR-OTHER")).toBeNull();
    expect(storage.get(onboardingDraftStorageKey("CREATOR-DRAFT"))).not.toContain(
      "Secret123",
    );
    clearOnboardingDraft("CREATOR-DRAFT");
    expect(readOnboardingDraft("CREATOR-DRAFT")).toBeNull();
  });
});

describe("Airwallex transfer method pricing", () => {
  it("recommends local transfer for a matching local currency", () => {
    const methods = buildAirwallexMockTransferMethods({
      bankCountryCode: "FR",
      accountCurrency: "EUR",
      entityType: "PERSONAL",
    });
    expect(methods[0]).toMatchObject({
      value: "LOCAL",
      recommended: true,
    });
  });

  it("recommends SWIFT when its scenario fee is lower", () => {
    const methods = buildAirwallexMockTransferMethods({
      bankCountryCode: "FR",
      accountCurrency: "USD",
      entityType: "COMPANY",
    });
    expect(methods[0]).toMatchObject({
      value: "SWIFT",
      recommended: true,
    });
  });

  it("uses local transfer as the stable tie breaker", () => {
    const methods = sortAirwallexTransferMethods([
      {
        value: "SWIFT",
        label: "SWIFT",
        available: true,
        estimatedFeeAmount: 5,
        feeCurrency: "EUR",
        arrivalMinBusinessDays: 1,
        arrivalMaxBusinessDays: 3,
        recommended: false,
      },
      {
        value: "LOCAL",
        label: "Local",
        available: true,
        estimatedFeeAmount: 5,
        feeCurrency: "EUR",
        arrivalMinBusinessDays: 0,
        arrivalMaxBusinessDays: 2,
        recommended: false,
      },
    ]);
    expect(methods.map((method) => method.value)).toEqual(["LOCAL", "SWIFT"]);
    expect(methods[0].recommended).toBe(true);
  });

  it("carries estimated business-day ranges with the scenario prices", () => {
    const methods = buildAirwallexMockTransferMethods({
      bankCountryCode: "JP",
      accountCurrency: "JPY",
      entityType: "PERSONAL",
    });
    expect(methods.find((method) => method.value === "LOCAL")).toMatchObject({
      arrivalMinBusinessDays: 0,
      arrivalMaxBusinessDays: 2,
      feeCurrency: "JPY",
    });
    expect(methods.find((method) => method.value === "SWIFT")).toMatchObject({
      arrivalMinBusinessDays: 1,
      arrivalMaxBusinessDays: 3,
      feeCurrency: "JPY",
    });
  });

  it("preserves a saved choice but recommends the cheapest on a new scenario", () => {
    const methods = buildAirwallexMockTransferMethods({
      bankCountryCode: "FR",
      accountCurrency: "USD",
      entityType: "COMPANY",
    });
    expect(methods[0].value).toBe("SWIFT");
    expect(resolveAirwallexTransferMethod(methods, "LOCAL", true)?.value).toBe("LOCAL");
    expect(resolveAirwallexTransferMethod(methods, "LOCAL", false)?.value).toBe("SWIFT");
    expect(resolveAirwallexTransferMethod(methods.map((method) => ({ ...method, available: false })), "LOCAL", true)).toBeUndefined();
  });
});

describe("administrator list pagination", () => {
  const items = Array.from({ length: 135 }, (_, index) => index + 1);

  it("supports the required page sizes and slices the requested page", () => {
    expect(ADMIN_PAGE_SIZES).toEqual([20, 50, 100]);
    expect(paginateAdminItems(items, 3, 20)).toMatchObject({
      currentPage: 3,
      totalPages: 7,
      startIndex: 40,
      endIndex: 60,
      items: Array.from({ length: 20 }, (_, index) => index + 41),
    });
    expect(paginateAdminItems(items, 2, 100)).toMatchObject({
      currentPage: 2,
      totalPages: 2,
      startIndex: 100,
      endIndex: 135,
      items: Array.from({ length: 35 }, (_, index) => index + 101),
    });
  });

  it("clamps direct page jumps and creates compact page-number controls", () => {
    expect(clampAdminPage(0, items.length, 20)).toBe(1);
    expect(clampAdminPage(99, items.length, 20)).toBe(7);
    expect(getAdminPageTokens(6, 12)).toEqual([
      1,
      "start-ellipsis",
      5,
      6,
      7,
      "end-ellipsis",
      12,
    ]);
  });
});

describe("contract status display labels", () => {
  it("maps stable lifecycle keys to creator-facing labels", () => {
    expect(contractStatusLabel).toEqual({
      PENDING_SIGNATURE: "待签署",
      ACTIVE: "执行中",
      EXPIRED: "已过期",
    });
  });
});

describe("administrator request amount summaries", () => {
  it("groups total amount and project count by currency", () => {
    expect(
      summarizeAmountsByCurrency([
        { amount: "USD 2,100" },
        { amount: "EUR 1,850" },
        { amount: "USD 3,240" },
        { amount: "USD 3,800" },
        { amount: "USD 2,100" },
      ]),
    ).toEqual([
      {
        currency: "EUR",
        amount: 1850,
        count: 1,
        formattedAmount: "1,850",
      },
      {
        currency: "USD",
        amount: 11240,
        count: 4,
        formattedAmount: "11,240",
      },
    ]);
  });
});

describe("administrator RBAC and account operations", () => {
  it("derives the workspace role from the authenticated account", () => {
    const store = new MockAdminStore(false);

    const admin = store.login(
      ADMIN_DEMO_CREDENTIALS.email,
      ADMIN_DEMO_CREDENTIALS.password,
    );
    const creator = store.login(
      CREATOR_DEMO_CREDENTIALS.email,
      CREATOR_DEMO_CREDENTIALS.password,
    );

    expect(admin.role).toBe("ADMIN");
    expect(admin.permissions).toContain("USER_MANAGE");
    expect(admin.permissions).not.toContain("INVOICE_SIGN");
    expect(creator.role).toBe("CREATOR");
    expect(creator.permissions).toContain("INVOICE_SIGN");
  });

  it("prevents the current or final active administrator from being disabled", () => {
    const store = new MockAdminStore(false);

    expect(() =>
      store.setStatus(["ADMIN-001"], "DISABLED", "ADMIN-001", "测试"),
    ).toThrow("不能停用当前登录账号");
  });

  it("restores role and permissions from the server-side mock session", () => {
    const store = new MockAdminStore(false);
    const creator = store.login(
      CREATOR_DEMO_CREDENTIALS.email,
      CREATOR_DEMO_CREDENTIALS.password,
    );

    const forgedClientCopy = {
      ...creator,
      role: "ADMIN" as const,
      permissions: ["USER_MANAGE" as const],
    };
    const restored = store.restoreSession(forgedClientCopy.sessionId);

    expect(restored?.role).toBe("CREATOR");
    expect(restored?.permissions).not.toContain("USER_MANAGE");
  });

  it("revokes every active session when an account is disabled", () => {
    const store = new MockAdminStore(false);
    const admin = store.login(
      ADMIN_DEMO_CREDENTIALS.email,
      ADMIN_DEMO_CREDENTIALS.password,
    );
    const creator = store.login(
      CREATOR_DEMO_CREDENTIALS.email,
      CREATOR_DEMO_CREDENTIALS.password,
    );

    store.setStatus(
      [creator.userId],
      "DISABLED",
      admin.userId,
      "访问权限测试",
    );

    expect(store.restoreSession(creator.sessionId)).toBeUndefined();
  });

  it("changes account status without requiring a reason and keeps a complete audit", () => {
    const store = new MockAdminStore(false);

    store.setStatus(["CREATOR-001"], "DISABLED", "ADMIN-001");

    expect(store.getUserDetail("CREATOR-001").account.status).toBe("DISABLED");
    expect(store.listAudits()[0]).toMatchObject({
      actorId: "ADMIN-001",
      subjectUserId: "CREATOR-001",
      action: "USER_STATUS_CHANGED",
      before: { status: "ACTIVE" },
      after: { status: "DISABLED" },
      occurredAt: expect.any(String),
    });
  });

  it("rejects administrator mutations from a creator actor", () => {
    const store = new MockAdminStore(false);

    expect(() =>
      store.createUser(
        {
          name: "Unauthorized Admin",
          email: "unauthorized@example.com",
          role: "ADMIN",
          mode: "CREATE",
        },
        "CREATOR-001",
      ),
    ).toThrow("没有执行此操作的权限");
  });

  it("keeps payout values masked until an audited reveal reason is supplied", () => {
    const store = new MockAdminStore(false);

    expect(() =>
      store.revealSensitive(
        "CREATOR-001",
        "accountNumber",
        "",
        "ADMIN-001",
      ),
    ).toThrow("必须填写原因");

    const value = store.revealSensitive(
      "CREATOR-001",
      "accountNumber",
      "核对外部付款失败字段",
      "ADMIN-001",
    );
    expect(value).toContain("FR76");
    expect(
      store
        .listAudits()
        .some((event) => event.action === "SENSITIVE_DATA_REVEALED"),
    ).toBe(true);
  });

  it("does not expose or claim a value for an unfilled payout field", () => {
    const store = new MockAdminStore(false);
    const before = store.listAudits().length;
    expect(store.revealSensitive("CREATOR-002", "accountNumber", "核对空字段", "ADMIN-001")).toBe("");
    expect(store.listAudits()).toHaveLength(before + 1);
    expect(() => store.revealSensitive("CREATOR-002", "accountNumber", " ", "ADMIN-001")).toThrow("必须填写原因");
    expect(store.listAudits()).toHaveLength(before + 1);
    expect(() => store.revealSensitive("CREATOR-002", "accountNumber", "核对", "CREATOR-001")).toThrow("没有执行此操作的权限");
    expect(store.listAudits()).toHaveLength(before + 1);
  });

  it("persists only a safe, creator-owned business action without banking details", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } });
    const store = new MockAdminStore(true);
    store.recordCreatorAction("CREATOR-001", "INVOICE", "提交 Invoice INV-20260920-00001 审核");
    expect(() => store.recordCreatorAction("ADMIN-001", "INVOICE", "提交审核")).toThrow("不是达人");
    const restored = new MockAdminStore(true).listAudits().find((event) => event.summary.includes("INV-20260920-00001"));
    expect(restored).toMatchObject({ actorId: "CREATOR-001", subjectUserId: "CREATOR-001", action: "CREATOR_BUSINESS_ACTION", module: "INVOICE" });
    expect(JSON.stringify(restored)).not.toContain("FR7630006");
  });

  it("auto-resolves returned fields after the creator saves valid profile data", () => {
    const store = new MockAdminStore(false);
    store.createCorrection(
      "CREATOR-001",
      "social.profileUrls",
      "主页链接",
      "请补充主页链接",
      "ADMIN-001",
    );
    const profile = store.getProfile("CREATOR-001");
    expect(profile).toBeDefined();

    store.syncProfile(profile!);

    expect(
      store
        .listCorrections("CREATOR-001")
        .filter((item) => item.status === "OPEN"),
    ).toHaveLength(0);
    expect(
      store
        .listAudits()
        .some((event) => event.action === "CORRECTION_AUTO_RESOLVED"),
    ).toBe(true);
    expect(store.getUserDetail("CREATOR-001").account.verificationStatus).toBe(
      "VERIFIED",
    );
  });

  it("filters accounts by independent correction state", () => {
    const store = new MockAdminStore(false);

    expect(
      store.listUsers({ correctionStatus: "OPEN" }).map((user) => user.id),
    ).toContain("CREATOR-003");
    expect(
      store
        .listUsers({ correctionStatus: "CLEAR" })
        .some((user) => user.hasOpenCorrection),
    ).toBe(false);
  });
});

describe("external business data adapter contract", () => {
  it("seeds active contracts only for creators who completed initial verification", () => {
    const store = new MockAdminStore(false);
    const creators = store.listUsers({ role: "CREATOR" });
    const creatorIds = new Set(creators.map((creator) => creator.id));
    const aggregate = store.listAllBusinessData();
    const contractCounts = aggregate.contracts.reduce<Record<string, number>>(
      (counts, item) => {
        counts[item.creator.id] = (counts[item.creator.id] || 0) + 1;
        return counts;
      },
      {},
    );

    expect(aggregate.contracts).toHaveLength(13);
    expect(contractCounts).toEqual({
      "CREATOR-001": 8,
      "CREATOR-003": 3,
      "CREATOR-004": 2,
    });
    expect(
      aggregate.contracts.every((item) => creatorIds.has(item.creator.id)),
    ).toBe(true);
    expect(
      aggregate.contracts.filter(
        (item) => item.record.status === "PENDING_SIGNATURE",
      ),
    ).toHaveLength(3);
    expect(
      aggregate.contracts.filter((item) => item.record.status === "ACTIVE"),
    ).toHaveLength(5);
    expect(
      aggregate.contracts.filter((item) => item.record.status === "EXPIRED"),
    ).toHaveLength(5);
  });

  it("seeds contract-linked Invoices only for verified or correcting creators", () => {
    const store = new MockAdminStore(false);
    const creators = store.listUsers({ role: "CREATOR" });
    const aggregate = store.listAllBusinessData();
    const invoiceCounts = aggregate.invoices.reduce<Record<string, number>>(
      (counts, item) => {
        counts[item.creator.id] = (counts[item.creator.id] || 0) + 1;
        return counts;
      },
      {},
    );

    expect(aggregate.invoices).toHaveLength(14);
    expect(invoiceCounts).toEqual({
      "CREATOR-001": 10,
      "CREATOR-003": 2,
      "CREATOR-004": 2,
    });
    expect(
      creators.filter((creator) => creator.verificationStatus === "PENDING").every((creator) =>
        !aggregate.invoices.some((item) => item.creator.id === creator.id),
      ),
    ).toBe(true);

    for (const invoice of aggregate.invoices) {
      const matchingContract = aggregate.contracts.find(
        (contract) =>
          contract.creator.id === invoice.creator.id &&
          contract.record.projectId === invoice.record.projectId &&
          normalizeProjectMatchKey(contract.record.projectName) ===
            normalizeProjectMatchKey(invoice.record.projectName),
      );
      expect(matchingContract).toBeDefined();
      expect(invoice.creator.name).toBe(matchingContract?.creator.name);
      expect(invoice.record.brand).toBe(matchingContract?.record.brand);
      expect(invoice.record.amount).toMatch(/^[A-Z]{3} [\d,.]+$/);
    }
  });

  it("keeps contracts without a matching Invoice out of request data", () => {
    const store = new MockAdminStore(false);
    const aggregate = store.listAllBusinessData();
    const contractOnlyRecords = aggregate.contracts.filter(
      (contract) =>
        !aggregate.invoices.some(
          (invoice) =>
            invoice.creator.id === contract.creator.id &&
            normalizeProjectMatchKey(invoice.record.projectName) ===
              normalizeProjectMatchKey(contract.record.projectName),
        ),
    );

    expect(contractOnlyRecords).toHaveLength(4);
    for (const contract of contractOnlyRecords) {
      expect(
        aggregate.requests.some(
          (request) =>
            request.creator.id === contract.creator.id &&
            normalizeProjectMatchKey(request.record.projectName) ===
              normalizeProjectMatchKey(contract.record.projectName),
        ),
      ).toBe(false);
    }
  });

  it("accepts one event idempotently and rejects stale versions", () => {
    const store = new MockAdminStore(false);
    const event = {
      eventId: "evt-contract-1",
      creatorId: "CREATOR-001",
      externalRecordId: "CON-EXT-001",
      resourceType: "CONTRACT" as const,
      version: 1,
      occurredAt: "2026-08-02T10:00:00+08:00",
      payload: { projectName: "外部同步项目", status: "PENDING_SIGNATURE" },
    };

    expect(store.upsertExternalEvent(event)).toEqual({
      accepted: true,
      duplicate: false,
    });
    expect(store.upsertExternalEvent(event)).toEqual({
      accepted: true,
      duplicate: true,
    });
    expect(
      store.upsertExternalEvent({
        ...event,
        eventId: "evt-contract-stale",
      }),
    ).toEqual({
      accepted: false,
      duplicate: false,
      reason: "STALE_VERSION",
    });
  });

  it("records unknown Creator IDs as sync issues", () => {
    const store = new MockAdminStore(false);
    const result = store.upsertExternalEvent({
      eventId: "evt-unknown-1",
      creatorId: "CREATOR-NOT-FOUND",
      externalRecordId: "INV-EXT-404",
      resourceType: "INVOICE",
      version: 1,
      occurredAt: "2026-08-02T10:00:00+08:00",
      payload: {},
    });

    expect(result.reason).toBe("UNKNOWN_CREATOR_ID");
    expect(
      store
        .listSyncIssues()
        .some((issue) => issue.creatorId === "CREATOR-NOT-FOUND"),
    ).toBe(true);
  });

  it("quarantines pending creators' records and rejects new business events until verification", () => {
    const store = new MockAdminStore(false);
    for (const id of ["CREATOR-002", "CREATOR-005"]) {
      const detail = store.getUserDetail(id);
      expect(detail.contracts).toEqual([]);
      expect(detail.invoices).toEqual([]);
      expect(detail.requests).toEqual([]);
    }
    const pendingEvent = {
      eventId: "evt-pending-creator",
      creatorId: "CREATOR-002",
      externalRecordId: "CON-NEW-PENDING",
      resourceType: "CONTRACT" as const,
      version: 1,
      occurredAt: "2026-09-20T10:00:00+08:00",
      payload: { projectName: "待认证项目", brand: "Brand", amount: "EUR 100", status: "ACTIVE" },
    };
    expect(store.upsertExternalEvent(pendingEvent)).toMatchObject({ accepted: false, reason: "UNVERIFIED_CREATOR" });
    expect(store.listSyncIssues().some((issue) => issue.eventId === pendingEvent.eventId)).toBe(true);
    store.updateVerification("CREATOR-002", "VERIFIED", "ADMIN-001");
    expect(store.getUserDetail("CREATOR-002").contracts).toEqual([]);
    expect(store.upsertExternalEvent({ ...pendingEvent, eventId: "evt-verified-creator", version: 2 })).toMatchObject({ accepted: true });
    expect(store.getUserDetail("CREATOR-002").contracts.map((item) => item.id)).toContain("CON-NEW-PENDING");
    store.updateVerification("CREATOR-002", "PENDING", "ADMIN-001");
    expect(store.getUserDetail("CREATOR-002").contracts).toEqual([]);
  });

  it("rejects an unknown contract lifecycle without overwriting the record", () => {
    const store = new MockAdminStore(false);
    const before = store
      .getUserDetail("CREATOR-002")
      .contracts.find((item) => item.id === "CON-260703-CD-01");
    const result = store.upsertExternalEvent({
      eventId: "evt-contract-invalid-lifecycle",
      creatorId: "CREATOR-002",
      externalRecordId: "CON-260703-CD-01",
      resourceType: "CONTRACT",
      version: 2,
      occurredAt: "2026-09-18T12:00:00+08:00",
      payload: {
        projectName: "不应覆盖的合同",
        status: "PAYMENT_PROCESSING",
      },
    });

    expect(result).toEqual({
      accepted: false,
      duplicate: false,
      reason: "INVALID_CONTRACT_STATUS",
    });
    expect(
      store
        .getUserDetail("CREATOR-002")
        .contracts.find((item) => item.id === "CON-260703-CD-01"),
    ).toEqual(before);
    expect(
      store
        .listSyncIssues()
        .some((issue) => issue.eventId === "evt-contract-invalid-lifecycle"),
    ).toBe(true);
  });

  it("defaults existing contracts to standalone and accepts every supported synced contract type", () => {
    expect(contracts.every((contract) => contract.contractType === "INDEPENDENT")).toBe(true);
    const store = new MockAdminStore(false);
    store.updateVerification("CREATOR-002", "VERIFIED", "ADMIN-001");

    for (const [index, contractType] of (["FRAMEWORK", "IO"] as const).entries()) {
      expect(store.upsertExternalEvent({
        eventId: `evt-contract-type-${contractType}`,
        creatorId: "CREATOR-002",
        externalRecordId: `CON-TYPE-${index}`,
        resourceType: "CONTRACT",
        version: 1,
        occurredAt: "2026-09-21T10:00:00+08:00",
        payload: {
          projectName: `Contract type ${contractType}`,
          brand: "COMETS Demo",
          amount: "EUR 100",
          status: "ACTIVE",
          contractType,
        },
      })).toEqual({ accepted: true, duplicate: false });
    }

    const syncedTypes = store.getUserDetail("CREATOR-002").contracts
      .filter((contract) => contract.id.startsWith("CON-TYPE-"))
      .map((contract) => contract.contractType);
    expect(syncedTypes).toEqual(expect.arrayContaining(["FRAMEWORK", "IO"]));
  });

  it("rejects an invalid contract type without overwriting the stored contract", () => {
    const store = new MockAdminStore(false);
    store.updateVerification("CREATOR-002", "VERIFIED", "ADMIN-001");
    const originalEvent = {
      eventId: "evt-valid-contract-type",
      creatorId: "CREATOR-002",
      externalRecordId: "CON-TYPE-STABLE",
      resourceType: "CONTRACT" as const,
      version: 1,
      occurredAt: "2026-09-21T10:00:00+08:00",
      payload: {
        projectName: "Stable type contract",
        brand: "COMETS Demo",
        amount: "EUR 200",
        status: "ACTIVE",
        contractType: "FRAMEWORK",
      },
    };
    expect(store.upsertExternalEvent(originalEvent)).toMatchObject({ accepted: true });
    const before = store.getUserDetail("CREATOR-002").contracts
      .find((contract) => contract.id === originalEvent.externalRecordId);

    expect(store.upsertExternalEvent({
      ...originalEvent,
      eventId: "evt-invalid-contract-type",
      version: 2,
      payload: { ...originalEvent.payload, projectName: "Should not overwrite", contractType: "MASTER" },
    })).toEqual({ accepted: false, duplicate: false, reason: "INVALID_CONTRACT_TYPE" });
    expect(store.getUserDetail("CREATOR-002").contracts
      .find((contract) => contract.id === originalEvent.externalRecordId)).toEqual(before);
  });

  it("migrates v2 contract states while preserving registered users and sessions", () => {
    const storage = new Map<string, string>();
    storage.set(
      ADMIN_STORE_KEY,
      JSON.stringify({
        version: 2,
        users: [
          {
            id: "CREATOR-099",
            name: "Stored Creator",
            email: "stored.creator@example.com",
            role: "CREATOR",
            status: "ACTIVE",
            invitationStatus: "NOT_REQUIRED",
            verificationStatus: "VERIFIED",
            onboardingComplete: true,
            createdAt: "2026-09-01 10:00",
            lastLoginAt: "2026-09-18 09:00",
            lastActiveAt: "刚刚",
          },
        ],
        credentials: { "CREATOR-099": "Stored2026" },
        profiles: {},
        sessions: [
          {
            userId: "CREATOR-099",
            email: "stored.creator@example.com",
            onboardingComplete: true,
            role: "CREATOR",
            permissions: [],
            sessionId: "stored-session",
            verificationStatus: "VERIFIED",
            createdAt: "2026-09-18 09:00",
          },
        ],
        externalRecords: [
          {
            creatorId: "CREATOR-099",
            externalRecordId: "CON-STORED-001",
            resourceType: "CONTRACT",
            version: 1,
            occurredAt: "2026-09-01 10:00",
            payload: {
              projectId: "PRJ-STORED-001",
              projectName: "Stored Project",
              brand: "Stored Brand",
              amount: "USD 900",
              status: "已付款",
            },
          },
        ],
      }),
    );
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    const store = new MockAdminStore(true);

    expect(store.listUsers().map((user) => user.id)).toContain("CREATOR-099");
    expect(store.restoreSession("stored-session")?.userId).toBe("CREATOR-099");
    expect(store.getUserDetail("CREATOR-099").contracts[0].status).toBe("ACTIVE");
    expect(store.getUserDetail("CREATOR-099").contracts[0].contractType).toBe("INDEPENDENT");
    expect(JSON.parse(storage.get(ADMIN_STORE_KEY) || "{}").version).toBe(5);
  });

  it("archives a pending creator's v2 contract without exposing it after migration", () => {
    const storage = new Map<string, string>();
    storage.set(
      ADMIN_STORE_KEY,
      JSON.stringify({
        version: 2,
        externalRecords: [
          {
            creatorId: "CREATOR-002",
            externalRecordId: "CON-260703-CD-01",
            resourceType: "CONTRACT",
            version: 1,
            occurredAt: "2026-07-03 10:00",
            payload: {
              projectId: "PRJ-260703-LP-SKIN",
              projectName: "Lumière 夏季护肤合作",
              brand: "Lumière Paris",
              amount: "EUR 3,600",
              effectiveDate: "2025-01-01",
              servicePeriod: "2025-01-01 至 2025-01-02",
              status: "未请款",
            },
          },
        ],
      }),
    );
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    const store = new MockAdminStore(true);
    expect(store.getUserDetail("CREATOR-002").contracts).toEqual([]);
    const persisted = JSON.parse(storage.get(ADMIN_STORE_KEY) || "{}");
    expect(persisted.archivedExternalRecords.find((record: { externalRecordId: string }) => record.externalRecordId === "CON-260703-CD-01").payload).toMatchObject({
      status: "未请款",
      contractType: "INDEPENDENT",
    });
    expect(new MockAdminStore(true).getUserDetail("CREATOR-002").contracts).toEqual([]);
  });

  it("quarantines legacy v3 Invoice snapshots across reload and later verification", () => {
    const storage = new Map<string, string>();
    storage.set(ADMIN_STORE_KEY, JSON.stringify({
      version: 3,
      externalRecords: [{
        creatorId: "CREATOR-005",
        externalRecordId: "INV-LEGACY-ALEX",
        resourceType: "INVOICE",
        version: 3,
        occurredAt: "2026-08-01T10:00:00+08:00",
        payload: { projectName: "旧项目", brand: "Demo", amount: "USD 500", status: "PAID" },
      }],
    }));
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    const migrated = new MockAdminStore(true);
    expect(migrated.getUserDetail("CREATOR-005").invoices).toEqual([]);
    const snapshot = JSON.parse(storage.get(ADMIN_STORE_KEY) || "{}");
    expect(snapshot.version).toBe(5);
    expect(snapshot.archivedExternalRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({ externalRecordId: "INV-LEGACY-ALEX", version: 3 }),
    ]));
    const reloaded = new MockAdminStore(true);
    reloaded.updateVerification("CREATOR-005", "VERIFIED", "ADMIN-001");
    expect(new MockAdminStore(true).getUserDetail("CREATOR-005").invoices).toEqual([]);
  });

  it("keeps a newly synced contract after verification and reload without restoring archived seed data", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    const store = new MockAdminStore(true);
    store.updateVerification("CREATOR-002", "VERIFIED", "ADMIN-001");
    expect(
      store.upsertExternalEvent({
        eventId: "evt-contract-lifecycle-persistence",
        creatorId: "CREATOR-002",
        externalRecordId: "CON-260703-CD-01",
        resourceType: "CONTRACT",
        version: 2,
        occurredAt: "2026-09-18T12:30:00+08:00",
        payload: {
          orderId: "IO-260703-LP-SKIN",
          projectId: "PRJ-260703-LP-SKIN",
          projectName: "Lumière 夏季护肤合作",
          campaignName: "Lumière 夏季护肤合作",
          brand: "Lumière Paris",
          amount: "EUR 3,600",
          effectiveDate: "2026-07-03",
          servicePeriod: "2026-07-03 至 2026-09-01",
          status: "EXPIRED",
          updatedAt: "2026-09-18",
        },
      }),
    ).toEqual({ accepted: true, duplicate: false });

    const reloadedStore = new MockAdminStore(true);
    const contract = reloadedStore
      .getUserDetail("CREATOR-002")
      .contracts.find((item) => item.id === "CON-260703-CD-01");

    expect(contract).toMatchObject({
      status: "EXPIRED",
      servicePeriod: "2026-07-03 至 2026-09-01",
      updatedAt: "2026-09-18",
    });
    expect(reloadedStore.getUserDetail("CREATOR-002").contracts).toHaveLength(1);
  });

  it("projects accepted external records into the creator detail view", () => {
    const store = new MockAdminStore(false);
    store.updateVerification("CREATOR-002", "VERIFIED", "ADMIN-001");
    store.upsertExternalEvent({
      eventId: "evt-contract-linked-1",
      creatorId: "CREATOR-002",
      externalRecordId: "CON-EXT-LINKED-1",
      resourceType: "CONTRACT",
      version: 1,
      occurredAt: "2026-08-02T10:00:00+08:00",
      payload: {
        projectId: "PROJECT-EXT-1",
        projectName: "Creator External Campaign",
        brand: "COMETS Demo",
        amount: "USD 1,500",
        status: "ACTIVE",
      },
    });
    store.upsertExternalEvent({
      eventId: "evt-invoice-linked-1",
      creatorId: "CREATOR-002",
      externalRecordId: "INV-EXT-LINKED-1",
      resourceType: "INVOICE",
      version: 1,
      occurredAt: "2026-08-02T10:02:00+08:00",
      payload: {
        projectId: "PROJECT-EXT-1",
        contractId: "CON-EXT-LINKED-1",
        projectName: "Creator External Campaign",
        brand: "COMETS Demo",
        amount: "USD 1,500",
        status: "APPROVED",
      },
    });

    const detail = store.getUserDetail("CREATOR-002");

    expect(detail.contracts.map((item) => item.id)).toContain(
      "CON-EXT-LINKED-1",
    );
    expect(detail.invoices.map((item) => item.id)).toContain(
      "INV-EXT-LINKED-1",
    );
    expect(detail.requests.map((item) => item.projectName)).toContain(
      "Creator External Campaign",
    );
  });

  it("aggregates existing business records across every creator", () => {
    const store = new MockAdminStore(false);
    store.updateVerification("CREATOR-002", "VERIFIED", "ADMIN-001");
    store.upsertExternalEvent({
      eventId: "evt-contract-admin-aggregate",
      creatorId: "CREATOR-002",
      externalRecordId: "CON-ADMIN-AGGREGATE",
      resourceType: "CONTRACT",
      version: 1,
      occurredAt: "2026-08-02T10:00:00+08:00",
      payload: {
        projectId: "PROJECT-ADMIN-AGGREGATE",
        projectName: "管理员聚合项目",
        brand: "COMETS Demo",
        amount: "USD 1,800",
        status: "ACTIVE",
      },
    });
    store.upsertExternalEvent({
      eventId: "evt-invoice-admin-aggregate",
      creatorId: "CREATOR-002",
      externalRecordId: "INV-ADMIN-AGGREGATE",
      resourceType: "INVOICE",
      version: 1,
      occurredAt: "2026-08-02T10:02:00+08:00",
      payload: {
        projectId: "PROJECT-ADMIN-AGGREGATE",
        contractId: "CON-ADMIN-AGGREGATE",
        projectName: "管理员聚合项目",
        brand: "COMETS Demo",
        amount: "USD 1,800",
        status: "PENDING_REVIEW",
      },
    });

    const aggregate = store.listAllBusinessData();

    expect(
      aggregate.contracts.some(
        (item) =>
          item.creator.id === "CREATOR-001" &&
          item.record.id === contracts[0].id,
      ),
    ).toBe(true);
    expect(
      aggregate.requests.some(
        (item) =>
          item.creator.id === "CREATOR-002" &&
          item.record.projectName === "管理员聚合项目",
      ),
    ).toBe(true);
    expect(
      aggregate.invoices.some(
        (item) =>
          item.creator.id === "CREATOR-002" &&
          item.record.id === "INV-ADMIN-AGGREGATE",
      ),
    ).toBe(true);
  });

  it("uses the same creator records for administrator list and detail views", () => {
    const store = new MockAdminStore(false);
    const detail = store.getUserDetail("CREATOR-001");
    const aggregate = store.listAllBusinessData();
    const creatorContracts = aggregate.contracts
      .filter((item) => item.creator.id === "CREATOR-001")
      .map((item) => item.record);
    const creatorInvoices = aggregate.invoices
      .filter((item) => item.creator.id === "CREATOR-001")
      .map((item) => item.record);
    const creatorRequests = aggregate.requests
      .filter((item) => item.creator.id === "CREATOR-001")
      .map((item) => item.record);

    expect(creatorContracts).toEqual(detail.contracts);
    expect(creatorInvoices).toEqual(detail.invoices);
    expect(creatorRequests).toEqual(detail.requests);
    for (const request of detail.requests) {
      const projectKey = normalizeProjectMatchKey(request.projectName);
      expect(
        detail.contracts.some(
          (contract) =>
            normalizeProjectMatchKey(contract.projectName) === projectKey,
        ),
      ).toBe(true);
      expect(
        detail.invoices.some(
          (invoice) =>
            normalizeProjectMatchKey(invoice.projectName) === projectKey,
        ),
      ).toBe(true);
    }
  });

  it("keeps contract-only records out of the administrator request aggregate", () => {
    const store = new MockAdminStore(false);
    store.upsertExternalEvent({
      eventId: "evt-contract-without-invoice",
      creatorId: "CREATOR-003",
      externalRecordId: "CON-WITHOUT-INVOICE",
      resourceType: "CONTRACT",
      version: 1,
      occurredAt: "2026-08-02T11:00:00+08:00",
      payload: {
        projectId: "PROJECT-WITHOUT-INVOICE",
        projectName: "尚未请款项目",
        brand: "COMETS Demo",
        amount: "EUR 900",
        status: "PENDING_SIGNATURE",
      },
    });

    const aggregate = store.listAllBusinessData();

    expect(
      aggregate.contracts.some(
        (item) => item.record.id === "CON-WITHOUT-INVOICE",
      ),
    ).toBe(true);
    expect(
      aggregate.requests.some(
        (item) => item.record.projectName === "尚未请款项目",
      ),
    ).toBe(false);
  });
});

describe("creator data isolation", () => {
  it("reads a correcting creator's records without exposing Léa Martin's records", async () => {
    const adapter = new MockApiAdapter();

    const [contractResult, invoiceResult, requestResult] = await Promise.all([
      adapter.contracts.list("CREATOR-003"),
      adapter.invoices.list("CREATOR-003"),
      adapter.requests.list("CREATOR-003"),
    ]);

    expect(contractResult.data.length).toBeGreaterThan(0);
    expect(invoiceResult.data.length).toBeGreaterThan(0);
    expect(contractResult.data.every((contract) => contract.creatorId === "CREATOR-003")).toBe(true);
    expect(invoiceResult.data.every((invoice) => invoice.creatorId === "CREATOR-003")).toBe(true);
    expect(requestResult.data.every((request) => request.invoiceIds.every((id) => invoiceResult.data.some((invoice) => invoice.id === id)))).toBe(true);
    expect(contractResult.data.some((contract) => contract.id === contracts[0].id)).toBe(false);
  });
});

describe("linked request projects", () => {
  it("includes only backend-linked Invoices under active contracts", () => {
    const result = buildLinkedRequestProjects(requests, contracts, invoices);

    expect(result).toHaveLength(7);
    expect(result.every((item) => item.contract.projectName === item.invoice.projectName)).toBe(true);
    expect(new Set(result.map((item) => item.invoice.id)).size).toBe(result.length);
  });

  it("excludes contracts that have not created an Invoice", () => {
    const result = buildLinkedRequestProjects(requests, contracts, invoices);
    const contractsWithoutInvoice = contracts.filter(
      (contract) =>
        !invoices.some((invoice) => invoice.projectId === contract.projectId),
    );

    expect(contractsWithoutInvoice).toHaveLength(3);
    expect(contractsWithoutInvoice.every((contract) =>
      !invoices.some((invoice) => invoice.projectId === contract.projectId)
      && !result.some((item) => item.contract.id === contract.id)
    )).toBe(true);
  });

  it("normalizes Unicode and whitespace and excludes unmatched records", () => {
    expect(normalizeProjectMatchKey("  Nebula   Quest 法国推广 ")).toBe(
      normalizeProjectMatchKey("Nebula Quest 法国推广"),
    );

    const result = buildLinkedRequestProjects(
      requests,
      contracts.filter((contract) => contract.projectName !== "日本市场测评"),
      invoices,
    );
    expect(result.some((item) => item.projectName === "日本市场测评")).toBe(false);
  });
});

describe("social profile account names", () => {
  it("reads the YouTube account name from its profile URL", () => {
    expect(
      getSocialAccountName("https://youtube.com/@LeaPlayFR", "@fallback"),
    ).toBe("@LeaPlayFR");
  });

  it("adds the account prefix for an Instagram profile URL", () => {
    expect(
      getSocialAccountName("https://instagram.com/leaplayfr", "@fallback"),
    ).toBe("@leaplayfr");
  });

  it("ignores trailing slashes, query strings, and fragments", () => {
    expect(
      getSocialAccountName(
        "https://instagram.com/leaplayfr/?utm_source=profile#bio",
        "@fallback",
      ),
    ).toBe("@leaplayfr");
  });

  it("falls back to the saved handle when the URL cannot be parsed", () => {
    expect(getSocialAccountName("not-a-profile-url", "@LeaPlayFR")).toBe(
      "@LeaPlayFR",
    );
  });
});

describe("email address validation", () => {
  it("accepts a complete email address", () => {
    expect(isValidEmailAddress("creator@example.com")).toBe(true);
  });

  it("rejects an email without a local part or domain suffix", () => {
    expect(isValidEmailAddress("@gmail.com")).toBe(false);
    expect(isValidEmailAddress("creator@example")).toBe(false);
  });
});

describe("request filtering", () => {
  it("filters by Invoice-driven request statuses", () => {
    const result = filterRequests(requests, "", "PAYMENT_FAILED");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("REQ-260728-MH-JULY");
  });

  it("searches project, brand, and request id", () => {
    expect(filterRequests(requests, "夏季家居", "ALL")[0].id).toBe("REQ-240711-MH-SUMMER");
    expect(filterRequests(requests, "REQ-240625-AM-JP", "ALL")[0].projectName).toBe(
      "日本市场测评",
    );
  });
});

describe("contract lifecycle data", () => {
  it("keeps contract lifecycle independent from the Invoice project set", () => {
    const invoiceProjects = new Set(invoices.map((invoice) => invoice.projectName));
    const contractProjects = new Set(contracts.map((contract) => contract.projectName));

    expect(contracts).toHaveLength(8);
    expect(invoices).toHaveLength(10);
    expect([...invoiceProjects].every((project) => contractProjects.has(project))).toBe(true);
    expect(contracts.filter((contract) => contract.status === "PENDING_SIGNATURE")).toHaveLength(2);
    expect(contracts.filter((contract) => contract.status === "ACTIVE")).toHaveLength(3);
    expect(contracts.filter((contract) => contract.status === "EXPIRED")).toHaveLength(3);
    expect(new Set(contracts.map((contract) => contract.id)).size).toBe(8);
  });

  it("does not rewrite lifecycle when an Invoice status changes", () => {
    const before = buildLinkedRequestProjects(requests, contracts, invoices);
    const changedInvoices = invoices.map((invoice) => ({
      ...invoice,
      status: invoice.status === "PAID" ? "PAYMENT_FAILED" as const : "PAID" as const,
    }));
    const after = buildLinkedRequestProjects(requests, contracts, changedInvoices);
    const lifecycleSnapshot = (items: typeof before) =>
      items
        .map((item) => [item.contract.id, item.contract.status])
        .sort(([left], [right]) => left.localeCompare(right));

    expect(lifecycleSnapshot(after)).toEqual(lifecycleSnapshot(before));
  });

  it("keeps seeded lifecycle dates consistent with the 2026-09-18 snapshot", () => {
    const snapshotDate = "2026-09-18";
    for (const contract of contracts) {
      const [, endDate = ""] = contract.servicePeriod.split(" 至 ");
      if (contract.status === "PENDING_SIGNATURE") {
        expect(contract.effectiveDate > snapshotDate).toBe(true);
      } else if (contract.status === "ACTIVE") {
        expect(contract.effectiveDate <= snapshotDate).toBe(true);
        expect(endDate >= snapshotDate).toBe(true);
      } else {
        expect(endDate < snapshotDate).toBe(true);
      }
    }
  });

  it("groups multiple Invoices under one contract and request project", () => {
    expect(new Set(invoices.map((invoice) => invoice.projectId)).size).toBe(5);
    expect(new Set(invoices.map((invoice) => invoice.projectName)).size).toBe(5);
    expect(requests).toHaveLength(5);
    expect(contracts).toHaveLength(requests.length + 3);

    const linkedInvoiceIds = requests.flatMap((request) => request.invoiceIds);
    expect(new Set(linkedInvoiceIds).size).toBe(invoices.length);

    for (const invoice of invoices) {
      const request = requests.find((item) => item.id === invoice.projectId);
      const contract = contracts.find((item) => item.projectId === invoice.projectId);

      expect(request).toMatchObject({
        projectName: invoice.projectName,
        brand: invoice.brand,
        invoiceIds: expect.arrayContaining([invoice.id]),
      });
      expect(contract).toMatchObject({
        projectName: invoice.projectName,
        brand: invoice.brand,
      });
    }
  });

  it("matches each contract to an Invoice by exact project name and brand", () => {
    for (const contract of contracts) {
      const matches = invoices.filter(
        (invoice) =>
          invoice.projectName === contract.projectName &&
          invoice.brand === contract.brand,
      );
      if (!invoices.some((invoice) => invoice.projectId === contract.projectId)) {
        expect(matches).toHaveLength(0);
      } else {
        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(matches.every((invoice) => invoice.projectId === contract.projectId)).toBe(true);
      }
    }
  });

  it("returns every seeded contract from the detail service", async () => {
    const adapter = new MockApiAdapter();

    for (const contract of contracts) {
      const result = await adapter.contracts.get(contract.id);
      expect(result.data).toMatchObject({
        id: contract.id,
        status: contract.status,
        projectName: contract.projectName,
      });
    }
  });
});

describe("invoice ordering", () => {
  it("adds the independent demo cases to old local data without resetting prior progress", async () => {
    const storage = new Map<string, string>();
    const oldData = invoices.filter((invoice) => !["INV-20260920-00002", "INV-20260920-00003", "INV-20260921-00001"].includes(invoice.id))
      .map((invoice) => invoice.id === "INV-20260718-00001"
        ? { ...invoice, documentState: { kind: "EXTERNAL" as const, status: "WAITING_MEDIA_REVIEW" as const }, status: "PENDING_REVIEW" as const }
        : invoice);
    storage.set("comets-creator-invoices-v2", JSON.stringify(oldData));
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    } });

    const adapter = new MockApiAdapter();
    const loaded = (await adapter.invoices.list("CREATOR-001")).data;
    expect(loaded.find((invoice) => invoice.id === "INV-20260718-00001")?.documentState?.status).toBe("WAITING_MEDIA_REVIEW");
    const upload = loaded.filter((invoice) => invoice.id === "INV-20260920-00002");
    const failed = loaded.filter((invoice) => invoice.id === "INV-20260920-00003");
    const freshUpload = loaded.filter((invoice) => invoice.id === "INV-20260921-00001");
    expect(upload).toHaveLength(1);
    expect(upload[0]).toMatchObject({ invoiceId: "invoice-creator-001-external-demo-upload-20260920", creatorId: "CREATOR-001", contractId: "CON-260718-KOL-05", documentState: { kind: "EXTERNAL", status: "WAITING_UPLOAD" } });
    expect(upload[0].document).toBeUndefined();
    expect(upload[0].payoutAccountId).toBeUndefined();
    expect(buildCreatorTasks(contracts, loaded).some((task) => task.resourceNumber === upload[0].invoiceNumber && task.type === "EXTERNAL_INVOICE_UPLOAD")).toBe(true);
    expect(freshUpload).toHaveLength(1);
    expect(freshUpload[0]).toMatchObject({ invoiceId: "invoice-creator-001-external-demo-upload-20260921", creatorId: "CREATOR-001", contractId: "CON-260718-KOL-05", documentState: { kind: "EXTERNAL", status: "WAITING_UPLOAD" } });
    expect(freshUpload[0].document).toBeUndefined();
    expect(freshUpload[0].payoutAccountId).toBeUndefined();
    expect(buildCreatorTasks(contracts, loaded).some((task) => task.resourceNumber === freshUpload[0].invoiceNumber && task.type === "EXTERNAL_INVOICE_UPLOAD")).toBe(true);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ invoiceId: "invoice-creator-001-external-demo-failed-20260920", creatorId: "CREATOR-001", contractId: "CON-260711-KOL-04", documentState: { kind: "EXTERNAL", status: "APPROVED" }, paymentStatus: "FAILED", paymentRecoveryStatus: "AWAITING_CREATOR_UPDATE" });
    const attempts = (await adapter.payments.listAttempts(failed[0].invoiceId!, "CREATOR-001")).data;
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ status: "FAILED", payoutAccountId: "payout-awx-fr-primary" });
    expect(failedPaymentSnapshot(failed[0], attempts)).toMatchObject({ source: "ATTEMPT", snapshot: { accountNumber: "FR7630006000011234567890189" } });
    expect(buildCreatorTasks(contracts, loaded).some((task) => task.resourceNumber === failed[0].invoiceNumber && task.type === "PAYMENT_ACCOUNT_CORRECTION")).toBe(true);
    expect(invoiceLifecycleTimeline(failed[0])).toEqual(expect.arrayContaining([["审核通过", "complete"], ["付款失败", "error"]]));

    const changed = loaded.map((invoice) => invoice.id === freshUpload[0].id
      ? { ...invoice, documentState: { kind: "EXTERNAL" as const, status: "WAITING_CONFIRMATION" as const } }
      : invoice);
    storage.set("comets-creator-invoices-v2", JSON.stringify(changed));
    const reloaded = (await new MockApiAdapter().invoices.list("CREATOR-001")).data;
    expect(reloaded.filter((invoice) => invoice.id === freshUpload[0].id)).toHaveLength(1);
    expect(reloaded.find((invoice) => invoice.id === freshUpload[0].id)?.documentState?.status).toBe("WAITING_CONFIRMATION");
  });

  it("corrects only untouched demo timestamps from the initial local fixture", async () => {
    const storage = new Map<string, string>();
    storage.set("comets-creator-invoices-v2", JSON.stringify(invoices.map((invoice) => {
      if (invoice.id === "INV-20260920-00002") return { ...invoice, updatedAt: "2026-09-20T09:30:00.000Z" };
      if (invoice.id === "INV-20260920-00003") return { ...invoice, updatedAt: "2026-09-20T10:40:00.000Z", payoutSnapshot: { ...invoice.payoutSnapshot!, capturedAt: "2026-09-20T10:20:00.000Z" } };
      return invoice;
    })));
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    } });
    const result = (await new MockApiAdapter().invoices.list()).data;
    expect(result.find((invoice) => invoice.id === "INV-20260920-00002")?.updatedAt).toBe("2026-09-20T03:30:00.000Z");
    expect(result.find((invoice) => invoice.id === "INV-20260920-00003")?.payoutSnapshot?.capturedAt).toBe("2026-09-20T04:20:00.000Z");
  });

  it("adds a fresh upload task without resetting a previously uploaded local Invoice", async () => {
    const storage = new Map<string, string>();
    const previouslyUploaded = invoices.map((invoice) => invoice.id === "INV-20260718-00001"
      ? { ...invoice, documentState: { kind: "EXTERNAL" as const, status: "WAITING_CONFIRMATION" as const } }
      : invoice).filter((invoice) => invoice.id !== "INV-20260920-00001");
    storage.set("comets-creator-invoices-v2", JSON.stringify(previouslyUploaded));
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    } });
    const adapter = new MockApiAdapter();
    const result = (await adapter.invoices.list()).data;
    expect(result.find((invoice) => invoice.id === "INV-20260718-00001")?.documentState?.status).toBe("WAITING_CONFIRMATION");
    expect(result.find((invoice) => invoice.id === "INV-20260920-00001")?.documentState?.status).toBe("WAITING_UPLOAD");
  });

  it("generates the unified date-and-sequence invoice number", () => {
    expect(createInvoiceId("2026-08-21", [
      { ...invoices[0], id: "INV-20260821-00001" },
      { ...invoices[0], id: "INV-20260821-00002" },
    ])).toBe("INV-20260821-00003");
  });

  it("compares only recognized payment fields and fills missing fields from the selected account", () => {
    const account = initialProfile.payoutAccounts[0];
    const result = compareInvoicePaymentDetails(
      { account_name: account.accountHolder, account_number: account.accountNumber },
      account,
    );
    expect(result.matches).toBe(true);
    expect(result.fields).toHaveLength(2);
    expect(result.merged.bank_name).toBe(account.bankName);
    const incomplete = compareInvoicePaymentDetails({ account_name: "", bank_name: "   ", account_number: account.accountNumber }, account);
    expect(incomplete.fields).toHaveLength(1);
    expect(incomplete.merged.account_name).toBe(account.accountHolder);
    expect(incomplete.merged.bank_name).toBe(account.bankName);
    expect(compareInvoicePaymentDetails({ account_number: "wrong" }, account).matches).toBe(false);
  });

  it("uploads a system-issued external Invoice task and keeps its stable identifiers", async () => {
    const adapter = new MockApiAdapter();
    const account = initialProfile.payoutAccounts[0];
    const result = await adapter.invoices.uploadExternal({
      invoiceId: "invoice-creator-001-external-003",
      payoutAccountId: account.id,
      file: { id: "file-1", name: "invoice.pdf", mimeType: "application/pdf", size: 1024, previewUrl: "data:application/pdf;base64,AA==" },
      extractedData: {
        invoiceFrom: initialProfile.legalName,
        billTo: "COMETS INTERNATIONAL LIMITED",
        invoiceDate: "2026-08-21",
        currency: "USD",
        total: "3240",
        paymentDetails: payoutAccountPaymentDetails(account),
        invoiceFromMatchesProfile: true,
        billToMatchesComets: true,
      },
    });
    expect(result.data.invoiceId).toBe("invoice-creator-001-external-003");
    expect(result.data.invoiceNumber).toBe("INV-20260718-00001");
    expect(result.data.status).toBe("PENDING_CONFIRMATION");
    expect(result.data.documentState).toEqual({ kind: "EXTERNAL", status: "WAITING_CONFIRMATION" });
    expect(result.data.operationHistory?.map((event) => event.type)).toEqual(
      expect.arrayContaining(["EXTERNAL_FILE_UPLOADED", "EXTERNAL_RECOGNIZED"]),
    );
  });

  it("builds persisted notification models without project or execution identifiers", () => {
    const notifications = buildCreatorNotifications(contracts, invoices);

    expect(notifications.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Invoice INV-20260727-00001 等待签署",
        "Invoice INV-20260718-00001 待上传",
        "Invoice INV-20260728-00001 付款失败，请核对收款账户",
        "Invoice INV-20260625-00001 已完成付款",
      ]),
    );
    expect(notifications.every((item) => item.deepLink.startsWith("/"))).toBe(true);
    expect(JSON.stringify(notifications)).not.toMatch(/七月联名|夏季家居|Payment Order|Payout ID|Transfer ID/);
  });

  it("searches only by Invoice number and combines legacy status filters", () => {
    expect(filterInvoiceList(invoices, "260728", "ALL")).toHaveLength(1);
    expect(filterInvoiceList(invoices, "夏季家居", "ALL")).toHaveLength(0);
    expect(filterInvoiceList(invoices, "20260728", "PAYMENT_FAILED", "Airwallex")[0]?.id).toBe(
      "INV-20260728-00001",
    );
    expect(filterInvoiceList(invoices, "Mellow Home", "ALL")).toHaveLength(0);
    expect(filterInvoiceList(invoices, "860", "ALL")).toHaveLength(0);
    expect(filterInvoiceList(invoices, "付款异常", "ALL")).toHaveLength(0);
    expect(filterInvoiceList(invoices, "", "ALL", "PayPal")).toHaveLength(0);
  });

  it("migrates the legacy rejected demo into the payment-failure repair flow", () => {
    const migrated = migrateLegacyInvoiceState({
      id: "INV-260728-R",
      projectId: "REQ-260711",
      projectName: "七月联名",
      brand: "Mellow Home",
      channel: "Airwallex",
      amount: "USD 2,100",
      status: "REJECTED",
      issuedAt: "2026-07-28",
      updatedAt: "刚刚",
      rejectedReason: "旧退回原因",
    });

    expect(migrated.paymentIssue).toMatchObject({
      version: 1,
      fieldKey: "account_number",
      maskedValue: "···· 0189",
    });
    expect(migrated.paymentIssue?.resolvedAt).toBeUndefined();
  });

  it("migrates the superseded rejected mock record to pending review", () => {
    const migrated = migrateLegacyInvoiceState({
      id: "INV-240711-C",
      projectId: "REQ-260711",
      projectName: "七月联名",
      brand: "Mellow Home",
      channel: "Airwallex",
      amount: "USD 2,100",
      status: "REJECTED",
      issuedAt: "2026-07-11",
      updatedAt: "07-18 17:40",
      rejectedReason: "旧退回原因",
    });
    expect(migrated.status).toBe("PENDING_REVIEW");
    expect(migrated).not.toHaveProperty("rejectedReason");
  });

  it("includes a current payment-failed invoice with actionable payout details", async () => {
    const adapter = new MockApiAdapter();
    const result = await adapter.invoices.get("INV-20260728-00001");

    expect(result.data).toMatchObject({
      status: "PAYMENT_FAILED",
      projectName: "七月联名",
      paymentIssue: {
        fieldKey: "account_number",
        fieldLabel: "银行账号 / Bank account number",
        maskedValue: "···· 0189",
      },
    });
  });

  it("shows verification and issue feedback only before an invoice is signed", () => {
    expect(shouldShowInvoicePreSigningControls("DRAFT_SIGNATURE")).toBe(true);
    expect(shouldShowInvoicePreSigningControls("PENDING_REVIEW")).toBe(false);
    expect(shouldShowInvoicePreSigningControls("PAYMENT_FAILED")).toBe(false);
    expect(shouldShowInvoicePreSigningControls("APPROVED")).toBe(false);
    expect(shouldShowInvoicePreSigningControls("PAID")).toBe(false);
  });

  it("places unsigned invoices first and paid invoices last", () => {
    const sorted = sortInvoices(invoices);
    expect(sorted[0].status).toBe("DRAFT_SIGNATURE");
    expect(sorted.at(-1)?.status).toBe("PAID");
  });

  it("does not mutate the source list", () => {
    const original = [...invoices];
    sortInvoices(invoices);
    expect(invoices).toEqual(original);
  });

  it("requires a failed payout value to actually change", async () => {
    const adapter = new MockApiAdapter();
    await expect(
      adapter.payments.submitAccountCorrection(
        "INV-20260728-00001",
        {
          fieldKey: "account_number",
          correctedValue: "FR7630006000011234567890189",
          submittedBy: "CREATOR-001",
        },
      ),
    ).rejects.toThrow("请修改错误字段或选择其他已验证收款账户");
  });

  it("submits payment account correction without changing the approved document state", async () => {
    const adapter = new MockApiAdapter();
    const before = await adapter.invoices.list();
    const result = await adapter.payments.submitAccountCorrection(
      "INV-20260728-00001",
      {
        fieldKey: "account_number",
        correctedValue: "FR7630006000011234567890197",
        submittedBy: "CREATOR-001",
      },
    );
    const after = await adapter.invoices.list();
    expect(result.data.documentState).toEqual({ kind: "EXTERNAL", status: "APPROVED" });
    expect(result.data.paymentStatus).toBe("FAILED");
    expect(result.data.paymentRecoveryStatus).toBe("PENDING_FINANCE_CONFIRMATION");
    expect(result.data.paymentIssue?.resolvedAt).toBeTruthy();
    expect(after.data).toHaveLength(before.data.length);
    expect(after.data.filter((item) => invoiceInternalIdOf(item) === invoiceInternalIdOf(result.data))).toHaveLength(1);
  });

  it("accepts an explicit unchanged-account retry request without executing payment", async () => {
    const adapter = new MockApiAdapter();
    const auditBefore = adminStore.listAudits().length;
    const invoice = (await adapter.invoices.getExternalInvoice("INV-20260728-00001", "CREATOR-001")).data!;
    const before = (await adapter.payments.listAttempts(invoice.invoiceId!, "CREATOR-001")).data;
    const input = { mode: "CONFIRM_ORIGINAL" as const, payoutAccountId: invoice.payoutAccountId!, submittedBy: "CREATOR-001", expectedVersion: invoice.version!, clientRequestId: "retry:unchanged" };
    const result = await adapter.payments.requestPaymentRetry(invoice.invoiceId!, input);
    expect(adminStore.listAudits()).toHaveLength(auditBefore + 1);
    expect(adminStore.listAudits()[0]).toMatchObject({ actorId: "CREATOR-001", module: "PAYMENT", action: "CREATOR_BUSINESS_ACTION" });
    expect(result.data.documentState).toEqual({ kind: "EXTERNAL", status: "APPROVED" });
    expect(result.data.paymentStatus).toBe("FAILED");
    expect(result.data.paymentRecoveryStatus).toBe("PENDING_FINANCE_CONFIRMATION");
    expect(result.data.paymentRetryRequest).toMatchObject({ mode: "CONFIRM_ORIGINAL", payoutAccountId: invoice.payoutAccountId });
    expect(result.data.paymentIssue?.resolvedAt).toBeUndefined();
    expect((await adapter.payments.listAttempts(invoice.invoiceId!, "CREATOR-001")).data).toEqual(before);
    const duplicate = await adapter.payments.requestPaymentRetry(invoice.invoiceId!, input);
    expect(duplicate.data.version).toBe(result.data.version);
    expect(adminStore.listAudits()).toHaveLength(auditBefore + 1);
    await expect(adapter.payments.requestPaymentRetry(invoice.invoiceId!, { ...input, expectedVersion: result.data.version!, clientRequestId: "retry:again" })).rejects.toThrow("不能申请");
  });

  it("separates a saved profile change from the retry request and records the new snapshot", async () => {
    const adapter = new MockApiAdapter();
    const invoice = (await adapter.invoices.getExternalInvoice("INV-20260728-00001", "CREATOR-001")).data!;
    const profile = (await adapter.profile.get()).data;
    const changedNumber = "FR7630006000011234567890197";
    const changed = { ...profile.payout, accountNumber: changedNumber, schemaValues: { ...profile.payout.schemaValues, account_number: changedNumber } };
    await adapter.profile.save({ ...profile, payout: changed, payoutAccounts: profile.payoutAccounts.map((account) => account.id === changed.id ? changed : account) });
    expect((await adapter.invoices.getExternalInvoice(invoice.invoiceId!, "CREATOR-001")).data?.paymentRecoveryStatus).toBe("AWAITING_CREATOR_UPDATE");
    expect((await adapter.payments.listAttempts(invoice.invoiceId!, "CREATOR-001")).data[0].payoutSnapshot?.accountNumber).toBe(invoice.payoutSnapshot?.accountNumber);
    await expect(adapter.payments.requestPaymentRetry(invoice.invoiceId!, { mode: "CONFIRM_ORIGINAL", payoutAccountId: changed.id, submittedBy: "CREATOR-001", expectedVersion: invoice.version!, clientRequestId: "retry:wrong-mode" })).rejects.toThrow("已变化");
    const requested = await adapter.payments.requestPaymentRetry(invoice.invoiceId!, { mode: "UPDATED_ACCOUNT", payoutAccountId: changed.id, submittedBy: "CREATOR-001", expectedVersion: invoice.version!, clientRequestId: "retry:updated" });
    expect(requested.data.paymentRetryRequest?.payoutSnapshot.accountNumber).toBe(changedNumber);
    expect((await adapter.payments.listAttempts(invoice.invoiceId!, "CREATOR-001")).data[0].payoutSnapshot?.accountNumber).toBe(invoice.payoutSnapshot?.accountNumber);
    expect(requested.data.reviewHistory?.at(-1)?.action).toBe("PAYMENT_RETRY_REQUESTED");
    expect(requested.data.paymentStatus).toBe("FAILED");
  });

  it("rejects cross-creator, stale, unavailable, and falsely switched retry requests", async () => {
    const adapter = new MockApiAdapter();
    const invoice = (await adapter.invoices.getExternalInvoice("INV-20260728-00001", "CREATOR-001")).data!;
    const input = { mode: "SWITCH_ACCOUNT" as const, payoutAccountId: "missing", submittedBy: "CREATOR-001", expectedVersion: invoice.version!, clientRequestId: "retry:invalid" };
    await expect(adapter.payments.requestPaymentRetry(invoice.invoiceId!, { ...input, submittedBy: "CREATOR-OTHER" })).rejects.toThrow("无权访问");
    await expect(adapter.payments.requestPaymentRetry(invoice.invoiceId!, { ...input, expectedVersion: 999 })).rejects.toThrow("已更新");
    await expect(adapter.payments.requestPaymentRetry(invoice.invoiceId!, input)).rejects.toThrow("已验证且可用");
    await expect(adapter.payments.requestPaymentRetry(invoice.invoiceId!, { ...input, payoutAccountId: invoice.payoutAccountId! })).rejects.toThrow("已变化");
  });

  it("stages a verified alternate account only when the creator submits the retry request", async () => {
    const adapter = new MockApiAdapter();
    const invoice = (await adapter.invoices.getExternalInvoice("INV-20260728-00001", "CREATOR-001")).data!;
    const profile = (await adapter.profile.get()).data;
    const alternate = { ...profile.payoutAccounts.find((account) => account.provider === "PayPal")!, status: "VALIDATED" as const };
    await adapter.profile.save({ ...profile, payoutAccounts: profile.payoutAccounts.map((account) => account.id === alternate.id ? alternate : account) });
    expect((await adapter.invoices.getExternalInvoice(invoice.invoiceId!, "CREATOR-001")).data?.payoutAccountId).toBe(invoice.payoutAccountId);
    const requested = await adapter.payments.requestPaymentRetry(invoice.invoiceId!, { mode: "SWITCH_ACCOUNT", payoutAccountId: alternate.id, submittedBy: "CREATOR-001", expectedVersion: invoice.version!, clientRequestId: "retry:switch" });
    expect(requested.data.payoutAccountId).toBe(alternate.id);
    expect(requested.data.paymentRetryRequest?.payoutSnapshot.provider).toBe("PayPal");
    expect(requested.data.paymentStatus).toBe("FAILED");
  });

  it("persists an internal signature, enters review, and rejects a duplicate signature", async () => {
    const adapter = new MockApiAdapter();
    const beforeAuditCount = adminStore.listAudits().length;
    const signature = {
      method: "DRAWN" as const,
      dataUrl: "data:image/png;base64,c2lnbmF0dXJl",
      signerName: "Léa Martin",
      signedAt: "2026-07-27T14:45:00.000Z",
    };
    const result = await adapter.invoices.signInternalInvoice("invoice-creator-001-internal-001", signature);
    expect(result.data.documentState).toEqual({ kind: "INTERNAL", status: "UNDER_REVIEW" });
    expect(result.data.paymentStatus).toBe("WAITING_PAYMENT");
    expect(result.data.operationHistory?.at(-1)?.type).toBe("INTERNAL_SIGNED");
    expect(adminStore.listAudits()).toHaveLength(beforeAuditCount + 1);
    expect(adminStore.listAudits()[0]).toMatchObject({ action: "CREATOR_BUSINESS_ACTION", actorId: "CREATOR-001", module: "INVOICE" });
    await expect(
      adapter.invoices.signInternalInvoice("invoice-creator-001-internal-001", signature),
    ).rejects.toThrow("只有待签署的 Comets内部invoice可以签署");
    expect(adminStore.listAudits()).toHaveLength(beforeAuditCount + 1);
  });

  it("captures the current default account when signing and preserves it after profile edits", async () => {
    const adapter = new MockApiAdapter();
    const profile = structuredClone((await adapter.profile.get()).data);
    const updatedAccountNumber = "FR7630006000011234567890197";
    const updatedProfile = {
      ...profile,
      payout: { ...profile.payout, accountNumber: updatedAccountNumber, schemaValues: { ...profile.payout.schemaValues, account_number: updatedAccountNumber } },
      payoutAccounts: profile.payoutAccounts.map((account) => account.id === profile.defaultPayoutAccountId
        ? { ...account, accountNumber: updatedAccountNumber, schemaValues: { ...account.schemaValues, account_number: updatedAccountNumber } }
        : account),
    };
    await adapter.profile.save(updatedProfile);
    const signed = await adapter.invoices.signInternalInvoice("invoice-creator-001-internal-001", {
      method: "DRAWN",
      dataUrl: "data:image/png;base64,c2lnbmF0dXJl",
      signerName: "Léa Martin",
      signedAt: "2026-07-27T14:45:00.000Z",
    });
    expect(signed.data.payoutAccountId).toBe(profile.defaultPayoutAccountId);
    expect(signed.data.payoutSnapshot?.accountNumber).toBe(updatedAccountNumber);

    const nextProfile = structuredClone((await adapter.profile.get()).data);
    await adapter.profile.save({
      ...nextProfile,
      payout: { ...nextProfile.payout, accountNumber: "FR7630006000011234567890189", schemaValues: { ...nextProfile.payout.schemaValues, account_number: "FR7630006000011234567890189" } },
      payoutAccounts: nextProfile.payoutAccounts.map((account) => account.id === nextProfile.defaultPayoutAccountId
        ? { ...account, accountNumber: "FR7630006000011234567890189", schemaValues: { ...account.schemaValues, account_number: "FR7630006000011234567890189" } }
        : account),
    });
    const after = (await adapter.invoices.list()).data.find((item) => invoiceInternalIdOf(item) === "invoice-creator-001-internal-001");
    expect(after?.payoutSnapshot?.accountNumber).toBe(updatedAccountNumber);
  });

  it("persists creator feedback and moves the internal Invoice into feedback processing", async () => {
    const adapter = new MockApiAdapter();
    const result = await adapter.invoices.submitFeedback("invoice-creator-001-internal-001", {
      issueType: "金额或币种有误",
      details: "币种应为 EUR",
      submittedBy: "CREATOR-001",
    });
    expect(result.data.documentState).toEqual({ kind: "INTERNAL", status: "CREATOR_FEEDBACK" });
    expect(result.data.feedbackRecords?.at(-1)).toMatchObject({
      issueType: "金额或币种有误",
      invoiceId: "invoice-creator-001-internal-001",
      submittedBy: "CREATOR-001",
    });
    expect(result.data.operationHistory?.at(-1)?.type).toBe("FEEDBACK_SUBMITTED");
  });

  it("rejects payout-account switching for a Comets internal contract", async () => {
    const adapter = new MockApiAdapter();
    await expect(
      adapter.invoices.selectPayoutAccount(
        "invoice-creator-001-internal-001",
        "payout-awx-fr-primary",
      ),
    ).rejects.toThrow("收款信息由支付管理端同步");
  });

  it("keeps external Invoice account selection available in an editable state", async () => {
    const adapter = new MockApiAdapter();
    const current = (await adapter.profile.get()).data;
    const replacement = {
      ...structuredClone(current.payout),
      id: "payout-awx-replacement",
      name: "Replacement account",
      accountNumber: "FR7630006000011234567890197",
      schemaValues: {
        ...current.payout.schemaValues,
        account_number: "FR7630006000011234567890197",
        iban: "FR7630006000011234567890197",
      },
    };
    await adapter.profile.save({
      ...current,
      payout: replacement,
      payoutAccounts: [replacement],
      defaultPayoutAccountId: replacement.id,
    });

    const selected = await adapter.invoices.selectPayoutAccount(
      "invoice-creator-001-external-003",
      replacement.id,
    );

    expect(selected.data.payoutAccountId).toBe(replacement.id);
    expect(selected.data.payoutSnapshot?.accountNumber).toBe(
      "FR7630006000011234567890197",
    );
  });

  it("migrates a legacy removed account into an immutable Invoice snapshot", async () => {
    const legacyProfile = structuredClone(initialProfile);
    legacyProfile.payoutAccountsVersion = 2;
    const legacyInvoice = {
      ...structuredClone(invoices[0]),
      payoutAccountId: "payout-awx-jp-backup",
      payoutSnapshot: undefined,
    };
    const storage = new Map<string, string>([
      ["comets-creator-profile-v2", JSON.stringify(legacyProfile)],
      ["comets-creator-invoices-v2", JSON.stringify([legacyInvoice])],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });

    const adapter = new MockApiAdapter();
    const migratedInvoice = (await adapter.invoices.get(
      "invoice-creator-001-internal-001",
    )).data!;
    const migratedProfile = (await adapter.profile.get()).data;

    expect(migratedProfile.payoutAccounts.filter(
      (account) => account.channel === "AIRWALLEX",
    )).toHaveLength(1);
    expect(migratedInvoice.payoutSnapshot).toMatchObject({
      bankName: "MUFG Bank",
      accountNumber: "0008921",
    });
  });

  it("uploads and confirms an external Invoice through explicit commands", async () => {
    const adapter = new MockApiAdapter();
    const account = initialProfile.payoutAccounts[0];
    const uploaded = await adapter.invoices.uploadExternal({
      invoiceId: "invoice-creator-001-external-003",
      payoutAccountId: account.id,
      file: { id: "external-v1", name: "invoice.pdf", mimeType: "application/pdf", size: 2048 },
      extractedData: {
        invoiceFrom: initialProfile.legalName,
        billTo: "COMETS INTERNATIONAL LIMITED",
        invoiceDate: "2026-07-18",
        currency: "USD",
        total: "3240",
        paymentDetails: payoutAccountPaymentDetails(account),
        invoiceFromMatchesProfile: true,
        billToMatchesComets: true,
      },
    });
    expect(uploaded.data.documentState).toEqual({ kind: "EXTERNAL", status: "WAITING_CONFIRMATION" });
    const confirmed = await adapter.invoices.confirmExternal("invoice-creator-001-external-003");
    expect(confirmed.data.documentState).toEqual({ kind: "EXTERNAL", status: "WAITING_MEDIA_REVIEW" });
    expect(confirmed.data.paymentStatus).toBe("WAITING_PAYMENT");
  });

  it("distinguishes returned correction from returned re-upload", async () => {
    const adapter = new MockApiAdapter();
    const account = initialProfile.payoutAccounts[0];
    await expect(
      adapter.invoices.correctExternal("invoice-creator-001-external-004", {
        invoiceFrom: initialProfile.legalName,
        billTo: "COMETS INTERNATIONAL LIMITED",
        invoiceDate: "2026-07-14",
        currency: "EUR",
        total: "1850",
        paymentDetails: payoutAccountPaymentDetails(account),
        invoiceFromMatchesProfile: true,
        billToMatchesComets: true,
      }),
    ).rejects.toThrow("当前 Invoice 未被退回修改");
    const reuploaded = await adapter.invoices.resubmitExternal({
      invoiceId: "invoice-creator-001-external-004",
      payoutAccountId: account.id,
      file: { id: "external-v2", name: "invoice-v2.pdf", mimeType: "application/pdf", size: 4096 },
      extractedData: {
        invoiceFrom: initialProfile.legalName,
        billTo: "COMETS INTERNATIONAL LIMITED",
        invoiceDate: "2026-07-14",
        currency: "EUR",
        total: "1850",
        paymentDetails: payoutAccountPaymentDetails(account),
        invoiceFromMatchesProfile: true,
        billToMatchesComets: true,
      },
    });
    expect(reuploaded.data.fileVersions).toHaveLength(2);
    expect(reuploaded.data.fileVersions?.map((file) => file.id)).toEqual(["invoice-file-external-004-v1", "external-v2"]);
  });
});

describe("creator invoice-centric workflow", () => {
  it("signs a pending contract only once and rejects administrator signing", async () => {
    const adapter = new MockApiAdapter();
    const signature = { method: "DRAWN" as const, dataUrl: "data:image/png;base64,dGVzdA==", signerName: "Léa Martin", signedAt: "2026-09-19T10:00:00.000Z" };
    await expect(
      adapter.contracts.signContract("CON-260727-KOL-02", {
        userId: "ADMIN-001",
        role: "ADMIN",
      }, signature),
    ).rejects.toThrow("管理员只读视图不能替达人签署合同");

    const signed = await adapter.contracts.signContract("CON-260727-KOL-02", {
      userId: "CREATOR-001",
      role: "CREATOR",
    }, signature);
    expect(signed.data.status).toBe("ACTIVE");
    expect(signed.data.signatureRecord).toMatchObject({ actorRole: "CREATOR", signature: { method: "DRAWN", dataUrl: signature.dataUrl } });
    expect((await adapter.contracts.get("CON-260727-KOL-02")).data?.signatureRecord?.signature?.dataUrl).toBe(signature.dataUrl);
    await expect(
      adapter.contracts.signContract("CON-260727-KOL-02", {
        userId: "CREATOR-001",
        role: "CREATOR",
      }, signature),
    ).rejects.toThrow("只有待签署合同可以签署");
  });

  it("persists the contract signature across reload without creating an Invoice", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    const adapter = new MockApiAdapter();
    const before = (await adapter.invoices.list()).data.length;
    await expect(adapter.contracts.signContract("CON-260727-KOL-02", { userId: "CREATOR-001", role: "CREATOR" }, {
      method: "DRAWN", dataUrl: "", signerName: "Léa Martin", signedAt: new Date().toISOString(),
    })).rejects.toThrow("请完成签名");
    await adapter.contracts.signContract("CON-260727-KOL-02", { userId: "CREATOR-001", role: "CREATOR" }, {
      method: "GENERATED", dataUrl: "data:image/png;base64,dGVzdA==", signerName: "Léa Martin", signedAt: new Date().toISOString(),
    });
    const restored = new MockApiAdapter();
    expect((await restored.contracts.get("CON-260727-KOL-02")).data?.signatureRecord?.signature?.method).toBe("GENERATED");
    expect((await restored.invoices.list()).data).toHaveLength(before);
  });

  it("aggregates stable tasks with resource IDs, invoice-number copy, and deep links", () => {
    const tasks = buildCreatorTasks(contracts, [
      ...invoices,
      {
        ...invoices[0],
        id: "INV-20260918-00009",
        invoiceNumber: "INV-20260918-00009",
        invoiceId: "invoice-processing-demo",
        documentState: { kind: "INTERNAL", status: "UNDER_REVIEW" },
        status: "PENDING_REVIEW",
      },
    ]);
    const uploadTask = tasks.find((task) => task.type === "EXTERNAL_INVOICE_UPLOAD" && task.resourceNumber === "INV-20260920-00001");
    expect(uploadTask).toMatchObject({
      resourceId: "invoice-creator-001-external-demo-20260920",
      resourceNumber: "INV-20260920-00001",
      deepLink: "/invoices/INV-20260920-00001",
    });
    expect(tasks.some((task) => task.group === "TODO")).toBe(true);
    expect(tasks.some((task) => task.group === "PROCESSING")).toBe(true);
    expect(tasks.some((task) => task.group === "COMPLETED")).toBe(true);
    expect(JSON.stringify(tasks)).not.toMatch(/七月联名|夏季家居|Mellow Home|Payment Order|Payout ID|Transfer ID/);
  });

  it("persists creator notification read state across adapter refreshes", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    const firstAdapter = new MockApiAdapter();
    const firstList = await firstAdapter.notifications.list("CREATOR-001");
    const target = firstList.data[0];
    await firstAdapter.notifications.markRead(target.id, "CREATOR-001");
    expect((await firstAdapter.notifications.getUnreadCount("CREATOR-001")).data).toBe(firstList.data.length - 1);

    const refreshedAdapter = new MockApiAdapter();
    const refreshed = await refreshedAdapter.notifications.list("CREATOR-001");
    expect(refreshed.data.find((item) => item.id === target.id)?.read).toBe(true);
    const allRead = await refreshedAdapter.notifications.markAllRead("CREATOR-001");
    expect(allRead.data.every((item) => item.read)).toBe(true);
  });

  it.each([
    ["PENDING_REVIEW", "UNDER_REVIEW", "WAITING_PAYMENT"],
    ["APPROVED", "APPROVED", "WAITING_PAYMENT"],
    ["PAYMENT_FAILED", "APPROVED", "FAILED"],
    ["PAID", "APPROVED", "PAID"],
  ] as const)("migrates legacy %s into separated document and payment states", (legacy, documentStatus, paymentStatus) => {
    const migrated = migrateInvoice({
      ...invoices[0],
      invoiceId: undefined,
      invoiceNumber: undefined,
      documentState: undefined,
      paymentStatus: undefined,
      paymentRecoveryStatus: undefined,
      status: legacy,
    });
    expect(migrated.invoiceId).toBe(`invoice:${invoices[0].id}`);
    expect(migrated.invoiceNumber).toBe(invoices[0].id);
    expect(migrated.documentState?.status).toBe(documentStatus);
    expect(migrated.paymentStatus).toBe(paymentStatus);
  });

  it("keeps invoiceNumber user-visible while preserving invoiceId for service commands", () => {
    const invoice = migrateInvoice(invoices[0]);
    expect(invoiceNumberOf(invoice)).toBe("INV-20260727-00001");
    expect(invoiceInternalIdOf(invoice)).toBe("invoice-creator-001-internal-001");
    expect(invoiceNumberOf(invoice)).not.toBe(invoiceInternalIdOf(invoice));
  });
});

describe("request and invoice consistency", () => {
  it("keeps the payment issue blocked while the linked invoice has failed", () => {
    const request = requests.find((item) => item.id === "REQ-260728-MH-JULY")!;
    expect(syncRequestWithInvoices(request, invoices).status).toBe("PAYMENT_FAILED");
  });

  it("retains the other unsigned Invoice when a failed payout is repaired", () => {
    const request = requests.find((item) => item.id === "REQ-260728-MH-JULY")!;
    const resubmitted = invoices.map((invoice) =>
      ["INV-20260728-00001", "INV-20260920-00003"].includes(invoice.id)
        ? { ...invoice, status: "APPROVED" as const }
        : invoice,
    );
    const synced = syncRequestWithInvoices(request, resubmitted);
    expect(synced.status).toBe("DRAFT_SIGNATURE");
    expect(synced.amount).toBe("USD 3,730");
    expect(synced.contractStatus).toBe(request.contractStatus);
    expect(synced.issues).toHaveLength(0);
    expect(synced.progress[1].state).toBe("current");
    expect(synced.progress[2].state).toBe("pending");
  });
});

describe("registration validation", () => {
  const validValues = {
    email: "creator@example.com",
    password: "Creator2026",
    invitationCode: DEMO_INVITATION_CODE,
  };

  it("rejects an invalid email address", () => {
    expect(
      validateRegistration({ ...validValues, email: "creator" }, true),
    ).toBe("请输入有效的邮箱地址");
  });

  it("requires a password between eight and twenty characters", () => {
    expect(
      validateRegistration({ ...validValues, password: "Aa@1234" }, true),
    ).toBe("密码需为 8–20 位字符");
    expect(
      validateRegistration(
        { ...validValues, password: `Aa@1234567890123456789` },
        true,
      ),
    ).toBe("密码需为 8–20 位字符");
  });

  it.each([
    ["uppercase letters", "creator2026"],
    ["lowercase letters", "CREATOR2026"],
    ["numbers", "Creator@Test"],
  ])("requires %s in a composite password", (_requirement, password) => {
    expect(
      validateRegistration({ ...validValues, password }, true),
    ).toBe("密码须同时包含大写字母、小写字母和数字");
  });

  it("allows special characters without requiring them", () => {
    expect(
      validateRegistration({ ...validValues, password: "Creator@2026" }, true),
    ).toBe("");
  });

  it("rejects whitespace in a password", () => {
    expect(
      validateRegistration({ ...validValues, password: "Creator @2026" }, true),
    ).toBe("密码不能包含空格");
  });

  it("requires agreement acceptance", () => {
    expect(validateRegistration(validValues, false)).toContain("服务协议");
  });

  it("requires the same demonstration invitation for email and Google registration", () => {
    expect(validateRegistration({ ...validValues, invitationCode: "" }, true)).toContain("请输入邀请码");
    expect(validateRegistration({ ...validValues, invitationCode: "BAD" }, true)).toContain("邀请码无效");
    expect(validateDemoInvitation("BAD", true)).toContain("邀请码无效");
    expect(validateDemoInvitation(DEMO_INVITATION_CODE, false)).toContain("服务协议");
    expect(validateDemoInvitation(DEMO_INVITATION_CODE, true)).toBe("");
    const store = new MockAdminStore(false);
    expect(() => store.register("Invalid", "invalid@example.com", "Creator2026", "BAD")).toThrow("邀请码无效");
  });

  it("fills only empty demonstration fields without persisting credentials or bypassing verification", () => {
    const values = fillEmptyFields({ email: "own@example.com", password: "", invitationCode: "" }, demonstrationRegistrationValues());
    expect(values.email).toBe("own@example.com");
    expect(values.password).toBe("Creator2026");
    expect(values.invitationCode).toBe(DEMO_INVITATION_CODE);
    expect(DEMO_SOCIAL_SCREENSHOT.previewUrl).toMatch(/\.svg$/);
    expect(DEMO_SOCIAL_SCREENSHOT.name).toContain("演示");
    expect(validateSocialVerification([DEMO_SOCIAL_URL], [DEMO_SOCIAL_SCREENSHOT])).toBe("");
  });

  it("generates valid Airwallex examples for the active scenario and preserves edits", () => {
    for (const [bankCountryCode, accountCurrency] of [["FR", "EUR"], ["GB", "GBP"], ["US", "USD"], ["JP", "JPY"]] as const) {
      for (const entityType of ["PERSONAL", "COMPANY"] as const) {
        for (const transferMethod of ["LOCAL", "SWIFT"] as const) {
          const condition = { bankCountryCode, accountCurrency, entityType, transferMethod };
          const schema = buildAirwallexMockSchema(condition);
          const demo = fillAirwallexDemoValues(schema, condition, { account_name: "Own Name" });
          expect(demo.account_name).toBe("Own Name");
          expect(validateAirwallexSchemaValues(schema, demo)).toEqual({});
          expect(fillAirwallexDemoValues(schema, condition, demo)).toEqual(demo);
        }
      }
    }
  });

  it("accepts a complete registration form", () => {
    expect(validateRegistration(validValues, true)).toBe("");
  });

  it("returns a recoverable error when the email is already registered", () => {
    const store = new MockAdminStore(false);
    expect(() =>
      store.register("Duplicate Creator", CREATOR_DEMO_CREDENTIALS.email, "Creator2026", DEMO_INVITATION_CODE),
    ).toThrow("该邮箱已注册");
  });

  it("keeps the store usable after a duplicate registration attempt", () => {
    const store = new MockAdminStore(false);
    expect(() =>
      store.register("Duplicate Creator", CREATOR_DEMO_CREDENTIALS.email, "Creator2026", DEMO_INVITATION_CODE),
    ).toThrow("该邮箱已注册");

    const session = store.register(
      "Retry Creator",
      "retry.creator@example.com",
      "Creator2026",
      DEMO_INVITATION_CODE,
    );
    expect(session.role).toBe("CREATOR");
    expect(session.email).toBe("retry.creator@example.com");
  });
});

describe("social verification validation", () => {
  const screenshot = {
    id: "FILE-QA",
    name: "instagram-console.png",
    mimeType: "image/png",
    size: 1024,
  };

  it("accepts multiple valid profile links with a screenshot", () => {
    expect(
      validateSocialVerification(
        ["https://instagram.com/creator", "https://youtube.com/@creator"],
        [screenshot],
      ),
    ).toBe("");
  });

  it("rejects empty or invalid profile links", () => {
    expect(
      validateSocialVerification(
        ["instagram.com/creator"],
        [screenshot],
      ),
    ).toContain("有效主页链接");
  });

  it("requires at least one backend screenshot", () => {
    expect(
      validateSocialVerification(
        ["https://instagram.com/creator"],
        [],
      ),
    ).toContain("后台截图");
  });
});

describe("Airwallex beneficiary flow", () => {
  const usLocalCondition = {
    bankCountryCode: "US",
    accountCurrency: "USD",
    entityType: "PERSONAL" as const,
    transferMethod: "LOCAL" as const,
  };

  it("generates fields dynamically from the payment scenario", () => {
    const localSchema = buildAirwallexMockSchema(usLocalCondition);
    const swiftSchema = buildAirwallexMockSchema({
      ...usLocalCondition,
      transferMethod: "SWIFT",
    });

    expect(localSchema.fields.some((field) => field.key === "routing_number")).toBe(true);
    expect(localSchema.fields.some((field) => field.key === "swift_code")).toBe(true);
    expect(localSchema.fields.some((field) => field.key === "bank_street_address")).toBe(true);
    expect(swiftSchema.fields.some((field) => field.key === "swift_code")).toBe(true);
    expect(swiftSchema.fields.some((field) => field.key === "routing_number")).toBe(false);
  });

  it("normalizes every API schema to the five required payment fields", () => {
    const normalized = normalizeAirwallexFormSchema({
      key: "api-us-local",
      condition: usLocalCondition,
      fields: [
        {
          key: "bank_address",
          path: "beneficiary.bank_details.bank_address",
          label: "Bank address",
          type: "INPUT",
          required: false,
        },
        {
          key: "routing_number",
          path: "beneficiary.bank_details.account_routing_value1",
          label: "ABA Routing Number",
          type: "INPUT",
          required: true,
        },
      ],
    });

    expect(normalized.fields.slice(0, 5).map((field) => field.key)).toEqual([
      "account_name",
      "account_number",
      "bank_name",
      "bank_street_address",
      "swift_code",
    ]);
    expect(normalized.fields.slice(0, 5).every((field) => field.required)).toBe(
      true,
    );
    expect(
      normalized.fields.filter(
        (field) => field.key === "bank_street_address",
      ),
    ).toHaveLength(1);
    expect(normalized.fields.at(-1)?.key).toBe("routing_number");
  });

  it("drops fields that do not belong to the newly generated schema", () => {
    const swiftSchema = buildAirwallexMockSchema({
      ...usLocalCondition,
      transferMethod: "SWIFT",
    });
    const reconciled = reconcileAirwallexSchemaValues(swiftSchema, {
      account_name: "Mina Kato",
      account_number: "123456789",
      bank_name: "Example Bank",
      routing_number: "021000021",
      account_type: "CHECKING",
    });

    expect(reconciled).toMatchObject({
      account_name: "Mina Kato",
      account_number: "123456789",
      bank_name: "Example Bank",
      swift_code: "",
      bank_street_address: "",
    });
    expect(reconciled).not.toHaveProperty("routing_number");
    expect(reconciled).not.toHaveProperty("account_type");
  });

  it("requires the new scenario fields after a schema change", async () => {
    const adapter = new MockApiAdapter();
    const swiftSchema = buildAirwallexMockSchema({
      ...usLocalCondition,
      transferMethod: "SWIFT",
    });
    const values = reconcileAirwallexSchemaValues(swiftSchema, {
      account_name: "Mina Kato",
      account_number: "123456789",
      bank_name: "Example Bank",
      bank_street_address: "1 Market Street, San Francisco, CA 94105",
      routing_number: "021000021",
    });

    await expect(
      adapter.payout.validateBeneficiary(swiftSchema, values),
    ).rejects.toThrow("国际汇款代码为必填项");
  });

  it("validates schema fields before creating a beneficiary", async () => {
    const adapter = new MockApiAdapter();
    const schema = buildAirwallexMockSchema(usLocalCondition);
    const values = {
      account_name: "Mina Kato",
      account_number: "123456789",
      bank_name: "Example Bank",
      bank_street_address: "1 Market Street, San Francisco, CA 94105",
      swift_code: "BOFAUS3N",
      routing_number: "021000021",
      account_type: "CHECKING",
    };

    await expect(adapter.payout.validateBeneficiary(schema, values)).resolves.toEqual({
      data: { valid: true },
    });
    const created = await adapter.payout.createBeneficiary(usLocalCondition, values);
    expect(created.data.beneficiaryId).toMatch(/^bene_us/);
    expect(created.data.status).toBe("VALIDATED");
  });

  it("rejects values that fail the schema rule", async () => {
    const adapter = new MockApiAdapter();
    const schema = buildAirwallexMockSchema(usLocalCondition);
    await expect(
      adapter.payout.validateBeneficiary(schema, {
        account_name: "Mina Kato",
        account_number: "123456789",
        bank_name: "Example Bank",
        bank_street_address: "1 Market Street, San Francisco, CA 94105",
        swift_code: "BOFAUS3N",
        routing_number: "123",
        account_type: "CHECKING",
      }),
    ).rejects.toThrow("ABA 路由号码应为 9 位数字");
  });

  it("normalizes the account name to English letters and spaces", () => {
    expect(sanitizeEnglishAccountName("Léa-Martin 123")).toBe("LeaMartin ");
    expect(sanitizeEnglishAccountName("  Lea   Martin")).toBe("Lea Martin");
  });

  it("rejects account names containing numbers or symbols", async () => {
    const adapter = new MockApiAdapter();
    const schema = buildAirwallexMockSchema(usLocalCondition);

    await expect(
      adapter.payout.validateBeneficiary(schema, {
        account_name: "Mina-Kato2",
        account_number: "123456789",
        bank_name: "Example Bank",
        bank_street_address: "1 Market Street, San Francisco, CA 94105",
        swift_code: "BOFAUS3N",
        routing_number: "021000021",
        account_type: "CHECKING",
      }),
    ).rejects.toThrow("收款账户名仅支持英文字母和单个空格");
  });

  it("always validates the five required payment fields plus scenario fields", () => {
    const schema = buildAirwallexMockSchema({
      bankCountryCode: "GB",
      accountCurrency: "EUR",
      entityType: "PERSONAL",
      transferMethod: "LOCAL",
    });
    const errors = validateAirwallexSchemaValues(schema, {
      account_name: "Lea-2",
      account_number: "12",
      bank_name: "!",
      bank_street_address: "",
      swift_code: "ABC",
      iban: "11",
    });

    expect(Object.keys(errors)).toEqual([
      "account_name",
      "account_number",
      "bank_name",
      "bank_street_address",
      "swift_code",
      "iban",
    ]);
    expect(errors.iban).toContain("IBAN");
  });

  it("checks the IBAN country, scenario length, and MOD-97 checksum", () => {
    const schema = buildAirwallexMockSchema({
      bankCountryCode: "GB",
      accountCurrency: "EUR",
      entityType: "PERSONAL",
      transferMethod: "LOCAL",
    });
    const validValues = {
      account_name: "Lea Martin",
      account_number: "12345678",
      bank_name: "Westminster Bank",
      bank_street_address: "1 Churchill Place, London E14 5HP, United Kingdom",
      swift_code: "BARCGB22",
      iban: "GB82WEST12345698765432",
    };

    expect(validateAirwallexSchemaValues(schema, validValues)).toEqual({});
    expect(
      validateAirwallexSchemaValues(schema, {
        ...validValues,
        iban: "FR7630006000011234567890189",
      }).iban,
    ).toContain("22");
    expect(
      validateAirwallexSchemaValues(schema, {
        ...validValues,
        iban: "GB82WEST12345698765433",
      }).iban,
    ).toContain("校验位");
  });

  it("provides concrete format requirements and examples for Schema inputs", () => {
    const schema = buildAirwallexMockSchema({
      bankCountryCode: "FR",
      accountCurrency: "EUR",
      entityType: "PERSONAL",
      transferMethod: "LOCAL",
    });
    const ibanField = schema.fields.find((field) => field.key === "iban");
    const accountNameField = schema.fields.find(
      (field) => field.key === "account_name",
    );

    expect(ibanField).toMatchObject({
      placeholder:
        "FR开头｜共27位｜仅大写字母/数字｜无空格/连字符",
      validationMessage:
        "IBAN 格式要求：FR + 2 位校验码 + 23 位大写字母或数字，共 27 位，不含空格或连字符",
    });
    expect(ibanField?.description).not.toContain("示例");
    expect(accountNameField?.placeholder).toBe(
      "仅英文字母，姓名间用单个空格",
    );
    expect(accountNameField?.description).not.toContain("示例");
  });

  it("normalizes pasted IBAN separators before schema validation", () => {
    expect(
      normalizeAirwallexSchemaValue(
        "iban",
        "gb82 west-1234 5698 7654 32",
      ),
    ).toBe("GB82WEST12345698765432");
  });
});

describe("profile payout synchronization", () => {
  it("persists registration payment fields in the creator profile", async () => {
    const adapter = new MockApiAdapter();
    const completedProfile = {
      ...structuredClone(initialProfile),
      legalName: "Aiko Tanaka",
      email: "aiko@example.com",
      phone: "+81 80 1111 2222",
      address: "1-2-3 Shibuya, Tokyo",
      payout: {
        ...structuredClone(initialProfile.payout),
        channel: "AIRWALLEX" as const,
        bankCountry: "日本 / Japan",
        currency: "JPY",
        beneficiaryType: "PERSONAL" as const,
        transferMethod: "LOCAL" as const,
        accountHolder: "Aiko Tanaka",
        bankName: "Example Bank",
        accountNumber: "1234567",
        swiftCode: "BOTKJPJT",
        beneficiaryId: "bene_jp_sync_001",
        schemaValues: {
          account_name: "Aiko Tanaka",
          account_number: "1234567",
          bank_name: "Example Bank",
          bank_street_address:
            "2-7-1 Marunouchi, Chiyoda-ku, Tokyo 100-8388, Japan",
          swift_code: "BOTKJPJT",
          bank_code: "0001",
          branch_code: "001",
          account_type: "ORDINARY",
        },
      },
    };

    await adapter.profile.save(completedProfile);
    const saved = await adapter.profile.get();

    expect(saved.data).toMatchObject({
      legalName: "Aiko Tanaka",
      email: "aiko@example.com",
      phone: "+81 80 1111 2222",
      address: "1-2-3 Shibuya, Tokyo",
      payout: {
        channel: "AIRWALLEX",
        bankCountry: "日本 / Japan",
        currency: "JPY",
        beneficiaryType: "PERSONAL",
        transferMethod: "LOCAL",
        accountHolder: "Aiko Tanaka",
        bankName: "Example Bank",
        accountNumber: "1234567",
        beneficiaryId: "bene_jp_sync_001",
        schemaValues: {
          bank_code: "0001",
          branch_code: "001",
          account_type: "ORDINARY",
          bank_street_address:
            "2-7-1 Marunouchi, Chiyoda-ku, Tokyo 100-8388, Japan",
          swift_code: "BOTKJPJT",
        },
      },
    });
  });

  it("treats all registration profile fields as required", async () => {
    const adapter = new MockApiAdapter();
    const incompleteProfile = {
      ...structuredClone(initialProfile),
      phone: "",
    };

    expect(() => validateRequiredProfileFields(incompleteProfile)).toThrow(
      "联系电话 / Tel",
    );
    await expect(adapter.profile.save(incompleteProfile)).rejects.toThrow(
      "联系电话 / Tel",
    );
  });

  it("rejects an invalid profile contact email before saving", async () => {
    const adapter = new MockApiAdapter();
    const invalidProfile = {
      ...structuredClone(initialProfile),
      email: "@gmail.com",
    };

    expect(() => validateRequiredProfileFields(invalidProfile)).toThrow(
      "请输入有效的联系邮箱地址",
    );
    await expect(adapter.profile.save(invalidProfile)).rejects.toThrow(
      "请输入有效的联系邮箱地址",
    );
  });

  it("requires the dynamic fields generated during registration", async () => {
    const adapter = new MockApiAdapter();
    const incompleteProfile = {
      ...structuredClone(initialProfile),
      payout: {
        ...structuredClone(initialProfile.payout),
        schemaValues: {
          ...structuredClone(initialProfile.payout.schemaValues),
          iban: "",
        },
      },
    };

    await expect(adapter.profile.save(incompleteProfile)).rejects.toThrow(
      "国际银行账号",
    );
  });

  it("merges synonymous registration fields and only returns missing optional fields", () => {
    const fields = buildProfileSupplementalFields(
      structuredClone(initialProfile),
    );
    const keys = fields.map((field) => field.key);

    expect(keys).not.toContain("account_name");
    expect(keys).not.toContain("bank_name");
    expect(keys).not.toContain("account_number");
    expect(keys).not.toContain("bank_street_address");
    expect(keys).not.toContain("swift_code");
    expect(keys).not.toContain("iban");
    expect(keys).not.toContain("mandatory_trade_amount");
    expect(keys).toContain("beneficiary_id_number");
  });

  it("switches optional identity fields by beneficiary type", () => {
    const companyProfile = {
      ...structuredClone(initialProfile),
      payout: {
        ...structuredClone(initialProfile.payout),
        beneficiaryType: "COMPANY" as const,
      },
    };
    const keys = buildProfileSupplementalFields(companyProfile).map(
      (field) => field.key,
    );

    expect(keys).toContain("business_registration_number");
    expect(keys).not.toContain("id_document_type");
    expect(keys).not.toContain("beneficiary_id_number");
  });

  it("allows optional supplemental fields to remain empty", async () => {
    const adapter = new MockApiAdapter();
    const completeProfile = structuredClone(initialProfile);

    await expect(adapter.profile.save(completeProfile)).resolves.toMatchObject({
      data: {
        legalName: initialProfile.legalName,
        payout: {
          accountHolder: "Lea Martin",
        },
      },
    });
  });
});
