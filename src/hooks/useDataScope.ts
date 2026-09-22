import { useLocation } from "react-router-dom";
import { adminStore } from "../admin-store";
import type { Session } from "../types";
import { useAuth } from "./useAuth";

export function resolveDataScope(session: Session | null, requestedId: string | null): string | undefined {
  if (!session || !adminStore.restoreSession(session.sessionId)) return undefined;
  if (session.role === "CREATOR") return session.userId;
  const account = requestedId ? adminStore.listUsers({ role: "CREATOR" }).find((user) => user.id === requestedId) : undefined;
  return account?.id;
}

export function useDataScope() {
  const auth = useAuth();
  const location = useLocation();
  const requestedId = new URLSearchParams(location.search).get("userId");
  const targetUserId = resolveDataScope(auth?.session || null, requestedId);
  return {
    targetUserId,
    viewingUserId: auth?.role === "admin" ? targetUserId : undefined,
    isAdminView: auth?.role === "admin",
    scopeQuery: auth?.role === "admin" && targetUserId ? `?userId=${encodeURIComponent(targetUserId)}` : "",
  };
}
