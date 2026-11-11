import React, { useMemo } from 'react';
import { db } from '../../db/client';
import { Tenant, Lease, Invoice, Payment, MaintenanceRequest, Unit, Property } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { usePrint } from '../../components/print/PrintContext';
import {
  Receipt,
  Printer,
  Calendar,
  CreditCard,
  Wrench,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
} from '../../components/icons';

interface TenantLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
}

interface LedgerEntry {
  id: string;
  date: string;
  type: 'charge' | 'payment' | 'late_fee' | 'maintenance';
  title: string;
  description: string;
  debitMinor: number; // + amount owed
  creditMinor: number; // - amount paid
  runningBalanceMinor: number;
}

export const TenantLedgerModal: React.FC<TenantLedgerModalProps> = ({
  isOpen,
  onClose,
  tenant,
}) => {
  const pack = usePack();
  const { printReport } = usePrint();

  const leases = db.getTable<Lease>('leases').filter((l) => !l.deleted_at && !(l as any).deletedAt);
  const invoices = db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at && !(i as any).deletedAt);
  const payments = db.getTable<Payment>('payments').filter((p) => !p.deleted_at && !(p as any).deletedAt);
  const maintenance = db.getTable<MaintenanceRequest>('maintenance_requests').filter((m) => !m.deleted_at && !(m as any).deletedAt);
  const units = db.getTable<Unit>('units');
  const properties = db.getTable<Property>('properties');

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const propertyMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);

  const { ledgerEntries, totalChargedMinor, totalPaidMinor, currentBalanceMinor } = useMemo(() => {
    if (!tenant) {
      return { ledgerEntries: [], totalChargedMinor: 0, totalPaidMinor: 0, currentBalanceMinor: 0 };
    }

    const tenantLeases = leases.filter((l) => l.tenant_id === tenant.id);
    const tenantLeaseIds = new Set(tenantLeases.map((l) => l.id));

    const tenantInvoices = invoices.filter((i) => tenantLeaseIds.has(i.lease_id));
    const tenantInvoiceIds = new Set(tenantInvoices.map((i) => i.id));

    const tenantPayments = payments.filter((p) => tenantInvoiceIds.has(p.invoice_id));
    const tenantMaintenance = maintenance.filter((m) => m.tenant_id === tenant.id && m.paid_by === 'tenant');

    const rawList: Array<{
      id: string;
      date: string;
      type: 'charge' | 'payment' | 'late_fee' | 'maintenance';
      title: string;
      description: string;
      debitMinor: number;
      creditMinor: number;
    }> = [];

    // 1. Rent Charges
    tenantInvoices.forEach((inv) => {
      rawList.push({
        id: `inv-${inv.id}`,
        date: inv.period_start || inv.due_date || '2026-01-01',
        type: 'charge',
        title: `Rent Charge (Inv #${inv.id.slice(-6)})`,
        description: `Billing period ${inv.period_start} to ${inv.period_end}`,
        debitMinor: inv.subtotal_minor,
        creditMinor: 0,
      });

      // Statutory Late Fee Entry if applicable
      if (inv.late_fee_minor > 0) {
        rawList.push({
          id: `late-${inv.id}`,
          date: inv.due_date,
          type: 'late_fee',
          title: `Late Fee Penalty (Inv #${inv.id.slice(-6)})`,
          description: `Statutory overdue fee (${pack.name} legal rules)`,
          debitMinor: inv.late_fee_minor,
          creditMinor: 0,
        });
      }
    });

    // 2. Payments Received
    tenantPayments.forEach((p) => {
      rawList.push({
        id: `pay-${p.id}`,
        date: p.paid_at ? p.paid_at.slice(0, 10) : '2026-01-01',
        type: 'payment',
        title: `Rent Payment Received`,
        description: `Method: ${p.method.toUpperCase()} (Ref: ${p.reference || 'N/A'})`,
        debitMinor: 0,
        creditMinor: p.amount_minor,
      });
    });

    // 3. Tenant-responsible Maintenance Charges
    tenantMaintenance.forEach((m) => {
      rawList.push({
        id: `maint-${m.id}`,
        date: m.completed_at ? m.completed_at.slice(0, 10) : new Date(m.updated_at).toISOString().slice(0, 10),
        type: 'maintenance',
        title: `Repair Outlay: ${m.category.toUpperCase()}`,
        description: `${m.description}`,
        debitMinor: m.cost_minor,
        creditMinor: 0,
      });
    });

    // Sort chronologically ascending
    rawList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let running = 0;
    let charged = 0;
    let paid = 0;

    const entries: LedgerEntry[] = rawList.map((item) => {
      running += item.debitMinor - item.creditMinor;
      charged += item.debitMinor;
      paid += item.creditMinor;
      return {
        ...item,
        runningBalanceMinor: running,
      };
    });

    return {
      ledgerEntries: entries,
      totalChargedMinor: charged,
      totalPaidMinor: paid,
      currentBalanceMinor: running,
    };
  }, [tenant, leases, invoices, payments, maintenance, pack]);

  if (!tenant) return null;

  const currentLease = leases.find((l) => l.tenant_id === tenant.id && l.status === 'active');
  const currentUnit = currentLease ? unitMap.get(currentLease.unit_id) : undefined;
  const currentProperty = currentUnit ? propertyMap.get(currentUnit.property_id) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resident Account Ledger — ${tenant.name}`}
      description="Verifiable transaction timeline & cumulative running balance in accordance with Country Pack financial standards."
      maxWidth="4xl"
    >
      <div className="space-y-6">
        {/* Resident Summary Banner */}
        <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <span className="text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-bold block">
              Resident
            </span>
            <span className="text-sm font-bold text-[var(--text-primary)] block mt-0.5">
              {tenant.name}
            </span>
            <span className="text-xs text-[var(--text-secondary)] font-mono">
              {tenant.phone}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-bold block">
              Assigned Home
            </span>
            <span className="text-xs font-semibold text-[var(--text-primary)] block mt-0.5">
              {currentUnit ? currentUnit.name : 'Unassigned'}
            </span>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {currentProperty ? currentProperty.name : 'No Property'}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-bold block">
              Total Invoiced / Paid
            </span>
            <span className="text-xs font-semibold text-emerald-600 block mt-0.5 font-mono">
              Paid: {formatMoney(totalPaidMinor, pack)}
            </span>
            <span className="text-[11px] text-[var(--text-secondary)] font-mono">
              Charges: {formatMoney(totalChargedMinor, pack)}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-[var(--text-subtle)] uppercase tracking-wider font-bold block">
              Current Outstanding Balance
            </span>
            <span
              className={`text-base font-black font-mono block mt-0.5 ${
                currentBalanceMinor > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {formatMoney(currentBalanceMinor, pack)}
            </span>
            <Badge variant={currentBalanceMinor > 0 ? 'danger' : 'success'} size="sm">
              {currentBalanceMinor > 0 ? 'Arrears / Due' : 'Zero Balance'}
            </Badge>
          </div>
        </div>

        {/* Running Ledger Timeline Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              Transaction History ({ledgerEntries.length} Records)
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              Currency: {pack.currency.code} ({pack.currency.symbol})
            </span>
          </div>

          {ledgerEntries.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40 text-indigo-500" />
              <span>No ledger activity recorded for this tenant yet.</span>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--bg-base)] text-[var(--text-secondary)] uppercase">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Type</th>
                    <th className="py-2.5 px-3 font-semibold">Description</th>
                    <th className="py-2.5 px-3 font-semibold text-right text-rose-600">Charge (+)</th>
                    <th className="py-2.5 px-3 font-semibold text-right text-emerald-600">Payment (-)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
                  {ledgerEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[var(--bg-surface-sunken)] transition-colors">
                      <td className="py-3 px-3 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                        {entry.date}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {entry.type === 'payment' ? (
                          <Badge variant="success">Payment</Badge>
                        ) : entry.type === 'late_fee' ? (
                          <Badge variant="danger">Late Fee</Badge>
                        ) : entry.type === 'maintenance' ? (
                          <Badge variant="warning">Maintenance</Badge>
                        ) : (
                          <Badge variant="accent">Rent Charge</Badge>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-[var(--text-primary)] block">
                          {entry.title}
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          {entry.description}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-right text-rose-600 whitespace-nowrap">
                        {entry.debitMinor > 0 ? `+${formatMoney(entry.debitMinor, pack)}` : '—'}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-right text-emerald-600 whitespace-nowrap">
                        {entry.creditMinor > 0 ? `-${formatMoney(entry.creditMinor, pack)}` : '—'}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-right text-[var(--text-primary)] whitespace-nowrap">
                        <span className={entry.runningBalanceMinor > 0 ? 'text-rose-600 font-black' : ''}>
                          {formatMoney(entry.runningBalanceMinor, pack)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="no-print flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              printReport(
                <div className="print-area bg-white text-black w-full max-w-[800px] mx-auto font-sans p-10 space-y-6">
                  <div className="flex items-start justify-between pb-5 border-b-2 border-gray-900">
                    <div>
                      <h1 className="text-xl font-bold text-gray-950">Resident Account Ledger</h1>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {tenant.name} &middot; {currentProperty ? currentProperty.name : 'Portfolio'} ({currentUnit ? currentUnit.name : 'Unassigned'})
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-600 tabular-nums">
                      <div className="font-bold text-gray-950">
                        Balance: {formatMoney(currentBalanceMinor, pack)}
                      </div>
                      <div>Currency: {pack.currency.code}</div>
                    </div>
                  </div>

                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 font-bold uppercase text-gray-700">
                        <th className="py-2.5 pr-3">Date</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-right tabular-nums">Charge (+)</th>
                        <th className="py-2.5 px-3 text-right tabular-nums">Payment (-)</th>
                        <th className="py-2.5 pl-3 text-right tabular-nums">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {ledgerEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="py-2.5 pr-3 font-mono tabular-nums whitespace-nowrap">{entry.date}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-gray-900 block">{entry.title}</span>
                            <span className="text-[11px] text-gray-500">{entry.description}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {entry.debitMinor > 0 ? `+${formatMoney(entry.debitMinor, pack)}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {entry.creditMinor > 0 ? `-${formatMoney(entry.creditMinor, pack)}` : '—'}
                          </td>
                          <td className="py-2.5 pl-3 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                            {formatMoney(entry.runningBalanceMinor, pack)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }}
            className="gap-2"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Formal Ledger Statement</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
