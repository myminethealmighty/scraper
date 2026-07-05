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

const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;

const optionalTextSchema = z.preprocess(emptyToUndefined, z.string().optional());
const optionalBooleanSchema = z.preprocess(emptyToUndefined, z.coerce.boolean().optional());
const optionalPageNumberSchema = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional());
const optionalPageSizeSchema = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().max(100).optional());
const optionalDateInputSchema = z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());

export const jobQuerySchema = z.object({
  q: optionalTextSchema,
  source: optionalTextSchema,
  workMode: z.preprocess(emptyToUndefined, workModeSchema.optional()),
  technology: optionalTextSchema,
  status: z.preprocess(emptyToUndefined, jobStatusSchema.optional()),
  favorite: optionalBooleanSchema,
  postedFrom: optionalDateInputSchema,
  postedTo: optionalDateInputSchema,
  page: optionalPageNumberSchema.default(1),
  pageSize: optionalPageSizeSchema.default(25)
});

export const updateJobSchema = z.object({
  status: jobStatusSchema.optional(),
  favorite: z.boolean().optional()
});

export type RawJob = z.infer<typeof rawJobSchema>;
export type JobQuery = z.infer<typeof jobQuerySchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type WorkMode = z.infer<typeof workModeSchema>;
