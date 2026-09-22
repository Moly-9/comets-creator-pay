import type {
  Contract,
  CreatorNotification,
  CreatorNotificationType,
  CreatorTask,
  ExternalInvoiceCollectionStatus,
  InternalInvoiceReviewStatus,
  Invoice,
  InvoiceDocumentState,
  InvoiceOperationEvent,
  InvoiceStatus,
  PaymentFailureRecoveryStatus,
  PaymentStatus,
} from "./types";
import type { ExternalInvoiceReviewEvent } from "./invoices/external/types";
import { recognitionFieldsFromExtracted } from "./invoices/external/workflow";

const legacyInternalStatus = (
  status: InvoiceStatus,
): InternalInvoiceReviewStatus => {
  if (status === "DRAFT_SIGNATURE" || status === "PENDING_CONFIRMATION") {
    return "WAITING_SIGNATURE";
  }
  if (status === "PENDING_REVIEW") return "UNDER_REVIEW";
  if (status === "CHANGES_REQUIRED") return "CHANGES_REQUIRED";
  return "APPROVED";
};

const legacyExternalStatus = (
  status: InvoiceStatus,
): ExternalInvoiceCollectionStatus => {
  if (status === "PENDING_CONFIRMATION") return "WAITING_CONFIRMATION";
  if (status === "DRAFT_SIGNATURE") return "WAITING_UPLOAD";
  if (status === "PENDING_REVIEW") return "WAITING_MEDIA_REVIEW";
  if (status === "CHANGES_REQUIRED") return "RETURNED_FOR_CORRECTION";
  return "APPROVED";
};

const legacyPaymentStatus = (status: InvoiceStatus): PaymentStatus => {
  if (status === "PAYMENT_FAILED") return "FAILED";
  if (status === "PAID") return "PAID";
  return "WAITING_PAYMENT";
};

const inferDocumentKind = (invoice: Invoice): InvoiceDocumentState["kind"] => {
  if (
    invoice.invoiceType === "INTERNAL"
    || invoice.invoiceType === "INTERNAL_CONTRACT"
  ) return "INTERNAL";
  if (
    invoice.invoiceType === "EXTERNAL"
    || invoice.invoiceType === "EXTERNAL_CONTRACT"
  ) return "EXTERNAL";
  return invoice.status === "DRAFT_SIGNATURE" ? "INTERNAL" : "EXTERNAL";
};

export const invoiceNumberOf = (invoice: Pick<Invoice, "id" | "invoiceNumber">) => (
  invoice.invoiceNumber || invoice.id
);

export const invoiceInternalIdOf = (invoice: Pick<Invoice, "id" | "invoiceId">) => (
  invoice.invoiceId || `invoice:${invoice.id}`
);

export const invoiceTypeOf = (invoice: Invoice): "INTERNAL" | "EXTERNAL" => (
  invoice.documentState?.kind || inferDocumentKind(invoice)
);

export const legacyStatusForInvoice = (
  documentState: InvoiceDocumentState,
  paymentStatus: PaymentStatus,
): InvoiceStatus => {
  if (documentState.kind === "INTERNAL") {
    if (documentState.status === "WAITING_SIGNATURE") return "DRAFT_SIGNATURE";
    if (documentState.status === "CREATOR_FEEDBACK") return "CHANGES_REQUIRED";
    if (documentState.status === "UNDER_REVIEW") return "PENDING_REVIEW";
    if (documentState.status === "CHANGES_REQUIRED") return "CHANGES_REQUIRED";
  } else {
    if (["WAITING_UPLOAD", "RECOGNIZING", "WAITING_CONFIRMATION"].includes(documentState.status)) {
      return "PENDING_CONFIRMATION";
    }
    if (documentState.status === "WAITING_MEDIA_REVIEW") return "PENDING_REVIEW";
    if (["RETURNED_FOR_CORRECTION", "RETURNED_FOR_REUPLOAD", "RECOGNITION_FAILED"].includes(documentState.status)) {
      return "CHANGES_REQUIRED";
    }
  }
  if (paymentStatus === "FAILED") return "PAYMENT_FAILED";
  if (paymentStatus === "PAID") return "PAID";
  return "APPROVED";
};

export const migrateInvoice = (source: Invoice): Invoice => {
  const invoice = structuredClone(source);
  const kind = invoice.documentState?.kind || inferDocumentKind(invoice);
  const documentState: InvoiceDocumentState = invoice.documentState || (
    kind === "INTERNAL"
      ? { kind, status: legacyInternalStatus(invoice.status) }
      : { kind, status: legacyExternalStatus(invoice.status) }
  );
  const paymentStatus = invoice.paymentStatus || legacyPaymentStatus(invoice.status);
  const paymentRecoveryStatus = invoice.paymentRecoveryStatus || (
    paymentStatus === "FAILED" ? "AWAITING_CREATOR_UPDATE" : undefined
  );
  const invoiceNumber = invoiceNumberOf(invoice);
  const invoiceId = invoiceInternalIdOf(invoice);
  const migratedEventAt = /^\d{4}-\d{2}-\d{2}/.test(invoice.updatedAt)
    ? invoice.updatedAt
    : `${invoice.issuedAt}T12:00:00.000Z`;
  const [expectedCurrency = "", expectedAmount = ""] = invoice.amount.split(/\s+/, 2);
  const operationHistory: InvoiceOperationEvent[] = invoice.operationHistory?.length
    ? invoice.operationHistory
    : (invoice.processHistory || []).map((event) => ({
        id: `migrated:${event.id}`,
        type: "LEGACY_MIGRATED" as const,
        label: event.label,
        actor: event.actor,
        occurredAt: event.occurredAt,
        reason: event.reason,
      }));

  const fileVersions = invoice.fileVersions || (invoice.document ? [{
    ...invoice.document,
    version: 1,
    uploadedAt: invoice.issuedAt,
    demoHash: `demo-${invoice.document.id}`,
  }] : []);
  const sourceFileVersions = invoice.sourceFileVersions || fileVersions.map((file) => ({
    ...file,
    fileVersionId: file.id,
    fileName: file.name,
    fileHash: file.demoHash,
    uploadedBy: invoice.creatorId || "CREATOR-001",
    supersedesFileVersionId: file.supersedesFileId,
  }));
  const recognitionSnapshots = invoice.recognitionSnapshots || (
    invoice.extractedData && sourceFileVersions.length
      ? [{
          recognitionId: `recognition:migrated:${invoiceId}`,
          fileVersionId: sourceFileVersions.at(-1)!.fileVersionId,
          engineVersion: "mock-ocr-migration-v1",
          recognizedAt: sourceFileVersions.at(-1)!.uploadedAt,
          fields: recognitionFieldsFromExtracted(invoiceNumber, invoice.extractedData),
          extractedData: structuredClone(invoice.extractedData),
        }]
      : []
  );
  const migratedExternalHistory: ExternalInvoiceReviewEvent[] = kind !== "EXTERNAL" ? [] : [
    {
      eventId: `history:migrated:${invoiceId}:task`,
      action: "TASK_PUBLISHED",
      actor: "系统",
      occurredAt: invoice.createdAt || `${invoice.issuedAt}T00:00:00.000Z`,
      toStatus: "WAITING_UPLOAD",
    },
    ...(sourceFileVersions.length ? [{
      eventId: `history:migrated:${invoiceId}:upload`,
      action: "FILE_UPLOADED" as const,
      actor: invoice.creatorId || "CREATOR-001",
      occurredAt: sourceFileVersions.at(-1)!.uploadedAt,
      fromStatus: "WAITING_UPLOAD" as const,
      toStatus: "RECOGNIZING" as const,
    }] : []),
    ...(recognitionSnapshots.length ? [{
      eventId: `history:migrated:${invoiceId}:recognition`,
      action: "RECOGNITION_SUCCEEDED" as const,
      actor: "模拟 AI",
      occurredAt: recognitionSnapshots.at(-1)!.recognizedAt,
      fromStatus: "RECOGNIZING" as const,
      toStatus: "WAITING_CONFIRMATION" as const,
    }] : []),
    ...(["WAITING_MEDIA_REVIEW", "APPROVED"].includes(documentState.status) ? [{
      eventId: `history:migrated:${invoiceId}:submitted`,
      action: "SUBMITTED" as const,
      actor: invoice.creatorId || "CREATOR-001",
      occurredAt: migratedEventAt,
      fromStatus: "WAITING_CONFIRMATION" as const,
      toStatus: "WAITING_MEDIA_REVIEW" as const,
    }] : []),
    ...(documentState.status === "APPROVED" ? [{
      eventId: `history:migrated:${invoiceId}:approved`,
      action: "APPROVED" as const,
      actor: "管理端审核",
      occurredAt: migratedEventAt,
      fromStatus: "WAITING_MEDIA_REVIEW" as const,
      toStatus: "APPROVED" as const,
    }] : []),
    ...(documentState.status === "APPROVED" ? [{
      eventId: `history:migrated:${invoiceId}:payment`,
      action: "PAYMENT_STATUS_CHANGED" as const,
      actor: "付款系统",
      occurredAt: invoice.paidAt || invoice.paymentCompletedAt || migratedEventAt,
      fromStatus: "APPROVED" as const,
      toStatus: "APPROVED" as const,
      reason: paymentStatus === "FAILED" ? invoice.paymentFailureReason || invoice.paymentIssue?.message : `付款状态：${paymentStatus}`,
    }] : []),
  ];

  return {
    ...invoice,
    id: invoiceNumber,
    invoiceId,
    invoiceNumber,
    invoiceType: kind,
    creatorId: invoice.creatorId || "CREATOR-001",
    documentState,
    paymentStatus,
    paymentRecoveryStatus,
    paymentFailureReason:
      invoice.paymentFailureReason
      || invoice.paymentIssue?.message
      || (paymentStatus === "FAILED" ? invoice.rejectedReason : undefined),
    fileVersions,
    sourceFileVersions,
    recognitionSnapshots,
    confirmedSnapshots: invoice.confirmedSnapshots || [],
    reviewHistory: (invoice.reviewHistory?.length ? invoice.reviewHistory : migratedExternalHistory).map((event) => ({
      ...event,
      occurredAt: Number.isNaN(new Date(event.occurredAt).getTime()) ? migratedEventAt : event.occurredAt,
    })),
    expectedValues: invoice.expectedValues || {
      amount: expectedAmount.replace(/,/g, ""),
      currency: expectedCurrency,
      billTo: "COMETS INTERNATIONAL LIMITED",
      creatorLegalName: invoice.extractedData?.invoiceFrom || "Léa Martin",
    },
    version: invoice.version || 1,
    createdAt: invoice.createdAt || `${invoice.issuedAt}T00:00:00.000Z`,
    returnReason: invoice.returnReason || invoice.rejectedReason,
    expectedPaymentAt: invoice.expectedPaymentAt || invoice.paymentExpectedAt,
    paidAt: invoice.paidAt || invoice.paymentCompletedAt,
    processedClientRequestIds: invoice.processedClientRequestIds || [],
    feedbackRecords: invoice.feedbackRecords || [],
    operationHistory,
    status: legacyStatusForInvoice(documentState, paymentStatus),
  };
};

export const migrateInvoices = (invoices: Invoice[]) => invoices.map(migrateInvoice);

export const INTERNAL_REVIEW_META: Record<
  InternalInvoiceReviewStatus,
  { label: string; tone: string }
> = {
  WAITING_SIGNATURE: { label: "待签署", tone: "amber" },
  CREATOR_FEEDBACK: { label: "反馈处理中", tone: "purple" },
  UNDER_REVIEW: { label: "待审核", tone: "blue" },
  CHANGES_REQUIRED: { label: "待修改", tone: "danger" },
  APPROVED: { label: "已通过审核", tone: "success" },
};

export const EXTERNAL_COLLECTION_META: Record<
  ExternalInvoiceCollectionStatus,
  { label: string; tone: string }
> = {
  DRAFT: { label: "待发布", tone: "neutral" },
  WAITING_UPLOAD: { label: "待上传", tone: "amber" },
  RECOGNIZING: { label: "识别中", tone: "purple" },
  WAITING_CONFIRMATION: { label: "待确认", tone: "amber" },
  WAITING_MEDIA_REVIEW: { label: "待审核", tone: "blue" },
  RETURNED_FOR_CORRECTION: { label: "待修改", tone: "danger" },
  RETURNED_FOR_REUPLOAD: { label: "待重新上传", tone: "danger" },
  APPROVED: { label: "已通过审核", tone: "success" },
  RECOGNITION_FAILED: { label: "识别失败", tone: "danger" },
  CANCELLED: { label: "已取消", tone: "neutral" },
};

export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; tone: string }
> = {
  WAITING_PAYMENT: { label: "等待付款", tone: "purple" },
  PROCESSING: { label: "付款处理中", tone: "blue" },
  PAID: { label: "付款成功", tone: "success" },
  FAILED: { label: "付款失败", tone: "danger" },
};

export const invoiceReviewMeta = (invoice: Invoice) => {
  const migrated = migrateInvoice(invoice);
  return migrated.documentState!.kind === "INTERNAL"
    ? INTERNAL_REVIEW_META[migrated.documentState!.status]
    : EXTERNAL_COLLECTION_META[migrated.documentState!.status];
};

export const invoicePaymentMeta = (invoice: Invoice) => (
  PAYMENT_STATUS_META[migrateInvoice(invoice).paymentStatus!]
);

/** The stored payment status is not an active stage until document approval. */
export const invoiceDetailPaymentMeta = (invoice: Invoice) => {
  const migrated = migrateInvoice(invoice);
  return migrated.documentState!.status === "APPROVED"
    ? invoicePaymentMeta(migrated)
    : { label: "未开始", tone: "neutral" };
};

export const invoiceDetailPaymentTimeline = (invoice: Invoice) => {
  const migrated = migrateInvoice(invoice);
  const approved = migrated.documentState!.status === "APPROVED";
  const payment = migrated.paymentStatus;
  const repairSubmitted = recoveryStatusIsSubmitted(migrated.paymentRecoveryStatus);
  if (approved && payment === "FAILED") {
    const recovery = migrated.paymentRecoveryStatus;
    const retryReady = ["READY_FOR_RETRY", "RETRY_SUBMITTED", "RETRY_SUCCEEDED"].includes(recovery || "");
    const retryProcessing = ["RETRY_SUBMITTED", "RETRY_SUCCEEDED"].includes(recovery || "");
    const retrySucceeded = recovery === "RETRY_SUCCEEDED";
    return [
      ["审核通过", "complete"],
      ["待付款", "complete"],
      ["付款处理中", "complete"],
      ["付款失败", "error"],
      ["待确认重试方案", repairSubmitted ? "complete" : "current"],
      ["重新打款申请已提交复核", !repairSubmitted ? "pending" : retryReady ? "complete" : "current"],
      ["等待重新付款", !retryReady ? "pending" : retryProcessing ? "complete" : "current"],
      ["付款处理中", !retryProcessing ? "pending" : retrySucceeded ? "complete" : "current"],
      ["付款成功", retrySucceeded ? "complete" : "pending"],
    ] as const;
  }
  return [
    ["审核通过", approved ? "complete" : "pending"],
    ["等待付款", !approved ? "pending" : payment === "WAITING_PAYMENT" ? "current" : "complete"],
    ["付款处理中", !approved ? "pending" : payment === "PROCESSING" ? "current" : payment === "PAID" ? "complete" : "pending"],
    ["付款成功", approved && payment === "PAID" ? "complete" : "pending"],
  ] as const;
};

export type InvoiceTimelineNode = readonly [
  label: string,
  status: "complete" | "current" | "error" | "pending",
];

/** A document must reach approval before any payment step becomes active. */
export const invoiceLifecycleTimeline = (invoice: Invoice): InvoiceTimelineNode[] => {
  const migrated = migrateInvoice(invoice);
  const document = migrated.documentState!;
  let review: InvoiceTimelineNode[];

  if (document.kind === "INTERNAL") {
    const signed = !["WAITING_SIGNATURE", "CREATOR_FEEDBACK"].includes(document.status);
    const approved = document.status === "APPROVED";
    review = [
      ["签署 Invoice", signed ? "complete" : document.status === "WAITING_SIGNATURE" ? "current" : "pending"],
      ...(document.status === "CREATOR_FEEDBACK" ? [["信息反馈处理中", "current"] as const] : []),
      [document.status === "CHANGES_REQUIRED" ? "审核未通过" : "资料审核", approved ? "complete" : document.status === "CHANGES_REQUIRED" ? "error" : document.status === "UNDER_REVIEW" ? "current" : "pending"],
      ...(document.status === "CHANGES_REQUIRED" ? [["等待修改 Invoice", "current"] as const] : []),
      ["审核通过", approved ? "complete" : "pending"],
    ];
  } else {
    const status = document.status;
    const uploaded = !["DRAFT", "WAITING_UPLOAD", "CANCELLED"].includes(status);
    const recognized = ["WAITING_MEDIA_REVIEW", "RETURNED_FOR_CORRECTION", "APPROVED"].includes(status);
    const approved = status === "APPROVED";
    review = [
      [status === "RETURNED_FOR_REUPLOAD" ? "上传文件未通过" : "上传 Invoice", status === "RETURNED_FOR_REUPLOAD" ? "error" : !uploaded && status !== "CANCELLED" ? "current" : uploaded ? "complete" : "pending"],
      ...(status === "RETURNED_FOR_REUPLOAD" ? [["等待重新上传", "current"] as const] : []),
      [status === "RECOGNITION_FAILED" ? "识别失败" : "识别与确认", status === "RECOGNITION_FAILED" ? "error" : recognized ? "complete" : ["RECOGNIZING", "WAITING_CONFIRMATION"].includes(status) ? "current" : "pending"],
      ...(status === "RECOGNITION_FAILED" ? [["等待重新识别", "current"] as const] : []),
      [status === "RETURNED_FOR_CORRECTION" ? "审核未通过" : "资料审核", status === "RETURNED_FOR_CORRECTION" ? "error" : approved ? "complete" : status === "WAITING_MEDIA_REVIEW" ? "current" : "pending"],
      ...(status === "RETURNED_FOR_CORRECTION" ? [["等待修改 Invoice", "current"] as const] : []),
      ["审核通过", approved ? "complete" : "pending"],
      ...(status === "CANCELLED" ? [["已取消", "error"] as const] : []),
    ];
  }

  // Payment helper already handles failures and repair paths; the review
  // section above owns the shared approval step so it is not rendered twice.
  return [...review, ...invoiceDetailPaymentTimeline(migrated).slice(1)];
};

export const invoicePrimaryStatusMeta = (invoice: Invoice) => {
  const migrated = migrateInvoice(invoice);
  if (migrated.documentState!.status !== "APPROVED") {
    return invoiceReviewMeta(migrated);
  }
  return invoicePaymentMeta(migrated);
};

export const invoiceReviewFilterValue = (invoice: Invoice) => {
  const documentState = migrateInvoice(invoice).documentState!;
  return `${documentState.kind}:${documentState.status}`;
};

export const invoiceMatchesStatusFilters = (
  invoice: Invoice,
  reviewFilter: string | "ALL",
  paymentFilter: PaymentStatus | "ALL",
) => {
  const migrated = migrateInvoice(invoice);
  return (
    (reviewFilter === "ALL" || invoiceReviewFilterValue(migrated) === reviewFilter)
    && (paymentFilter === "ALL" || migrated.paymentStatus === paymentFilter)
  );
};

export type InvoiceListSummaryGroup = "TODO" | "PROCESSING" | "PAID" | "EXCLUDED";

export const invoiceListSummaryGroup = (invoiceSource: Invoice): InvoiceListSummaryGroup => {
  const invoice = migrateInvoice(invoiceSource);
  const document = invoice.documentState!;
  if (document.kind === "EXTERNAL" && document.status === "CANCELLED") return "EXCLUDED";
  if (invoice.paymentStatus === "PAID") return "PAID";
  if (invoice.paymentStatus === "FAILED") {
    return recoveryStatusIsSubmitted(invoice.paymentRecoveryStatus) ? "PROCESSING" : "TODO";
  }
  if (invoice.paymentStatus === "PROCESSING") return "PROCESSING";
  if (document.status === "APPROVED"
    || (document.kind === "INTERNAL" && document.status === "UNDER_REVIEW")
    || (document.kind === "EXTERNAL" && document.status === "WAITING_MEDIA_REVIEW")) {
    return "PROCESSING";
  }
  return "TODO";
};

export const summarizeInvoiceList = (invoiceSources: Invoice[]) => {
  const summary = { all: 0, todo: 0, processing: 0, paid: 0 };
  invoiceSources.forEach((invoice) => {
    const group = invoiceListSummaryGroup(invoice);
    if (group === "EXCLUDED") return;
    summary.all += 1;
    if (group === "TODO") summary.todo += 1;
    if (group === "PROCESSING") summary.processing += 1;
    if (group === "PAID") summary.paid += 1;
  });
  return summary;
};

const taskForInvoice = (invoiceSource: Invoice): CreatorTask => {
  const invoice = migrateInvoice(invoiceSource);
  const number = invoiceNumberOf(invoice);
  const resourceId = invoiceInternalIdOf(invoice);
  const deepLink = `/invoices/${number}`;
  const common = { resourceId, resourceNumber: number, deepLink, updatedAt: invoice.updatedAt };
  if (invoice.paymentStatus === "FAILED") {
    const submitted = ["CREATOR_UPDATED", "PENDING_FINANCE_CONFIRMATION", "READY_FOR_RETRY", "RETRY_SUBMITTED"].includes(
      invoice.paymentRecoveryStatus || "",
    );
    return {
      ...common,
      id: `task:payment:${resourceId}`,
      type: submitted ? "INVOICE_PROCESSING" : "PAYMENT_ACCOUNT_CORRECTION",
      group: submitted ? "PROCESSING" : "TODO",
      title: submitted
        ? `Invoice ${number} 收款资料复核中`
        : `Invoice ${number} 收款信息待修正`,
      description: submitted
        ? "收款资料已提交复核，无需重复提交。"
        : "付款失败，请修改错误字段或选择其他已验证账户。",
    };
  }
  if (invoice.paymentStatus === "PAID") {
    return {
      ...common,
      id: `task:paid:${resourceId}`,
      type: "PAYMENT_COMPLETED",
      group: "COMPLETED",
      title: `Invoice ${number} 已完成付款`,
      description: "该 Invoice 的付款流程已完成。",
    };
  }
  const state = invoice.documentState!;
  if (state.kind === "INTERNAL") {
    if (state.status === "WAITING_SIGNATURE") return {
      ...common,
      id: `task:sign:${resourceId}`,
      type: "INTERNAL_INVOICE_SIGNATURE",
      group: "TODO",
      title: `Invoice ${number} 待签署`,
      description: "请核对 Invoice 和脱敏收款账户后完成演示签署。",
    };
    if (state.status === "CREATOR_FEEDBACK") return {
      ...common,
      id: `task:feedback:${resourceId}`,
      type: "INVOICE_FEEDBACK_PROCESSING",
      group: "PROCESSING",
      title: `Invoice ${number} 信息反馈处理中`,
      description: "反馈已收到，等待工作人员核查。",
    };
    if (state.status === "CHANGES_REQUIRED") return {
      ...common,
      id: `task:changes:${resourceId}`,
      type: "INVOICE_FEEDBACK_PROCESSING",
      group: "TODO",
      title: `Invoice ${number} 待修改`,
      description: invoice.rejectedReason || "请按退回原因完成修改。",
    };
  } else {
    if (state.status === "WAITING_UPLOAD") return {
      ...common,
      id: `task:upload:${resourceId}`,
      type: "EXTERNAL_INVOICE_UPLOAD",
      group: "TODO",
      title: `Invoice ${number} 待上传`,
      description: "请上传 PDF、PNG 或 JPEG 文件并确认识别结果。",
    };
    if (state.status === "RETURNED_FOR_CORRECTION") return {
      ...common,
      id: `task:correct:${resourceId}`,
      type: "EXTERNAL_INVOICE_CORRECTION",
      group: "TODO",
      title: `Invoice ${number} 待修改`,
      description: invoice.rejectedReason || "请修改识别信息并重新确认。",
    };
    if (state.status === "RETURNED_FOR_REUPLOAD" || state.status === "RECOGNITION_FAILED") return {
      ...common,
      id: `task:reupload:${resourceId}`,
      type: "EXTERNAL_INVOICE_REUPLOAD",
      group: "TODO",
      title: `Invoice ${number} 需要重新上传`,
      description: invoice.rejectedReason || "当前文件无法继续处理，请上传新版本。",
    };
    if (state.status === "WAITING_CONFIRMATION") return {
      ...common,
      id: `task:confirm:${resourceId}`,
      type: "EXTERNAL_INVOICE_UPLOAD",
      group: "TODO",
      title: `Invoice ${number} 待确认`,
      description: "请核对模拟 AI 结果及收款账户后提交审核。",
    };
  }
  return {
    ...common,
    id: `task:processing:${resourceId}`,
    type: "INVOICE_PROCESSING",
    group: "PROCESSING",
    title: `Invoice ${number} 处理中`,
    description: "当前无需操作，可在详情中查看审核与付款进度。",
  };
};

export const buildCreatorTasks = (
  contracts: Contract[],
  invoices: Invoice[],
): CreatorTask[] => [
  ...contracts
    .filter((contract) => contract.status === "PENDING_SIGNATURE")
    .map((contract): CreatorTask => ({
      id: `task:contract:${contract.id}`,
      type: "CONTRACT_SIGNATURE",
      group: "TODO",
      resourceId: contract.id,
      resourceNumber: contract.id,
      title: `合同 ${contract.id} 待签署`,
      description: "请核对合同金额、服务周期、履约义务和脱敏收款账户。",
      deepLink: `/contracts/${contract.id}`,
      updatedAt: contract.updatedAt,
    })),
  ...invoices.map(taskForInvoice),
];

const notification = ({
  type,
  invoice,
  title,
  message,
  tone,
}: {
  type: CreatorNotificationType;
  invoice: Invoice;
  title: string;
  message: string;
  tone: CreatorNotification["tone"];
}): CreatorNotification => {
  const resourceId = invoiceInternalIdOf(invoice);
  const number = invoiceNumberOf(invoice);
  return {
    id: `notification:${type}:${resourceId}`,
    userId: invoice.creatorId || "CREATOR-001",
    type,
    title,
    message,
    deepLink: `/invoices/${number}`,
    resourceId,
    createdAt: invoice.updatedAt,
    read: false,
    tone,
  };
};

export const buildCreatorNotifications = (
  contracts: Contract[],
  invoiceSources: Invoice[],
): CreatorNotification[] => {
  const contractNotifications: CreatorNotification[] = contracts
    .filter((contract) => contract.status === "PENDING_SIGNATURE")
    .map((contract) => ({
      id: `notification:CONTRACT_SIGNATURE_REQUIRED:${contract.id}`,
      userId: "CREATOR-001",
      type: "CONTRACT_SIGNATURE_REQUIRED",
      title: `合同 ${contract.id} 等待签署`,
      message: "请核对合同摘要并完成演示签署。",
      deepLink: `/contracts/${contract.id}`,
      resourceId: contract.id,
      createdAt: contract.updatedAt,
      read: false,
      tone: "amber",
    }));
  const invoiceNotifications = invoiceSources.map(migrateInvoice).flatMap((invoice) => {
    const number = invoiceNumberOf(invoice);
    if (invoice.paymentStatus === "FAILED") {
      if (["CREATOR_UPDATED", "PENDING_FINANCE_CONFIRMATION", "READY_FOR_RETRY", "RETRY_SUBMITTED"].includes(invoice.paymentRecoveryStatus || "")) {
        return [notification({
          type: "PAYMENT_ACCOUNT_CORRECTION_SUBMITTED",
          invoice,
          title: `Invoice ${number} 重新打款申请已提交复核`,
          message: "财务正在复核申请，后续重新付款由系统处理。",
          tone: "purple",
        })];
      }
      return [notification({
        type: "PAYMENT_FAILED",
        invoice,
        title: `Invoice ${number} 付款失败，请核对收款账户`,
        message: invoice.paymentFailureReason || "请核对失败原因和绑定账户，再决定是否申请重新打款。",
        tone: "danger",
      })];
    }
    if (invoice.paymentStatus === "PAID") return [notification({
      type: "PAYMENT_PAID",
      invoice,
      title: `Invoice ${number} 已完成付款`,
      message: "款项已完成支付。",
      tone: "success",
    })];
    const state = invoice.documentState!;
    if (state.kind === "INTERNAL" && state.status === "WAITING_SIGNATURE") return [notification({
      type: "INTERNAL_INVOICE_SIGNATURE_REQUIRED",
      invoice,
      title: `Invoice ${number} 等待签署`,
      message: "请核对 Invoice 后完成演示签署。",
      tone: "amber",
    })];
    if (state.kind === "INTERNAL" && state.status === "CREATOR_FEEDBACK") return [notification({
      type: "INVOICE_FEEDBACK_RECEIVED",
      invoice,
      title: `Invoice ${number} 反馈已收到`,
      message: "工作人员将核查你提交的信息问题。",
      tone: "purple",
    })];
    if (state.kind === "EXTERNAL" && state.status === "WAITING_UPLOAD") return [notification({
      type: "EXTERNAL_INVOICE_UPLOAD_REQUIRED",
      invoice,
      title: `Invoice ${number} 待上传`,
      message: "请从当前 Invoice 任务上传文件。",
      tone: "amber",
    })];
    if (state.kind === "EXTERNAL" && state.status === "RETURNED_FOR_CORRECTION") return [notification({
      type: "EXTERNAL_INVOICE_CORRECTION_REQUIRED",
      invoice,
      title: `Invoice ${number} 需要修改`,
      message: invoice.rejectedReason || "请修改识别结果后重新确认。",
      tone: "danger",
    })];
    if (state.kind === "EXTERNAL" && state.status === "RECOGNITION_FAILED") return [notification({
      type: "EXTERNAL_INVOICE_REUPLOAD_REQUIRED",
      invoice,
      title: `Invoice ${number} 识别失败，请重新上传`,
      message: invoice.returnReason || invoice.rejectedReason || "请重新识别，或上传更清晰的文件版本。",
      tone: "danger",
    })];
    if (state.kind === "EXTERNAL" && state.status === "RETURNED_FOR_REUPLOAD") return [notification({
      type: "EXTERNAL_INVOICE_REUPLOAD_REQUIRED",
      invoice,
      title: `Invoice ${number} 需要重新上传`,
      message: invoice.rejectedReason || "请上传新的文件版本。",
      tone: "danger",
    })];
    if (
      (state.kind === "INTERNAL" && state.status === "UNDER_REVIEW")
      || (state.kind === "EXTERNAL" && state.status === "WAITING_MEDIA_REVIEW")
    ) return [notification({
      type: "INVOICE_SUBMITTED",
      invoice,
      title: `Invoice ${number} 已提交审核`,
      message: "可在详情中查看最新处理进度。",
      tone: "purple",
    })];
    if (state.status === "APPROVED" && invoice.paymentStatus === "WAITING_PAYMENT") return [notification({
      type: "INVOICE_APPROVED",
      invoice,
      title: `Invoice ${number} 已审核通过，等待付款`,
      message: "Invoice 审核已完成，可在详情中查看付款进度。",
      tone: "success",
    })];
    return [];
  });
  return [...contractNotifications, ...invoiceNotifications];
};

export const FORBIDDEN_CREATOR_COPY_KEYS = [
  "projectName",
  "brand",
  "projectId",
  "paymentReference",
] as const;

export const recoveryStatusIsSubmitted = (
  status?: PaymentFailureRecoveryStatus,
) => ["CREATOR_UPDATED", "PENDING_FINANCE_CONFIRMATION", "READY_FOR_RETRY", "RETRY_SUBMITTED", "RETRY_SUCCEEDED"].includes(status || "");
