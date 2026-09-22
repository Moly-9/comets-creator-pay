import type { FileRef } from "./types";

/** Local prototype only; a production invitation is validated server-side. */
export const DEMO_INVITATION_CODE = "COMETS-DEMO-2026";

export const demonstrationRegistrationValues = () => ({
  email: `creator.demo+${Date.now().toString(36)}@example.com`,
  password: "Creator2026",
  invitationCode: DEMO_INVITATION_CODE,
});

export const DEMO_SOCIAL_URL = "https://www.youtube.com/@CometsDemoCreator";

export const DEMO_SOCIAL_SCREENSHOT: FileRef = {
  id: "demo-social-console-v1",
  name: "演示社媒后台截图.svg（仅供原型体验）",
  mimeType: "image/svg+xml",
  size: 2271,
  previewUrl: "/demo-social-console.svg",
};

export const fillEmptyFields = <T extends Record<string, string>>(current: T, examples: Partial<T>): T => {
  const next = { ...current };
  for (const key of Object.keys(examples) as Array<keyof T>) {
    if (!next[key]?.trim() && examples[key]) next[key] = examples[key]!;
  }
  return next;
};
