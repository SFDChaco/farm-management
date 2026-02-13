'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, MapPin, Maximize2, Trees, Wheat, Droplets, Search, ChevronLeft, ChevronRight, Trash2, Upload, Map } from 'lucide-react';

const FIELD_TYPES = ['Weide', 'Pangola', 'Wald', 'Infrastruktur', 'Wasserquelle', 'Brache'];
const FIELD_STATUS = ['aktiv', 'in Ruhe', 'ueberweidet', 'neu bepflanzt', 'gesperrt'];
const PER_PAGE = 20;

function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === undefined) out[k] = null;
    else out[k] = v;
  }
  return out;
}

const statusColors = {
  'aktiv': 'bg-green-900/20 text-farm-green',
  'in Ruhe': 'bg-yellow-900/20 text-farm-yellow',
  'ueberweidet': 'bg-red-900/20 text-farm-red',
  'neu bepflanzt': 'bg-cyan-900/20 text-farm-cyan',
  'gesperrt': 'bg-gray-700/30 text-gray-400',
};
const typeIcons = { 'Weide': Trees, 'Pangola': Wheat, 'Wald': Trees, 'Wasserquelle': Droplets, 'Infrastruktur': MapPin, 'Brache': Maximize2 };
const polyColors = { 'Weide': '#4ADE80', 'Pangola': '#22D3EE', 'Wald': '#166534', 'Infrastruktur': '#FBBF24', 'Wasserquelle': '#60A5FA', 'Brache': '#6B7280' };

async function parseKMZ(file) {
  const results = [];
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let kmlText;
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(arrayBuffer);
    const kmlFile = Object.keys(zip.files).find(n => n.endsWith('.kml'));
    if (!kmlFile) throw new Error('Kein KML in KMZ gefunden');
    kmlText = await zip.files[kmlFile].async('string');
  } else {
    kmlText = new TextDecoder().decode(arrayBuffer);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'text/xml');
  const placemarks = doc.getElementsByTagName('Placemark');
  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const nameEl = pm.getElementsByTagName('name')[0] || pm.getElementsByTagName('n')[0];
    const name = nameEl ? nameEl.textContent.trim() : 'Feld ' + (i + 1);
    const coordsEl = pm.getElementsByTagName('coordinates')[0];
    if (!coordsEl) continue;
    const points = coordsEl.textContent.trim().split(/\s+/).filter(s => s.length > 0).map(s => {
      const p = s.split(',');
      return { lng: parseFloat(p[0]), lat: parseFloat(p[1]) };
    }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
    if (points.length < 3) continue;
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    let area = 0;
    for (let j = 0; j < points.length - 1; j++) {
      area += points[j].lng * points[j + 1].lat - points[j + 1].lng * points[j].lat;
    }
    area = Math.abs(area) / 2;
    const latRad = centerLat * Math.PI / 180;
    const areaHa = (area * 111320 * 111320 * Math.cos(latRad)) / 10000;
    results.push({
      name: name.replace(/\.kmz$/i, '').replace(/\.kml$/i, ''),
      polygon: points.map(p => [p.lat, p.lng]),
      center: { lat: centerLat, lng: centerLng },
      area_hectares: Math.round(areaHa * 10) / 10,
    });
  }
  return results;
}

export function FieldsPage({ farmId }) {
  const [fields, setFields] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editField, setEditField] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResults, setImportResults] = useState([]);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [form, setForm] = useState({ name: '', field_type: 'Weide', area_hectares: '', capacity_animals: '', status: 'aktiv', grass_type: '', water_source: '', fence_condition: 'gut', latitude: '', longitude: '', notes: '' });
  const [stats, setStats] = useState({ totalArea: 0, totalFields: 0, pangolaArea: 0, weideArea: 0 });

  const loadFields = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('fields').select('*', { count: 'exact' }).eq('farm_id', farmId);
    if (search) query = query.or('name.ilike.%' + search + '%,field_type.ilike.%' + search + '%,grass_type.ilike.%' + search + '%');
    if (typeFilter !== 'all') query = query.eq('field_type', typeFilter);
    query = query.order('name', { ascending: true }).range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);
    const { data, count } = await query;
    setFields(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [farmId, search, typeFilter, page]);

  const loadStats = useCallback(async () => {
    const { data } = await supabase.from('fields').select('field_type, area_hectares').eq('farm_id', farmId);
    if (data) {
      const totalArea = data.reduce((s, f) => s + (parseFloat(f.area_hectares) || 0), 0);
      const pangolaArea = data.filter(f => f.field_type === 'Pangola').reduce((s, f) => s + (parseFloat(f.area_hectares) || 0), 0);
      const weideArea = data.filter(f => f.field_type === 'Weide').reduce((s, f) => s + (parseFloat(f.area_hectares) || 0), 0);
      setStats({ totalArea, totalFields: data.length, pangolaArea, weideArea });
    }
  }, [farmId]);

  useEffect(() => { if (farmId) { loadFields(); loadStats(); } }, [loadFields, loadStats, farmId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!document.getElementById('leaflet-css')) {
      const css = document.createElement('link');
      css.id = 'leaflet-css'; css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }
    if (!document.getElementById('leaflet-js')) {
      const js = document.createElement('script');
      js.id = 'leaflet-js';
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      document.head.appendChild(js);
    }
  }, []);

  const openNew = () => { setEditField(null); setSaveError(''); setShowDeleteConfirm(false); setForm({ name: '', field_type: 'Weide', area_hectares: '', capacity_animals: '', status: 'aktiv', grass_type: '', water_source: '', fence_condition: 'gut', latitude: '', longitude: '', notes: '' }); setShowModal(true); };

  const openEdit = (f) => { setEditField(f); setSaveError(''); setShowDeleteConfirm(false); setForm({ name: f.name || '', field_type: f.field_type || 'Weide', area_hectares: f.area_hectares || '', capacity_animals: f.capacity_animals || '', status: f.status || 'aktiv', grass_type: f.grass_type || '', water_source: f.water_source || '', fence_condition: f.fence_condition || 'gut', latitude: f.latitude || '', longitude: f.longitude || '', notes: f.notes || '' }); setShowModal(true); };

  const save = async () => {
    setSaveError('');
    if (!form.name.trim()) { setSaveError('Name ist erforderlich'); return; }
    const payload = clean({ name: form.name.trim(), field_type: form.field_type, area_hectares: form.area_hectares ? parseFloat(form.area_hectares) : null, capacity_animals: form.capacity_animals ? parseInt(form.capacity_animals) : null, status: form.status, grass_type: form.grass_type, water_source: form.water_source, fence_condition: form.fence_condition, latitude: form.latitude ? parseFloat(form.latitude) : null, longitude: form.longitude ? parseFloat(form.longitude) : null, notes: form.notes, farm_id: farmId });
    let result;
    if (editField) { result = await supabase.from('fields').update(payload).eq('id', editField.id); }
    else { result = await supabase.from('fields').insert(payload); }
    if (result.error) { setSaveError(result.error.message); return; }
    setShowModal(false); loadFields(); loadStats();
  };

  const deleteField = async () => {
    if (!editField) return;
    const { error } = await supabase.from('fields').delete().eq('id', editField.id);
    if (error) { setSaveError(error.message); return; }
    setShowModal(false); loadFields(); loadStats();
  };

  const handleKMZFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(''); setImportResults([]); setImporting(true);
    try {
      const results = await parseKMZ(file);
      if (results.length === 0) { setImportError('Keine Polygone in der Datei gefunden.'); }
      else { results.forEach(r => { r.field_type = 'Weide'; r.selected = true; }); setImportResults(results); }
    } catch (err) { setImportError('Fehler beim Lesen: ' + err.message); }
    setImporting(false);
  };

  const importSelected = async () => {
    setImportError('');
    const toImport = importResults.filter(r => r.selected);
    if (toImport.length === 0) { setImportError('Keine Felder ausgewaehlt'); return; }
    setImporting(true);
    let errors = 0;
    for (const item of toImport) {
      const payload = { name: item.name, field_type: item.field_type, area_hectares: item.area_hectares, latitude: item.center.lat, longitude: item.center.lng, polygon_coords: JSON.stringify(item.polygon), farm_id: farmId, status: 'aktiv', fence_condition: 'gut' };
      const { error } = await supabase.from('fields').insert(payload);
      if (error) { console.error('Import error:', error); errors++; }
    }
    setImporting(false);
    if (errors > 0) { setImportError((toImport.length - errors) + ' importiert, ' + errors + ' Fehler'); }
    else { setShowImportModal(false); setImportResults([]); loadFields(); loadStats(); }
  };

  const openMap = async () => {
    setShowMap(true);
    const { data } = await supabase.from('fields').select('*').eq('farm_id', farmId);
    setTimeout(() => initMap(data || []), 500);
  };

  const initMap = (allFields) => {
    if (!mapRef.current || typeof window === 'undefined' || !window.L) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    const L = window.L;
    const map = L.map(mapRef.current).setView([-24.5, -58.3], 12);
    mapInstanceRef.current = map;
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri Satellite', maxZoom: 19 }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
    const bounds = [];
    allFields.forEach(f => {
      const color = polyColors[f.field_type] || '#4ADE80';
      if (f.polygon_coords) {
        try {
          const polygon = JSON.parse(f.polygon_coords);
          if (polygon.length >= 3) {
            const poly = L.polygon(polygon, { color: color, weight: 2, fillColor: color, fillOpacity: 0.25 }).addTo(map);
            poly.bindPopup('<b>' + f.name + '</b><br>' + f.field_type + ' · ' + (f.area_hectares || '?') + ' ha<br>Status: ' + (f.status || '-'));
            bounds.push(...polygon);
          }
        } catch (e) {}
      } else if (f.latitude && f.longitude) {
        const marker = L.circleMarker([parseFloat(f.latitude), parseFloat(f.longitude)], { radius: 8, color: color, fillColor: color, fillOpacity: 0.6 }).addTo(map);
        marker.bindPopup('<b>' + f.name + '</b><br>' + f.field_type + ' · ' + (f.area_hectares || '?') + ' ha');
        bounds.push([parseFloat(f.latitude), parseFloat(f.longitude)]);
      }
    });
    if (bounds.length > 0) { map.fitBounds(bounds, { padding: [30, 30] }); }
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Felder & Potreros</h1>
          <p className="text-sm text-gray-500 mt-1">{stats.totalFields} Felder, {stats.totalArea.toFixed(0)} ha gesamt</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-4 py-2 bg-farm-card border border-farm-border text-gray-300 rounded-lg text-sm hover:border-farm-green transition">
            <Upload size={16} /> KMZ Import
          </button>
          <button onClick={openMap} className="flex items-center gap-2 px-4 py-2 bg-farm-card border border-farm-border text-gray-300 rounded-lg text-sm hover:border-farm-cyan transition">
            <Map size={16} /> Karte
          </button>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-farm-green text-black rounded-lg font-semibold text-sm hover:bg-green-300 transition">
            <Plus size={16} /> Feld hinzufuegen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Gesamtflaeche</p>
          <p className="text-2xl font-bold mt-1">{stats.totalArea.toFixed(0)} <span className="text-sm text-gray-400">ha</span></p>
        </div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Weideflaeche</p>
          <p className="text-2xl font-bold text-farm-green mt-1">{stats.weideArea.toFixed(0)} <span className="text-sm text-gray-400">ha</span></p>
        </div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Pangola-Flaeche</p>
          <p className="text-2xl font-bold text-farm-cyan mt-1">{stats.pangolaArea.toFixed(0)} <span className="text-sm text-gray-400">ha</span></p>
        </div>
        <div className="bg-farm-card border border-farm-border rounded-xl p-4">
          <p className="text-xs text-gray-500">Anzahl Felder</p>
          <p className="text-2xl font-bold mt-1">{stats.totalFields}</p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Feld suchen..." className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none focus:border-farm-green" />
        </div>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }} className="px-3 py-2.5 rounded-lg bg-farm-card border border-farm-border text-sm outline-none">
          <option value="all">Alle Typen</option>
          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="bg-farm-card border border-farm-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-farm-border">
            {['', 'Name', 'Typ', 'Flaeche', 'Kapazitaet', 'Gras', 'Zaun', 'Status', 'Koordinaten'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Laden...</td></tr>}
            {!loading && fields.map(f => {
              const Icon = typeIcons[f.field_type] || MapPin;
              return (
                <tr key={f.id} onClick={() => openEdit(f)} className="border-b border-farm-border/50 hover:bg-farm-border/30 cursor-pointer transition">
                  <td className="px-4 py-3"><div className={'w-8 h-8 rounded-lg flex items-center justify-center ' + (f.field_type === 'Pangola' ? 'bg-cyan-900/30' : 'bg-green-900/20')}><Icon size={16} className={f.field_type === 'Pangola' ? 'text-farm-cyan' : 'text-farm-green'} /></div></td>
                  <td className="px-4 py-3 font-semibold">{f.name}{f.polygon_coords && <MapPin size={10} className="inline ml-1 text-farm-cyan" />}</td>
                  <td className="px-4 py-3"><span className={'text-xs px-2 py-0.5 rounded ' + (f.field_type === 'Pangola' ? 'bg-cyan-900/30 text-farm-cyan' : 'bg-green-900/20 text-farm-green')}>{f.field_type}</span></td>
                  <td className="px-4 py-3 font-semibold">{f.area_hectares ? f.area_hectares + ' ha' : '-'}</td>
                  <td className="px-4 py-3 text-gray-400">{f.capacity_animals ? f.capacity_animals + ' Tiere' : '-'}</td>
                  <td className="px-4 py-3 text-gray-400">{f.grass_type || '-'}</td>
                  <td className="px-4 py-3"><span className={'text-xs ' + (f.fence_condition === 'gut' ? 'text-farm-green' : f.fence_condition === 'mittel' ? 'text-farm-yellow' : 'text-farm-red')}>{f.fence_condition || '-'}</span></td>
                  <td className="px-4 py-3"><span className={'text-xs px-2 py-0.5 rounded ' + (statusColors[f.status] || 'text-gray-400')}>{f.status || '-'}</span></td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{f.latitude && f.longitude ? parseFloat(f.latitude).toFixed(4) + ', ' + parseFloat(f.longitude).toFixed(4) : '-'}</td>
                </tr>
              );
            })}
            {!loading && fields.length === 0 && (<tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">Keine Felder gefunden.</td></tr>)}
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
              <h2 className="font-display text-lg font-bold">{editField ? 'Feld bearbeiten' : 'Neues Feld'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            {saveError && (<div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">Fehler: {saveError}</div>)}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="block text-xs text-gray-400 mb-1">Name *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="z.B. Potrero Norte" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Typ</label><select value={form.field_type} onChange={e => setForm({...form, field_type: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">{FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-xs text-gray-400 mb-1">Status</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none">{FIELD_STATUS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label className="block text-xs text-gray-400 mb-1">Flaeche (ha)</label><input type="number" step="0.1" value={form.area_hectares} onChange={e => setForm({...form, area_hectares: e.target.value})} placeholder="z.B. 150" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Kapazitaet (Tiere)</label><input type="number" value={form.capacity_animals} onChange={e => setForm({...form, capacity_animals: e.target.value})} placeholder="z.B. 80" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Grasart</label><input value={form.grass_type} onChange={e => setForm({...form, grass_type: e.target.value})} placeholder="z.B. Pangola" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Wasserquelle</label><input value={form.water_source} onChange={e => setForm({...form, water_source: e.target.value})} placeholder="z.B. Brunnen" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Zaunzustand</label><select value={form.fence_condition} onChange={e => setForm({...form, fence_condition: e.target.value})} className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none"><option value="gut">Gut</option><option value="mittel">Mittel</option><option value="schlecht">Schlecht</option><option value="kein Zaun">Kein Zaun</option></select></div>
              <div><label className="block text-xs text-gray-400 mb-1">Breitengrad</label><input type="number" step="0.0001" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} placeholder="-22.3456" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Laengengrad</label><input type="number" step="0.0001" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} placeholder="-60.1234" className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition" /></div>
              <div className="col-span-2"><label className="block text-xs text-gray-400 mb-1">Notizen</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} placeholder="Zusaetzliche Infos..." className="w-full px-3 py-2.5 rounded-lg bg-farm-bg border border-farm-border text-sm outline-none focus:border-farm-green transition resize-none" /></div>
            </div>
            <button onClick={save} className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition">{editField ? 'Speichern' : 'Feld hinzufuegen'}</button>
            {editField && (<div className="mt-3">{!showDeleteConfirm ? (<button onClick={() => setShowDeleteConfirm(true)} className="w-full py-2 rounded-xl border border-red-800/50 text-farm-red text-sm hover:bg-red-900/20 transition flex items-center justify-center gap-2"><Trash2 size={14} /> Feld loeschen</button>) : (<div className="flex gap-2"><button onClick={deleteField} className="flex-1 py-2 rounded-xl bg-red-900/30 border border-red-800 text-farm-red text-sm font-semibold hover:bg-red-900/50 transition">Ja, loeschen</button><button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-xl border border-farm-border text-gray-400 text-sm hover:bg-farm-border/30 transition">Abbrechen</button></div>)}</div>)}
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-lg font-bold">KMZ / KML Import</h2>
              <button onClick={() => { setShowImportModal(false); setImportResults([]); setImportError(''); }} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">Lade eine KMZ oder KML Datei von Google Earth hoch. Die Polygone werden als Felder importiert.</p>
            {importError && (<div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-farm-red text-sm">{importError}</div>)}
            <label className="flex items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed border-farm-border text-gray-400 cursor-pointer hover:border-farm-green hover:text-farm-green transition">
              <Upload size={20} /><span className="text-sm">{importing ? 'Wird gelesen...' : 'KMZ / KML Datei waehlen'}</span>
              <input type="file" accept=".kmz,.kml" className="hidden" onChange={handleKMZFile} />
            </label>
            {importResults.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">Gefundene Felder ({importResults.length}):</h3>
                <div className="space-y-2">
                  {importResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-farm-bg border border-farm-border">
                      <input type="checkbox" checked={r.selected} onChange={() => { const n = [...importResults]; n[i].selected = !n[i].selected; setImportResults(n); }} className="rounded" />
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{r.name}</div>
                        <div className="text-xs text-gray-500">{r.area_hectares} ha · {r.polygon.length} Punkte</div>
                      </div>
                      <select value={r.field_type} onChange={e => { const n = [...importResults]; n[i].field_type = e.target.value; setImportResults(n); }} className="px-2 py-1 rounded bg-farm-card border border-farm-border text-xs outline-none">
                        {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <button onClick={importSelected} disabled={importing} className="w-full mt-4 py-3 rounded-xl bg-farm-green text-black font-semibold hover:bg-green-300 transition disabled:opacity-50">
                  {importing ? 'Importiere...' : importResults.filter(r => r.selected).length + ' Felder importieren'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showMap && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-farm-card border border-farm-border rounded-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-farm-border">
              <h2 className="font-display text-lg font-bold">Feldkarte</h2>
              <button onClick={() => { setShowMap(false); if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } }} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div ref={mapRef} className="flex-1" style={{ minHeight: '400px' }} />
            <div className="p-3 border-t border-farm-border flex gap-4 text-xs text-gray-500">
              <span><span className="inline-block w-3 h-3 rounded mr-1" style={{background:'#4ADE80'}}></span> Weide</span>
              <span><span className="inline-block w-3 h-3 rounded mr-1" style={{background:'#22D3EE'}}></span> Pangola</span>
              <span><span className="inline-block w-3 h-3 rounded mr-1" style={{background:'#166534'}}></span> Wald</span>
              <span><span className="inline-block w-3 h-3 rounded mr-1" style={{background:'#FBBF24'}}></span> Infrastruktur</span>
              <span><span className="inline-block w-3 h-3 rounded mr-1" style={{background:'#60A5FA'}}></span> Wasser</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
