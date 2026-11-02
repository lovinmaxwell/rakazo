import { t } from "@lingui/core/macro";
import type { DevicePairing } from "@rakazo/contracts";
import { devicePairingSchema } from "@rakazo/contracts";
import { readBoundedJsonResponse } from "@rakazo/core";
import { authErrorText } from "./user-error";

/** Asks the server for a short-lived code a phone can trade for its own sign-in. */
export async function createDevicePairing(): Promise<DevicePairing> {
  const response = await fetch("/api/auth/device-pairing/create", {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
  });
  let body: unknown;
  try {
    body = await readBoundedJsonResponse<unknown>(response, 64 * 1024);
  } catch {
    // Gateways may return HTML or an empty body.
  }
  if (!response.ok) throw new Error(authErrorText(body, t`Could not create a pairing code`));
  const parsed = devicePairingSchema.safeParse(body);
  // Electron ships this client independently of the connected API version.
  if (!parsed.success) throw new Error(t`This server does not support pairing a phone`);
  return parsed.data;
}

/** Trades a pairing code for a session of this browser, as signing in would. */
export async function redeemDevicePairing(code: string): Promise<void> {
  const response = await fetch("/api/auth/device-pairing/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(8_000),
  });
  if (response.ok) {
    await response.body?.cancel();
    return;
  }
  let body: unknown;
  try {
    body = await readBoundedJsonResponse<unknown>(response, 64 * 1024);
  } catch {
    // Gateways may return HTML or an empty body.
  }
  throw new Error(authErrorText(body, t`Could not pair this device`));
}
