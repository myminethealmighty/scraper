import { NextResponse } from "next/server";
import { getJobStats } from "@job-aggregator/database";

export async function GET() {
  return NextResponse.json(await getJobStats());
}
