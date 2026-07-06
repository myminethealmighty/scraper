"use server";

import { revalidatePath } from "next/cache";
import { updateJob } from "@job-scraper/database";
import { updateJobSchema } from "@job-scraper/shared";
import { requireDashboardAuth } from "./auth";

export async function updateJobAction(id: string, formData: FormData) {
  await requireDashboardAuth();
  const favoriteValue = formData.get("favorite");
  const statusValue = formData.get("status");
  const input = updateJobSchema.parse({
    favorite: favoriteValue === null ? undefined : favoriteValue === "true",
    status: statusValue === null ? undefined : statusValue
  });

  await updateJob(id, input);
  revalidatePath("/");
}
