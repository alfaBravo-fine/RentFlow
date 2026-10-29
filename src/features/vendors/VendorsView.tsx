import React, { useState } from 'react';
import { db } from '../../db/client';
import { Vendor } from '../../db/schema';
import { generateUUID } from '../../lib/uuid';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { HardHat, Plus, Phone, Mail } from '../../components/icons';

export const VendorsView: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>(() => db.getTable<Vendor>('vendors'));
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('plumbing');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const handleCreateVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    db.insertItem<Vendor>('vendors', {
      id: generateUUID(),
      org_id: 'org_demo_1',
      name,
      category,
      phone,
      email,
      rating: 5.0,
    });

    setVendors(db.getTable<Vendor>('vendors'));
    setIsAddOpen(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Contractors & Vendors Directory</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Approved maintenance trade specialists</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          <span>Add Vendor</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {vendors.map((v) => (
          <Card key={v.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardHat className="w-5 h-5 text-[var(--accent)]" />
                <h3 className="text-sm font-semibold text-[var(--text)]">{v.name}</h3>
              </div>
              <Badge variant="info">{v.category.toUpperCase()}</Badge>
            </div>

            <div className="text-xs text-[var(--text-muted)] space-y-1">
              <p className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                <span>{v.phone}</span>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                <span>{v.email}</span>
              </p>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register Vendor">
        <form onSubmit={handleCreateVendor} className="space-y-4">
          <Input label="Company / Contractor Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} required />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Add Vendor</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
