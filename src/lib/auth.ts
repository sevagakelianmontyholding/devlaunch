import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db, now } from "./db";
import { UserError } from "./shell";
import type { SessionUser } from "./types";

const SESSION_COOKIE = "devlaunch_session";
const SESSION_DAYS = 30;

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  pin_hash: string | null;
  created_at: string;
};

export function hashSecret(secret: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(secret, salt, 64).toString("hex")}`;
}

export function verifySecret(secret: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(secret, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Simple in-memory throttle: 5 failures lock an identity for 30 seconds.
const failures = new Map<string, { count: number; until: number }>();

function checkThrottle(key: string) {
  const entry = failures.get(key);
  if (entry && entry.until > Date.now()) {
    throw new UserError(`Too many attempts. Try again in ${Math.ceil((entry.until - Date.now()) / 1000)}s`);
  }
}

function recordFailure(key: string) {
  const entry = failures.get(key) ?? { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= 5) {
    entry.count = 0;
    entry.until = Date.now() + 30_000;
  }
  failures.set(key, entry);
}

function toSessionUser(row: UserRow): SessionUser {
  return { id: row.id, username: row.username, hasPin: row.pin_hash !== null };
}

export function userCount() {
  return (db().prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count;
}

function getUserRow(id: string) {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  if (!row) throw new UserError("Account not found");
  return row;
}

function validateCredentials(username: string, password: string) {
  const name = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(name)) throw new UserError("Username: 2–40 letters, numbers, dots, dashes or underscores");
  if (password.length < 8) throw new UserError("Password must be at least 8 characters");
  return name;
}

export async function createFirstUser(username: string, password: string) {
  if (userCount() > 0) throw new UserError("An account already exists. Sign in instead.");
  const name = validateCredentials(username, password);
  const id = randomUUID();
  db()
    .prepare("INSERT INTO users (id, username, password_hash, pin_hash, created_at) VALUES (?, ?, ?, NULL, ?)")
    .run(id, name, hashSecret(password), now());
  await startSession(id);
  return toSessionUser(getUserRow(id));
}

export async function signIn(username: string, password: string) {
  const name = username.trim().toLowerCase();
  checkThrottle(`login:${name}`);
  const row = db().prepare("SELECT * FROM users WHERE username = ?").get(name) as UserRow | undefined;
  if (!row || !verifySecret(password, row.password_hash)) {
    recordFailure(`login:${name}`);
    throw new UserError("Wrong username or password");
  }
  await startSession(row.id);
  return toSessionUser(row);
}

async function startSession(userId: string) {
  const id = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db().prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expires.toISOString());
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
  (await cookies()).set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", expires });
}

export async function signOut() {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (id) db().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  store.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const row = db()
    .prepare(
      `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?`,
    )
    .get(id, now()) as UserRow | undefined;
  return row ? toSessionUser(row) : null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new UserError("Sign in to continue");
  return user;
}

export function changePassword(userId: string, currentPassword: string, nextPassword: string) {
  const row = getUserRow(userId);
  if (!verifySecret(currentPassword, row.password_hash)) throw new UserError("Current password is wrong");
  if (nextPassword.length < 8) throw new UserError("New password must be at least 8 characters");
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashSecret(nextPassword), userId);
}

export function setDeployPin(userId: string, password: string, pin: string | null) {
  const row = getUserRow(userId);
  if (!verifySecret(password, row.password_hash)) throw new UserError("Password is wrong");
  if (pin !== null && !/^\d{4}$/.test(pin)) throw new UserError("The passphrase must be exactly 4 digits");
  db().prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(pin === null ? null : hashSecret(pin), userId);
  return toSessionUser(getUserRow(userId));
}

// Returns silently when the user has no passphrase configured.
export function verifyDeployPin(userId: string, pin: string | undefined) {
  const row = getUserRow(userId);
  if (row.pin_hash === null) return;
  checkThrottle(`pin:${userId}`);
  if (!pin || !verifySecret(pin, row.pin_hash)) {
    recordFailure(`pin:${userId}`);
    throw new UserError(pin ? "Wrong passphrase" : "Enter your deploy passphrase");
  }
}
