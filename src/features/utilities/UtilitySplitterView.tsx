import React, { useState } from 'react';
import { db } from '../../db/client';
import { Property, Unit, Tenant, Lease, Invoice, UtilityBill } from '../../db/schema';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import { generateUUID } from '../../lib/uuid';
import { useToast } from '../../components/toast/ToastContext';
import { buildWhatsAppLink, openExternalUrl } from '../../lib/deepLinks';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import {
  Calculator,
  Send,
  Plus,
  CheckCircle,
  PieChart,
  Receipt,
  CheckCircle2,
  Zap,
} from '../../components/icons';

export const UtilitySplitterView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const properties = db.getTable<Property>('properties').filter((p) => !p.deleted_at);
  const units = db.getTable<Unit>('units').filter((u) => !u.deleted_at);
  const tenants = db.getTable<Tenant>('tenants').filter((t) => !t.deleted_at);
  const leases = db.getTable<Lease>('leases').filter((l) => !l.deleted_at);

  const [selectedPropId, setSelectedPropId] = useState(properties[0]?.id || '');
  const [utilityType, setUtilityType] = useState<'electricity' | 'water' | 'gas' | 'trash' | 'internet'>('electricity');
  const [totalBillAmount, setTotalBillAmount] = useState('350');
  const [splitMethod, setSplitMethod] = useState<'by_sqft' | 'equal_headcount'>('by_sqft');
  const [hasCalculated, setHasCalculated] = useState(false);

  const propUnits = units.filter((u) => u.property_id === selectedPropId);
  const occupiedUnits = propUnits.filter((u) => {
    const l = leases.find((lease) => lease.unit_id === u.id && lease.status === 'active');
    return u.status === 'occupied' || !!l;
  });

  const totalSqft = occupiedUnits.reduce((acc, u) => acc + u.size, 0);
  const totalBillMinor = Math.round((parseFloat(totalBillAmount) || 0) * 100);

  // Compute Per-Unit Split
  const unitSplits = propUnits.map((u) => {
    const lease = leases.find((l) => l.unit_id === u.id && l.status === 'active');
    const tenant = tenants.find((t) => t.id === lease?.tenant_id);

    let splitShareMinor = 0;
    const isOccupied = u.status === 'occupied' || !!lease;

    if (isOccupied) {
      if (splitMethod === 'by_sqft' && totalSqft > 0) {
        splitShareMinor = Math.round((totalBillMinor * u.size) / totalSqft);
      } else if (occupiedUnits.length > 0) {
        splitShareMinor = Math.round(totalBillMinor / occupiedUnits.length);
      }
    }

    return {
      unit: u,
      tenant,
      lease,
      isOccupied,
      shareMinor: splitShareMinor,
      percentage: totalBillMinor > 0 && isOccupied ? Math.round((splitShareMinor / totalBillMinor) * 100) : 0,
    };
  });

  const handleCalculateSplit = () => {
    if (totalBillMinor <= 0) {
      showToast({ type: 'error', message: 'Enter a valid utility bill amount!' });
      return;
    }

    if (propUnits.length === 0) {
      showToast({ type: 'error', message: 'No units found for this property.' });
      return;
    }

    setHasCalculated(true);
    showToast({
      type: 'info',
      message: `Utility split calculated across ${occupiedUnits.length} occupied unit(s).`,
    });
  };

  const applySplitToInvoices = () => {
    if (totalBillMinor <= 0) {
      showToast({ type: 'error', message: 'Enter a valid utility bill amount!' });
      return;
    }

    let appliedCount = 0;
    const openInvoices = db.getTable<Invoice>('invoices').filter((i) => !i.deleted_at);

    for (const item of unitSplits) {
      // Handle Vacant Units
      if (!item.isOccupied || !item.lease) {
        showToast({
          type: 'error',
          message: `Cannot apply to ${item.unit.name} because it is currently vacant.`,
        });
        continue;
      }

      if (item.shareMinor <= 0) continue;

      // Find unpaid invoice for current lease / month
      const existingOpenInv = openInvoices.find(
        (inv) => inv.lease_id === item.lease!.id && inv.status !== 'paid' && inv.status !== 'voided'
      );

      if (existingOpenInv) {
        const newSubtotal = existingOpenInv.subtotal_minor + item.shareMinor;
        const newTotal = existingOpenInv.total_minor + item.shareMinor;
        db.updateItem<Invoice>('invoices', existingOpenInv.id, {
          subtotal_minor: newSubtotal,
          total_minor: newTotal,
        });
        db.recordAudit(
          'UTILITY_CHARGE_ADDED',
          'invoices',
          existingOpenInv.id,
          { old_total: existingOpenInv.total_minor },
          { added_utility: item.shareMinor, utility_type: utilityType }
        );
        appliedCount++;
      } else {
        // Automatically create a new invoice for this month
        const invId = generateUUID();
        const nowIso = new Date().toISOString().slice(0, 10);
        const dueIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        db.insertItem<Invoice>('invoices', {
          id: invId,
          lease_id: item.lease.id,
          period_start: nowIso,
          period_end: dueIso,
          due_date: dueIso,
          subtotal_minor: item.shareMinor,
          late_fee_minor: 0,
          total_minor: item.shareMinor,
          amount_paid_minor: 0,
          currency_code: pack.currency.code,
          status: 'unpaid',
        });
        appliedCount++;
      }
    }

    // Save record to utility_bills
    if (appliedCount > 0) {
      db.insertItem<UtilityBill>('utility_bills', {
        id: generateUUID(),
        property_id: selectedPropId,
        utility_type: utilityType,
        bill_period: new Date().toISOString().slice(0, 7),
        total_amount_minor: totalBillMinor,
        split_method: splitMethod,
        splits_json: JSON.stringify(
          unitSplits
            .filter((s) => s.isOccupied)
            .map((s) => ({
              unit_id: s.unit.id,
              tenant_name: s.tenant?.name || 'Resident',
              amount_minor: s.shareMinor,
            }))
        ),
        created_at: Date.now(),
      });

      showToast({
        type: 'success',
        message: `Utility bills added to ${appliedCount} invoice(s) successfully!`,
      });
    }
  };

  const handleApplyAsInvoiceLineItems = () => {
    applySplitToInvoices();
  };

  const handleSendBillWhatsApp = (tenant: Tenant | undefined, amountMinor: number, unitName: string) => {
    if (!tenant) return;
    const formatted = formatMoney(amountMinor, pack);
    const msg = `Hello ${tenant.name}, your share for the ${utilityType.toUpperCase()} utility bill for ${unitName} is ${formatted}. Please remit alongside your monthly rent.`;
    openExternalUrl(buildWhatsAppLink(tenant.phone, msg));
  };

  const selectedProp = properties.find((p) => p.id === selectedPropId);

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Utility Bill Sub-Metering Splitter
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Automated apportionment for electric, water, gas, and broadband across occupied units ({pack.name})
          </p>
        </div>
        <Badge variant="accent">Sub-Metering Tool</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Configuration Controls */}
        <Card className="space-y-5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <Calculator className="w-4 h-4" />
              </div>
              <CardTitle>Bill Configuration</CardTitle>
            </div>
          </CardHeader>

          <div className="space-y-4">
            <Select
              label="Select Property *"
              value={selectedPropId}
              onChange={(e) => setSelectedPropId(e.target.value)}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <Select
              label="Utility Type *"
              value={utilityType}
              onChange={(e) => setUtilityType(e.target.value as any)}
            >
              <option value="electricity">Electricity</option>
              <option value="water">Water & Sewer</option>
              <option value="gas">Natural Gas / Heating</option>
              <option value="trash">Trash Collection</option>
              <option value="internet">Shared Broadband / Wi-Fi</option>
            </Select>

            <Input
              label={`Total Master Bill Amount (${pack.currency.code}) *`}
              type="number"
              value={totalBillAmount}
              onChange={(e) => {
                setTotalBillAmount(e.target.value);
                setHasCalculated(false);
              }}
              required
            />

            <Select
              label="Apportionment Method *"
              value={splitMethod}
              onChange={(e) => {
                setSplitMethod(e.target.value as any);
                setHasCalculated(false);
              }}
            >
              <option value="by_sqft">Proportional by Unit Size ({pack.areaUnit.toUpperCase()})</option>
              <option value="equal_headcount">Equal Split Per Occupied Unit</option>
            </Select>

            <div className="pt-2">
              <Button
                variant="primary"
                onClick={handleCalculateSplit}
                className="w-full gap-2 justify-center py-2.5"
              >
                <Calculator className="w-4 h-4" />
                <span>Calculate Split</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Right 2 Columns: Breakdown & Invoice Injection */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="space-y-5">
            <CardHeader className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>Tenant Utility Apportionment Breakdown</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Property: <strong>{selectedProp?.name || 'Selected'}</strong> &bull; Total:{' '}
                  <strong className="text-[var(--text-primary)] font-mono">{formatMoney(totalBillMinor, pack)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="accent">{propUnits.length} Occupied Units</Badge>
                {hasCalculated && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleApplyAsInvoiceLineItems}
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Apply as Invoice Line Items</span>
                  </Button>
                )}
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Unit & Resident</th>
                    <th className="py-3 px-4">Unit Size</th>
                    <th className="py-3 px-4 text-center">Share %</th>
                    <th className="py-3 px-4 text-right">Apportioned Amount</th>
                    <th className="py-3 px-4 text-right">Dispatch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                  {unitSplits.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-xs text-[var(--text-secondary)]">
                        No occupied units in this property available for utility apportionment.
                      </td>
                    </tr>
                  ) : (
                    unitSplits.map((item) => (
                      <tr key={item.unit.id} className="h-14 hover:bg-[var(--bg-base)] transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-[var(--text-primary)]">{item.unit.name}</p>
                          <p className="text-xs text-[var(--text-secondary)]">{item.tenant?.name || 'Vacant'}</p>
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--text-secondary)] font-mono">
                          {item.unit.size} {item.unit.area_unit}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-[var(--accent)]">
                          {item.percentage}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold number-tabular text-[var(--text-primary)]">
                          {formatMoney(item.shareMinor, pack)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1.5"
                            disabled={!item.tenant}
                            onClick={() => handleSendBillWhatsApp(item.tenant, item.shareMinor, item.unit.name)}
                          >
                            <Send className="w-3.5 h-3.5 text-emerald-600" />
                            <span>WhatsApp</span>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {hasCalculated && (
              <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Ready to append to tenant monthly statements. Click <strong>Apply as Invoice Line Items</strong> to update open invoices.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleApplyAsInvoiceLineItems}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Apply Now</span>
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
