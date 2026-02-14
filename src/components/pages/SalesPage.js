'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Search, ChevronLeft, ChevronRight, Trash2, DollarSign, Users } from 'lucide-react';

const PER_PAGE = 20;
const SALE_TYPES = ['Schlachthof', 'Privat', 'Export', 'Auktion', 'Sonstige'];

function clean(obj) { const out = {}; for (const [k, v] of Object.entries(obj)) { if (v === '' || v === undefined) out[k] = null; else out[k] = v; } return out; }
function today() { return new Date().toISOString().split('T')[0]; }
function fmtGs(n) { if (!n) return '-'; return parseInt(n).toLocaleString('de-DE') + ' Gs'; }
function animalLabel(a) { if (!a) return '-'; return (a.name || 'Unbenannt') + (a.ear_tag ? ' (' + a.ear_tag + ')' : ''); }

export function SalesPage({ farmId }) {
  const [tab, setTab] = useState('sales');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBuyerModal, setShowBuyerModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [buyers, setBuyers] = useState([]);
  const [animalSearch, setAnimalSearch] = useState('');
  const [animalResults, setAnimalResults] = useState([]);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [stats, setStats] = useState({ totalSales: 0, thisMonth: 0, totalRevenue: 0, avgPriceKg: 0 });

  const [form, setForm] = useState({ animal_id: '', buyer_id: '', sale_type: 'Schlachthof', date: today(), weight_kg: '', price_per_kg: '', total_price: '', transport_cost: '', notes: '' });
  const [buyerForm, setBuyerForm] = useState({ name: '', contact: '', phone: '', buyer_type: 'Schlachthof', notes: '' });

  const loadItems = useCallback(async () => {
    setLoading(true);
    if (tab === 'sales') {
      let query = supabase.from('sales').select('*, animals(name, ear_tag, rfid, purchase_price), buyers(name)', { count: 'exact' }).eq('farm_id', farmId);
      if (search) query = query.or('notes.ilike.%' + search + '%,sale_type.ilike.%' + search + '%');
      query = query.order('date', { ascending: false }).range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);
      const { data, count } = await query;
      setItems(data || []); setTotal(count || 0);
    } else {
      let query = supabase.from('buyers').select('*', { count: 'exact' }).eq('farm_id', farmId);
      if (search) query = query.or('name.ilike.%' + search + '%');
      query = query.order('name').range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);
      const { data, count } = await query;
      setItems(data || []); setTotal(count || 0);
    }
    setLoading(false);
  }, [farmId, tab, search, page]);

  const loadStats = useCallback(async () => {
    const ms = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const { count: ts } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('farm_id', farmId);
    const { count: ms2 } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('farm_id', farmId).gte('date', ms);
    const { data: rd } = await supabase.from('sales').select('total_price, price_per_kg').eq('farm_id', farmId);
    const tr = (rd || []).reduce((s, r) => s + (parseFloat(r.total_price) || 0), 0);
    const ps = (rd || []).filter(r => r.price_per_kg).map(r => parseFloat(r.price_per_kg));
    const ap = ps.length > 0 ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
    setStats({ totalSales: ts || 0, thisMonth: ms2 || 0, totalRevenue: tr, avgPriceKg: Math.round(ap) });
  }, [farmId]);

  const loadBuyers = useCallback(async () => {
    const { data } = await supabase.from('buyers').select('id, name, buyer_type').eq('farm_id', farmId).order('name');
    setBuyers(data || []);
  }, [farmId]);

  useEffect(() => { if (farmId) { loadItems(); loadStats(); loadBuyers(); } }, [loadItems, loadStats, loadBuyers, farmId]);

  const searchAnimals = async (t) => { setAnimalSearch(t); if (t.length < 1) { setAnimalResults([]); return; } const { data } = await supabase.from('animals').select('id, name, ear_tag, rfid, weight_kg, purchase_price').eq('farm_id', farmId).or('name.ilike.%' + t + '%,ear_tag.ilike.%' + t + '%,rfid.ilike.%' + t + '%').limit(10); setAnimalResults(data || []); };
  const selectAnimal = (a) => { setSelectedAnimal(a); setForm(f => ({ ...f, animal_id: a.id, weight_kg: a.weight_kg || '' })); setAnimalSearch(''); setAnimalResults([]); };

  const openNewSale = () => { setEditItem(null); setSaveError(''); setShowDeleteConfirm(false); setSelectedAnimal(null); setAnimalSearch(''); setForm({ animal_id: '', buyer_id: '', sale_type: 'Schlachthof', date: today(), weight_kg: '', price_per_kg: '', total_price: '', transport_cost: '', notes: '' }); setShowModal(true); };

  const openEditSale = (s) => { setEditItem(s); setSaveError(''); setShowDeleteConfirm(false); setSelectedAnimal(s.animals || null); setForm({ animal_id: s.animal_id || '', buyer_id: s.buyer_id || '', sale_type: s.sale_type || 'Schlachthof', date: s.date || today(), weight_kg: s.weight_kg || '', price_per_kg: s.price_per_kg || '', total_price: s.total_price || '', transport_cost: s.transport_cost || '', notes: s.notes || '' }); setShowModal(true); };

  const saveSale = async () => {
    setSaveError('');
    if (!form.animal_id) { setSaveError('Tier auswaehlen'); return; }
    let tp = form.total_price ? parseFloat(form.total_price) : null;
    if (!tp && form.price_per_kg && form.weight_kg) tp = Math.round(parseFloat(form.price_per_kg) * parseFloat(form.weight_kg));
    if (!tp) { setSaveError('Preis eingeben'); return; }
    const payload = clean({ animal_id: form.animal_id, buyer_id: form.buyer_id || null, sale_type: form.sale_type, date: form.date, weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null, price_per_kg: form.price_per_kg ? parseFloat(form.price_per_kg) : null, total_price: tp, transport_cost: form.transport_cost ? parseFloat(form.transport_cost) : null, notes: form.notes, farm_id: farmId });
    let result;
    if (editItem) result = await supabase.from('sales').update(payload).eq('id', editItem.id);
    else result = await supabase.from('sales').insert(payload);
    if (result.error) { setSaveError(result.error.message); return; }
    if (!editItem) await supabase.from('animals').update({ status: 'verkauft' }).eq('id', form.animal_id);
    setShowModal(false); loadItems(); loadStats();
  };

  const deleteSale = async () => { if (!editItem) return; const { error } = await supabase.from('sales').delete().eq('id', editItem.id); if (error) { setSaveError(error.message); return; } setShowModal(false); loadItems(); loadStats(); };

  const openNewBuyer = () => { setSaveError(''); setBuyerForm({ name: '', contact: '', phone: '', buyer_type: 'Schlachthof', notes: '' }); setShowBuyerModal(true); };

  const saveBuyer = async () => { setSaveError(''); if (!buyerForm.name.trim()) { setSaveError('Name erforderlich'); return; } const payload = clean({ name: buyerForm.name.trim(), contact: buyerForm.contact, phone: buyerForm.phone, buyer_type: buyerForm.buyer_type, notes: buyerForm.notes, farm_id: farmId }); const { error } = await supabase.from('buyers').insert(payload); if (error) { setSaveError(error.message); return; } setShowBuyerModal(false); loadBuyers(); if (tab === 'buyers') loadItems(); };

  const updatePrice = (field, value) => { const f = { ...form, [field]: value }; if (field === 'price_per_kg' && f.weight_kg && value) f.total_price = Math.round(parseFloat(value) * parseFloat(f.weight_kg)); if (field === 'weight_kg' && f.price_per_kg && value) f.total_price = Math.round(parseFloat(f.price_per_kg) * parseFloat(value)); setForm(f); };

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Verkauf & Schlachtung</h1>
          <p className="text-sm text-gray-500 mt-1">{stats.totalSales} Verkaeufe</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openNewBuyer} className="flex items-center gap-2 px-4 py-2 bg-farm-card border border-farm-border text-gray-300 rounded-lg text-sm hover:border-farm-green transition"><Users size={16} /> Kaeufer</button>
          <button onClick={openNewSale} className="flex items-center gap-2 px-4 py-2 bg-farm-green text-black rounded-lg font-semibold text-sm hover:bg-green-300 transition"><Plus size={16} /> Verkauf</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-farm-card border border-farm-border rounded-xl p-4"><p className="text-xs text-gray-500">Diesen Monat</p><p className="text-2xl font-bold text-farm-green mt-1">{stats.thisMonth}</p></div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4"><p className="text-xs text-gray-500">Gesamt</p><p className="text-2xl font-bold mt-1">{stats.totalSales}</p></div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4"><p className="text-xs text-gray-500">Umsatz gesamt</p><p className="text-2xl font-bold text-farm-amber mt-1">{fmtGs(stats.totalRevenue)}</p></div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4"><p className="text-xs text-gray-500">Ø Preis/kg</p><p className="text-2xl font-bold text-farm-cyan mt-1">{fmtGs(stats.avgPriceKg)}</p></div>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => { setTab('sales'); setPage(0); }} className={'px-4 py-2 rounded-lg text-sm font-semibold transition ' + (tab === 'sales' ? 'bg-farm-green text-black' : 'bg-farm-card border border-farm-border text-gray-400 hover:text-white')}><DollarSign size={14} className="inline mr-1" /> Verkaeufe</button>
        <button onClick={() => { setTab('buyers'); setPage(0); }} className={'px-4 py-2 rounded-lg text-sm font-semibold transition ' + (tab === 'buyers' ? 'bg-farm-green text-black' : 'bg-farm-card border border-farm-border text-gray-400 hover:text-white')}><Users size={14} className="inline mr-1" /> Kaeufer</button>
      </div>

      <div className="flex gap-3 mb-4"><div className="relative flex-1 max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Suchen..." className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none focus:border-farm-green" /></div></div>

      <div className="bg-farm-card border border-farm-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-farm-border">
            {tab === 'sales' ? (<><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Datum</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Tier</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Kaeufer</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Typ</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Gewicht</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Gs/kg</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Gesamt</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Gewinn</th></>) : (<><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Name</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Typ</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Kontakt</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Telefon</th><th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Notizen</th></>)}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Laden...</td></tr>}
            {!loading && tab === 'sales' && items.map(s => {
              const profit = s.total_price && s.animals?.purchase_price ? parseFloat(s.total_price) - parseFloat(s.animals.purchase_price) - (parseFloat(s.transport_cost) || 0) : null;
              return (
                <tr key={s.id} onClick={() => openEditSale(s)} className="border-b border-farm-border/50 hover:bg-farm-border/30 cursor-pointer transition">
                  <td className="px-4 py-3 text-gray-400">{s.date}</td>
                  <td className="px-4 py-3 font-semibold">{animalLabel(s.animals)}</td>
                  <td className="px-4 py-3 text-gray-400">{s.buyers?.name || '-'}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-amber-900/20 text-farm-amber">{s.sale_type}</span></td>
                  <td className="px-4 py-3">{s.weight_kg ? s.weight_kg + ' kg' : '-'}</td>
                  <td className="px-4 py-3 text-gray-400">{s.price_per_kg ? fmtGs(s.price_per_kg) : '-'}</td>
                  <td className="px-4 py-3 font-bold text-farm-amber">{fmtGs(s.total_price)}</td>
                  <td className="px-4 py-3">{profit !== null ? (<span className={profit >= 0 ? 'text-farm-green font-semibold' : 'text-farm-red font-semibold'}>{profit >= 0 ? '+' : ''}{fmtGs(profit)}</span>) : '-'}</td>
                </tr>);
            })}
            {!loading && tab === 'buyers' && items.map(b => (
              <tr key={b.id} className="border-b border-farm-border/50 hover:bg-farm-border/30 transition">
                <td className="px-4 py-3 font-semibold">{b.name}</td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-blue-900/20 text-farm-blue">{b.buyer_type}</span></td>
                <td className="px-4 py-3 text-gray-400">{b.contact || '-'}</td>
                <td className="px-4 py-3 text-gray-400">{b.phone || '-'}</td>
                <td className="px-4 py-3 text-gray-400 truncate max-w-xs">{b.notes || '-'}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && (<tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">{tab === 'sales' ? 'Keine Verkaeufe.' : 'Keine Kaeufer.'}</td></tr>)}
          </tbody>
        </table>
        {totalPages > 1 && (<div className="flex items-center justify-between px-4 py-3 border-t border-farm-border"><span className="text-xs text-gray-500">Seite {page + 1} von {totalPages}</span><div className="flex gap-2"><button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded border border-farm-border hover:bg-farm-border disabled:opacity-30 transition"><ChevronLeft size={16} /></button><button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded border border-farm-border hover:bg-farm-border disabled:opacity-30 transition"><ChevronRight size={16} /></button></div></div>)}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6"><h2 className="font-display text-lg font-bold">{editItem ? 'Verkauf bearbeiten' : 'Neuer Verkauf'}</h2><button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button></div>
            {saveError && (<div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">{saveError}</div>)}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tier *</label>
                {selectedAnimal ? (
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-green text-sm"><span className="font-semibold">{animalLabel(selectedAnimal)}</span><button onClick={() => { setSelectedAnimal(null); setForm(f => ({...f, animal_id: ''})); }} className="text-gray-500 hover:text-white"><X size={14} /></button></div>
                ) : (
                  <div className="relative"><input value={animalSearch} onChange={e => searchAnimals(e.target.value)} placeholder="Name, Ohrmarke oder RFID..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" />{animalResults.length > 0 && (<div className="absolute z-10 top-full left-0 right-0 mt-1 bg-farm-card border border-farm-border rounded-lg shadow-xl max-h-48 overflow-y-auto">{animalResults.map(a => (<button key={a.id} onClick={() => selectAnimal(a)} className="w-full text-left px-3 py-2 text-sm hover:bg-farm-border/30 transition flex justify-between"><span className="font-semibold">{a.name || 'Unbenannt'}</span><span className="text-gray-500">{a.ear_tag || a.rfid || ''} {a.weight_kg ? a.weight_kg + 'kg' : ''}</span></button>))}</div>)}</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Typ</label><select value={form.sale_type} onChange={e => setForm({...form, sale_type: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">{SALE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="block text-xs text-gray-400 mb-1">Datum</label><input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Kaeufer</label><select value={form.buyer_id} onChange={e => setForm({...form, buyer_id: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none"><option value="">Kein Kaeufer</option>{buyers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.buyer_type})</option>)}</select></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Gewicht (kg)</label><input type="number" value={form.weight_kg} onChange={e => updatePrice('weight_kg', e.target.value)} placeholder="z.B. 450" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Preis/kg (Gs)</label><input type="number" value={form.price_per_kg} onChange={e => updatePrice('price_per_kg', e.target.value)} placeholder="z.B. 18000" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
                <div><label className="block text-xs text-farm-amber font-semibold mb-1">Gesamt (Gs)</label><input type="number" value={form.total_price} onChange={e => setForm({...form, total_price: e.target.value})} placeholder="auto" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-amber-800/50 text-sm outline-none focus:border-farm-amber transition font-bold" /></div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Transportkosten (Gs)</label><input type="number" value={form.transport_cost} onChange={e => setForm({...form, transport_cost: e.target.value})} placeholder="Optional" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Notizen</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} placeholder="Zusaetzliche Infos..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition resize-none" /></div>
            </div>
            <button onClick={saveSale} className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition">{editItem ? 'Speichern' : 'Verkauf erfassen'}</button>
            {editItem && (<div className="mt-3">{!showDeleteConfirm ? (<button onClick={() => setShowDeleteConfirm(true)} className="w-full py-2 rounded-xl border border-red-800/50 text-farm-red text-sm hover:bg-red-900/20 transition flex items-center justify-center gap-2"><Trash2 size={14} /> Loeschen</button>) : (<div className="flex gap-2"><button onClick={deleteSale} className="flex-1 py-2 rounded-xl bg-red-900/30 border border-red-800 text-farm-red text-sm font-semibold hover:bg-red-900/50 transition">Ja</button><button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-xl border border-farm-border text-gray-400 text-sm hover:bg-farm-border/30 transition">Nein</button></div>)}</div>)}
          </div>
        </div>
      )}

      {showBuyerModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6"><h2 className="font-display text-lg font-bold">Neuer Kaeufer</h2><button onClick={() => setShowBuyerModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button></div>
            {saveError && (<div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">{saveError}</div>)}
            <div className="space-y-3">
              <div><label className="block text-xs text-gray-400 mb-1">Name *</label><input value={buyerForm.name} onChange={e => setBuyerForm({...buyerForm, name: e.target.value})} placeholder="z.B. Frigorifico Neuland" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Typ</label><select value={buyerForm.buyer_type} onChange={e => setBuyerForm({...buyerForm, buyer_type: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">{SALE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-400 mb-1">Kontakt</label><input value={buyerForm.contact} onChange={e => setBuyerForm({...buyerForm, contact: e.target.value})} placeholder="Name" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Telefon</label><input value={buyerForm.phone} onChange={e => setBuyerForm({...buyerForm, phone: e.target.value})} placeholder="+595..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              </div>
              <div><label className="block text-xs text-gray-400 mb-1">Notizen</label><textarea value={buyerForm.notes} onChange={e => setBuyerForm({...buyerForm, notes: e.target.value})} rows={2} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition resize-none" /></div>
            </div>
            <button onClick={saveBuyer} className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition">Kaeufer speichern</button>
          </div>
        </div>
      )}
    </div>
  );
}
