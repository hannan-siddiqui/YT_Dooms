import { NextRequest, NextResponse } from "next/server";
import { getJob, getDownloadsDir } from "@/lib/ytdlp";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const requestedFile = searchParams.get("file");

    const outDir = getDownloadsDir();

    let targetPath: string | null = null;
    let fileName = "video.mp4";
    let mimeType = "video/mp4";

    // 1. Try finding by jobId
    if (jobId) {
      const files = fs.readdirSync(outDir);
      // Match files starting with jobId
      const matched = files.find(
        (f) => f.startsWith(jobId) && !f.endsWith(".part") && !f.endsWith(".ytdl")
      );

      if (matched) {
        targetPath = path.join(outDir, matched);
        // Clean filename by stripping jobId_ prefix
        fileName = matched.replace(`${jobId}_`, "");
      }

      // Check job object if available
      const job = getJob(jobId);
      if (job && job.fileName) {
        fileName = job.fileName;
        if (job.mimeType) mimeType = job.mimeType;
      }
    } else if (requestedFile) {
      // Direct file fallback
      const safeFile = path.basename(requestedFile);
      const possiblePath = path.join(outDir, safeFile);
      if (fs.existsSync(possiblePath)) {
        targetPath = possiblePath;
        fileName = safeFile;
      }
    }

    if (!targetPath || !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) {
      console.warn(`File not found for jobId: ${jobId}, targetPath: ${targetPath}`);
      return new NextResponse(
        JSON.stringify({
          error: "The requested file is either still processing or was not found on the server.",
          jobId,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const stat = fs.statSync(/*turbopackIgnore: true*/ targetPath);
    const fileSize = stat.size;

    // Detect MIME type by extension
    const ext = path.extname(targetPath).toLowerCase();
    if (ext === ".mp4") mimeType = "video/mp4";
    else if (ext === ".mp3") mimeType = "audio/mpeg";
    else if (ext === ".m4a") mimeType = "audio/mp4";
    else if (ext === ".webm") mimeType = "video/webm";
    else if (ext === ".wav") mimeType = "audio/wav";
    else if (ext === ".mkv") mimeType = "video/x-matroska";

    // Standard ASCII filename for legacy compatibility
    const asciiName = fileName
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_");

    // RFC 5987 UTF-8 encoded filename for modern browsers
    const utf8Name = encodeURIComponent(fileName).replace(
      /['()]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );

    const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ targetPath);

    // Auto-purge ephemeral file from server immediately after customer finishes receiving it
    nodeStream.on("close", () => {
      setTimeout(() => {
        try {
          if (fs.existsSync(/*turbopackIgnore: true*/ targetPath)) {
            fs.unlinkSync(/*turbopackIgnore: true*/ targetPath);
          }
        } catch (e) {
          // ignore if already deleted
        }
      }, 5000); // 5s safety buffer for client acknowledgment
    });

    // Use native Node.js Readable.toWeb for high-performance backpressure-aware streaming
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": fileSize.toString(),
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: any) {
    console.error("Error serving download file:", err);
    return new NextResponse(`Server error streaming file: ${err.message}`, {
      status: 500,
    });
  }
}

export const HEAD = GET;
