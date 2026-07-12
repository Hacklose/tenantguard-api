import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  Users,
  UserCircle,
  LogOut,
  Shield,
} from "lucide-react";
import { useWorkspace } from "../../hooks/use-workspace";

interface SidebarItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresWorkspace?: boolean;
}

interface SidebarProps {
  onLogout: () => void;
  logoutPending: boolean;
}

function Sidebar({
  onLogout,
  logoutPending,
}: SidebarProps) {
  const { currentWorkspace } = useWorkspace();

  const navItems: SidebarItem[] = [
    { label: "Dashboard", href: "/app", icon: LayoutDashboard },
    { label: "Workspaces", href: "/app/workspaces", icon: Building2 },
    {
      label: "Projects",
      href: currentWorkspace
        ? `/app/workspaces/${currentWorkspace.slug}/projects`
        : "/app/workspaces",
      icon: FolderKanban,
      requiresWorkspace: true,
    },
    {
      label: "Members",
      href: currentWorkspace
        ? `/app/workspaces/${currentWorkspace.slug}/members`
        : "/app/workspaces",
      icon: Users,
      requiresWorkspace: true,
    },
    { label: "Profile", href: "/app/profile", icon: UserCircle },
  ];

  return (
    <aside className="flex h-full w-60 flex-col border-r border-surface-800 bg-surface-925">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-surface-800 px-5">
        <Shield className="h-5 w-5 text-brand-500" />
        <span className="text-sm font-semibold tracking-tight text-slate-100">
          TenantGuard
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1" role="navigation" aria-label="Main navigation">
          {navItems.map((item) => {
            const isDisabled = item.requiresWorkspace && !currentWorkspace;
            const href = isDisabled ? "#" : item.href;
            const Icon = item.icon;

            return (
              <li key={item.label}>
                <NavLink
                  to={href}
                  onClick={(e) => {
                    if (isDisabled) e.preventDefault();
                  }}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                      isActive && !isDisabled
                        ? "bg-brand-600/10 text-brand-400"
                        : "text-slate-400 hover:text-slate-200 hover:bg-surface-800/60",
                      isDisabled && "opacity-40 pointer-events-none",
                    )
                  }
                  aria-disabled={isDisabled}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="border-t border-surface-800 px-3 py-3">
        <button
          type="button"
          onClick={onLogout}
          disabled={logoutPending}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors duration-150 hover:text-red-400 hover:bg-red-500/10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="h-4.5 w-4.5 shrink-0" />
          <span>
            {logoutPending ? "Signing out..." : "Logout"}
          </span>
        </button>
      </div>
    </aside>
  );
}

function SidebarMobile({
  open,
  onClose,
  onLogout,
  logoutPending,
}: {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  logoutPending: boolean;
}) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 left-0 z-50 w-60 lg:hidden animate-slide-up">
        <Sidebar
          onLogout={onLogout}
          logoutPending={logoutPending}
        />
      </div>
    </>
  );
}

export { Sidebar, SidebarMobile };
