import { NextResponse } from "next/server";
import { clearDashboardSession } from "../../../auth";

export async function POST(request: Request) {
  await clearDashboardSession();
  return NextResponse.redirect(new URL("/login", request.url));
}

export async function GET(request: Request) {
  await clearDashboardSession();
  return NextResponse.redirect(new URL("/login", request.url));
}
