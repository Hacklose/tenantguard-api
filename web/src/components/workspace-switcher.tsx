import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Building2, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { useWorkspace } from "../hooks/use-workspace";
import { RoleBadge } from "./role-badge";

function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, setCurrentWorkspaceSlug } =
    useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleSelect(slug: string) {
    setCurrentWorkspaceSlug(slug);
    setOpen(false);
    navigate(`/app/workspaces/${slug}/projects`);
  }

  if (workspaces.length === 0) {
    return (
      <span className="text-sm text-slate-500">No workspaces</span>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 cursor-pointer",
          "border border-surface-700 bg-surface-800/60 text-slate-200 hover:bg-surface-800 hover:border-surface-600",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="max-w-[140px] truncate">
          {currentWorkspace?.name ?? "Select workspace"}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-surface-700 bg-surface-900 py-1 shadow-lg animate-fade-in">
          <div className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-slate-500">
            Workspaces
          </div>
          {workspaces.map((ws) => (
            <button
              key={ws.slug}
              onClick={() => handleSelect(ws.slug)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors duration-100 cursor-pointer",
                currentWorkspace?.slug === ws.slug
                  ? "bg-brand-600/10 text-brand-300"
                  : "text-slate-300 hover:bg-surface-800",
              )}
              role="option"
              aria-selected={currentWorkspace?.slug === ws.slug}
            >
              <span className="flex-1 truncate text-left">{ws.name}</span>
              <RoleBadge role={ws.role} />
              {currentWorkspace?.slug === ws.slug && (
                <Check className="h-4 w-4 shrink-0 text-brand-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { WorkspaceSwitcher };
