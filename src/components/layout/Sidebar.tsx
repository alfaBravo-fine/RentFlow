import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  Building2,
  Users,
  FileText,
  Receipt,
  Wrench,
  HardHat,
  Banknote,
  BarChart3,
  Settings,
  RefreshCw,
  Map,
  MessageSquare,
  Calculator,
} from '../icons';

export const Sidebar: React.FC = () => {
  const navItems = [
    { to: '/', label: 'Dashboard', icon: Home },
    { to: '/properties', label: 'Properties & Units', icon: Building2 },
    { to: '/map', label: 'Interactive Location Map', icon: Map },
    { to: '/tenants', label: 'Tenants Directory', icon: Users },
    { to: '/leases', label: 'Leases & Deposits', icon: FileText },
    { to: '/invoices', label: 'Rent Roll & Invoices', icon: Receipt },
    { to: '/utility-splitter', label: 'Utility Bill Splitter', icon: Calculator },
    { to: '/messenger', label: 'Messenger Hub', icon: MessageSquare },
    { to: '/maintenance', label: 'Maintenance Board', icon: Wrench },
    { to: '/vendors', label: 'Vendors', icon: HardHat },
    { to: '/expenses', label: 'Expenses & Income', icon: Banknote },
    { to: '/reports', label: 'Reports & Statements', icon: BarChart3 },
    { to: '/sync', label: 'Drive Sync & Backup', icon: RefreshCw },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col h-screen shrink-0">
      {/* Brand Header */}
      <div className="h-14 flex items-center px-5 border-b border-[var(--border)] gap-2.5">
        <div className="w-7 h-7 rounded-[6px] bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm">
          RF
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm tracking-tight text-[var(--text)]">RentFlow</span>
          <span className="text-[11px] text-[var(--text-subtle)] font-mono">v1.0 &bull; Desktop</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-[6px] text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Offline Status Badge */}
      <div className="p-3 border-t border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2 px-3 py-2 rounded-[6px] bg-[var(--surface-raised)] border border-[var(--border)]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[var(--text)]">Offline Engine Active</span>
            <span className="text-[10px] text-[var(--text-subtle)] font-mono">Drive Cloud Auto-Sync</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
