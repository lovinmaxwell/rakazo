import { describe, expect, it } from "vitest";
import {
  appPairingLink,
  devicePairingSchema,
  isLoopbackOrigin,
  pairingLink,
  parsePairingLink,
} from "./device-pairing.js";

const code = "A".repeat(43);
const target = { code, server: "https://rakazo.example.test:8443" };

describe("pairing links", () => {
  it("keeps the code in the fragment of a plain web address", () => {
    const link = pairingLink({
      ...target,
      server: "https://rakazo.example.test:8443/ignored/path",
    });
    expect(link).toBe(`https://rakazo.example.test:8443/pair#code=${code}`);
    expect(new URL(link).search).toBe("");
  });

  it("round-trips both forms of link to the same code and server", () => {
    expect(parsePairingLink(pairingLink(target))).toEqual(target);
    expect(parsePairingLink(appPairingLink(target))).toEqual(target);
    expect(appPairingLink(target)).toBe(
      `rakazo://pair?server=${encodeURIComponent(target.server)}&code=${code}`,
    );
  });

  it("reads a link pasted with surrounding whitespace, a trailing slash or any parameter order", () => {
    expect(parsePairingLink(`  http://192.168.1.5:5173/pair/#code=${code}  `)).toEqual({
      code,
      server: "http://192.168.1.5:5173",
    });
    expect(
      parsePairingLink(`rakazo://pair?code=${code}&server=http%3A%2F%2F192.168.1.5%3A5173`),
    ).toEqual({ code, server: "http://192.168.1.5:5173" });
  });

  it.each([
    ["another page", `https://a.test/sign-in#code=${code}`],
    ["a code in the query, which is sent to servers", `https://a.test/pair?code=${code}`],
    ["a missing code", "https://a.test/pair#"],
    ["a short code", "https://a.test/pair#code=abc"],
    ["a non-web address", `ftp://a.test/pair#code=${code}`],
    ["another app screen", `rakazo://thread?server=https%3A%2F%2Fa.test&code=${code}`],
    ["an app link without a server", `rakazo://pair?code=${code}`],
    ["an app link to a non-web server", `rakazo://pair?server=ftp%3A%2F%2Fa.test&code=${code}`],
    ["an app link with a bad escape", `rakazo://pair?server=%E0%A4%A&code=${code}`],
    ["plain text", "hello"],
  ])("rejects %s", (_label, link) => {
    expect(parsePairingLink(link)).toBeNull();
  });

  it("validates what the server returns", () => {
    const body = { code, expiresAt: "2026-11-02T10:00:00.000Z", server: "https://a.test" };
    expect(devicePairingSchema.parse(body)).toEqual(body);
    expect(devicePairingSchema.safeParse({ ...body, code: "short" }).success).toBe(false);
  });
});

describe("isLoopbackOrigin", () => {
  it.each([
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://[::1]:5173",
    "http://0.0.0.0",
  ])("flags %s", (origin) => expect(isLoopbackOrigin(origin)).toBe(true));
  it.each(["https://rakazo.example.test", "http://192.168.1.46:5173", "http://mac.local:5173"])(
    "allows %s",
    (origin) => expect(isLoopbackOrigin(origin)).toBe(false),
  );
});
