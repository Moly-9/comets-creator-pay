import type { AdminUserDetail, PaymentAttempt } from "../types";
import { paidAmountsByCurrency } from "../mock/payments";
import { maskAccountValue } from "../mock/users";
import { useTranslation } from "react-i18next";

export default function UserProfileCard({ detail, attempts }: { detail: AdminUserDetail; attempts: PaymentAttempt[] }) {
  const { t } = useTranslation();
  const paid = paidAmountsByCurrency(detail.invoices, attempts);
  return <section className="admin-view-profile" aria-label={t("admin.creatorSummary")}>
    <article><span>{t("admin.currentCreator")}</span><strong>{detail.account.name}</strong><small>{detail.account.id} · {t(detail.account.verificationStatus === "VERIFIED" ? "admin.verified" : detail.account.verificationStatus === "CHANGES_REQUESTED" ? "admin.needsCorrection" : "admin.pendingVerification")}</small></article>
    <article><span>{t("admin.maskedPayoutAccount")}</span><strong>{maskAccountValue(detail.profile?.payout.accountNumber || "")}</strong><small>{detail.profile?.payout.provider || t("admin.notConfigured")}</small></article>
    <article><span>{t("admin.contractsInvoices")}</span><strong>{detail.contracts.length} / {detail.invoices.length}</strong><small>{t("admin.linkedRecords")}</small></article>
    <article><span>{t("admin.totalReceived")}</span><strong>{paid.length ? paid.map(({ currency, amount }) => `${currency} ${amount.toLocaleString("en-US")}`).join(" · ") : "—"}</strong><small>{t("admin.basedOnSuccessfulAttempts")}</small></article>
  </section>;
}
