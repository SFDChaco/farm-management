'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  BarChart3, Navigation, Users, Activity, TrendingUp, Wrench, Baby,
  AlertTriangle, Package, Truck, Droplets, Sprout, Tag, MessageCircle,
  DollarSign, LogOut, Plus, ChevronDown
} from 'lucide-react';

import { DashboardPage } from '@/components/pages/DashboardPage';
import { AnimalsPage } from '@/components/pages/AnimalsPage';

const NAV = [
  { id: 'dashboard', label: 'Übersicht', icon: BarChart3 },
  { id: 'animals', label: 'Viehbestand', icon: Tag },
  { id: 'herds', label: 'Herden', icon: Users },
  { id: 'scale', label: 'Waage', icon: Activity },
  { id: 'mast', label: 'Mast', icon: TrendingUp },
  { id: 'treatment', label: 'Behandlung', icon: Wrench },
  { id: 'breeding', label: 'Zucht', icon: Baby },
  { id: 'control', label: 'Kontrolle', icon: AlertTriangle },
  { id: 'feed', label: 'Futter', icon: Package },
  { id: 'fuel', label: 'Geräte', icon: Truck },
  { id: 'water', label: 'Wasser', icon: Droplets },
  { id: 'plan', label: 'Planung', icon: TrendingUp },
  { id: 'fields', label: 'Felder', icon: Sprout },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'finances', label: 'Finanzen', icon: DollarSign },
];

export function AppShell({ session, profile }) {
  const [page, setPage] = useState('dashboard');
  const [farms, setFarms] = useState([]);
  const [currentFarm, setCurrentFarm] = useState(null);
  const [showFarmSelector, setShowFarmSelector] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupForm, setSetupForm] = useState({ farmName: '', location: '', area: '' });

  useEffect(() => { loadFarms(); }, []);

  const loadFarms = async () => {
    const { data: fu } = await supabase.from('farm_users').select('farm_id').eq('user_id', session.user.id);
    if (fu && fu.length > 0) {
      const farmIds = fu.map(f => f.farm_id);
      const { data } = await supabase.from('farms').select('*').in('id', farmIds);
      setFarms(data || []);
      setCurrentFarm(data?.[0] || null);
    } else {
      if (profile?.role === 'admin') {
        const { data } = await supabase.from('farms').select('*');
        if (data && data.length > 0) {
          setFarms(data);
          setCurrentFarm(data[0]);
        } else {
          setShowSetup(true);
        }
      } else {
        setShowSetup(true);
      }
    }
  };

  const createFarm = async () => {
    if (!setupForm.farmName) return;
    const { data: farm, error } = await supabase.from('farms').insert({
      name: setupForm.farmName,
      location: setupForm.location,
      total_area_ha: parseFloat(setupForm.area) || null,
    }).select().single();
    if (error) { console.error(error); return; }
    await supabase.from('farm_users').insert({
      farm_id: farm.id,
      user_id: session.user.id,
      role: 'admin',
    });
    setFarms([...farms, farm]);
    setCurrentFarm(farm);
    setShowSetup(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (showSetup) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-farm-card border border-farm-border rounded-2xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏡</div>
          <h2 className="font-display text-xl font-bold">Farm einrichten</h2>
          <p className="text-xs t
