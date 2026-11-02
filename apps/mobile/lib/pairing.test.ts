import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ redeemPairingCode: vi.fn(), saveApiBase: vi.fn() }));
vi.mock("./endpoint", () => ({ probeApiBase: vi.fn() }));

import { redeemPairingCode, saveApiBase } from "./api";
import { probeApiBase } from "./endpoint";
import { pairingFrom, pairThisPhone } from "./pairing";

const code = "D".repeat(43);
const target = { code, server: "https://rakazo.example.test" };

beforeEach(() => vi.clearAllMocks());

describe("pairThisPhone", () => {
  it("checks the server, then switches to it, then signs in", async () => {
    const order: string[] = [];
    vi.mocked(probeApiBase).mockImplementation(async (url) => {
      order.push("probe");
      return { ok: true, url };
    });
    vi.mocked(saveApiBase).mockImplementation(async (url) => {
      order.push("save");
      return { ok: true, url };
    });
    vi.mocked(redeemPairingCode).mockImplementation(async () => {
      order.push("redeem");
      return { verificationRequired: false };
    });
    expect(await pairThisPhone(target)).toEqual({ ok: true });
    expect(order).toEqual(["probe", "save", "redeem"]);
    expect(saveApiBase).toHaveBeenCalledWith("https://rakazo.example.test");
    expect(redeemPairingCode).toHaveBeenCalledWith(code);
  });

  it("leaves the phone alone when the server cannot be reached", async () => {
    vi.mocked(probeApiBase).mockResolvedValue({ ok: false, error: "Could not reach that server" });
    expect(await pairThisPhone(target)).toEqual({
      ok: false,
      error: "Could not reach that server",
    });
    expect(saveApiBase).not.toHaveBeenCalled();
    expect(redeemPairingCode).not.toHaveBeenCalled();
  });

  it("does not spend the code when the server cannot be saved", async () => {
    vi.mocked(probeApiBase).mockResolvedValue({ ok: true, url: target.server });
    vi.mocked(saveApiBase).mockResolvedValue({ ok: false, error: "Could not save the server URL" });
    expect(await pairThisPhone(target)).toEqual({
      ok: false,
      error: "Could not save the server URL",
    });
    expect(redeemPairingCode).not.toHaveBeenCalled();
  });

  it("reports why a code was refused", async () => {
    vi.mocked(probeApiBase).mockResolvedValue({ ok: true, url: target.server });
    vi.mocked(saveApiBase).mockResolvedValue({ ok: true, url: target.server });
    vi.mocked(redeemPairingCode).mockRejectedValue(
      new Error("This pairing code is invalid or has expired"),
    );
    expect(await pairThisPhone(target)).toEqual({
      ok: false,
      error: "This pairing code is invalid or has expired",
    });
  });
});

describe("pairingFrom", () => {
  it("reads the parameters of a deep link, even when the router hands back arrays", () => {
    expect(pairingFrom({ server: target.server, code })).toEqual(target);
    expect(pairingFrom({ server: [target.server], code: [code] })).toEqual(target);
  });

  it("reads a link pasted by hand in either form", () => {
    expect(pairingFrom({ link: `https://rakazo.example.test/pair#code=${code}` })).toEqual(target);
    expect(
      pairingFrom({ link: `rakazo://pair?server=https%3A%2F%2Frakazo.example.test&code=${code}` }),
    ).toEqual(target);
  });

  it.each([
    ["nothing", {}],
    ["a server without a code", { server: target.server }],
    ["a short code", { server: target.server, code: "abc" }],
    ["a pasted link that is not a pairing link", { link: "https://example.test/other" }],
  ])("returns null for %s", (_label, params) => {
    expect(pairingFrom(params)).toBeNull();
  });
});
