import React, { useState } from 'react';
import { db } from '../../db/client';
import { Property, Unit, Tenant, Lease } from '../../db/schema';
import { resolvePack } from '../../countries/resolver';
import { formatMoney } from '../../lib/money';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Calculator, Send, Plus, CheckCircle, PieChart } from '../../components/icons';

export const UtilitySplitterView: React.FC = () => {
  const pack = resolvePack();
  const properties = db.getTable<Property>('properties');
  const units = db.getTable<Unit>('units');
  const tenants = db.getTable<Tenant>('tenants');
  const leases = db.getTable<Lease>('leases');

  const [selectedPropId, setSelectedPropId] = useState(properties[0]?.id || '');
  const [utilityType, setUtilityType] = useState<'electricity' | 'water' | 'gas' | 'trash' | 'internet'>('electricity');
  const [totalBillAmount, setTotalBillAmount] = useState('350');
  const [splitMethod, setSplitMethod] = useState<'by_sqft' | 'equal_headcount'>('by_sqft');
  const [isCalculated, setIsCalculated] = useState(true);

  const propUnits = units.filter((u) => u.property_id === selectedPropId && u.status === 'occupied');
  const totalSqft = propUnits.reduce((acc, u) => acc + u.size, 0);
  const totalBillMinor = Math.round(parseFloat(totalBillAmount || '0') * 100);

  // Compute Per-Unit Split
  const unitSplits = propUnits.map((u) => {
    const lease = leases.find((l) => l.unit_id === u.id && l.status === 'active');
    const tenant = tenants.find((t) => t.id === lease?.tenant_id);

    let splitShareMinor = 0;
    if (splitMethod === 'by_sqft' && totalSqft > 0) {
      splitShareMinor = Math.round((totalBillMinor * u.size) / totalSqft);
    } else if (propUnits.length > 0) {
      splitShareMinor = Math.round(totalBillMinor / propUnits.length);
    }

    return {
      unit: u,
      tenant,
      lease,
      shareMinor: splitShareMinor,
      percentage: totalBillMinor > 0 ? Math.round((splitShareMinor / totalBillMinor) * 100) : 0,
    };
  });

  const handleSendBillWhatsApp = (tenant: Tenant | undefined, amountMinor: number, unitName: string) => {
    if (!tenant) return;
    const formatted = formatMoney(amountMinor, pack);
    const msg = encodeURIComponent(
      `Hello ${tenant.name}, your share for the ${utilityType.toUpperCase()} utility bill for ${unitName} is ${formatted}. Please remit alongside your monthly rent.`
    );
    const cleanPhone = tenant.phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Utility Bill Sub-Metering Splitter</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Automatically apportion electric, water, gas, and trash bills across occupied units
          </p>
        </div>
        <Badge variant="info">Sub-Metering Tool</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Calculator Form Controls */}
        <Card className="space-y-4">
          <CardHeader>
            <CardTitle>Bill Configuration</CardTitle>
            <Calculator className="w-4 h-4 text-[var(--accent)]" />
          </CardHeader>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Select Property</label>
            <select
              value={selectedPropId}
              onChange={(e) => setSelectedPropId(e.target.value)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Utility Type</label>
            <select
              value={utilityType}
              onChange={(e) => setUtilityType(e.target.value as any)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
            >
              <option value="electricity">Electricity</option>
              <option value="water">Water & Sewer</option>
              <option value="gas">Natural Gas / Heating</option>
              <option value="trash">Trash Collection</option>
              <option value="internet">Shared Broadband / Wi-Fi</option>
            </select>
          </div>

          <Input
            label={`Total Bill Amount (${pack.currency.code})`}
            type="number"
            value={totalBillAmount}
            onChange={(e) => setTotalBillAmount(e.target.value)}
          />

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Apportionment Method</label>
            <select
              value={splitMethod}
              onChange={(e) => setSplitMethod(e.target.value as any)}
              className="w-full h-9 rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)]"
            >
              <option value="by_sqft">Proportional by Unit Size (Sq Ft / Sq M)</option>
              <option value="equal_headcount">Equal Split Per Occupied Unit</option>
            </select>
          </div>
        </Card>

        {/* Right 2 Cols: Tenant Breakdown Table */}
        <div className="lg:col-span-2">
          <Card className="space-y-4">
            <CardHeader>
              <div>
                <CardTitle>Tenant Utility Apportionment Breakdown</CardTitle>
                <p className="text-xs text-[var(--text-subtle)]">
                  Total Utility Amount: <strong className="text-[var(--text)]">{formatMoney(totalBillMinor, pack)}</strong> &bull; Method: {splitMethod === 'by_sqft' ? 'Unit Size Proportional' : 'Equal Headcount'}
                </p>
              </div>
              <Badge variant="success">{propUnits.length} Occupied Units</Badge>
            </CardHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-subtle)] uppercase">
                    <th className="py-2.5 px-3 font-semibold">Unit & Tenant</th>
                    <th className="py-2.5 px-3 font-semibold">Unit Size</th>
                    <th className="py-2.5 px-3 font-semibold">Share %</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Apportioned Share</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Dispatch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {unitSplits.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-[var(--text-subtle)]">
                        No occupied units in this property to split bills.
                      </td>
                    </tr>
                  ) : (
                    unitSplits.map((item) => (
                      <tr key={item.unit.id} className="hover:bg-[var(--surface)] transition-colors">
                        <td className="py-3 px-3">
                          <p className="font-semibold text-[var(--text)]">{item.unit.name}</p>
                          <p className="text-[11px] text-[var(--text-subtle)]">{item.tenant?.name || 'Vacant'}</p>
                        </td>
                        <td className="py-3 px-3 text-[var(--text-muted)]">{item.unit.size} {item.unit.area_unit}</td>
                        <td className="py-3 px-3 font-mono text-[var(--accent)] font-semibold">{item.percentage}%</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-[var(--text)]">
                          {formatMoney(item.shareMinor, pack)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            size="sm"
                            variant="primary"
                            className="h-7 text-[10px] gap-1"
                            disabled={!item.tenant}
                            onClick={() => handleSendBillWhatsApp(item.tenant, item.shareMinor, item.unit.name)}
                          >
                            <Send className="w-3 h-3" />
                            <span>WhatsApp Bill</span>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
