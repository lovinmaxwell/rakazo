import * as z from "zod";

/** What `POST /api/auth/device-pairing/create` returns. */
export const devicePairingSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.iso.datetime(),
  /** The origin a phone has to reach. Loopback here means the phone cannot. */
  server: z.url(),
});
export type DevicePairing = z.infer<typeof devicePairingSchema>;

export interface PairingTarget {
  code: string;
  server: string;
}

/** The web page a pairing QR code opens. It offers the app, or signing in in the browser. */
export const PAIRING_WEB_PATH = "/pair";
/** The mobile app's own link, for the page's "Open in the app" button. */
export const PAIRING_APP_PREFIX = "rakazo://pair";

const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The link a QR code carries: an ordinary web address, so every camera app opens it. The code
 * rides in the fragment, which browsers never send, so it stays out of server and proxy logs.
 */
export function pairingLink({ code, server }: PairingTarget): string {
  return `${new URL(server).origin}${PAIRING_WEB_PATH}#code=${encodeURIComponent(code)}`;
}

/** The mobile app's deep link for the same pairing. */
export function appPairingLink({ code, server }: PairingTarget): string {
  const origin = encodeURIComponent(new URL(server).origin);
  return `${PAIRING_APP_PREFIX}?server=${origin}&code=${encodeURIComponent(code)}`;
}

/** Splits `a=1&b=2` by hand: React Native's URL does not implement `searchParams`. */
function parseParams(query: string): Map<string, string> | null {
  const params = new Map<string, string>();
  for (const part of query.split("&")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    try {
      params.set(part.slice(0, at), decodeURIComponent(part.slice(at + 1)));
    } catch {
      return null;
    }
  }
  return params;
}

function webOrigin(server: string): string | null {
  try {
    const url = new URL(server);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Reads either form of pairing link, or returns null for anything else. The web form takes its
 * server from the address itself, so a pasted link needs nothing else.
 */
export function parsePairingLink(link: string): PairingTarget | null {
  const trimmed = link.trim();
  if (trimmed.toLowerCase().startsWith(`${PAIRING_APP_PREFIX}?`)) {
    const params = parseParams(trimmed.slice(PAIRING_APP_PREFIX.length + 1));
    const code = params?.get("code");
    const server = webOrigin(params?.get("server") ?? "");
    return code && CODE_PATTERN.test(code) && server ? { code, server } : null;
  }
  const hash = trimmed.indexOf("#");
  if (hash < 0) return null;
  const origin = webOrigin(trimmed.slice(0, hash));
  if (!origin) return null;
  const url = new URL(trimmed.slice(0, hash));
  if (url.pathname.replace(/\/+$/, "") !== PAIRING_WEB_PATH) return null;
  const code = parseParams(trimmed.slice(hash + 1))?.get("code");
  return code && CODE_PATTERN.test(code) ? { code, server: origin } : null;
}

/** True for an origin only the machine itself can reach, so a phone cannot use it. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || /^127\./.test(host) || host === "0.0.0.0";
  } catch {
    return false;
  }
}
