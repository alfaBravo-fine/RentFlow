import React, { useState } from 'react';
import { seedInitialData } from '../../db/seed';
import { resolvePack } from '../../countries/resolver';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Settings, RefreshCw, Trash2, Globe, Database, Shield } from '../../components/icons';
import { useNavigate } from 'react-router-dom';

export const SettingsView: React.FC = () => {
  const navigate = useNavigate();
  const pack = resolvePack();
  const [msg, setMsg] = useState<string | null>(null);

  const handleResetDemo = () => {
    localStorage.clear();
    seedInitialData(true);
    setMsg('Database reset to fresh demo state!');
    setTimeout(() => window.location.reload(), 1000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-[var(--text)]">System Settings & Data Controls</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">Jurisdiction defaults, database controls, and GDPR data management</p>
      </div>

      {msg && (
        <div className="p-3 rounded-[6px] bg-[var(--status-success-bg)] border border-[var(--status-success-fg)] text-xs text-[var(--status-success-fg)]">
          {msg}
        </div>
      )}

      <Card className="space-y-4">
        <CardHeader>
          <CardTitle>Active Country Pack Jurisdiction</CardTitle>
          <Badge variant="info">{pack.name} ({pack.code})</Badge>
        </CardHeader>
        <p className="text-xs text-[var(--text-muted)]">
          Current Pack: <strong>{pack.name}</strong> &bull; Default Currency: <strong>{pack.currency.code} ({pack.currency.symbol})</strong> &bull; Area Unit: <strong>{pack.areaUnit.toUpperCase()}</strong>
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate('/onboarding')}>
          Change Active Country Pack &rarr;
        </Button>
      </Card>

      <Card className="space-y-4">
        <CardHeader>
          <CardTitle>Database & Fixtures Reset</CardTitle>
          <Badge variant="warning">Developer Control</Badge>
        </CardHeader>
        <p className="text-xs text-[var(--text-muted)]">
          Reset all local SQLite database tables and re-populate clean demo properties, tenants, leases, and invoices.
        </p>
        <Button variant="danger" size="sm" onClick={handleResetDemo}>
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Local Database to Demo Seed</span>
        </Button>
      </Card>
    </div>
  );
};
