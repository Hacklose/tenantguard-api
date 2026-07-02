import { createContext, useContext, useCallback, useMemo } from "react";
import type { MembershipRole, Workspace } from "../types";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentRole: MembershipRole | null;
  setCurrentWorkspaceSlug: (slug: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface WorkspaceProviderProps {
  children: React.ReactNode;
  workspaces: Workspace[];
  currentSlug: string | null;
  onSlugChange: (slug: string | null) => void;
}

function WorkspaceProvider({
  children,
  workspaces,
  currentSlug,
  onSlugChange,
}: WorkspaceProviderProps) {
  const currentWorkspace = useMemo(
    () =>
      currentSlug
        ? workspaces.find((w) => w.slug === currentSlug) ?? null
        : null,
    [workspaces, currentSlug],
  );

  const currentRole = currentWorkspace?.role ?? null;

  const setCurrentWorkspaceSlug = useCallback(
    (slug: string | null) => {
      onSlugChange(slug);
    },
    [onSlugChange],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      currentWorkspace,
      currentRole,
      setCurrentWorkspaceSlug,
    }),
    [workspaces, currentWorkspace, currentRole, setCurrentWorkspaceSlug],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

export { WorkspaceProvider, useWorkspace };
