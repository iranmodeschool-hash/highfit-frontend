import { useState, type FormEvent } from 'react';
import { ArrowLeft, LockKeyhole, LogIn, UserPlus } from 'lucide-react';
import { saveSession, sessionFromLogin, type AuthSession } from './auth';

type Mode = 'login' | 'register';
type Props = { mode: Mode; onNavigate: (mode: Mode) => void; onSignedIn: (session: AuthSession) => void };

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function messageFrom(value: unknown): string {
  const body = asObject(value);
  const text = body.message ?? body.error;
  if (typeof text === 'string' && text.trim()) return text;
  const details = asObject(body.errors);
  const first = Object.values(details)[0];
  if (typeof first === 'string') return first;
  if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  return 'درخواست انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.';
}

export default function AuthPage({ mode, onNavigate, onSignedIn }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function navigate(next: Mode) {
    setError(''); setNotice(''); setPassword(''); onNavigate(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(''); setNotice('');
    if (mode === 'register' && !username.trim()) { setError('نام کاربری را وارد کنید.'); return; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('ایمیل معتبر وارد کنید.'); return; }
    if (!password) { setError('رمز عبور را وارد کنید.'); return; }
    setBusy(true);
    try {
      const response = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login' ? { email: email.trim(), password } : { username: username.trim(), email: email.trim(), password }),
      });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) { setError(messageFrom(result)); return; }
      if (mode === 'register') {
        setPassword('');
        onNavigate('login');
        setNotice('حساب ساخته شد. اکنون با ایمیل و رمز عبور وارد شوید.');
        return;
      }
      const session = sessionFromLogin(result);
      if (!session) { setError('پاسخ ورود باید شامل نشانهٔ ورود و اطلاعات کاربر با نقش معتبر باشد. لطفاً پاسخ سرور را بررسی کنید.'); return; }
      // Keep the signed-in email even when the login response omits it.
      if (!session.user.email) session.user.email = email.trim();
      try { saveSession(session); }
      catch { setError('ذخیرهٔ ورود روی این دستگاه ممکن نشد. فضای مرورگر را بررسی کنید.'); return; }
      onSignedIn(session);
    } catch {
      setError('ارتباط با سرور ورود برقرار نشد. اینترنت را بررسی و دوباره تلاش کنید.');
    } finally { setBusy(false); }
  }

  return <div className="app-shell min-h-screen bg-[#F3F5F7] px-4 py-10 text-[#172B45] dark:bg-[#101a27] dark:text-slate-100" style={{ paddingTop: 'max(40px, env(safe-area-inset-top))' }}>
    <main className="mx-auto w-full max-w-md">
      <div className="mb-7 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#172B45] text-white dark:bg-[#e99a35] dark:text-[#172B45]"><LockKeyhole size={26}/></div><h1 className="mt-4 text-2xl font-extrabold">دوختیار</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">مدیریت تولید و کارگاه‌های دوخت</p></div>
      <section className="rounded-2xl border border-[#dfe5eb] bg-white p-5 shadow-[0_2px_14px_rgba(23,43,69,0.05)] dark:border-slate-700 dark:bg-[#1b293b] sm:p-7">
        <h2 data-testid="auth-title" className="text-xl font-bold">{mode === 'login' ? 'ورود به حساب' : 'ساخت حساب جدید'}</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{mode === 'login' ? 'برای ادامه ایمیل و رمز عبور خود را وارد کنید.' : 'مشخصات خود را برای ثبت‌نام وارد کنید.'}</p>
        {error && <p data-testid="auth-error" role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
        {notice && <p data-testid="auth-success" role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{notice}</p>}
        <form data-testid="auth-form" onSubmit={e => void submit(e)} className="mt-5 space-y-4">
          {mode === 'register' && <label className="block text-sm font-medium">نام کاربری<input data-testid="auth-username" autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-[#172B45] dark:border-slate-600 dark:bg-[#24364b]"/></label>}
          <label className="block text-sm font-medium">ایمیل<input data-testid="auth-email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-left outline-none focus:border-[#172B45] dark:border-slate-600 dark:bg-[#24364b]"/></label>
          <label className="block text-sm font-medium">رمز عبور<input data-testid="auth-password" type="password" dir="ltr" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={e => setPassword(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-left outline-none focus:border-[#172B45] dark:border-slate-600 dark:bg-[#24364b]"/></label>
          <button data-testid="auth-submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#172B45] px-5 font-bold text-white transition hover:bg-[#254361] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E99A35] disabled:opacity-50 dark:bg-[#e99a35] dark:text-[#172B45]">{mode === 'login' ? <LogIn size={19}/> : <UserPlus size={19}/>} {busy ? 'لطفاً صبر کنید…' : mode === 'login' ? 'ورود' : 'ثبت‌نام'}</button>
        </form>
        <button type="button" data-testid="auth-switch" onClick={() => navigate(mode === 'login' ? 'register' : 'login')} className="mt-5 flex min-h-11 w-full items-center justify-center gap-1 rounded-xl text-sm font-semibold text-[#172B45] hover:bg-slate-100 focus-visible:outline-2 dark:text-[#e99a35] dark:hover:bg-slate-800">{mode === 'login' ? 'حساب ندارید؟ ثبت‌نام کنید' : 'قبلاً ثبت‌نام کرده‌اید؟ وارد شوید'} <ArrowLeft size={16}/></button>
      </section>
      <p className="mt-5 text-center text-sm leading-7 text-slate-500 dark:text-slate-400">اطلاعات کاری ذخیره‌شده روی این دستگاه با ورود یا خروج پاک نمی‌شوند. ورود تازه به اینترنت نیاز دارد.</p>
    </main>
  </div>;
}
