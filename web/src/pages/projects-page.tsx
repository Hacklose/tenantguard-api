import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  FolderKanban,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
} from "../api/projects";
import { useWorkspace } from "../hooks/use-workspace";
import { canManageProjects, canMutateProject } from "../types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Card } from "../components/ui/card";
import { Spinner } from "../components/ui/spinner";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { ProjectStatusBadge } from "../components/project-status-badge";
import { getErrorMessage, useHandleApiError } from "../hooks/use-error";

const createSchema = z.object({
  name: z.string().min(1, "Project name is required").max(160),
  description: z.string().max(2000).optional(),
});

const editSchema = z.object({
  name: z.string().min(1, "Project name is required").max(160),
  description: z.string().max(2000).nullable().optional(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

function ProjectsPage() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const queryClient = useQueryClient();
  const handleApiError = useHandleApiError();
  const { currentRole } = useWorkspace();
  const canManage = currentRole ? canManageProjects(currentRole) : false;

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    id: string;
    name: string;
    description: string | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const slug = workspaceSlug ?? "";

  const {
    data: projects = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["projects", slug],
    queryFn: () => fetchProjects(slug),
    enabled: !!slug,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) =>
      createProject(slug, {
        name: data.name,
        description: data.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", slug] });
      setCreateOpen(false);
      setServerError(null);
    },
    onError: (err) => {
      handleApiError(err);
      setServerError(getErrorMessage(err));
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, ...data }: EditForm & { id: string }) => {
      const body: { name?: string; description?: string | null } = {};
      if (data.name !== undefined) body.name = data.name;
      if (data.description !== undefined) body.description = data.description;
      return updateProject(slug, id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", slug] });
      setEditTarget(null);
      setServerError(null);
    },
    onError: (err) => {
      handleApiError(err);
      setServerError(getErrorMessage(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => deleteProject(slug, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", slug] });
      setDeleteTarget(null);
    },
    onError: (err) => {
      handleApiError(err);
      setServerError(getErrorMessage(err));
    },
  });

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });

  function openEdit(project: {
    id: string;
    name: string;
    description: string | null;
  }) {
    editForm.reset({
      name: project.name,
      description: project.description ?? "",
    });
    setServerError(null);
    setEditTarget(project);
  }

  function openCreate() {
    createForm.reset();
    setServerError(null);
    setCreateOpen(true);
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
          <h1 className="text-2xl font-bold text-slate-100">Projects</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage projects in this workspace
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" />
            New project
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-10 w-10" />}
          title="No projects yet"
          description="Create your first project to get started."
          action={
            canManage ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Create project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const canEdit =
              currentRole
                ? canMutateProject(currentRole, project.status)
                : false;

            return (
              <Card key={project.id}>
                <Link
                  to={`/app/workspaces/${slug}/projects/${project.id}`}
                  className="block"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-100 truncate">
                          {project.name}
                        </h3>
                        <ProjectStatusBadge status={project.status} />
                      </div>
                      {project.description && (
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span>
                      Updated{" "}
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                    {project.reviewRequestedAt && (
                      <span>
                        Review requested{" "}
                        {new Date(
                          project.reviewRequestedAt,
                        ).toLocaleDateString()}
                      </span>
                    )}
                    {project.publishedAt && (
                      <span>
                        Published{" "}
                        {new Date(project.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </Link>
                {canEdit && (
                  <div className="mt-3 flex gap-0.5 border-t border-surface-700 pt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => openEdit(project)}
                      aria-label="Edit project"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        setDeleteTarget({
                          id: project.id,
                          name: project.name,
                        })
                      }
                      aria-label="Delete project"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create project"
      >
        <form
          onSubmit={createForm.handleSubmit((data) =>
            createMutation.mutate(data),
          )}
          className="space-y-4"
        >
          <Input
            label="Project name"
            placeholder="My project"
            error={createForm.formState.errors.name?.message}
            {...createForm.register("name")}
          />
          <Input
            label="Description (optional)"
            placeholder="Brief description of the project"
            error={createForm.formState.errors.description?.message}
            {...createForm.register("description")}
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

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit project"
      >
        <form
          onSubmit={editForm.handleSubmit((data) => {
            if (!editTarget) return;
            const body: { name: string; description?: string | null } = {
              name: data.name,
            };
            if (data.description === "") {
              body.description = null;
            } else if (data.description) {
              body.description = data.description;
            }
            editMutation.mutate({ id: editTarget.id, ...body });
          })}
          className="space-y-4"
        >
          <Input
            label="Project name"
            placeholder="My project"
            error={editForm.formState.errors.name?.message}
            {...editForm.register("name")}
          />
          <Input
            label="Description"
            placeholder="Brief description"
            helperText="Leave empty to clear the description"
            error={editForm.formState.errors.description?.message}
            {...editForm.register("description")}
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
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={editMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete project"
      >
        <p className="text-sm text-slate-400">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-slate-200">
            {deleteTarget?.name}
          </span>
          ? This action cannot be undone.
        </p>

        {serverError && (
          <div
            className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            role="alert"
          >
            {serverError}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => {
              if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export { ProjectsPage };
