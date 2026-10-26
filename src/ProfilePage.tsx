import { useState, type FormEvent } from 'react';
import { LockKeyhole, LogOut, Save, UserRound } from 'lucide-react';
import { saveSession, type AuthSession } from './auth';

type Props = { session: AuthSession; onSessionChange: (next: AuthSession) => void; onLogout: () => void };
const field = 'mt-2 min-h-11 w-full rounded-xl border border-[#cbd5df] bg-white px-3 text-[#172B45] outline-none focus:border-[#172B45] focus:ring-2 focus:ring-[#172B45]/15 dark:border-slate-600 dark:bg-[#24364b] dark:text-white';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#172B45] px-5 font-bold text-white transition hover:bg-[#254361] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E99A35] disabled:opacity-50 dark:bg-[#e99a35] dark:text-[#172B45]';
const card = 'rounded-2xl border border-[#dfe5eb] bg-white p-5 shadow-[0_2px_14px_rgba(23,43,69,0.05)] dark:border-slate-700 dark:bg-[#1b293b] sm:p-6';

function serverMessage(value: unknown, fallback: string): string {
  if (value && typeof value === 'object') {
    const body = value as Record<string, unknown>;
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail;
    if (body.errors && typeof body.errors === 'object') {
      const first = Object.values(body.errors)[0];
      if (typeof first === 'string') return first;
      if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    }
  }
  return fallback;
}

export default function ProfilePage({ session, onSessionChange, onLogout }: Props) {
  const [username, setUsername] = useState(session.user.username ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [nameError, setNameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  async function request(path: string, payload: Record<string, string>): Promise<unknown> {
    const response = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let body: unknown = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = raw; }
    if (!response.ok) throw new Error(typeof body === 'string' && body.trim() ? body : serverMessage(body, `درخواست انجام نشد (کد ${response.status}).`));
    return body;
  }

  async function updateName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = username.trim();
    setNameError(''); setNameSuccess('');
    if (!value) { setNameError('نام کاربری را وارد کنید.'); return; }
    if (value === session.user.username) { setNameError('نام کاربری جدید با نام فعلی یکسان است.'); return; }
    const email = session.user.email?.trim();
    if (!email) { setNameError('ایمیل این حساب در اطلاعات ورود ثبت نشده است. لطفاً خارج شوید و دوباره با ایمیل خود وارد شوید.'); return; }
    setNameBusy(true);
    try {
      await request('/api/users/profile', { email, newUsername: value });
      const next: AuthSession = { ...session, user: { ...session.user, username: value } };
      saveSession(next);
      onSessionChange(next);
      setNameSuccess('نام کاربری با موفقیت تغییر کرد.');
    } catch (error) { setNameError(error instanceof Error ? error.message : 'تغییر نام کاربری انجام نشد.'); }
    finally { setNameBusy(false); }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(''); setPasswordSuccess('');
    if (!currentPassword || !newPassword) { setPasswordError('رمز فعلی و رمز جدید را وارد کنید.'); return; }
    if (currentPassword === newPassword) { setPasswordError('رمز جدید باید با رمز فعلی متفاوت باشد.'); return; }
    setPasswordBusy(true);
    try {
      await request('/api/users/change-password', { currentPassword, newPassword });
      setCurrentPassword(''); setNewPassword('');
      setPasswordSuccess('رمز عبور با موفقیت تغییر کرد.');
    } catch (error) { setPasswordError(error instanceof Error ? error.message : 'تغییر رمز عبور انجام نشد.'); }
    finally { setPasswordBusy(false); }
  }

  return <div data-testid="profile-page" className="mx-auto w-full max-w-3xl space-y-5">
    <section className={card}>
      <h2 className="flex items-center gap-2 text-lg font-bold"><UserRound size={21}/> اطلاعات حساب</h2>
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-slate-50 p-4 dark:bg-[#24364b]"><dt className="text-sm text-slate-500 dark:text-slate-300">نام کاربری فعلی</dt><dd data-testid="profile-current-username" className="mt-2 break-words font-bold">{session.user.username || 'ثبت نشده'}</dd></div>
        <div className="min-w-0 rounded-xl bg-slate-50 p-4 dark:bg-[#24364b]"><dt className="text-sm text-slate-500 dark:text-slate-300">ایمیل فعلی</dt><dd data-testid="profile-current-email" dir="ltr" className="mt-2 break-all text-left font-bold">{session.user.email || 'ثبت نشده'}</dd></div>
      </dl>
    </section>
    <section className={card}>
      <h2 className="text-lg font-bold">تغییر نام کاربری</h2>
      <form data-testid="profile-name-form" onSubmit={e => void updateName(e)} className="mt-4 space-y-4">
        <label className="block text-sm font-medium">نام کاربری جدید<input data-testid="profile-username" value={username} onChange={e => setUsername(e.target.value)} maxLength={100} autoComplete="username" required className={field}/></label>
        {nameError && <div data-testid="profile-name-error" role="alert" className="break-words rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{nameError}</div>}
        {nameSuccess && <p data-testid="profile-name-success" role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{nameSuccess}</p>}
        <button data-testid="profile-name-save" disabled={nameBusy} className={button}><Save size={18}/>{nameBusy ? 'در حال ذخیره…' : 'ذخیره نام کاربری'}</button>
      </form>
    </section>
    <section className={card}>
      <h2 className="flex items-center gap-2 text-lg font-bold"><LockKeyhole size={20}/> تغییر رمز عبور</h2>
      <form data-testid="profile-password-form" onSubmit={e => void updatePassword(e)} className="mt-4 space-y-4">
        <label className="block text-sm font-medium">رمز عبور فعلی<input data-testid="profile-current-password" type="password" dir="ltr" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={field}/></label>
        <label className="block text-sm font-medium">رمز عبور جدید<input data-testid="profile-new-password" type="password" dir="ltr" autoComplete="new-password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} className={field}/></label>
        {passwordError && <p data-testid="profile-password-error" role="alert" className="text-sm text-red-700 dark:text-red-300">{passwordError}</p>}
        {passwordSuccess && <p data-testid="profile-password-success" role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{passwordSuccess}</p>}
        <button data-testid="profile-password-save" disabled={passwordBusy} className={button}><Save size={18}/>{passwordBusy ? 'در حال ذخیره…' : 'تغییر رمز عبور'}</button>
      </form>
    </section>
    <button data-testid="profile-logout" onClick={onLogout} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600 dark:border-red-900 dark:bg-[#1b293b] dark:text-red-300 dark:hover:bg-red-950"><LogOut size={19}/> خروج از حساب</button>
  </div>;
}
