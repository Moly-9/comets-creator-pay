import { adminStore } from "./admin-store";

const KEY = "comets-admin-viewing-creator-v1";

export const rememberAdminCreator = (id: string) => {
  if (typeof window !== "undefined") window.sessionStorage.setItem(KEY, id);
};
export const clearAdminCreator = () => {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(KEY);
};
export const adminReturnPath = () => {
  const id = typeof window === "undefined" ? "" : window.sessionStorage.getItem(KEY);
  const valid = adminStore.listUsers({ role: "CREATOR" }).some((user) => user.id === id);
  return valid ? `/home?userId=${encodeURIComponent(id!)}` : "/admin/select-user";
};
