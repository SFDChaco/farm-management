'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Search, ChevronLeft, ChevronRight, Upload, TrendingUp, Scale, AlertTriangle } from 'lucide-react';

const PER_PAGE = 20;

function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
}

function today() { return new Date().toISOString().split('T')[0]; }

function animalLabel(a) {
  if (!a) return 'Unbekannt';
  return (a.name || 'Unbenannt') + (a.ear_tag ? ' (' + a.ear_tag + ')' : a.rfid ? ' (' + a.rfid + ')' : '');
}

function calcADG(weights) {
  if (!weights || weights.length < 2) return null;
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (days <= 0) return null;
  return ((last.weight_kg - first.weight_kg) / days).toFixed(2);
}

export function WeightPage({ farmId }) {
  const [weights, setWeights] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyAnimal, setHistoryAnimal] = useState(null);
  const [historyWeights, setHistoryWeights] = useState([]);
  const [saveError, setSaveError] = useState('');
  const [csvError, setCsvError] = useState('');
  const [csvResults, setCsvResults] = useState(null);

  const [animalSearch, setAnimalSearch] = useState('');
  const [animalResults, setAnimalResults] = useState([]);
  const [selectedAnimal, setSelectedAnimal] = useState(null);

  const [stats, setStats] = useState({ todayCount: 0, weekCount: 0, avgWeight: 0, avgADG: 0 });

  const [form, setForm] = useState({
    animal_id: '', weight_kg: '', date: today(), source: 'manuell', notes: ''
  });

  const loadWeights = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('weight_records').select('*, animals(name, ear_tag, rfid, animal_type)', { count: 'exact' }).eq('farm_id', farmId);
    if (search) query = query.or('notes.ilike.%' + search + '%,source.ilike.%' + search + '%');
    query = query.order('date', { ascending: false }).range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);
    const { data, count } = await query;
    setWeights(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [farmId, search, page]);

  const loadStats = useCallback(async () => {
    const todayStr = today();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const { count: todayC } = await supabase.from('weight_records').select('*', { count: 'exact', head: true }).eq('farm_id', farmId).eq('date', todayStr);
    const { count: weekC } = await supabase.from('weight_records').select('*', { count: 'exact', head: true }).eq('farm_id', farmId).gte('date', weekAgo);
    const { data: avgData } = await supabase.from('weight_records').select('weight_kg').eq('farm_id', farmId).eq('date', todayStr);
    const avg = avgData && avgData.length > 0 ? avgData.reduce((s, w) => s + w.weight_kg, 0) / avgData.length : 0;

    setStats({ todayCount: todayC || 0, weekCount: weekC || 0, avgWeight: Math.round(avg), avgADG: 0 });
  }, [farmId]);

  useEffect(() => { if (farmId) { loadWeights(); loadStats(); } }, [loadWeights, loadStats, farmId]);

  const searchAnimals = async (term) => {
    setAnimalSearch(term);
    if (term.length < 1) { setAnimalResults([]); return; }
    const { data } = await supabase.from('animals').select('id, name, ear_tag, rfid, animal_type')
      .eq('farm_id', farmId).or('name.ilike.%' + term + '%,ear_tag.ilike.%' + term + '%,rfid.ilike.%' + term + '%').limit(10);
    setAnimalResults(data || []);
  };

  const selectAnimal = (a) => {
    setSelectedAnimal(a);
    setForm(f => ({ ...f, animal_id: a.id }));
    setAnimalSearch(''); setAnimalResults([]);
  };

  const openNew = () => {
    setSaveError(''); setSelectedAnimal(null); setAnimalSearch('');
    setForm({ animal_id: '', weight_kg: '', date: today(), source: 'manuell', notes: '' });
    setShowModal(true);
  };

  const saveWeight = async () => {
    setSaveError('');
    if (!form.animal_id) { setSaveError('Tier auswaehlen'); return; }
    if (!form.weight_kg || parseFloat(form.weight_kg) <= 0) { setSaveError('Gewicht eingeben'); return; }
    const payload = clean({ animal_id: form.animal_id, weight_kg: parseFloat(form.weight_kg), date: form.date, source: form.source, notes: form.notes, farm_id: farmId });
    const { error } = await supabase.from('weight_records').insert(payload);
    if (error) { setSaveError(error.message); return; }
    // Update animal's current weight
    await supabase.from('animals').update({ weight_kg: parseFloat(form.weight_kg) }).eq('id', form.animal_id);
    setShowModal(false); loadWeights(); loadStats();
  };

  // Weight history for a single animal
  const showHistory = async (animal) => {
    setHistoryAnimal(animal);
    const { data } = await supabase.from('weight_records').select('*').eq('animal_id', animal.id || animal.animal_id).eq('farm_id', farmId).order('date', { ascending: true });
    setHistoryWeights(data || []);
    setShowHistoryModal(true);
  };

  // CSV Import for Tru-Test
  const handleCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(''); setCsvResults(null);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      if (lines.length < 2) { setCsvError('Datei ist leer oder hat keine Daten'); return; }

      // Try to detect format: look for headers
      const header = lines[0].toLowerCase();
      let idCol = -1, weightCol = -1, dateCol = -1;
      const cols = lines[0].split(/[,;\t]/);

      cols.forEach((c, i) => {
        const cl = c.trim().toLowerCase();
        if (cl.includes('rfid') || cl.includes('eid') || cl.includes('vid') || cl.includes('id') || cl.includes('ohrmarke') || cl.includes('ear')) idCol = i;
        if (cl.includes('weight') || cl.includes('gewicht') || cl.includes('kg') || cl.includes('mass')) weightCol = i;
        if (cl.includes('date') || cl.includes('datum') || cl.includes('time') || cl.includes('zeit')) dateCol = i;
      });

      if (idCol === -1 || weightCol === -1) {
        setCsvError('Konnte ID-Spalte oder Gewicht-Spalte nicht erkennen. Erwartet: RFID/EID/VID und Weight/Gewicht Spalten.');
        return;
      }

      const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
      let imported = 0, failed = 0, notFound = 0;

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(sep);
        if (parts.length <= Math.max(idCol, weightCol)) continue;
        const animalId = parts[idCol].trim().replace(/"/g, '');
        const weight = parseFloat(parts[weightCol].trim().replace(/"/g, ''));
        const dateStr = dateCol >= 0 && parts[dateCol] ? parts[dateCol].trim().replace(/"/g, '') : today();

        if (!animalId || isNaN(weight) || weight <= 0) { failed++; continue; }

        // Try to find animal by RFID, ear_tag, or name
        const { data: found } = await supabase.from('animals').select('id')
          .eq('farm_id', farmId)
          .or('rfid.eq.' + animalId + ',ear_tag.eq.' + animalId + ',name.eq.' + animalId)
          .limit(1);

        if (!found || found.length === 0) { notFound++; continue; }

        let parsedDate = today();
        if (dateStr && dateStr !== today()) {
          // Try multiple date formats
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) parsedDate = d.toISOString().split('T')[0];
        }

        const { error } = await supabase.from('weight_records').insert({
          animal_id: found[0].id, weight_kg: weight, date: parsedDate,
          source: 'csv-import', farm_id: farmId
        });
        if (error) { failed++; } else {
          imported++;
          await supabase.from('animals').update({ weight_kg: weight }).eq('id', found[0].id);
        }
      }

      setCsvResults({ imported, failed, notFound, total: lines.length - 1 });
      if (imported > 0) { loadWeights(); loadStats(); }
    } catch (err) {
      setCsvError('Fehler: ' + err.message);
    }
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  const AnimalPicker = () => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">Tier *</label>
      {selectedAnimal ? (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-green text-sm">
          <span className="font-semibold">{animalLabel(selectedAnimal)}</span>
          <button onClick={() => { setSelectedAnimal(null); setForm(f => ({...f, animal_id: ''})); }} className="text-gray-500 hover:text-white"><X size={14} /></button>
        </div>
      ) : (
        <div className="relative">
          <input value={animalSearch} onChange={e => searchAnimals(e.target.value)} placeholder="Name, Ohrmarke oder RFID..."
            className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
          {animalResults.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-farm-card border border-farm-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {animalResults.map(a => (
                <button key={a.id} onClick={() => selectAnimal(a)} className="w-full text-left px-3 py-2 text-sm hover:bg-farm-border/30 transition flex justify-between">
                  <span className="font-semibold">{a.name || 'Unbenannt'}</span>
                  <span className="text-gray-500">{a.ear_tag || a.rfid || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Waage & Gewicht</h1>
          <p className="text-sm text-gray-500 mt-1">{stats.todayCount} Wiegungen heute</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setCsvError(''); setCsvResults(null); setShowCSVModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-farm-card border border-farm-border text-gray-300 rounded-lg text-sm hover:border-farm-green transition">
            <Upload size={16} /> CSV Import
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-farm-green text-black rounded-lg font-semibold text-sm hover:bg-green-300 transition">
            <Plus size={16} /> Wiegung
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Heute</p>
          <p className="text-2xl font-bold text-farm-green mt-1">{stats.todayCount}</p>
        </div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Diese Woche</p>
          <p className="text-2xl font-bold mt-1">{stats.weekCount}</p>
        </div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Durchschnitt heute</p>
          <p className="text-2xl font-bold text-farm-cyan mt-1">{stats.avgWeight} <span className="text-sm text-gray-400">kg</span></p>
        </div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">ADG Ø</p>
          <p className="text-2xl font-bold text-farm-amber mt-1">{stats.avgADG || '-'} <span className="text-sm text-gray-400">kg/Tag</span></p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Suchen..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none focus:border-farm-green" />
        </div>
      </div>

      <div className="bg-farm-card border border-farm-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-farm-border">
            <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Datum</th>
            <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Tier</th>
            <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Gewicht</th>
            <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Quelle</th>
            <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Notizen</th>
            <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Verlauf</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Laden...</td></tr>}
            {!loading && weights.map(w => (
              <tr key={w.id} className="border-b border-farm-border/50 hover:bg-farm-border/30 transition">
                <td className="px-4 py-3 text-gray-400">{w.date}</td>
                <td className="px-4 py-3 font-semibold">{animalLabel(w.animals)}</td>
                <td className="px-4 py-3 font-bold text-farm-green">{w.weight_kg} kg</td>
                <td className="px-4 py-3"><span className={'text-xs px-2 py-0.5 rounded ' + (w.source === 'manuell' ? 'bg-blue-900/20 text-farm-blue' : w.source === 'csv-import' ? 'bg-purple-900/20 text-purple-400' : 'bg-green-900/20 text-farm-green')}>{w.source}</span></td>
                <td className="px-4 py-3 text-gray-400 truncate max-w-xs">{w.notes || '-'}</td>
                <td className="px-4 py-3"><button onClick={() => showHistory(w.animals || { id: w.animal_id })} className="text-xs px-2 py-1 rounded bg-farm-border/50 text-gray-400 hover:text-farm-green transition"><TrendingUp size={12} className="inline mr-1" />Verlauf</button></td>
              </tr>
            ))}
            {!loading && weights.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">Keine Wiegungen gefunden.</td></tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-farm-border">
            <span className="text-xs text-gray-500">Seite {page + 1} von {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded border border-farm-border hover:bg-farm-border disabled:opacity-30 transition"><ChevronLeft size={16} /></button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded border border-farm-border hover:bg-farm-border disabled:opacity-30 transition"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-lg font-bold">Wiegung erfassen</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            {saveError && (<div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">{saveError}</div>)}
            <div className="space-y-3">
              <AnimalPicker />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Gewicht (kg) *</label><input type="number" step="0.1" value={form.weight_kg} onChange={e => setForm({...form, weight_kg: e.target.value})} placeholder="z.B. 385" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition text-2xl font-bold text-center" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Datum</label><input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Notizen</label><input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
            </div>
            <button onClick={saveWeight} className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition">Wiegung speichern</button>
          </div>
        </div>
      )}

      {showCSVModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-lg font-bold">CSV / Tru-Test Import</h2>
              <button onClick={() => setShowCSVModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-2">CSV-Datei mit Spalten fuer Tier-ID (RFID/Ohrmarke) und Gewicht hochladen.</p>
            <p className="text-xs text-gray-500 mb-4">Unterstuetzte Formate: Tru-Test, Gallagher, oder jede CSV mit ID- und Gewicht-Spalte.</p>
            {csvError && (<div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">{csvError}</div>)}
            {csvResults && (
              <div className="mb-4 p-4 rounded-lg bg-farm-bg border border-farm-border">
                <h3 className="text-sm font-semibold mb-2">Import Ergebnis:</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-farm-green font-semibold">{csvResults.imported} importiert</div>
                  <div className="text-gray-400">{csvResults.total} Zeilen gesamt</div>
                  {csvResults.notFound > 0 && <div className="text-farm-yellow">{csvResults.notFound} Tiere nicht gefunden</div>}
                  {csvResults.failed > 0 && <div className="text-farm-red">{csvResults.failed} fehlgeschlagen</div>}
                </div>
              </div>
            )}
            <label className="flex items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed border-farm-border text-gray-400 cursor-pointer hover:border-farm-green hover:text-farm-green transition">
              <Upload size={20} /><span className="text-sm">CSV Datei waehlen</span>
              <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleCSV} />
            </label>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-lg font-bold">Gewichtsverlauf</h2>
              <button onClick={() => setShowHistoryModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            {historyWeights.length > 0 && (
              <div>
                <div className="flex justify-between mb-4 p-3 rounded-lg bg-farm-bg">
                  <div>
                    <p className="text-xs text-gray-500">Erstes Gewicht</p>
                    <p className="text-lg font-bold">{historyWeights[0].weight_kg} kg</p>
                    <p className="text-xs text-gray-500">{historyWeights[0].date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Letztes Gewicht</p>
                    <p className="text-lg font-bold text-farm-green">{historyWeights[historyWeights.length - 1].weight_kg} kg</p>
                    <p className="text-xs text-gray-500">{historyWeights[historyWeights.length - 1].date}</p>
                  </div>
                </div>
                {calcADG(historyWeights) && (
                  <div className="mb-4 p-3 rounded-lg bg-green-900/10 border border-green-900/30 text-center">
                    <p className="text-xs text-farm-green font-semibold">Durchschnittliche Tageszunahme (ADG)</p>
                    <p className="text-3xl font-bold text-farm-green">{calcADG(historyWeights)} <span className="text-sm">kg/Tag</span></p>
                  </div>
                )}
                <div className="mb-4">
                  <div className="flex items-end gap-1 h-32 px-2">
                    {historyWeights.map((w, i) => {
                      const min = Math.min(...historyWeights.map(x => x.weight_kg));
                      const max = Math.max(...historyWeights.map(x => x.weight_kg));
                      const range = max - min || 1;
                      const height = ((w.weight_kg - min) / range) * 100 + 10;
                      const prevW = i > 0 ? historyWeights[i-1].weight_kg : w.weight_kg;
                      const color = w.weight_kg >= prevW ? 'bg-farm-green' : 'bg-farm-red';
                      return (
                        <div key={w.id} className="flex-1 flex flex-col items-center gap-1" title={w.date + ': ' + w.weight_kg + 'kg'}>
                          <span className="text-[9px] text-gray-500">{w.weight_kg}</span>
                          <div className={'rounded-t w-full min-w-[4px] ' + color} style={{height: height + '%'}}></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  {[...historyWeights].reverse().map(w => (
                    <div key={w.id} className="flex justify-between text-xs py-1.5 border-b border-farm-border/30">
                      <span className="text-gray-400">{w.date}</span>
                      <span className="font-bold">{w.weight_kg} kg</span>
                      <span className="text-gray-500">{w.source}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {historyWeights.length === 0 && <p className="text-gray-500 text-center py-4">Keine Wiegungen fuer dieses Tier.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
