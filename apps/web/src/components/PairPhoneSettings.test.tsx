// @vitest-environment jsdom
import { pairingLink } from "@rakazo/contracts";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDevicePairing } from "../lib/device-pairing";
import { PairPhoneSettings } from "./PairPhoneSettings";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@rakazo/ui-web", () => ({
  Button: ({
    variant: _variant,
    size: _size,
    ...props
  }: ComponentProps<"button"> & { variant?: string; size?: string }) => <button {...props} />,
}));
vi.mock("../lib/device-pairing", () => ({ createDevicePairing: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-11-02T10:00:00.000Z"));
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const code = "B".repeat(43);
const pairing = (server: string) => ({
  code,
  server,
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
});
const clickByText = (text: string) =>
  act(async () =>
    [...host.querySelectorAll("button")].find((button) => button.textContent === text)?.click(),
  );

it("shows a scannable code only after it is asked for, with a countdown", async () => {
  vi.mocked(createDevicePairing).mockResolvedValue(pairing("https://rakazo.example.test"));
  await act(async () => root.render(<PairPhoneSettings />));
  expect(createDevicePairing).not.toHaveBeenCalled();
  expect(host.querySelector("svg")).toBeNull();

  await clickByText("Show QR code");
  expect(createDevicePairing).toHaveBeenCalledOnce();
  expect(
    host.querySelector('svg[aria-label="QR code to pair a phone"] path')?.getAttribute("d"),
  ).toMatch(/^M\d+ \d+h1v1h-1z/);
  expect(host.textContent).toContain("Expires in 2:00");
  expect(host.textContent).toContain("https://rakazo.example.test");
  expect(host.querySelector('[data-testid="pair-phone-loopback"]')).toBeNull();

  await act(async () => vi.advanceTimersByTime(65_000));
  expect(host.textContent).toContain("Expires in 0:55");
});

it("copies the exact link the QR code carries", async () => {
  vi.mocked(createDevicePairing).mockResolvedValue(pairing("https://rakazo.example.test"));
  await act(async () => root.render(<PairPhoneSettings />));
  await clickByText("Show QR code");
  await clickByText("Copy link");
  expect(writeText).toHaveBeenCalledWith(
    pairingLink({ code, server: "https://rakazo.example.test" }),
  );
});

it("warns that a loopback address cannot be reached from a phone", async () => {
  vi.mocked(createDevicePairing).mockResolvedValue(pairing("http://127.0.0.1:5173"));
  await act(async () => root.render(<PairPhoneSettings />));
  await clickByText("Show QR code");
  expect(host.querySelector('[data-testid="pair-phone-loopback"]')?.textContent).toContain(
    "only works on this computer",
  );
});

it("retires the code when it expires and offers a new one", async () => {
  vi.mocked(createDevicePairing).mockResolvedValue(pairing("https://rakazo.example.test"));
  await act(async () => root.render(<PairPhoneSettings />));
  await clickByText("Show QR code");
  await act(async () => vi.advanceTimersByTime(121_000));
  expect(host.querySelector("svg")).toBeNull();
  expect(host.querySelector('[data-testid="pair-phone-expired"]')).not.toBeNull();

  vi.mocked(createDevicePairing).mockResolvedValue(pairing("https://rakazo.example.test"));
  await clickByText("New code");
  expect(host.querySelector("svg")).not.toBeNull();
  expect(host.querySelector('[data-testid="pair-phone-expired"]')).toBeNull();
});

it("shows the reason a code could not be made", async () => {
  vi.mocked(createDevicePairing).mockRejectedValue(
    new Error("This server does not support pairing a phone"),
  );
  await act(async () => root.render(<PairPhoneSettings />));
  await clickByText("Show QR code");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "This server does not support pairing a phone",
  );
  expect(host.querySelector("svg")).toBeNull();
});
