import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { Sidebar, SidebarMobile } from "./sidebar";
import { WorkspaceSwitcher } from "../workspace-switcher";
import { RoleBadge } from "../role-badge";
import { useWorkspace } from "../../hooks/use-workspace";
import { logout } from "../../api/auth";
import { cn } from "../../lib/utils";

function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { currentRole } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Even if the logout request fails, clear local state
    } finally {
      queryClient.clear();
      navigate("/login", {
        state: { message: "You have been signed out." },
      });
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar onLogout={handleLogout} />
      </div>

      {/* Mobile sidebar */}
      <SidebarMobile
        open={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        onLogout={handleLogout}
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
