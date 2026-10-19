import { NextRequest, NextResponse } from "next/server";
import { extractVideoInfo } from "@/lib/ytdlp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "Please enter a valid YouTube video URL." },
        { status: 400 }
      );
    }

    const trimmedUrl = url.trim();
    const info = await extractVideoInfo(trimmedUrl);

    return NextResponse.json({
      success: true,
      data: info,
    });
  } catch (error: any) {
    console.error("API /api/info error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to analyze video. Please verify the URL and try again.",
      },
      { status: 500 }
    );
  }
}
