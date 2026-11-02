import { Trans, useLingui } from "@lingui/react/macro";
import type { DevicePairing } from "@rakazo/contracts";
import { isLoopbackOrigin, pairingLink } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { encode } from "uqr";
import { createDevicePairing } from "../lib/device-pairing";
import { SettingsGroup, SettingsRow } from "./SettingsRows";

/** A QR code as inline SVG: one path, no raster image, nothing for the page's CSP to block. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { path, size } = useMemo(() => {
    const { data, size } = encode(text, { ecc: "M", border: 2 });
    let path = "";
    data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) path += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { path, size };
  }, [text]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-48 rounded-lg bg-white"
    >
      <path d={path} fill="#000" />
    </svg>
  );
}

function secondsUntil(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));
}

export function PairPhoneSettings() {
  const { t } = useLingui();
  const [pairing, setPairing] = useState<DevicePairing | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!pairing) return;
    setSecondsLeft(secondsUntil(pairing.expiresAt));
    const timer = setInterval(() => setSecondsLeft(secondsUntil(pairing.expiresAt)), 1_000);
    return () => clearInterval(timer);
  }, [pairing]);

  async function show() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      setPairing(await createDevicePairing());
    } catch (cause) {
      setPairing(null);
      setError(cause instanceof Error ? cause.message : t`Could not create a pairing code`);
    } finally {
      setPending(false);
    }
  }

  const live = pairing !== null && secondsLeft > 0;
  const link = live ? pairingLink(pairing) : null;

  return (
    <SettingsGroup title={<Trans>Phone</Trans>}>
      <SettingsRow
        label={<Trans>Pair a phone</Trans>}
        control={
          <Button
            variant="secondary"
            size="sm"
            data-testid="pair-phone"
            disabled={pending}
            onClick={() => void show()}
          >
            {pairing ? <Trans>New code</Trans> : <Trans>Show QR code</Trans>}
          </Button>
        }
      >
        <p className="mt-1 text-[13px] text-muted-foreground">
          <Trans>
            Scan with your phone's camera and open the link in Rakazo to sign in without typing a
            password. Each code works once and expires after two minutes.
          </Trans>
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        {pairing && link ? (
          <div className="mt-3 flex flex-wrap items-start gap-4" data-testid="pair-phone-panel">
            <QrCode text={link} label={t`QR code to pair a phone`} />
            <div className="min-w-0 flex-1 space-y-2 text-[13px]">
              <p className="text-muted-foreground" data-testid="pair-phone-countdown">
                <Trans>
                  Expires in {Math.floor(secondsLeft / 60)}:
                  {String(secondsLeft % 60).padStart(2, "0")}
                </Trans>
              </p>
              {isLoopbackOrigin(pairing.server) ? (
                <p role="alert" className="text-destructive" data-testid="pair-phone-loopback">
                  <Trans>
                    This server's address ({pairing.server}) only works on this computer. Set
                    WEB_ORIGIN to an address your phone can reach, such as a Tailscale or LAN
                    address, and restart.
                  </Trans>
                </p>
              ) : (
                <p className="break-all text-muted-foreground">{pairing.server}</p>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(link).then(() => setCopied(true));
                }}
              >
                {copied ? <Trans>Copied</Trans> : <Trans>Copy link</Trans>}
              </Button>
            </div>
          </div>
        ) : null}
        {pairing && !live ? (
          <p className="mt-2 text-[13px] text-muted-foreground" data-testid="pair-phone-expired">
            <Trans>This code expired. Choose New code to make another.</Trans>
          </p>
        ) : null}
      </SettingsRow>
    </SettingsGroup>
  );
}
