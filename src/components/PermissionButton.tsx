import type { ButtonHTMLAttributes, ReactNode } from "react";

export default function PermissionButton({ allow, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { allow: boolean; children: ReactNode }) {
  return allow ? <button {...props}>{children}</button> : null;
}
