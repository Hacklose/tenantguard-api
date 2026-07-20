import { z } from "zod";

import {
  projectDescriptionSchema,
  projectNameSchema,
} from "../../features/projects/project.schema.js";

/*
 * INTENTIONALLY VULNERABLE: MASS-001
 *
 * organizationId является server-owned полем,
 * но намеренно разрешён при LAB_MODE=true.
 */
export const mass001UpdateProjectInputSchema = z
  .strictObject({
    name: projectNameSchema.optional(),
    description: projectDescriptionSchema.nullable().optional(),
    organizationId: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.organizationId !== undefined,
    {
      message: "At least one project field must be provided",
    },
  );
