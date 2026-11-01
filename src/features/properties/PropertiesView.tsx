import React, { useState } from 'react';
import { db } from '../../db/client';
import { Property, Unit, RentIncrease } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { sanitizeCoordinates } from '../../lib/geo';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Building2,
  Plus,
  DoorOpen,
  Users,
  MapPin,
  Trash2,
  Pencil,
  Copy,
  ExternalLink,
  Layers,
  History,
  TrendingUp,
  MoreVertical,
  CheckCircle2,
} from '../../components/icons';

export const PropertiesView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const [properties, setProperties] = useState<Property[]>(() => db.getTable<Property>('properties'));
  const [units, setUnits] = useState<Unit[]>(() => db.getTable<Unit>('units'));
  const [selectedPropId, setSelectedPropId] = useState<string | null>(properties[0]?.id || null);

  // Property Modals
  const [isAddPropOpen, setIsAddPropOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<Property | null>(null);

  // Unit Modals
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  // Form states - Property
  const [propName, setPropName] = useState('');
  const [propAddress, setPropAddress] = useState('');
  const [propCity, setPropCity] = useState('');
  const [propType, setPropType] = useState<any>('residential_apartment');
  const [propNotes, setPropNotes] = useState('');
  const [propLat, setPropLat] = useState('');
  const [propLng, setPropLng] = useState('');

  // Form states - Unit
  const [unitName, setUnitName] = useState('');
  const [unitRent, setUnitRent] = useState('1850');
  const [unitSize, setUnitSize] = useState('850');
  const [unitBeds, setUnitBeds] = useState('2');
  const [unitBaths, setUnitBaths] = useState('1');
  const [unitStatus, setUnitStatus] = useState<'vacant' | 'occupied' | 'maintenance'>('vacant');

  const handleOpenEditProp = (p: Property) => {
    setEditingProp(p);
    setPropName(p.name);
    setPropAddress(p.address_line1 || p.address || '');
    setPropCity(p.city || 'Default City');
    setPropType(p.type);
    setPropNotes(p.notes || '');
    setPropLat(p.latitude ? String(p.latitude) : p.lat ? String(p.lat) : '');
    setPropLng(p.longitude ? String(p.longitude) : p.lng ? String(p.lng) : '');
  };

  const handleSaveProperty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!propName.trim()) {
      showToast({ type: 'error', message: 'Property name is required!' });
      return;
    }
    if (!propAddress.trim()) {
      showToast({ type: 'error', message: 'Property address is required!' });
      return;
    }

    let latVal: number | null = null;
    let lngVal: number | null = null;
    if (propLat && propLng) {
      const coords = sanitizeCoordinates(propLat, propLng);
      if (coords) {
        latVal = coords.lat;
        lngVal = coords.lng;
      }
    } else if (propLat) {
      const parsedLat = parseFloat(propLat);
      if (!isNaN(parsedLat) && parsedLat >= -90 && parsedLat <= 90) latVal = parsedLat;
    } else if (propLng) {
      const parsedLng = parseFloat(propLng);
      if (!isNaN(parsedLng) && parsedLng >= -180 && parsedLng <= 180) lngVal = parsedLng;
    }

    if (editingProp) {
      db.updateItem<Property>('properties', editingProp.id, {
        name: propName.trim(),
        address_line1: propAddress.trim(),
        address: propAddress.trim(),
        city: propCity || 'Default City',
        type: propType,
        notes: propNotes,
        latitude: latVal,
        longitude: lngVal,
        lat: latVal,
        lng: lngVal,
      });
      showToast({ type: 'success', message: `Property "${propName}" updated` });
      setEditingProp(null);
    } else {
      const created = db.insertItem<Property>('properties', {
        id: generateUUID(),
        org_id: 'org_demo_1',
        name: propName.trim(),
        address_line1: propAddress.trim(),
        address: propAddress.trim(),
        city: propCity || 'Default City',
        country_code: pack.code,
        type: propType,
        notes: propNotes,
        latitude: latVal,
        longitude: lngVal,
        lat: latVal,
        lng: lngVal,
      });
      showToast({ type: 'success', message: `Property "${created.name}" created` });
      setIsAddPropOpen(false);
      setSelectedPropId(created.id);
    }

    setProperties(db.getTable<Property>('properties'));
    setPropName('');
    setPropAddress('');
    setPropCity('');
    setPropNotes('');
    setPropLat('');
    setPropLng('');
  };

  const handleDeleteProp = (p: Property) => {
    const success = db.softDeleteItem<Property>('properties', p.id);
    if (success) {
      setProperties(db.getTable<Property>('properties'));
      if (selectedPropId === p.id) {
        setSelectedPropId(properties.find((item) => item.id !== p.id)?.id || null);
      }
      showToast({
        type: 'info',
        message: `Property "${p.name}" archived`,
        onUndo: () => {
          db.updateItem<Property>('properties', p.id, { deleted_at: null });
          setProperties(db.getTable<Property>('properties'));
          showToast({ type: 'success', message: `Restored "${p.name}"` });
        },
      });
    }
  };

  const handleOpenEditUnit = (u: Unit) => {
    setEditingUnit(u);
    setUnitName(u.name);
    setUnitRent(String(u.rent_minor / 100));
    setUnitSize(String(u.size));
    setUnitBeds(String(u.bedrooms));
    setUnitBaths(String(u.bathrooms));
    setUnitStatus(u.status);
  };

  const handleSaveUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitName.trim()) {
      showToast({ type: 'error', message: 'Unit name / number is required!' });
      return;
    }
    if (!selectedPropId) {
      showToast({ type: 'error', message: 'Please select a parent property!' });
      return;
    }

    const rentMinor = Math.round((parseFloat(unitRent) || 0) * 100);
    const sizeVal = parseInt(unitSize) || 800;
    const bedsVal = parseInt(unitBeds) || 1;
    const bathsVal = parseFloat(unitBaths) || 1;

    if (editingUnit) {
      if (editingUnit.rent_minor !== rentMinor) {
        db.insertItem<RentIncrease>('rent_increases', {
          id: generateUUID(),
          unit_id: editingUnit.id,
          old_amount_minor: editingUnit.rent_minor,
          new_amount_minor: rentMinor,
          effective_date: new Date().toISOString().split('T')[0],
          reason: 'Periodic Rent Review',
          user_id: 'local_user',
          created_at: Date.now(),
        });
      }

      db.updateItem<Unit>('units', editingUnit.id, {
        name: unitName.trim(),
        rent_minor: rentMinor,
        size: sizeVal,
        bedrooms: bedsVal,
        bathrooms: bathsVal,
        status: unitStatus,
      });
      showToast({ type: 'success', message: `Unit "${unitName}" updated` });
      setEditingUnit(null);
    } else {
      const created = db.insertItem<Unit>('units', {
        id: generateUUID(),
        property_id: selectedPropId,
        name: unitName.trim(),
        size: sizeVal,
        area_unit: pack.areaUnit,
        bedrooms: bedsVal,
        bathrooms: bathsVal,
        rent_minor: rentMinor,
        currency_code: pack.currency.code,
        status: unitStatus,
      });
      showToast({ type: 'success', message: `Unit "${created.name}" created` });
      setIsAddUnitOpen(false);
    }

    setUnits(db.getTable<Unit>('units'));
    setUnitName('');
  };

  const handleDeleteUnit = (u: Unit) => {
    const success = db.softDeleteItem<Unit>('units', u.id);
    if (success) {
      setUnits(db.getTable<Unit>('units'));
      showToast({
        type: 'info',
        message: `Unit "${u.name}" archived`,
        onUndo: () => {
          db.updateItem<Unit>('units', u.id, { deleted_at: null });
          setUnits(db.getTable<Unit>('units'));
          showToast({ type: 'success', message: `Restored "${u.name}"` });
        },
      });
    }
  };

  const activeProp = properties.find((p) => p.id === selectedPropId);
  const propUnits = units.filter((u) => u.property_id === selectedPropId);
  const occupiedCount = propUnits.filter((u) => u.status === 'occupied').length;
  const occupancyPct = propUnits.length > 0 ? Math.round((occupiedCount / propUnits.length) * 100) : 0;
  const totalRentMinor = propUnits.reduce((acc, u) => acc + (u.status === 'occupied' ? u.rent_minor : 0), 0);

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Properties & Rental Units
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Real estate portfolio &bull; Unit inventory &bull; Floor areas in {pack.areaUnit} ({pack.name})
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setUnitName('');
              setUnitRent('1850');
              setIsAddUnitOpen(true);
            }}
            disabled={!selectedPropId}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Unit</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setPropName('');
              setPropAddress('');
              setIsAddPropOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Property</span>
          </Button>
        </div>
      </div>

      {/* Main Two-Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Properties Directory List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Properties ({properties.length})
            </h2>
            <Badge variant="neutral">{pack.code} Standards</Badge>
          </div>

          <div className="space-y-3">
            {properties.map((p) => {
              const isSelected = p.id === selectedPropId;
              const count = units.filter((u) => u.property_id === p.id).length;
              const propOccupied = units.filter((u) => u.property_id === p.id && u.status === 'occupied').length;
              const occRate = count > 0 ? Math.round((propOccupied / count) * 100) : 0;

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPropId(p.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--bg-surface)] card-shadow ring-1 ring-[var(--accent)]/30'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">{p.name}</h3>
                        <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mt-0.5 line-clamp-1">
                          <MapPin className="w-3 h-3 text-[var(--text-subtle)] shrink-0" />
                          <span>{p.address_line1 || p.address || 'No address set'}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditProp(p);
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] cursor-pointer"
                        title="Edit Property"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProp(p);
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-base)] cursor-pointer"
                        title="Archive Property"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Property Quick Metrics */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                    <span className="font-medium">{count} Units</span>
                    <Badge variant={occRate >= 80 ? 'success' : occRate > 0 ? 'warning' : 'neutral'}>
                      {occRate}% Occupied
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 2 Columns: Selected Property Details & Units Floorplan */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="space-y-6">
            <CardHeader className="border-b border-[var(--border-subtle)] pb-4 mb-0">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">{activeProp ? activeProp.name : 'Select a Property'}</CardTitle>
                  {activeProp && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenEditProp(activeProp)}
                      className="h-7 text-xs px-2 gap-1 rounded-lg"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {activeProp?.address_line1 || activeProp?.address} &bull; {activeProp?.city || 'Default Region'}
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-[var(--text-subtle)] font-bold uppercase tracking-wider block">
                  Occupancy Rate
                </span>
                <span className="text-base font-bold font-mono text-[var(--accent)]">
                  {occupancyPct}% ({occupiedCount}/{propUnits.length})
                </span>
              </div>
            </CardHeader>

            {/* Units Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {propUnits.length === 0 ? (
                <div className="col-span-2 text-center py-16 text-xs text-[var(--text-secondary)]">
                  No units added to this property yet. Click "Add Unit" to create one.
                </div>
              ) : (
                propUnits.map((u) => {
                  const statusVariant =
                    u.status === 'occupied' ? 'success' : u.status === 'vacant' ? 'warning' : 'danger';

                  return (
                    <div
                      key={u.id}
                      className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] space-y-3 group hover:border-[var(--border-strong)] transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-[var(--text-primary)]">{u.name}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={statusVariant}>{u.status.toUpperCase()}</Badge>
                          <button
                            onClick={() => handleOpenEditUnit(u)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] cursor-pointer"
                            title="Edit Unit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUnit(u)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-surface)] cursor-pointer"
                            title="Archive Unit"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3">
                        <div>
                          <span className="block text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-semibold">
                            Monthly Rent
                          </span>
                          <span className="font-bold number-tabular text-[var(--text-primary)] text-sm">
                            {formatMoney(u.rent_minor, pack)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-semibold">
                            Floor Specs
                          </span>
                          <span>
                            {u.bedrooms} Bed &bull; {u.bathrooms} Bath &bull; {u.size} {u.area_unit}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Property Modal */}
      <Modal
        isOpen={isAddPropOpen || !!editingProp}
        onClose={() => {
          setIsAddPropOpen(false);
          setEditingProp(null);
        }}
        title={editingProp ? `Edit Property: ${editingProp.name}` : 'Add New Property'}
        description="Add a physical asset or building to your portfolio directory."
        maxWidth="xl"
      >
        <form onSubmit={handleSaveProperty} className="space-y-4">
          <Input
            label="Property Name *"
            value={propName}
            onChange={(e) => setPropName(e.target.value)}
            placeholder="e.g. Oak Ridge Executive Apartments"
            required
          />

          <Input
            label="Street Address Line 1 *"
            value={propAddress}
            onChange={(e) => setPropAddress(e.target.value)}
            placeholder="Full street address"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="City / Town"
              value={propCity}
              onChange={(e) => setPropCity(e.target.value)}
              placeholder="e.g. Springfield"
            />
            <Select
              label="Property Type"
              value={propType}
              onChange={(e) => setPropType(e.target.value)}
            >
              <option value="residential_apartment">Residential Apartment</option>
              <option value="single_family">Single Family Home</option>
              <option value="commercial">Commercial / Retail</option>
              <option value="mixed_use">Mixed Use</option>
              <option value="land">Vacant Land</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Latitude (for Map pin)"
              type="number"
              step="any"
              value={propLat}
              onChange={(e) => setPropLat(e.target.value)}
              placeholder="e.g. 39.7817"
            />
            <Input
              label="Longitude (for Map pin)"
              type="number"
              step="any"
              value={propLng}
              onChange={(e) => setPropLng(e.target.value)}
              placeholder="e.g. -89.6501"
            />
          </div>

          <Input
            label="Notes / Amenities Description"
            value={propNotes}
            onChange={(e) => setPropNotes(e.target.value)}
            placeholder="Access codes, parking regulations, notes"
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddPropOpen(false);
                setEditingProp(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingProp ? 'Update Property' : 'Create Property'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Unit Modal */}
      <Modal
        isOpen={isAddUnitOpen || !!editingUnit}
        onClose={() => {
          setIsAddUnitOpen(false);
          setEditingUnit(null);
        }}
        title={editingUnit ? `Edit Unit: ${editingUnit.name}` : 'Add Unit to Property'}
        description="Configure unit number, rent tier, and bedroom specifications."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveUnit} className="space-y-4">
          <Input
            label="Unit Name / Number *"
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            placeholder="e.g. Apt 302"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={`Monthly Rent (${pack.currency.code}) *`}
              type="number"
              value={unitRent}
              onChange={(e) => setUnitRent(e.target.value)}
              required
            />
            <Input
              label={`Floor Area (${pack.areaUnit})`}
              type="number"
              value={unitSize}
              onChange={(e) => setUnitSize(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Bedrooms"
              type="number"
              value={unitBeds}
              onChange={(e) => setUnitBeds(e.target.value)}
            />
            <Input
              label="Bathrooms"
              type="number"
              step="0.5"
              value={unitBaths}
              onChange={(e) => setUnitBaths(e.target.value)}
            />
            <Select
              label="Status"
              value={unitStatus}
              onChange={(e) => setUnitStatus(e.target.value as any)}
            >
              <option value="vacant">Vacant</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddUnitOpen(false);
                setEditingUnit(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingUnit ? 'Save Unit Changes' : 'Create Unit'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
