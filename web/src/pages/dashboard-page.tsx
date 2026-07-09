import { Link } from "react-router-dom";
import {
  FolderKanban,
  Users,
  Plus,
  ArrowRight,
  Building2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../hooks/use-workspace";
import { fetchProjects } from "../api/projects";
import { fetchMemberships } from "../api/memberships";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";
import { RoleBadge } from "../components/role-badge";
import { useQueryClient } from "@tanstack/react-query";

function DashboardPage() {
  const { currentWorkspace, workspaces } = useWorkspace();
  const queryClient = useQueryClient();
  const user = queryClient.getQueryData<{ displayName: string; email: string }>(["me"]);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects", currentWorkspace?.slug],
    queryFn: () => fetchProjects(currentWorkspace!.slug),
    enabled: !!currentWorkspace,
  });

  const { data: memberships = [], isLoading: membersLoading } = useQuery({
    queryKey: ["memberships", currentWorkspace?.slug],
    queryFn: () => fetchMemberships(currentWorkspace!.slug),
    enabled: !!currentWorkspace,
  });

  if (workspaces.length === 0) {
    return (
      <div className="page-container">
        <div className="text-center py-20">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-slate-600" />
          <h1 className="text-xl font-semibold text-slate-100">
            Welcome to TenantGuard
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">
            Create your first workspace to get started managing projects and
            team members.
          </p>
          <Link to="/app/workspaces">
            <Button className="mt-6" size="lg">
              <Plus className="h-4 w-4" />
              Create your first workspace
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="page-container">
        <div className="text-center py-20">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-slate-600" />
          <h1 className="text-xl font-semibold text-slate-100">
            Select a workspace
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Choose a workspace from the dropdown above to view its details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Overview of {currentWorkspace.name}
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="stat-card">
          <p className="stat-label">Current Role</p>
          <div className="mt-2">
            <RoleBadge role={currentWorkspace.role} size="md" />
          </div>
        </div>

        <div className="stat-card">
          <p className="stat-label">Projects</p>
          {projectsLoading ? (
            <Spinner className="mt-2" size="sm" />
          ) : (
            <p className="stat-value">{projects.length}</p>
          )}
        </div>

        <div className="stat-card">
          <p className="stat-label">Members</p>
          {membersLoading ? (
            <Spinner className="mt-2" size="sm" />
          ) : (
            <p className="stat-value">{memberships.length}</p>
          )}
        </div>
      </div>

      {/* User info */}
      {user && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200 mb-1">
            Signed in as
          </h3>
          <p className="text-sm text-slate-400">
            {user.displayName}{" "}
            <span className="text-slate-600">({user.email})</span>
          </p>
        </Card>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="section-title mb-4">Quick actions</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to={`/app/workspaces/${currentWorkspace.slug}/projects`}
            className="group"
          >
            <Card hover className="h-full">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-brand-500/10 p-2.5 ring-1 ring-brand-500/20">
                  <FolderKanban className="h-5 w-5 text-brand-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-200">
                    Projects
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    View and manage projects in this workspace
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Card>
          </Link>

          <Link
            to={`/app/workspaces/${currentWorkspace.slug}/members`}
            className="group"
          >
            <Card hover className="h-full">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-brand-500/10 p-2.5 ring-1 ring-brand-500/20">
                  <Users className="h-5 w-5 text-brand-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-200">
                    Members
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Manage workspace members and roles
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

export { DashboardPage };
