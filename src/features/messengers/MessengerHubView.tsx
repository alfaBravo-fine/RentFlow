import React, { useState } from 'react';
import { db } from '../../db/client';
import { Tenant, Invoice, Lease, Property, Unit, TenantContactLog } from '../../db/schema';
import { generateUUID } from '../../lib/uuid';
import { usePack } from '../../countries/usePack';
import { formatMoney } from '../../lib/money';
import {
  MESSAGE_TEMPLATES,
  openWhatsAppMessage,
  cleanPhoneNumber,
} from '../../lib/deepLinks';
import { useToast } from '../../components/toast/ToastContext';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Send,
  Copy,
} from '../../components/icons';

export const MessengerHubView: React.FC = () => {
  const pack = usePack();
  const { showToast } = useToast();

  const tenants = db.getTable<Tenant>('tenants');
  const leases = db.getTable<Lease>('leases');
  const units = db.getTable<Unit>('units');
  const properties = db.getTable<Property>('properties');
  const invoices = db.getTable<Invoice>('invoices');

  const [selectedTenantId, setSelectedTenantId] = useState<string>(tenants[0]?.id || '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(MESSAGE_TEMPLATES[0].id);

  // Derive tenant details
  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) || tenants[0];
  const tenantLease = leases.find((l) => l.tenant_id === selectedTenant?.id);
  const tenantUnit = tenantLease ? units.find((u) => u.id === tenantLease.unit_id) : null;
  const tenantProp = tenantUnit ? properties.find((p) => p.id === tenantUnit.property_id) : null;
  const overdueInvoice = invoices.find(
    (i) => i.lease_id === tenantLease?.id && (i.status === 'overdue' || i.status === 'partially_paid')
  );

  const unpaidMinor = overdueInvoice
    ? overdueInvoice.total_minor - overdueInvoice.amount_paid_minor
    : tenantLease?.rent_minor || 0;

  // Initialize draft message from template
  const activeTemplate = MESSAGE_TEMPLATES.find((t) => t.id === selectedTemplateId) || MESSAGE_TEMPLATES[0];
  const initialText = activeTemplate.template({
    tenantName: selectedTenant?.name || 'Resident',
    propertyName: tenantProp?.name || 'Property',
    unitName: tenantUnit?.name || 'Unit',
    amountFormatted: formatMoney(unpaidMinor, pack),
    dueDate: overdueInvoice?.due_date || '1st of the month',
    invoiceId: overdueInvoice?.id || 'INV-CURRENT',
  });

  const [customMessage, setCustomMessage] = useState(initialText);

  // Update draft message when tenant or template changes
  const handleTemplateChange = (tmplId: string) => {
    setSelectedTemplateId(tmplId);
    const tmpl = MESSAGE_TEMPLATES.find((t) => t.id === tmplId);
    if (tmpl) {
      setCustomMessage(
        tmpl.template({
          tenantName: selectedTenant?.name || 'Resident',
          propertyName: tenantProp?.name || 'Property',
          unitName: tenantUnit?.name || 'Unit',
          amountFormatted: formatMoney(unpaidMinor, pack),
          dueDate: overdueInvoice?.due_date || '1st of the month',
          invoiceId: overdueInvoice?.id || 'INV-CURRENT',
        })
      );
    }
  };

  const handleTenantChange = (tId: string) => {
    setSelectedTenantId(tId);
    const t = tenants.find((item) => item.id === tId);
    const l = leases.find((lease) => lease.tenant_id === tId);
    const u = l ? units.find((unit) => unit.id === l.unit_id) : null;
    const p = u ? properties.find((prop) => prop.id === u.property_id) : null;
    const inv = invoices.find(
      (i) => i.lease_id === l?.id && (i.status === 'overdue' || i.status === 'partially_paid')
    );
    const unpMinor = inv ? inv.total_minor - inv.amount_paid_minor : l?.rent_minor || 0;

    const tmpl = MESSAGE_TEMPLATES.find((item) => item.id === selectedTemplateId) || MESSAGE_TEMPLATES[0];
    setCustomMessage(
      tmpl.template({
        tenantName: t?.name || 'Resident',
        propertyName: p?.name || 'Property',
        unitName: u?.name || 'Unit',
        amountFormatted: formatMoney(unpMinor, pack),
        dueDate: inv?.due_date || '1st of the month',
        invoiceId: inv?.id || 'INV-CURRENT',
      })
    );
  };

  const handleSendWhatsApp = () => {
    if (!selectedTenant) return;

    db.insertItem<TenantContactLog>('tenant_contact_logs', {
      id: generateUUID(),
      tenant_id: selectedTenant.id,
      channel: 'whatsapp',
      summary: `WhatsApp: ${activeTemplate.name}`,
      details: customMessage,
      user_name: 'Property Staff',
      created_at: Date.now(),
    });

    openWhatsAppMessage(selectedTenant.phone, customMessage);
    showToast({ type: 'success', message: `WhatsApp message dispatched for ${selectedTenant.name}` });
  };

  const handleCopyLink = () => {
    if (!selectedTenant) return;
    const clean = cleanPhoneNumber(selectedTenant.phone);
    const webUrl = `https://wa.me/${clean}?text=${encodeURIComponent(customMessage)}`;
    navigator.clipboard?.writeText(webUrl);
    showToast({ type: 'success', message: 'WhatsApp message link copied to clipboard!' });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Messenger Hub & Templates
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Native WhatsApp dispatch engine &bull; Pre-formatted leasing & rental collection templates
          </p>
        </div>
        <Badge variant="accent">Dispatch Hub</Badge>
      </div>

      {/* Quick Send Composer Box */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Tenant Direct Quick-Send Dispatcher</CardTitle>
          </div>
          <Badge variant="success">Auto-Drafting Active</Badge>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Select Tenant Recipient
            </label>
            <select
              value={selectedTenantId}
              onChange={(e) => handleTenantChange(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} &bull; {t.phone} ({t.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Message Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
            >
              {MESSAGE_TEMPLATES.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Message Body (Personalized & Editable)
          </label>
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={5}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] font-sans"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <Button variant="primary" size="sm" onClick={handleSendWhatsApp} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Send className="w-3.5 h-3.5" />
            <span>Send via WhatsApp</span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-1.5 text-xs">
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Message Link</span>
          </Button>
        </div>
      </Card>
    </div>
  );
};
