import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminStore } from "../../admin-store";
import { maskAccountValue } from "../../mock/users";
import { services } from "../../services";
import { useAuth } from "../../hooks/useAuth";
import { useTranslation } from "react-i18next";

type Filter = "ALL" | "CORRECTION";
const filters: { key: Filter; label: string }[] = [
  { key: "ALL", label: "全部达人" }, { key: "CORRECTION", label: "待修正" },
];

export default function SelectUser({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [rows] = useState(() => adminStore.listUsers({ role: "CREATOR" }));
  const [counts, setCounts] = useState<Record<string, { contracts: number; invoices: number }>>({});
  useEffect(() => { // Read from the same live adapter; no second mock database.
    let active = true;
    if (auth?.role === "admin") void services.adminBusiness.list().then(({ data }) => {
      if (!active) return;
      const next = Object.fromEntries(rows.map((user) => [user.id, { contracts: 0, invoices: 0 }]));
      data.contracts.forEach(({ creator }) => { if (next[creator.id]) next[creator.id].contracts += 1; });
      data.invoices.forEach(({ creator }) => { if (next[creator.id]) next[creator.id].invoices += 1; });
      setCounts(next);
    }).catch(() => { if (active) setCounts(Object.fromEntries(rows.map((user) => [user.id, { contracts: 0, invoices: 0 }]))); });
    return () => { active = false; };
  }, [auth?.session.sessionId, rows]);
  const shown = rows.filter((user) => {
    const phone = adminStore.getProfile(user.id)?.phone || "";
    const masked = maskAccountValue(phone);
    const term = query.trim().toLocaleLowerCase();
    const match = !term || `${user.name} ${user.id} ${masked}`.toLocaleLowerCase().includes(term);
    const status = filter === "ALL" || Boolean(user.hasOpenCorrection);
    return match && status;
  });
  if (auth?.role !== "admin") return null;
  return <div className="page-stack admin-select-page">
    <header className="page-heading"><div><h1>{t("admin.selectCreator")}</h1><p>{t("admin.selectCreatorDescription")}</p></div></header>
    <div className="admin-mode-actions"><Link to="/admin/settings/users">{t("menu.users")}</Link><Link to="/admin/settings/audit-logs">{t("menu.auditLogs")}</Link><a href="http://192.168.88.188:8771/" target="_blank" rel="noopener noreferrer">{t("admin.externalConsole")} ↗</a><button type="button" onClick={onLogout}>{t("menu.signOut")}</button></div>
    <section className="content-card admin-select-list" aria-label={t("admin.creatorList")}>
      <input type="search" aria-label={t("admin.searchCreatorLabel")} placeholder={t("admin.searchCreatorPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="admin-select-filters" aria-label={t("admin.quickFilters")}>{filters.map((option) => <button type="button" key={option.key} className={filter === option.key ? "active" : ""} onClick={() => setFilter(option.key)}>{t(option.key === "ALL" ? "admin.allCreators" : "admin.needsCorrection")}</button>)}</div>
      <div className="admin-select-table" role="table" aria-label={t("admin.selectCreator")}>
        <div className="admin-select-header" role="row"><span role="columnheader">{t("admin.creator")}</span><span role="columnheader">{t("admin.verificationStatus")}</span><span role="columnheader">{t("menu.contracts")}</span><span role="columnheader">Invoice</span><span role="columnheader">{t("admin.actions")}</span></div>
        {shown.map((user) => <Link className="admin-select-row" role="row" key={user.id} to={`/home?userId=${encodeURIComponent(user.id)}`}>
          <span className="admin-select-identity" role="cell"><span className="mini-avatar">{user.name[0]}</span><span><strong>{user.name}</strong><small>{user.id} · {maskAccountValue(adminStore.getProfile(user.id)?.phone || "")}</small></span></span>
          <span className="admin-select-verification" role="cell">{t(user.verificationStatus === "VERIFIED" ? "admin.verified" : user.verificationStatus === "CHANGES_REQUESTED" ? "admin.needsCorrection" : "admin.pendingVerification")}</span>
          <span className="admin-select-count" role="cell"><small className="admin-select-mobile-label">{t("menu.contracts")}</small>{counts[user.id]?.contracts ?? "—"}</span>
          <span className="admin-select-count" role="cell"><small className="admin-select-mobile-label">Invoice</small>{counts[user.id]?.invoices ?? "—"}</span><span className="admin-select-action" role="cell">{t("common.view")} →</span>
        </Link>)}
      </div>
      {!shown.length && <p className="admin-select-empty">{t("admin.noMatchingCreator")}</p>}
    </section>
  </div>;
}
