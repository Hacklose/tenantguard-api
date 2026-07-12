import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserCircle, Mail, Calendar, Pencil, LogOut } from "lucide-react";
import { fetchMe, updateProfile } from "../api/profile";
import { logout } from "../api/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Spinner } from "../components/ui/spinner";
import { ErrorState } from "../components/error-state";
import { getErrorMessage, useHandleApiError } from "../hooks/use-error";
import { formatDateTime } from "../lib/utils";

const editSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(80),
});

type EditForm = z.infer<typeof editSchema>;

function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleApiError = useHandleApiError();
  const [isEditing, setIsEditing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    data: user,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
  });

  const editMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["me"], updatedUser);
      setIsEditing(false);
      setServerError(null);
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
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Continue with local cleanup
    } finally {
      queryClient.clear();
      navigate("/login", {
        state: { message: "You have been signed out." },
      });
    }
  }

  function startEditing() {
    if (!user) return;
    reset({ displayName: user.displayName });
    setServerError(null);
    setIsEditing(true);
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

  if (!user) {
    return (
      <div className="page-container">
        <ErrorState message="Unable to load user profile." />
      </div>
    );
  }

  return (
    <div className="page-container max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">Profile</h1>

      <Card>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600/10 ring-1 ring-brand-500/30">
              <UserCircle className="h-7 w-7 text-brand-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {user.displayName}
              </h2>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <Calendar className="h-3 w-3" />
                Member since {formatDateTime(user.createdAt)}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={startEditing}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </Card>

      {/* Edit form */}
      {isEditing && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-slate-200">
            Edit display name
          </h3>
          <form
            onSubmit={handleSubmit((data) => editMutation.mutate(data))}
            className="space-y-4"
          >
            <Input
              label="Display name"
              placeholder="Your display name"
              error={errors.displayName?.message}
              {...register("displayName")}
            />

            {serverError && (
              <div
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                role="alert"
              >
                {serverError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={editMutation.isPending}>
                Save
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Account info */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          Account details
        </h3>
        <dl className="space-y-3">
          <div className="flex justify-between">
            <dt className="text-sm text-slate-400">Email</dt>
            <dd className="text-sm text-slate-200 font-mono">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-slate-400">User ID</dt>
            <dd className="text-xs text-slate-500 font-mono">{user.id}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-slate-400">Joined</dt>
            <dd className="text-sm text-slate-300">
              {formatDateTime(user.createdAt)}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Logout */}
      <Card className="border-red-500/20 bg-red-500/5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Sign out</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              End your current session
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </Card>
    </div>
  );
}

export { ProfilePage };
