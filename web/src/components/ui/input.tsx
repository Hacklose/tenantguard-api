import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../../lib/utils";

interface InputProps extends ComponentPropsWithoutRef<"input"> {
  error?: string;
  label?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, label, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-300"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "block w-full rounded-lg border bg-surface-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 transition-colors duration-150",
            "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500",
            error
              ? "border-red-500/50 focus:border-red-500 focus:ring-red-500"
              : "border-surface-700 hover:border-surface-600",
            props.disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {helperText && !error && (
          <p className="text-xs text-slate-500">{helperText}</p>
        )}
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export { Input };
export type { InputProps };
