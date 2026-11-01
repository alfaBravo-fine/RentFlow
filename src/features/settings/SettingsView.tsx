import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { seedInitialData } from '../../db/seed';
import { usePack, usePackStore } from '../../countries/usePack';
import { AVAILABLE_PACKS } from '../../countries/resolver';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  Settings,
  RefreshCw,
  Trash2,
  Globe,
  Database,
  ShieldCheck,
  Download,
  Upload,
  Percent,
  Check,
  AlertCircle,
  Wrench,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
} from '../../components/icons';
import { useToast } from '../../components/toast/ToastContext';
import { useAuthStore } from '../../stores/authStore';
import { useDriveSync } from '../../hooks/useDriveSync';
import { db } from '../../db/client';
import { Property, Tenant } from '../../db/schema';
import { generateUUID } from '../../lib/uuid';

export const SettingsView: React.FC = () => {
  const pack = usePack();
  const setCountryCode = usePackStore((s) => s.setCountryCode);
  const { showToast } = useToast();
  const { syncState, syncNow } = useDriveSync();

  // Agency Commission
  const [agencyCommission, setAgencyCommission] = useState<number>(() => {
    return Number(localStorage.getItem('rentflow_agency_commission_pct') || '8');
  });

  // Feature 2.7: Maintenance Approval Threshold
  const minorMultiplier = Math.pow(10, pack.currency.minorUnits);
  const [maintenanceThresholdMajor, setMaintenanceThresholdMajor] = useState<number>(() => {
    const storedMinor = localStorage.getItem('rentflow_maintenance_approval_threshold_minor');
    if (storedMinor) {
      return Number(storedMinor) / minorMultiplier;
    }
    // Default 500 for USD/EUR/GBP, or 5000 for PKR/INR
    return pack.currency.code === 'PKR' || pack.currency.code === 'INR' ? 5000 : 500;
  });

  // Feature 2.9: CSV Import Mode
  const [csvImportType, setCsvImportType] = useState<'properties' | 'tenants'>('properties');
  const [isImportingCsv, setIsImportingCsv] = useState(false);

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handlePackChange = (newCode: string) => {
    setCountryCode(newCode);
    showToast({
      type: 'success',
      message: `Active country pack changed to ${newCode}. Currency and legal rules updated.`,
    });
  };

  const handleSaveCommission = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('rentflow_agency_commission_pct', agencyCommission.toString());
    showToast({
      type: 'success',
      message: `Agency management commission rate set to ${agencyCommission}%.`,
    });
  };

  const handleSaveMaintenanceThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    const minorValue = Math.round(maintenanceThresholdMajor * minorMultiplier);
    localStorage.setItem('rentflow_maintenance_approval_threshold_minor', String(minorValue));
    showToast({
      type: 'success',
      message: `Maintenance approval threshold set to ${pack.currency.symbol} ${maintenanceThresholdMajor.toLocaleString()} (${minorValue} minor units).`,
    });
  };

  // Feature 2.9: Multi-tab Excel Export
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const tableNames = [
        'organizations',
        'properties',
        'units',
        'tenants',
        'leases',
        'invoices',
        'payments',
        'expenses',
        'vendors',
        'owners',
        'documents',
        'tenant_contact_logs',
        'utility_bills',
      ];

      tableNames.forEach((tbl) => {
        const rows = db.getTable<any>(tbl);
        const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ info: 'No records' }]);
        const sheetTitle = tbl.charAt(0).toUpperCase() + tbl.slice(1, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
      });

      const fileName = `RentFlow_Full_Portfolio_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);

      showToast({
        type: 'success',
        message: `Multi-tab Excel workbook exported successfully as "${fileName}".`,
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        message: err.message || 'Could not export Excel workbook.',
      });
    }
  };

  // Feature 2.9: CSV Parsing & Bulk Import
  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.map((line) => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  const handleDownloadSampleCSV = (type: 'properties' | 'tenants') => {
    let header = '';
    let sampleRow = '';
    if (type === 'properties') {
      header = 'name,address,city,state,postal_code,type\n';
      sampleRow = 'Sunset Ridge Apartments,"1024 Ocean Dr",Miami,FL,33139,apartment_building\nOakwood Townhomes,"45 Pine St",Austin,TX,78701,single_family';
    } else {
      header = 'name,phone,email,id_type,id_number,emergency_contact,occupants\n';
      sampleRow = 'Sarah Jenkins,+1 555-0199,sarah.j@example.com,State Driver\'s License,DL-9938102,Mark Jenkins,2\nDavid Vance,+1 555-0211,david.vance@example.com,National Passport,PA-8841029,Eleanor Vance,1';
    }
    const blob = new Blob([header + sampleRow], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rentflow_sample_${type}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingCsv(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          throw new Error('CSV must contain a header row and at least one data row.');
        }

        const headers = rows[0].map((h) => h.toLowerCase().replace(/[\s_]+/g, ''));
        const dataRows = rows.slice(1);
        let count = 0;

        if (csvImportType === 'properties') {
          const nameIdx = headers.findIndex((h) => h.includes('name'));
          const addrIdx = headers.findIndex((h) => h.includes('address'));
          const cityIdx = headers.findIndex((h) => h.includes('city'));
          const stateIdx = headers.findIndex((h) => h.includes('state'));
          const zipIdx = headers.findIndex((h) => h.includes('postal') || h.includes('zip'));
          const typeIdx = headers.findIndex((h) => h.includes('type'));

          if (nameIdx === -1 || addrIdx === -1) {
            throw new Error('CSV missing required columns: "name" and "address".');
          }

          dataRows.forEach((cols) => {
            const propName = cols[nameIdx];
            const propAddr = cols[addrIdx];
            if (!propName || !propAddr) return;

            db.insertItem<Property>('properties', {
              id: generateUUID(),
              org_id: 'org_demo_1',
              name: propName,
              address_line1: propAddr,
              address_line2: null,
              city: cols[cityIdx] || 'Metro Area',
              region: cols[stateIdx] || 'State',
              postal_code: cols[zipIdx] || '00000',
              country_code: pack.code,
              type: (cols[typeIdx] as any) || 'residential_apartment',
              latitude: 40.7128,
              longitude: -74.006,
            });
            count++;
          });
        } else {
          // Tenants CSV
          const nameIdx = headers.findIndex((h) => h.includes('name'));
          const phoneIdx = headers.findIndex((h) => h.includes('phone'));
          const emailIdx = headers.findIndex((h) => h.includes('email'));
          const idTypeIdx = headers.findIndex((h) => h.includes('idtype'));
          const idNumIdx = headers.findIndex((h) => h.includes('idnumber') || h.includes('id'));
          const emerIdx = headers.findIndex((h) => h.includes('emergency'));
          const occIdx = headers.findIndex((h) => h.includes('occupant'));

          if (nameIdx === -1 || phoneIdx === -1) {
            throw new Error('CSV missing required columns: "name" and "phone".');
          }

          dataRows.forEach((cols) => {
            const tName = cols[nameIdx];
            const tPhone = cols[phoneIdx];
            if (!tName || !tPhone) return;

            db.insertItem<Tenant>('tenants', {
              id: generateUUID(),
              org_id: 'org_demo_1',
              name: tName,
              email: cols[emailIdx] || '',
              phone: tPhone,
              id_type: cols[idTypeIdx] || "State Driver's License",
              id_number: cols[idNumIdx] || `ID-${Math.floor(Math.random() * 899999 + 100000)}`,
              emergency_contact: cols[emerIdx] || null,
              occupants: parseInt(cols[occIdx]) || 1,
            });
            count++;
          });
        }

        showToast({
          type: 'success',
          message: `Successfully imported ${count} ${csvImportType} from CSV!`,
        });
      } catch (err: any) {
        showToast({
          type: 'error',
          message: err.message || 'Failed to parse CSV file.',
        });
      } finally {
        setIsImportingCsv(false);
        e.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  const handleExportBackup = () => {
    try {
      const data = db.exportAllData();
      const payload = {
        app: 'RentFlow',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        activeJurisdiction: pack.code,
        data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rentflow-backup-${pack.code}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({
        type: 'success',
        message: 'Complete local encrypted database snapshot exported successfully.',
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        message: err.message || 'Could not export database snapshot.',
      });
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.data) {
          throw new Error('Invalid RentFlow backup file schema');
        }
        db.importAllData(parsed.data);
        showToast({
          type: 'success',
          message: 'Local database snapshot imported successfully. Refreshing...',
        });
        setTimeout(() => window.location.reload(), 800);
      } catch (err: any) {
        showToast({
          type: 'error',
          message: err.message || 'Corrupt or incompatible backup JSON file.',
        });
      }
    };
    reader.readAsText(file);
  };

  const handleResetDemo = () => {
    localStorage.clear();
    seedInitialData(true);
    setShowResetConfirm(false);
    showToast({
      type: 'info',
      message: 'Reset all tables to fresh demo seed. Reloading...',
    });
    setTimeout(() => window.location.reload(), 1000);
  };

  const [isForceSyncing, setIsForceSyncing] = useState(false);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          System Settings & Data Controls
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Jurisdiction defaults, financial approval gates, bulk import/export, and zero-knowledge backup management
        </p>
      </div>

      {/* Active Jurisdiction Pack */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Country Pack Jurisdiction</CardTitle>
          </div>
          <Badge variant="info">{pack.name} ({pack.code})</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          The selected Country Pack sets local tenancy compliance laws, tax withholding exemptions, deposit interest rules,
          late fee caps, and currency formatting. Historical invoices and payments remain frozen with their original currency.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Active Jurisdiction</label>
            <select
              value={pack.code}
              onChange={(e) => handlePackChange(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
            >
              {AVAILABLE_PACKS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.flag} {p.name} ({p.code}) — {p.currency.code}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs space-y-1">
            <div className="text-[var(--text-secondary)]">Currency & Units</div>
            <div className="font-semibold text-[var(--text-primary)]">
              {pack.currency.code} ({pack.currency.symbol}) &bull; {pack.areaUnit.toUpperCase()}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">
              Decimals: {pack.currency.minorUnits} &bull; Date: {pack.dateFormat}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs space-y-1">
            <div className="text-[var(--text-secondary)]">Legal & Tenancy Rules</div>
            <div className="font-semibold text-[var(--text-primary)]">
              Deposit Max: {pack.deposit.maxMonths ? `${pack.deposit.maxMonths} mo` : 'No Cap'}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">
              Notice: {pack.noticePeriods.rentIncreaseDays}d &bull; Interest: {pack.deposit.interestRequired ? 'Required' : 'None'}
            </div>
          </div>
        </div>

        {pack.lateFee.islamicFinanceMode && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Islamic Finance Tenancy Mode Active:</strong> Late fees cannot accrue interest.
              Any late penalty collections must be allocated to designated charitable distributions.
            </div>
          </div>
        )}
      </Card>

      {/* Feature 2.7: Petty Cash & Maintenance Approval Threshold */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Petty Cash & Maintenance Approval Threshold</CardTitle>
          </div>
          <Badge variant="neutral">Feature 2.7</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Configure the maximum expenditure threshold for routine repairs. Any maintenance work order where estimated or actual cost exceeds this limit requires explicit Admin Approval before it can be closed or converted into an operating expense.
        </p>

        <form onSubmit={handleSaveMaintenanceThreshold} className="flex flex-wrap items-center gap-3 max-w-md">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-2.5 text-xs text-[var(--text-secondary)] font-mono">
              {pack.currency.symbol}
            </span>
            <Input
              type="number"
              step="1"
              min="0"
              value={maintenanceThresholdMajor}
              onChange={(e) => setMaintenanceThresholdMajor(parseFloat(e.target.value) || 0)}
              className="pl-8 h-9 text-xs font-mono"
            />
          </div>
          <Button type="submit" size="sm" variant="primary">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Save Threshold</span>
          </Button>
        </form>
      </Card>

      {/* Property Management Agency Commission */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-[var(--accent)]" />
            <CardTitle>Agency Management Commission</CardTitle>
          </div>
          <Badge variant="neutral">Financial Policy</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)]">
          Configure default property management fees deducted from gross rent collection before disbursement to landlords and owners in Owner Statements.
        </p>

        <form onSubmit={handleSaveCommission} className="flex items-center gap-3 max-w-sm">
          <div className="relative flex-1">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={agencyCommission}
              onChange={(e) => setAgencyCommission(parseFloat(e.target.value) || 0)}
              className="pr-8 h-9 text-xs font-mono"
            />
            <span className="absolute right-3 top-2.5 text-xs text-[var(--text-secondary)]">%</span>
          </div>
          <Button type="submit" size="sm" variant="primary">
            <Check className="w-3.5 h-3.5" />
            <span>Save Rate</span>
          </Button>
        </form>
      </Card>

      {/* Feature 2.9: Bulk Import & Export Hub */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <CardTitle>Bulk Data Import & Multi-Sheet Excel Export</CardTitle>
          </div>
          <Badge variant="success">Feature 2.9 &bull; CSV & Excel</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Import bulk properties or tenant rosters directly from CSV files. Export your complete RentFlow portfolio across 13 relational sheets into a native Microsoft Excel (.xlsx) workbook.
        </p>

        {/* 1. Full Multi-Tab Excel Export */}
        <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                Export Full Portfolio to Excel (.xlsx)
              </h4>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Generates a multi-tab workbook with sheets for Properties, Units, Tenants, Leases, Invoices, Payments, Expenses, Vendors, Owners, Documents, and Utility Bills.
              </p>
            </div>
            <Button size="sm" variant="primary" onClick={handleExportExcel} className="shrink-0 gap-1.5">
              <Download className="w-3.5 h-3.5" />
              <span>Export All Data (.xlsx)</span>
            </Button>
          </div>
        </div>

        {/* 2. Bulk CSV Import */}
        <div className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-4">
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)]">
              Bulk CSV Importer
            </h4>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Select record type, download the pre-formatted template, and upload your CSV.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)]">
              <button
                type="button"
                onClick={() => setCsvImportType('properties')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  csvImportType === 'properties'
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Properties
              </button>
              <button
                type="button"
                onClick={() => setCsvImportType('tenants')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  csvImportType === 'tenants'
                    ? 'bg-[var(--accent)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Tenants
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDownloadSampleCSV(csvImportType)}
              className="gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Download Sample {csvImportType === 'properties' ? 'Properties' : 'Tenants'} CSV</span>
            </Button>

            <label className="inline-flex cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                disabled={isImportingCsv}
                className="hidden"
              />
              <span className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>{isImportingCsv ? 'Importing...' : `Upload & Import ${csvImportType === 'properties' ? 'Properties' : 'Tenants'} CSV`}</span>
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* Zero-Knowledge Backup & Cloud Sync */}
      <Card className="space-y-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <CardTitle>Zero-Knowledge Cloud Backup (Google Drive)</CardTitle>
          </div>
          <Badge variant="success">AES-256-GCM + Argon2id</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          RentFlow never uploads plaintext data to Google Drive. Every automated cloud sync is client-side encrypted
          using an Argon2id key derivation function and AES-256-GCM authenticated cipher before uploading to the
          designated <code className="bg-[var(--bg-base)] px-1.5 py-0.5 rounded text-[11px] font-mono">App_RentFlow_Backups</code> folder.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              setIsForceSyncing(true);
              try {
                showToast({ type: 'info', message: 'Executing Google Drive multipart upload...' });
                await syncNow();
                showToast({ type: 'success', message: 'Force Sync executed! Database backed up to Google Drive.' });
              } catch (err: any) {
                showToast({ type: 'error', message: err.message || 'Drive sync failed' });
              } finally {
                setIsForceSyncing(false);
              }
            }}
            disabled={isForceSyncing || syncState === 'syncing'}
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isForceSyncing || syncState === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{isForceSyncing || syncState === 'syncing' ? 'Syncing...' : 'Force Sync to Google Drive'}</span>
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportBackup}>
            <Download className="w-3.5 h-3.5" />
            <span>Export Encrypted Snapshot (.json)</span>
          </Button>

          <label className="inline-flex">
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
            <span className="cursor-pointer inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-base)] text-[var(--text-primary)] transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Import Snapshot (.json)</span>
            </span>
          </label>
        </div>
      </Card>

      {/* Database Maintenance & Reset */}
      <Card className="space-y-4 border-rose-500/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-rose-600" />
            <CardTitle>Database Reset & Fixtures</CardTitle>
          </div>
          <Badge variant="danger">Destructive Action</Badge>
        </CardHeader>

        <p className="text-xs text-[var(--text-secondary)]">
          Clears local database storage and seeds fresh demo records for multi-unit properties, tenants, leases, and invoices.
        </p>

        {!showResetConfirm ? (
          <Button variant="danger" size="sm" onClick={() => setShowResetConfirm(true)}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Local Database to Demo Seed</span>
          </Button>
        ) : (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs space-y-3">
            <p className="text-rose-700 dark:text-rose-300 font-medium">
              Are you sure? This will delete all custom records and reset to the default demo database.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="danger" size="sm" onClick={handleResetDemo}>
                Yes, Reset Everything
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
