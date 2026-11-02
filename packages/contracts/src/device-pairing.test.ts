import { describe, expect, it } from "vitest";
import {
  devicePairingSchema,
  isLoopbackOrigin,
  pairingLink,
  parsePairingLink,
} from "./device-pairing.js";

const code = "A".repeat(43);

describe("pairing links", () => {
  it("round-trips a code and the server origin", () => {
    const link = pairingLink({ code, server: "https://rakazo.example.test:8443/ignored/path" });
    expect(link).toBe(
      `rakazo://pair?server=${encodeURIComponent("https://rakazo.example.test:8443")}&code=${code}`,
    );
    expect(parsePairingLink(link)).toEqual({ code, server: "https://rakazo.example.test:8443" });
  });

  it("reads a link pasted with surrounding whitespace and in any parameter order", () => {
    const link = `  rakazo://pair?code=${code}&server=http%3A%2F%2F192.168.1.5%3A5173  `;
    expect(parsePairingLink(link)).toEqual({ code, server: "http://192.168.1.5:5173" });
  });

  it.each([
    ["another scheme", `https://pair?server=https%3A%2F%2Fa.test&code=${code}`],
    ["another screen", `rakazo://thread?server=https%3A%2F%2Fa.test&code=${code}`],
    ["a missing code", "rakazo://pair?server=https%3A%2F%2Fa.test"],
    ["a short code", "rakazo://pair?server=https%3A%2F%2Fa.test&code=abc"],
    ["a non-web server", `rakazo://pair?server=ftp%3A%2F%2Fa.test&code=${code}`],
    ["an unparseable server", `rakazo://pair?server=not-a-url&code=${code}`],
    ["a bad escape", `rakazo://pair?server=%E0%A4%A&code=${code}`],
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
