import type { ReactNode } from 'react';
import type { AuthSession } from './auth';
import { isManager } from './auth';

type Access = 'all' | 'manager' | 'workshop' | 'deny';
export default function ProtectedRoute({ session, access = 'all', children }: { session: AuthSession | null; access?: Access; children: ReactNode }) {
  if (!session) {
    return <div data-testid="auth-redirect" className="p-6 text-center">در حال انتقال به صفحهٔ ورود…</div>;
  }
  if (access === 'deny' || (access === 'manager' && !isManager(session.user)) || (access === 'workshop' && session.user.role !== 'workshop_manager')) {
    return <div data-testid="access-denied" role="alert" className="mx-auto mt-10 w-full max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center font-bold text-red-700 dark:border-red-900 dark:bg-slate-900 dark:text-red-300">دسترسی غیرمجاز</div>;
  }
  return <>{children}</>;
}
