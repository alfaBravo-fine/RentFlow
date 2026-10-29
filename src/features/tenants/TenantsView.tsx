import React, { useState } from 'react';
import { db } from '../../db/client';
import { Tenant, Lease, Unit } from '../../db/schema';
import { generateUUID } from '../../lib/uuid';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Users, Plus, Mail, Phone, ShieldCheck, UserPlus, FileText } from '../../components/icons';

export const TenantsView: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>(() => db.getTable<Tenant>('tenants'));
  const leases = db.getTable<Lease>('leases');
  const units = db.getTable<Unit>('units');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');

  const handleAddTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    db.insertItem<Tenant>('tenants', {
      id: generateUUID(),
      org_id: 'org_demo_1',
      name,
      email,
      phone,
      id_type: 'Driver License',
      id_number: idNumber || 'DL-PENDING',
      occupants: 1,
    });

    setTenants(db.getTable<Tenant>('tenants'));
    setIsAddOpen(false);
    setName('');
    setEmail('');
    setPhone('');
    setIdNumber('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Tenants Directory</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Verified resident profiles, identity records, and lease history
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add Tenant</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tenants.map((t) => {
          const tenantLease = leases.find((l) => l.tenant_id === t.id);
          const tenantUnit = tenantLease ? units.find((u) => u.id === tenantLease.unit_id) : null;

          return (
            <Card key={t.id} className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] font-bold flex items-center justify-center text-sm">
                    {t.name[0]}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text)]">{t.name}</h3>
                    <p className="text-xs text-[var(--text-subtle)] flex items-center gap-1 mt-0.5">
                      <ShieldCheck className="w-3 h-3 text-[var(--status-success-fg)]" />
                      <span>{t.id_type}: {t.id_number}</span>
                    </p>
                  </div>
                </div>
                <Badge variant={tenantLease ? 'success' : 'neutral'}>
                  {tenantLease ? 'Active Lease' : 'Unassigned'}
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                  <span className="truncate">{t.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                  <span>{t.phone}</span>
                </div>
                {tenantUnit && (
                  <div className="flex items-center gap-2 text-[var(--accent)] font-medium">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Assigned: {tenantUnit.name}</span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register New Tenant">
        <form onSubmit={handleAddTenant} className="space-y-4">
          <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          <Input label="ID Number / Passport" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Register Tenant</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
