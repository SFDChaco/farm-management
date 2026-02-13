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
import { FieldsPage } from '@/components/pages/FieldsPage';
import { EquipmentPage } from '@/components/pages/EquipmentPage';
import { HerdsPage } from '@/components/pages/HerdsPage';

const NAV = [
  { id: 'dashboard', label: 'Uebersicht', icon: BarChart3 },
  { id: 'animals', label: 'Viehbestand', icon: Tag },
  { id: 'herds', label: 'Herden', icon: Users },
  { id: 'fields', label: 'Felder', icon: Sprout },
  { id: 'fuel', label: 'Maschinen', icon: Truck },
  { id: 'scale', label: 'Waage', icon: Activity },
  { id: 'mast', label: 'Mast', icon: TrendingUp },
  { id: 'treatment', label: 'Behandlung', icon: Wrench },
  { id: 'breeding', label: 'Zucht', icon: Baby },
  { id: 'control', label: 'Kontrolle', icon: AlertTriangle },
  { id: 'feed', label: 'Futter', icon: Package },
  { id: 'water', label: 'Wasser', icon: Droplets },
  { id: 'plan', label: 'Planung', icon: TrendingUp },
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
          <p className="text-xs text-gray-500 mt-1">Erstelle deine erste Farm</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Farmname *</label>
            <input value={setupForm.farmName} onChange={e => setSetupForm({...setupForm, farmName: e.target.value})}
              placeholder="z.B. Estancia San Rafael"
              className="w-full px-4 py-3 rounded-xl bg-farm-bg border border-farm-border text-white outline-none focus:border-farm-green" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Ort / Departamento</label>
            <input value={setupForm.location} onChange={e => setSetupForm({...setupForm, location: e.target.value})}
              placeholder="z.B. Chaco, Paraguay"
              className="w-full px-4 py-3 rounded-xl bg-farm-bg border border-farm-border text-white outline-none focus:border-farm-green" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Flaeche (Hektar)</label>
            <input type="number" value={setupForm.area} onChange={e => setSetupForm({...setupForm, area: e.target.value})}
              placeholder="z.B. 5000"
              className="w-full px-4 py-3 rounded-xl bg-farm-bg border border-farm-border text-white outline-none focus:border-farm-green" />
          </div>
          <button onClick={createFarm}
            className="w-full py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition mt-4">
            Farm erstellen
          </button>
        </div>
      </div>
    </div>
  );

  const renderPage = () => {
    if (!currentFarm) return null;
    switch (page) {
      case 'dashboard': return <DashboardPage farmId={currentFarm.id} farm={currentFarm} />;
      case 'animals': return <AnimalsPage farmId={currentFarm.id} />;
      case 'fields': return <FieldsPage farmId={currentFarm.id} />;
      case 'fuel': return <EquipmentPage farmId={currentFarm.id} />;
      case 'herds': return <HerdsPage farmId={currentFarm.id} />;
      default: return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-4xl mb-4">🚧</div>
            <h2 className="font-display text-xl font-bold mb-2">{NAV.find(n => n.id === page)?.label}</h2>
            <p className="text-sm text-gray-500">Wird in der naechsten Sitzung eingebaut.</p>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-farm-card border-r border-farm-border flex flex-col fixed h-full">
        <div className="p-4 border-b border-farm-border">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🌿</div>
            <div>
              <div className="font-display text-lg font-bold">FarmOS</div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Weidewirtschaft</div>
            </div>
          </div>
        </div>
        <div className="px-3 py-2 border-b border-farm-border">
          <button onClick={() => setShowFarmSelector(!showFarmSelector)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-farm-bg border border-farm-border text-sm hover:border-farm-green transition">
            <span className="truncate font-medium">{currentFarm?.name || 'Farm waehlen'}</span>
            <ChevronDown size={14} className="text-gray-500" />
          </button>
          {showFarmSelector && (
            <div className="mt-1 bg-farm-bg border border-farm-border rounded-lg overflow-hidden">
              {farms.map(f => (
                <button key={f.id} onClick={() => { setCurrentFarm(f); setShowFarmSelector(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-farm-border transition ${f.id === currentFarm?.id ? 'text-farm-green font-semibold' : 'text-gray-400'}`}>
                  {f.name}
                </button>
              ))}
              <button onClick={() => setShowSetup(true)}
                className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:text-farm-green border-t border-farm-border flex items-center gap-1">
                <Plus size={12} /> Neue Farm
              </button>
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-b border-farm-border flex justify-between items-center">
          <div className="text-xs text-farm-green font-semibold truncate">{profile?.name || session.user.email}</div>
          <button onClick={handleLogout} className="text-gray-500 hover:text-farm-red transition" title="Abmelden">
            <LogOut size={14} />
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = page === item.id;
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => setPage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  active ? 'bg-green-900/30 text-farm-green font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-farm-border/50'
                }`}>
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-farm-border text-[10px] text-gray-600 text-center">
          FarmOS v2.1 · {farms.length} Farm{farms.length !== 1 ? 's' : ''}
        </div>
      </aside>
      <main className="flex-1 ml-56 p-6 overflow-y-auto min-h-screen">
        {renderPage()}
      </main>
    </div>
  );
}
