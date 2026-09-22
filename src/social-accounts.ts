import type { SocialAccount, UserProfile } from "./types";

export interface AddSocialAccountInput {
  creatorId: string;
  profileUrl: string;
  screenshots: File[];
}

export class SocialAccountError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SocialAccountError";
  }
}

export const normalizeSocialProfileUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) throw new Error("invalid");
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href.replace(/\/$/, "");
  } catch {
    throw new SocialAccountError("invalidUrl");
  }
};

export const validateSocialAccountAddition = (social: SocialAccount, input: AddSocialAccountInput) => {
  const url = normalizeSocialProfileUrl(input.profileUrl);
  const existing = social.profileUrls?.length ? social.profileUrls : [social.profileUrl];
  if (existing.some((value) => {
    try { return normalizeSocialProfileUrl(value).toLowerCase() === url.toLowerCase(); }
    catch { return value.trim().toLowerCase() === url.toLowerCase(); }
  })) throw new SocialAccountError("duplicateUrl");
  if (!input.screenshots.length) throw new SocialAccountError("screenshotsRequired");
  if (input.screenshots.length > 6) throw new SocialAccountError("tooManyScreenshots");
  for (const file of input.screenshots) {
    if (!["image/png", "image/jpeg"].includes(file.type)) throw new SocialAccountError("invalidScreenshotType");
    if (!file.size || file.size > 8 * 1024 * 1024) throw new SocialAccountError("invalidScreenshotSize");
  }
  return url;
};

export const socialProfileIsDemoVerified = (social: SocialAccount, url: string) =>
  social.verificationByProfileUrl?.[url]?.status === "DEMO_VERIFIED";

/** Keep all unsubmitted contact/payout edits when an independent social command completes. */
export const mergeAddedSocialAccount = (draft: UserProfile, saved: UserProfile): UserProfile => ({
  ...draft,
  social: saved.social,
});
