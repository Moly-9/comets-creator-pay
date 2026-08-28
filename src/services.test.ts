import { describe, expect, it } from "vitest";
import { contracts, initialProfile, invoices, requests } from "./data";
import {
  ADMIN_DEMO_CREDENTIALS,
  CREATOR_DEMO_CREDENTIALS,
  MockAdminStore,
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
  buildTopbarNotifications,
  deriveContractStatus,
  filterInvoiceList,
  normalizeProjectMatchKey,
  shouldShowInvoicePreSigningControls,
  syncRequestWithInvoices,
  validateRegistration,
  validateSocialVerification,
} from "./App";
import {
  buildAirwallexMockSchema,
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
  reconcileAirwallexSchemaValues,
  sanitizeEnglishAccountName,
  summarizeAmountsByCurrency,
  sortInvoices,
  validateAirwallexSchemaValues,
  validateRequiredProfileFields,
} from "./services";

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
  it("renames contract fields without changing their internal status keys", () => {
    expect(contractStatusLabel).toEqual({
      未请款: "未付款",
      请款中: "付款中",
      已付款: "已付款",
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
  it("seeds contract counts for every creator managed in user management", () => {
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

    expect(aggregate.contracts).toHaveLength(18);
    expect(contractCounts).toEqual({
      "CREATOR-001": 8,
      "CREATOR-002": 3,
      "CREATOR-003": 3,
      "CREATOR-004": 2,
      "CREATOR-005": 2,
    });
    expect(
      aggregate.contracts.every((item) => creatorIds.has(item.creator.id)),
    ).toBe(true);
  });

  it("seeds contract-linked Invoices for every creator in user management", () => {
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

    expect(aggregate.invoices).toHaveLength(12);
    expect(invoiceCounts).toEqual({
      "CREATOR-001": 5,
      "CREATOR-002": 2,
      "CREATOR-003": 2,
      "CREATOR-004": 2,
      "CREATOR-005": 1,
    });
    expect(
      creators.every((creator) =>
        aggregate.invoices.some((item) => item.creator.id === creator.id),
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
      expect(invoice.record.amount).toBe(matchingContract?.record.amount);
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

    expect(contractOnlyRecords).toHaveLength(6);
    for (const contract of contractOnlyRecords) {
      expect(contract.record.status).toBe("未请款");
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
      payload: { projectName: "外部同步项目" },
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

  it("projects accepted external records into the creator detail view", () => {
    const store = new MockAdminStore(false);
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
  it("does not expose Léa Martin business data to another creator", async () => {
    const adapter = new MockApiAdapter();

    const [contractResult, invoiceResult, requestResult] = await Promise.all([
      adapter.contracts.list("CREATOR-002"),
      adapter.invoices.list("CREATOR-002"),
      adapter.requests.list("CREATOR-002"),
    ]);

    expect(contractResult.data).toEqual([]);
    expect(invoiceResult.data).toEqual([]);
    expect(requestResult.data).toEqual([]);
  });
});

describe("linked request projects", () => {
  it("matches the current account contracts and invoices by normalized project name", () => {
    const result = buildLinkedRequestProjects(requests, contracts, invoices);

    expect(result).toHaveLength(5);
    expect(result.every((item) => item.contract.projectName === item.invoice.projectName)).toBe(true);
    expect(new Set(result.map((item) => item.invoice.id)).size).toBe(result.length);
  });

  it("excludes contracts that have not created an Invoice", () => {
    const result = buildLinkedRequestProjects(requests, contracts, invoices);
    const unrequestedContracts = contracts.filter((contract) => contract.status === "未请款");

    expect(unrequestedContracts).toHaveLength(3);
    expect(unrequestedContracts.every((contract) =>
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
  it("keeps unrequested contracts outside the Invoice project set", () => {
    const invoiceProjects = new Set(invoices.map((invoice) => invoice.projectName));
    const contractProjects = new Set(contracts.map((contract) => contract.projectName));

    expect(contracts).toHaveLength(8);
    expect(invoices).toHaveLength(5);
    expect([...invoiceProjects].every((project) => contractProjects.has(project))).toBe(true);
    expect(contracts.filter((contract) => contract.status === "未请款")).toHaveLength(3);
    expect(contracts.filter((contract) => contract.status === "请款中")).toHaveLength(4);
    expect(contracts.filter((contract) => contract.status === "已付款")).toHaveLength(1);
    expect(new Set(contracts.map((contract) => contract.id)).size).toBe(8);
  });

  it("derives contract status from its one-to-one Invoice", () => {
    expect(deriveContractStatus("DRAFT_SIGNATURE")).toBe("请款中");
    expect(deriveContractStatus("PENDING_REVIEW")).toBe("请款中");
    expect(deriveContractStatus("APPROVED")).toBe("请款中");
    expect(deriveContractStatus("PAYMENT_FAILED")).toBe("请款中");
    expect(deriveContractStatus("PAID")).toBe("已付款");

    const linked = buildLinkedRequestProjects(requests, contracts, invoices);
    expect(linked.every((item) => item.contract.status === deriveContractStatus(item.invoice.status))).toBe(true);
  });

  it("keeps Invoice, request project, and contract ownership one-to-one", () => {
    expect(new Set(invoices.map((invoice) => invoice.projectId)).size).toBe(invoices.length);
    expect(new Set(invoices.map((invoice) => invoice.projectName)).size).toBe(invoices.length);
    expect(requests).toHaveLength(invoices.length);
    expect(contracts).toHaveLength(invoices.length + 3);

    const linkedInvoiceIds = requests.flatMap((request) => request.invoiceIds);
    expect(new Set(linkedInvoiceIds).size).toBe(invoices.length);

    for (const invoice of invoices) {
      const request = requests.find((item) => item.id === invoice.projectId);
      const contract = contracts.find((item) => item.projectId === invoice.projectId);

      expect(request).toMatchObject({
        projectName: invoice.projectName,
        brand: invoice.brand,
        invoiceIds: [invoice.id],
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
      if (contract.status === "未请款") {
        expect(matches).toHaveLength(0);
      } else {
        expect(matches).toHaveLength(1);
        expect(matches[0].projectId).toBe(contract.projectId);
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
    expect(compareInvoicePaymentDetails({ account_number: "wrong" }, account).matches).toBe(false);
  });

  it("uploads an invoice as pending confirmation with OCR data and history", async () => {
    const adapter = new MockApiAdapter();
    const contract = contracts.find((item) => item.status === "未请款")!;
    const account = initialProfile.payoutAccounts[0];
    const result = await adapter.invoices.upload({
      projectId: contract.projectId,
      projectName: contract.projectName,
      brand: contract.brand,
      amount: contract.amount,
      payoutAccountId: account.id,
      invoiceType: "EXTERNAL_CONTRACT",
      file: { id: "file-1", name: "invoice.pdf", mimeType: "application/pdf", size: 1024, previewUrl: "data:application/pdf;base64,AA==" },
      extractedData: {
        invoiceFrom: initialProfile.legalName,
        billTo: "COMETS INTERNATIONAL LIMITED",
        invoiceDate: "2026-08-21",
        currency: "EUR",
        total: "8500",
        paymentDetails: { account_name: account.accountHolder },
        invoiceFromMatchesProfile: true,
        billToMatchesComets: true,
      },
    });
    expect(result.data.id).toMatch(/^INV-20260821-\d{5}$/);
    expect(result.data.status).toBe("PENDING_CONFIRMATION");
    expect(result.data.processHistory?.[0]).toMatchObject({ label: "上传待确认", actor: "达人" });
  });

  it("builds actionable topbar notifications from current Invoice states", () => {
    const notifications = buildTopbarNotifications(invoices);

    expect(notifications.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "付款信息待修复",
        "Invoice 待签署",
        "Invoice 已提交审核",
        "款项已完成",
      ]),
    );
    expect(
      notifications.every((item) => item.to.startsWith("/invoices/")),
    ).toBe(true);
  });

  it("fuzzy-searches only invoice IDs and projects, then combines filters", () => {
    expect(filterInvoiceList(invoices, "260728", "ALL")).toHaveLength(1);
    expect(filterInvoiceList(invoices, "夏季家居", "ALL")[0]?.id).toBe(
      "INV-20260727-00001",
    );
    expect(filterInvoiceList(invoices, "七月联名", "PAYMENT_FAILED", "Airwallex")[0]?.id).toBe(
      "INV-20260728-00001",
    );
    expect(filterInvoiceList(invoices, "Mellow Home", "ALL")).toHaveLength(0);
    expect(filterInvoiceList(invoices, "2100", "ALL")).toHaveLength(0);
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

  it("blocks payment-correction review before payout information is repaired", async () => {
    const adapter = new MockApiAdapter();
    await expect(
      adapter.invoices.transition("INV-20260728-00001", "PENDING_REVIEW"),
    ).rejects.toThrow("请先修改错误的付款信息并完成校验");
  });

  it("requires the failed payout value to actually change", async () => {
    const adapter = new MockApiAdapter();
    await expect(
      adapter.invoices.resolvePaymentIssue(
        "INV-20260728-00001",
        "FR7630006000011234567890189",
      ),
    ).rejects.toThrow("请修改银行账号");
  });

  it("resolves a payout issue and restarts review from document review", async () => {
    const adapter = new MockApiAdapter();
    const repaired = await adapter.invoices.resolvePaymentIssue(
      "INV-20260728-00001",
      "FR7630006000011234567890197",
    );
    expect(repaired.data.paymentIssue?.resolvedAt).toBeTruthy();

    const result = await adapter.invoices.transition(
      "INV-20260728-00001",
      "PENDING_REVIEW",
    );
    expect(result.data.status).toBe("PENDING_REVIEW");
    expect(result.data.rejectedReason).toBeUndefined();
    expect(result.data.paymentIssue?.resolvedAt).toBeTruthy();
    expect(result.data.paymentIssue?.resubmittedAt).toBeTruthy();
  });

  it("does not allow a repaired payment failure to skip document review", async () => {
    const adapter = new MockApiAdapter();
    await adapter.invoices.resolvePaymentIssue(
      "INV-20260728-00001",
      "FR7630006000011234567890197",
    );

    await expect(
      adapter.invoices.transition("INV-20260728-00001", "APPROVED"),
    ).rejects.toThrow("付款信息修正后必须先提交资料审核");
  });

  it("persists a handwritten signature and advances the invoice to review", async () => {
    const adapter = new MockApiAdapter();
    const result = await adapter.invoices.sign("INV-20260727-00001", {
      method: "DRAWN",
      dataUrl: "data:image/png;base64,c2lnbmF0dXJl",
      signerName: "Léa Martin",
      signedAt: "2026-07-27T14:45:00.000Z",
    });

    expect(result.data.status).toBe("PENDING_REVIEW");
    expect(result.data.signature).toMatchObject({
      method: "DRAWN",
      signerName: "Léa Martin",
    });
  });

  it("persists a generated electronic signature and advances the invoice to review", async () => {
    const adapter = new MockApiAdapter();
    const result = await adapter.invoices.sign("INV-20260727-00001", {
      method: "GENERATED",
      dataUrl: "data:image/png;base64,ZWxlY3Ryb25pYy1zaWduYXR1cmU=",
      signerName: "Léa Martin",
      signedAt: "2026-07-28T10:30:00.000Z",
    });

    expect(result.data.status).toBe("PENDING_REVIEW");
    expect(result.data.signature).toMatchObject({
      method: "GENERATED",
      signerName: "Léa Martin",
    });
  });
});

describe("request and invoice consistency", () => {
  it("keeps the payment issue blocked while the linked invoice has failed", () => {
    const request = requests.find((item) => item.id === "REQ-260728-MH-JULY")!;
    expect(syncRequestWithInvoices(request, invoices).status).toBe("PAYMENT_FAILED");
  });

  it("returns the request to payment processing after payout information is repaired", () => {
    const request = requests.find((item) => item.id === "REQ-260728-MH-JULY")!;
    const resubmitted = invoices.map((invoice) =>
      invoice.id === "INV-20260728-00001"
        ? { ...invoice, status: "APPROVED" as const }
        : invoice,
    );
    const synced = syncRequestWithInvoices(request, resubmitted);
    expect(synced.status).toBe("APPROVED");
    expect(synced.issues).toHaveLength(0);
    expect(synced.progress[1].state).toBe("complete");
    expect(synced.progress[2].state).toBe("complete");
    expect(synced.progress[3].state).toBe("current");
  });
});

describe("registration validation", () => {
  const validValues = {
    email: "creator@example.com",
    password: "Creator2026",
    invitationCode: "",
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

  it("accepts a complete registration form", () => {
    expect(validateRegistration(validValues, true)).toBe("");
  });

  it("returns a recoverable error when the email is already registered", () => {
    const store = new MockAdminStore(false);
    expect(() =>
      store.register("Duplicate Creator", CREATOR_DEMO_CREDENTIALS.email, "Creator2026"),
    ).toThrow("该邮箱已注册");
  });

  it("keeps the store usable after a duplicate registration attempt", () => {
    const store = new MockAdminStore(false);
    expect(() =>
      store.register("Duplicate Creator", CREATOR_DEMO_CREDENTIALS.email, "Creator2026"),
    ).toThrow("该邮箱已注册");

    const session = store.register(
      "Retry Creator",
      "retry.creator@example.com",
      "Creator2026",
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
