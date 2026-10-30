import React, { useState } from 'react';
import { db } from '../../db/client';
import { Property, Unit, RentIncrease } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
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

  // Open Edit Property
  const handleOpenEditProp = (p: Property) => {
    setEditingProp(p);
    setPropName(p.name);
    setPropAddress(p.address_line1 || p.address || '');
    setPropCity(p.city || 'Springfield');
    setPropType(p.type);
    setPropNotes(p.notes || '');
    setPropLat(p.latitude ? String(p.latitude) : p.lat ? String(p.lat) : '');
    setPropLng(p.longitude ? String(p.longitude) : p.lng ? String(p.lng) : '');
  };

  // Save / Update Property
  const handleSaveProperty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!propName.trim()) {
      showToast({ type: 'error', message: 'Property name is a required field!' });
      return;
    }
    if (!propAddress.trim()) {
      showToast({ type: 'error', message: 'Property address is a required field!' });
      return;
    }

    const latVal = propLat ? parseFloat(propLat) : null;
    const lngVal = propLng ? parseFloat(propLng) : null;

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
      showToast({ type: 'success', message: `Property "${propName}" updated successfully` });
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
      showToast({ type: 'success', message: `Property "${created.name}" created successfully` });
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

  // Delete Property with Undo
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

  // Open Edit Unit
  const handleOpenEditUnit = (u: Unit) => {
    setEditingUnit(u);
    setUnitName(u.name);
    setUnitRent(String(u.rent_minor / 100));
    setUnitSize(String(u.size));
    setUnitBeds(String(u.bedrooms));
    setUnitBaths(String(u.bathrooms));
    setUnitStatus(u.status);
  };

  // Save / Update Unit
  const handleSaveUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitName.trim()) {
      showToast({ type: 'error', message: 'Unit name / number is a required field!' });
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
      // Check if rent changed to record rent increase history
      if (editingUnit.rent_minor !== rentMinor) {
        db.insertItem<RentIncrease>('rent_increases', {
          id: generateUUID(),
          unit_id: editingUnit.id,
          old_amount_minor: editingUnit.rent_minor,
          new_amount_minor: rentMinor,
          effective_date: new Date().toISOString().split('T')[0],
          reason: 'Manual Rate Adjustment',
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

  // Delete Unit with Undo
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Properties & Rental Units</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Full portfolio CRUD &bull; Direct inline editing &bull; Land area conversions ({pack.areaUnit})
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setUnitName('');
              setUnitRent('1850');
              setIsAddUnitOpen(true);
            }}
            disabled={!selectedPropId}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Unit</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setPropName('');
              setPropAddress('');
              setIsAddPropOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Property</span>
          </Button>
        </div>
      </div>

      {/* Two-Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Properties Directory List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Properties ({properties.length})
            </h2>
            <Badge variant="neutral">{pack.code} Standards</Badge>
          </div>

          <div className="space-y-2.5">
            {properties.map((p) => {
              const isSelected = p.id === selectedPropId;
              const count = units.filter((u) => u.property_id === p.id).length;

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPropId(p.id)}
                  className={`p-3.5 rounded-[8px] border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--surface-raised)] shadow-xs ring-1 ring-[var(--accent)]/30'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-[6px] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text)]">{p.name}</h3>
                        <p className="text-xs text-[var(--text-subtle)] flex items-center gap-1 mt-0.5 line-clamp-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span>{p.address_line1 || p.address || 'No address set'}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="neutral">{count} Units</Badge>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditProp(p);
                        }}
                        className="p-1 text-[var(--text-subtle)] hover:text-[var(--accent)] cursor-pointer"
                        title="Edit Property"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProp(p);
                        }}
                        className="p-1 text-[var(--text-subtle)] hover:text-[var(--status-danger-fg)] cursor-pointer"
                        title="Archive Property"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 2 Columns: Selected Property Detail & Unit Floorplan */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>{activeProp ? activeProp.name : 'Select a Property'}</CardTitle>
                  {activeProp && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenEditProp(activeProp)}
                      className="h-6 text-[11px] px-1.5 gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit</span>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                  {activeProp?.address_line1 || activeProp?.address} &bull; {activeProp?.city || 'Default Region'}
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-[var(--text-subtle)] uppercase block">Occupancy Rate</span>
                <span className="text-sm font-bold font-mono text-[var(--accent)]">
                  {occupancyPct}% ({occupiedCount}/{propUnits.length})
                </span>
              </div>
            </CardHeader>

            {/* Units Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {propUnits.length === 0 ? (
                <div className="col-span-2 text-center py-12 text-xs text-[var(--text-subtle)]">
                  No units added to this property yet. Click "Add Unit" to create one.
                </div>
              ) : (
                propUnits.map((u) => {
                  const statusVariant =
                    u.status === 'occupied' ? 'success' : u.status === 'vacant' ? 'warning' : 'danger';

                  return (
                    <div
                      key={u.id}
                      className="p-4 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] space-y-3 relative group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-[var(--text)]">{u.name}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={statusVariant}>{u.status.toUpperCase()}</Badge>
                          <button
                            onClick={() => handleOpenEditUnit(u)}
                            className="p-1 text-[var(--text-subtle)] hover:text-[var(--accent)] cursor-pointer"
                            title="Edit Unit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUnit(u)}
                            className="p-1 text-[var(--text-subtle)] hover:text-[var(--status-danger-fg)] cursor-pointer"
                            title="Archive Unit"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-2">
                        <div>
                          <span className="block text-[10px] text-[var(--text-subtle)]">Monthly Rent</span>
                          <span className="font-bold number-tabular text-[var(--text)]">
                            {formatMoney(u.rent_minor, pack)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-[var(--text-subtle)]">Floor Specs</span>
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

      {/* Property Modal (Create / Edit) */}
      <Modal
        isOpen={isAddPropOpen || !!editingProp}
        onClose={() => {
          setIsAddPropOpen(false);
          setEditingProp(null);
        }}
        title={editingProp ? `Edit Property: ${editingProp.name}` : 'Add New Property'}
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

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="City / Town"
              value={propCity}
              onChange={(e) => setPropCity(e.target.value)}
              placeholder="e.g. Springfield"
            />
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                Property Type
              </label>
              <select
                value={propType}
                onChange={(e) => setPropType(e.target.value)}
                className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
              >
                <option value="residential_apartment">Residential Apartment</option>
                <option value="single_family">Single Family Home</option>
                <option value="commercial">Commercial / Retail</option>
                <option value="mixed_use">Mixed Use</option>
                <option value="land">Vacant Land</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            placeholder="Property notes or background info"
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
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

      {/* Unit Modal (Create / Edit) */}
      <Modal
        isOpen={isAddUnitOpen || !!editingUnit}
        onClose={() => {
          setIsAddUnitOpen(false);
          setEditingUnit(null);
        }}
        title={editingUnit ? `Edit Unit: ${editingUnit.name}` : 'Add Unit to Property'}
      >
        <form onSubmit={handleSaveUnit} className="space-y-4">
          <Input
            label="Unit Name / Number *"
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            placeholder="e.g. Apt 302"
            required
          />

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-3 gap-3">
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
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                Status
              </label>
              <select
                value={unitStatus}
                onChange={(e) => setUnitStatus(e.target.value as any)}
                className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
              >
                <option value="vacant">Vacant</option>
                <option value="occupied">Occupied</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
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
