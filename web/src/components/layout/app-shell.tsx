import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar, SidebarMobile } from "./sidebar";
import { WorkspaceSwitcher } from "../workspace-switcher";
import { RoleBadge } from "../role-badge";
import { useWorkspace } from "../../hooks/use-workspace";
import { useLogout } from "../../hooks/use-logout";
import { cn } from "../../lib/utils";

function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { currentRole } = useWorkspace();

  const {
    signOut,
    isSigningOut,
    logoutError,
    clearLogoutError,
  } = useLogout();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          onLogout={signOut}
          logoutPending={isSigningOut}
        />
      </div>

      {/* Mobile sidebar */}
      <SidebarMobile
        open={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        onLogout={signOut}
        logoutPending={isSigningOut}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-800 bg-surface-925 px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-200 hover:bg-surface-800 lg:hidden cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <WorkspaceSwitcher />
          </div>

          <div className="flex items-center gap-3">
            {currentRole && (
              <span className="hidden items-center gap-2 sm:flex">
                <span className="text-xs text-slate-500">Role:</span>
                <RoleBadge role={currentRole} />
              </span>
            )}
          </div>
        </header>

        {/* Logout error banner */}
        {logoutError && (
          <div
            role="alert"
            className="flex items-start justify-between gap-4 border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 lg:px-6"
          >
            <span>{logoutError}</span>

            <button
              type="button"
              onClick={clearLogoutError}
              className="shrink-0 text-xs font-medium text-red-300 underline hover:text-red-200"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Page content */}
        <main
          className={cn(
            "flex-1 overflow-y-auto",
            "bg-surface-950",
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export { AppShell };
