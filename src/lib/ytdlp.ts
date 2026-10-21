import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export interface VideoFormatOption {
  formatId: string;
  qualityLabel: string; // e.g. "1080p60", "4K 2160p", "720p"
  resolution: string; // e.g. "1920x1080"
  height: number;
  width: number;
  fps?: number;
  ext: string;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesizeApprox?: number;
  hasAudio: boolean;
  type: "video" | "audio" | "video_only";
  isBest?: boolean;
}

export interface VideoMetadata {
  id: string;
  title: string;
  description: string;
  uploader: string;
  uploaderUrl?: string;
  channel?: string;
  thumbnail: string;
  duration: number;
  durationFormatted: string;
  viewCount: number;
  uploadDate?: string;
  webpageUrl: string;
  resolutions: VideoFormatOption[];
  audioFormats: VideoFormatOption[];
  videoOnlyFormats: VideoFormatOption[];
}

export interface DownloadJob {
  id: string;
  url: string;
  title: string;
  quality: string;
  type: "video" | "audio" | "video_only";
  formatId?: string;
  status: "queued" | "downloading" | "merging" | "completed" | "error";
  progress: number;
  speed: string;
  eta: string;
  totalSize: string;
  downloadedSize: string;
  stageText: string;
  filePath?: string;
  fileName?: string;
  mimeType?: string;
  error?: string;
  createdAt: number;
}

// In-memory job tracker
const jobs = new Map<string, DownloadJob>();

export function getJob(jobId: string): DownloadJob | undefined {
  return jobs.get(jobId);
}

export function getAllJobs(): DownloadJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

import os from "os";

// Ensure system ephemeral temp folder exists (never stored in project directory)
export function getDownloadsDir(): string {
  const dir = path.join(os.tmpdir(), "apextube_ephemeral");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Resolve cookies if provided via environment or local file
function getCookiesPath(): string | null {
  // 1. Check custom path from env
  const customPath = process.env.YOUTUBE_COOKIES_FILE || process.env.COOKIES_FILE;
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  // 2. Check local cookies.txt file in project root
  const localCookies = path.join(process.cwd(), "cookies.txt");
  if (fs.existsSync(localCookies)) {
    return localCookies;
  }

  // 3. Check YOUTUBE_COOKIES or COOKIES env var (raw Netscape or base64)
  const envCookies = process.env.YOUTUBE_COOKIES || process.env.COOKIES;
  if (envCookies) {
    try {
      const targetPath = path.join(os.tmpdir(), "apextube_cookies.txt");
      let content = envCookies.trim();

      // If user pasted multiline text with literal escaped \n or \t into Railway
      if (content.includes("\\n")) {
        content = content.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
      }

      // Decode base64 if needed
      if (!content.includes("\t") && content.length > 50) {
        try {
          const decoded = Buffer.from(content, "base64").toString("utf-8");
          if (decoded.includes("\t") || decoded.includes("youtube") || decoded.includes("# Netscape")) {
            content = decoded;
          }
        } catch {}
      }

      fs.writeFileSync(targetPath, content, "utf-8");
      return targetPath;
    } catch (e) {
      console.error("Failed to write cookies from env:", e);
    }
  }

  return null;
}

// Get browser name if user wants yt-dlp to read cookies directly from local browser (chrome, edge, firefox, etc.)
function getCookiesBrowser(): string | null {
  const browser = process.env.YOUTUBE_COOKIES_BROWSER || process.env.COOKIES_BROWSER;
  if (browser && typeof browser === "string" && browser.trim().length > 0) {
    return browser.trim().toLowerCase();
  }
  return null;
}

// Common anti-bot, player-client, and cipher resolver arguments
function getYtDlpBaseArgs(): string[] {
  const args = [
    "-m",
    "yt_dlp",
    "--js-runtimes",
    "node",
    "--remote-components",
    "ejs:github",
    "--no-mark-watched",
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  ];

  const cookiePath = getCookiesPath();
  const cookieBrowser = getCookiesBrowser();

  if (cookiePath) {
    args.push("--cookies", cookiePath);
  } else if (cookieBrowser) {
    args.push("--cookies-from-browser", cookieBrowser);
  }

  // NOTE: We do NOT force "player_client=android,ios" because YouTube enabled SABR-only streaming
  // on mobile clients, which causes all video streams except legacy 360p to be skipped!
  // yt-dlp's default multi-client negotiator unlocks all 4K, 1440p, 1080p, and 720p streams.

  return args;
}

// Clean up ephemeral files older than 5 minutes
export function cleanOldDownloads() {
  try {
    const dir = getDownloadsDir();
    const files = fs.readdirSync(dir);
    const now = Date.now();
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs > 5 * 60 * 1000) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (err) {
    console.error("Cleanup error:", err);
  }
}

// Extract video metadata and format groups
export async function extractVideoInfo(videoUrl: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    // Validate basic YouTube URL
    if (
      !videoUrl ||
      (!videoUrl.includes("youtube.com") &&
        !videoUrl.includes("youtu.be"))
    ) {
      return reject(new Error("Please provide a valid YouTube URL."));
    }

    const args = [
      ...getYtDlpBaseArgs(),
      "-J",
      "--no-playlist",
      videoUrl,
    ];

    const proc = spawn("python", args);
    let stdoutData = "";
    let stderrData = "";

    proc.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        let msg = stderrData.trim() || `yt-dlp exited with code ${code}`;
        if (msg.includes("Sign in to confirm you’re not a bot") || msg.includes("HTTP Error 429")) {
          msg = "YouTube is requesting verification for this server IP. Please try again or provide cookies.";
        } else if (msg.includes("Video unavailable")) {
          msg = "Video is unavailable, private, or has been removed.";
        } else if (msg.includes("Incomplete YouTube ID")) {
          msg = "Invalid YouTube URL or ID.";
        }
        return reject(new Error(msg));
      }

      try {
        const info = JSON.parse(stdoutData);
        const rawFormats: any[] = info.formats || [];

        // Find best audio stream for size estimation
        let bestAudioSize = 0;
        const audioStreams = rawFormats.filter(
          (f) => f.vcodec === "none" && f.acodec !== "none"
        );
        if (audioStreams.length > 0) {
          const maxAudio = audioStreams.reduce((prev, curr) =>
            (curr.filesize || curr.filesize_approx || 0) >
            (prev.filesize || prev.filesize_approx || 0)
              ? curr
              : prev
          );
          bestAudioSize =
            maxAudio.filesize || maxAudio.filesize_approx || 0;
        }

        // 1. Video with Audio (Grouped by resolution)
        const resolutionMap = new Map<number, VideoFormatOption>();
        const videoOnlyList: VideoFormatOption[] = [];

        // Sort descending by height and bitrate
        const videoFormats = rawFormats.filter(
          (f) => f.vcodec && f.vcodec !== "none" && f.height
        );

        videoFormats.sort((a, b) => {
          if (b.height !== a.height) return b.height - a.height;
          return (b.tbr || 0) - (a.tbr || 0);
        });

        for (const vf of videoFormats) {
          const height = vf.height;
          const fps = vf.fps || 30;
          const fpsLabel = fps > 30 ? `${fps}` : "";
          
          let qualityName = `${height}p`;
          if (height >= 4320) qualityName = `8K ${height}p${fpsLabel}`;
          else if (height >= 2160) qualityName = `4K ${height}p${fpsLabel}`;
          else if (height >= 1440) qualityName = `2K ${height}p${fpsLabel}`;
          else if (height >= 1080) qualityName = `1080p${fpsLabel} Full HD`;
          else if (height >= 720) qualityName = `720p${fpsLabel} HD`;
          else qualityName = `${height}p`;

          const videoSize = vf.filesize || vf.filesize_approx || 0;
          const hasAudio = vf.acodec && vf.acodec !== "none";
          const combinedSize = hasAudio ? videoSize : videoSize + bestAudioSize;

          const opt: VideoFormatOption = {
            formatId: vf.format_id,
            qualityLabel: qualityName,
            resolution: `${vf.width || ""}x${vf.height}`,
            height: vf.height,
            width: vf.width,
            fps: vf.fps,
            ext: "mp4", // We mux into mp4 container
            vcodec: vf.vcodec,
            acodec: vf.acodec,
            filesize: combinedSize > 0 ? combinedSize : undefined,
            hasAudio: true,
            type: "video",
          };

          if (!resolutionMap.has(height)) {
            resolutionMap.set(height, opt);
          }

          // Add to raw video-only
          if (vf.vcodec !== "none" && (!vf.acodec || vf.acodec === "none")) {
            videoOnlyList.push({
              formatId: vf.format_id,
              qualityLabel: `${height}p (${vf.ext})`,
              resolution: `${vf.width || ""}x${vf.height}`,
              height: vf.height,
              width: vf.width,
              fps: vf.fps,
              ext: vf.ext,
              vcodec: vf.vcodec,
              filesize: vf.filesize || vf.filesize_approx,
              hasAudio: false,
              type: "video_only",
            });
          }
        }

        const resolutions = Array.from(resolutionMap.values()).sort(
          (a, b) => b.height - a.height
        );

        // 2. Audio Only options
        const audioFormats: VideoFormatOption[] = [
          {
            formatId: "mp3-320",
            qualityLabel: "MP3 — 320 kbps (Extreme Quality)",
            resolution: "Audio Only",
            height: 0,
            width: 0,
            ext: "mp3",
            acodec: "mp3",
            filesize: bestAudioSize ? Math.round(bestAudioSize * 2.2) : undefined,
            hasAudio: true,
            type: "audio",
            isBest: true,
          },
          {
            formatId: "mp3-192",
            qualityLabel: "MP3 — 192 kbps (Standard Quality)",
            resolution: "Audio Only",
            height: 0,
            width: 0,
            ext: "mp3",
            acodec: "mp3",
            filesize: bestAudioSize ? Math.round(bestAudioSize * 1.4) : undefined,
            hasAudio: true,
            type: "audio",
          },
          {
            formatId: "m4a",
            qualityLabel: "M4A / AAC — Original Bitrate (Fast)",
            resolution: "Audio Only",
            height: 0,
            width: 0,
            ext: "m4a",
            acodec: "aac",
            filesize: bestAudioSize || undefined,
            hasAudio: true,
            type: "audio",
          },
          {
            formatId: "wav",
            qualityLabel: "WAV — Uncompressed Audio",
            resolution: "Audio Only",
            height: 0,
            width: 0,
            ext: "wav",
            acodec: "pcm",
            filesize: info.duration ? info.duration * 176400 : undefined,
            hasAudio: true,
            type: "audio",
          },
        ];

        // Pick highest resolution thumbnail
        let thumbnail = info.thumbnail;
        if (info.thumbnails && Array.isArray(info.thumbnails)) {
          const sortedThumbs = [...info.thumbnails].sort(
            (a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0)
          );
          if (sortedThumbs[0]?.url) {
            thumbnail = sortedThumbs[0].url;
          }
        }

        const metadata: VideoMetadata = {
          id: info.id,
          title: info.title,
          description: info.description || "",
          uploader: info.uploader || info.channel || "Unknown Creator",
          uploaderUrl: info.uploader_url,
          channel: info.channel,
          thumbnail: thumbnail,
          duration: info.duration || 0,
          durationFormatted: formatDuration(info.duration || 0),
          viewCount: info.view_count || 0,
          uploadDate: info.upload_date,
          webpageUrl: info.webpage_url || videoUrl,
          resolutions,
          audioFormats,
          videoOnlyFormats: videoOnlyList.slice(0, 8),
        };

        resolve(metadata);
      } catch (err: any) {
        reject(new Error(`Failed to parse video information: ${err.message}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`yt-dlp execution failed: ${err.message}`));
    });
  });
}

// Start a background download task
export function startDownloadJob({
  url,
  title,
  type,
  height,
  formatId,
  audioFormat,
}: {
  url: string;
  title: string;
  type: "video" | "audio" | "video_only";
  height?: number;
  formatId?: string;
  audioFormat?: string;
}): string {
  const jobId = "job_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
  const outDir = getDownloadsDir();

  // Sanitize title for filename
  const safeTitle = (title || "video")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 100);

  const job: DownloadJob = {
    id: jobId,
    url,
    title,
    quality: height ? `${height}p` : audioFormat || formatId || "best",
    type,
    formatId,
    status: "downloading",
    progress: 0,
    speed: "--",
    eta: "--",
    totalSize: "--",
    downloadedSize: "--",
    stageText: "Initializing download...",
    createdAt: Date.now(),
  };

  jobs.set(jobId, job);

  // Build yt-dlp arguments with high-speed multi-fragment concurrency, player client bypass, and EJS cipher solver
  const args = [
    ...getYtDlpBaseArgs(),
    "-N",
    "5", // 5 concurrent DASH fragment streams
    "--buffer-size",
    "16M", // High-throughput stream buffer
    "--http-chunk-size",
    "10M",
    "--newline",
  ];

  let outTemplate = "";

  if (type === "video") {
    const targetHeight = height || 1080;
    // Format selector: best video stream up to selected resolution (including 4K/2K VP9/AV1) + best audio, muxed to mp4
    args.push(
      "-f",
      `bestvideo[height<=${targetHeight}]+bestaudio/best[height<=${targetHeight}]/best`
    );
    args.push("--merge-output-format", "mp4");
    outTemplate = path.join(outDir, `${jobId}_${safeTitle} [${targetHeight}p].%(ext)s`);
    job.fileName = `${safeTitle} [${targetHeight}p].mp4`;
    job.mimeType = "video/mp4";
  } else if (type === "audio") {
    const audioCodec = audioFormat || "mp3";
    args.push("-x");
    if (audioCodec === "mp3-320") {
      args.push("--audio-format", "mp3", "--audio-quality", "0");
      job.fileName = `${safeTitle} [320k].mp3`;
      job.mimeType = "audio/mpeg";
    } else if (audioCodec === "mp3-192") {
      args.push("--audio-format", "mp3", "--audio-quality", "2");
      job.fileName = `${safeTitle} [192k].mp3`;
      job.mimeType = "audio/mpeg";
    } else if (audioCodec === "m4a") {
      args.push("--audio-format", "m4a");
      job.fileName = `${safeTitle}.m4a`;
      job.mimeType = "audio/mp4";
    } else if (audioCodec === "wav") {
      args.push("--audio-format", "wav");
      job.fileName = `${safeTitle}.wav`;
      job.mimeType = "audio/wav";
    } else {
      args.push("--audio-format", "mp3", "--audio-quality", "0");
      job.fileName = `${safeTitle}.mp3`;
      job.mimeType = "audio/mpeg";
    }
    outTemplate = path.join(outDir, `${jobId}_${safeTitle}.%(ext)s`);
  } else if (type === "video_only" && formatId) {
    args.push("-f", formatId);
    outTemplate = path.join(outDir, `${jobId}_${safeTitle}_mute.%(ext)s`);
    job.fileName = `${safeTitle} (Video Only).mp4`;
    job.mimeType = "video/mp4";
  } else {
    args.push("-f", "bestvideo+bestaudio/best");
    args.push("--merge-output-format", "mp4");
    outTemplate = path.join(outDir, `${jobId}_${safeTitle}.%(ext)s`);
    job.fileName = `${safeTitle}.mp4`;
    job.mimeType = "video/mp4";
  }

  args.push("-o", outTemplate, url);

  const proc = spawn("python", args);

  proc.stdout.on("data", (data) => {
    const text = data.toString();
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      // Progress pattern: [download]  45.2% of  120.45MiB at 12.4MiB/s ETA 00:05
      const downloadMatch = line.match(
        /\[download\]\s+([\d\.]+)%\s+of\s+~?([\d\.]+\w+)(?:\s+at\s+([\d\.]+\w+\/s))?(?:\s+ETA\s+([\d:]+))?/i
      );

      if (downloadMatch) {
        const percent = parseFloat(downloadMatch[1]);
        job.progress = Math.min(percent, 99);
        job.totalSize = downloadMatch[2] || job.totalSize;
        if (downloadMatch[3]) {
          const rawSpeed = downloadMatch[3];
          const numMatch = rawSpeed.match(/([\d\.]+)\s*([KMG])i?B\/s/i);
          if (numMatch) {
            const val = parseFloat(numMatch[1]);
            const unit = numMatch[2].toUpperCase();
            let bytesPerSec = 0;
            if (unit === "K") bytesPerSec = val * 1024;
            else if (unit === "M") bytesPerSec = val * 1024 * 1024;
            else if (unit === "G") bytesPerSec = val * 1024 * 1024 * 1024;
            const mbps = (bytesPerSec * 8) / (1000 * 1000);
            job.speed = `${rawSpeed} (${mbps.toFixed(1)} Mbps)`;
          } else {
            job.speed = rawSpeed;
          }
        }
        if (downloadMatch[4]) job.eta = downloadMatch[4];
        job.stageText = `Downloading streams (${Math.round(job.progress)}%)`;
      } else if (line.includes("[Merger]") || line.includes("Merging formats")) {
        job.status = "merging";
        job.progress = 98;
        job.stageText = "Merging high-def video & audio tracks with FFmpeg...";
      } else if (line.includes("[ExtractAudio]") || line.includes("Extracting audio")) {
        job.status = "merging";
        job.progress = 98;
        job.stageText = "Converting audio stream...";
      } else if (line.includes("[download] 100%")) {
        job.progress = 99;
        job.stageText = "Finishing packaging...";
      }
    }
  });

  proc.stderr.on("data", (data) => {
    const errText = data.toString();
    console.warn(`yt-dlp stderr [${jobId}]:`, errText);
  });

  proc.on("close", (code) => {
    if (code === 0) {
      // Find output file matching jobId
      try {
        const files = fs.readdirSync(outDir);
        const match = files.find((f) => f.startsWith(jobId));
        if (match) {
          job.filePath = path.join(outDir, match);
          job.status = "completed";
          job.progress = 100;
          job.stageText = "Ready for download!";
          return;
        }
      } catch (e) {
        console.error("Error finding output file:", e);
      }
      job.status = "completed";
      job.progress = 100;
      job.stageText = "Ready for download!";
    } else {
      job.status = "error";
      job.error = `Download failed with exit code ${code}`;
      job.stageText = "Download failed. Please try a different resolution or verify the URL.";
    }
  });

  proc.on("error", (err) => {
    job.status = "error";
    job.error = err.message;
    job.stageText = `Error: ${err.message}`;
  });

  return jobId;
}