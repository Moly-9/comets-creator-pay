import type { CreatorNotification, CreatorNotificationType } from "../types";
import type { TFunction } from "i18next";

const titleKeys: Record<CreatorNotificationType, string> = {
  CONTRACT_SIGNATURE_REQUIRED: "notifications.contractSignature",
  INTERNAL_INVOICE_SIGNATURE_REQUIRED: "notifications.invoiceSignature",
  INVOICE_FEEDBACK_RECEIVED: "notifications.feedbackReceived",
  EXTERNAL_INVOICE_UPLOAD_REQUIRED: "notifications.uploadRequired",
  EXTERNAL_INVOICE_CORRECTION_REQUIRED: "notifications.correctionRequired",
  EXTERNAL_INVOICE_REUPLOAD_REQUIRED: "notifications.reuploadRequired",
  INVOICE_SUBMITTED: "notifications.submitted",
  INVOICE_APPROVED: "notifications.approved",
  PAYMENT_FAILED: "notifications.paymentFailed",
  PAYMENT_ACCOUNT_CORRECTION_SUBMITTED: "notifications.correctionSubmitted",
  PAYMENT_PAID: "notifications.paid",
};

const messageKeys: Record<string, string> = {
  "请核对合同摘要并完成演示签署。": "notifications.contractMessage",
  "请核对 Invoice 后完成演示签署。": "notifications.invoiceSignatureMessage",
  "工作人员将核查你提交的信息问题。": "notifications.feedbackMessage",
  "请从当前 Invoice 任务上传文件。": "notifications.uploadMessage",
  "请修改识别结果后重新确认。": "notifications.correctionMessage",
  "请重新识别，或上传更清晰的文件版本。": "notifications.recognitionFailedMessage",
  "请上传新的文件版本。": "notifications.reuploadMessage",
  "可在详情中查看最新处理进度。": "notifications.submittedMessage",
  "Invoice 审核已完成，可在详情中查看付款进度。": "notifications.approvedMessage",
  "请核对失败原因和绑定账户，再决定是否申请重新打款。": "notifications.failedMessage",
  "财务正在复核申请，后续重新付款由系统处理。": "notifications.correctionSubmittedMessage",
  "款项已完成支付。": "notifications.paidMessage",
};

/** Present persisted notices in the selected language without rewriting their audit copy. */
export function notificationDisplay(item: CreatorNotification, t: TFunction) {
  const number = item.title.match(/\bInvoice\s+(INV-[\w-]+)/)?.[1]
    || item.title.match(/\b(INV-[\w-]+)\b/)?.[1];
  const contract = item.title.match(/\b(CON-[\w-]+)\b/)?.[1];
  const titleKey = item.type === "EXTERNAL_INVOICE_REUPLOAD_REQUIRED" && item.title.includes("识别失败")
    ? "notifications.recognitionFailed"
    : titleKeys[item.type];
  return {
    title: (number || contract) ? t(titleKey, { number: number || contract }) : item.title,
    message: messageKeys[item.message] ? t(messageKeys[item.message]) : item.message,
  };
}
