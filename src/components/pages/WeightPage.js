'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Search, ChevronLeft, ChevronRight, Upload, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown, BarChart3, Camera, Eye } from 'lucide-react';

const PER_PAGE = 50;
function today() { return new Date().toISOString().split('T')[0]; }
function animalLabel(a) { if (!a) return '-'; return (a.name || 'Unbenannt') + (a.ear_tag ? ' (' + a.ear_tag + ')' : ''); }

export function WeightPage({ farmId }) {
  const [view, setView] = useState('table');
  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fieldFilter, setFieldFilter] = useState('all');
  const [herdFilter, setHerdFilter] = useState('all');
  const [sortCol, setSortCol] = useState('weight_kg');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [fields, setFields] = useState([]);
  const [herds, setHerds] = useState([]);
  const [showWeighModal, setShowWeighModal] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [showAnimalDetail, setShowAnimalDetail] = useState(null);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [csvError, setCsvError] = useState('');
  const [csvResults, setCsvResults] = useState(null);
  const [animalSearch, setAnimalSearch] = useState('');
  const [animalResults, setAnimalResults] = useState([]);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [weighForm, setWeighForm] = useState({ animal_id: '', weight_kg: '', date: today(), notes: '' });
  const [chartData, setChartData] = useState([]);
  const [chartField, setChartField] = useState('all');
  const [photoBatchAnimal, setPhotoBatchAnimal] = useState(null);
  const [photoBatchSearch, setPhotoBatchSearch] = useState('');
  const [photoBatchResults, setPhotoBatchResults] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [detailWeights, setDetailWeights] = useState([]);
  const [detailPhotos, setDetailPhotos] = useState([]);
  const [stats, setStats] = useState({ totalAnimals: 0, avgWeight: 0, avgADG: 0, todayWeighings: 0 });

  const loadAnimals = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('animals')
      .select('id, name, ear_tag, rfid, animal_type, weight_kg, sex, status, photo_url, herd_id, herds(name, field_id, fields(name))')
      .eq('farm_id', farmId).neq('status', 'tot').neq('status', 'verkauft');
    if (search) query = query.or('name.ilike.%' + search + '%,ear_tag.ilike.%' + search + '%,rfid.ilike.%' + search + '%');
    const { data: ad } = await query;
    if (!ad) { setAnimals([]); setLoading(false); return; }
    const ids = ad.map(a => a.id);
    let wd = [];
    if (ids.length > 0) {
      const { data } = await supabase.from('weight_records').select('animal_id, weight_kg, date').in('animal_id', ids).order('date', { ascending: false });
      wd = data || [];
    }
    const wba = {};
    wd.forEach(w => { if (!wba[w.animal_id]) wba[w.animal_id] = []; wba[w.animal_id].push(w); });
    const enriched = ad.map(a => {
      const ws = wba[a.id] || [];
      let adg = null, lastWeighDate = null, weightChange = null;
      if (ws.length >= 2) {
        const l = ws[0], p = ws[1];
        const d = (new Date(l.date) - new Date(p.date)) / 86400000;
        if (d > 0) { adg = parseFloat(((l.weight_kg - p.weight_kg) / d).toFixed(3)); weightChange = parseFloat((l.weight_kg - p.weight_kg).toFixed(1)); }
        lastWeighDate = l.date;
      } else if (ws.length === 1) { lastWeighDate = ws[0].date; }
      return { ...a, adg, lastWeighDate, weightChange, fieldName: a.herds?.fields?.name || null, herdName: a.herds?.name || null, fieldId: a.herds?.field_id || null, weighCount: ws.length };
    });
    let filtered = enriched;
    if (fieldFilter !== 'all') filtered = filtered.filter(a => a.fieldId === fieldFilter);
    if (herdFilter !== 'all') filtered = filtered.filter(a => a.herd_id === herdFilter);
    filtered.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (va == null) va = sortDir === 'asc' ? Infinity : -Infinity;
      if (vb == null) vb = sortDir === 'asc' ? Infinity : -Infinity;
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      return sortDir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
    });
    setAnimals(filtered);
    setLoading(false);
    const ww = filtered.filter(a => a.weight_kg);
    const avgW = ww.length > 0 ? ww.reduce((s, a) => s + parseFloat(a.weight_kg), 0) / ww.length : 0;
    const wa = filtered.filter(a => a.adg !== null);
    const avgA = wa.length > 0 ? wa.reduce((s, a) => s + a.adg, 0) / wa.length : 0;
    const { count: tc } = await supabase.from('weight_records').select('*', { count: 'exact', head: true }).eq('farm_id', farmId).eq('date', today());
    setStats({ totalAnimals: filtered.length, avgWeight: Math.round(avgW), avgADG: avgA.toFixed(2), todayWeighings: tc || 0 });
  }, [farmId, search, fieldFilter, herdFilter, sortCol, sortDir]);

  const loadFields = useCallback(async () => { const { data } = await supabase.from('fields').select('id, name').eq('farm_id', farmId).order('name'); setFields(data || []); }, [farmId]);
  const loadHerds = useCallback(async () => { const { data } = await supabase.from('herds').select('id, name, field_id').eq('farm_id', farmId).order('name'); setHerds(data || []); }, [farmId]);
  useEffect(() => { if (farmId) { loadAnimals(); loadFields(); loadHerds(); } }, [loadAnimals, loadFields, loadHerds, farmId]);

  const toggleSort = (col) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } };
  const SortIcon = ({ col }) => { if (sortCol !== col) return <ArrowUpDown size={12} className="text-gray-600" />; return sortDir === 'asc' ? <ArrowUp size={12} className="text-farm-green" /> : <ArrowDown size={12} className="text-farm-green" />; };

  const doAnimalSearch = async (t) => { setAnimalSearch(t); if (t.length < 1) { setAnimalResults([]); return; } const { data } = await supabase.from('animals').select('id, name, ear_tag, rfid').eq('farm_id', farmId).or('name.ilike.%' + t + '%,ear_tag.ilike.%' + t + '%,rfid.ilike.%' + t + '%').limit(10); setAnimalResults(data || []); };
  const openWeigh = () => { setSaveError(''); setSelectedAnimal(null); setAnimalSearch(''); setWeighForm({ animal_id: '', weight_kg: '', date: today(), notes: '' }); setShowWeighModal(true); };

  const saveWeight = async () => {
    setSaveError('');
    if (!weighForm.animal_id) { setSaveError('Tier auswaehlen'); return; }
    if (!weighForm.weight_kg || parseFloat(weighForm.weight_kg) <= 0) { setSaveError('Gewicht eingeben'); return; }
    const { error } = await supabase.from('weight_records').insert({ animal_id: weighForm.animal_id, weight_kg: parseFloat(weighForm.weight_kg), date: weighForm.date, source: 'manuell', notes: weighForm.notes || null, farm_id: farmId });
    if (error) { setSaveError(error.message); return; }
    await supabase.from('animals').update({ weight_kg: parseFloat(weighForm.weight_kg) }).eq('id', weighForm.animal_id);
    setShowWeighModal(false); loadAnimals();
  };

  const openDetail = async (animal) => {
    setShowAnimalDetail(animal);
    const { data: ws } = await supabase.from('weight_records').select('*').eq('animal_id', animal.id).order('date', { ascending: true });
    setDetailWeights(ws || []);
    const { data: ps } = await supabase.from('animal_photos').select('*').eq('animal_id', animal.id).order('created_at', { ascending: false });
    setDetailPhotos(ps || []);
  };

  const loadChartData = useCallback(async () => {
    if (view !== 'charts') return;
    const { data } = await supabase.from('weight_records')
      .select('weight_kg, date, animal_id, animals(name, ear_tag, herd_id, herds(name, field_id, fields(name)))')
      .eq('farm_id', farmId).order('date', { ascending: true });
    setChartData(data || []);
  }, [farmId, view]);
  useEffect(() => { loadChartData(); }, [loadChartData]);

  const handleCSV = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setCsvError(''); setCsvResults(null);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { setCsvError('Leer'); return; }
      const cols = lines[0].split(/[,;\t]/);
      let idCol = -1, weightCol = -1, dateCol = -1;
      cols.forEach((c, i) => { const cl = c.trim().toLowerCase(); if (cl.includes('rfid') || cl.includes('eid') || cl.includes('vid') || cl.includes('id') || cl.includes('ohrmarke')) idCol = i; if (cl.includes('weight') || cl.includes('gewicht') || cl.includes('kg')) weightCol = i; if (cl.includes('date') || cl.includes('datum')) dateCol = i; });
      if (idCol === -1 || weightCol === -1) { setCsvError('ID/Gewicht Spalte nicht erkannt'); return; }
      const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
      let imp = 0, fail = 0, nf = 0;
      for (let i = 1; i < lines.length; i++) {
        const p = lines[i].split(sep);
        if (p.length <= Math.max(idCol, weightCol)) continue;
        const aid = p[idCol].trim().replace(/"/g, '');
        const w = parseFloat(p[weightCol].trim().replace(/"/g, ''));
        if (!aid || isNaN(w) || w <= 0) { fail++; continue; }
        const { data: f } = await supabase.from('animals').select('id').eq('farm_id', farmId).or('rfid.eq.' + aid + ',ear_tag.eq.' + aid).limit(1);
        if (!f || !f.length) { nf++; continue; }
        const ds = dateCol >= 0 && p[dateCol] ? p[dateCol].trim().replace(/"/g, '') : today();
        let pd = today(); const dd = new Date(ds); if (!isNaN(dd.getTime())) pd = dd.toISOString().split('T')[0];
        const { error } = await supabase.from('weight_records').insert({ animal_id: f[0].id, weight_kg: w, date: pd, source: 'csv', farm_id: farmId });
        if (error) fail++; else { imp++; await supabase.from('animals').update({ weight_kg: w }).eq('id', f[0].id); }
      }
      setCsvResults({ imported: imp, failed: fail, notFound: nf, total: lines.length - 1 });
      if (imp > 0) loadAnimals();
    } catch (err) { setCsvError(err.message); }
  };

  const uploadPhoto = async (file, animalId, isPortrait) => {
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop();
      const path = farmId + '/' + animalId + '/' + Date.now() + '.' + ext;
      const { error: ue } = await supabase.storage.from('animal-photos').upload(path, file);
      if (ue) throw ue;
      const { data: ud } = supabase.storage.from('animal-photos').getPublicUrl(path);
      await supabase.from('animal_photos').insert({ farm_id: farmId, animal_id: animalId, storage_path: path, is_portrait: isPortrait });
      if (isPortrait) await supabase.from('animals').update({ photo_url: ud.publicUrl }).eq('id', animalId);
      return ud.publicUrl;
    } catch (err) { console.error(err); return null; } finally { setUploadingPhoto(false); }
  };

  const handlePhotoFiles = async (e) => {
    if (!photoBatchAnimal) return;
    const files = Array.from(e.target.files || []);
    for (let i = 0; i < files.length; i++) { await uploadPhoto(files[i], photoBatchAnimal.id, i === 0 && !photoBatchAnimal.photo_url); }
    if (showAnimalDetail?.id === photoBatchAnimal.id) openDetail(showAnimalDetail);
    loadAnimals();
  };

  const doPhotoBatchSearch = async (t) => { setPhotoBatchSearch(t); if (t.length < 1) { setPhotoBatchResults([]); return; } const { data } = await supabase.from('animals').select('id, name, ear_tag, rfid, photo_url').eq('farm_id', farmId).or('name.ilike.%' + t + '%,ear_tag.ilike.%' + t + '%,rfid.ilike.%' + t + '%').limit(10); setPhotoBatchResults(data || []); };

  const pageAnimals = animals.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(animals.length / PER_PAGE);
  const fieldColors = ['#4ADE80', '#22D3EE', '#FBBF24', '#F87171', '#A78BFA', '#FB923C', '#34D399', '#60A5FA'];

  const getFieldChartData = () => {
    const fg = {};
    chartData.forEach(w => {
      const fn = w.animals?.herds?.fields?.name || 'Kein Feld';
      if (chartField !== 'all' && fn !== chartField) return;
      if (!fg[fn]) fg[fn] = {};
      if (!fg[fn][w.date]) fg[fn][w.date] = [];
      fg[fn][w.date].push(w.weight_kg);
    });
    const r = {};
    Object.entries(fg).forEach(([fn, dates]) => {
      r[fn] = Object.entries(dates).map(([d, ws]) => ({ date: d, avg: Math.round(ws.reduce((a, b) => a + b, 0) / ws.length) })).sort((a, b) => a.date.localeCompare(b.date));
    });
    return r;
  };

  // ==================== RENDER ====================
  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div><h1 className="font-display text-3xl font-bold">Waage & Gewicht</h1><p className="text-sm text-gray-500 mt-1">{stats.totalAnimals} Tiere · Ø {stats.avgWeight} kg · ADG Ø {stats.avgADG} kg/T</p></div>
        <div className="flex gap-2">
          <button onClick={() => { setCsvError(''); setCsvResults(null); setShowCSVModal(true); }} className="flex items-center gap-2 px-3 py-2 bg-farm-card border border-farm-border text-gray-300 rounded-lg text-sm hover:border-farm-green transition"><Upload size={14} /> CSV</button>
          <button onClick={() => setShowPhotoUpload(true)} className="flex items-center gap-2 px-3 py-2 bg-farm-card border border-farm-border text-gray-300 rounded-lg text-sm hover:border-farm-cyan transition"><Camera size={14} /> Fotos</button>
          <button onClick={openWeigh} className="flex items-center gap-2 px-4 py-2 bg-farm-green text-black rounded-lg font-semibold text-sm hover:bg-green-300 transition"><Plus size={16} /> Wiegung</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-farm-card border border-farm-border rounded-xl p-4"><p className="text-xs text-gray-500">Tiere aktiv</p><p className="text-2xl font-bold mt-1">{stats.totalAnimals}</p></div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4"><p className="text-xs text-gray-500">Ø Gewicht</p><p className="text-2xl font-bold text-farm-green mt-1">{stats.avgWeight} <span className="text-sm text-gray-400">kg</span></p></div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4"><p className="text-xs text-gray-500">Ø ADG</p><p className="text-2xl font-bold text-farm-cyan mt-1">{stats.avgADG} <span className="text-sm text-gray-400">kg/T</span></p></div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4"><p className="text-xs text-gray-500">Wiegungen heute</p><p className="text-2xl font-bold text-farm-amber mt-1">{stats.todayWeighings}</p></div>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setView('table')} className={'px-4 py-2 rounded-lg text-sm font-semibold transition ' + (view === 'table' ? 'bg-farm-green text-black' : 'bg-farm-card border border-farm-border text-gray-400 hover:text-white')}>Tabelle</button>
        <button onClick={() => setView('charts')} className={'px-4 py-2 rounded-lg text-sm font-semibold transition ' + (view === 'charts' ? 'bg-farm-green text-black' : 'bg-farm-card border border-farm-border text-gray-400 hover:text-white')}><BarChart3 size={14} className="inline mr-1" />Charts</button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Name, Ohrmarke, RFID..." className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none focus:border-farm-green" /></div>
        <select value={fieldFilter} onChange={e => { setFieldFilter(e.target.value); setPage(0); }} className="px-3 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none"><option value="all">Alle Felder</option>{fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <select value={herdFilter} onChange={e => { setHerdFilter(e.target.value); setPage(0); }} className="px-3 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none"><option value="all">Alle Herden</option>{herds.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
      </div>

      {/* TABLE VIEW */}
      {view === 'table' && (
        <div className="bg-farm-card border border-farm-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-farm-border">
              <th className="px-3 py-3 w-8"></th>
              {[['name','Name'],['ear_tag','Ohrmarke'],['weight_kg','Gewicht'],['adg','ADG'],['weightChange','+/- kg'],['herdName','Herde'],['fieldName','Feld'],['lastWeighDate','Letzte Wiegung']].map(([col, label]) => (
                <th key={col} className="px-3 py-3 text-left text-xs text-gray-500 font-medium cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(col)}>
                  <span className="flex items-center gap-1">{label} <SortIcon col={col} /></span>
                </th>
              ))}
              <th className="px-3 py-3 w-10"></th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">Laden...</td></tr>}
              {!loading && pageAnimals.map(a => (
                <tr key={a.id} className="border-b border-farm-border/50 hover:bg-farm-border/30 cursor-pointer transition" onClick={() => openDetail(a)}>
                  <td className="px-3 py-2">{a.photo_url ? <img src={a.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-farm-border/50 flex items-center justify-center text-xs text-gray-500">{(a.name || '?')[0]}</div>}</td>
                  <td className="px-3 py-2 font-semibold">{a.name || '-'}</td>
                  <td className="px-3 py-2 text-gray-400 font-mono text-xs">{a.ear_tag || '-'}</td>
                  <td className="px-3 py-2 font-bold text-farm-green">{a.weight_kg ? a.weight_kg + ' kg' : '-'}</td>
                  <td className="px-3 py-2">{a.adg !== null ? <span className={a.adg >= 0 ? 'text-farm-green font-semibold' : 'text-farm-red font-semibold'}>{a.adg > 0 ? '+' : ''}{a.adg}</span> : <span className="text-gray-600">-</span>}</td>
                  <td className="px-3 py-2">{a.weightChange !== null ? <span className={a.weightChange >= 0 ? 'text-farm-green' : 'text-farm-red'}>{a.weightChange > 0 ? '+' : ''}{a.weightChange}</span> : '-'}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{a.herdName || '-'}</td>
                  <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded bg-green-900/20 text-farm-green">{a.fieldName || '-'}</span></td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{a.lastWeighDate || '-'}</td>
                  <td className="px-3 py-2"><Eye size={14} className="text-gray-500" /></td>
                </tr>
              ))}
              {!loading && !animals.length && <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-500">Keine Tiere.</td></tr>}
            </tbody>
          </table>
          {totalPages > 1 && <div className="flex items-center justify-between px-4 py-3 border-t border-farm-border"><span className="text-xs text-gray-500">Seite {page + 1}/{totalPages} ({animals.length} Tiere)</span><div className="flex gap-2"><button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded border border-farm-border hover:bg-farm-border disabled:opacity-30"><ChevronLeft size={16} /></button><button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded border border-farm-border hover:bg-farm-border disabled:opacity-30"><ChevronRight size={16} /></button></div></div>}
        </div>
      )}

      {/* CHARTS VIEW */}
      {view === 'charts' && (
        <div className="space-y-6">
          <div className="flex gap-3 items-center">
            <label className="text-sm text-gray-400">Feld:</label>
            <select value={chartField} onChange={e => setChartField(e.target.value)} className="px-3 py-2 rounded-lg bg-farm-card border border-farm-border text-sm outline-none">
              <option value="all">Alle Felder vergleichen</option>
              {fields.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
            </select>
          </div>

          <div className="bg-farm-card border border-farm-border rounded-xl p-6">
            <h3 className="font-display text-lg font-bold mb-4">Ø Gewicht pro Feld ueber Zeit</h3>
            <div className="h-64 relative">
              {(() => {
                const data = getFieldChartData();
                const all = Object.values(data).flat();
                if (!all.length) return <p className="text-gray-500 text-center pt-20">Keine Daten. Zuerst Wiegungen erfassen.</p>;
                const mn = Math.min(...all.map(e => e.avg)) - 10;
                const mx = Math.max(...all.map(e => e.avg)) + 10;
                const rng = mx - mn || 1;
                const dates = [...new Set(all.map(e => e.date))].sort();
                return (
                  <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                    {[0, .25, .5, .75, 1].map(p => <line key={p} x1="0" y1={100 - p * 100} x2="100" y2={100 - p * 100} stroke="#333" strokeWidth="0.3" />)}
                    {Object.entries(data).map(([fn, entries], fi) => {
                      const color = fieldColors[fi % fieldColors.length];
                      const pts = entries.map(e => {
                        const x = dates.length > 1 ? (dates.indexOf(e.date) / (dates.length - 1)) * 100 : 50;
                        const y = 100 - ((e.avg - mn) / rng) * 100;
                        return x + ',' + y;
                      }).join(' ');
                      return <polyline key={fn} points={pts} fill="none" stroke={color} strokeWidth="0.8" />;
                    })}
                  </svg>
                );
              })()}
            </div>
            <div className="flex gap-4 mt-3 flex-wrap">
              {Object.keys(getFieldChartData()).map((fn, i) => (
                <span key={fn} className="text-xs flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: fieldColors[i % fieldColors.length] }}></span> {fn}</span>
              ))}
            </div>
          </div>

          <div className="bg-farm-card border border-farm-border rounded-xl p-6">
            <h3 className="font-display text-lg font-bold mb-4">ADG Ranking — alle Tiere (klick fuer Detail)</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {animals.filter(a => a.adg !== null).sort((a, b) => b.adg - a.adg).map((a, i) => {
                const mx = Math.max(...animals.filter(x => x.adg !== null).map(x => Math.abs(x.adg))) || 1;
                const pct = Math.abs(a.adg) / mx * 100;
                return (
                  <div key={a.id} onClick={() => openDetail(a)} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-farm-border/30 cursor-pointer transition">
                    <span className="text-xs text-gray-500 w-6 text-right">#{i + 1}</span>
                    {a.photo_url ? <img src={a.photo_url} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-farm-border/50 text-[9px] flex items-center justify-center text-gray-500">{(a.name || '?')[0]}</div>}
                    <span className="text-xs font-semibold w-24 truncate">{a.name || a.ear_tag || '-'}</span>
                    <div className="flex-1 h-4 bg-farm-bg rounded overflow-hidden">
                      <div className={'h-full rounded ' + (a.adg >= 0 ? 'bg-farm-green/60' : 'bg-farm-red/60')} style={{ width: pct + '%' }}></div>
                    </div>
                    <span className={'text-xs font-bold w-20 text-right ' + (a.adg >= 0 ? 'text-farm-green' : 'text-farm-red')}>{a.adg > 0 ? '+' : ''}{a.adg} kg/T</span>
                    <span className="text-[10px] text-gray-500 w-16 truncate">{a.fieldName || '-'}</span>
                  </div>
                );
              })}
              {animals.filter(a => a.adg !== null).length === 0 && <p className="text-gray-500 text-center py-4">Mind. 2 Wiegungen pro Tier noetig.</p>}
            </div>
          </div>
        </div>
      )}

      {/* WEIGH MODAL */}
      {showWeighModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6"><h2 className="font-display text-lg font-bold">Wiegung</h2><button onClick={() => setShowWeighModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button></div>
            {saveError && <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">{saveError}</div>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tier *</label>
                {selectedAnimal ? (
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-green text-sm">
                    <span className="font-semibold">{animalLabel(selectedAnimal)}</span>
                    <button onClick={() => { setSelectedAnimal(null); setWeighForm(f => ({...f, animal_id: ''})); }} className="text-gray-500 hover:text-white"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <input value={animalSearch} onChange={e => doAnimalSearch(e.target.value)} placeholder="Name, Ohrmarke oder RFID..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
                    {animalResults.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-farm-card border border-farm-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {animalResults.map(a => (
                          <button key={a.id} onClick={() => { setSelectedAnimal(a); setWeighForm(f => ({...f, animal_id: a.id})); setAnimalSearch(''); setAnimalResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-farm-border/30 transition flex justify-between">
                            <span className="font-semibold">{a.name || 'Unbenannt'}</span>
                            <span className="text-gray-500">{a.ear_tag || a.rfid || ''}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Gewicht (kg) *</label><input type="number" step="0.1" value={weighForm.weight_kg} onChange={e => setWeighForm({...weighForm, weight_kg: e.target.value})} placeholder="385" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition text-xl font-bold text-center" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Datum</label><input type="date" value={weighForm.date} onChange={e => setWeighForm({...weighForm, date: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none" /></div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Notizen</label><input value={weighForm.notes} onChange={e => setWeighForm({...weighForm, notes: e.target.value})} placeholder="Optional..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none" /></div>
            </div>
            <button onClick={saveWeight} className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition">Speichern</button>
          </div>
        </div>
      )}

      {/* CSV MODAL */}
      {showCSVModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4"><h2 className="font-display text-lg font-bold">CSV Import</h2><button onClick={() => setShowCSVModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button></div>
            <p className="text-xs text-gray-500 mb-4">CSV mit Tier-ID (RFID/Ohrmarke) und Gewicht.</p>
            {csvError && <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">{csvError}</div>}
            {csvResults && <div className="mb-4 p-4 rounded-lg bg-farm-bg border border-farm-border text-sm"><span className="text-farm-green font-semibold">{csvResults.imported} importiert</span> · {csvResults.notFound > 0 && <span className="text-farm-yellow">{csvResults.notFound} nicht gefunden · </span>}{csvResults.failed > 0 && <span className="text-farm-red">{csvResults.failed} fehlgeschlagen</span>}</div>}
            <label className="flex items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed border-farm-border text-gray-400 cursor-pointer hover:border-farm-green hover:text-farm-green transition"><Upload size={20} /><span className="text-sm">CSV waehlen</span><input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleCSV} /></label>
          </div>
        </div>
      )}

      {/* ANIMAL DETAIL MODAL */}
      {showAnimalDetail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                {showAnimalDetail.photo_url ? <img src={showAnimalDetail.photo_url} alt="" className="w-16 h-16 rounded-xl object-cover" /> : <div className="w-16 h-16 rounded-xl bg-farm-border/50 flex items-center justify-center text-2xl text-gray-500">{(showAnimalDetail.name || '?')[0]}</div>}
                <div>
                  <h2 className="font-display text-xl font-bold">{showAnimalDetail.name || 'Unbenannt'}</h2>
                  <p className="text-sm text-gray-500">{showAnimalDetail.ear_tag || ''} {showAnimalDetail.rfid ? '· RFID: ' + showAnimalDetail.rfid : ''}</p>
                  <p className="text-xs text-gray-600">{showAnimalDetail.herdName || '-'} · {showAnimalDetail.fieldName || '-'} · {showAnimalDetail.animal_type || ''} · {showAnimalDetail.sex || '-'}</p>
                </div>
              </div>
              <button onClick={() => setShowAnimalDetail(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="text-center p-3 rounded-lg bg-farm-bg"><p className="text-xs text-gray-500">Aktuell</p><p className="text-2xl font-bold text-farm-green">{showAnimalDetail.weight_kg || '-'} <span className="text-sm">kg</span></p></div>
              <div className="text-center p-3 rounded-lg bg-farm-bg"><p className="text-xs text-gray-500">ADG</p><p className="text-2xl font-bold text-farm-cyan">{showAnimalDetail.adg !== null ? showAnimalDetail.adg : '-'} <span className="text-sm">kg/T</span></p></div>
              <div className="text-center p-3 rounded-lg bg-farm-bg"><p className="text-xs text-gray-500">Wiegungen</p><p className="text-2xl font-bold">{showAnimalDetail.weighCount || 0}</p></div>
            </div>
            {detailWeights.length > 1 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-2">Gewichtsverlauf</h3>
                <div className="flex items-end gap-1 h-32 px-2 bg-farm-bg rounded-lg p-3">
                  {detailWeights.map((w, i) => {
                    const min = Math.min(...detailWeights.map(x => x.weight_kg));
                    const max = Math.max(...detailWeights.map(x => x.weight_kg));
                    const range = max - min || 1;
                    const height = ((w.weight_kg - min) / range) * 80 + 20;
                    const prev = i > 0 ? detailWeights[i - 1].weight_kg : w.weight_kg;
                    const color = w.weight_kg >= prev ? 'bg-farm-green' : 'bg-farm-red';
                    return (
                      <div key={w.id} className="flex-1 flex flex-col items-center gap-1" title={w.date + ': ' + w.weight_kg + 'kg'}>
                        <span className="text-[8px] text-gray-500">{w.weight_kg}</span>
                        <div className={'rounded-t w-full min-w-[4px] transition ' + color} style={{ height: height + '%' }}></div>
                        <span className="text-[7px] text-gray-600">{w.date.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">Alle Wiegungen</h3>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {detailWeights.length === 0 && <p className="text-gray-500 text-xs">Noch keine.</p>}
                {[...detailWeights].reverse().map(w => (
                  <div key={w.id} className="flex justify-between text-xs py-1.5 border-b border-farm-border/30"><span className="text-gray-400">{w.date}</span><span className="font-bold">{w.weight_kg} kg</span><span className="text-gray-500">{w.source}</span></div>
                ))}
              </div>
            </div>
            {detailPhotos.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2">Fotos ({detailPhotos.length})</h3>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {detailPhotos.map(p => {
                    const { data } = supabase.storage.from('animal-photos').getPublicUrl(p.storage_path);
                    return <img key={p.id} src={data.publicUrl} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />;
                  })}
                </div>
              </div>
            )}
            <label className="flex items-center justify-center gap-2 py-2 rounded-xl border border-farm-border text-gray-400 text-sm cursor-pointer hover:border-farm-cyan hover:text-farm-cyan transition">
              <Camera size={14} /> Foto hochladen
              <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                for (const f of files) { const isFirst = !showAnimalDetail.photo_url && files.indexOf(f) === 0; await uploadPhoto(f, showAnimalDetail.id, isFirst); }
                openDetail(showAnimalDetail); loadAnimals();
              }} />
            </label>
          </div>
        </div>
      )}

      {/* PHOTO BATCH UPLOAD MODAL */}
      {showPhotoUpload && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4"><h2 className="font-display text-lg font-bold">Fotos hochladen</h2><button onClick={() => setShowPhotoUpload(false)} className="text-gray-500 hover:text-white"><X size={20} /></button></div>
            <p className="text-xs text-gray-500 mb-4">Waehle ein Tier per Ohrmarke, dann lade Fotos hoch. Erstes Foto = Portrait. Fuer naechstes Tier: X und neue Ohrmarke.</p>
            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1">Tier auswaehlen</label>
              {photoBatchAnimal ? (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-green text-sm">
                  <div className="flex items-center gap-2">
                    {photoBatchAnimal.photo_url && <img src={photoBatchAnimal.photo_url} alt="" className="w-6 h-6 rounded-full object-cover" />}
                    <span className="font-semibold">{animalLabel(photoBatchAnimal)}</span>
                  </div>
                  <button onClick={() => setPhotoBatchAnimal(null)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                </div>
              ) : (
                <div className="relative">
                  <input value={photoBatchSearch} onChange={e => doPhotoBatchSearch(e.target.value)} placeholder="Ohrmarke eingeben..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition text-lg font-bold" />
                  {photoBatchResults.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-farm-card border border-farm-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {photoBatchResults.map(a => (
                        <button key={a.id} onClick={() => { setPhotoBatchAnimal(a); setPhotoBatchSearch(''); setPhotoBatchResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-farm-border/30 transition flex justify-between">
                          <span className="font-semibold">{a.name || 'Unbenannt'}</span>
                          <span className="text-gray-500">{a.ear_tag || a.rfid || ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {photoBatchAnimal && (
              <label className="flex items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed border-farm-border text-gray-400 cursor-pointer hover:border-farm-cyan hover:text-farm-cyan transition">
                <Camera size={24} />
                <span className="text-sm">{uploadingPhoto ? 'Hochladen...' : 'Fotos aufnehmen / waehlen'}</span>
                <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handlePhotoFiles} />
              </label>
            )}
            {photoBatchAnimal && <p className="text-[10px] text-gray-500 mt-2 text-center">Erstes Foto = Portrait. Weitere dem gleichen Tier zugeordnet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
