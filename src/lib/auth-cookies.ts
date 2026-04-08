export const CUSTOM_SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-haccp-online.session-token"
    : "haccp-online.session-token";

export const LEGACY_SESSION_COOKIES = [
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

export const ALL_SESSION_COOKIES = [
  CUSTOM_SESSION_COOKIE,
  ...LEGACY_SESSION_COOKIES,
];

export const LEGACY_AUX_COOKIES = [
  "__Host-next-auth.csrf-token",
  "next-auth.csrf-token",
  "__Secure-next-auth.callback-url",
  "next-auth.callback-url",
];
