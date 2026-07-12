import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Building2, ArrowRight } from "lucide-react";
import { fetchWorkspaces, createWorkspace } from "../api/workspaces";
import { useWorkspace } from "../hooks/use-workspace";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Card } from "../components/ui/card";
import { Spinner } from "../components/ui/spinner";
import { RoleBadge } from "../components/role-badge";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { getErrorMessage, useHandleApiError } from "../hooks/use-error";

const createSchema = z.object({
  name: z.string().min(1, "Workspace name is required").max(120),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(80)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, digits, and hyphens only",
    ),
});

type CreateForm = z.infer<typeof createSchema>;

function WorkspacesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleApiError = useHandleApiError();
  const { setCurrentWorkspaceSlug } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    data: workspaces = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
  });

  const createMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: (newWorkspace) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setCreateOpen(false);
      setServerError(null);
      setCurrentWorkspaceSlug(newWorkspace.slug);
      navigate(`/app/workspaces/${newWorkspace.slug}/projects`);
    },
    onError: (err) => {
      handleApiError(err);
      setServerError(getErrorMessage(err));
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  function openCreate() {
    reset();
    setServerError(null);
    setCreateOpen(true);
  }

  function handleSelect(workspace: { slug: string }) {
    setCurrentWorkspaceSlug(workspace.slug);
    navigate(`/app/workspaces/${workspace.slug}/projects`);
  }

  if (isLoading) {
    return (
      <div className="page-container flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-container">
        <ErrorState
          message={getErrorMessage(error)}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Workspaces</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your workspaces
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" />
          Create workspace
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="No workspaces yet"
          description="Create your first workspace to start managing projects and team members."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Create workspace
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <Card key={ws.slug} hover onClick={() => handleSelect(ws)}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-100">{ws.name}</h3>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {ws.slug}
                  </p>
                </div>
                <RoleBadge role={ws.role} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-600">
                  Created {new Date(ws.createdAt).toLocaleDateString()}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-600" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create workspace"
      >
        <form
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
          className="space-y-4"
        >
          <Input
            label="Workspace name"
            placeholder="Acme Corp"
            error={errors.name?.message}
            {...register("name")}
          />

          <Input
            label="Slug"
            placeholder="acme-corp"
            helperText="Lowercase letters, digits, and hyphens only"
            error={errors.slug?.message}
            {...register("slug")}
          />

          {serverError && (
            <div
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
              role="alert"
            >
              {serverError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export { WorkspacesPage };
