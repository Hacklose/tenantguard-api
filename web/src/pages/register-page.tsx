import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Shield } from "lucide-react";
import { register as registerUser } from "../api/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

const registerSchema = z
  .object({
    displayName: z.string().min(1, "Display name is required").max(80),
    email: z.string().min(1, "Email is required").email("Must be a valid email"),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .max(128),
    passwordConfirm: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

function RegisterPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(data: RegisterForm) {
    setServerError(null);

    try {
      await registerUser({
        email: data.email,
        password: data.password,
        displayName: data.displayName,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate("/login", {
          state: { message: "Registration complete. Please sign in." },
        });
      }, 2000);
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "Registration failed.",
      );
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <svg
              className="h-6 w-6 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-100">
            Registration complete
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Redirecting to sign in...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600/10 ring-1 ring-brand-500/30">
            <Shield className="h-6 w-6 text-brand-400" />
          </div>
          <h1 className="text-xl font-semibold text-slate-100">
            Create an account
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Get started with TenantGuard
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Display name"
            type="text"
            autoComplete="name"
            placeholder="Jane Smith"
            error={errors.displayName?.message}
            {...register("displayName")}
          />

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 12 characters"
            error={errors.password?.message}
            {...register("password")}
          />

          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            error={errors.passwordConfirm?.message}
            {...register("passwordConfirm")}
          />

          {serverError && (
            <div
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
              role="alert"
            >
              {serverError}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            loading={isSubmitting}
          >
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export { RegisterPage };
