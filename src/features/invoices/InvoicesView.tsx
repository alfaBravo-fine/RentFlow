import React, { useState } from 'react';
import { db } from '../../db/client';
import { Invoice, Payment, Lease, Tenant, Property, Unit, Organization } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { computeLateFee } from '../../lib/lateFee';
import { printReceiptDocument } from '../../lib/pdf';
import { exportToXLSX } from '../../lib/xlsx';
import { buildWhatsAppLink, buildEmailLink } from '../../lib/deepLinks';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Receipt,
  Plus,
  AlertCircle,
  CheckCircle,
  Download,
  Wallet,
  CreditCard,
  FileSpreadsheet,
  Send,
  Mail,
  XCircle,
} from '../../components/icons';

export const InvoicesView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>(() => db.getTable<Invoice>('invoices'));
  const leases = db.getTable<Lease>('leases');
  const tenants = db.getTable<Tenant>('tenants');
  const units = db.getTable<Unit>('units');
  const properties = db.getTable<Property>('properties');
  const org = db.getTable<Organization>('organizations')[0] || { name: 'RentFlow Landlord' };

  // Modals
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [selectedLeaseId, setSelectedLeaseId] = useState(leases[0]?.id || '');
  const [paymentAmount, setPaymentAmount] = useState('1850');
  const [paymentMethod, setPaymentMethod] = useState(pack.paymentMethods[0] || 'ACH Bank Transfer');

  // Void modal
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [voidingInvoiceId, setVoidingInvoiceId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('Duplicate billing entry / Lease amendment');

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeaseId) {
      showToast({ type: 'error', message: 'Please select a lease agreement!' });
      return;
    }

    const amountMinor = Math.round((parseFloat(paymentAmount) || 0) * 100);
    if (amountMinor <= 0) {
      showToast({ type: 'error', message: 'Payment amount must be greater than zero!' });
      return;
    }

    const { payment } = db.allocatePayment(
      selectedLeaseId,
      amountMinor,
      paymentMethod,
      `REF-${Date.now().toString().slice(-6)}`
    );

    setInvoices(db.getTable<Invoice>('invoices'));
    setIsRecordOpen(false);
    showToast({
      type: 'success',
      message: `FIFO payment of ${formatMoney(amountMinor, pack)} recorded (Ref: ${payment.reference})`,
    });
  };

  const handleApplyLateFees = () => {
    let appliedCount = 0;
    const updatedInvoices = invoices.map((inv) => {
      const lease = leases.find((l) => l.id === inv.lease_id);
      if (!lease || inv.status === 'paid' || inv.status === 'voided') return inv;

      const feeRes = computeLateFee(inv, lease, pack, new Date());
      if (feeRes.feeMinor > 0 && inv.late_fee_minor !== feeRes.feeMinor) {
        appliedCount++;
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
    showToast({
      type: 'info',
      message: `Late fees checked: ${appliedCount} overdue invoice(s) assessed under ${pack.name} regulations.`,
    });
  };

  const handleVoidInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidingInvoiceId || !voidReason.trim()) {
      showToast({ type: 'error', message: 'A void reason is required!' });
      return;
    }

    db.updateItem<Invoice>('invoices', voidingInvoiceId, {
      status: 'voided',
      voided_reason: voidReason.trim(),
    });

    setInvoices(db.getTable<Invoice>('invoices'));
    setIsVoidOpen(false);
    showToast({
      type: 'info',
      message: `Invoice #${voidingInvoiceId} has been voided.`,
    });
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
      showToast({ type: 'success', message: 'Printable receipt generated' });
    }
  };

  const handleExportRentRollXLSX = () => {
    const data = invoices.map((inv) => {
      const lease = leases.find((l) => l.id === inv.lease_id);
      const tenant = tenants.find((t) => t.id === lease?.tenant_id);
      const unit = units.find((u) => u.id === lease?.unit_id);

      return {
        'Invoice #': inv.id,
        Tenant: tenant?.name || 'N/A',
        Phone: tenant?.phone || '',
        Unit: unit?.name || '',
        'Period Start': inv.period_start,
        'Period End': inv.period_end,
        'Due Date': inv.due_date,
        'Subtotal Amount': inv.subtotal_minor / 100,
        'Late Fee Amount': inv.late_fee_minor / 100,
        'Total Amount': inv.total_minor / 100,
        'Amount Paid': inv.amount_paid_minor / 100,
        Currency: inv.currency_code,
        Status: inv.status.toUpperCase(),
      };
    });

    exportToXLSX(`RentFlow_RentRoll_${pack.code}_${new Date().toISOString().slice(0, 10)}`, [
      { name: 'Rent Roll & Invoices', data },
    ]);
    showToast({ type: 'success', message: 'Real Excel (.xlsx) Rent Roll downloaded!' });
  };

  const handleSendInvoiceWhatsApp = (inv: Invoice) => {
    const lease = leases.find((l) => l.id === inv.lease_id);
    const tenant = tenants.find((t) => t.id === lease?.tenant_id);
    if (!tenant) return;

    const unpaidMinor = inv.total_minor - inv.amount_paid_minor;
    const msg = `Hello ${tenant.name}, invoice #${inv.id} for ${formatMoney(inv.total_minor, pack)} is due on ${inv.due_date}. Balance remaining: ${formatMoney(unpaidMinor, pack)}. Please arrange payment.`;
    const url = buildWhatsAppLink(tenant.phone, msg);
    window.open(url, '_blank');
    showToast({ type: 'success', message: `WhatsApp invoice reminder opened for ${tenant.name}` });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Rent Roll & Invoicing</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Append-only financial records &bull; FIFO payment engine &bull; Excel .xlsx export
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportRentRollXLSX} className="gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Rent Roll (.xlsx)</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleApplyLateFees} className="gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-[var(--status-warning-fg)]" />
            <span>Apply Statutory Late Fees</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsRecordOpen(true)} className="gap-1.5">
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
                    : inv.status === 'voided'
                    ? 'neutral'
                    : 'neutral';

                return (
                  <tr key={inv.id} className="hover:bg-[var(--surface)] transition-colors">
                    <td className="py-3 px-3 font-mono font-medium text-[var(--text)]">
                      {inv.id}
                      {inv.voided_reason && (
                        <span className="block text-[10px] text-[var(--text-subtle)] line-clamp-1 italic">
                          Void: {inv.voided_reason}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-[var(--text)]">{tenant?.name || 'N/A'}</p>
                      <p className="text-[11px] text-[var(--text-subtle)]">{unit?.name || 'N/A'}</p>
                    </td>
                    <td className="py-3 px-3 text-[var(--text-muted)]">
                      <p className="font-medium text-[var(--text)]">{inv.due_date}</p>
                      <p className="text-[10px] text-[var(--text-subtle)]">
                        {inv.period_start} to {inv.period_end}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--text)]">
                      {formatMoney(inv.subtotal_minor, pack)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[var(--status-danger-fg)]">
                      {formatMoney(inv.late_fee_minor, pack)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[var(--text)]">
                      {formatMoney(inv.total_minor, pack)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-[var(--status-success-fg)]">
                      {formatMoney(inv.amount_paid_minor, pack)}
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={statusVariant}>{inv.status.replace('_', ' ').toUpperCase()}</Badge>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2 gap-1"
                          onClick={() => handlePrintReceipt(inv)}
                          title="Print Official Receipt"
                        >
                          <Download className="w-3 h-3" />
                          <span>Receipt</span>
                        </Button>

                        <button
                          onClick={() => handleSendInvoiceWhatsApp(inv)}
                          className="p-1 text-[var(--text-subtle)] hover:text-emerald-600 cursor-pointer"
                          title="Send WhatsApp Reminder"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>

                        {inv.status !== 'voided' && (
                          <button
                            onClick={() => {
                              setVoidingInvoiceId(inv.id);
                              setIsVoidOpen(true);
                            }}
                            className="p-1 text-[var(--text-subtle)] hover:text-[var(--status-danger-fg)] cursor-pointer"
                            title="Void Invoice"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              Select Lease Agreement *
            </label>
            <select
              value={selectedLeaseId}
              onChange={(e) => setSelectedLeaseId(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
            >
              {leases.map((l) => {
                const t = tenants.find((tenant) => tenant.id === l.tenant_id);
                return (
                  <option key={l.id} value={l.id}>
                    Lease #{l.id} - {t?.name} ({formatMoney(l.rent_minor, pack)})
                  </option>
                );
              })}
            </select>
          </div>

          <Input
            label={`Payment Amount (${pack.currency.code}) *`}
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            required
          />

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-ring"
            >
              {pack.paymentMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-[6px] bg-[var(--accent-subtle)] border border-[var(--accent)] text-xs text-[var(--accent)]">
            <strong>FIFO Rule Enforced:</strong> Payment will automatically settle the oldest outstanding invoices first. Any excess overpayment creates an unapplied tenant credit.
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <Button type="button" variant="outline" onClick={() => setIsRecordOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Allocate Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Void Invoice */}
      <Modal
        isOpen={isVoidOpen}
        onClose={() => setIsVoidOpen(false)}
        title={`Void Invoice #${voidingInvoiceId}`}
      >
        <form onSubmit={handleVoidInvoice} className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">
            Under Rule 3, invoices are append-only. Voiding an invoice neutralizes the record and stamps the audit log.
          </p>

          <Input
            label="Reason for Voiding Invoice *"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="e.g. Duplicate billing entry, tenant moved out"
            required
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <Button type="button" variant="outline" onClick={() => setIsVoidOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Confirm Void Invoice
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
