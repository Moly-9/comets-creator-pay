import {
  contracts as seedContracts,
  initialProfile,
  invoices as seedInvoices,
  requests as seedRequests,
} from "./data";
import type {
  AccountStatus,
  AdminBusinessData,
  AdminNotification,
  AdminSettings,
  AdminUserDetail,
  AuditAction,
  AuditEvent,
  Contract,
  CorrectionRequest,
  ExternalBusinessEvent,
  ExternalSyncIssue,
  Invitation,
  InvitationStatus,
  Invoice,
  RequestProject,
  SensitiveFieldKey,
  Session,
  UserAccount,
  UserLoginRecord,
  UserPermission,
  UserProfile,
  UserRole,
  VerificationStatus,
} from "./types";

export const ADMIN_STORE_KEY = "comets-admin-store-v1";
export const PRIMARY_CREATOR_ID = "CREATOR-001";

export const ADMIN_DEMO_CREDENTIALS = {
  email: "admin@comets-pay.local",
  password: "Admin2026",
};

export const CREATOR_DEMO_CREDENTIALS = {
  email: "lea.martin@creator.example",
  password: "creator2026",
};

export const ROLE_PERMISSIONS: Record<UserRole, UserPermission[]> = {
  CREATOR: [
    "CREATOR_WORKSPACE_VIEW",
    "CREATOR_PROFILE_EDIT",
    "CREATOR_PAYOUT_EDIT",
    "INVOICE_SIGN",
  ],
  ADMIN: [
    "CREATOR_WORKSPACE_VIEW",
    "USER_VIEW_ALL",
    "USER_MANAGE",
    "USER_BASIC_PROFILE_EDIT",
    "USER_SOCIAL_PROFILE_EDIT",
    "USER_CORRECTION_CREATE",
    "SENSITIVE_DATA_REVEAL",
    "AUDIT_VIEW",
    "ADMIN_SETTINGS_MANAGE",
  ],
};

export interface AdminUserFilters {
  query?: string;
  role?: UserRole | "ALL";
  status?: AccountStatus | "ALL";
  verificationStatus?: VerificationStatus | "ALL";
  invitationStatus?: InvitationStatus | "ALL";
  correctionStatus?: "OPEN" | "CLEAR" | "ALL";
}

export interface CreateManagedUserInput {
  name: string;
  email: string;
  role: UserRole;
  mode: "CREATE" | "INVITE";
}

export interface AdminProfilePatch {
  displayName: string;
  legalName: string;
  email: string;
  phone: string;
  address: string;
  platform: string;
  handle: string;
  profileUrls: string[];
}

interface ExternalRecordState {
  creatorId: string;
  externalRecordId: string;
  resourceType: ExternalBusinessEvent["resourceType"];
  version: number;
  occurredAt: string;
  payload: Record<string, unknown>;
}

interface AdminStoreState {
  version: 2;
  users: UserAccount[];
  credentials: Record<string, string>;
  profiles: Record<string, UserProfile>;
  sessions: Session[];
  invitations: Invitation[];
  corrections: CorrectionRequest[];
  notifications: AdminNotification[];
  audits: AuditEvent[];
  loginHistory: UserLoginRecord[];
  settings: AdminSettings;
  syncIssues: ExternalSyncIssue[];
  processedEventIds: string[];
  externalRecords: ExternalRecordState[];
}

const clone = <T,>(value: T): T => structuredClone(value);

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

const today = () => formatDateTime(new Date());

const daysFromNow = (days: number) =>
  formatDateTime(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

const idSuffix = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const invoiceStatusLabel: Record<Invoice["status"], string> = {
  PENDING_CONFIRMATION: "待确认",
  DRAFT_SIGNATURE: "待确认",
  PENDING_REVIEW: "待审核",
  CHANGES_REQUIRED: "待修改",
  APPROVED: "待付款",
  PAYMENT_FAILED: "付款异常",
  PAID: "已付款",
};

const deriveExternalContractStatus = (
  status: Invoice["status"],
): Contract["status"] =>
  status === "PAID" ? "已付款" : "请款中";

const createCreatorProfile = ({
  id,
  name,
  email,
  platform,
  handle,
  verified,
  country = "France",
}: {
  id: string;
  name: string;
  email: string;
  platform: string;
  handle: string;
  verified: boolean;
  country?: string;
}): UserProfile => {
  const normalizedHandle = handle.replace(/^@/, "");
  const payout = {
    ...clone(initialProfile.payout),
    id: `payout-${id.toLowerCase()}-primary`,
    name: `${country} 主账户`,
    accountHolder: name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    bankCountry: country,
    bankName: "",
    accountNumber: "",
    swiftCode: "",
    status: "DRAFT" as const,
    beneficiaryId: undefined,
    linkages: {
      projectCount: 0,
      invoiceCount: 0,
      paymentBatchCount: 0,
      transactionCount: 0,
    },
    hasActivePayment: false,
    schemaValues: {},
  };
  return {
    ...clone(initialProfile),
    id,
    displayName: name,
    legalName: name,
    email,
    phone: "",
    country,
    address: "",
    social: {
      ...clone(initialProfile.social),
      platform,
      handle: `@${normalizedHandle}`,
      profileUrl: `https://${platform.toLowerCase()}.com/@${normalizedHandle}`,
      profileUrls: [`https://${platform.toLowerCase()}.com/@${normalizedHandle}`],
      verificationStatus: verified ? "VERIFIED" : "PENDING",
      screenshot: undefined,
      screenshots: [],
    },
    payout,
    payoutAccounts: [payout],
    defaultPayoutAccountId: payout.id,
  };
};

const seedUsers: UserAccount[] = [
  {
    id: "ADMIN-001",
    name: "Moly",
    email: ADMIN_DEMO_CREDENTIALS.email,
    role: "ADMIN",
    status: "ACTIVE",
    invitationStatus: "ACCEPTED",
    verificationStatus: "VERIFIED",
    onboardingComplete: true,
    createdAt: "2026-06-18 09:20",
    lastLoginAt: "2026-08-01 18:12",
    lastActiveAt: "刚刚",
  },
  {
    id: PRIMARY_CREATOR_ID,
    name: "Léa Martin",
    email: CREATOR_DEMO_CREDENTIALS.email,
    role: "CREATOR",
    status: "ACTIVE",
    invitationStatus: "NOT_REQUIRED",
    verificationStatus: "VERIFIED",
    onboardingComplete: true,
    createdAt: "2026-07-08 14:22",
    lastLoginAt: "2026-08-01 17:48",
    lastActiveAt: "12 分钟前",
  },
  {
    id: "CREATOR-002",
    name: "Camille Dubois",
    email: "camille.dubois@creator.example",
    role: "CREATOR",
    status: "ACTIVE",
    invitationStatus: "ACCEPTED",
    verificationStatus: "PENDING",
    onboardingComplete: true,
    createdAt: "2026-07-28 11:06",
    lastLoginAt: "2026-08-01 11:42",
    lastActiveAt: "今天 11:42",
  },
  {
    id: "CREATOR-003",
    name: "Noah Williams",
    email: "noah.williams@creator.example",
    role: "CREATOR",
    status: "ACTIVE",
    invitationStatus: "ACCEPTED",
    verificationStatus: "CHANGES_REQUESTED",
    onboardingComplete: true,
    createdAt: "2026-07-24 09:18",
    lastLoginAt: "2026-07-31 16:25",
    lastActiveAt: "昨天 16:25",
  },
  {
    id: "CREATOR-004",
    name: "Maya Sato",
    email: "maya.sato@creator.example",
    role: "CREATOR",
    status: "DISABLED",
    invitationStatus: "ACCEPTED",
    verificationStatus: "VERIFIED",
    onboardingComplete: true,
    createdAt: "2026-06-30 13:52",
    lastLoginAt: "2026-07-22 08:15",
    lastActiveAt: "07-22 08:15",
  },
  {
    id: "CREATOR-005",
    name: "Alex Ruiz",
    email: "alex.ruiz@creator.example",
    role: "CREATOR",
    status: "ACTIVE",
    invitationStatus: "PENDING",
    verificationStatus: "PENDING",
    onboardingComplete: false,
    createdAt: "2026-08-01 15:40",
    lastLoginAt: "-",
    lastActiveAt: "尚未登录",
  },
];

const seedProfiles: Record<string, UserProfile> = {
  [PRIMARY_CREATOR_ID]: clone(initialProfile),
  "CREATOR-002": createCreatorProfile({
    id: "CREATOR-002",
    name: "Camille Dubois",
    email: "camille.dubois@creator.example",
    platform: "TikTok",
    handle: "camilledaily",
    verified: false,
  }),
  "CREATOR-003": createCreatorProfile({
    id: "CREATOR-003",
    name: "Noah Williams",
    email: "noah.williams@creator.example",
    platform: "YouTube",
    handle: "NoahCreates",
    verified: false,
    country: "United Kingdom",
  }),
  "CREATOR-004": createCreatorProfile({
    id: "CREATOR-004",
    name: "Maya Sato",
    email: "maya.sato@creator.example",
    platform: "Instagram",
    handle: "mayasato.jp",
    verified: true,
    country: "Japan",
  }),
  "CREATOR-005": createCreatorProfile({
    id: "CREATOR-005",
    name: "Alex Ruiz",
    email: "alex.ruiz@creator.example",
    platform: "Twitch",
    handle: "alexruizlive",
    verified: false,
    country: "Spain",
  }),
};

const createSeedExternalContract = ({
  creatorId,
  id,
  orderId,
  projectId,
  projectName,
  brand,
  amount,
  effectiveDate,
  servicePeriod,
  updatedAt,
}: {
  creatorId: string;
  id: string;
  orderId: string;
  projectId: string;
  projectName: string;
  brand: string;
  amount: string;
  effectiveDate: string;
  servicePeriod: string;
  updatedAt: string;
}): ExternalRecordState => ({
  creatorId,
  externalRecordId: id,
  resourceType: "CONTRACT",
  version: 1,
  occurredAt: `${updatedAt} 10:00`,
  payload: {
    orderId,
    projectId,
    projectName,
    campaignName: projectName,
    brand,
    amount,
    effectiveDate,
    servicePeriod,
    status: "未请款",
    updatedAt,
  },
});

const seedExternalContractRecords: ExternalRecordState[] = [
  createSeedExternalContract({
    creatorId: "CREATOR-002",
    id: "CON-260703-CD-01",
    orderId: "IO-260703-LP-SKIN",
    projectId: "PRJ-260703-LP-SKIN",
    projectName: "Lumière 夏季护肤合作",
    brand: "Lumière Paris",
    amount: "EUR 3,600",
    effectiveDate: "2026-07-03",
    servicePeriod: "2026-07-03 至 2026-08-15",
    updatedAt: "2026-07-03",
  }),
  createSeedExternalContract({
    creatorId: "CREATOR-002",
    id: "CON-260712-CD-02",
    orderId: "IO-260712-ME-HOME",
    projectId: "PRJ-260712-ME-HOME",
    projectName: "Maison Élan 居家短视频",
    brand: "Maison Élan",
    amount: "EUR 2,400",
    effectiveDate: "2026-07-12",
    servicePeriod: "2026-07-12 至 2026-08-20",
    updatedAt: "2026-07-12",
  }),
  createSeedExternalContract({
    creatorId: "CREATOR-002",
    id: "CON-260726-CD-03",
    orderId: "IO-260726-VC-RIDE",
    projectId: "PRJ-260726-VC-RIDE",
    projectName: "Veloce 城市出行体验",
    brand: "Veloce",
    amount: "EUR 1,800",
    effectiveDate: "2026-07-26",
    servicePeriod: "2026-07-26 至 2026-08-31",
    updatedAt: "2026-07-26",
  }),
  createSeedExternalContract({
    creatorId: "CREATOR-003",
    id: "CON-260629-NW-01",
    orderId: "IO-260629-NP-OUTDOOR",
    projectId: "PRJ-260629-NP-OUTDOOR",
    projectName: "Northpeak 户外装备测评",
    brand: "Northpeak",
    amount: "GBP 3,200",
    effectiveDate: "2026-06-29",
    servicePeriod: "2026-06-29 至 2026-08-05",
    updatedAt: "2026-06-29",
  }),
  createSeedExternalContract({
    creatorId: "CREATOR-003",
    id: "CON-260710-NW-02",
    orderId: "IO-260710-AS-GAMING",
    projectId: "PRJ-260710-AS-GAMING",
    projectName: "Arcadia Studio 游戏直播",
    brand: "Arcadia Studio",
    amount: "GBP 2,750",
    effectiveDate: "2026-07-10",
    servicePeriod: "2026-07-10 至 2026-08-18",
    updatedAt: "2026-07-10",
  }),
  createSeedExternalContract({
    creatorId: "CREATOR-003",
    id: "CON-260721-NW-03",
    orderId: "IO-260721-SW-AUDIO",
    projectId: "PRJ-260721-SW-AUDIO",
    projectName: "SoundWave 无线耳机开箱",
    brand: "SoundWave",
    amount: "GBP 1,950",
    effectiveDate: "2026-07-21",
    servicePeriod: "2026-07-21 至 2026-08-28",
    updatedAt: "2026-07-21",
  }),
  createSeedExternalContract({
    creatorId: "CREATOR-004",
    id: "CON-260705-MS-01",
    orderId: "IO-260705-HB-MAKEUP",
    projectId: "PRJ-260705-HB-MAKEUP",
    projectName: "Hikari Beauty 秋季彩妆",
    brand: "Hikari Beauty",
    amount: "JPY 620,000",
    effectiveDate: "2026-07-05",
    servicePeriod: "2026-07-05 至 2026-08-25",
    updatedAt: "2026-07-05",
  }),
  createSeedExternalContract({
    creatorId: "CREATOR-004",
    id: "CON-260719-MS-02",
    orderId: "IO-260719-KT-KYOTO",
    projectId: "PRJ-260719-KT-KYOTO",
    projectName: "Kumo Travel 京都旅拍",
    brand: "Kumo Travel",
    amount: "JPY 480,000",
    effectiveDate: "2026-07-19",
    servicePeriod: "2026-07-19 至 2026-09-05",
    updatedAt: "2026-07-19",
  }),
  createSeedExternalContract({
    creatorId: "CREATOR-005",
    id: "CON-260714-AR-01",
    orderId: "IO-260714-SE-STREAM",
    projectId: "PRJ-260714-SE-STREAM",
    projectName: "Solaris 电竞直播合作",
    brand: "Solaris Esports",
    amount: "EUR 3,100",
    effectiveDate: "2026-07-14",
    servicePeriod: "2026-07-14 至 2026-08-30",
    updatedAt: "2026-07-14",
  }),
  createSeedExternalContract({
    creatorId: "CREATOR-005",
    id: "CON-260728-AR-02",
    orderId: "IO-260728-CV-SMART",
    projectId: "PRJ-260728-CV-SMART",
    projectName: "Casa Verde 智能家居体验",
    brand: "Casa Verde",
    amount: "EUR 2,250",
    effectiveDate: "2026-07-28",
    servicePeriod: "2026-07-28 至 2026-09-10",
    updatedAt: "2026-07-28",
  }),
];

const createSeedExternalInvoice = ({
  creatorId,
  id,
  projectId,
  projectName,
  brand,
  amount,
  status,
  issuedAt,
  updatedAt,
  paymentReference,
  paymentIssue,
}: {
  creatorId: string;
  id: string;
  projectId: string;
  projectName: string;
  brand: string;
  amount: string;
  status: Invoice["status"];
  issuedAt: string;
  updatedAt: string;
  paymentReference?: string;
  paymentIssue?: Invoice["paymentIssue"];
}): ExternalRecordState => ({
  creatorId,
  externalRecordId: id,
  resourceType: "INVOICE",
  version: 1,
  occurredAt: updatedAt,
  payload: {
    projectId,
    projectName,
    brand,
    amount,
    status,
    issuedAt,
    updatedAt,
    ...(paymentReference ? { paymentReference } : {}),
    ...(paymentIssue ? { paymentIssue } : {}),
  },
});

const seedExternalInvoiceRecords: ExternalRecordState[] = [
  createSeedExternalInvoice({
    creatorId: "CREATOR-002",
    id: "INV-20260730-00001",
    projectId: "PRJ-260703-LP-SKIN",
    projectName: "Lumière 夏季护肤合作",
    brand: "Lumière Paris",
    amount: "EUR 3,600",
    status: "PENDING_REVIEW",
    issuedAt: "2026-07-30",
    updatedAt: "2026-08-01 09:20",
  }),
  createSeedExternalInvoice({
    creatorId: "CREATOR-002",
    id: "INV-20260801-00001",
    projectId: "PRJ-260712-ME-HOME",
    projectName: "Maison Élan 居家短视频",
    brand: "Maison Élan",
    amount: "EUR 2,400",
    status: "DRAFT_SIGNATURE",
    issuedAt: "2026-08-01",
    updatedAt: "2026-08-01 16:05",
  }),
  createSeedExternalInvoice({
    creatorId: "CREATOR-003",
    id: "INV-20260724-00001",
    projectId: "PRJ-260629-NP-OUTDOOR",
    projectName: "Northpeak 户外装备测评",
    brand: "Northpeak",
    amount: "GBP 3,200",
    status: "APPROVED",
    issuedAt: "2026-07-24",
    updatedAt: "2026-08-01 08:45",
  }),
  createSeedExternalInvoice({
    creatorId: "CREATOR-003",
    id: "INV-20260731-00001",
    projectId: "PRJ-260710-AS-GAMING",
    projectName: "Arcadia Studio 游戏直播",
    brand: "Arcadia Studio",
    amount: "GBP 2,750",
    status: "PAID",
    issuedAt: "2026-07-26",
    updatedAt: "2026-08-01 13:10",
    paymentReference: "AWX-PAY-926413",
  }),
  createSeedExternalInvoice({
    creatorId: "CREATOR-004",
    id: "INV-20260726-00001",
    projectId: "PRJ-260705-HB-MAKEUP",
    projectName: "Hikari Beauty 秋季彩妆",
    brand: "Hikari Beauty",
    amount: "JPY 620,000",
    status: "PAID",
    issuedAt: "2026-07-26",
    updatedAt: "2026-07-31 14:25",
    paymentReference: "AWX-PAY-774205",
  }),
  createSeedExternalInvoice({
    creatorId: "CREATOR-004",
    id: "INV-20260801-00002",
    projectId: "PRJ-260719-KT-KYOTO",
    projectName: "Kumo Travel 京都旅拍",
    brand: "Kumo Travel",
    amount: "JPY 480,000",
    status: "PAYMENT_FAILED",
    issuedAt: "2026-07-31",
    updatedAt: "2026-08-01 17:20",
    paymentIssue: {
      version: 1,
      code: "INVALID_ACCOUNT_NUMBER",
      fieldKey: "account_number",
      fieldLabel: "银行账号 / Bank Account Number",
      maskedValue: "**** 1842",
      invalidValue: "1842",
      message: "收款账号未通过 Airwallex 校验，请由创作者更新并提交资料审核。",
    },
  }),
  createSeedExternalInvoice({
    creatorId: "CREATOR-005",
    id: "INV-20260801-00003",
    projectId: "PRJ-260714-SE-STREAM",
    projectName: "Solaris 电竞直播合作",
    brand: "Solaris Esports",
    amount: "EUR 3,100",
    status: "DRAFT_SIGNATURE",
    issuedAt: "2026-08-01",
    updatedAt: "2026-08-01 18:05",
  }),
];

const seedExternalBusinessRecords = [
  ...seedExternalContractRecords,
  ...seedExternalInvoiceRecords,
];

const mergeSeedExternalRecords = (
  storedRecords?: ExternalRecordState[],
): ExternalRecordState[] => {
  const records = new Map<string, ExternalRecordState>();
  const keyFor = (record: ExternalRecordState) =>
    `${record.creatorId}:${record.resourceType}:${record.externalRecordId}`;

  seedExternalBusinessRecords.forEach((record) => {
    records.set(keyFor(record), clone(record));
  });
  if (Array.isArray(storedRecords)) {
    storedRecords.forEach((record) => {
      records.set(keyFor(record), clone(record));
    });
  }
  return [...records.values()];
};

const defaultSettings: AdminSettings = {
  registrationEnabled: true,
  invitationValidDays: 7,
  passwordMinLength: 8,
  passwordMaxLength: 20,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  serviceAgreementUrl: "https://comets.example/terms",
  privacyPolicyUrl: "https://comets.example/privacy",
  dataProcessingUrl: "https://comets.example/data-processing",
  correctionReasonTemplates: [
    "资料与认证截图不一致",
    "主页链接无法访问或无法确认归属",
    "收款账户字段不完整",
    "收款账户未通过 Airwallex Schema 校验",
  ],
};

const createSeedState = (): AdminStoreState => ({
  version: 2,
  users: clone(seedUsers),
  credentials: {
    "ADMIN-001": ADMIN_DEMO_CREDENTIALS.password,
    [PRIMARY_CREATOR_ID]: CREATOR_DEMO_CREDENTIALS.password,
    "CREATOR-002": "Creator2026",
    "CREATOR-003": "Creator2026",
    "CREATOR-004": "Creator2026",
    "CREATOR-005": "Invite2026",
  },
  profiles: clone(seedProfiles),
  sessions: [],
  invitations: [
    {
      id: "INVITE-001",
      userId: "CREATOR-005",
      email: "alex.ruiz@creator.example",
      role: "CREATOR",
      status: "PENDING",
      createdBy: "ADMIN-001",
      createdAt: "2026-08-01 15:40",
      expiresAt: "2026-08-08 15:40",
    },
  ],
  corrections: [
    {
      id: "CORR-001",
      userId: "CREATOR-003",
      fieldKey: "social.profileUrls",
      fieldLabel: "主页链接",
      reason: "当前主页链接无法确认账号归属，请补充可公开访问的主页链接。",
      status: "OPEN",
      createdBy: "ADMIN-001",
      createdAt: "2026-07-31 10:18",
    },
  ],
  notifications: [
    {
      id: "NTF-001",
      userId: "CREATOR-003",
      type: "CORRECTION",
      title: "认证资料需要修改",
      message: "主页链接无法确认账号归属，请补充后重新保存。",
      createdAt: "2026-07-31 10:18",
      read: false,
      emailStatus: "DELIVERED",
    },
    {
      id: "NTF-002",
      userId: "CREATOR-005",
      type: "INVITATION",
      title: "COMETS Pay 账号邀请",
      message: "邀请已发送，7 天内完成账号激活。",
      createdAt: "2026-08-01 15:40",
      read: false,
      emailStatus: "DELIVERED",
    },
  ],
  audits: [
    {
      id: "AUD-001",
      actorId: "ADMIN-001",
      actorName: "Moly",
      subjectUserId: "CREATOR-003",
      subjectName: "Noah Williams",
      action: "CORRECTION_CREATED",
      module: "PROFILE",
      summary: "退回主页链接，等待创作者修正",
      reason: "无法确认账号归属",
      occurredAt: "2026-07-31 10:18",
    },
    {
      id: "AUD-002",
      actorId: "ADMIN-001",
      actorName: "Moly",
      subjectUserId: "CREATOR-004",
      subjectName: "Maya Sato",
      action: "USER_STATUS_CHANGED",
      module: "USER",
      summary: "账号状态由已启用变更为已停用",
      reason: "合作关系暂停",
      occurredAt: "2026-07-30 16:42",
    },
    {
      id: "AUD-003",
      actorId: "ADMIN-001",
      actorName: "Moly",
      action: "SETTINGS_UPDATED",
      module: "SETTINGS",
      summary: "更新邀请有效期为 7 天",
      occurredAt: "2026-07-29 09:25",
    },
  ],
  loginHistory: [
    {
      id: "LOGIN-001",
      userId: "ADMIN-001",
      occurredAt: "2026-08-01 18:12",
      device: "Chrome · macOS",
      location: "上海",
      result: "SUCCESS",
    },
    {
      id: "LOGIN-002",
      userId: PRIMARY_CREATOR_ID,
      occurredAt: "2026-08-01 17:48",
      device: "Safari · iPhone",
      location: "巴黎",
      result: "SUCCESS",
    },
  ],
  settings: clone(defaultSettings),
  syncIssues: [
    {
      id: "SYNC-ISSUE-001",
      eventId: "evt_invoice_unmatched_001",
      creatorId: "CREATOR-UNKNOWN-77",
      resourceType: "INVOICE",
      message: "外部 Invoice 携带的 Creator ID 在本系统中不存在。",
      occurredAt: "2026-08-01 14:12",
    },
  ],
  processedEventIds: [],
  externalRecords: clone(seedExternalBusinessRecords),
});

export class MockAdminStore {
  private state: AdminStoreState;
  private readonly persistEnabled: boolean;

  constructor(persistEnabled = true) {
    this.persistEnabled = persistEnabled;
    this.state = this.read();
    this.save();
  }

  private read(): AdminStoreState {
    if (!this.persistEnabled || typeof window === "undefined") {
      return createSeedState();
    }
    try {
      const stored = window.localStorage.getItem(ADMIN_STORE_KEY);
      if (!stored) return createSeedState();
      const parsed = JSON.parse(stored) as Omit<
        Partial<AdminStoreState>,
        "version"
      > & {
        version?: number;
      };
      if (parsed.version === 2) {
        return {
          ...createSeedState(),
          ...parsed,
          version: 2,
          sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
          invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
          externalRecords: mergeSeedExternalRecords(parsed.externalRecords),
        };
      }
      if (parsed.version === 1) {
        const users = Array.isArray(parsed.users) ? parsed.users : clone(seedUsers);
        return {
          ...createSeedState(),
          ...parsed,
          version: 2,
          users,
          sessions: [],
          externalRecords: mergeSeedExternalRecords(parsed.externalRecords),
          invitations: users
            .filter((user) => user.invitationStatus === "PENDING")
            .map((user) => ({
              id: `INVITE-MIGRATED-${user.id}`,
              userId: user.id,
              email: user.email,
              role: user.role,
              status: "PENDING" as const,
              createdBy: "SYSTEM",
              createdAt: user.createdAt,
              expiresAt: "待管理员重新发送",
            })),
        };
      }
      return createSeedState();
    } catch {
      return createSeedState();
    }
  }

  private save() {
    if (this.persistEnabled && typeof window !== "undefined") {
      window.localStorage.setItem(ADMIN_STORE_KEY, JSON.stringify(this.state));
    }
  }

  private actorName(actorId: string) {
    return this.state.users.find((user) => user.id === actorId)?.name || "系统";
  }

  private userName(userId?: string) {
    return this.state.users.find((user) => user.id === userId)?.name;
  }

  private notify(
    userId: string,
    type: AdminNotification["type"],
    title: string,
    message: string,
    emailStatus: AdminNotification["emailStatus"] = "DELIVERED",
  ) {
    this.state.notifications.unshift({
      id: `NTF-${idSuffix()}`,
      userId,
      type,
      title,
      message,
      createdAt: today(),
      read: false,
      emailStatus,
    });
  }

  private requirePermission(actorId: string, permission: UserPermission) {
    const actor = this.requireUser(actorId);
    if (
      actor.status !== "ACTIVE" ||
      actor.invitationStatus === "PENDING" ||
      actor.invitationStatus === "EXPIRED" ||
      !ROLE_PERMISSIONS[actor.role].includes(permission)
    ) {
      throw new Error("当前账号没有执行此操作的权限");
    }
    return actor;
  }

  private audit(
    actorId: string,
    action: AuditAction,
    module: AuditEvent["module"],
    summary: string,
    options: {
      subjectUserId?: string;
      reason?: string;
      before?: Record<string, string>;
      after?: Record<string, string>;
    } = {},
  ) {
    this.state.audits.unshift({
      id: `AUD-${idSuffix()}`,
      actorId,
      actorName: this.actorName(actorId),
      subjectUserId: options.subjectUserId,
      subjectName: this.userName(options.subjectUserId),
      action,
      module,
      summary,
      reason: options.reason,
      before: options.before,
      after: options.after,
      occurredAt: today(),
    });
  }

  private sessionFor(account: UserAccount, sessionId = `session_${idSuffix()}`): Session {
    return {
      userId: account.id,
      email: account.email,
      onboardingComplete: account.onboardingComplete,
      role: account.role,
      permissions: clone(ROLE_PERMISSIONS[account.role]),
      sessionId,
      verificationStatus: account.verificationStatus,
      createdAt: today(),
    };
  }

  private createSession(account: UserAccount) {
    const session = this.sessionFor(account);
    this.state.sessions.push(session);
    return clone(session);
  }

  private refreshSessions(account: UserAccount) {
    this.state.sessions
      .filter((session) => session.userId === account.id)
      .forEach((session) => {
        const createdAt = session.createdAt;
        Object.assign(session, this.sessionFor(account, session.sessionId));
        session.createdAt = createdAt;
      });
  }

  restoreSession(sessionId: string) {
    if (this.persistEnabled && typeof window !== "undefined") {
      this.state = this.read();
    }
    const stored = this.state.sessions.find(
      (session) => session.sessionId === sessionId,
    );
    if (!stored) return undefined;
    const account = this.state.users.find((user) => user.id === stored.userId);
    if (!account || account.status !== "ACTIVE") {
      this.state.sessions = this.state.sessions.filter(
        (session) => session.sessionId !== sessionId,
      );
      this.save();
      return undefined;
    }
    const before = JSON.stringify(stored);
    const refreshed = this.sessionFor(account, stored.sessionId);
    refreshed.createdAt = stored.createdAt;
    Object.assign(stored, refreshed);
    if (JSON.stringify(stored) !== before) this.save();
    return clone(refreshed);
  }

  migrateLegacyCreatorSession(userId: string, email: string) {
    if (userId !== PRIMARY_CREATOR_ID) return undefined;
    const account = this.state.users.find(
      (user) =>
        user.id === userId &&
        user.role === "CREATOR" &&
        user.email.toLowerCase() === email.trim().toLowerCase() &&
        user.status === "ACTIVE",
    );
    if (!account) return undefined;
    const session = this.createSession(account);
    this.save();
    return session;
  }

  logout(sessionId: string) {
    this.state.sessions = this.state.sessions.filter(
      (session) => session.sessionId !== sessionId,
    );
    this.save();
  }

  login(email: string, password: string): Session {
    const normalized = email.trim().toLowerCase();
    const account = this.state.users.find(
      (user) => user.email.toLowerCase() === normalized,
    );
    if (!account || this.state.credentials[account.id] !== password) {
      throw new Error("邮箱或密码不正确");
    }
    if (account.status === "DISABLED") {
      throw new Error("该账号已停用，请联系系统管理员");
    }
    if (
      account.invitationStatus === "PENDING" ||
      account.invitationStatus === "EXPIRED"
    ) {
      throw new Error("该邀请尚未完成激活，请先通过邀请邮件设置账号");
    }
    account.lastLoginAt = today();
    account.lastActiveAt = "刚刚";
    this.state.loginHistory.unshift({
      id: `LOGIN-${idSuffix()}`,
      userId: account.id,
      occurredAt: account.lastLoginAt,
      device: "Chrome · macOS",
      location: "当前设备",
      result: "SUCCESS",
    });
    this.audit(account.id, "LOGIN", "AUTH", "登录 COMETS Pay");
    const session = this.createSession(account);
    this.save();
    return session;
  }

  register(name: string, email: string, password: string): Session {
    if (!this.state.settings.registrationEnabled) {
      throw new Error("当前暂未开放自主注册");
    }
    if (
      this.state.users.some(
        (user) => user.email.toLowerCase() === email.trim().toLowerCase(),
      )
    ) {
      throw new Error("该邮箱已注册");
    }
    const creatorCount = this.state.users.filter(
      (user) => user.role === "CREATOR",
    ).length;
    const id = `CREATOR-${String(creatorCount + 1).padStart(3, "0")}`;
    const account: UserAccount = {
      id,
      name,
      email: email.trim(),
      role: "CREATOR",
      status: "ACTIVE",
      invitationStatus: "NOT_REQUIRED",
      verificationStatus: "PENDING",
      onboardingComplete: false,
      createdAt: today(),
      lastLoginAt: today(),
      lastActiveAt: "刚刚",
    };
    this.state.users.push(account);
    this.state.credentials[id] = password;
    this.state.profiles[id] = createCreatorProfile({
      id,
      name,
      email: account.email,
      platform: "YouTube",
      handle: name.replace(/\s+/g, ""),
      verified: false,
    });
    this.audit(id, "USER_CREATED", "USER", "通过公开注册创建创作者账号", {
      subjectUserId: id,
    });
    const session = this.createSession(account);
    this.save();
    return session;
  }

  completeOnboarding(userId: string, profile: UserProfile, sessionId: string) {
    const account = this.requireUser(userId);
    account.onboardingComplete = true;
    account.name = profile.displayName;
    account.email = profile.email;
    account.verificationStatus = profile.social.verificationStatus;
    this.state.profiles[userId] = clone(profile);
    this.refreshSessions(account);
    this.save();
    return this.restoreSession(sessionId);
  }

  getSession(userId: string) {
    const account = this.requireUser(userId);
    const existing = this.state.sessions.find(
      (session) => session.userId === userId,
    );
    if (existing) return this.restoreSession(existing.sessionId);
    const session = this.createSession(account);
    this.save();
    return session;
  }

  syncProfile(profile: UserProfile, resolveCorrections = true) {
    this.state.profiles[profile.id] = clone(profile);
    const account = this.state.users.find((item) => item.id === profile.id);
    if (account) {
      account.name = profile.displayName;
      account.email = profile.email;
      account.verificationStatus = profile.social.verificationStatus;
      account.onboardingComplete = true;
    }
    if (resolveCorrections) {
      const resolved = this.state.corrections.filter(
        (item) => item.userId === profile.id && item.status === "OPEN",
      );
      resolved.forEach((item) => {
        item.status = "RESOLVED";
        item.resolvedAt = today();
        item.resolution = "用户提交的数据通过当前字段校验，系统自动关闭";
        this.audit(
          profile.id,
          "CORRECTION_AUTO_RESOLVED",
          "PROFILE",
          `字段“${item.fieldLabel}”已通过校验并自动关闭`,
          { subjectUserId: profile.id },
        );
      });
      if (
        account &&
        resolved.some((item) => item.fieldKey.startsWith("social.")) &&
        !this.state.corrections.some(
          (item) =>
            item.userId === profile.id &&
            item.status === "OPEN" &&
            item.fieldKey.startsWith("social."),
        )
      ) {
        account.verificationStatus = "VERIFIED";
        this.state.profiles[profile.id].social.verificationStatus = "VERIFIED";
      }
    }
    if (account) {
      this.refreshSessions(account);
    }
    this.save();
  }

  getProfile(userId: string) {
    const profile = this.state.profiles[userId];
    return profile ? clone(profile) : undefined;
  }

  listUsers(filters: AdminUserFilters = {}) {
    const query = (filters.query || "").trim().toLowerCase();
    return clone(
      this.state.users
        .filter((user) => {
        const hasOpenCorrection = this.state.corrections.some(
          (item) => item.userId === user.id && item.status === "OPEN",
        );
        return (
          (!query ||
            [user.name, user.email, user.id]
              .join(" ")
              .toLowerCase()
              .includes(query)) &&
          (!filters.role || filters.role === "ALL" || user.role === filters.role) &&
          (!filters.status ||
            filters.status === "ALL" ||
            user.status === filters.status) &&
          (!filters.verificationStatus ||
            filters.verificationStatus === "ALL" ||
            user.verificationStatus === filters.verificationStatus) &&
          (!filters.invitationStatus ||
            filters.invitationStatus === "ALL" ||
            user.invitationStatus === filters.invitationStatus) &&
          (!filters.correctionStatus ||
            filters.correctionStatus === "ALL" ||
            (filters.correctionStatus === "OPEN"
              ? hasOpenCorrection
              : !hasOpenCorrection))
        );
      })
        .map((user) => ({
          ...user,
          hasOpenCorrection: this.state.corrections.some(
            (item) => item.userId === user.id && item.status === "OPEN",
          ),
        })),
    );
  }

  getUserDetail(userId: string): AdminUserDetail {
    const account = this.requireUser(userId);
    const isPrimaryCreator = userId === PRIMARY_CREATOR_ID;
    const records = this.state.externalRecords.filter(
      (record) => record.creatorId === userId,
    );
    const contractMap = new Map(
      (isPrimaryCreator ? clone(seedContracts) : []).map((contract) => [
        contract.id,
        contract,
      ]),
    );
    const invoiceMap = new Map(
      (isPrimaryCreator ? clone(seedInvoices) : []).map((invoice) => [
        invoice.id,
        invoice,
      ]),
    );
    records
      .filter((record) => record.resourceType === "CONTRACT")
      .forEach((record) => {
        const payload = record.payload;
        if (!payload.projectName || !payload.brand || !payload.amount) return;
        const fallback = clone(seedContracts[0]);
        contractMap.set(record.externalRecordId, {
          ...fallback,
          ...(payload as Partial<Contract>),
          id: record.externalRecordId,
          projectId: String(payload.projectId || record.externalRecordId),
          projectName: String(payload.projectName),
          campaignName: String(payload.campaignName || payload.projectName),
          brand: String(payload.brand),
          creatorName: account.name,
          amount: String(payload.amount),
          updatedAt: String(payload.updatedAt || record.occurredAt),
        });
      });
    records
      .filter((record) => record.resourceType === "INVOICE")
      .forEach((record) => {
        const payload = record.payload;
        if (!payload.projectName || !payload.brand || !payload.amount) return;
        const fallback = clone(seedInvoices[0]);
        invoiceMap.set(record.externalRecordId, {
          ...fallback,
          ...(payload as Partial<Invoice>),
          id: record.externalRecordId,
          projectId: String(payload.projectId || record.externalRecordId),
          projectName: String(payload.projectName),
          brand: String(payload.brand),
          amount: String(payload.amount),
          channel: "Airwallex",
          updatedAt: String(payload.updatedAt || record.occurredAt),
        });
      });
    records
      .filter((record) => record.resourceType === "PAYMENT_STATUS")
      .forEach((record) => {
        const invoiceId = String(
          record.payload.invoiceId || record.externalRecordId,
        );
        const status = record.payload.status as Invoice["status"] | undefined;
        const invoice = invoiceMap.get(invoiceId);
        if (
          invoice &&
          status &&
          Object.prototype.hasOwnProperty.call(invoiceStatusLabel, status)
        ) {
          invoice.status = status;
          invoice.updatedAt = String(
            record.payload.updatedAt || record.occurredAt,
          );
        }
      });
    const invoices = [...invoiceMap.values()];
    const contracts = [...contractMap.values()].map((contract) => {
      const invoice = invoices.find(
        (item) =>
          item.projectId === contract.projectId ||
          item.projectName.normalize("NFKC").trim() ===
            contract.projectName.normalize("NFKC").trim(),
      );
      return invoice
        ? { ...contract, status: deriveExternalContractStatus(invoice.status) }
        : contract;
    });
    const requestMap = new Map(
      (isPrimaryCreator ? clone(seedRequests) : []).map((request) => [
        request.id,
        request,
      ]),
    );
    invoices.forEach((invoice) => {
      const contract = contracts.find(
        (item) =>
          item.projectId === invoice.projectId ||
          item.projectName.normalize("NFKC").trim() ===
            invoice.projectName.normalize("NFKC").trim(),
      );
      if (!contract) return;
      const existing = [...requestMap.values()].find(
        (request) =>
          request.invoiceIds.includes(invoice.id) ||
          request.projectName.normalize("NFKC").trim() ===
            invoice.projectName.normalize("NFKC").trim(),
      );
      const request: RequestProject = {
        id: existing?.id || `REQ-${invoice.projectId}`,
        projectName: invoice.projectName,
        brand: invoice.brand,
        amount: invoice.amount,
        status: invoice.status,
        contractIds: [contract.id],
        invoiceIds: [invoice.id],
        contractStatus: deriveExternalContractStatus(invoice.status),
        invoiceStatus: invoiceStatusLabel[invoice.status],
        updatedAt: invoice.updatedAt,
        progress: existing?.progress || [],
        issues: existing?.issues || [],
      };
      requestMap.set(request.id, request);
    });
    const lastSyncedAt = records
      .map((record) => record.occurredAt)
      .sort()
      .at(-1);
    return {
      account: clone(account),
      profile: this.getProfile(userId),
      corrections: clone(
        this.state.corrections.filter((item) => item.userId === userId),
      ),
      notifications: clone(
        this.state.notifications.filter((item) => item.userId === userId),
      ),
      loginHistory: clone(
        this.state.loginHistory.filter((item) => item.userId === userId),
      ),
      contracts,
      invoices,
      requests: [...requestMap.values()],
      lastSyncedAt:
        lastSyncedAt || (isPrimaryCreator ? "2026-08-01 17:40" : undefined),
    };
  }

  listAllBusinessData(): AdminBusinessData {
    return this.state.users
      .filter((user) => user.role === "CREATOR")
      .reduce<AdminBusinessData>(
        (result, creator) => {
          const detail = this.getUserDetail(creator.id);
          const creatorSummary = {
            id: creator.id,
            name: creator.name,
            email: creator.email,
          };
          result.requests.push(
            ...detail.requests.map((record) => ({
              creator: creatorSummary,
              record,
            })),
          );
          result.contracts.push(
            ...detail.contracts.map((record) => ({
              creator: creatorSummary,
              record,
            })),
          );
          result.invoices.push(
            ...detail.invoices.map((record) => ({
              creator: creatorSummary,
              record,
            })),
          );
          return result;
        },
        { requests: [], contracts: [], invoices: [] },
      );
  }

  createUser(input: CreateManagedUserInput, actorId: string) {
    this.requirePermission(actorId, "USER_MANAGE");
    if (
      this.state.users.some(
        (user) => user.email.toLowerCase() === input.email.trim().toLowerCase(),
      )
    ) {
      throw new Error("该邮箱已存在");
    }
    const prefix = input.role === "ADMIN" ? "ADMIN" : "CREATOR";
    const roleCount = this.state.users.filter((user) => user.role === input.role).length;
    const id = `${prefix}-${String(roleCount + 1).padStart(3, "0")}`;
    const invited = input.mode === "INVITE";
    const account: UserAccount = {
      id,
      name: input.name.trim(),
      email: input.email.trim(),
      role: input.role,
      status: "ACTIVE",
      invitationStatus: invited ? "PENDING" : "ACCEPTED",
      verificationStatus: input.role === "ADMIN" ? "VERIFIED" : "PENDING",
      onboardingComplete: input.role === "ADMIN",
      createdAt: today(),
      lastLoginAt: "-",
      lastActiveAt: invited ? "等待接受邀请" : "尚未登录",
    };
    this.state.users.push(account);
    this.state.credentials[id] = input.role === "ADMIN" ? "Admin2026" : "Creator2026";
    if (input.role === "CREATOR") {
      this.state.profiles[id] = createCreatorProfile({
        id,
        name: account.name,
        email: account.email,
        platform: "YouTube",
        handle: account.name.replace(/\s+/g, ""),
        verified: false,
      });
    }
    if (invited) {
      this.state.invitations.unshift({
        id: `INVITE-${idSuffix()}`,
        userId: id,
        email: account.email,
        role: account.role,
        status: "PENDING",
        createdBy: actorId,
        createdAt: today(),
        expiresAt: daysFromNow(this.state.settings.invitationValidDays),
      });
      this.notify(
        id,
        "INVITATION",
        "COMETS Pay 账号邀请",
        `邀请已发送，请在 ${this.state.settings.invitationValidDays} 天内完成激活。`,
      );
    }
    this.audit(
      actorId,
      invited ? "USER_INVITED" : "USER_CREATED",
      "USER",
      invited ? `邀请 ${account.name} 加入系统` : `创建 ${account.name} 的系统账号`,
      { subjectUserId: id },
    );
    this.save();
    return clone(account);
  }

  setStatus(
    userIds: string[],
    status: AccountStatus,
    actorId: string,
    reason: string,
  ) {
    this.requirePermission(actorId, "USER_MANAGE");
    if (status === "DISABLED" && userIds.includes(actorId)) {
      throw new Error("不能停用当前登录账号");
    }
    const targets = userIds.map((id) => this.requireUser(id));
    if (status === "DISABLED") {
      const activeAdmins = this.state.users.filter(
        (user) =>
          user.role === "ADMIN" &&
          user.status === "ACTIVE" &&
          user.invitationStatus === "ACCEPTED",
      );
      const disabledAdminIds = new Set(
        targets.filter((user) => user.role === "ADMIN").map((user) => user.id),
      );
      if (
        activeAdmins.filter((user) => !disabledAdminIds.has(user.id)).length === 0
      ) {
        throw new Error("必须至少保留一个已启用的管理员账号");
      }
    }
    targets.forEach((account) => {
      const before = account.status;
      account.status = status;
      if (status === "DISABLED") {
        this.state.sessions = this.state.sessions.filter(
          (session) => session.userId !== account.id,
        );
      }
      this.notify(
        account.id,
        "ACCOUNT_STATUS",
        status === "ACTIVE" ? "账号已恢复" : "账号已停用",
        status === "ACTIVE"
          ? "你的 COMETS Pay 访问权限已恢复。"
          : `你的 COMETS Pay 访问权限已停用。${reason ? ` 原因：${reason}` : ""}`,
      );
      this.audit(
        actorId,
        "USER_STATUS_CHANGED",
        "USER",
        `账号状态由 ${before} 变更为 ${status}`,
        {
          subjectUserId: account.id,
          reason,
          before: { status: before },
          after: { status },
        },
      );
    });
    this.save();
    return clone(targets);
  }

  updateProfile(userId: string, patch: AdminProfilePatch, actorId: string) {
    this.requirePermission(actorId, "USER_BASIC_PROFILE_EDIT");
    this.requirePermission(actorId, "USER_SOCIAL_PROFILE_EDIT");
    const account = this.requireUser(userId);
    if (account.role !== "CREATOR") throw new Error("管理员账号没有创作者档案");
    const profile = this.state.profiles[userId];
    if (!profile) throw new Error("创作者档案不存在");
    if (!patch.displayName.trim() || !patch.legalName.trim()) {
      throw new Error("显示名称和真实姓名不能为空");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(patch.email.trim())) {
      throw new Error("请输入有效的联系邮箱");
    }
    if (
      this.state.users.some(
        (user) =>
          user.id !== userId &&
          user.email.toLowerCase() === patch.email.trim().toLowerCase(),
      )
    ) {
      throw new Error("该邮箱已被其他账号使用");
    }
    if (
      !patch.profileUrls.length ||
      patch.profileUrls.some((url) => {
        try {
          const parsed = new URL(url);
          return !["http:", "https:"].includes(parsed.protocol);
        } catch {
          return true;
        }
      })
    ) {
      throw new Error("请填写有效的社媒主页链接");
    }
    const before = {
      displayName: profile.displayName,
      legalName: profile.legalName,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      platform: profile.social.platform,
      handle: profile.social.handle,
      profileUrls: profile.social.profileUrls.join("\n"),
    };
    profile.displayName = patch.displayName.trim();
    profile.legalName = patch.legalName.trim();
    profile.email = patch.email.trim();
    profile.phone = patch.phone.trim();
    profile.address = patch.address.trim();
    profile.social.platform = patch.platform.trim();
    profile.social.handle = patch.handle.trim();
    profile.social.profileUrls = patch.profileUrls.map((url) => url.trim()).filter(Boolean);
    profile.social.profileUrl = profile.social.profileUrls[0] || "";
    account.name = profile.displayName;
    account.email = profile.email;
    this.refreshSessions(account);
    this.audit(actorId, "PROFILE_UPDATED", "PROFILE", "更新基本资料与社媒资料", {
      subjectUserId: userId,
      before,
      after: {
        displayName: profile.displayName,
        legalName: profile.legalName,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        platform: profile.social.platform,
        handle: profile.social.handle,
        profileUrls: profile.social.profileUrls.join("\n"),
      },
    });
    this.save();
    return this.getUserDetail(userId);
  }

  updateVerification(
    userId: string,
    status: VerificationStatus,
    actorId: string,
    reason = "",
  ) {
    this.requirePermission(actorId, "USER_SOCIAL_PROFILE_EDIT");
    if (status === "CHANGES_REQUESTED") {
      throw new Error("请通过退回具体字段并填写原因来发起资料修正");
    }
    const account = this.requireUser(userId);
    const before = account.verificationStatus;
    account.verificationStatus = status;
    const profile = this.state.profiles[userId];
    if (profile) profile.social.verificationStatus = status;
    this.refreshSessions(account);
    this.audit(
      actorId,
      "VERIFICATION_UPDATED",
      "PROFILE",
      `认证状态由 ${before} 变更为 ${status}`,
      {
        subjectUserId: userId,
        reason,
        before: { verificationStatus: before },
        after: { verificationStatus: status },
      },
    );
    this.save();
    return this.getUserDetail(userId);
  }

  resetPassword(userId: string, actorId: string) {
    this.requirePermission(actorId, "USER_MANAGE");
    const account = this.requireUser(userId);
    this.state.credentials[userId] =
      account.role === "ADMIN" ? "Admin2026" : "Creator2026";
    this.notify(
      userId,
      "PASSWORD_RESET",
      "密码重置邮件已发送",
      "请通过邮件中的安全链接重新设置登录密码。",
    );
    this.audit(
      actorId,
      "PASSWORD_RESET_SENT",
      "SECURITY",
      "发送模拟密码重置邮件",
      { subjectUserId: userId },
    );
    this.save();
  }

  createCorrection(
    userId: string,
    fieldKey: string,
    fieldLabel: string,
    reason: string,
    actorId: string,
  ) {
    this.requirePermission(actorId, "USER_CORRECTION_CREATE");
    this.requireUser(userId);
    if (!reason.trim()) throw new Error("请填写退回原因");
    const existing = this.state.corrections.find(
      (item) =>
        item.userId === userId &&
        item.fieldKey === fieldKey &&
        item.status === "OPEN",
    );
    if (existing) {
      existing.reason = reason.trim();
      existing.createdAt = today();
      existing.createdBy = actorId;
    } else {
      this.state.corrections.unshift({
        id: `CORR-${idSuffix()}`,
        userId,
        fieldKey,
        fieldLabel,
        reason: reason.trim(),
        status: "OPEN",
        createdBy: actorId,
        createdAt: today(),
      });
    }
    const account = this.requireUser(userId);
    if (fieldKey.startsWith("social.")) {
      account.verificationStatus = "CHANGES_REQUESTED";
      const profile = this.state.profiles[userId];
      if (profile) profile.social.verificationStatus = "CHANGES_REQUESTED";
    }
    this.notify(
      userId,
      "CORRECTION",
      `${fieldLabel}需要修改`,
      reason.trim(),
    );
    this.audit(actorId, "CORRECTION_CREATED", "PROFILE", `退回字段“${fieldLabel}”`, {
      subjectUserId: userId,
      reason: reason.trim(),
    });
    this.save();
    return this.getUserDetail(userId);
  }

  listCorrections(userId: string) {
    return clone(
      this.state.corrections.filter((item) => item.userId === userId),
    );
  }

  revealSensitive(
    userId: string,
    fieldKey: SensitiveFieldKey,
    reason: string,
    actorId: string,
  ) {
    this.requirePermission(actorId, "SENSITIVE_DATA_REVEAL");
    if (!reason.trim()) throw new Error("查看完整敏感信息前必须填写原因");
    const profile = this.state.profiles[userId];
    if (!profile) throw new Error("创作者档案不存在");
    const values = {
      accountNumber:
        profile.payout.accountNumber || profile.payout.schemaValues.account_number || "",
      iban: profile.payout.schemaValues.iban || "",
      swiftCode:
        profile.payout.swiftCode || profile.payout.schemaValues.swift_code || "",
      beneficiaryIdNumber:
        profile.payout.schemaValues.beneficiary_id_number ||
        profile.payout.schemaValues.personal_id_number ||
        "",
      businessRegistrationNumber:
        profile.payout.schemaValues.business_registration_number || "",
    };
    this.audit(
      actorId,
      "SENSITIVE_DATA_REVEALED",
      "SECURITY",
      `查看敏感字段 ${fieldKey}`,
      { subjectUserId: userId, reason: reason.trim() },
    );
    this.save();
    return values[fieldKey];
  }

  exportMasked(filters: AdminUserFilters, actorId: string) {
    this.requirePermission(actorId, "USER_VIEW_ALL");
    const rows = this.listUsers(filters);
    const csv = [
      ["Creator ID", "姓名", "邮箱", "角色", "账号状态", "认证状态", "创建时间"],
      ...rows.map((user) => [
        user.id,
        user.name,
        user.email.replace(/^(.{2}).+(@.+)$/u, "$1***$2"),
        user.role,
        user.status,
        user.verificationStatus,
        user.createdAt,
      ]),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    this.audit(actorId, "USERS_EXPORTED", "SECURITY", `导出 ${rows.length} 条脱敏用户记录`);
    this.save();
    return csv;
  }

  listAudits() {
    return clone(this.state.audits);
  }

  listNotifications(userId: string) {
    return clone(
      this.state.notifications.filter((item) => item.userId === userId),
    );
  }

  getSettings() {
    return clone(this.state.settings);
  }

  saveSettings(settings: AdminSettings, actorId: string) {
    this.requirePermission(actorId, "ADMIN_SETTINGS_MANAGE");
    if (
      settings.invitationValidDays < 1 ||
      settings.invitationValidDays > 30
    ) {
      throw new Error("邀请有效期必须为 1–30 天");
    }
    if (
      settings.passwordMinLength < 6 ||
      settings.passwordMaxLength > 64 ||
      settings.passwordMinLength > settings.passwordMaxLength
    ) {
      throw new Error("请设置有效的密码长度范围");
    }
    if (
      !settings.serviceAgreementUrl.trim() ||
      !settings.privacyPolicyUrl.trim() ||
      !settings.dataProcessingUrl.trim()
    ) {
      throw new Error("协议链接不能为空");
    }
    const before = clone(this.state.settings);
    this.state.settings = clone(settings);
    this.audit(actorId, "SETTINGS_UPDATED", "SETTINGS", "更新用户管理配置", {
      before: {
        registrationEnabled: String(before.registrationEnabled),
        invitationValidDays: String(before.invitationValidDays),
      },
      after: {
        registrationEnabled: String(settings.registrationEnabled),
        invitationValidDays: String(settings.invitationValidDays),
      },
    });
    this.save();
    return this.getSettings();
  }

  listSyncIssues() {
    return clone(this.state.syncIssues);
  }

  upsertExternalEvent(event: ExternalBusinessEvent) {
    if (
      !event.eventId.trim() ||
      !event.creatorId.trim() ||
      !event.externalRecordId.trim() ||
      !event.occurredAt.trim() ||
      !Number.isInteger(event.version) ||
      event.version < 1
    ) {
      this.state.syncIssues.unshift({
        id: `SYNC-ISSUE-${idSuffix()}`,
        eventId: event.eventId || "MISSING_EVENT_ID",
        creatorId: event.creatorId || "MISSING_CREATOR_ID",
        resourceType: event.resourceType,
        message:
          "外部事件缺少稳定 Creator ID、记录 ID、事件 ID、版本号或发生时间。",
        occurredAt: event.occurredAt || today(),
      });
      this.audit(
        "SYSTEM",
        "EXTERNAL_DATA_REJECTED",
        "SYNC",
        "拒绝字段不完整的外部事件",
        { reason: event.eventId || "MISSING_EVENT_ID" },
      );
      this.save();
      return { accepted: false, duplicate: false, reason: "INVALID_EVENT" };
    }
    if (this.state.processedEventIds.includes(event.eventId)) {
      return { accepted: true, duplicate: true };
    }
    const creator = this.state.users.find(
      (user) => user.id === event.creatorId && user.role === "CREATOR",
    );
    if (!creator) {
      this.state.syncIssues.unshift({
        id: `SYNC-ISSUE-${idSuffix()}`,
        eventId: event.eventId,
        creatorId: event.creatorId,
        resourceType: event.resourceType,
        message: "外部事件携带的 Creator ID 在本系统中不存在。",
        occurredAt: event.occurredAt,
      });
      this.audit("SYSTEM", "EXTERNAL_DATA_REJECTED", "SYNC", "拒绝未知 Creator ID 的外部事件", {
        reason: event.creatorId,
      });
      this.state.processedEventIds.push(event.eventId);
      this.save();
      return { accepted: false, duplicate: false, reason: "UNKNOWN_CREATOR_ID" };
    }
    const existing = this.state.externalRecords.find(
      (item) =>
        item.creatorId === event.creatorId &&
        item.externalRecordId === event.externalRecordId &&
        item.resourceType === event.resourceType,
    );
    if (existing && existing.version >= event.version) {
      this.state.syncIssues.unshift({
        id: `SYNC-ISSUE-${idSuffix()}`,
        eventId: event.eventId,
        creatorId: event.creatorId,
        resourceType: event.resourceType,
        message: `收到版本 ${event.version}，当前已保存版本 ${existing.version}，旧版本事件已忽略。`,
        occurredAt: event.occurredAt,
      });
      this.audit(
        "SYSTEM",
        "EXTERNAL_DATA_REJECTED",
        "SYNC",
        "忽略版本过旧的外部事件",
        {
          subjectUserId: event.creatorId,
          reason: `${event.externalRecordId}: ${event.version} <= ${existing.version}`,
        },
      );
      this.state.processedEventIds.push(event.eventId);
      this.save();
      return { accepted: false, duplicate: false, reason: "STALE_VERSION" };
    }
    const next: ExternalRecordState = {
      creatorId: event.creatorId,
      externalRecordId: event.externalRecordId,
      resourceType: event.resourceType,
      version: event.version,
      occurredAt: event.occurredAt,
      payload: clone(event.payload),
    };
    if (existing) Object.assign(existing, next);
    else this.state.externalRecords.push(next);
    this.state.processedEventIds.push(event.eventId);
    this.audit("SYSTEM", "EXTERNAL_DATA_SYNCED", "SYNC", `同步 ${event.resourceType} 外部数据`, {
      subjectUserId: event.creatorId,
    });
    this.save();
    return { accepted: true, duplicate: false };
  }

  private requireUser(userId: string) {
    const account = this.state.users.find((user) => user.id === userId);
    if (!account) throw new Error("用户不存在");
    return account;
  }
}

export const adminStore = new MockAdminStore();

export const maskSensitiveValue = (value: string, visible = 4) => {
  const normalized = value.trim();
  if (!normalized) return "-";
  if (normalized.length <= visible) return "••••";
  return `•••• ${normalized.slice(-visible)}`;
};

export const businessDataForCreator = (
  creatorId: string,
): {
  contracts: Contract[];
  invoices: Invoice[];
  requests: RequestProject[];
} =>
  creatorId === PRIMARY_CREATOR_ID
    ? {
        contracts: clone(seedContracts),
        invoices: clone(seedInvoices),
        requests: clone(seedRequests),
      }
    : { contracts: [], invoices: [], requests: [] };
