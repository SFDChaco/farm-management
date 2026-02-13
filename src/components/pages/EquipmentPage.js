'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Search, ChevronLeft, ChevronRight, Trash2, Truck, MapPin, Fuel, Clock, Wrench } from 'lucide-react';

const EQUIPMENT_TYPES = ['Traktor', 'Pickup', 'LKW', 'Motorrad', 'Maehwerk', 'Ballenpresse', 'Anhaenger', 'Pumpe', 'Generator', 'Sonstige'];
const EQUIPMENT_STATUS = ['aktiv', 'in Wartung', 'defekt', 'ausser Betrieb'];
const PER_PAGE = 20;

function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
}

export function EquipmentPage({ farmId }) {
  const [equipment, setEquipment] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [fuelForm, setFuelForm] = useState({ equipment_id: '', liters: '', cost_per_liter: '', date: new Date().toISOString().split('T')[0], notes: '' });
  const [fuelError, setFuelError] = useState('');
  const [form, setForm] = useState({
    name: '', equipment_type: 'Traktor', brand: '', model: '', year: '',
    license_plate: '', status: 'aktiv', gps_device_id: '', fuel_type: 'Diesel',
    avg_consumption_lh: '', purchase_date: '', purchase_cost: '',
    hours_total: '', km_total: '', notes: ''
  });

  const loadEquipment = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('equipment').select('*', { count: 'exact' }).eq('farm_id', farmId);
    if (search) query = query.or(`name.ilike.%${search}%,brand.ilike.%${search}%,license_plate.ilike.%${search}%`);
    if (typeFilter !== 'all') query = query.eq('equipment_type', typeFilter);
    query = query.order('name', { ascending: true }).range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);
    const { data, count } = await query;
    setEquipment(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [farmId, search, typeFilter, page]);

  useEffect(() => { if (farmId) loadEquipment(); }, [loadEquipment, farmId]);

  const openNew = () => {
    setEditItem(null);
    setSaveError('');
    setShowDeleteConfirm(false);
    setForm({
      name: '', equipment_type: 'Traktor', brand: '', model: '', year: '',
      license_plate: '', status: 'aktiv', gps_device_id: '', fuel_type: 'Diesel',
      avg_consumption_lh: '', purchase_date: '', purchase_cost: '',
      hours_total: '', km_total: '', notes: ''
    });
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setSaveError('');
    setShowDeleteConfirm(false);
    setForm({
      name: item.name || '',
      equipment_type: item.equipment_type || 'Traktor',
      brand: item.brand || '',
      model: item.model || '',
      year: item.year || '',
      license_plate: item.license_plate || '',
      status: item.status || 'aktiv',
      gps_device_id: item.gps_device_id || '',
      fuel_type: item.fuel_type || 'Diesel',
      avg_consumption_lh: item.avg_consumption_lh || '',
      purchase_date: item.purchase_date || '',
      purchase_cost: item.purchase_cost || '',
      hours_total: item.hours_total || '',
      km_total: item.km_total || '',
      notes: item.notes || ''
    });
    setShowModal(true);
    loadFuelLogs(item.id);
  };

  const loadFuelLogs = async (equipmentId) => {
    const { data } = await supabase.from('fuel_logs').select('*').eq('equipment_id', equipmentId).order('date', { ascending: false }).limit(10);
    setFuelLogs(data || []);
  };

  const save = async () => {
    setSaveError('');
    if (!form.name.trim()) { setSaveError('Name ist erforderlich'); return; }
    const payload = clean({
      name: form.name.trim(),
      equipment_type: form.equipment_type,
      brand: form.brand,
      model: form.model,
      year: form.year ? parseInt(form.year) : null,
      license_plate: form.license_plate,
      status: form.status,
      gps_device_id: form.gps_device_id,
      fuel_type: form.fuel_type,
      avg_consumption_lh: form.avg_consumption_lh ? parseFloat(form.avg_consumption_lh) : null,
      purchase_date: form.purchase_date || null,
      purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : null,
      hours_total: form.hours_total ? parseFloat(form.hours_total) : null,
      km_total: form.km_total ? parseFloat(form.km_total) : null,
      notes: form.notes,
      farm_id: farmId,
    });

    let result;
    if (editItem) {
      result = await supabase.from('equipment').update(payload).eq('id', editItem.id);
    } else {
      result = await supabase.from('equipment').insert(payload);
    }

    if (result.error) { setSaveError(result.error.message); return; }
    setShowModal(false);
    loadEquipment();
  };

  const deleteItem = async () => {
    if (!editItem) return;
    const { error } = await supabase.from('equipment').delete().eq('id', editItem.id);
    if (error) { setSaveError(error.message); return; }
    setShowModal(false);
    loadEquipment();
  };

  const saveFuel = async () => {
    setFuelError('');
    if (!fuelForm.liters) { setFuelError('Liter ist erforderlich'); return; }
    const payload = clean({
      equipment_id: editItem.id,
      farm_id: farmId,
      liters: parseFloat(fuelForm.liters),
      cost_per_liter: fuelForm.cost_per_liter ? parseFloat(fuelForm.cost_per_liter) : null,
      total_cost: fuelForm.liters && fuelForm.cost_per_liter ? parseFloat(fuelForm.liters) * parseFloat(fuelForm.cost_per_liter) : null,
      date: fuelForm.date || new Date().toISOString().split('T')[0],
      notes: fuelForm.notes,
    });
    const { error } = await supabase.from('fuel_logs').insert(payload);
    if (error) { setFuelError(error.message); return; }
    setShowFuelModal(false);
    setFuelForm({ equipment_id: '', liters: '', cost_per_liter: '', date: new Date().toISOString().split('T')[0], notes: '' });
    loadFuelLogs(editItem.id);
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  const statusColor = (s) => {
    if (s === 'aktiv') return 'text-farm-green';
    if (s === 'in Wartung') return 'text-farm-amber';
    return 'text-farm-red';
  };
  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Maschinen & Geraete</h1>
          <p className="text-sm text-gray-500 mt-1">{total} Geraete erfasst</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-farm-green text-black rounded-lg font-semibold text-sm hover:bg-green-300 transition">
          <Plus size={16} /> Geraet hinzufuegen
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Name, Marke oder Kennzeichen..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none focus:border-farm-green" />
        </div>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
          className="px-3 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none">
          <option value="all">Alle Typen</option>
          {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="bg-farm-card border border-farm-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-farm-border">
              {['', 'Name', 'Typ', 'Marke/Modell', 'Kennzeichen', 'GPS', 'Stunden', 'Km', 'Status'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Laden...</td></tr>}
            {!loading && equipment.map(e => (
              <tr key={e.id} onClick={() => openEdit(e)}
                className="border-b border-farm-border/50 hover:bg-farm-border/30 cursor-pointer transition">
                <td className="px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-farm-border/50 flex items-center justify-center">
                    <Truck size={16} className="text-farm-amber" />
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold">{e.name}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-900/20 text-farm-amber">{e.equipment_type}</span>
                </td>
                <td className="px-4 py-3 text-gray-400">{[e.brand, e.model].filter(Boolean).join(' ') || '-'}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{e.license_plate || '-'}</td>
                <td className="px-4 py-3">
                  {e.gps_device_id ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-900/20 text-farm-green flex items-center gap-1 w-fit">
                      <MapPin size={10} /> GPS
                    </span>
                  ) : (
                    <span className="text-xs text-gray-600">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400">{e.hours_total ? `${e.hours_total}h` : '-'}</td>
                <td className="px-4 py-3 text-gray-400">{e.km_total ? `${parseInt(e.km_total).toLocaleString('de-DE')}` : '-'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${statusColor(e.status)}`}>{e.status}</span>
                </td>
              </tr>
            ))}
            {!loading && equipment.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                Keine Geraete gefunden. Klicke &quot;Geraet hinzufuegen&quot; um loszulegen.
              </td></tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-farm-border">
            <span className="text-xs text-gray-500">Seite {page + 1} von {totalPages}</span>
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
              <h2 className="font-display text-lg font-bold">{editItem ? 'Geraet bearbeiten' : 'Neues Geraet'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>

            {saveError && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">Fehler: {saveError}</div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="z.B. Traktor John Deere, Pickup Toyota..."
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Typ</label>
                <select value={form.equipment_type} onChange={e => setForm({...form, equipment_type: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">
                  {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">
                  {EQUIPMENT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Marke</label>
                <input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})}
                  placeholder="z.B. John Deere, Toyota..."
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Modell</label>
                <input value={form.model} onChange={e => setForm({...form, model: e.target.value})}
                  placeholder="z.B. 5075E, Hilux..."
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Baujahr</label>
                <input type="number" value={form.year} onChange={e => setForm({...form, year: e.target.value})}
                  placeholder="z.B. 2020"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Kennzeichen</label>
                <input value={form.license_plate} onChange={e => setForm({...form, license_plate: e.target.value})}
                  placeholder="z.B. ABC-1234"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div className="col-span-2 p-3 rounded-lg bg-green-900/10 border border-green-900/30">
                <label className="block text-xs text-farm-green font-semibold mb-1">GPS Geraete-ID (Cybermapa/Optify)</label>
                <input value={form.gps_device_id} onChange={e => setForm({...form, gps_device_id: e.target.value})}
                  placeholder="ID aus Cybermapa Dashboard kopieren"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
                <p className="text-[10px] text-gray-500 mt-1">Wenn GPS installiert: Geraete-ID hier eintragen fuer automatisches Tracking</p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Kraftstoff</label>
                <select value={form.fuel_type} onChange={e => setForm({...form, fuel_type: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">
                  <option value="Diesel">Diesel</option>
                  <option value="Benzin">Benzin</option>
                  <option value="Elektro">Elektro</option>
                  <option value="Keiner">Keiner</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Verbrauch (L/h)</label>
                <input type="number" step="0.1" value={form.avg_consumption_lh} onChange={e => setForm({...form, avg_consumption_lh: e.target.value})}
                  placeholder="z.B. 8.5"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Betriebsstunden</label>
                <input type="number" value={form.hours_total} onChange={e => setForm({...form, hours_total: e.target.value})}
                  placeholder="z.B. 4500"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Kilometerstand</label>
                <input type="number" value={form.km_total} onChange={e => setForm({...form, km_total: e.target.value})}
                  placeholder="z.B. 85000"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Kaufdatum</label>
                <input type="date" value={form.purchase_date} onChange={e => setForm({...form, purchase_date: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Kaufpreis (Gs)</label>
                <input type="number" value={form.purchase_cost} onChange={e => setForm({...form, purchase_cost: e.target.value})}
                  placeholder="z.B. 150000000"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Notizen</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                  rows={2} placeholder="Zusaetzliche Infos..."
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition resize-none" />
              </div>
            </div>
{editItem && (
              <div className="mt-4 pt-4 border-t border-farm-border">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Fuel size={14} className="text-farm-amber" /> Tankprotokoll</h3>
                  <button onClick={() => { setFuelError(''); setShowFuelModal(true); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-900/20 text-farm-amber hover:bg-amber-900/30 transition">
                    + Tanken
                  </button>
                </div>
                {fuelLogs.length === 0 ? (
                  <p className="text-xs text-gray-500">Noch keine Tankeintraege.</p>
                ) : (
                  <div className="space-y-1">
                    {fuelLogs.map(fl => (
                      <div key={fl.id} className="flex justify-between text-xs py-1.5 border-b border-farm-border/30">
                        <span className="text-gray-400">{fl.date}</span>
                        <span className="font-semibold">{fl.liters}L</span>
                        <span className="text-gray-500">{fl.total_cost ? `${parseInt(fl.total_cost).toLocaleString('de-DE')} Gs` : '-'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={save}
              className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition">
              {editItem ? 'Speichern' : 'Geraet hinzufuegen'}
            </button>

            {editItem && (
              <div className="mt-3">
                {!showDeleteConfirm ? (
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2 rounded-xl border border-red-800/50 text-farm-red text-sm hover:bg-red-900/20 transition flex items-center justify-center gap-2">
                    <Trash2 size={14} /> Geraet loeschen
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={deleteItem}
                      className="flex-1 py-2 rounded-xl bg-red-900/30 border border-red-800 text-farm-red text-sm font-semibold hover:bg-red-900/50 transition">
                      Ja, loeschen
                    </button>
                    <button onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-2 rounded-xl border border-farm-border text-gray-400 text-sm hover:bg-farm-border/30 transition">
                      Abbrechen
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showFuelModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-base font-bold">Tanken erfassen</h3>
              <button onClick={() => setShowFuelModal(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            {fuelError && (
              <div className="mb-3 p-2 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-xs">Fehler: {fuelError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Liter *</label>
                <input type="number" step="0.1" value={fuelForm.liters} onChange={e => setFuelForm({...fuelForm, liters: e.target.value})}
                  placeholder="z.B. 120"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Preis pro Liter (Gs)</label>
                <input type="number" value={fuelForm.cost_per_liter} onChange={e => setFuelForm({...fuelForm, cost_per_liter: e.target.value})}
                  placeholder="z.B. 7500"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              {fuelForm.liters && fuelForm.cost_per_liter && (
                <div className="text-sm text-farm-amber font-semibold">
                  Gesamt: {(parseFloat(fuelForm.liters) * parseFloat(fuelForm.cost_per_liter)).toLocaleString('de-DE')} Gs
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Datum</label>
                <input type="date" value={fuelForm.date} onChange={e => setFuelForm({...fuelForm, date: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notiz</label>
                <input value={fuelForm.notes} onChange={e => setFuelForm({...fuelForm, notes: e.target.value})}
                  placeholder="z.B. Tankstelle Loma Plata"
                  className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />
              </div>
              <button onClick={saveFuel}
                className="w-full py-2.5 rounded-xl bg-farm-amber text-black font-semibold hover:bg-yellow-300 transition">
                Tanken speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
