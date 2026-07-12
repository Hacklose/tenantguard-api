# TenantGuard authorization matrix

## Roles

| Action                     | OWNER | ADMIN | MEMBER |
| -------------------------- | ----: | ----: | -----: |
| Create a workspace         |   Yes |   Yes |    Yes |
| View own workspaces        |   Yes |   Yes |    Yes |
| View workspace memberships |   Yes |   Yes |    Yes |
| Add a member               |   Yes |    No |     No |
| Change a member role       |   Yes |    No |     No |
| Remove a member            |   Yes |    No |     No |
| List projects              |   Yes |   Yes |    Yes |
| Read one project           |   Yes |   Yes |    Yes |
| Create a project           |   Yes |   Yes |     No |
| Update a project           |   Yes |   Yes |     No |
| Delete a project           |   Yes |   Yes |     No |

## Tenant isolation rules

* The HTTP API uses the term `workspace`.
* The database model remains `Organization`.
* A workspace is resolved server-side from `workspaceSlug`.
* The authenticated user is resolved server-side from the session cookie.
* A membership is resolved server-side using `userId` and `organizationId`.
* The client must never control `organizationId`, `userId`, `actorUserId`, or the current role.
* A project lookup must always be scoped by both `projectId` and `organizationId`.
* A missing workspace and an inaccessible workspace both return `404 Not Found`.
* A user who is a workspace member but lacks the required role receives `403 Forbidden`.
* A request without a valid session receives `401 Unauthorized`.

## Membership invariants

* Creating a workspace creates an OWNER membership for the current user.
* The final OWNER of a workspace cannot be removed.
* The final OWNER of a workspace cannot be downgraded to ADMIN or MEMBER.
* Only an OWNER can add, remove, or change members.
* ADMIN and MEMBER may read memberships but cannot modify them.

## Input rules

* Request bodies use strict Zod schemas.
* Unknown privileged fields are rejected.
* Prisma `data` objects use a manual allowlist.
* Password hashes, raw session tokens, and full request bodies are never stored in AuditEvent metadata.

## Audit rules

Audit events are written for:

* organization creation;
* membership creation;
* membership role changes;
* membership deletion;
* project creation;
* project update;
* project deletion.
