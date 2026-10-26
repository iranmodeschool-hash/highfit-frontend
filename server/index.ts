import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const upstream = 'https://highfit-api.liara.run';
const routes: Record<string, string> = {
  '/api/auth/login': '/api/login',
  '/api/auth/register': '/api/register',
  '/api/users/profile': '/api/users/profile',
  '/api/users/change-password': '/api/users/change-password',
};

function respond(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let text = '';
  for await (const chunk of req) {
    text += chunk.toString();
    if (text.length > 16_384) throw new Error('request-too-large');
  }
  return JSON.parse(text);
}

createServer(async (req, res) => {
  const path = (req.url ?? '').split('?')[0];
  const target = routes[path];
  if (!target) { respond(res, 404, { message: 'مسیر یافت نشد.' }); return; }
  const profileRequest = path === '/api/users/profile' || path === '/api/users/change-password';
  if (req.method !== (profileRequest ? 'PUT' : 'POST')) { respond(res, 405, { message: 'روش درخواست مجاز نیست.' }); return; }
  const authorization = req.headers.authorization;
  if (profileRequest && (!authorization || !/^Bearer\s+\S+$/i.test(authorization))) {
    respond(res, 401, { message: 'برای ادامه دوباره وارد شوید.' }); return;
  }

  let payload: unknown;
  try { payload = await readBody(req); }
  catch (error) { console.error('Invalid authentication request', path, error instanceof Error ? error.name : 'unknown'); respond(res, 400, { message: 'اطلاعات ارسالی معتبر نیست.' }); return; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    respond(res, 400, { message: 'اطلاعات ارسالی معتبر نیست.' }); return;
  }
  const fields = payload as Record<string, unknown>;
  let forwarded: Record<string, unknown>;
  if (path === '/api/users/profile') {
    if (typeof fields.email !== 'string' || !fields.email.trim() || typeof fields.newUsername !== 'string' || !fields.newUsername.trim()) {
      respond(res, 400, { message: 'ایمیل حساب و نام کاربری جدید را وارد کنید.' }); return;
    }
    forwarded = { email: fields.email.trim(), newUsername: fields.newUsername.trim() };
  } else if (path === '/api/users/change-password') {
    if (typeof fields.currentPassword !== 'string' || !fields.currentPassword || typeof fields.newPassword !== 'string' || !fields.newPassword) {
      respond(res, 400, { message: 'رمز فعلی و رمز جدید را وارد کنید.' }); return;
    }
    forwarded = { currentPassword: fields.currentPassword, newPassword: fields.newPassword };
  } else {
    if (typeof fields.email !== 'string' || typeof fields.password !== 'string' || (target.endsWith('/register') && typeof fields.username !== 'string')) {
      respond(res, 400, { message: 'اطلاعات ارسالی کامل نیست.' }); return;
    }
    forwarded = target.endsWith('/register')
      ? { username: fields.username, email: fields.email, password: fields.password }
      : { email: fields.email, password: fields.password };
  }

  try {
    const response = await fetch(upstream + target, {
      method: profileRequest ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(profileRequest ? { Authorization: authorization! } : {}) },
      body: JSON.stringify(forwarded),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    let result: unknown;
    try { result = text ? JSON.parse(text) : {}; }
    catch {
      console.error('Account upstream returned non-JSON', target, response.status);
      if (!response.ok) { respond(res, response.status, { message: text || `خطای سرور (کد ${response.status})` }); return; }
      respond(res, 502, { message: 'پاسخ سرور حساب قابل خواندن نیست.' }); return;
    }
    if (!response.ok) console.error('Account upstream rejected request', target, response.status);
    respond(res, response.status, result);
  } catch (error) {
    console.error('Account upstream unavailable', target, error);
    respond(res, 502, { message: 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.' });
  }
}).listen(Number(process.env.PORT), '0.0.0.0');
