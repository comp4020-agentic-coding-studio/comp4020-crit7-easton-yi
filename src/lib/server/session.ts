import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AstroCookies } from "astro";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { sessions } from "../schema";

const COOKIE_NAME = "wk_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // ~90 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Reads the anonymous session cookie, creating a session (and setting the
 * cookie) on first visit. Only the token's hash is ever stored server-side.
 */
export function getOrCreateSession(cookies: AstroCookies): string {
  const existingToken = cookies.get(COOKIE_NAME)?.value;
  if (existingToken) {
    const existing = db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(existingToken)))
      .get();
    if (existing) return existing.id;
  }

  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  db.insert(sessions).values({ id, tokenHash: hashToken(token) }).run();

  cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });

  return id;
}
