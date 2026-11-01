import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { db } from '../../db/client';
import { Lease, MaintenanceRequest } from '../../db/schema';
import { AlertCircle, Clock, X, ChevronRight } from '../icons';
import { useNavigate } from 'react-router-dom';

import { useTheme } from '../theme/ThemeProvider';
import { OfflineIndicator } from '../common/OfflineIndicator';

export interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);

  // Check for critical items (e.g. leases expiring within 30 days or emergency maintenance)
  const leases = db.getTable<Lease>('leases');
  const maintenance = db.getTable<MaintenanceRequest>('maintenance_requests');
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const urgentExpiring = leases.filter((l) => {
    if (l.status === 'expired' || l.status === 'terminated') return false;
    const endMs = new Date(l.end_date).getTime();
    return endMs - now <= thirtyDaysMs;
  });

  const emergencyMaintenance = maintenance.filter(
    (m) => (m.urgency === 'emergency' || m.urgency === 'high') && m.status !== 'completed' && m.status !== 'closed'
  );

  const hasUrgentAlert = !isBannerDismissed && (urgentExpiring.length > 0 || emergencyMaintenance.length > 0);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Sidebar
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <Topbar
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          onOpenSidebar={() => setIsMobileSidebarOpen(true)}
        />

        {/* Global Urgent Alert Banner */}
        {hasUrgentAlert && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 sm:px-8 py-2.5 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shrink-0">
            <div className="flex items-center gap-2.5 truncate">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="font-semibold shrink-0">Priority Attention:</span>
              <span className="truncate">
                {urgentExpiring.length > 0 && `${urgentExpiring.length} lease(s) expiring within 30 days. `}
                {emergencyMaintenance.length > 0 && `${emergencyMaintenance.length} high-urgency maintenance request(s) open.`}
              </span>
              <button
                onClick={() => navigate(urgentExpiring.length > 0 ? '/leases' : '/maintenance')}
                className="font-semibold underline hover:text-amber-950 dark:hover:text-white shrink-0 ml-1 cursor-pointer flex items-center gap-0.5"
              >
                <span>Review Now</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <button
              onClick={() => setIsBannerDismissed(true)}
              className="text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white p-1 rounded-md cursor-pointer ml-2"
              title="Dismiss banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Content Viewport: 1400px max-width, generous p-4 to p-8 padding */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="max-w-[1400px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
      <OfflineIndicator />
    </div>
  );
};
