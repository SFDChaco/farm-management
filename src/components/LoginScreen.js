'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.user) {
      await supabase.from('profiles').insert({ id: data.user.id, name: name || email.split('@')[0], email, role: 'admin' });
    }
    setLoading(false);
    setMode('login');
    setError('Konto erstellt! Du kannst dich jetzt anmelden.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-farm-card border border-farm-border rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🌿</div>
            <h1 className="font-display text-2xl font-bold text-farm-green">FarmOS</h1>
            <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Weidewirtschaft Paraguay</p>
          </div>
          <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name"
                  className="w-full px-4 py-3 rounded-xl bg-farm-bg border border-farm-border text-white outline-none focus:border-farm-green transition" />
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-400 mb-1">E-Mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required
                className="w-full px-4 py-3 rounded-xl bg-farm-bg border border-farm-border text-white outline-none focus:border-farm-green transition" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Passwort</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6}
                className="w-full px-4 py-3 rounded-xl bg-farm-bg border border-farm-border text-white outline-none focus:border-farm-green transition" />
            </div>
            {error && <p className={`text-sm ${error.includes('erstellt') ? 'text-farm-green' : 'text-farm-red'}`}>{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition disabled:opacity-50">
              {loading ? '...' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </form>
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
            className="w-full mt-4 text-xs text-gray-500 hover:text-farm-green transition">
            {mode === 'login' ? 'Neues Konto erstellen →' : '← Zurück zur Anmeldung'}
          </button>
        </div>
      </div>
    </div>
  );
}
