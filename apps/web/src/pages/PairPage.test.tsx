// @vitest-environment jsdom
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { redeemDevicePairing } from "../lib/device-pairing";
import { PairPage } from "./PairPage";

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
vi.mock("./Auth", () => ({
  submitClass: "",
  AuthFrame: ({
    title,
    onSubmit,
    children,
  }: {
    title: ReactNode;
    onSubmit: (event: FormEvent) => void;
    children: ReactNode;
  }) => (
    <form onSubmit={onSubmit}>
      <h1>{title}</h1>
      {children}
    </form>
  ),
}));
vi.mock("../lib/device-pairing", () => ({ redeemDevicePairing: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
const assign = vi.fn();
const code = "C".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign },
    configurable: true,
    writable: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function open(url: string) {
  const parsed = new URL(url);
  Object.assign(window.location, {
    href: parsed.href,
    origin: parsed.origin,
    pathname: parsed.pathname,
    hash: parsed.hash,
  });
  window.history.replaceState = vi.fn();
  return act(async () =>
    root.render(
      <MemoryRouter>
        <PairPage />
      </MemoryRouter>,
    ),
  );
}

it("does nothing on load, so a link preview cannot spend the code", async () => {
  await open(`https://rakazo.example.test/pair#code=${code}`);
  expect(redeemDevicePairing).not.toHaveBeenCalled();
  expect(host.querySelector('[data-testid="pair-open-app"]')?.getAttribute("href")).toBe(
    `rakazo://pair?server=${encodeURIComponent("https://rakazo.example.test")}&code=${code}`,
  );
});

it("removes the code from the address bar once read", async () => {
  await open(`https://rakazo.example.test/pair#code=${code}`);
  expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/pair");
});

it("signs this browser in with the code, then opens the app", async () => {
  vi.mocked(redeemDevicePairing).mockResolvedValue();
  await open(`https://rakazo.example.test/pair#code=${code}`);
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-testid="pair-sign-in-browser"]')?.click(),
  );
  expect(redeemDevicePairing).toHaveBeenCalledExactlyOnceWith(code);
  expect(assign).toHaveBeenCalledWith("/app");
});

it("shows why a code was refused and stays on the page", async () => {
  vi.mocked(redeemDevicePairing).mockRejectedValue(
    new Error("This pairing code is invalid or has expired"),
  );
  await open(`https://rakazo.example.test/pair#code=${code}`);
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-testid="pair-sign-in-browser"]')?.click(),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "This pairing code is invalid or has expired",
  );
  expect(assign).not.toHaveBeenCalled();
});

it.each([
  ["no code", "https://rakazo.example.test/pair"],
  ["a malformed code", "https://rakazo.example.test/pair#code=short"],
])("explains a link with %s", async (_label, url) => {
  await open(url);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("invalid or has expired");
  expect(host.querySelector('[data-testid="pair-open-app"]')).toBeNull();
});
