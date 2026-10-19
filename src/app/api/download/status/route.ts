import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/ytdlp";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json(
      { success: false, error: "Missing jobId." },
      { status: 400 }
    );
  }

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json(
      { success: false, error: "Download job not found or expired." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    job,
  });
}
