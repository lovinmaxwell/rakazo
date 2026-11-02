import * as z from "zod";

/** What `POST /api/auth/device-pairing/create` returns. */
export const devicePairingSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.iso.datetime(),
  /** The origin a phone has to reach. Loopback here means the phone cannot. */
  server: z.url(),
});
export type DevicePairing = z.infer<typeof devicePairingSchema>;

/** The scheme the mobile app registers, and the screen a pairing link opens. */
export const PAIRING_LINK_PREFIX = "rakazo://pair";

/** Builds the link a QR code carries. The phone's own camera app opens it in Rakazo. */
export function pairingLink(pairing: Pick<DevicePairing, "code" | "server">): string {
  const server = encodeURIComponent(new URL(pairing.server).origin);
  return `${PAIRING_LINK_PREFIX}?server=${server}&code=${encodeURIComponent(pairing.code)}`;
}

/**
 * Reads a pairing link, or returns null for anything else. Parsed by hand: React Native's URL
 * implementation does not support `searchParams` on custom schemes.
 */
export function parsePairingLink(link: string): Pick<DevicePairing, "code" | "server"> | null {
  const trimmed = link.trim();
  if (!trimmed.toLowerCase().startsWith(`${PAIRING_LINK_PREFIX}?`)) return null;
  const params = new Map<string, string>();
  for (const part of trimmed.slice(PAIRING_LINK_PREFIX.length + 1).split("&")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    try {
      params.set(part.slice(0, at), decodeURIComponent(part.slice(at + 1)));
    } catch {
      return null;
    }
  }
  const code = params.get("code");
  const server = params.get("server");
  if (!code || !server || !/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  try {
    const url = new URL(server);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { code, server: url.origin };
  } catch {
    return null;
  }
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
