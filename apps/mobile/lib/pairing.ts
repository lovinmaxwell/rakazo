import type { PairingTarget } from "@rakazo/contracts";
import { parsePairingLink } from "@rakazo/contracts";
import { redeemPairingCode, saveApiBase } from "./api";
import { probeApiBase } from "./endpoint";
import { t } from "./i18n";
import { errorText } from "./user-error";

export type PairResult = { ok: true } | { ok: false; error: string };

/** The pairing in a deep link's parameters or in a link pasted by hand, or null for neither. */
export function pairingFrom(params: {
  server?: string | string[];
  code?: string | string[];
  link?: string;
}): PairingTarget | null {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? "";
  if (params.link?.trim()) return parsePairingLink(params.link);
  const server = first(params.server);
  const code = first(params.code);
  return server && code
    ? parsePairingLink(
        `rakazo://pair?server=${encodeURIComponent(server)}&code=${encodeURIComponent(code)}`,
      )
    : null;
}

/**
 * Points this phone at the server that made the code and signs in with it. The server is checked
 * before anything on the phone changes. Switching servers signs the phone out of the old one, so
 * callers confirm with the person first.
 */
export async function pairThisPhone(target: PairingTarget): Promise<PairResult> {
  const probed = await probeApiBase(target.server);
  if (!probed.ok) return probed;
  const saved = await saveApiBase(probed.url);
  if (!saved.ok) return saved;
  try {
    await redeemPairingCode(target.code);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorText(error, t("Could not pair this phone")) };
  }
}
