import React, { useState } from 'react';
import { db } from '../../db/client';
import { Tenant, Lease, Unit } from '../../db/schema';
import { generateUUID } from '../../lib/uuid';
import { buildWhatsAppLink, buildSmsLink } from '../../lib/deepLinks';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Users,
  Plus,
  Mail,
  Phone,
  ShieldCheck,
  UserPlus,
  FileText,
  Pencil,
  Trash2,
  Copy,
  Send,
  Smartphone,
  ExternalLink,
} from '../../components/icons';

export const TenantsView: React.FC = () => {
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>(() => db.getTable<Tenant>('tenants'));
  const leases = db.getTable<Lease>('leases');
  const units = db.getTable<Unit>('units');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idType, setIdType] = useState("State Driver's License");
  const [idNumber, setIdNumber] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [occupants, setOccupants] = useState('1');

  const handleOpenAdd = () => {
    setEditingTenant(null);
    setName('');
    setEmail('');
    setPhone('');
    setIdType("State Driver's License");
    setIdNumber('');
    setEmergencyName('');
    setEmergencyPhone('');
    setOccupants('1');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t: Tenant) => {
    setEditingTenant(t);
    setName(t.name);
    setEmail(t.email);
    setPhone(t.phone);
    setIdType(t.id_type || "State Driver's License");
    setIdNumber(t.id_number || '');
    setEmergencyName(t.emergency_contact || '');
    setEmergencyPhone('');
    setOccupants(String(t.occupants || 1));
    setIsModalOpen(true);
  };

  const handleSaveTenant = (e: React.FormEvent) => {
    e.preventDefault();

    // Required fields check: name, phone, id_type, id_number
    if (!name.trim()) {
      showToast({ type: 'error', message: 'Tenant name is required!' });
      return;
    }
    if (!phone.trim()) {
      showToast({ type: 'error', message: 'Tenant phone number is required!' });
      return;
    }
    if (!idNumber.trim()) {
      showToast({ type: 'error', message: 'Identity document number is required!' });
      return;
    }

    if (editingTenant) {
      db.updateItem<Tenant>('tenants', editingTenant.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        id_type: idType,
        id_number: idNumber.trim(),
        emergency_contact: emergencyName.trim() || null,
        occupants: parseInt(occupants) || 1,
      });
      showToast({ type: 'success', message: `Tenant "${name}" updated` });
    } else {
      const created = db.insertItem<Tenant>('tenants', {
        id: generateUUID(),
        org_id: 'org_demo_1',
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        id_type: idType,
        id_number: idNumber.trim(),
        emergency_contact: emergencyName.trim() || null,
        occupants: parseInt(occupants) || 1,
      });
      showToast({ type: 'success', message: `Tenant "${created.name}" registered` });
    }

    setTenants(db.getTable<Tenant>('tenants'));
    setIsModalOpen(false);
  };

  const handleDeleteTenant = (t: Tenant) => {
    const success = db.softDeleteItem<Tenant>('tenants', t.id);
    if (success) {
      setTenants(db.getTable<Tenant>('tenants'));
      showToast({
        type: 'info',
        message: `Tenant "${t.name}" archived`,
        onUndo: () => {
          db.updateItem<Tenant>('tenants', t.id, { deleted_at: null });
          setTenants(db.getTable<Tenant>('tenants'));
          showToast({ type: 'success', message: `Restored tenant "${t.name}"` });
        },
      });
    }
  };

  const handleCopyPhone = (ph: string, tName: string) => {
    navigator.clipboard.writeText(ph);
    showToast({ type: 'success', message: `Copied ${tName}'s phone to clipboard!` });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Tenants Directory</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Verified resident records &bull; 1-click WhatsApp, SMS & calling triggers
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleOpenAdd} className="gap-1.5">
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add Tenant</span>
        </Button>
      </div>

      {/* Grid of Tenants */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tenants.map((t) => {
          const tenantLease = leases.find((l) => l.tenant_id === t.id);
          const tenantUnit = tenantLease ? units.find((u) => u.id === tenantLease.unit_id) : null;

          return (
            <Card key={t.id} className="space-y-3.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] font-bold flex items-center justify-center text-sm shrink-0">
                    {t.name[0]}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text)]">{t.name}</h3>
                    <p className="text-[11px] text-[var(--text-subtle)] flex items-center gap-1 mt-0.5">
                      <ShieldCheck className="w-3 h-3 text-[var(--status-success-fg)] shrink-0" />
                      <span>{t.id_type}: {t.id_number}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Badge variant={tenantLease ? 'success' : 'neutral'}>
                    {tenantLease ? 'Active Lease' : 'Unassigned'}
                  </Badge>
                  <button
                    onClick={() => handleOpenEdit(t)}
                    className="p-1 text-[var(--text-subtle)] hover:text-[var(--accent)] cursor-pointer"
                    title="Edit Tenant"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTenant(t)}
                    className="p-1 text-[var(--text-subtle)] hover:text-[var(--status-danger-fg)] cursor-pointer"
                    title="Archive Tenant"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Info details */}
              <div className="space-y-1.5 text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[var(--text-subtle)] shrink-0" />
                    <span>{t.phone}</span>
                  </div>
                  <button
                    onClick={() => handleCopyPhone(t.phone, t.name)}
                    className="text-[10px] text-[var(--text-subtle)] hover:text-[var(--accent)] flex items-center gap-0.5"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[var(--text-subtle)] shrink-0" />
                  <span className="truncate">{t.email}</span>
                </div>

                {tenantUnit && (
                  <div className="flex items-center gap-2 text-[var(--accent)] font-medium">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span>Assigned: {tenantUnit.name}</span>
                  </div>
                )}
              </div>

              {/* One-click contact action buttons */}
              <div className="pt-2 border-t border-[var(--border)] flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-[10px] px-1 gap-1"
                  onClick={() => {
                    const url = buildWhatsAppLink(t.phone, `Hello ${t.name}, from Property Management.`);
                    window.open(url, '_blank');
                  }}
                  title="WhatsApp"
                >
                  <Send className="w-3 h-3 text-emerald-600" />
                  <span>WhatsApp</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-[10px] px-1 gap-1"
                  onClick={() => {
                    const url = buildSmsLink(t.phone, `Hello ${t.name},`);
                    window.open(url, '_blank');
                  }}
                  title="SMS"
                >
                  <Smartphone className="w-3 h-3 text-blue-600" />
                  <span>SMS</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-[10px] px-1 gap-1"
                  onClick={() => window.open(`mailto:${t.email}`, '_blank')}
                  title="Email"
                >
                  <Mail className="w-3 h-3 text-amber-600" />
                  <span>Email</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0 flex items-center justify-center shrink-0"
                  onClick={() => window.open(`tel:${t.phone}`, '_blank')}
                  title="Call"
                >
                  <Phone className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal: Register / Edit Tenant */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTenant ? `Edit Tenant: ${editingTenant.name}` : 'Register New Tenant'}
      >
        <form onSubmit={handleSaveTenant} className="space-y-4">
          <Input
            label="Full Legal Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Johnathan Doe"
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone Number *"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +1 555-0144"
              required
            />
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. john.doe@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                Identity Document Type *
              </label>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
              >
                <option value="State Driver's License">State Driver's License</option>
                <option value="National Passport">National Passport</option>
                <option value="National ID Card">National ID Card / CNIC / Civil ID</option>
                <option value="Residence Permit">Residence Permit / Green Card</option>
              </select>
            </div>
            <Input
              label="ID Document Number *"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="e.g. DL-982310492"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Emergency Contact Name"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              placeholder="e.g. Mary Doe"
            />
            <Input
              label="Occupants Count"
              type="number"
              value={occupants}
              onChange={(e) => setOccupants(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingTenant ? 'Save Tenant Changes' : 'Register Tenant'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
