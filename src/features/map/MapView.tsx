import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { db } from '../../db/client';
import { Property, Unit } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { useToast } from '../../components/toast/ToastContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { generateUUID } from '../../lib/uuid';
import {
  MapPin,
  Search,
  Layers,
  Copy,
  ExternalLink,
  Plus,
  Navigation,
  Check,
} from '../../components/icons';

type MapLayerType = 'streets' | 'satellite' | 'terrain';

const TILE_SOURCES: Record<MapLayerType, { tiles: string[]; maxzoom: number; attribution: string }> = {
  streets: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 19,
    attribution: '&copy; Esri World Imagery',
  },
  terrain: {
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
    maxzoom: 17,
    attribution: '&copy; OpenTopoMap contributors',
  },
};

export const MapView: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const pack = usePack();
  const { showToast } = useToast();

  const [properties, setProperties] = useState<Property[]>(() => db.getTable<Property>('properties'));
  const units = db.getTable<Unit>('units');

  // Map state persistence
  const savedState = (() => {
    try {
      const raw = localStorage.getItem('rentflow_map_state');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const [activeLayer, setActiveLayer] = useState<MapLayerType>(savedState?.layer || 'streets');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Add Property At Clicked Location Modal
  const [clickedCoords, setClickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropAddress, setNewPropAddress] = useState('');
  const [newPropType, setNewPropType] = useState<any>('residential_apartment');

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter: [number, number] = [
      savedState?.center_lng ?? -96,
      savedState?.center_lat ?? 38.5,
    ];
    const initialZoom = savedState?.zoom ?? 3.5;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'raster-tiles': {
            type: 'raster',
            tiles: TILE_SOURCES[activeLayer].tiles,
            tileSize: 256,
            maxzoom: TILE_SOURCES[activeLayer].maxzoom,
            attribution: TILE_SOURCES[activeLayer].attribution,
          },
        },
        layers: [
          {
            id: 'raster-layer',
            type: 'raster',
            source: 'raster-tiles',
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center: initialCenter,
      zoom: initialZoom,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Click empty map area -> "Add property here"
    map.on('click', (e: any) => {
      setClickedCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      setNewPropAddress(`Lat: ${e.lngLat.lat.toFixed(4)}, Lng: ${e.lngLat.lng.toFixed(4)}`);
      setIsAddModalOpen(true);
    });

    // Save map state on moveend
    map.on('moveend', () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      localStorage.setItem(
        'rentflow_map_state',
        JSON.stringify({
          center_lat: center.lat,
          center_lng: center.lng,
          zoom,
          layer: activeLayer,
        })
      );
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch Layer
  const handleLayerSwitch = (layer: MapLayerType) => {
    setActiveLayer(layer);
    const map = mapRef.current;
    if (!map) return;

    const style = map.getStyle();
    if (!style) return;

    if (map.getSource('raster-tiles')) {
      if (map.getLayer('raster-layer')) {
        map.removeLayer('raster-layer');
      }
      map.removeSource('raster-tiles');
      map.addSource('raster-tiles', {
        type: 'raster',
        tiles: TILE_SOURCES[layer].tiles,
        tileSize: 256,
        maxzoom: TILE_SOURCES[layer].maxzoom,
        attribution: TILE_SOURCES[layer].attribution,
      });
      map.addLayer({
        id: 'raster-layer',
        type: 'raster',
        source: 'raster-tiles',
        minzoom: 0,
        maxzoom: 22,
      });
    }

    // Persist layer choice
    const center = map.getCenter();
    const zoom = map.getZoom();
    localStorage.setItem(
      'rentflow_map_state',
      JSON.stringify({
        center_lat: center.lat,
        center_lng: center.lng,
        zoom,
        layer,
      })
    );
  };

  // Render markers when properties change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    let hasCoords = false;

    properties.forEach((prop) => {
      if (prop.latitude && prop.longitude) {
        hasCoords = true;
        bounds.extend([prop.longitude, prop.latitude]);

        const propUnits = units.filter((u) => u.property_id === prop.id);
        const totalRent = propUnits.reduce((acc, u) => acc + u.rent_minor, 0);

        // Custom HTML marker pin
        const el = document.createElement('div');
        el.className = 'rentflow-marker cursor-pointer';
        el.innerHTML = `
          <div style="background-color: var(--accent); color: white; width: 32px; height: 32px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.25); border: 2px solid white; transition: transform 0.15s ease;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          </div>
        `;

        // Info popup
        const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(`
          <div style="font-family: Inter, system-ui, sans-serif; padding: 4px; min-width: 180px;">
            <div style="font-size: 14px; font-weight: 700; color: #0a0a0a;">${prop.name}</div>
            <div style="font-size: 11px; color: #6b7280; margin: 4px 0;">${prop.address_line1 || prop.address || ''}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e5e5; font-size: 12px;">
              <span style="color: #6b7280;">${propUnits.length} Units</span>
              <span style="font-weight: 700; color: #2563eb;">${formatMoney(totalRent, pack)}/mo</span>
            </div>
            <div style="display: flex; gap: 4px; margin-top: 8px;">
              <button onclick="navigator.clipboard.writeText('${prop.address_line1 || prop.address || ''}'); window.__rentflowToast && window.__rentflowToast('Address copied!')" style="background: #f5f5f5; border: 1px solid #e5e5e5; padding: 3px 6px; border-radius: 4px; font-size: 10px; cursor: pointer;">Copy Address</button>
              <button onclick="window.open('https://www.google.com/maps/search/?api=1&query=${prop.latitude},${prop.longitude}', '_blank')" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 3px 6px; border-radius: 4px; font-size: 10px; cursor: pointer;">Open in Maps</button>
            </div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([prop.longitude, prop.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      }
    });

    // Attach global toast callback for marker popups
    (window as any).__rentflowToast = (msg: string) => showToast({ type: 'success', message: msg });
  }, [properties, units, pack, showToast]);

  // Search box: Nominatim geocoding (free, zero API keys)
  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=1`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 12 });
        showToast({ type: 'info', message: `Flew to ${item.display_name.split(',')[0]}` });
      } else {
        showToast({ type: 'error', message: 'Location not found. Try a different city or address.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Geocoding search failed. Check network.' });
    } finally {
      setIsSearching(false);
    }
  };

  // Create property from clicked coordinates
  const handleSavePropertyAtCoords = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPropName.trim() || !clickedCoords) {
      showToast({ type: 'error', message: 'Property name is required' });
      return;
    }

    const newProp = db.insertItem<Property>('properties', {
      id: generateUUID(),
      org_id: 'org_demo_1',
      name: newPropName,
      address_line1: newPropAddress,
      city: 'Unknown City',
      country_code: pack.code,
      latitude: clickedCoords.lat,
      longitude: clickedCoords.lng,
      type: newPropType,
    });

    setProperties(db.getTable<Property>('properties'));
    setIsAddModalOpen(false);
    setNewPropName('');
    showToast({ type: 'success', message: `Property "${newProp.name}" added at map coordinates!` });
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Interactive Portfolio GIS Map</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Powered by MapLibre GL &bull; Free Streets, Esri Satellite, and Terrain layers (Zero API keys)
          </p>
        </div>

        {/* Layer Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-[6px] bg-[var(--surface-raised)] border border-[var(--border)]">
          <Layers className="w-3.5 h-3.5 text-[var(--text-subtle)] ml-1.5 mr-0.5" />
          <button
            onClick={() => handleLayerSwitch('streets')}
            className={`px-2.5 py-1 rounded-[4px] text-xs font-semibold transition-all cursor-pointer ${
              activeLayer === 'streets'
                ? 'bg-[var(--accent)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Streets
          </button>
          <button
            onClick={() => handleLayerSwitch('satellite')}
            className={`px-2.5 py-1 rounded-[4px] text-xs font-semibold transition-all cursor-pointer ${
              activeLayer === 'satellite'
                ? 'bg-[var(--accent)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Satellite
          </button>
          <button
            onClick={() => handleLayerSwitch('terrain')}
            className={`px-2.5 py-1 rounded-[4px] text-xs font-semibold transition-all cursor-pointer ${
              activeLayer === 'terrain'
                ? 'bg-[var(--accent)] text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Terrain
          </button>
        </div>
      </div>

      {/* Map Search Form */}
      <form onSubmit={handleSearchLocation} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-subtle)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any city, neighborhood, or address to fly to location..."
            className="pl-9 h-9"
          />
        </div>
        <Button variant="primary" size="sm" type="submit" disabled={isSearching} className="gap-1.5">
          <Navigation className="w-3.5 h-3.5" />
          <span>{isSearching ? 'Searching...' : 'Fly To'}</span>
        </Button>
      </form>

      {/* MapLibre Canvas Container */}
      <Card className="p-0 overflow-hidden border-[var(--border-strong)] relative h-[620px]">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Tip Badge */}
        <div className="absolute bottom-4 left-4 z-10 bg-[var(--surface-raised)]/95 border border-[var(--border)] px-3 py-1.5 rounded-[6px] text-[11px] text-[var(--text-muted)] modal-shadow backdrop-blur-xs flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Click anywhere on the map to pin a new property</span>
        </div>
      </Card>

      {/* Modal: Add Property at Clicked Point */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Property at Selected Location"
      >
        <form onSubmit={handleSavePropertyAtCoords} className="space-y-4">
          <div className="p-2.5 rounded-[6px] bg-[var(--surface-sunken)] border border-[var(--border)] text-xs font-mono text-[var(--text-muted)]">
            Pinned Coordinates: {clickedCoords?.lat.toFixed(6)}, {clickedCoords?.lng.toFixed(6)}
          </div>

          <Input
            label="Property Name *"
            value={newPropName}
            onChange={(e) => setNewPropName(e.target.value)}
            placeholder="e.g. Sunset Plaza Apartments"
            required
          />

          <Input
            label="Street Address / Description"
            value={newPropAddress}
            onChange={(e) => setNewPropAddress(e.target.value)}
            placeholder="Address line"
          />

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              Property Type
            </label>
            <select
              value={newPropType}
              onChange={(e) => setNewPropType(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
            >
              <option value="residential_apartment">Residential Apartment</option>
              <option value="single_family">Single Family Home</option>
              <option value="commercial">Commercial / Retail</option>
              <option value="mixed_use">Mixed Use</option>
              <option value="land">Vacant Land</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Pin & Save Property
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
