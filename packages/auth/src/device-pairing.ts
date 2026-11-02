import { createHash, randomBytes } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

/** A pairing code lives for two minutes: long enough to scan, short enough to forget. */
export const DEVICE_PAIRING_TTL_MS = 2 * 60_000;
export const DEVICE_PAIRING_CREATE_PATH = "/device-pairing/create";
export const DEVICE_PAIRING_REDEEM_PATH = "/device-pairing/redeem";

const CODE_BYTES = 32;
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The code is a bearer secret, so only its hash is stored. */
const identifierFor = (code: string) =>
  `device-pairing-${createHash("sha256").update(code).digest("hex")}`;

/**
 * Signs a new device in without typing a password. A signed-in session asks for a short-lived,
 * single-use code, shows it as a QR link, and the new device trades it for a session of its own.
 * The code is bound to the account that created it and never survives its first redemption.
 */
export function devicePairing(): BetterAuthPlugin {
  return {
    id: "device-pairing",
    endpoints: {
      createDevicePairing: createAuthEndpoint(
        DEVICE_PAIRING_CREATE_PATH,
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const code = randomBytes(CODE_BYTES).toString("base64url");
          const expiresAt = new Date(Date.now() + DEVICE_PAIRING_TTL_MS);
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: identifierFor(code),
            value: ctx.context.session.user.id,
            expiresAt,
          });
          return ctx.json({
            code,
            expiresAt: expiresAt.toISOString(),
            // The origin a device must reach, so a client can warn when it is a loopback address.
            server: new URL(ctx.context.baseURL).origin,
          });
        },
      ),
      redeemDevicePairing: createAuthEndpoint(
        DEVICE_PAIRING_REDEEM_PATH,
        { method: "POST" },
        async (ctx) => {
          const invalid = () =>
            new APIError("BAD_REQUEST", {
              message: "This pairing code is invalid or has expired",
              code: "INVALID_PAIRING_CODE",
            });
          const code = ctx.body && typeof ctx.body === "object" ? ctx.body.code : undefined;
          if (typeof code !== "string" || !CODE_PATTERN.test(code)) throw invalid();
          const adapter = ctx.context.internalAdapter;
          // Consuming is atomic: two devices racing for one code cannot both win.
          const proof = await adapter.consumeVerificationValue(identifierFor(code));
          if (!proof || proof.expiresAt.getTime() <= Date.now()) throw invalid();
          const user = await adapter.findUserById(proof.value);
          if (!user) throw invalid();
          const session = await adapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ token: session.token, user });
        },
      ),
    },
  };
}
