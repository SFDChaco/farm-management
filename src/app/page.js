'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LoginScreen } from '@/components/LoginScreen';
import { AppShell } from '@/components/AppShell';

export default function Home() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">🌿</div>
        <div className="font-display text-xl text-farm-green">FarmOS</div>
        <div className="text-xs text-gray-500 mt-2">Laden...</div>
      </div>
    </div>
  );

  if (!session) return <LoginScreen />;

  return <AppShell session={session} profile={profile} />;
}
