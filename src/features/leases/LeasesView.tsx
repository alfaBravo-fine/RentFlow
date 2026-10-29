import React, { useState } from 'react';
import { db } from '../../db/client';
import { Lease, Tenant, Unit, Deposit } from '../../db/schema';
import { resolvePack } from '../../countries/resolver';
import { formatMoney } from '../../lib/money';
import { accrueDepositInterest } from '../../lib/interest';
import { formatDate } from '../../lib/format';
import { generateUUID } from '../../lib/uuid';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { FileText, Plus, ShieldCheck, Clock, AlertCircle, Wallet } from '../../components/icons';

export const LeasesView: React.FC = () => {
  const pack = resolvePack();
  const [leases, setLeases] = useState<Lease[]>(() => db.getTable<Lease>('leases'));
  const tenants = db.getTable<Tenant>('tenants');
  const units = db.getTable<Unit>('units');
  const deposits = db.getTable<Deposit>('deposits');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [tenantId, setTenantId] = useState(tenants[0]?.id || '');
  const [rentAmount, setRentAmount] = useState('1850');
  const [depositAmount, setDepositAmount] = useState('1850');

  const handleCreateLease = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId || !tenantId) return;

    const rentMinor = Math.round(parseFloat(rentAmount) * 100);
    const depMinor = Math.round(parseFloat(depositAmount) * 100);

    const leaseId = generateUUID();
    db.insertItem<Lease>('leases', {
      id: leaseId,
      unit_id: unitId,
      tenant_id: tenantId,
      start_date: '2026-11-01',
      end_date: '2027-10-31',
      rent_minor: rentMinor,
      currency_code: pack.currency.code,
      country_code_snapshot: pack.code,
      pack_version_snapshot: pack.version,
      billing_cycle: 'monthly',
      due_day: pack.billingDueDayDefault,
      deposit_minor: depMinor,
      late_fee_type: pack.lateFee.type === 'flat' ? 'flat' : 'percent',
      late_fee_value: pack.lateFee.maxValue || 5,
      grace_days: pack.lateFee.graceDaysDefault,
      status: 'active',
    });

    if (depMinor > 0) {
      db.insertItem<Deposit>('deposits', {
        id: generateUUID(),
        lease_id: leaseId,
        amount_minor: depMinor,
        currency_code: pack.currency.code,
        received_at: '2026-11-01',
        status: 'held',
        interest_accrued_minor: 0,
        returned_minor: 0,
      });
    }

    setLeases(db.getTable<Lease>('leases'));
    setIsAddOpen(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Leases & Statutory Deposits</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Frozen country pack snapshots, lease terms, and deposit interest accrual engine
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          <span>New Lease Agreement</span>
        </Button>
      </div>

      <div className="space-y-4">
        {leases.map((lease) => {
          const tenant = tenants.find((t) => t.id === lease.tenant_id);
          const unit = units.find((u) => u.id === lease.unit_id);
          const deposit = deposits.find((d) => d.lease_id === lease.id);

          // Compute deposit interest using interest engine
          const accruedInterest = deposit
            ? accrueDepositInterest({
                principalMinor: deposit.amount_minor,
                pack,
                from: deposit.received_at,
                to: new Date(),
              })
            : 0;

          const isExpiringSoon = lease.status === 'expiring';

          return (
            <Card key={lease.id} className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[6px] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--text)]">
                        Lease #{lease.id} &bull; {unit?.name}
                      </h3>
                      <Badge variant="info">Frozen {lease.country_code_snapshot} Pack v{lease.pack_version_snapshot}</Badge>
                    </div>
                    <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                      Tenant: <span className="font-medium text-[var(--text)]">{tenant?.name}</span> &bull; {formatDate(lease.start_date, pack)} – {formatDate(lease.end_date, pack)}
                    </p>
                  </div>
                </div>
                <Badge variant={isExpiringSoon ? 'warning' : 'success'}>
                  {lease.status.toUpperCase()}
                </Badge>
              </div>

              {/* Terms & Deposit Summary Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-xs">
                <div>
                  <span className="block text-[10px] text-[var(--text-subtle)] uppercase">Monthly Rent</span>
                  <span className="text-sm font-bold number-tabular text-[var(--text)]">
                    {formatMoney(lease.rent_minor, pack)}
                  </span>
                </div>

                <div>
                  <span className="block text-[10px] text-[var(--text-subtle)] uppercase">Security Deposit Held</span>
                  <span className="text-sm font-bold number-tabular text-[var(--text)]">
                    {formatMoney(lease.deposit_minor, pack)}
                  </span>
                </div>

                <div>
                  <span className="block text-[10px] text-[var(--text-subtle)] uppercase">Accrued Interest (Engine)</span>
                  <span className="text-sm font-bold number-tabular text-[var(--status-success-fg)] flex items-center gap-1">
                    <Wallet className="w-3.5 h-3.5" />
                    {formatMoney(accruedInterest, pack)}
                  </span>
                </div>

                <div>
                  <span className="block text-[10px] text-[var(--text-subtle)] uppercase">Late Fee Rule</span>
                  <span className="font-medium text-[var(--text)]">
                    {lease.late_fee_type === 'flat' ? formatMoney(lease.late_fee_value * 100, pack) : `${lease.late_fee_value}%`} ({lease.grace_days}d grace)
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Create Lease Agreement">
        <form onSubmit={handleCreateLease} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Select Unit</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name} - {formatMoney(u.rent_minor, pack)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Select Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
              ))}
            </select>
          </div>

          <Input label={`Monthly Rent (${pack.currency.code})`} type="number" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} required />
          <Input label={`Security Deposit (${pack.currency.code})`} type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} required />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Create Lease</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
