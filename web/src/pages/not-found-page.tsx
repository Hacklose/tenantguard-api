import { Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";
import { Button } from "../components/ui/button";

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <FileQuestion className="mx-auto mb-4 h-12 w-12 text-slate-600" />
        <h1 className="text-xl font-semibold text-slate-100">Page not found</h1>
        <p className="mt-2 text-sm text-slate-400">
          The page you are looking for does not exist.
        </p>
        <Link to="/app" className="mt-6 inline-block">
          <Button variant="secondary" size="sm">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

export { NotFoundPage };
