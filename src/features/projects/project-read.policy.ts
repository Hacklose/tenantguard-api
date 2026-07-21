import { prisma } from "../../lib/prisma.js";
import { projectPublicSelect } from "./project-public.select.js";

export type ProjectReadInput = {
  projectId: string;
  organizationId: string;
};

export async function findProjectByIdWithinTenant({
  projectId,
  organizationId,
}: ProjectReadInput) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
    },
    select: projectPublicSelect,
  });
}
