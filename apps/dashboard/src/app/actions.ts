"use server";

import { revalidatePath } from "next/cache";
import { updateJob } from "@job-aggregator/database";
import { updateJobSchema } from "@job-aggregator/shared";

export async function updateJobAction(id: string, formData: FormData) {
  const favoriteValue = formData.get("favorite");
  const statusValue = formData.get("status");
  const input = updateJobSchema.parse({
    favorite: favoriteValue === null ? undefined : favoriteValue === "true",
    status: statusValue === null ? undefined : statusValue
  });

  await updateJob(id, input);
  revalidatePath("/");
}
