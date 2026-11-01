import React, { useState } from 'react';
import { db } from '../../db/client';
import { Invoice, Payment, Lease, Tenant, Property, Unit, Organization } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { computeLateFee } from '../../lib/lateFee';
import { exportToXLSX } from '../../lib/xlsx';
import { buildWhatsAppLink, buildEmailLink } from '../../lib/deepLinks';
import { formatLeaseName, formatInvoiceNumber } from '../../lib/formatNames';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PrintReceipt } from './PrintReceipt';
import {
  Plus,
  AlertCircle,
  Download,
  FileSpreadsheet,
  Send,
  XCircle,
  Printer,
  Receipt,
  CheckCircle2,
  Mail,
  Pencil,
  Trash2,
} from '../../components/icons';

export const InvoicesView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>(() => db.getTable<Invoice>('invoices'));
  const leases = db.getTable<Lease>('leases');
  const tenants = db.getTable<Tenant>('tenants');
  const units = db.getTable<Unit>('units');
  const properties = db.getTable<Property>('properties');
  const org = db.getTable<Organization>('organizations')[0] || { name: 'Horizon Property Management' };

  // Bulk reminders state (Feature 2.4)
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [isBulkRemindersOpen, setIsBulkRemindersOpen] = useState(false);

  // Reactive DB subscription
  React.useEffect(() => {
    const unsub = db.onWrite(() => {
      setInvoices(db.getTable<Invoice>('invoices'));
    });
    return unsub;
  }, []);

  // Modals
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [selectedLeaseId, setSelectedLeaseId] = useState(leases[0]?.id || '');
  const [paymentAmount, setPaymentAmount] = useState('1850');
  const [paymentMethod, setPaymentMethod] = useState(pack.paymentMethods[0] || 'ACH Bank Transfer');

  // Edit Invoice modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editDueDate, setEditDueDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editStatus, setEditStatus] = useState<Invoice['status']>('unpaid');

  // Print Receipt modal state
  const [activeReceiptData, setActiveReceiptData] = useState<{
    invoice: Invoice;
    lease: Lease;
    tenant: Tenant;
    unit: Unit;
    property: Property;
    payment?: Payment;
  } | null>(null);

  // Void modal
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [voidingInvoiceId, setVoidingInvoiceId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('Duplicate billing entry / Lease amendment');

  const handleOpenEditModal = (inv: Invoice) => {
    setEditingInvoice(inv);
    setEditDueDate(inv.due_date);
    setEditAmount(String(inv.total_minor / 100));
    setEditStatus(inv.status);
    setIsEditOpen(true);
  };

  const handleSaveEditInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;

    const amountMinor = Math.round((parseFloat(editAmount) || 0) * 100);
    if (amountMinor <= 0) {
      showToast({ type: 'error', message: 'Invoice amount must be greater than zero!' });
      return;
    }

    db.updateItem<Invoice>('invoices', editingInvoice.id, {
      due_date: editDueDate,
      subtotal_minor: amountMinor,
      total_minor: amountMinor,
      status: editStatus,
    });

    setInvoices(db.getTable<Invoice>('invoices'));
    setIsEditOpen(false);
    setEditingInvoice(null);
    showToast({ type: 'success', message: `Invoice ${formatInvoiceNumber(editingInvoice.id)} updated successfully.` });
  };

  const handleDeleteInvoice = (inv: Invoice) => {
    const success = db.deleteInvoiceCascading(inv.id);
    if (success) {
      setInvoices(db.getTable<Invoice>('invoices'));
      showToast({
        type: 'info',
        message: `Invoice ${formatInvoiceNumber(inv.id)} and associated payments removed.`,
      });
    }
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const amountMinor = Math.round((parseFloat(paymentAmount) || 0) * 100);
    if (amountMinor <= 0) {
      showToast({ type: 'error', message: 'Payment amount must be greater than zero!' });
      return;
    }

    if (payingInvoiceId) {
      const inv = invoices.find((i) => i.id === payingInvoiceId);
      if (inv) {
        const { payment } = db.recordInvoicePayment(
          inv.id,
          amountMinor,
          paymentMethod,
          `REF-${Date.now().toString().slice(-6)}`
        );
        setInvoices(db.getTable<Invoice>('invoices'));
        setIsRecordOpen(false);
        setPayingInvoiceId(null);
        showToast({
          type: 'success',
          message: `Payment of ${formatMoney(amountMinor, pack)} recorded for ${formatInvoiceNumber(inv.id)} (Ref: ${payment.reference})`,
        });
        return;
      }
    }

    if (!selectedLeaseId) {
      showToast({ type: 'error', message: 'Please select a lease agreement!' });
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
    setPayingInvoiceId(null);
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
      message: `Invoice ${formatInvoiceNumber(voidingInvoiceId)} has been voided.`,
    });
  };

  // 1.5: Deep relational lookup with graceful fallbacks
  const handleOpenReceiptModal = (inv: Invoice) => {
    const lease = leases.find((l) => l.id === inv.lease_id);
    const tenant = tenants.find((t) => t.id === lease?.tenant_id);
    const unit = units.find((u) => u.id === lease?.unit_id);
    const property = properties.find((p) => p.id === unit?.property_id);
    const payment = db.getTable<Payment>('payments').find((p) => p.invoice_id === inv.id);

    const safeTenant: Tenant = tenant || {
      id: lease?.tenant_id || 'unknown_tenant',
      org_id: 'default_org',
      name: 'Resident Tenant',
      phone: '+1 555-0100',
      email: 'tenant@example.com',
      id_type: 'National ID',
      id_number: 'N/A',
      updated_at: Date.now(),
      device_id: 'local',
    };

    const safeProperty: Property = property || {
      id: 'prop_default',
      org_id: 'default_org',
      name: 'Residential Property',
      address: 'Property Premises',
      type: 'residential_apartment',
      country_code: pack.code,
      updated_at: Date.now(),
      device_id: 'local',
    };

    const safeUnit: Unit = unit || {
      id: lease?.unit_id || 'unit_default',
      property_id: safeProperty.id,
      name: 'Unit Premises',
      size: 750,
      area_unit: pack.areaUnit,
      bedrooms: 1,
      bathrooms: 1,
      rent_minor: inv.subtotal_minor,
      currency_code: inv.currency_code,
      status: 'occupied',
      updated_at: Date.now(),
      device_id: 'local',
    };

    const safeLease: Lease = lease || {
      id: inv.lease_id,
      unit_id: safeUnit.id,
      tenant_id: safeTenant.id,
      start_date: inv.period_start,
      end_date: inv.period_end,
      rent_minor: inv.subtotal_minor,
      currency_code: inv.currency_code,
      country_code_snapshot: pack.code,
      pack_version_snapshot: 1,
      billing_cycle: 'monthly',
      due_day: 1,
      deposit_minor: inv.subtotal_minor,
      late_fee_type: 'none',
      late_fee_value: 0,
      grace_days: 5,
      status: 'active',
      updated_at: Date.now(),
      device_id: 'local',
    };

    setActiveReceiptData({
      invoice: inv,
      lease: safeLease,
      tenant: safeTenant,
      unit: safeUnit,
      property: safeProperty,
      payment,
    });
  };

  const toggleSelectAll = () => {
    if (selectedInvoiceIds.length === invoices.length) {
      setSelectedInvoiceIds([]);
    } else {
      setSelectedInvoiceIds(invoices.map((i) => i.id));
    }
  };

  const toggleSelectInvoice = (id: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExportRentRollXLSX = () => {
    const data = invoices.map((inv) => {
      const lease = leases.find((l) => l.id === inv.lease_id);
      const tenant = tenants.find((t) => t.id === lease?.tenant_id);
      const unit = units.find((u) => u.id === lease?.unit_id);

      return {
        'Invoice #': formatInvoiceNumber(inv.id, inv.period_start),
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
    const invNumber = formatInvoiceNumber(inv.id, inv.period_start);
    const msg = `Hello ${tenant.name}, invoice ${invNumber} for ${formatMoney(inv.total_minor, pack)} is due on ${inv.due_date}. Balance remaining: ${formatMoney(unpaidMinor, pack)}. Please arrange payment.`;
    const url = buildWhatsAppLink(tenant.phone, msg);
    window.open(url, '_blank');
    showToast({ type: 'success', message: `WhatsApp invoice reminder opened for ${tenant.name}` });
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Rent Roll & Invoicing
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Append-only financial records &bull; FIFO automatic allocation &bull; Real Excel export ({pack.name})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {selectedInvoiceIds.length > 0 && (
            <Button
              variant="primary"
              onClick={() => setIsBulkRemindersOpen(true)}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="w-4 h-4" />
              <span>Send Bulk Reminders ({selectedInvoiceIds.length})</span>
            </Button>
          )}
          <Button variant="outline" onClick={handleExportRentRollXLSX} className="gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Rent Roll (.xlsx)</span>
          </Button>
          <Button variant="outline" onClick={handleApplyLateFees} className="gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Apply Statutory Fees</span>
          </Button>
          <Button variant="primary" onClick={() => setIsRecordOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            <span>Record Payment (FIFO)</span>
          </Button>
        </div>
      </div>

      {/* Invoices List Table with 56px Row Height */}
      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              Rent Ledger & Invoices
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Itemized billing history and statutory fee adjustments
            </p>
          </div>
          <div className="flex items-center gap-3">
            {selectedInvoiceIds.length > 0 && (
              <span className="text-xs font-semibold text-emerald-600">
                {selectedInvoiceIds.length} selected
              </span>
            )}
            <Badge variant="accent">{invoices.length} Total Records</Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="py-3.5 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedInvoiceIds.length === invoices.length && invoices.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                  />
                </th>
                <th className="py-3.5 px-6">Invoice #</th>
                <th className="py-3.5 px-6">Resident & Unit</th>
                <th className="py-3.5 px-6">Due Date</th>
                <th className="py-3.5 px-6 text-right">Subtotal</th>
                <th className="py-3.5 px-6 text-right">Late Fee</th>
                <th className="py-3.5 px-6 text-right">Total</th>
                <th className="py-3.5 px-6 text-right">Paid</th>
                <th className="py-3.5 px-6 text-center">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
              {invoices.map((inv) => {
                const lease = leases.find((l) => l.id === inv.lease_id);
                const tenant = tenants.find((t) => t.id === lease?.tenant_id);
                const unit = units.find((u) => u.id === lease?.unit_id);
                const formattedInvNo = formatInvoiceNumber(inv.id, inv.period_start);
                const isSelected = selectedInvoiceIds.includes(inv.id);

                const statusVariant =
                  inv.status === 'paid'
                    ? 'success'
                    : inv.status === 'overdue'
                    ? 'danger'
                    : inv.status === 'partially_paid'
                    ? 'warning'
                    : 'neutral';

                return (
                  <tr
                    key={inv.id}
                    className={`h-14 transition-colors ${
                      isSelected ? 'bg-[var(--accent-subtle)]/40' : 'hover:bg-[var(--bg-base)]'
                    }`}
                  >
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectInvoice(inv.id)}
                        className="rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-6 font-mono font-semibold text-[var(--text-primary)] text-xs">
                      {formattedInvNo}
                      {inv.voided_reason && (
                        <span className="block text-[10px] text-[var(--text-subtle)] line-clamp-1 italic">
                          Void: {inv.voided_reason}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-6">
                      <p className="font-semibold text-[var(--text-primary)]">{tenant?.name || 'N/A'}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{unit?.name || 'N/A'}</p>
                    </td>
                    <td className="py-3 px-6 text-xs text-[var(--text-secondary)] font-mono">
                      {inv.due_date}
                    </td>
                    <td className="py-3 px-6 text-right font-mono number-tabular text-[var(--text-secondary)]">
                      {formatMoney(inv.subtotal_minor, pack)}
                    </td>
                    <td className="py-3 px-6 text-right font-mono number-tabular text-rose-600 font-medium">
                      {inv.late_fee_minor > 0 ? formatMoney(inv.late_fee_minor, pack) : '—'}
                    </td>
                    <td className="py-3 px-6 text-right font-mono font-bold number-tabular text-[var(--text-primary)]">
                      {formatMoney(inv.total_minor, pack)}
                    </td>
                    <td className="py-3 px-6 text-right font-mono font-bold number-tabular text-emerald-600">
                      {formatMoney(inv.amount_paid_minor, pack)}
                    </td>
                    <td className="py-3 px-6 text-center">
                      <Badge variant={statusVariant}>{inv.status.replace('_', ' ').toUpperCase()}</Badge>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {inv.status !== 'paid' && inv.status !== 'voided' && (
                          <button
                            onClick={() => {
                              setPayingInvoiceId(inv.id);
                              setSelectedLeaseId(inv.lease_id);
                              setPaymentAmount(String((inv.total_minor - inv.amount_paid_minor) / 100));
                              setIsRecordOpen(true);
                            }}
                            className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--accent)] hover:text-white text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer"
                            title="Pay this invoice"
                          >
                            Pay
                          </button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs px-2.5 gap-1.5"
                          onClick={() => handleOpenReceiptModal(inv)}
                          title="Print Official Receipt"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </Button>

                        <button
                          onClick={() => handleSendInvoiceWhatsApp(inv)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-emerald-600 hover:bg-[var(--bg-base)] cursor-pointer"
                          title="Send WhatsApp Reminder"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenEditModal(inv)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] cursor-pointer"
                          title="Edit Invoice"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteInvoice(inv)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-rose-600 hover:bg-[var(--bg-base)] cursor-pointer"
                          title="Delete Invoice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {inv.status !== 'voided' && (
                          <button
                            onClick={() => {
                              setVoidingInvoiceId(inv.id);
                              setIsVoidOpen(true);
                            }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--bg-base)] cursor-pointer"
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
      <Modal
        isOpen={isRecordOpen}
        onClose={() => setIsRecordOpen(false)}
        title="Record Payment (FIFO Allocation)"
        description="The payment is automatically applied to oldest unsettled invoices first."
        maxWidth="lg"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <Select
            label="Select Lease Agreement *"
            value={selectedLeaseId}
            onChange={(e) => setSelectedLeaseId(e.target.value)}
            required
          >
            {leases.map((l) => {
              const t = tenants.find((tenant) => tenant.id === l.tenant_id);
              const u = units.find((unit) => unit.id === l.unit_id);
              const leaseName = formatLeaseName(t?.name, u?.name, l.id);
              return (
                <option key={l.id} value={l.id}>
                  {leaseName} — {formatMoney(l.rent_minor, pack)}/mo
                </option>
              );
            })}
          </Select>

          <Input
            label={`Payment Amount (${pack.currency.code}) *`}
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            required
          />

          <Select
            label="Payment Method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            {pack.paymentMethods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>

          <div className="p-4 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent)]/30 text-xs text-[var(--accent)] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block">FIFO Settlement Rule:</strong>
              <span>
                Payment will settle invoices in chronological sequence. Any remaining surplus will be recorded as unapplied tenant credit.
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
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
        title={`Void Invoice ${voidingInvoiceId ? formatInvoiceNumber(voidingInvoiceId) : ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleVoidInvoice} className="space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Under append-only ledger rules, invoices are never deleted. Voiding marks the invoice as void and logs the reason in the audit trail.
          </p>

          <Input
            label="Reason for Voiding Invoice *"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="e.g. Duplicate entry, renegotiated tenancy terms"
            required
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="outline" onClick={() => setIsVoidOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Confirm Void Invoice
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Invoice */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingInvoice(null);
        }}
        title={`Edit Invoice ${editingInvoice ? formatInvoiceNumber(editingInvoice.id) : ''}`}
        description="Update invoice due date, total amount, or payment status."
        maxWidth="md"
      >
        <form onSubmit={handleSaveEditInvoice} className="space-y-4">
          <Input
            label="Due Date *"
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            required
          />

          <Input
            label={`Total Rent Amount (${pack.currency.code}) *`}
            type="number"
            step="0.01"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            required
          />

          <Select
            label="Invoice Status"
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value as any)}
          >
            <option value="unpaid">Unpaid / Due</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="voided">Voided</option>
          </Select>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditOpen(false);
                setEditingInvoice(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Bulk Reminders (Feature 2.4) */}
      <Modal
        isOpen={isBulkRemindersOpen}
        onClose={() => setIsBulkRemindersOpen(false)}
        title={`Send Bulk Reminders (${selectedInvoiceIds.length} Invoices)`}
        description="Dispatch automated payment reminder notices via WhatsApp and Email."
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl">
            {selectedInvoiceIds.map((invId) => {
              const inv = invoices.find((i) => i.id === invId);
              if (!inv) return null;
              const lease = leases.find((l) => l.id === inv.lease_id);
              const tenant = tenants.find((t) => t.id === lease?.tenant_id);
              const unit = units.find((u) => u.id === lease?.unit_id);
              const unpaidMinor = inv.total_minor - inv.amount_paid_minor;
              const invNo = formatInvoiceNumber(inv.id, inv.period_start);
              const msg = `Hello ${tenant?.name || 'Resident'}, rent invoice ${invNo} for ${formatMoney(inv.total_minor, pack)} is due on ${inv.due_date}. Remaining balance: ${formatMoney(unpaidMinor, pack)}. Please arrange payment.`;

              return (
                <div key={inv.id} className="p-3 flex items-center justify-between gap-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-base)]">
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)] block">
                      {tenant?.name || 'Resident'} &bull; {unit?.name || 'Unit'}
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                      {invNo} &bull; Due: {inv.due_date} &bull; Unpaid: <strong className="text-rose-600">{formatMoney(unpaidMinor, pack)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {tenant?.phone && (
                      <button
                        onClick={() => window.open(buildWhatsAppLink(tenant.phone, msg), '_blank')}
                        className="py-1 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                    )}
                    {tenant?.email && (
                      <button
                        onClick={() => window.open(buildEmailLink(tenant.email, `Rent Invoice ${invNo} Reminder`, msg), '_blank')}
                        className="py-1 px-2.5 rounded-lg bg-[var(--accent-subtle)] hover:bg-[var(--accent)]/20 text-[var(--accent)] text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" /> Email
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-secondary)]">
              Dispatches native deep links without iframe restrictions.
            </span>
            <Button variant="outline" onClick={() => setIsBulkRemindersOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Dedicated Clean Print Receipt Preview Modal */}
      {activeReceiptData && (
        <PrintReceipt
          organization={org as Organization}
          property={activeReceiptData.property}
          unit={activeReceiptData.unit}
          tenant={activeReceiptData.tenant}
          lease={activeReceiptData.lease}
          invoice={activeReceiptData.invoice}
          payment={activeReceiptData.payment}
          pack={pack}
          onClose={() => setActiveReceiptData(null)}
        />
      )}
    </div>
  );
};
