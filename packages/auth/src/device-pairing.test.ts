import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signedBearer } from "./account-security.js";
import { DEVICE_PAIRING_TTL_MS, devicePairing } from "./device-pairing.js";

const origin = "https://rakazo.example.test";
const secret = "offline-test-secret-with-at-least-32-characters";

function setup() {
  const db: Record<string, Record<string, unknown>[]> = {
    user: [],
    account: [],
    session: [],
    verification: [],
  };
  const auth = betterAuth({
    secret,
    baseURL: origin,
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [signedBearer, devicePairing()],
  });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, ...headers },
        body: JSON.stringify(body),
      }),
    );
  /** Signs up the owner and returns a bearer for their first device. */
  async function signUp() {
    const res = await post("/sign-up/email", {
      email: "owner@example.test",
      password: "correct horse battery staple",
      name: "Owner",
    });
    expect(res.status).toBe(200);
    return { Authorization: `Bearer ${res.headers.get("set-auth-token")}` };
  }
  async function createCode(headers: Record<string, string>) {
    const res = await post("/device-pairing/create", {}, headers);
    expect(res.status).toBe(200);
    const body = await res.json();
    if (typeof body !== "object" || body === null) throw new Error("no body");
    if (!("code" in body) || typeof body.code !== "string") throw new Error("no code");
    if (!("server" in body) || typeof body.server !== "string") throw new Error("no server");
    return { code: body.code, server: body.server };
  }
  return { db, auth, post, signUp, createCode };
}

describe("device pairing", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("signs a second device in as the same account, with a bearer that works", async () => {
    const { post, signUp, createCode, auth } = setup();
    const first = await signUp();
    const { code, server } = await createCode(first);
    expect(server).toBe(origin);

    const redeemed = await post("/device-pairing/redeem", { code });
    expect(redeemed.status).toBe(200);
    const token = redeemed.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    expect(await redeemed.json()).toMatchObject({ user: { email: "owner@example.test" } });

    const session = await auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${token}` }),
    });
    expect(session?.user.email).toBe("owner@example.test");
  });

  it("gives the new device its own session, so revoking one leaves the other", async () => {
    const { post, signUp, createCode, db } = setup();
    const first = await signUp();
    const { code } = await createCode(first);
    await post("/device-pairing/redeem", { code });
    expect(db.session).toHaveLength(2);
    expect(new Set(db.session!.map((s) => s.token)).size).toBe(2);
  });

  it("accepts a code only once", async () => {
    const { post, signUp, createCode } = setup();
    const { code } = await createCode(await signUp());
    expect((await post("/device-pairing/redeem", { code })).status).toBe(200);
    const replay = await post("/device-pairing/redeem", { code });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ code: "INVALID_PAIRING_CODE" });
  });

  it("lets only one of two devices that race for a code win", async () => {
    const { post, signUp, createCode } = setup();
    const { code } = await createCode(await signUp());
    const statuses = (
      await Promise.all([
        post("/device-pairing/redeem", { code }),
        post("/device-pairing/redeem", { code }),
      ])
    ).map((res) => res.status);
    expect(statuses.sort()).toEqual([200, 400]);
  });

  it("refuses a code after two minutes", async () => {
    const { post, signUp, createCode } = setup();
    const { code } = await createCode(await signUp());
    vi.setSystemTime(Date.now() + DEVICE_PAIRING_TTL_MS + 1_000);
    expect((await post("/device-pairing/redeem", { code })).status).toBe(400);
  });

  it("refuses codes that were never issued or are malformed", async () => {
    const { post, signUp, createCode } = setup();
    const { code } = await createCode(await signUp());
    const forged = `${code.slice(0, -1)}${code.endsWith("A") ? "B" : "A"}`;
    for (const bad of [forged, "short", "", "x".repeat(300)]) {
      expect((await post("/device-pairing/redeem", { code: bad })).status, bad).toBe(400);
    }
    // The real code is untouched by the failed guesses.
    expect((await post("/device-pairing/redeem", { code })).status).toBe(200);
  });

  it("needs a signed-in session to create a code", async () => {
    const { post } = setup();
    expect((await post("/device-pairing/create", {})).status).toBe(401);
  });

  it("stores only a hash, never the code", async () => {
    const { signUp, createCode, db } = setup();
    const { code } = await createCode(await signUp());
    expect(JSON.stringify(db.verification)).not.toContain(code);
  });
});
