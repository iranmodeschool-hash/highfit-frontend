import type { Role } from './data';

export type Account = { role: 'admin' | 'supervisor' | 'workshop_manager'; username?: string; email?: string; workshopId?: string };
export type AuthSession = { token: string; user: Account };
export const AUTH_KEY = 'dokhtyar_auth_session';
const OLD_TOKEN_KEY = 'dokhtyar_auth_token';

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validSession(value: unknown): AuthSession | null {
  const row = object(value);
  const user = object(row.user);
  if (typeof row.token !== 'string' || !row.token.trim() || !['admin', 'supervisor', 'workshop_manager'].includes(String(user.role))) return null;
  return { token: row.token, user: {
    role: user.role as Account['role'],
    username: typeof user.username === 'string' ? user.username : undefined,
    email: typeof user.email === 'string' ? user.email : undefined,
    workshopId: typeof user.workshopId === 'string' && user.workshopId ? user.workshopId : undefined,
  } };
}

export function sessionFromLogin(value: unknown): AuthSession | null {
  const body = object(value);
  const data = object(body.data);
  const token = body.token ?? body.accessToken ?? body.access_token ?? body.jwt ?? data.token ?? data.accessToken ?? data.access_token ?? data.jwt;
  const user = object(body.user ?? data.user);
  const role = user.role;
  return validSession({ token, user: {
    role, username: user.username, email: user.email,
    workshopId: user.workshopId ?? user.workshop_id,
  } });
}

function expired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch { return false; } // The server is the authority for token validity.
}
export function readSession(): AuthSession | null {
  try {
    // Older token-only sessions cannot prove a role and must sign in again.
    localStorage.removeItem(OLD_TOKEN_KEY);
    const raw = localStorage.getItem(AUTH_KEY);
    const session = raw ? validSession(JSON.parse(raw)) : null;
    if (session && expired(session.token)) { clearSession(); return null; }
    return session;
  } catch { return null; }
}
export function saveSession(session: AuthSession): void { localStorage.setItem(AUTH_KEY, JSON.stringify(session)); }
export function clearSession(): void {
  try { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(OLD_TOKEN_KEY); } catch { /* storage unavailable */ }
}
export function isManager(account: Account): boolean { return account.role === 'admin'; }
export function operationalRole(account: Account): Role | null {
  if (account.role === 'admin') return { kind: 'manager' };
  if (account.role === 'supervisor') return { kind: 'supervisor' };
  return account.role === 'workshop_manager' && account.workshopId ? { kind: 'workshop', workshopId: account.workshopId } : null;
}
