import type { Contract } from "./types";

export const contractStatusLabel: Record<Contract["status"], string> = {
  未请款: "未付款",
  请款中: "付款中",
  已付款: "已付款",
};
