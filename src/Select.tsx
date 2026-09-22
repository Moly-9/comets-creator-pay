import { Children, isValidElement, useEffect, useId, useRef, useState, type OptionHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { displayCopy } from "./display-copy";

type Choice = { value: string; label: string; disabled: boolean };

type Props = {
  value: string | number;
  onValueChange(value: string): void;
  children: ReactNode;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  name?: string;
  onBlur?: () => void;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

function optionText(content: ReactNode): string {
  return Children.toArray(content).map((part) => typeof part === "string" || typeof part === "number" ? String(part) : isValidElement<{ children?: ReactNode }>(part) ? optionText(part.props.children) : "").join("");
}

export default function Select({ value, onValueChange, children, disabled, required, className, name, onBlur, ...aria }: Props) {
  const { t } = useTranslation();
  const choices: Choice[] = Children.toArray(children).filter(isValidElement).map((child) => {
    const props = child.props as OptionHTMLAttributes<HTMLOptionElement>;
    return { value: String(props.value ?? optionText(props.children)), label: displayCopy(props.label || optionText(props.children), t), disabled: Boolean(props.disabled) };
  });
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 240 });
  const selected = choices.find((choice) => choice.value === String(value));

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const height = Math.max(80, Math.min(260, Math.max(below, above) - 8));
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
      const upwards = below < Math.min(220, height) && above > below;
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: upwards ? Math.max(8, rect.top - Math.min(height, (choices.length * 40) + 12) - 6) : rect.bottom + 6, width, maxHeight: height });
    };
    const outside = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, choices.length]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const selectable = choices.map((choice, index) => !choice.disabled ? index : -1).filter((index) => index >= 0);
  function move(direction: number) {
    if (!selectable.length) return;
    const current = selectable.indexOf(active);
    setActive(selectable[(current + direction + selectable.length) % selectable.length]);
  }
  function choose(index: number) {
    if (choices[index]?.disabled) return;
    onValueChange(choices[index].value);
    setOpen(false);
    anchor.current?.focus();
  }

  return <span className={`comets-select${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}>
    <button
      ref={anchor}
      type="button"
      className="comets-select-trigger"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      aria-activedescendant={open ? `${id}-${active}` : undefined}
      aria-required={required || undefined}
      aria-label={aria["aria-label"]}
      aria-invalid={aria["aria-invalid"]}
      aria-describedby={aria["aria-describedby"]}
      disabled={disabled}
      onBlur={onBlur}
      onClick={() => { setActive(Math.max(0, choices.findIndex((choice) => choice.value === String(value) && !choice.disabled))); setOpen(!open); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); return; }
        if (event.key === "Tab") { setOpen(false); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (!open) { setActive(Math.max(0, choices.findIndex((choice) => choice.value === String(value) && !choice.disabled))); setOpen(true); }
          else move(event.key === "ArrowDown" ? 1 : -1);
        } else if (open && (event.key === "Home" || event.key === "End")) {
          event.preventDefault(); setActive(event.key === "Home" ? selectable[0] : selectable[selectable.length - 1]);
        } else if (open && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault(); choose(active);
        }
      }}
    ><span className="comets-select-value">{selected?.label || t("select.choose")}</span><ChevronDown size={15} aria-hidden="true" /></button>
    {required ? <select className="comets-select-validation" tabIndex={-1} aria-hidden="true" required value={String(value)} disabled={disabled} onChange={() => {}} onInvalid={(event) => { event.preventDefault(); anchor.current?.focus(); setOpen(true); }}>
      {!choices.some((choice) => choice.value === "") ? <option value="" /> : null}
      {choices.map((choice, index) => <option key={`${choice.value}-${index}`} value={choice.value} disabled={choice.disabled}>{choice.label}</option>)}
    </select> : null}
    {name ? <input type="hidden" name={name} value={String(value)} /> : null}
    {open && createPortal(<div ref={menu} id={id} role="listbox" aria-label={aria["aria-label"] || selected?.label || t("select.chooseOption")} className="comets-select-menu" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
      {choices.map((choice, index) => <div key={`${choice.value}-${index}`} id={`${id}-${index}`} data-option-index={index} role="option" aria-selected={choice.value === String(value)} aria-disabled={choice.disabled || undefined} className={`comets-select-option${choice.value === String(value) ? " is-selected" : ""}${index === active ? " is-active" : ""}${choice.disabled ? " is-disabled" : ""}`} onPointerMove={(event) => { if (event.pointerType === "mouse" && !choice.disabled) setActive(index); }} onPointerDown={(event) => { if (event.pointerType === "mouse") event.preventDefault(); }} onClick={() => choose(index)}>{choice.label}{choice.value === String(value) && <Check size={15} aria-hidden="true" />}</div>)}
    </div>, document.body)}
  </span>;
}
