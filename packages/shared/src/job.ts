import { z } from "zod";

export const workModeSchema = z.enum(["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"]);
export const jobStatusSchema = z.enum(["NEW", "SAVED", "APPLIED", "ARCHIVED"]);

export const rawJobSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().default("Unknown"),
  salary: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  workMode: workModeSchema.default("UNKNOWN"),
  postedAt: z.coerce.date().nullable().optional(),
  description: z.string().nullable().optional(),
  technologies: z.array(z.string()).default([]),
  applyUrl: z.string().url(),
  source: z.string().min(1),
  sourceJobId: z.string().nullable().optional()
});

export const jobQuerySchema = z.object({
  q: z.string().optional(),
  source: z.string().optional(),
  workMode: workModeSchema.optional(),
  technology: z.string().optional(),
  status: jobStatusSchema.optional(),
  favorite: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25)
});

export const updateJobSchema = z.object({
  status: jobStatusSchema.optional(),
  favorite: z.boolean().optional()
});

export type RawJob = z.infer<typeof rawJobSchema>;
export type JobQuery = z.infer<typeof jobQuerySchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type WorkMode = z.infer<typeof workModeSchema>;
