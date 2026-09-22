import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ProfileTransferMethods from "./ProfileTransferMethods";
import i18n from "./i18n";
import { buildAirwallexMockTransferMethods } from "./services";

const methods = buildAirwallexMockTransferMethods({
  bankCountryCode: "FR",
  accountCurrency: "USD",
  entityType: "PERSONAL",
});

beforeEach(async () => { await i18n.changeLanguage("zh"); });
afterEach(async () => { await i18n.changeLanguage("en"); });

describe("creator profile transfer method cards", () => {
  const renderMethods = (overrides: Partial<Parameters<typeof ProfileTransferMethods>[0]> = {}) =>
    renderToStaticMarkup(createElement(ProfileTransferMethods, {
      methods, selectedValue: "LOCAL", editing: false, expanded: false,
      loading: false, error: "", onSelect: () => {}, onExpandedChange: () => {},
      ...overrides,
    }));

  it("shows only the saved choice in view mode, without mislabeling it as the cheapest", () => {
    const markup = renderMethods();
    expect(markup).toContain("本地转账 / Local transfer");
    expect(markup).not.toContain("国际电汇 / SWIFT");
    expect(markup).not.toContain("费用最低");
    expect(markup).toContain("已选择");
    expect(markup).toContain("预估手续费：");
    expect(markup).toContain("0–2 个工作日");
    expect(markup).toContain("本地演示估算");
    expect(markup).not.toContain("更换方式");
    expect(markup).not.toContain('type="radio"');
  });

  it("expands fee-ranked keyboard-selectable options only while editing", () => {
    const collapsed = renderMethods({ editing: true });
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain("更换方式");
    expect(collapsed).not.toContain('type="radio"');

    const expanded = renderMethods({ editing: true, expanded: true });
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded.indexOf("国际电汇 / SWIFT")).toBeLessThan(expanded.indexOf("本地转账 / Local transfer"));
    expect(expanded).toContain("费用最低");
    expect(expanded).toContain("1–3 个工作日");
    expect(expanded.match(/type="radio"/g)).toHaveLength(2);
    expect(expanded).toMatch(/<input[^>]*checked=""[^>]*value="LOCAL"/);
    expect(expanded).toContain('aria-labelledby="profile-transfer-method-label"');
    expect(renderMethods({ expanded: true })).not.toContain('type="radio"');
  });

  it("uses registration-specific ids without changing the profile instance", () => {
    const markup = renderMethods({ idPrefix: "onboarding-transfer-method", editing: true, expanded: true });
    expect(markup).toContain('aria-labelledby="onboarding-transfer-method-label"');
    expect(markup).toContain('aria-controls="onboarding-transfer-method-options"');
    expect(markup).toContain('name="onboarding-transfer-method"');
    expect(markup).toContain("预估手续费：");
    expect(markup).toContain("预计到账：");
    expect(markup).toContain("费用最低");
  });

  it("never exposes stale fee cards while loading, unresolved or after a failed request", () => {
    const loading = renderMethods({ editing: true, expanded: true, loading: true });
    const failed = renderMethods({ editing: true, expanded: true, error: "转账方式加载失败" });
    const unresolved = renderMethods({ editing: true, selectedValue: "SWIFT", methods: methods.filter((method) => method.value === "LOCAL") });
    expect(loading).not.toContain("预估手续费：");
    expect(failed).not.toContain("预估手续费：");
    expect(failed).toContain('role="alert"');
    expect(unresolved).toContain("正在确定当前场景的转账方式");
    expect(unresolved).not.toContain("预估手续费：");
  });
});
