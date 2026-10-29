import React, { useEffect, useRef } from 'react';
import { db } from '../../db/client';
import { Property, Unit } from '../../db/schema';
import { resolvePack } from '../../countries/resolver';
import { formatMoney } from '../../lib/money';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Layers } from '../../components/icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export const MapView: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const pack = resolvePack();

  const properties = db.getTable<Property>('properties');
  const units = db.getTable<Unit>('units');

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Default initial view centered on US/Global
      const map = L.map(mapContainerRef.current).setView([38.5, -96], 4);

      // Free OpenStreetMap tile layer (Zero API keys required!)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Fix marker icon default path issue in Leaflet
    const defaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    });

    const boundsPoints: [number, number][] = [];

    // Add interactive markers for each property
    properties.forEach((prop) => {
      if (prop.lat && prop.lng) {
        boundsPoints.push([prop.lat, prop.lng]);

        const propUnits = units.filter((u) => u.property_id === prop.id);
        const totalRentMinor = propUnits.reduce((acc, u) => acc + u.rent_minor, 0);

        const popupHtml = `
          <div style="font-family: system-ui, sans-serif; padding: 4px; max-width: 200px;">
            <strong style="font-size: 14px; color: #0a0a0a;">${prop.name}</strong>
            <p style="font-size: 11px; color: #6b7280; margin: 4px 0;">${prop.address}</p>
            <div style="font-size: 12px; font-weight: bold; color: #2563eb; margin-top: 6px;">
              ${propUnits.length} Units &bull; ${formatMoney(totalRentMinor, pack)}/mo
            </div>
          </div>
        `;

        L.marker([prop.lat, prop.lng], { icon: defaultIcon })
          .addTo(map)
          .bindPopup(popupHtml);
      }
    });

    if (boundsPoints.length > 0) {
      const latLngBounds = L.latLngBounds(boundsPoints);
      map.fitBounds(latLngBounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [properties, units, pack]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Interactive Property Location Map</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Free OpenStreetMap integration &bull; Real-time portfolio geographical pins (Zero API Keys)
          </p>
        </div>
        <Badge variant="info">
          <Layers className="w-3.5 h-3.5 mr-1 inline" />
          {properties.filter((p) => p.lat && p.lng).length} Pinned Properties
        </Badge>
      </div>

      <Card className="p-0 overflow-hidden border-[var(--border-strong)]">
        <div ref={mapContainerRef} className="w-full h-[600px] z-0" />
      </Card>
    </div>
  );
};
