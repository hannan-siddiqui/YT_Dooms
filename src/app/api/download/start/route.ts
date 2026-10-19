import { NextRequest, NextResponse } from "next/server";
import { startDownloadJob, cleanOldDownloads } from "@/lib/ytdlp";

export async function POST(req: NextRequest) {
  try {
    cleanOldDownloads();
    const body = await req.json();
    const { url, title, type, height, formatId, audioFormat } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: "Missing video URL." },
        { status: 400 }
      );
    }

    const jobId = startDownloadJob({
      url,
      title: title || "video",
      type: type || "video",
      height: height ? parseInt(height, 10) : undefined,
      formatId,
      audioFormat,
    });

    return NextResponse.json({
      success: true,
      jobId,
    });
  } catch (error: any) {
    console.error("API /api/download/start error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to start download job.",
      },
      { status: 500 }
    );
  }
}
