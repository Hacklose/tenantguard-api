import { cn } from "../lib/utils";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 py-16 px-6 text-center",
        className,
      )}
    >
      <AlertTriangle className="mb-4 h-10 w-10 text-red-400" />
      <h3 className="text-lg font-medium text-slate-200">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-400">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export { ErrorState };
