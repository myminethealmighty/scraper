import { NextResponse } from "next/server";
import { clearDashboardSession } from "../../../auth";

export async function POST(request: Request) {
  await clearDashboardSession();
  return NextResponse.redirect(publicUrl(request, "/login"));
}

export async function GET(request: Request) {
  await clearDashboardSession();
  return NextResponse.redirect(publicUrl(request, "/login"));
}

function publicUrl(request: Request, path: string): URL {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? requestUrl.protocol.replace(":", "") : "https");
  return new URL(path, proto + "://" + host);
}
