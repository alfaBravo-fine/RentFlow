import React, { useState } from 'react';
import { db } from '../../db/client';
import { Invoice, Payment, Lease, Tenant, Property, Unit, Organization } from '../../db/schema';
import { resolvePack } from '../../countries/resolver';
import { formatMoney } from '../../lib/money';
import { computeLateFee } from '../../lib/lateFee';
import { printReceiptDocument } from '../../lib/pdf';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Receipt, Plus, AlertCircle, CheckCircle, Download, Wallet, CreditCard } from '../../components/icons';

export const InvoicesView: React.FC = () => {
  const pack = resolvePack();
  const [invoices, setInvoices] = useState<Invoice[]>(() => db.getTable<Invoice>('invoices'));
  const leases = db.getTable<Lease>('leases');
  const tenants = db.getTable<Tenant>('tenants');
  const units = db.getTable<Unit>('units');
  const properties = db.getTable<Property>('properties');
  const org = db.getTable<Organization>('organizations')[0] || { name: 'RentFlow Landlord' };

  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [selectedLeaseId, setSelectedLeaseId] = useState(leases[0]?.id || '');
  const [paymentAmount, setPaymentAmount] = useState('1850');
  const [paymentMethod, setPaymentMethod] = useState('ACH Bank Transfer');

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeaseId) return;

    const amountMinor = Math.round(parseFloat(paymentAmount) * 100);
    db.allocatePayment(selectedLeaseId, amountMinor, paymentMethod, `REF-${Date.now().toString().slice(-6)}`);

    setInvoices(db.getTable<Invoice>('invoices'));
    setIsRecordOpen(false);
  };

  const handleApplyLateFees = () => {
    const updatedInvoices = invoices.map((inv) => {
      const lease = leases.find((l) => l.id === inv.lease_id);
      if (!lease || inv.status === 'paid' || inv.status === 'voided') return inv;

      const feeRes = computeLateFee(inv, lease, pack, new Date());
      if (feeRes.feeMinor > 0 && inv.late_fee_minor !== feeRes.feeMinor) {
        const newTotal = inv.subtotal_minor + feeRes.feeMinor;
        return db.updateItem<Invoice>('invoices', inv.id, {
          late_fee_minor: feeRes.feeMinor,
          total_minor: newTotal,
          status: 'overdue',
        })!;
      }
      return inv;
    });

    setInvoices(updatedInvoices);
  };

  const handlePrintReceipt = (inv: Invoice) => {
    const lease = leases.find((l) => l.id === inv.lease_id);
    const tenant = tenants.find((t) => t.id === lease?.tenant_id);
    const unit = units.find((u) => u.id === lease?.unit_id);
    const property = properties.find((p) => p.id === unit?.property_id);
    const payment = db.getTable<Payment>('payments').find((p) => p.invoice_id === inv.id);

    if (lease && tenant && unit && property) {
      printReceiptDocument({
        organization: org as Organization,
        property,
        unit,
        tenant,
        lease,
        invoice: inv,
        payment,
        pack,
      });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Rent Roll & Invoicing</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Append-only financial records &bull; Statutory FIFO payment allocation engine
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleApplyLateFees}>
            <AlertCircle className="w-3.5 h-3.5 text-[var(--status-warning-fg)]" />
            <span>Apply Statutory Late Fees</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsRecordOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            <span>Record Payment (FIFO)</span>
          </Button>
        </div>
      </div>

      {/* Invoices List Table */}
      <Card>
        <CardHeader>
          <CardTitle>Rent Ledger & Invoices</CardTitle>
          <Badge variant="info">{invoices.length} Total Invoices</Badge>
        </CardHeader>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-subtle)] uppercase">
                <th className="py-2.5 px-3 font-semibold">Invoice #</th>
                <th className="py-2.5 px-3 font-semibold">Tenant & Unit</th>
                <th className="py-2.5 px-3 font-semibold">Period / Due Date</th>
                <th className="py-2.5 px-3 font-semibold text-right">Subtotal</th>
                <th className="py-2.5 px-3 font-semibold text-right">Late Fee</th>
                <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                <th className="py-2.5 px-3 font-semibold text-right">Paid</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {invoices.map((inv) => {
                const lease = leases.find((l) => l.id === inv.lease_id);
                const tenant = tenants.find((t) => t.id === lease?.tenant_id);
                const unit = units.find((u) => u.id === lease?.unit_id);

                const statusVariant =
                  inv.status === 'paid'
                    ? 'success'
                    : inv.status === 'overdue'
                    ? 'danger'
                    : inv.status === 'partially_paid'
                    ? 'warning'
                    : 'neutral';

                return (
                  <tr key={inv.id} className="hover:bg-[var(--surface)] transition-colors">
                    <td className="py-3 px-3 font-mono font-medium text-[var(--text)]">{inv.id}</td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-[var(--text)]">{tenant?.name}</p>
                      <p className="text-[11px] text-[var(--text-subtle)]">{unit?.name}</p>
                    </td>
                    <td className="py-3 px-3 text-[var(--text-muted)]">
                      <p>{inv.due_date}</p>
                      <p className="text-[10px] text-[var(--text-subtle)]">{inv.period_start} to {inv.period_end}</p>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--text)]">{formatMoney(inv.subtotal_minor, pack)}</td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--status-danger-fg)]">{formatMoney(inv.late_fee_minor, pack)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[var(--text)]">{formatMoney(inv.total_minor, pack)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[var(--status-success-fg)]">{formatMoney(inv.amount_paid_minor, pack)}</td>
                    <td className="py-3 px-3">
                      <Badge variant={statusVariant}>{inv.status.replace('_', ' ').toUpperCase()}</Badge>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => handlePrintReceipt(inv)}>
                        <Download className="w-3 h-3" />
                        <span>Receipt</span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Record Payment FIFO Modal */}
      <Modal isOpen={isRecordOpen} onClose={() => setIsRecordOpen(false)} title="Record Payment (FIFO Allocation)">
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Select Lease Agreement</label>
            <select
              value={selectedLeaseId}
              onChange={(e) => setSelectedLeaseId(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
            >
              {leases.map((l) => {
                const t = tenants.find((tenant) => tenant.id === l.tenant_id);
                return (
                  <option key={l.id} value={l.id}>
                    Lease #{l.id} - {t?.name}
                  </option>
                );
              })}
            </select>
          </div>

          <Input
            label={`Payment Amount (${pack.currency.code})`}
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            required
          />

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
            >
              {pack.paymentMethods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-[6px] bg-[var(--accent-subtle)] border border-[var(--accent)] text-xs text-[var(--accent)]">
            <strong>FIFO Rule Enforced:</strong> Payment will automatically settle the oldest outstanding invoices first. Any excess overpayment creates an unapplied tenant credit.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsRecordOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Allocate Payment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
