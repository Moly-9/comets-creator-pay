import type { Contract } from "./types";

export const contractStatusLabel: Record<Contract["status"], string> = {
  PENDING_SIGNATURE: "待签署",
  ACTIVE: "执行中",
  EXPIRED: "已过期",
};

export const contractStatusTone: Record<Contract["status"], string> = {
  PENDING_SIGNATURE: "purple",
  ACTIVE: "blue",
  EXPIRED: "neutral",
};
