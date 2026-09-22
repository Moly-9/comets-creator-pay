import type { AirwallexTransferMethodOption } from "./types";
import { useTranslation } from "react-i18next";

interface ProfileTransferMethodsProps {
  idPrefix?: string;
  methods: AirwallexTransferMethodOption[];
  selectedValue: AirwallexTransferMethodOption["value"];
  editing: boolean;
  expanded: boolean;
  loading: boolean;
  error: string;
  onSelect(value: AirwallexTransferMethodOption["value"]): void;
  onExpandedChange(expanded: boolean): void;
}

export default function ProfileTransferMethods({
  idPrefix = "profile-transfer-method",
  methods,
  selectedValue,
  editing,
  expanded,
  loading,
  error,
  onSelect,
  onExpandedChange,
}: ProfileTransferMethodsProps) {
  const { t } = useTranslation();
  const availableMethods = methods.filter((method) => method.available);
  const selectedMethod = availableMethods.find((method) => method.value === selectedValue);
  const visibleMethods = editing && expanded ? availableMethods : selectedMethod ? [selectedMethod] : [];

  return (
    <fieldset className="profile-transfer-method-field" aria-labelledby={`${idPrefix}-label`}>
      <div className="profile-transfer-method-toolbar">
        <span id={`${idPrefix}-label`}>{t("profile.transferMethod")}</span>
        {!loading && !error && editing && selectedMethod && availableMethods.length > 1 ? (
          <button
            type="button"
            className="profile-transfer-method-change"
            aria-expanded={expanded}
            aria-controls={`${idPrefix}-options`}
            onClick={() => onExpandedChange(!expanded)}
          >
            {expanded ? t("profile.collapseOptions") : t("profile.changeMethod")}
          </button>
        ) : null}
      </div>
      {loading ? <p className="profile-transfer-method-message" role="status">{t("profile.loadingMethods")}</p> : null}
      {!loading && error ? <p className="profile-transfer-method-message is-error" role="alert">{error}</p> : null}
      {!loading && !error && !availableMethods.length ? (
        <p className="profile-transfer-method-message is-error" role="alert">{t("profile.noMethods")}</p>
      ) : null}
      {!loading && !error && availableMethods.length && !selectedMethod ? (
        <p className="profile-transfer-method-message" role="status">{t("profile.resolvingMethod")}</p>
      ) : null}
      {!loading && !error && selectedMethod ? (
        <div id={`${idPrefix}-options`} className="profile-transfer-method-options">
          {visibleMethods.map((method) => {
            const selected = method.value === selectedValue;
            const content = (
              <>
                <span className="profile-transfer-method-heading">
                  <strong>{t(method.value === "LOCAL" ? "profile.localMethodName" : "profile.swiftMethodName")}</strong>
                  <span className="profile-transfer-method-badges">
                    {method.recommended ? <span className="is-recommended">{t("profile.lowestFee")}</span> : null}
                    {selected ? <span className="is-selected">{t("profile.selected")}</span> : null}
                  </span>
                </span>
                <span className="profile-transfer-method-description">{t(method.value === "LOCAL" ? "profile.localTransfer" : "profile.internationalTransfer")}</span>
                <span className="profile-transfer-method-meta">
                  {t("profile.estimatedFee")}<strong>{method.estimatedFeeAmount.toFixed(2)} {method.feeCurrency}</strong>
                  <span aria-hidden="true">·</span>
                  {t("profile.estimatedArrival")}<strong>{t("profile.businessDays", { min: method.arrivalMinBusinessDays, max: method.arrivalMaxBusinessDays })}</strong>
                </span>
              </>
            );

            return editing && expanded ? (
              <label key={method.value} className={`profile-transfer-method-card is-editable${selected ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name={idPrefix}
                  value={method.value}
                  checked={selected}
                  onChange={() => onSelect(method.value)}
                />
                {content}
              </label>
            ) : (
              <div key={method.value} className={`profile-transfer-method-card${selected ? " is-selected" : ""}`}>
                {content}
              </div>
            );
          })}
        </div>
      ) : null}
      {!loading && !error && selectedMethod ? (
        <p className="profile-transfer-method-disclaimer">{t("profile.estimateNotice")}</p>
      ) : null}
    </fieldset>
  );
}
