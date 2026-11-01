import React, { useState } from 'react';
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
  Layers,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Folder,
  UserCheck,
} from '../icons';

export interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpenMobile, onCloseMobile }) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('rentflow_sidebar_collapsed') === 'true';
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('rentflow_sidebar_collapsed', String(next));
      return next;
    });
  };

  const navItems = [
    { to: '/', label: 'Dashboard', icon: Home },
    { to: '/properties', label: 'Properties & Units', icon: Building2 },
    { to: '/map', label: 'Interactive Map', icon: Map },
    { to: '/tenants', label: 'Tenants Directory', icon: Users },
    { to: '/leases', label: 'Leases & Deposits', icon: FileText },
    { to: '/invoices', label: 'Rent Roll & Invoicing', icon: Receipt },
    { to: '/utility-splitter', label: 'Utility Bill Splitter', icon: Calculator },
    { to: '/area-calculator', label: 'Land Area Calculator', icon: Layers },
    { to: '/messenger', label: 'Messenger Hub', icon: MessageSquare },
    { to: '/maintenance', label: 'Maintenance Board', icon: Wrench },
    { to: '/vendors', label: 'Vendors', icon: HardHat },
    { to: '/expenses', label: 'Expenses & Income', icon: Banknote },
    { to: '/documents', label: 'Document Vault', icon: Folder },
    { to: '/owners', label: 'Owner Statements', icon: UserCheck },
    { to: '/reports', label: 'Reports & Statements', icon: BarChart3 },
    { to: '/sync', label: 'Drive Sync & Backup', icon: RefreshCw },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Modern Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col h-full bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] transition-all duration-200 shrink-0 select-none ${
          isOpenMobile ? 'translate-x-0 w-[260px] shadow-2xl' : '-translate-x-full md:translate-x-0'
        } ${
          isCollapsed ? 'md:w-[72px] lg:w-[72px]' : 'md:w-[72px] lg:w-[260px]'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
              RF
            </div>
            <div
              className={`flex flex-col transition-opacity duration-150 ${
                isCollapsed ? 'md:hidden' : 'md:hidden lg:flex'
              }`}
            >
              <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">
                RentFlow
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                Desktop Edition
              </span>
            </div>
          </div>

          {/* Mobile Close Button */}
          <button
            onClick={onCloseMobile}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                title={item.label}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all duration-150 ${
                    isCollapsed ? 'md:justify-center' : 'md:justify-center lg:justify-start'
                  } ${
                    isActive
                      ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold shadow-xs'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] font-medium'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span
                  className={`truncate ${
                    isCollapsed ? 'md:hidden' : 'md:hidden lg:inline'
                  }`}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Section: Offline Status & Collapsible Toggle */}
        <div className="p-3 border-t border-[var(--border-subtle)] space-y-2 bg-[var(--bg-surface)]">
          {/* Offline Engine Status */}
          <div
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] ${
              isCollapsed ? 'md:justify-center' : 'md:justify-center lg:justify-start'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div
              className={`flex flex-col ${
                isCollapsed ? 'md:hidden' : 'md:hidden lg:flex'
              }`}
            >
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                Offline Engine
              </span>
              <span className="text-[9px] text-[var(--text-secondary)] font-mono">
                Zero-Cloud Latency
              </span>
            </div>
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={toggleCollapse}
            className="hidden lg:flex w-full items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Collapse Sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
