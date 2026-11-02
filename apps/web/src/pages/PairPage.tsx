import { Trans, useLingui } from "@lingui/react/macro";
import { appPairingLink, parsePairingLink } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { redeemDevicePairing } from "../lib/device-pairing";
import { AuthFrame, submitClass } from "./Auth";

/**
 * Where a pairing QR code lands. Nothing happens on load, so a link preview that fetches the
 * address cannot spend the code: the person picks the app or this browser.
 */
export function PairPage() {
  const { t } = useLingui();
  const [target] = useState(() => parsePairingLink(window.location.href));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The code is a credential: keep it out of history and the address bar once read.
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function signInHere(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      await redeemDevicePairing(target.code);
      window.location.assign("/app");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t`Could not pair this device`);
      setPending(false);
    }
  }

  if (!target) {
    return (
      <AuthFrame onSubmit={(event) => event.preventDefault()} title={<Trans>Pair a phone</Trans>}>
        <p role="alert" className="w-full text-center text-sm text-destructive">
          <Trans>This pairing link is invalid or has expired.</Trans>
        </p>
        <Link to="/sign-in" className="mt-6 font-medium">
          <Trans>Sign in</Trans>
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame onSubmit={(event) => void signInHere(event)} title={<Trans>Sign in here</Trans>}>
      <p className="mb-6 w-full text-center text-sm text-muted-foreground">
        <Trans>Another device you're signed in on made this code. It works once.</Trans>
      </p>
      <a
        href={appPairingLink(target)}
        data-testid="pair-open-app"
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-medium text-primary-foreground"
      >
        <Trans>Open in the Rakazo app</Trans>
      </a>
      <Button
        type="submit"
        variant="secondary"
        size="lg"
        disabled={pending}
        className={submitClass}
        data-testid="pair-sign-in-browser"
      >
        {pending ? <Trans>Working…</Trans> : <Trans>Sign in in this browser</Trans>}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AuthFrame>
  );
}
