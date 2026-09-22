import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

export type AppLanguage = "zh" | "en";

export function preferredLanguage(saved: string | null): AppLanguage {
  return saved === "zh" || saved === "en" ? saved : "en";
}

const savedLanguage = (() => {
  try {
    return preferredLanguage(localStorage.getItem("lang"));
  } catch {
    return "en";
  }
})();

void i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: savedLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

const updateDocumentLanguage = (language: string) => {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  document.title = i18n.t("app.pageTitle");
};

i18n.on("languageChanged", updateDocumentLanguage);
updateDocumentLanguage(i18n.language);

export default i18n;
