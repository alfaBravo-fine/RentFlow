import React, { useState } from 'react';
import { db } from '../../db/client';
import { Lease, Tenant, Unit, Deposit } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { accrueDepositInterest } from '../../lib/interest';
import { formatDate } from '../../lib/format';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  FileText,
  Plus,
  ShieldCheck,
  Clock,
  AlertCircle,
  Wallet,
  Pencil,
  Trash2,
  Receipt,
  CheckCircle,
} from '../../components/icons';

export const LeasesView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const [leases, setLeases] = useState<Lease[]>(() => db.getTable<Lease>('leases'));
  const tenants = db.getTable<Tenant>('tenants');
  const units = db.getTable<Unit>('units');
  const [deposits, setDeposits] = useState<Deposit[]>(() => db.getTable<Deposit>('deposits'));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLease, setEditingLease] = useState<Lease | null>(null);

  // Form states
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [tenantId, setTenantId] = useState(tenants[0]?.id || '');
  const [startDate, setStartDate] = useState('2026-11-01');
  const [endDate, setEndDate] = useState('2027-10-31');
  const [rentAmount, setRentAmount] = useState('1850');
  const [depositAmount, setDepositAmount] = useState('1850');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'quarterly' | 'bi-annual' | 'annual'>('monthly');
  const [dueDay, setDueDay] = useState(String(pack.billingDueDayDefault || 1));
  const [leaseStatus, setLeaseStatus] = useState<'active' | 'expiring' | 'expired' | 'terminated'>('active');

  // Deduction modal
  const [isDeductionModalOpen, setIsDeductionModalOpen] = useState(false);
  const [deductionLeaseId, setDeductionLeaseId] = useState<string | null>(null);
  const [deductionReason, setDeductionReason] = useState('End of tenancy deep cleaning');
  const [deductionAmount, setDeductionAmount] = useState('250');

  const handleOpenAdd = () => {
    setEditingLease(null);
    setUnitId(units[0]?.id || '');
    setTenantId(tenants[0]?.id || '');
    setStartDate(new Date().toISOString().split('T')[0]);
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setEndDate(nextYear.toISOString().split('T')[0]);
    setRentAmount('1850');
    setDepositAmount('1850');
    setBillingCycle('monthly');
    setDueDay(String(pack.billingDueDayDefault || 1));
    setLeaseStatus('active');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (l: Lease) => {
    setEditingLease(l);
    setUnitId(l.unit_id);
    setTenantId(l.tenant_id);
    setStartDate(l.start_date);
    setEndDate(l.end_date);
    setRentAmount(String(l.rent_minor / 100));
    setDepositAmount(String(l.deposit_minor / 100));
    setBillingCycle(l.billing_cycle);
    setDueDay(String(l.due_day));
    setLeaseStatus(l.status as any);
    setIsModalOpen(true);
  };

  const handleSaveLease = (e: React.FormEvent) => {
    e.preventDefault();

    // Required fields validation: start_date, end_date, rent_minor, billing_cycle, due_day, deposit_minor
    if (!unitId || !tenantId) {
      showToast({ type: 'error', message: 'Unit and Tenant are required fields!' });
      return;
    }
    if (!startDate || !endDate) {
      showToast({ type: 'error', message: 'Lease start and end dates are required!' });
      return;
    }

    const rentMinor = Math.round((parseFloat(rentAmount) || 0) * 100);
    const depMinor = Math.round((parseFloat(depositAmount) || 0) * 100);
    const dueDayVal = parseInt(dueDay) || 1;

    if (rentMinor <= 0) {
      showToast({ type: 'error', message: 'Rent amount must be greater than zero!' });
      return;
    }

    if (editingLease) {
      db.updateItem<Lease>('leases', editingLease.id, {
        unit_id: unitId,
        tenant_id: tenantId,
        start_date: startDate,
        end_date: endDate,
        rent_minor: rentMinor,
        billing_cycle: billingCycle,
        due_day: dueDayVal,
        deposit_minor: depMinor,
        status: leaseStatus,
      });
      showToast({ type: 'success', message: `Lease #${editingLease.id} updated` });
    } else {
      const leaseId = generateUUID();
      db.insertItem<Lease>('leases', {
        id: leaseId,
        unit_id: unitId,
        tenant_id: tenantId,
        start_date: startDate,
        end_date: endDate,
        rent_minor: rentMinor,
        currency_code: pack.currency.code,
        country_code_snapshot: pack.code,
        pack_version_snapshot: pack.version,
        billing_cycle: billingCycle,
        due_day: dueDayVal,
        deposit_minor: depMinor,
        late_fee_type: pack.lateFee.type === 'flat' ? 'flat' : 'percent',
        late_fee_value: pack.lateFee.maxValue || 5,
        grace_days: pack.lateFee.graceDaysDefault,
        status: leaseStatus,
      });

      if (depMinor > 0) {
        db.insertItem<Deposit>('deposits', {
          id: generateUUID(),
          lease_id: leaseId,
          amount_minor: depMinor,
          currency_code: pack.currency.code,
          received_at: startDate,
          status: 'held',
          interest_accrued_minor: 0,
          returned_minor: 0,
        });
      }
      showToast({ type: 'success', message: 'New lease agreement registered' });
    }

    setLeases(db.getTable<Lease>('leases'));
    setDeposits(db.getTable<Deposit>('deposits'));
    setIsModalOpen(false);
  };

  const handleDeleteLease = (l: Lease) => {
    const success = db.softDeleteItem<Lease>('leases', l.id);
    if (success) {
      setLeases(db.getTable<Lease>('leases'));
      showToast({
        type: 'info',
        message: `Lease #${l.id} archived`,
        onUndo: () => {
          db.updateItem<Lease>('leases', l.id, { deleted_at: null });
          setLeases(db.getTable<Lease>('leases'));
          showToast({ type: 'success', message: `Restored lease #${l.id}` });
        },
      });
    }
  };

  // Record Deposit Deduction
  const handleRecordDeduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deductionLeaseId) return;

    const deposit = deposits.find((d) => d.lease_id === deductionLeaseId);
    if (!deposit) {
      showToast({ type: 'error', message: 'No security deposit found for this lease!' });
      return;
    }

    const deductMinor = Math.round((parseFloat(deductionAmount) || 0) * 100);
    const existingDeductions = deposit.deductions_json ? JSON.parse(deposit.deductions_json) : [];
    existingDeductions.push({
      id: generateUUID(),
      amount_minor: deductMinor,
      reason: deductionReason,
      date: new Date().toISOString(),
    });

    db.updateItem<Deposit>('deposits', deposit.id, {
      deductions_json: JSON.stringify(existingDeductions),
      status: 'partially_returned',
    });

    setDeposits(db.getTable<Deposit>('deposits'));
    setIsDeductionModalOpen(false);
    showToast({
      type: 'success',
      message: `Deposit deduction of ${formatMoney(deductMinor, pack)} recorded`,
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Leases & Statutory Deposits</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Full editing &bull; Frozen country pack snapshots &bull; Deposit deduction ledger
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleOpenAdd} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          <span>New Lease Agreement</span>
        </Button>
      </div>

      <div className="space-y-4">
        {leases.map((lease) => {
          const tenant = tenants.find((t) => t.id === lease.tenant_id);
          const unit = units.find((u) => u.id === lease.unit_id);
          const deposit = deposits.find((d) => d.lease_id === lease.id);

          // Deductions calculation
          const deductionList: { amount_minor: number; reason: string; date: string }[] =
            deposit?.deductions_json ? JSON.parse(deposit.deductions_json) : [];
          const totalDeductionsMinor = deductionList.reduce((acc, item) => acc + item.amount_minor, 0);
          const netDepositHeldMinor = Math.max(0, (deposit?.amount_minor || 0) - totalDeductionsMinor);

          // Compute deposit interest using interest engine
          const accruedInterest = deposit
            ? accrueDepositInterest({
                principalMinor: netDepositHeldMinor,
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
                  <div className="w-10 h-10 rounded-[6px] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--text)]">
                        Lease #{lease.id} &bull; {unit?.name || 'Unassigned Unit'}
                      </h3>
                      <Badge variant="info">
                        Frozen {lease.country_code_snapshot} v{lease.pack_version_snapshot}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                      Tenant:{' '}
                      <span className="font-medium text-[var(--text)]">{tenant?.name || 'Unknown'}</span>{' '}
                      &bull; {formatDate(lease.start_date, pack)} – {formatDate(lease.end_date, pack)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Badge variant={isExpiringSoon ? 'warning' : 'success'}>
                    {lease.status.toUpperCase()}
                  </Badge>
                  <button
                    onClick={() => handleOpenEdit(lease)}
                    className="p-1 text-[var(--text-subtle)] hover:text-[var(--accent)] cursor-pointer"
                    title="Edit Lease"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteLease(lease)}
                    className="p-1 text-[var(--text-subtle)] hover:text-[var(--status-danger-fg)] cursor-pointer"
                    title="Archive Lease"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Terms & Deposit Summary Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-3.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] text-xs">
                <div>
                  <span className="block text-[10px] text-[var(--text-subtle)] uppercase">Monthly Rent</span>
                  <span className="text-sm font-bold number-tabular text-[var(--text)]">
                    {formatMoney(lease.rent_minor, pack)}
                  </span>
                  <span className="text-[10px] text-[var(--text-subtle)] block mt-0.5">Due day {lease.due_day}</span>
                </div>

                <div>
                  <span className="block text-[10px] text-[var(--text-subtle)] uppercase">Deposit Balance</span>
                  <span className="text-sm font-bold number-tabular text-[var(--text)]">
                    {formatMoney(netDepositHeldMinor, pack)}
                  </span>
                  {totalDeductionsMinor > 0 && (
                    <span className="text-[10px] text-[var(--status-danger-fg)] block">
                      -{formatMoney(totalDeductionsMinor, pack)} deducted
                    </span>
                  )}
                </div>

                <div>
                  <span className="block text-[10px] text-[var(--text-subtle)] uppercase">Accrued Interest</span>
                  <span className="text-sm font-bold number-tabular text-[var(--status-success-fg)] flex items-center gap-1">
                    <Wallet className="w-3.5 h-3.5" />
                    {formatMoney(accruedInterest, pack)}
                  </span>
                </div>

                <div className="flex flex-col justify-between">
                  <div>
                    <span className="block text-[10px] text-[var(--text-subtle)] uppercase">Late Fee Rule</span>
                    <span className="font-medium text-[var(--text)]">
                      {lease.late_fee_type === 'flat'
                        ? formatMoney(lease.late_fee_value * 100, pack)
                        : `${lease.late_fee_value}%`}{' '}
                      ({lease.grace_days}d grace)
                    </span>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 self-start mt-2"
                    onClick={() => {
                      setDeductionLeaseId(lease.id);
                      setIsDeductionModalOpen(true);
                    }}
                  >
                    <span>Record Deduction</span>
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal: Create / Edit Lease */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingLease ? `Edit Lease: #${editingLease.id}` : 'Create Lease Agreement'}
      >
        <form onSubmit={handleSaveLease} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                Select Unit *
              </label>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} - {formatMoney(u.rent_minor, pack)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                Select Tenant *
              </label>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date *"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Input
              label="End Date *"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={`Monthly Rent (${pack.currency.code}) *`}
              type="number"
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
              required
            />
            <Input
              label={`Security Deposit (${pack.currency.code}) *`}
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                Billing Cycle
              </label>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as any)}
                className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="bi-annual">Bi-Annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <Input
              label="Due Day (1-28)"
              type="number"
              min="1"
              max="28"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
            />
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                Lease Status
              </label>
              <select
                value={leaseStatus}
                onChange={(e) => setLeaseStatus(e.target.value as any)}
                className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
              >
                <option value="active">Active</option>
                <option value="expiring">Expiring Soon</option>
                <option value="expired">Expired</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingLease ? 'Save Lease Changes' : 'Create Lease'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Deposit Deduction */}
      <Modal
        isOpen={isDeductionModalOpen}
        onClose={() => setIsDeductionModalOpen(false)}
        title="Record Deposit Deduction"
      >
        <form onSubmit={handleRecordDeduction} className="space-y-4">
          <Input
            label="Deduction Reason *"
            value={deductionReason}
            onChange={(e) => setDeductionReason(e.target.value)}
            placeholder="e.g. Broken fixture replacement, carpet repair"
            required
          />

          <Input
            label={`Deduction Amount (${pack.currency.code}) *`}
            type="number"
            value={deductionAmount}
            onChange={(e) => setDeductionAmount(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <Button type="button" variant="outline" onClick={() => setIsDeductionModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Apply Deduction
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
