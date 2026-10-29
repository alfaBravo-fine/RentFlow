import React, { useState } from 'react';
import { db } from '../../db/client';
import { Property, Unit, Owner } from '../../db/schema';
import { resolvePack } from '../../countries/resolver';
import { formatMoney } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Building2, Plus, DoorOpen, Users, MapPin, Trash2, Pencil } from '../../components/icons';

export const PropertiesView: React.FC = () => {
  const pack = resolvePack();
  const [properties, setProperties] = useState<Property[]>(() => db.getTable<Property>('properties'));
  const [units, setUnits] = useState<Unit[]>(() => db.getTable<Unit>('units'));
  const owners = db.getTable<Owner>('owners');

  const [isAddPropOpen, setIsAddPropOpen] = useState(false);
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [selectedPropId, setSelectedPropId] = useState<string | null>(properties[0]?.id || null);

  // Form states
  const [propName, setPropName] = useState('');
  const [propAddress, setPropAddress] = useState('');
  const [unitName, setUnitName] = useState('');
  const [unitRent, setUnitRent] = useState('1850');

  const handleCreateProperty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!propName || !propAddress) return;

    const newProp = db.insertItem<Property>('properties', {
      id: generateUUID(),
      org_id: 'org_demo_1',
      name: propName,
      address: propAddress,
      type: 'residential_apartment',
      country_code: 'US',
    });

    setProperties(db.getTable<Property>('properties'));
    setIsAddPropOpen(false);
    setPropName('');
    setPropAddress('');
  };

  const handleCreateUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitName || !selectedPropId) return;

    const rentMinor = Math.round(parseFloat(unitRent) * 100);

    db.insertItem<Unit>('units', {
      id: generateUUID(),
      property_id: selectedPropId,
      name: unitName,
      size: 900,
      area_unit: pack.areaUnit,
      bedrooms: 2,
      bathrooms: 1,
      rent_minor: rentMinor,
      currency_code: pack.currency.code,
      status: 'vacant',
    });

    setUnits(db.getTable<Unit>('units'));
    setIsAddUnitOpen(false);
    setUnitName('');
  };

  const activeProp = properties.find((p) => p.id === selectedPropId);
  const propUnits = units.filter((u) => u.property_id === selectedPropId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Properties & Rental Units</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Manage building portfolios, unit status, and floorplans
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsAddUnitOpen(true)} disabled={!selectedPropId}>
            <Plus className="w-3.5 h-3.5" />
            <span>Add Unit</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsAddPropOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            <span>Add Property</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Properties Selector List */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Properties Directory</h2>
          {properties.map((p) => {
            const isSelected = p.id === selectedPropId;
            const count = units.filter((u) => u.property_id === p.id).length;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedPropId(p.id)}
                className={`p-4 rounded-[8px] border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--surface-raised)] shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[6px] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text)]">{p.name}</h3>
                      <p className="text-xs text-[var(--text-subtle)] flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        <span className="line-clamp-1">{p.address}</span>
                      </p>
                    </div>
                  </div>
                  <Badge variant="neutral">{count} Units</Badge>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Property Unit Floorplan Grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{activeProp ? activeProp.name : 'Select a Property'}</CardTitle>
                <p className="text-xs text-[var(--text-subtle)]">{activeProp?.address}</p>
              </div>
              <Badge variant="info">{propUnits.length} Units Logged</Badge>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {propUnits.length === 0 ? (
                <div className="col-span-2 text-center py-12 text-xs text-[var(--text-subtle)]">
                  No units added to this property yet. Click "Add Unit" to create one.
                </div>
              ) : (
                propUnits.map((u) => {
                  const statusVariant = u.status === 'occupied' ? 'success' : u.status === 'vacant' ? 'warning' : 'danger';
                  return (
                    <div key={u.id} className="p-4 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-[var(--text)]">{u.name}</span>
                        <Badge variant={statusVariant}>{u.status.toUpperCase()}</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)]">
                        <div>
                          <span className="block text-[10px] text-[var(--text-subtle)]">Monthly Rent</span>
                          <span className="font-bold number-tabular text-[var(--text)]">{formatMoney(u.rent_minor, pack)}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-[var(--text-subtle)]">Specs</span>
                          <span>{u.bedrooms} Bed &bull; {u.bathrooms} Bath &bull; {u.size} {u.area_unit}</span>
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

      {/* Add Property Modal */}
      <Modal isOpen={isAddPropOpen} onClose={() => setIsAddPropOpen(false)} title="Add New Property">
        <form onSubmit={handleCreateProperty} className="space-y-4">
          <Input label="Property Name" value={propName} onChange={(e) => setPropName(e.target.value)} placeholder="e.g. Sunset Heights Apartments" required />
          <Input label="Address" value={propAddress} onChange={(e) => setPropAddress(e.target.value)} placeholder="Full street address" required />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddPropOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Create Property</Button>
          </div>
        </form>
      </Modal>

      {/* Add Unit Modal */}
      <Modal isOpen={isAddUnitOpen} onClose={() => setIsAddUnitOpen(false)} title="Add Unit to Property">
        <form onSubmit={handleCreateUnit} className="space-y-4">
          <Input label="Unit Name / Number" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="e.g. Apt 302" required />
          <Input label={`Monthly Rent (${pack.currency.code})`} type="number" value={unitRent} onChange={(e) => setUnitRent(e.target.value)} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddUnitOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Add Unit</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
