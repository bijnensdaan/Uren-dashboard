import { NextResponse } from "next/server";

export async function POST(request: Request) {
  return NextResponse.redirect(new URL("/time-entries?import=preview-required", request.url));
}
