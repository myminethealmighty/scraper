import { NextResponse } from "next/server";
import { getJob, updateJob } from "@job-scraper/database";
import { updateJobSchema } from "@job-scraper/shared";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const job = await getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const input = updateJobSchema.parse(await request.json());
  const job = await updateJob(id, input);

  return NextResponse.json(job);
}
