import { z } from "zod";

/**
 * The Worker's state-update request body
 * (`PATCH /api/v1/worker/jobs/:id/state`). `state` accepts either a legacy
 * integer (0–9) or a Studio canonical name — `mapWorkerState`
 * (`features/jobs/domain/legacy-state-mapping.ts`) resolves which, and
 * whether it's valid at all; this schema only checks the shape.
 *
 * `errorReason` is optional and only meaningful when transitioning to
 * `ERROR` — required there, ignored otherwise (checked in the Route Handler,
 * not here, since it depends on the *mapped* target state). Length-capped:
 * this is a user-visible failure message (docs/domain/jobs.md, Phase 7 brief
 * §29/§30), never an unbounded internal diagnostic dump.
 */
export const workerTransitionSchema = z.object({
  state: z.union([
    z.number().int().min(0).max(9),
    z.string().trim().min(1).max(20),
  ]),
  errorReason: z.string().trim().min(1).max(2000).optional(),
});

export type WorkerTransitionInput = z.infer<typeof workerTransitionSchema>;
