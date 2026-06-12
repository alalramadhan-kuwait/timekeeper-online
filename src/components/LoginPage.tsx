import { useState } from 'react';
import { Watch } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setBusy(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <Watch size={26} className="text-amber-500" />
          <h1 className="text-xl font-bold">Timekeeper Online</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">Operations Control System</p>
        {error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <label className="block text-sm mb-3">
          <span className="text-slate-600">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300" />
        </label>
        <label className="block text-sm mb-5">
          <span className="text-slate-600">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300" />
        </label>
        <button disabled={busy} className="w-full py-2.5 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-700 disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
