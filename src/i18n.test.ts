import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18n, { preferredLanguage } from "./i18n";
import LangSwitch from "./components/LangSwitch";
import { notificationDisplay } from "./notifications/display";
import { displayCopy } from "./display-copy";
import type { CreatorNotification } from "./types";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

const notice: CreatorNotification = {
  id: "notification:PAYMENT_PAID:invoice-1",
  userId: "creator-1",
  type: "PAYMENT_PAID",
  resourceId: "invoice-1",
  title: "Invoice INV-20260920-00001 已完成付款",
  message: "款项已完成支付。",
  deepLink: "/invoices/INV-20260920-00001",
  createdAt: "2026-09-20T12:00:00Z",
  read: true,
  tone: "success",
};

afterEach(async () => { await i18n.changeLanguage("en"); vi.unstubAllGlobals(); });

describe("presentation localization", () => {
  it("defaults to English without a valid saved choice", () => {
    expect(preferredLanguage(null)).toBe("en");
    expect(preferredLanguage("")).toBe("en");
    expect(preferredLanguage("fr")).toBe("en");
    expect(preferredLanguage("zh-CN")).toBe("en");
    expect(i18n.language).toBe("en");
    expect(i18n.options.fallbackLng).toContain("en");
    expect(i18n.t("app.pageTitle")).toBe("Home · COMETS Creator Pay");
  });

  it("preserves saved Chinese or English and interpolates variable values", async () => {
    expect(preferredLanguage("zh")).toBe("zh");
    expect(preferredLanguage("en")).toBe("en");
    await i18n.changeLanguage("zh");
    expect(i18n.t("home.greeting", { name: "Léa" })).toBe("你好，Léa");
  });

  it("updates the document language and title on selection", async () => {
    const page = { documentElement: { lang: "en" }, title: "" };
    vi.stubGlobal("document", page);
    await i18n.changeLanguage("zh");
    expect(page).toEqual({ documentElement: { lang: "zh-CN" }, title: "首页 · COMETS Creator Pay" });
    await i18n.changeLanguage("en");
    expect(page).toEqual({ documentElement: { lang: "en" }, title: "Home · COMETS Creator Pay" });
  });

  it("shows the current language and an accessible dropdown", async () => {
    const english = renderToStaticMarkup(createElement(LangSwitch));
    expect(english).toContain("English");
    expect(english).toContain('role="combobox"');
    expect(english).toContain('aria-label="Language: English"');
    expect(english).toContain("lucide-earth");
    await i18n.changeLanguage("zh");
    const chinese = renderToStaticMarkup(createElement(LangSwitch));
    expect(chinese).toContain("简体中文");
    expect(chinese).toContain('aria-label="语言: 简体中文"');
  });

  it("changes to English without changing domain state or deep links", async () => {
    await i18n.changeLanguage("en");
    const displayed = notificationDisplay(notice, i18n.t);
    expect(displayed.title).toBe("Invoice INV-20260920-00001 has been paid");
    expect(displayed.message).toBe("Payment has been completed.");
    expect(notice.title).toBe("Invoice INV-20260920-00001 已完成付款");
    expect(notice.read).toBe(true);
    expect(notice.deepLink).toBe("/invoices/INV-20260920-00001");
  });

  it("preserves user-provided failure reasons when no translation is known", async () => {
    await i18n.changeLanguage("en");
    const displayed = notificationDisplay({ ...notice, type: "PAYMENT_FAILED", message: "银行返回的自定义失败原因" }, i18n.t);
    expect(displayed.message).toBe("银行返回的自定义失败原因");
  });

  it("translates known service and validation errors only when displayed", async () => {
    const error = "请修改错误字段或选择其他已验证收款账户后再提交";
    const fieldError = "IBAN 校验位不正确，请核对完整账号";
    await i18n.changeLanguage("en");
    expect(displayCopy(error, i18n.t)).toContain("Correct a field");
    expect(displayCopy(fieldError, i18n.t)).toContain("check digits");
    expect(displayCopy("账户别名不能超过 40 个字符", i18n.t)).toContain("40 characters");
    expect(error).toBe("请修改错误字段或选择其他已验证收款账户后再提交");
  });

  it("localizes status and saved date ranges without changing their values", async () => {
    const status = "待签署";
    const period = "2026-09-22 至 2026-10-20";
    await i18n.changeLanguage("en");
    expect(displayCopy(status, i18n.t)).toBe("Awaiting signature");
    expect(displayCopy(period, i18n.t)).toBe("2026-09-22 to 2026-10-20");
    expect(displayCopy("银行账号 / Bank account number", i18n.t)).toBe("Bank account number");
    expect(status).toBe("待签署");
    expect(period).toBe("2026-09-22 至 2026-10-20");
    await i18n.changeLanguage("zh");
    const ibanDescription = "格式要求：FR + 2 位校验码 + 23 位大写字母或数字，共 27 位；不含空格或连字符";
    expect(displayCopy(ibanDescription, i18n.t)).toBe(ibanDescription);
  });

  it("keeps translation key sets aligned and renders both languages", async () => {
    const paths = (value: unknown, prefix = ""): string[] => value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, child]) => paths(child, prefix ? `${prefix}.${key}` : key))
      : [prefix];
    expect(paths(en).sort()).toEqual(paths(zh).sort());
    await i18n.changeLanguage("en");
    expect(i18n.t("auth.socialTitle")).toBe("Verify social accounts");
    expect(i18n.t("invoice.signDocument", { document: "Invoice" })).toBe("Sign Invoice");
    expect(displayCopy("格式要求：8 位数字，不含空格、连字符或其他符号", i18n.t)).toContain("8 digits");
    expect(displayCopy("FR开头｜共27位｜仅大写字母/数字｜无空格/连字符", i18n.t)).toContain("27 characters");
    expect(displayCopy("IBAN 格式要求：FR + 2 位校验码 + 23 位大写字母或数字，共 27 位，不含空格或连字符", i18n.t)).toContain("2 check digits");
    await i18n.changeLanguage("zh");
    expect(i18n.t("auth.socialTitle")).toBe("认证社媒账号");
  });
});
