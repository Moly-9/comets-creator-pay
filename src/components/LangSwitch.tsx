import { useTranslation } from "react-i18next";
import { Globe2 } from "lucide-react";
import Select from "../Select";
import type { AppLanguage } from "../i18n";

export default function LangSwitch() {
  const { i18n, t } = useTranslation();
  const language: AppLanguage = i18n.resolvedLanguage === "zh" ? "zh" : "en";

  const switchLanguage = async (nextLanguage: AppLanguage) => {
    await i18n.changeLanguage(nextLanguage);
    try {
      localStorage.setItem("lang", nextLanguage);
    } catch {
      // Language still changes for this session when browser storage is unavailable.
    }
  };

  return (
    <span className="lang-switch">
      <Globe2 size={17} aria-hidden="true" />
      <Select value={language} onValueChange={(value) => void switchLanguage(value as AppLanguage)} aria-label={`${t("app.languageSwitch")}: ${t(language === "zh" ? "app.languageChinese" : "app.languageEnglish")}`}>
        <option value="en">English</option>
        <option value="zh">简体中文</option>
      </Select>
    </span>
  );
}
