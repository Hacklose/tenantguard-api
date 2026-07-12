import { cn } from "../../lib/utils";

interface CardProps {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
  onClick?: () => void;
}

function Card({ className, children, hover = false, onClick }: CardProps) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      onClick={onClick}
      className={cn(
        "rounded-xl border border-surface-800 bg-surface-900/80 p-5 shadow-card backdrop-blur-sm transition-all duration-150",
        hover &&
          "hover:border-surface-700 hover:shadow-card-lg hover:bg-surface-900",
        onClick && "cursor-pointer text-left w-full",
        className,
      )}
    >
      {children}
    </Component>
  );
}

function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("mb-4 flex items-start justify-between", className)}>
      {children}
    </div>
  );
}

function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h3 className={cn("text-base font-semibold text-slate-100", className)}>
      {children}
    </h3>
  );
}

function CardDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("text-sm text-slate-400", className)}>
      {children}
    </p>
  );
}

export { Card, CardHeader, CardTitle, CardDescription };
