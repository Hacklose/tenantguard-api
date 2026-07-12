import type { MembershipRole } from "../types";
import { Badge } from "./ui/badge";

interface RoleBadgeProps {
  role: MembershipRole;
  size?: "sm" | "md";
}

const roleStyles: Record<
  MembershipRole,
  { variant: "warning" | "info" | "default"; label: string }
> = {
  OWNER: { variant: "warning", label: "OWNER" },
  ADMIN: { variant: "info", label: "ADMIN" },
  MEMBER: { variant: "default", label: "MEMBER" },
};

function RoleBadge({ role, size = "sm" }: RoleBadgeProps) {
  const style = roleStyles[role];

  return (
    <Badge variant={style.variant} size={size}>
      {style.label}
    </Badge>
  );
}

export { RoleBadge };
