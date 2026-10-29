import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, Users, Receipt, FileText, X } from '../icons';
import { db } from '../../db/client';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : null;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const properties = db.getTable('properties');
  const tenants = db.getTable('tenants');
  const invoices = db.getTable('invoices');

  const filteredProps = properties.filter((p: any) => p.name.toLowerCase().includes(query.toLowerCase()));
  const filteredTenants = tenants.filter((t: any) => t.name.toLowerCase().includes(query.toLowerCase()));
  const filteredInvoices = invoices.filter((i: any) => i.id.toLowerCase().includes(query.toLowerCase()));

  const handleSelect = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-[8px] bg-[var(--surface-raised)] border border-[var(--border-strong)] modal-shadow overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 border-b border-[var(--border)] gap-3">
          <Search className="w-4 h-4 text-[var(--text-subtle)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties, tenants, invoices... (Cmd+K)"
            className="w-full h-12 bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-subtle)] focus:outline-none"
          />
          <button onClick={onClose} className="p-1 text-[var(--text-subtle)] hover:text-[var(--text)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-3">
          {filteredProps.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-subtle)] px-3 py-1 uppercase">Properties</div>
              {filteredProps.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => handleSelect('/properties')}
                  className="w-full text-left px-3 py-2 rounded-[6px] hover:bg-[var(--surface)] flex items-center gap-3 text-sm text-[var(--text)]"
                >
                  <Building2 className="w-4 h-4 text-[var(--text-muted)]" />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          )}

          {filteredTenants.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-subtle)] px-3 py-1 uppercase">Tenants</div>
              {filteredTenants.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => handleSelect('/tenants')}
                  className="w-full text-left px-3 py-2 rounded-[6px] hover:bg-[var(--surface)] flex items-center gap-3 text-sm text-[var(--text)]"
                >
                  <Users className="w-4 h-4 text-[var(--text-muted)]" />
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-[var(--text-subtle)]">{t.phone}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {filteredInvoices.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-subtle)] px-3 py-1 uppercase">Invoices</div>
              {filteredInvoices.map((i: any) => (
                <button
                  key={i.id}
                  onClick={() => handleSelect('/invoices')}
                  className="w-full text-left px-3 py-2 rounded-[6px] hover:bg-[var(--surface)] flex items-center gap-3 text-sm text-[var(--text)]"
                >
                  <Receipt className="w-4 h-4 text-[var(--text-muted)]" />
                  <span>Invoice #{i.id}</span>
                </button>
              ))}
            </div>
          )}

          {filteredProps.length === 0 && filteredTenants.length === 0 && filteredInvoices.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--text-subtle)]">No matching records found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
