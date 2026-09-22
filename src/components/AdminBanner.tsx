import { Link, useNavigate } from "react-router-dom";
import { useDataScope } from "../hooks/useDataScope";
import { clearAdminCreator } from "../admin-view-context";
import { useAuth } from "../hooks/useAuth";
import PermissionButton from "./PermissionButton";
import { useTranslation } from "react-i18next";

export default function AdminBanner({ name }: { name: string }) {
  const { t } = useTranslation();
  const { isAdminView, viewingUserId } = useDataScope();
  const permissions = useAuth()?.permissions;
  const navigate = useNavigate();
  if (!isAdminView || !viewingUserId) return null;
  return <section className="admin-mode-banner" role="status">
    <div><strong>{t("admin.readOnlyMode")}</strong><span>{t("admin.viewingCreator", { name, id: viewingUserId })}</span></div>
    <div className="admin-mode-actions">
      <Link to="/admin/select-user" onClick={clearAdminCreator}>{t("admin.switchCreator")}</Link>
      <a href="http://192.168.88.188:8771/" target="_blank" rel="noopener noreferrer" title={t("admin.externalConsoleNoSession")}>{t("admin.returnToConsole")} ↗</a>
      <PermissionButton allow={Boolean(permissions?.canJumpToAdmin)} type="button" onClick={() => { clearAdminCreator(); navigate("/admin/select-user", { replace: true }); }}>{t("admin.endViewing")}</PermissionButton>
    </div>
  </section>;
}
