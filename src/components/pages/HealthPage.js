'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Search, ChevronLeft, ChevronRight, Trash2, Heart, AlertTriangle, Clock, Users } from 'lucide-react';

const PER_PAGE = 20;
const TREATMENT_TYPES = ['Medikament', 'Impfung', 'Entwurmung', 'Operation', 'Vitamin', 'Antibiotikum', 'Schmerzmittel', 'Sonstige'];
const DEATH_CAUSES = ['Krankheit', 'Unfall', 'Schlange', 'Raubtier', 'Geburtskomplikation', 'Totgeburt', 'Altersschwaeche', 'Blitz', 'Unbekannt', 'Sonstige'];

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

export function HealthPage({ farmId }) {
  const [tab, setTab] = useState('treatments');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [showDeathModal, setShowDeathModal] = useState(false);
  const [showHerdModal, setShowHerdModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [animalSearch, setAnimalSearch] = useState('');
  const [animalResults, setAnimalResults] = useState([]);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [herds, setHerds] = useState([]);

  const [stats, setStats] = useState({ totalTreatments: 0, thisMonth: 0, deaths30d: 0, pendingWartezeit: 0 });

  const [form, setForm] = useState({
    animal_id: '', treatment_type: 'Medikament', medication_name: '', dosage: '',
    administered_by: '', veterinarian: '', date: today(), notes: '',
    wartezeit_days: '', next_treatment_date: ''
  });

  const [deathForm, setDeathForm] = useState({
    animal_id: '', date: today(), cause: 'Unbekannt', notes: '', stillborn: false
  });

  const [herdForm, setHerdForm] = useState({
    herd_id: '', treatment_type: 'Impfung', medication_name: '', dosage: '',
    administered_by: '', date: today(), notes: ''
  });

  const loadItems = useCallback(async () => {
    setLoading(true);
    if (tab === 'treatments') {
      let query = supabase.from('treatments').select('*, animals(name, ear_tag, rfid)', { count: 'exact' }).eq('farm_id', farmId);
      if (typeFilter !== 'all') query = query.eq('treatment_type', typeFilter);
      if (search) query = query.or('medication_name.ilike.%' + search + '%,notes.ilike.%' + search + '%,administered_by.ilike.%' + search + '%');
      query = query.order('date', { ascending: false }).range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);
      const { data, count } = await query;
      setItems(data || []);
      setTotal(count || 0);
    } else {
      let query = supabase.from('animal_deaths').select('*, animals(name, ear_tag, rfid)', { count: 'exact' }).eq('farm_id', farmId);
      if (search) query = query.or('cause.ilike.%' + search + '%,notes.ilike.%' + search + '%');
      query = query.order('date', { ascending: false }).range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);
      const { data, count } = await query;
      setItems(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [farmId, tab, search, typeFilter, page]);

  const loadStats = useCallback(async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const days30 = new Date(now - 30 * 86400000).toISOString().split('T')[0];
    const todayStr = today();

    const { count: totalT } = await supabase.from('treatments').select('*', { count: 'exact', head: true }).eq('farm_id', farmId);
    const { count: monthT } = await supabase.from('treatments').select('*', { count: 'exact', head: true }).eq('farm_id', farmId).gte('date', monthStart);
    const { count: deathsT } = await supabase.from('animal_deaths').select('*', { count: 'exact', head: true }).eq('farm_id', farmId).gte('date', days30);
    const { count: warteT } = await supabase.from('treatments').select('*', { count: 'exact', head: true }).eq('farm_id', farmId).not('wartezeit_until', 'is', null).gte('wartezeit_until', todayStr);

    setStats({ totalTreatments: totalT || 0, thisMonth: monthT || 0, deaths30d: deathsT || 0, pendingWartezeit: warteT || 0 });
  }, [farmId]);

  const loadHerds = useCallback(async () => {
    const { data } = await supabase.from('herds').select('id, name').eq('farm_id', farmId).order('name');
    setHerds(data || []);
  }, [farmId]);

  useEffect(() => { if (farmId) { loadItems(); loadStats(); loadHerds(); } }, [loadItems, loadStats, loadHerds, farmId]);

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
    setDeathForm(f => ({ ...f, animal_id: a.id }));
    setAnimalSearch(''); setAnimalResults([]);
  };

  // Treatment CRUD
  const openNewTreatment = () => {
    setEditItem(null); setSaveError(''); setShowDeleteConfirm(false); setSelectedAnimal(null); setAnimalSearch('');
    setForm({ animal_id: '', treatment_type: 'Medikament', medication_name: '', dosage: '', administered_by: '', veterinarian: '', date: today(), notes: '', wartezeit_days: '', next_treatment_date: '' });
    setShowModal(true);
  };

  const openEditTreatment = (t) => {
    setEditItem(t); setSaveError(''); setShowDeleteConfirm(false);
    setSelectedAnimal(t.animals || null);
    setForm({ animal_id: t.animal_id || '', treatment_type: t.treatment_type || 'Medikament', medication_name: t.medication_name || '', dosage: t.dosage || '', administered_by: t.administered_by || '', veterinarian: t.veterinarian || '', date: t.date || today(), notes: t.notes || '', wartezeit_days: t.wartezeit_days || '', next_treatment_date: t.next_treatment_date || '' });
    setShowModal(true);
  };

  const saveTreatment = async () => {
    setSaveError('');
    if (!form.animal_id) { setSaveError('Tier auswaehlen'); return; }
    if (!form.medication_name.trim()) { setSaveError('Medikament/Behandlung ist erforderlich'); return; }
    let wartezeit_until = null;
    if (form.wartezeit_days && parseInt(form.wartezeit_days) > 0) {
      const d = new Date(form.date); d.setDate(d.getDate() + parseInt(form.wartezeit_days));
      wartezeit_until = d.toISOString().split('T')[0];
    }
    const payload = clean({ animal_id: form.animal_id, treatment_type: form.treatment_type, medication_name: form.medication_name.trim(), dosage: form.dosage, administered_by: form.administered_by, veterinarian: form.veterinarian, date: form.date, notes: form.notes, wartezeit_days: form.wartezeit_days ? parseInt(form.wartezeit_days) : null, wartezeit_until, next_treatment_date: form.next_treatment_date || null, farm_id: farmId });
    let result;
    if (editItem) { result = await supabase.from('treatments').update(payload).eq('id', editItem.id); }
    else { result = await supabase.from('treatments').insert(payload); }
    if (result.error) { setSaveError(result.error.message); return; }
    setShowModal(false); loadItems(); loadStats();
  };

  const deleteTreatment = async () => {
    if (!editItem) return;
    const { error } = await supabase.from('treatments').delete().eq('id', editItem.id);
    if (error) { setSaveError(error.message); return; }
    setShowModal(false); loadItems(); loadStats();
  };

  // Death
  const openNewDeath = () => {
    setSaveError(''); setSelectedAnimal(null); setAnimalSearch('');
    setDeathForm({ animal_id: '', date: today(), cause: 'Unbekannt', notes: '', stillborn: false });
    setShowDeathModal(true);
  };

  const saveDeath = async () => {
    setSaveError('');
    if (!deathForm.animal_id) { setSaveError('Tier auswaehlen'); return; }
    const payload = clean({ animal_id: deathForm.animal_id, date: deathForm.date, cause: deathForm.cause, notes: deathForm.notes, stillborn: deathForm.stillborn, farm_id: farmId });
    const { error } = await supabase.from('animal_deaths').insert(payload);
    if (error) { setSaveError(error.message); return; }
    await supabase.from('animals').update({ status: 'tot' }).eq('id', deathForm.animal_id);
    setShowDeathModal(false); loadItems(); loadStats();
  };

  // Herd treatment
  const openHerdTreatment = () => {
    setSaveError('');
    setHerdForm({ herd_id: '', treatment_type: 'Impfung', medication_name: '', dosage: '', administered_by: '', date: today(), notes: '' });
    setShowHerdModal(true);
  };

  const saveHerdTreatment = async () => {
    setSaveError('');
    if (!herdForm.herd_id) { setSaveError('Herde auswaehlen'); return; }
    if (!herdForm.medication_name.trim()) { setSaveError('Medikament ist erforderlich'); return; }
    const { data: herdAnimals } = await supabase.from('animals').select('id').eq('herd_id', herdForm.herd_id).eq('farm_id', farmId);
    if (!herdAnimals || herdAnimals.length === 0) { setSaveError('Keine Tiere in dieser Herde'); return; }
    const records = herdAnimals.map(a => ({ animal_id: a.id, treatment_type: herdForm.treatment_type, medication_name: herdForm.medication_name.trim(), dosage: herdForm.dosage || null, administered_by: herdForm.administered_by || null, date: herdForm.date, notes: herdForm.notes || null, farm_id: farmId }));
    const { error } = await supabase.from('treatments').insert(records);
    if (error) { setSaveError(error.message); return; }
    setShowHerdModal(false); loadItems(); loadStats();
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  const typeColor = (t) => {
    const c = { 'Medikament': 'bg-blue-900/20 text-farm-blue', 'Impfung': 'bg-green-900/20 text-farm-green', 'Entwurmung': 'bg-yellow-900/20 text-farm-yellow', 'Operation': 'bg-red-900/20 text-farm-red', 'Antibiotikum': 'bg-purple-900/20 text-purple-400', 'Vitamin': 'bg-cyan-900/20 text-farm-cyan' };
    return c[t] || 'bg-gray-700/20 text-gray-400';
  };

  // Animal search widget
  const AnimalPicker = () => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">Tier *</label>
      {selectedAnimal ? (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-green text-sm">
          <span className="font-semibold">{animalLabel(selectedAnimal)}</span>
          <button onClick={() => { setSelectedAnimal(null); setForm(f => ({...f, animal_id: ''})); setDeathForm(f => ({...f, animal_id: ''})); }} className="text-gray-500 hover:text-white"><X size={14} /></button>
        </div>
      ) : (
        <div className="relative">
          <input value={animalSearch} onChange={e => searchAnimals(e.target.value)} placeholder="Name, Ohrmarke oder RFID suchen..."
            className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
          {animalResults.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-farm-card border border-farm-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {animalResults.map(a => (
                <button key={a.id} onClick={() => selectAnimal(a)} className="w-full text-left px-3 py-2 text-sm hover:bg-farm-border/30 transition flex justify-between">
                  <span className="font-semibold">{a.name || 'Unbenannt'}</span>
                  <span className="text-gray-500">{a.ear_tag || a.rfid || ''} · {a.animal_type}</span>
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
          <h1 className="font-display text-3xl font-bold">Gesundheit</h1>
          <p className="text-sm text-gray-500 mt-1">{stats.totalTreatments} Behandlungen gesamt</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openHerdTreatment} className="flex items-center gap-2 px-4 py-2 bg-farm-card border border-farm-border text-gray-300 rounded-lg text-sm hover:border-farm-green transition">
            <Users size={16} /> Herdenbehandlung
          </button>
          {tab === 'treatments' ? (
            <button onClick={openNewTreatment} className="flex items-center gap-2 px-4 py-2 bg-farm-green text-black rounded-lg font-semibold text-sm hover:bg-green-300 transition">
              <Plus size={16} /> Behandlung
            </button>
          ) : (
            <button onClick={openNewDeath} className="flex items-center gap-2 px-4 py-2 bg-farm-red text-white rounded-lg font-semibold text-sm hover:bg-red-400 transition">
              <AlertTriangle size={16} /> Todesfall
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Diesen Monat</p>
          <p className="text-2xl font-bold text-farm-green mt-1">{stats.thisMonth}</p>
        </div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Gesamt</p>
          <p className="text-2xl font-bold mt-1">{stats.totalTreatments}</p>
        </div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Todesfaelle (30 Tage)</p>
          <p className="text-2xl font-bold text-farm-red mt-1">{stats.deaths30d}</p>
        </div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Schlachtsperre aktiv</p>
          <p className="text-2xl font-bold text-farm-yellow mt-1">{stats.pendingWartezeit}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => { setTab('treatments'); setPage(0); }} className={'px-4 py-2 rounded-lg text-sm font-semibold transition ' + (tab === 'treatments' ? 'bg-farm-green text-black' : 'bg-farm-card border border-farm-border text-gray-400 hover:text-white')}>
          <Heart size={14} className="inline mr-1" /> Behandlungen
        </button>
        <button onClick={() => { setTab('deaths'); setPage(0); }} className={'px-4 py-2 rounded-lg text-sm font-semibold transition ' + (tab === 'deaths' ? 'bg-farm-red text-white' : 'bg-farm-card border border-farm-border text-gray-400 hover:text-white')}>
          <AlertTriangle size={14} className="inline mr-1" /> Todesfaelle
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Suchen..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none focus:border-farm-green" />
        </div>
        {tab === 'treatments' && (
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
            className="px-3 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none">
            <option value="all">Alle Typen</option>
            {TREATMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      <div className="bg-farm-card border border-farm-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-farm-border">
            {tab === 'treatments' ? (
              <>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Datum</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Tier</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Typ</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Medikament</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Dosis</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Verabreicht von</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Wartezeit</th>
              </>
            ) : (
              <>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Datum</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Tier</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Ursache</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Totgeburt</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Notizen</th>
              </>
            )}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Laden...</td></tr>}
            {!loading && tab === 'treatments' && items.map(t => {
              const isActive = t.wartezeit_until && t.wartezeit_until >= today();
              return (
                <tr key={t.id} onClick={() => openEditTreatment(t)} className="border-b border-farm-border/50 hover:bg-farm-border/30 cursor-pointer transition">
                  <td className="px-4 py-3 text-gray-400">{t.date}</td>
                  <td className="px-4 py-3 font-semibold">{animalLabel(t.animals)}</td>
                  <td className="px-4 py-3"><span className={'text-xs px-2 py-0.5 rounded ' + typeColor(t.treatment_type)}>{t.treatment_type}</span></td>
                  <td className="px-4 py-3">{t.medication_name}</td>
                  <td className="px-4 py-3 text-gray-400">{t.dosage || '-'}</td>
                  <td className="px-4 py-3 text-gray-400">{t.administered_by || '-'}</td>
                  <td className="px-4 py-3">{isActive ? (<span className="text-xs px-2 py-0.5 rounded bg-yellow-900/20 text-farm-yellow flex items-center gap-1 w-fit"><Clock size={10} /> bis {t.wartezeit_until}</span>) : t.wartezeit_until ? (<span className="text-xs text-gray-600">abgelaufen</span>) : '-'}</td>
                </tr>
              );
            })}
            {!loading && tab === 'deaths' && items.map(d => (
              <tr key={d.id} className="border-b border-farm-border/50">
                <td className="px-4 py-3 text-gray-400">{d.date}</td>
                <td className="px-4 py-3 font-semibold">{animalLabel(d.animals)}</td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-red-900/20 text-farm-red">{d.cause}</span></td>
                <td className="px-4 py-3">{d.stillborn ? 'Ja' : 'Nein'}</td>
                <td className="px-4 py-3 text-gray-400 truncate max-w-xs">{d.notes || '-'}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                {tab === 'treatments' ? 'Keine Behandlungen gefunden.' : 'Keine Todesfaelle erfasst.'}
              </td></tr>
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
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-lg font-bold">{editItem ? 'Behandlung bearbeiten' : 'Neue Behandlung'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            {saveError && (<div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">{saveError}</div>)}
            <div className="space-y-3">
              <AnimalPicker />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Typ</label><select value={form.treatment_type} onChange={e => setForm({...form, treatment_type: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">{TREATMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="block text-xs text-gray-400 mb-1">Datum</label><input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Medikament / Behandlung *</label><input value={form.medication_name} onChange={e => setForm({...form, medication_name: e.target.value})} placeholder="z.B. Ivermectin, Oxytetracyclin..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Dosis</label><input value={form.dosage} onChange={e => setForm({...form, dosage: e.target.value})} placeholder="z.B. 10ml, 2 Tabletten..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Verabreicht von</label><input value={form.administered_by} onChange={e => setForm({...form, administered_by: e.target.value})} placeholder="Name" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Tierarzt</label><input value={form.veterinarian} onChange={e => setForm({...form, veterinarian: e.target.value})} placeholder="Name des Tierarztes (optional)" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-yellow-900/10 border border-yellow-900/30">
                  <label className="block text-xs text-farm-yellow font-semibold mb-1">Wartezeit (Tage)</label>
                  <input type="number" value={form.wartezeit_days} onChange={e => setForm({...form, wartezeit_days: e.target.value})} placeholder="z.B. 28" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
                  <p className="text-[10px] text-gray-500 mt-1">Schlachtsperre nach Behandlung</p>
                </div>
                <div><label className="block text-xs text-gray-400 mb-1">Naechste Behandlung</label><input type="date" value={form.next_treatment_date} onChange={e => setForm({...form, next_treatment_date: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /><p className="text-[10px] text-gray-500 mt-1">Erinnerung fuer Folgebehandlung</p></div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Notizen</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} placeholder="Symptome, Bemerkungen..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition resize-none" /></div>
            </div>
            <button onClick={saveTreatment} className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition">{editItem ? 'Speichern' : 'Behandlung erfassen'}</button>
            {editItem && (<div className="mt-3">{!showDeleteConfirm ? (<button onClick={() => setShowDeleteConfirm(true)} className="w-full py-2 rounded-xl border border-red-800/50 text-farm-red text-sm hover:bg-red-900/20 transition flex items-center justify-center gap-2"><Trash2 size={14} /> Loeschen</button>) : (<div className="flex gap-2"><button onClick={deleteTreatment} className="flex-1 py-2 rounded-xl bg-red-900/30 border border-red-800 text-farm-red text-sm font-semibold hover:bg-red-900/50 transition">Ja, loeschen</button><button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-xl border border-farm-border text-gray-400 text-sm hover:bg-farm-border/30 transition">Abbrechen</button></div>)}</div>)}
          </div>
        </div>
      )}

      {showDeathModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-lg font-bold text-farm-red">Todesfall erfassen</h2>
              <button onClick={() => setShowDeathModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            {saveError && (<div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">{saveError}</div>)}
            <div className="space-y-3">
              <AnimalPicker />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Datum</label><input type="date" value={deathForm.date} onChange={e => setDeathForm({...deathForm, date: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Ursache</label><select value={deathForm.cause} onChange={e => setDeathForm({...deathForm, cause: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">{DEATH_CAUSES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={deathForm.stillborn} onChange={e => setDeathForm({...deathForm, stillborn: e.target.checked})} className="rounded" />
                <label className="text-sm text-gray-400">Totgeburt</label>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Notizen</label><textarea value={deathForm.notes} onChange={e => setDeathForm({...deathForm, notes: e.target.value})} rows={3} placeholder="Details zum Todesfall..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition resize-none" /></div>
            </div>
            <button onClick={saveDeath} className="w-full mt-4 py-3 rounded-xl bg-farm-red text-white font-semibold hover:bg-red-400 transition">Todesfall erfassen</button>
          </div>
        </div>
      )}

      {showHerdModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-lg font-bold">Herdenbehandlung</h2>
              <button onClick={() => setShowHerdModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Alle Tiere der ausgewaehlten Herde erhalten die gleiche Behandlung.</p>
            {saveError && (<div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">{saveError}</div>)}
            <div className="space-y-3">
              <div><label className="block text-xs text-gray-400 mb-1">Herde *</label><select value={herdForm.herd_id} onChange={e => setHerdForm({...herdForm, herd_id: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none"><option value="">Herde waehlen...</option>{herds.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Typ</label><select value={herdForm.treatment_type} onChange={e => setHerdForm({...herdForm, treatment_type: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">{TREATMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="block text-xs text-gray-400 mb-1">Datum</label><input type="date" value={herdForm.date} onChange={e => setHerdForm({...herdForm, date: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Medikament *</label><input value={herdForm.medication_name} onChange={e => setHerdForm({...herdForm, medication_name: e.target.value})} placeholder="z.B. Ivermectin..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Dosis</label><input value={herdForm.dosage} onChange={e => setHerdForm({...herdForm, dosage: e.target.value})} placeholder="z.B. 10ml pro Tier" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Verabreicht von</label><input value={herdForm.administered_by} onChange={e => setHerdForm({...herdForm, administered_by: e.target.value})} placeholder="Name" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Notizen</label><textarea value={herdForm.notes} onChange={e => setHerdForm({...herdForm, notes: e.target.value})} rows={2} placeholder="Zusaetzliche Infos..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition resize-none" /></div>
            </div>
            <button onClick={saveHerdTreatment} className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition">Alle Tiere behandeln</button>
          </div>
        </div>
      )}
    </div>
  );
}
