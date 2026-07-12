import { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
  Outlet,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { useAuthExpiryRedirect } from "./hooks/use-auth-expiry-redirect";
import { WorkspaceProvider, useWorkspace } from "./hooks/use-workspace";
import { fetchWorkspaces } from "./api/workspaces";
import { AppShell } from "./components/layout/app-shell";
import { LoginPage } from "./pages/login-page";
import { RegisterPage } from "./pages/register-page";
import { DashboardPage } from "./pages/dashboard-page";
import { WorkspacesPage } from "./pages/workspaces-page";
import { ProjectsPage } from "./pages/projects-page";
import { ProjectDetailPage } from "./pages/project-detail-page";
import { MembersPage } from "./pages/members-page";
import { ProfilePage } from "./pages/profile-page";
import { NotFoundPage } from "./pages/not-found-page";
import { Spinner } from "./components/ui/spinner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
    },
  },
});

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function WorkspaceContextBridge({ children }: { children: React.ReactNode }) {
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);

  const {
    data: workspaces = [],
    isLoading,
  } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <WorkspaceProvider
      workspaces={workspaces}
      currentSlug={currentSlug}
      onSlugChange={setCurrentSlug}
    >
      {children}
    </WorkspaceProvider>
  );
}

/**
 * Syncs the workspace slug from the URL into the WorkspaceContext.
 * Rendered as a layout route inside AppShell's <Outlet /> so it has
 * access to the WorkspaceProvider context.
 */
function WorkspaceSlugSync() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { setCurrentWorkspaceSlug, currentWorkspace } = useWorkspace();
  const [slugResolved, setSlugResolved] = useState(false);

  useEffect(() => {
    if (workspaceSlug) {
      setCurrentWorkspaceSlug(workspaceSlug);
    } else {
      setCurrentWorkspaceSlug(null);
    }
    setSlugResolved(true);
    return () => setSlugResolved(false);
  }, [workspaceSlug, setCurrentWorkspaceSlug]);

  // Brief tick while slug syncs from URL into context (before effect fires)
  if (workspaceSlug && !slugResolved) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Slug resolved but no matching workspace — redirect to workspace list
  if (workspaceSlug && !currentWorkspace) {
    return <Navigate to="/app/workspaces" replace />;
  }

  return <Outlet />;
}

function AuthExpiryRedirectBridge() {
  useAuthExpiryRedirect();

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <RegisterPage />
          </PublicOnly>
        }
      />

      {/* Protected routes — everything under /app requires auth */}
      <Route
        element={
          <RequireAuth>
            <WorkspaceContextBridge>
              <AppShell />
            </WorkspaceContextBridge>
          </RequireAuth>
        }
      >
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/workspaces" element={<WorkspacesPage />} />

        {/* Workspace-scoped routes: sync slug from URL into context */}
        <Route element={<WorkspaceSlugSync />}>
          <Route
            path="/app/workspaces/:workspaceSlug/projects"
            element={<ProjectsPage />}
          />
          <Route
            path="/app/workspaces/:workspaceSlug/projects/:projectId"
            element={<ProjectDetailPage />}
          />
          <Route
            path="/app/workspaces/:workspaceSlug/members"
            element={<MembersPage />}
          />
        </Route>

        <Route path="/app/profile" element={<ProfilePage />} />
      </Route>

      {/* Redirects */}
      <Route path="/" element={<Navigate to="/app" replace />} />

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthExpiryRedirectBridge />

        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export { App };
