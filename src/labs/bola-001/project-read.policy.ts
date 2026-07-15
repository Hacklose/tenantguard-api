import type { ProjectReadInput } from "../../features/projects/project-read.policy.js";
import { projectPublicSelect } from "../../features/projects/project-public.select.js";
import { prisma } from "../../lib/prisma.js";

/*
 * INTENTIONALLY VULNERABLE: BOLA-001
 *
 * organizationId намеренно игнорируется.
 * Использовать только при LAB_MODE=true.
 */
export async function findProjectByIdWithoutTenantScope({
  projectId,
}: ProjectReadInput) {
  return prisma.project.findUnique({
    where: {
      id: projectId,
    },
    select: projectPublicSelect,
  });
}
