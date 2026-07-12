import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Trash2, ChevronRight } from "lucide-react";
import { fetchProject, updateProject, deleteProject } from "../api/projects";
import { useWorkspace } from "../hooks/use-workspace";
import { canManageProjects } from "../types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Card } from "../components/ui/card";
import { Spinner } from "../components/ui/spinner";
import { ErrorState } from "../components/error-state";
import { NotFoundPage } from "./not-found-page";
import { getErrorMessage, useHandleApiError } from "../hooks/use-error";

const editSchema = z.object({
  name: z.string().min(1, "Project name is required").max(160),
  description: z.string().max(2000).nullable().optional(),
});

type EditForm = z.infer<typeof editSchema>;

function ProjectDetailPage() {
  const { workspaceSlug, projectId } = useParams<{
    workspaceSlug: string;
    projectId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleApiError = useHandleApiError();
  const { currentRole } = useWorkspace();
  const canManage = currentRole ? canManageProjects(currentRole) : false;

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
  const id = projectId ?? "";

  const {
    data: project,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["project", slug, id],
    queryFn: () => fetchProject(slug, id),
    enabled: !!slug && !!id,
  });

  const editMutation = useMutation({
    mutationFn: ({ id: _, ...data }: EditForm & { id: string }) => {
      const body: { name?: string; description?: string | null } = {};
      if (data.name !== undefined) body.name = data.name;
      if (data.description !== undefined) body.description = data.description;
      return updateProject(slug, id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", slug, id] });
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
      navigate(`/app/workspaces/${slug}/projects`, { replace: true });
    },
    onError: (err) => {
      handleApiError(err);
      setServerError(getErrorMessage(err));
    },
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

  if (!project) {
    return <NotFoundPage />;
  }

  return (
    <div className="page-container space-y-6">
      {/* Back navigation */}
      <Link
        to={`/app/workspaces/${slug}/projects`}
        className="flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300 transition-colors w-fit"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        Back to projects
      </Link>

      {/* Project detail */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100">
              {project.name}
            </h2>
            {project.description && (
              <p className="mt-2 text-sm text-slate-400">
                {project.description}
              </p>
            )}
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(project)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDeleteTarget({
                    id: project.id,
                    name: project.name,
                  })
                }
              >
                <Trash2 className="h-4 w-4 text-red-400" />
              </Button>
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-4 text-xs text-slate-500">
          <span>
            Created: {new Date(project.createdAt).toLocaleDateString()}
          </span>
          <span>
            Updated: {new Date(project.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </Card>

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

export { ProjectDetailPage };
