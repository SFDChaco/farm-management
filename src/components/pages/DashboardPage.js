'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function DashboardPage({ farmId, farm }) {
  const [stats, setStats] = useState({ animals: 0, fields: 0, herds: 0, pregnant: 0, deaths: 0, mast: 0 });
  const [recentWeather, setRecentWeather] = useState([]);
  const [recentDeaths, setRecentDeaths] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (farmId) loadData(); }, [farmId]);

  const loadData = async () => {
    setLoading(true);
    const [animals, fields, herds, deaths, weather, breeding] = await Promise.all([
      supabase.from('animals').select('id, is_mast', { count: 'exact' }).eq('farm_id', farmId),
      supabase.from('fields').select('id', { count: 'exact' }).eq('farm_id', farmId),
      supabase.from('herds').select('id', { count: 'exact' }).eq('farm_id', farmId),
      supabase.from('deaths').select('*').eq('farm_id', farmId).order('date', { ascending: false }).limit(5),
      supabase.from('weather').select('*').eq('farm_id', farmId).order('date', { ascending: false }).limit(7),
      supabase.from('breeding').select('id', { count: 'exact' }).eq('farm_id', farmId).eq('status', 'tragend'),
    ]);
    setStats({
      animals: animals.count || 0,
      fields: fields.count || 0,
      herds: herds.count || 0,
      pregnant: breeding.count || 0,
      deaths: (deaths.data || []).length,
      mast: (animals.data || []).filter(a => a.is_mast).length,
    });
    setRecentWeather(weather.data || []);
    setRecentDeaths(deaths.data || []);
    setLoading(false);
  };

  const StatCard = ({ label, value, color = 'text-farm-green' }) => (
    <div className="bg-farm-card border border-farm-border rounded-xl p-5">
      <div className={`text-3xl font-bold ${color}`}>{loading ? '...' : value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">{farm?.name || 'Dashboard'}</h1>
        <p className="text-sm text-gray-500 mt-1">{farm?.location} · {farm?.total_area_ha ? `${farm.total_area_ha} ha` : ''}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Tiere gesamt" value={stats.animals.toLocaleString('de-DE')} />
        <StatCard label="Parzellen" value={stats.fields} color="text-farm-amber" />
        <StatCard label="Herden" value={stats.herds} color="text-farm-blue" />
        <StatCard label="Tragend" value={stats.pregnant} color="text-farm-purple" />
        <StatCard label="Masttiere" value={stats.mast} color="text-farm-cyan" />
        <StatCard label="Todesfälle" value={stats.deaths} color="text-farm-red" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-farm-card border border-farm-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">Wetter (letzte 7 Tage)</h3>
          {recentWeather.length === 0 && !loading && (
            <p className="text-xs text-gray-500">Noch keine Wetterdaten.</p>
          )}
          {recentWeather.map(w => (
            <div key={w.id} className="flex justify-between py-2 border-b border-farm-border text-sm">
              <span className="text-gray-400">{w.date}</span>
              <span>
                <span className={w.rain_mm > 0 ? 'text-blue-400' : 'text-gray-600'}>{w.rain_mm}mm</span>
                <span className="text-gray-600 mx-2">·</span>
                <span className="text-gray-400">{w.temp_min}°/{w.temp_max}°</span>
              </span>
            </div>
          ))}
        </div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">Letzte Todesfälle</h3>
          {recentDeaths.length === 0 && !loading && (
            <p className="text-xs text-gray-500">Keine Todesfälle gemeldet.</p>
          )}
          {recentDeaths.map(d => (
            <div key={d.id} className="flex justify-between py-2 border-b border-farm-border text-sm">
              <div>
                <span className="font-semibold">{d.name}</span>
                <span className="text-gray-500 ml-2 text-xs">{d.date}</span>
              </div>
              <span className="text-farm-red text-xs font-medium px-2 py-0.5 bg-red-900/20 rounded">{d.cause}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
