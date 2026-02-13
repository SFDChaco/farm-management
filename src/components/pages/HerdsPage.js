'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Search, ChevronLeft, ChevronRight, Trash2, Users, Tag } from 'lucide-react';

const PER_PAGE = 20;

function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
}

export function HerdsPage({ farmId }) {
  const [herds, setHerds] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editHerd, setEditHerd] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fields, setFields] = useState([]);
  const [herdAnimals, setHerdAnimals] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [unassignedAnimals, setUnassignedAnimals] = useState([]);
  const [form, setForm] = useState({
    name: '', description: '', field_id: '', target_weight: '', notes: ''
  });

  const loadHerds = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('herds').select('*, fields(name)', { count: 'exact' }).eq('farm_id', farmId);
    if (search) query = query.ilike('name', `%${search}%`);
    query = query.order('name', { ascending: true }).range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);
    const { data, count } = await query;
    if (data && data.length > 0) {
      const herdIds = data.map(h => h.id);
      const { data: animalCounts } = await supabase.from('animals').select('herd_id').in('herd_id', herdIds);
      const counts = {};
      (animalCounts || []).forEach(a => { counts[a.herd_id] = (counts[a.herd_id] || 0) + 1; });
      data.forEach(h => { h.animal_count = counts[h.id] || 0; });
    }
    setHerds(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [farmId, search, page]);

  const loadFields = useCallback(async () => {
    const { data } = await supabase.from('fields').select('id, name, field_type').eq('farm_id', farmId).order('name');
    setFields(data || []);
  }, [farmId]);

  useEffect(() => { if (farmId) { loadHerds(); loadFields(); } }, [loadHerds, loadFields, farmId]);

  const loadHerdAnimals = async (herdId) => {
    const { data } = await supabase.from('animals').select('id, name, ear_tag, rfid, animal_type, weight_kg, sex').eq('herd_id', herdId).order('name');
    setHerdAnimals(data || []);
  };

  const loadUnassigned = async (searchTerm) => {
    let query = supabase.from('animals').select('id, name, ear_tag, rfid, animal_type, weight_kg, sex')
      .eq('farm_id', farmId).is('herd_id', null);
    if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,ear_tag.ilike.%${searchTerm}%,rfid.ilike.%${searchTerm}%`);
    query = query.order('name').limit(50);
    const { data } = await query;
    setUnassignedAnimals(data || []);
  };

  const openNew = () => {
    setEditHerd(null); setSaveError(''); setShowDeleteConfirm(false); setHerdAnimals([]);
    setForm({ name: '', description: '', field_id: '', target_weight: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (h) => {
    setEditHerd(h); setSaveError(''); setShowDeleteConfirm(false);
    setForm({
      name: h.name || '', description: h.description || '', field_id: h.field_id || '',
      target_weight: h.target_weight || '', notes: h.notes || ''
    });
    setShowModal(true);
    loadHerdAnimals(h.id);
  };

  const save = async () => {
    setSaveError('');
    if (!form.name.trim()) { setSaveError('Name ist erforderlich'); return; }
    const payload = clean({
      name: form.name.trim(), description: form.description, field_id: form.field_id || null,
      target_weight: form.target_weight ? parseFloat(form.target_weight) : null,
      notes: form.notes, farm_id: farmId,
    });
    let result;
    if (editHerd) { result = await supabase.from('herds').update(payload).eq('id', editHerd.id); }
    else { result = await supabase.from('herds').insert(payload); }
    if (result.error) { setSaveError(result.error.message); return; }
    setShowModal(false); loadHerds();
  };

  const deleteHerd = async () => {
    if (!editHerd) return;
    await supabase.from('animals').update({ herd_id: null }).eq('herd_id', editHerd.id);
    const { error } = await supabase.from('herds').delete().eq('id', editHerd.id);
    if (error) { setSaveError(error.message); return; }
    setShowModal(false); loadHerds();
  };

  const assignAnimal = async (animalId) => {
    await supabase.from('animals').update({ herd_id: editHerd.id }).eq('id', animalId);
    loadHerdAnimals(editHerd.id); loadUnassigned(assignSearch); loadHerds();
  };

  const removeAnimal = async (animalId) => {
    await supabase.from('animals').update({ herd_id: null }).eq('id', animalId);
    loadHerdAnimals(editHerd.id); loadHerds();
  };

  const openAssign = () => {
    setAssignSearch(''); setShowAssignModal(true); loadUnassigned('');
  };

  const totalPages = Math.ceil(total / PER_PAGE);
  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Herden</h1>
          <p className="text-sm text-gray-500 mt-1">{total} Herden</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-farm-green text-black rounded-lg font-semibold text-sm hover:bg-green-300 transition">
          <Plus size={16} /> Herde hinzufuegen
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Herde suchen..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none focus:border-farm-green" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && <div className="col-span-3 text-center text-gray-500 py-12">Laden...</div>}
        {!loading && herds.map(h => (
          <div key={h.id} onClick={() => openEdit(h)}
            className="bg-farm-card border border-farm-border rounded-xl p-5 hover:border-farm-green/50 cursor-pointer transition">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-900/20 flex items-center justify-center">
                <Users size={18} className="text-farm-blue" />
              </div>
              <div>
                <h3 className="font-semibold text-base">{h.name}</h3>
                {h.description && <p className="text-xs text-gray-500">{h.description}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 rounded-lg bg-farm-bg">
                <div className="text-xl font-bold text-farm-green">{h.animal_count || 0}</div>
                <div className="text-[10px] text-gray-500">Tiere</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-farm-bg">
                <div className="text-sm font-semibold text-gray-300 truncate">{h.fields?.name || 'Kein Feld'}</div>
                <div className="text-[10px] text-gray-500">Potrero</div>
              </div>
            </div>
            {h.target_weight && <div className="mt-2 text-xs text-gray-500">Zielgewicht: {h.target_weight}kg</div>}
          </div>
        ))}
        {!loading && herds.length === 0 && (
          <div className="col-span-3 text-center text-gray-500 py-12">
            Keine Herden gefunden. Klicke &quot;Herde hinzufuegen&quot; um loszulegen.
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-500">Seite {page + 1} von {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded border border-farm-border hover:bg-farm-border disabled:opacity-30 transition"><ChevronLeft size={16} /></button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded border border-farm-border hover:bg-farm-border disabled:opacity-30 transition"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-lg font-bold">{editHerd ? 'Herde bearbeiten' : 'Neue Herde'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>

            {saveError && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">Fehler: {saveError}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="z.B. Mastgruppe 1, Kuehe Nord..."
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Beschreibung</label>
                <input value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="z.B. Masttiere 300-400kg..."
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Potrero / Feld</label>
                <select value={form.field_id} onChange={e => setForm({...form, field_id: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">
                  <option value="">Kein Feld zugewiesen</option>
                  {fields.map(f => <option key={f.id} value={f.id}>{f.name} ({f.field_type})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Zielgewicht (kg)</label>
                <input type="number" value={form.target_weight} onChange={e => setForm({...form, target_weight: e.target.value})}
                  placeholder="z.B. 480"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notizen</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                  rows={2} placeholder="Zusaetzliche Infos..."
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition resize-none" />
              </div>
            </div>

            {editHerd && (
              <div className="mt-4 pt-4 border-t border-farm-border">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Tag size={14} className="text-farm-green" /> Tiere ({herdAnimals.length})
                  </h3>
                  <button onClick={openAssign}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-900/20 text-farm-green hover:bg-green-900/30 transition">
                    + Tiere zuweisen
                  </button>
                </div>
                {herdAnimals.length === 0 ? (
                  <p className="text-xs text-gray-500">Noch keine Tiere zugewiesen.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {herdAnimals.map(a => (
                      <div key={a.id} className="flex justify-between items-center text-xs py-2 px-2 rounded-lg hover:bg-farm-border/30">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{a.name || 'Unbenannt'}</span>
                          <span className="text-gray-500">{a.ear_tag || a.rfid || ''}</span>
                          <span className="text-gray-600">{a.animal_type}</span>
                          {a.weight_kg && <span className="text-farm-green">{a.weight_kg}kg</span>}
                        </div>
                        <button onClick={(ev) => { ev.stopPropagation(); removeAnimal(a.id); }}
                          className="text-gray-500 hover:text-farm-red transition p-1"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={save}
              className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition">
              {editHerd ? 'Speichern' : 'Herde hinzufuegen'}
            </button>
{editHerd && (
              <div className="mt-3">
                {!showDeleteConfirm ? (
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2 rounded-xl border border-red-800/50 text-farm-red text-sm hover:bg-red-900/20 transition flex items-center justify-center gap-2">
                    <Trash2 size={14} /> Herde loeschen
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={deleteHerd}
                      className="flex-1 py-2 rounded-xl bg-red-900/30 border border-red-800 text-farm-red text-sm font-semibold hover:bg-red-900/50 transition">Ja, loeschen</button>
                    <button onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-2 rounded-xl border border-farm-border text-gray-400 text-sm hover:bg-farm-border/30 transition">Abbrechen</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-base font-bold">Tiere zuweisen</h3>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Zeigt nur Tiere ohne Herde. Klicke auf ein Tier um es zuzuweisen.</p>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={assignSearch} onChange={e => { setAssignSearch(e.target.value); loadUnassigned(e.target.value); }}
                placeholder="Name, Ohrmarke oder RFID..."
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green" />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {unassignedAnimals.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">Keine verfuegbaren Tiere gefunden.</p>
              ) : (
                unassignedAnimals.map(a => (
                  <button key={a.id} onClick={() => assignAnimal(a.id)}
                    className="w-full flex items-center justify-between text-xs py-2.5 px-3 rounded-lg hover:bg-green-900/20 transition text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{a.name || 'Unbenannt'}</span>
                      <span className="text-gray-500">{a.ear_tag || ''}</span>
                      <span className="text-gray-600">{a.animal_type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.weight_kg && <span className="text-farm-green">{a.weight_kg}kg</span>}
                      <Plus size={12} className="text-farm-green" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
