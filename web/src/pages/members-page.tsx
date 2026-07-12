import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users, UserPlus, Pencil, Trash2, Crown } from "lucide-react";
import {
  fetchMemberships,
  addMembership,
  updateMembershipRole,
  removeMembership,
} from "../api/memberships";
import { useWorkspace } from "../hooks/use-workspace";
import type { Membership } from "../types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Spinner } from "../components/ui/spinner";
import { RoleBadge } from "../components/role-badge";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { getErrorMessage, useHandleApiError } from "../hooks/use-error";
import { formatDate } from "../lib/utils";

const addSchema = z.object({
  email: z.string().min(1, "Email is required").email("Must be a valid email"),
  role: z.enum(["ADMIN", "MEMBER"]),
});

const changeRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});

type AddForm = z.infer<typeof addSchema>;

function MembersPage() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const queryClient = useQueryClient();
  const handleApiError = useHandleApiError();
  const { currentRole } = useWorkspace();
  const isOwner = currentRole === "OWNER";

  const [addOpen, setAddOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Membership | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Membership | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const slug = workspaceSlug ?? "";

  const {
    data: memberships = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["memberships", slug],
    queryFn: () => fetchMemberships(slug),
    enabled: !!slug,
  });

  const ownerCount = useMemo(
    () => memberships.filter((m) => m.role === "OWNER").length,
    [memberships],
  );

  const addMutation = useMutation({
    mutationFn: (data: AddForm) => addMembership(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memberships", slug] });
      setAddOpen(false);
      setServerError(null);
    },
    onError: (err) => {
      handleApiError(err);
      setServerError(getErrorMessage(err));
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({
      memberUserId,
      role,
    }: {
      memberUserId: string;
      role: "ADMIN" | "MEMBER";
    }) => updateMembershipRole(slug, memberUserId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memberships", slug] });
      setRoleTarget(null);
      setServerError(null);
    },
    onError: (err) => {
      handleApiError(err);
      setServerError(getErrorMessage(err));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberUserId: string) => removeMembership(slug, memberUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memberships", slug] });
      setRemoveTarget(null);
    },
    onError: (err) => {
      handleApiError(err);
      setServerError(getErrorMessage(err));
    },
  });

  const addForm = useForm<AddForm>({
    resolver: zodResolver(addSchema),
    defaultValues: { role: "MEMBER" },
  });

  const roleForm = useForm<{ role: "ADMIN" | "MEMBER" }>({
    resolver: zodResolver(changeRoleSchema),
  });

  function openRoleChange(member: Membership) {
    roleForm.reset({ role: member.role as "ADMIN" | "MEMBER" });
    setServerError(null);
    setRoleTarget(member);
  }

  function openAdd() {
    addForm.reset({ role: "MEMBER" });
    setServerError(null);
    setAddOpen(true);
  }

  function isFinalOwner(member: Membership): boolean {
    return member.role === "OWNER" && ownerCount <= 1;
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
          <h1 className="text-2xl font-bold text-slate-100">Members</h1>
          <p className="mt-1 text-sm text-slate-400">
            {memberships.length} member{memberships.length !== 1 ? "s" : ""} in
            this workspace
          </p>
        </div>
        {isOwner && (
          <Button onClick={openAdd} size="sm">
            <UserPlus className="h-4 w-4" />
            Add member
          </Button>
        )}
      </div>

      {memberships.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No members"
          description="Add team members to this workspace."
          action={
            isOwner ? (
              <Button onClick={openAdd}>
                <UserPlus className="h-4 w-4" />
                Add member
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-800 bg-surface-900/50">
                  <th className="px-4 py-3 font-medium text-slate-400">
                    Member
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-400">
                    Email
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-400">
                    Role
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-400 hidden sm:table-cell">
                    Joined
                  </th>
                  {isOwner && (
                    <th className="px-4 py-3 font-medium text-slate-400 text-right">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {memberships.map((member) => (
                  <tr
                    key={member.userId}
                    className="hover:bg-surface-900/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">
                          {member.displayName}
                        </span>
                        {member.role === "OWNER" && (
                          <Crown className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-400">
                        {member.email}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={member.role} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                      {formatDate(member.createdAt)}
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {member.role !== "OWNER" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => openRoleChange(member)}
                                aria-label={`Change role for ${member.displayName}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => setRemoveTarget(member)}
                                aria-label={`Remove ${member.displayName}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            </>
                          )}
                          {isFinalOwner(member) && (
                            <span className="text-2xs text-slate-600">
                              Final owner
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add member"
      >
        <form
          onSubmit={addForm.handleSubmit((data) => addMutation.mutate(data))}
          className="space-y-4"
        >
          <Input
            label="Email"
            type="email"
            placeholder="member@example.com"
            helperText="User must already be registered."
            error={addForm.formState.errors.email?.message}
            {...addForm.register("email")}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="add-role"
              className="block text-sm font-medium text-slate-300"
            >
              Role
            </label>
            <select
              id="add-role"
              className="block w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              {...addForm.register("role")}
            >
              <option value="ADMIN">ADMIN</option>
              <option value="MEMBER">MEMBER</option>
            </select>
          </div>

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
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={addMutation.isPending}>
              Add
            </Button>
          </div>
        </form>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        open={!!roleTarget}
        onClose={() => setRoleTarget(null)}
        title="Change role"
      >
        <p className="mb-4 text-sm text-slate-400">
          Change role for{" "}
          <span className="font-semibold text-slate-200">
            {roleTarget?.displayName}
          </span>
        </p>

        <form
          onSubmit={roleForm.handleSubmit((data) => {
            if (!roleTarget) return;
            roleMutation.mutate({
              memberUserId: roleTarget.userId,
              role: data.role,
            });
          })}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="change-role"
              className="block text-sm font-medium text-slate-300"
            >
              Role
            </label>
            <select
              id="change-role"
              className="block w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              {...roleForm.register("role")}
            >
              <option value="ADMIN">ADMIN</option>
              <option value="MEMBER">MEMBER</option>
            </select>
          </div>

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
              onClick={() => setRoleTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={roleMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Remove Member Confirmation */}
      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remove member"
      >
        <p className="text-sm text-slate-400">
          Are you sure you want to remove{" "}
          <span className="font-semibold text-slate-200">
            {removeTarget?.displayName}
          </span>{" "}
          from this workspace?
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
            onClick={() => setRemoveTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={removeMutation.isPending}
            onClick={() => {
              if (removeTarget) removeMutation.mutate(removeTarget.userId);
            }}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export { MembersPage };
