import React, { useState } from 'react';
import { db } from '../../db/client';
import { MaintenanceRequest, Unit, Vendor } from '../../db/schema';
import { resolvePack } from '../../countries/resolver';
import { formatMoney } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Wrench, Plus, HardHat, AlertCircle, CheckCircle } from '../../components/icons';

export const MaintenanceView: React.FC = () => {
  const pack = resolvePack();
  const [requests, setRequests] = useState<MaintenanceRequest[]>(() => db.getTable<MaintenanceRequest>('maintenance_requests'));
  const units = db.getTable<Unit>('units');
  const vendors = db.getTable<Vendor>('vendors');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [category, setCategory] = useState<'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'other'>('plumbing');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high' | 'emergency'>('high');

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId || !description) return;

    db.insertItem<MaintenanceRequest>('maintenance_requests', {
      id: generateUUID(),
      unit_id: unitId,
      category,
      description,
      urgency,
      status: 'new',
      cost_minor: 0,
      paid_by: 'landlord',
    });

    setRequests(db.getTable<MaintenanceRequest>('maintenance_requests'));
    setIsAddOpen(false);
    setDescription('');
  };

  const handleStatusChange = (reqId: string, newStatus: 'new' | 'assigned' | 'in_progress' | 'completed' | 'closed') => {
    db.updateItem<MaintenanceRequest>('maintenance_requests', reqId, { status: newStatus });
    setRequests(db.getTable<MaintenanceRequest>('maintenance_requests'));
  };

  const columns = [
    { key: 'new', label: 'New Intake', variant: 'info' as const },
    { key: 'assigned', label: 'Assigned', variant: 'warning' as const },
    { key: 'in_progress', label: 'In Progress', variant: 'warning' as const },
    { key: 'completed', label: 'Completed', variant: 'success' as const },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Maintenance Request Kanban</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Work order intake, vendor dispatching, and expense linking
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          <span>New Work Request</span>
        </Button>
      </div>

      {/* Kanban Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {columns.map((col) => {
          const colItems = requests.filter((r) => r.status === col.key);

          return (
            <div key={col.key} className="p-3 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] min-h-[500px]">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-semibold text-[var(--text)] uppercase tracking-wider">{col.label}</span>
                <Badge variant={col.variant}>{colItems.length}</Badge>
              </div>

              <div className="space-y-3">
                {colItems.map((req) => {
                  const unit = units.find((u) => u.id === req.unit_id);
                  const vendor = vendors.find((v) => v.id === req.vendor_id);

                  return (
                    <Card key={req.id} className="p-3 space-y-2 border-[var(--border-strong)]">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[var(--accent)] uppercase">{req.category}</span>
                        <Badge variant={req.urgency === 'emergency' || req.urgency === 'high' ? 'danger' : 'neutral'}>
                          {req.urgency}
                        </Badge>
                      </div>

                      <p className="text-xs font-medium text-[var(--text)] line-clamp-2">{req.description}</p>
                      <p className="text-[10px] text-[var(--text-subtle)]">Unit: {unit?.name}</p>

                      {vendor && (
                        <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                          <HardHat className="w-3 h-3 text-[var(--text-subtle)]" />
                          <span>Vendor: {vendor.name}</span>
                        </div>
                      )}

                      <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-[var(--text)]">
                          {formatMoney(req.cost_minor, pack)}
                        </span>
                        {col.key !== 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2"
                            onClick={() =>
                              handleStatusChange(
                                req.id,
                                col.key === 'new' ? 'in_progress' : col.key === 'in_progress' ? 'completed' : 'completed'
                              )
                            }
                          >
                            Advance &rarr;
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Create Maintenance Request">
        <form onSubmit={handleCreateRequest} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Select Unit</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
            >
              <option value="plumbing">Plumbing</option>
              <option value="electrical">Electrical</option>
              <option value="hvac">HVAC / Heating</option>
              <option value="appliance">Appliance</option>
              <option value="structural">Structural</option>
              <option value="other">Other</option>
            </select>
          </div>

          <Input label="Issue Description" value={description} onChange={(e) => setDescription(e.target.value)} required />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Create Work Request</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
