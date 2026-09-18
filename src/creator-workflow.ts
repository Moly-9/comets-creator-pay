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

  return {
    ...invoice,
    id: invoiceNumber,
    invoiceId,
    invoiceNumber,
    invoiceType: kind,
    documentState,
    paymentStatus,
    paymentRecoveryStatus,
    paymentFailureReason:
      invoice.paymentFailureReason
      || invoice.paymentIssue?.message
      || (paymentStatus === "FAILED" ? invoice.rejectedReason : undefined),
    fileVersions: invoice.fileVersions || (invoice.document ? [{
      ...invoice.document,
      version: 1,
      uploadedAt: invoice.issuedAt,
      demoHash: `demo-${invoice.document.id}`,
    }] : []),
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
  WAITING_UPLOAD: { label: "待上传", tone: "amber" },
  RECOGNIZING: { label: "识别中", tone: "purple" },
  WAITING_CONFIRMATION: { label: "待确认", tone: "amber" },
  WAITING_MEDIA_REVIEW: { label: "待审核", tone: "blue" },
  RETURNED_FOR_CORRECTION: { label: "待修改", tone: "danger" },
  RETURNED_FOR_REUPLOAD: { label: "待重新上传", tone: "danger" },
  APPROVED: { label: "已通过审核", tone: "success" },
  RECOGNITION_FAILED: { label: "识别失败", tone: "danger" },
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

export const invoiceReviewFilterValue = (invoice: Invoice) => {
  const documentState = migrateInvoice(invoice).documentState!;
  return `${documentState.kind}:${documentState.status}`;
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
      description: "请核对 OCR 结果及收款账户后提交审核。",
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
    userId: "CREATOR-001",
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
          title: `Invoice ${number} 收款资料已提交复核`,
          message: "资料正在复核，后续重新付款由系统处理。",
          tone: "purple",
        })];
      }
      return [notification({
        type: "PAYMENT_FAILED",
        invoice,
        title: `Invoice ${number} 付款失败，请修正收款信息`,
        message: invoice.paymentFailureReason || "请修改收款信息或选择其他已验证账户。",
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
      title: `Invoice ${number} 等待上传`,
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
    if (state.kind === "EXTERNAL" && ["RETURNED_FOR_REUPLOAD", "RECOGNITION_FAILED"].includes(state.status)) return [notification({
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
