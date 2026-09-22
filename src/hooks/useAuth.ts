import { createContext, useContext } from "react";
import { useLocation } from "react-router-dom";
import { creatorAccount } from "../mock/users";
import type { Session } from "../types";

export type AuthRole = "creator" | "admin" | "super_admin";
export interface AuthPermissions {
  canResendNotice: boolean;
  canUpdatePayout: boolean;
  canJumpToAdmin: boolean;
  canViewAuditLog: boolean;
}
export interface AuthValue {
  role: AuthRole;
  currentUserId: string;
  viewingUserId?: string;
  permissions: AuthPermissions;
  session: Session;
}

export const AuthContext = createContext<Session | null>(null);

/** Role comes exclusively from the restored login session, never a query parameter. */
export function useAuth(): AuthValue | null {
  const session = useContext(AuthContext);
  const location = useLocation();
  if (!session) return null;
  const admin = session.role === "ADMIN";
  const requested = admin ? new URLSearchParams(location.search).get("userId") : null;
  return {
    role: admin ? "admin" : "creator",
    currentUserId: session.userId,
    viewingUserId: requested && creatorAccount(requested) ? requested : undefined,
    session,
    permissions: {
      canResendNotice: admin,
      canUpdatePayout: !admin,
      canJumpToAdmin: admin,
      canViewAuditLog: admin,
    },
  };
}
