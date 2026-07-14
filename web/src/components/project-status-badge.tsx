import type { ProjectStatus } from "../types";
import { Badge } from "./ui/badge";

interface ProjectStatusBadgeProps {
  status: ProjectStatus;
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "Draft",
  REVIEW: "In review",
  PUBLISHED: "Published",
};

const STATUS_VARIANT: Record<ProjectStatus, "default" | "warning" | "success"> =
  {
    DRAFT: "default",
    REVIEW: "warning",
    PUBLISHED: "success",
  };

function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  return (
    <Badge variant={STATUS_VARIANT[status]} size="sm">
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export { ProjectStatusBadge };
