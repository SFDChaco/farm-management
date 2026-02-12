'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, X, Upload, ChevronLeft, ChevronRight } from 'lucide-react';

const ANIMAL_TYPES = ['Rind','Kuh','Kalb','Stier','Schaf','Pferd','Ziege','Schwein','Esel','Maultier'];
const PER_PAGE = 50;

function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
}

export function AnimalsPage({ farmId }) {
  const [animals, setAnimals] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editAnimal, setEditAnimal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({
    rfid: '', ear_tag: '', name: '', animal_type: 'Rind', breed: '', sex: 'w',
    born: '', weight_kg: '', status: 'gesund', purchase_cost: '', is_mast: false, notes: ''
  });

  const loadAnimals = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('animals').select('*', { count: 'exact' }).eq('farm_id', farmId);
    if (search) query = query.or(`name.ilike.%${search}%,rfid.ilike.%${search}%,ear_tag.ilike.%${search}%`);
    if (typeFilter !== 'all') query = query.eq('animal_type', typeFilter);
    query = query.order('created_at', { ascending: false }).range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);
    const { data, count } = await query;
    setAnimals(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [farmId, search, typeFilter, page]);

  useEffect(() => { if (farmId) loadAnimals(); }, [loadAnimals, farmId]);

  const openNew = () => {
    setEditAnimal(null);
    setSaveError('');
    setForm({ rfid: '', ear_tag: '', name: '', animal_type: 'Rind', breed: '', sex: 'w', born: '', weight_kg: '', status: 'gesund', purchase_cost: '', is_mast: false, notes: '' });
    setShowModal(true);
  };

  const openEdit = (a) => {
    setEditAnimal(a);
    setSaveError('');
    setForm({
      rfid: a.rfid || '', ear_tag: a.ear_tag || '', name: a.name || '', animal_type: a.animal_type || 'Rind',
      breed: a.breed || '', sex: a.sex || 'w', born: a.born || '', weight_kg: a.weight_kg || '',
      status: a.status || 'gesund', purchase_cost: a.purchase_cost || '', is_mast: a.is_mast || false, notes: a.notes || ''
    });
    setShowModal(true);
  };

  const save = async () => {
    setSaveError('');
    const payload = clean({
      name: form.name || 'Unbenannt',
      rfid: form.rfid,
      ear_tag: form.ear_tag,
      animal_type: form.animal_type || 'Rind',
      breed: form.breed,
      sex: form.sex || 'w',
      born: form.born || null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      status: form.status || 'gesund',
      purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : 0,
      is_mast: form.is_mast || false,
      notes: form.notes,
      farm_id: farmId,
    });

    let result;
    if (editAnimal) {
      result = await supabase.from('animals').update(payload).eq('id', editAnimal.id);
    } else {
      result = await supabase.from('animals').insert(payload);
    }

    if (result.error) {
      setSaveError(result.error.message);
      return;
    }

    setShowModal(false);
    loadAnimals();
  };

  const uploadPhoto = async (animalId, file) => {
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${farmId}/${animalId}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('animal-photos').upload(path, file, { upsert: true });
    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage.from('animal-photos').getPublicUrl(path);
      await supabase.from('animals').update({ photo_url: publicUrl }).eq('id', animalId);
      loadAnimals();
    }
    setUploading(false);
  };

  const totalPages = Math.ceil(total / PER_PAGE);
  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Viehbestand</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString('de-DE')} Tiere</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-farm-green text-black rounded-lg font-semibold text-sm hover:bg-green-300 transition">
          <Plus size={16} /> Tier hinzufuegen
        </button>
      </div>
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Name, RFID oder Ohrmarke suchen..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none focus:border-farm-green" />
        </div>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
          className="px-3 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none">
          <option value="all">Alle Typen</option>
          {ANIMAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="bg-farm-card border border-farm-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-farm-border">
              {['Foto','Name','RFID','Ohrmarke','Typ','Rasse','Geschl.','Gewicht','Status','Einkauf'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">Laden...</td></tr>}
            {!loading && animals.map(a => (
              <tr key={a.id} onClick={() => openEdit(a)}
                className="border-b border-farm-border/50 hover:bg-farm-border/30 cursor-pointer transition">
                <td className="px-4 py-2">
                  {a.photo_url ? (
                    <img src={a.photo_url} alt={a.name} className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-farm-bg flex items-center justify-center text-gray-600 text-xs">
                      {a.sex === 'm' ? 'M' : 'W'}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 font-semibold">{a.name || '-'}</td>
                <td className="px-4 py-2 text-gray-400 font-mono text-xs">{a.rfid || '-'}</td>
                <td className="px-4 py-2 text-gray-400">{a.ear_tag || '-'}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${a.is_mast ? 'bg-cyan-900/30 text-farm-cyan' : 'bg-green-900/20 text-farm-green'}`}>
                    {a.animal_type}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-400">{a.breed || '-'}</td>
                <td className="px-4 py-2">{a.sex === 'm' ? 'M' : 'W'}</td>
                <td className="px-4 py-2 font-semibold">{a.weight_kg ? `${a.weight_kg}kg` : '-'}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs ${a.status === 'gesund' ? 'text-farm-green' : 'text-farm-red'}`}>{a.status}</span>
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs">{a.purchase_cost > 0 ? `${parseInt(a.purchase_cost).toLocaleString('de-DE')} Gs` : '-'}</td>
              </tr>
            ))}
            {!loading && animals.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                Keine Tiere gefunden.
              </td></tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-farm-border">
            <span className="text-xs text-gray-500">Seite {page + 1} von {totalPages} - {total} Tiere</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded border border-farm-border hover:bg-farm-border disabled:opacity-30 transition">
                <ChevronLeft size={16} />
              </button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded border border-farm-border hover:bg-farm-border disabled:opacity-30 transition">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
{showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-lg font-bold">{editAnimal ? 'Tier bearbeiten' : 'Neues Tier'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            {saveError && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">
                Fehler: {saveError}
              </div>
            )}
            {editAnimal && (
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">Foto</label>
                <div className="flex items-center gap-4">
                  {editAnimal.photo_url && <img src={editAnimal.photo_url} className="w-16 h-16 rounded-xl object-cover" />}
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-farm-border text-xs cursor-pointer hover:border-farm-green transition">
                    <Upload size={14} /> {uploading ? 'Hochladen...' : 'Foto hochladen'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) uploadPhoto(editAnimal.id, e.target.files[0]); }} />
                  </label>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <InputField label="Name" value={form.name} onChange={v => setForm({...form, name: v})} />
              <InputField label="RFID" value={form.rfid} onChange={v => setForm({...form, rfid: v})} placeholder="DE-014-..." />
              <InputField label="Sichtbare Ohrmarke" value={form.ear_tag} onChange={v => setForm({...form, ear_tag: v})} placeholder="Nr. auf Marke" />
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tierart</label>
                <select value={form.animal_type} onChange={e => setForm({...form, animal_type: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">
                  {ANIMAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <InputField label="Rasse" value={form.breed} onChange={v => setForm({...form, breed: v})} />
              <div>
                <label className="block text-xs text-gray-400 mb-1">Geschlecht</label>
                <select value={form.sex} onChange={e => setForm({...form, sex: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">
                  <option value="w">W Weiblich</option>
                  <option value="m">M Maennlich</option>
                </select>
              </div>
              <InputField label="Geburtsdatum" value={form.born} onChange={v => setForm({...form, born: v})} type="date" />
              <InputField label="Gewicht (kg)" value={form.weight_kg} onChange={v => setForm({...form, weight_kg: v})} type="number" />
              <InputField label="Einkaufspreis (Gs)" value={form.purchase_cost} onChange={v => setForm({...form, purchase_cost: v})} type="number" />
              <InputField label="Status" value={form.status} onChange={v => setForm({...form, status: v})} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={form.is_mast} onChange={e => setForm({...form, is_mast: e.target.checked})} id="mast" className="rounded" />
              <label htmlFor="mast" className="text-sm text-gray-400">Masttier</label>
            </div>
            <InputField label="Notizen" value={form.notes} onChange={v => setForm({...form, notes: v})} className="mt-3" />
            <button onClick={save}
              className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition">
              {editAnimal ? 'Speichern' : 'Tier hinzufuegen'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InputField({ label, value, onChange, type = 'text', placeholder = '', className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
    </div>
  );
}
