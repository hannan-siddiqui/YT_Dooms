"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Download,
  Film,
  Music,
  Video,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Layers,
  Zap,
  HardDrive,
  Copy,
  X,
  Clock,
  Eye,
  Check,
  ShieldCheck,
  Mail,
} from "lucide-react";
import { VideoMetadata, VideoFormatOption, DownloadJob } from "@/lib/ytdlp";

function YoutubeIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function GithubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

function LinkedinIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
  );
}

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [videoData, setVideoData] = useState<VideoMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"video" | "audio" | "video_only">("video");
  const [activeJob, setActiveJob] = useState<DownloadJob | null>(null);
  const [isStartingDownload, setIsStartingDownload] = useState(false);
  const [copied, setCopied] = useState(false);

  // Poll active download job
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredSaveRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (activeJob && (activeJob.status === "downloading" || activeJob.status === "merging" || activeJob.status === "queued")) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/download/status?jobId=${activeJob.id}`);
          const data = await res.json();
          if (data.success && data.job) {
            setActiveJob(data.job);
            if (data.job.status === "completed" || data.job.status === "error") {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              // Trigger auto download if completed (once per jobId)
              if (data.job.status === "completed" && !hasTriggeredSaveRef.current.has(data.job.id)) {
                hasTriggeredSaveRef.current.add(data.job.id);
                triggerFileSave(data.job.id, data.job.fileName);
              }
            }
          }
        } catch (e) {
          console.error("Poll error:", e);
        }
      }, 1000);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeJob?.id, activeJob?.status]);

  const handleAnalyze = async (inputUrl?: string) => {
    const targetUrl = (inputUrl || url).trim();
    if (!targetUrl) {
      setError("Please enter a YouTube video URL.");
      return;
    }

    setError(null);
    setIsAnalyzing(true);
    setVideoData(null);

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to analyze video.");
      }

      setVideoData(json.data);
      if (inputUrl) {
        setUrl(inputUrl);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        if (text.includes("youtube.com") || text.includes("youtu.be")) {
          handleAnalyze(text);
        }
      }
    } catch (err) {
      console.warn("Clipboard access denied:", err);
    }
  };

  const startDownload = async (
    type: "video" | "audio" | "video_only",
    options: {
      height?: number;
      formatId?: string;
      audioFormat?: string;
    }
  ) => {
    if (!videoData) return;
    setIsStartingDownload(true);
    setError(null);

    try {
      const res = await fetch("/api/download/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: videoData.webpageUrl,
          title: videoData.title,
          type,
          height: options.height,
          formatId: options.formatId,
          audioFormat: options.audioFormat,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to initiate download.");
      }

      setActiveJob({
        id: json.jobId,
        url: videoData.webpageUrl,
        title: videoData.title,
        quality: options.height ? `${options.height}p` : options.audioFormat || "best",
        type,
        status: "downloading",
        progress: 0,
        speed: "--",
        eta: "--",
        totalSize: "--",
        downloadedSize: "--",
        stageText: "Preparing download streams...",
        createdAt: Date.now(),
      });
    } catch (err: any) {
      setError(err.message || "Failed to start download.");
    } finally {
      setIsStartingDownload(false);
    }
  };

  const triggerFileSave = (jobId: string, fileName?: string) => {
    const link = document.createElement("a");
    link.href = `/api/download/file?jobId=${jobId}`;
    if (fileName) {
      link.setAttribute("download", fileName);
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "Dynamic Size";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const sampleLinks = [
    {
      title: "Big Buck Bunny 4K (Creative Commons)",
      url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    },
    {
      title: "Tears of Steel 4K Sci-Fi",
      url: "https://www.youtube.com/watch?v=R6MlUcmOul8",
    },
    {
      title: "Sintel Open Movie",
      url: "https://www.youtube.com/watch?v=eRsGyueVLvQ",
    },
  ];

  return (
    <>
      {/* Ambient Lighting Orbs */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-orb-1" />
        <div className="ambient-orb-2" />
        <div className="ambient-orb-3" />
      </div>

      {/* Sticky Header */}
      <header className="sticky-header">
        <div className="sticky-header-inner">
          <div className="brand">
            <div className="brand-icon">
              <YoutubeIcon size={26} />
            </div>
            <div>
              <span className="brand-title">ApexTube</span>
            </div>
            <span className="brand-badge">All Resolutions</span>
          </div>

          <div className="nav-links">
            <div className="nav-status">
              <span className="status-dot" />
              <span className="nav-status-full">Turbo Acceleration Active • 5x Streams</span>
              <span className="nav-status-compact">5x Turbo</span>
            </div>
            <div className="nav-social-shortcuts">
              <a
                href="https://github.com/hannan-siddiqui?tab=repositories"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-social-btn"
                title="GitHub @hannan-siddiqui"
              >
                <GithubIcon size={18} />
              </a>
              <a
                href="https://www.linkedin.com/in/hannandev/"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-social-btn"
                title="LinkedIn @hannan-siddiqui"
              >
                <LinkedinIcon size={18} />
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="app-container">

        {/* Hero Section */}
        <section className="hero">
          <div className="hero-pill">
            <Zap size={14} className="hero-pill-icon" style={{ color: "#00f2fe" }} />
            <span>Unthrottled Turbo Engine (5x Parallel Chunks + EJS Cipher Decoupler)</span>
          </div>
          <h1 className="hero-title">
            Download YouTube Videos in <br />
            <span className="gradient-text">All Resolutions Available</span>
          </h1>
          <p className="hero-subtitle">
            Extract and download any YouTube video in its true native resolution — 8K 4320p,
            4K 2160p, 1080p 60FPS, or studio-master 320kbps MP3 audio with zero quality loss.
          </p>

          {/* Search / URL Input Box */}
          <div className="search-wrapper">
            <div className="search-box">
              <div className="search-icon-left">
                <YoutubeIcon size={24} />
              </div>
              <input
                type="text"
                className="search-input"
                placeholder="Paste YouTube video or Shorts link here..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAnalyze();
                }}
              />
              <div className="search-actions">
                {url && (
                  <button
                    className="btn-icon"
                    title="Clear input"
                    onClick={() => setUrl("")}
                  >
                    <X size={15} />
                  </button>
                )}
                <button
                  className="btn-icon"
                  title="Paste from clipboard"
                  onClick={handlePasteClipboard}
                >
                  {copied ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
                  <span>{copied ? "Pasted" : "Paste"}</span>
                </button>
                <button
                  className="btn-analyze"
                  disabled={isAnalyzing}
                  onClick={() => handleAnalyze()}
                >
                  {isAnalyzing ? (
                    <>
                      <div className="spinner" style={{ width: 18, height: 18, margin: 0 }} />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Search size={18} />
                      <span>Analyze</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Sample Links */}
            <div className="sample-chips">
              <span className="chips-label">Try demo samples:</span>
              {sampleLinks.map((sample, idx) => (
                <button
                  key={idx}
                  className="chip-btn"
                  onClick={() => {
                    setUrl(sample.url);
                    handleAnalyze(sample.url);
                  }}
                >
                  {sample.title}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Error Notice */}
        {error && (
          <div className="error-card">
            <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Analysis Error</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Loading Spinner Box */}
        {isAnalyzing && (
          <div className="loading-box">
            <div className="spinner" />
            <h3 className="loading-title">Extracting Available Formats & Stream Profiles</h3>
            <p className="loading-desc">
              Querying YouTube's DASH streams, 60fps framerates, and audio codecs...
            </p>
          </div>
        )}

        {/* Video Metadata Preview Card */}
        {videoData && (
          <>
            <div className="video-preview-card">
              <div className="thumbnail-wrapper">
                <img
                  src={videoData.thumbnail}
                  alt={videoData.title}
                  className="thumbnail-img"
                />
                <span className="duration-tag">{videoData.durationFormatted}</span>
              </div>

              <div className="video-details">
                <div>
                  <h2 className="video-title">{videoData.title}</h2>
                  <div className="video-meta-row">
                    <span className="meta-item creator-channel">
                      {videoData.uploader}
                      <ShieldCheck size={14} className="verified-icon" />
                    </span>
                    <span className="meta-item">
                      <Eye size={14} />
                      {videoData.viewCount ? videoData.viewCount.toLocaleString() + " views" : "Views hidden"}
                    </span>
                    <span className="meta-item">
                      <Clock size={14} />
                      {videoData.durationFormatted}
                    </span>
                  </div>

                  <div className="video-badges">
                    {videoData.resolutions.some((r: VideoFormatOption) => r.height >= 4320) && (
                      <span className="badge-item highlight-8k">8K Ultra HD</span>
                    )}
                    {videoData.resolutions.some((r: VideoFormatOption) => r.height >= 2160) && (
                      <span className="badge-item highlight-4k">4K UHD</span>
                    )}
                    {videoData.resolutions.some((r: VideoFormatOption) => r.height >= 1440) && (
                      <span className="badge-item">1440p 2K</span>
                    )}
                    {videoData.resolutions.some((r: VideoFormatOption) => r.height >= 1080) && (
                      <span className="badge-item highlight-fhd">1080p Full HD</span>
                    )}
                    {videoData.resolutions.some((r: VideoFormatOption) => (r.fps || 0) >= 60) && (
                      <span className="badge-item highlight-fhd">60 FPS</span>
                    )}
                    <span className="badge-item">MP4 Container</span>
                    <span className="badge-item">High-Fidelity Audio</span>
                  </div>
                </div>

                <div className="video-actions-quick">
                  <a
                    href={videoData.webpageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                  >
                    <ExternalLink size={15} />
                    <span>Open on YouTube</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Tabs for Formats */}
            <div className="tabs-container">
              <button
                className={`tab-btn ${activeTab === "video" ? "active" : ""}`}
                onClick={() => setActiveTab("video")}
              >
                <Film size={17} />
                <span className="tab-label-full">Video + Audio ({videoData.resolutions.length})</span>
                <span className="tab-label-compact">Video ({videoData.resolutions.length})</span>
              </button>
              <button
                className={`tab-btn ${activeTab === "audio" ? "active" : ""}`}
                onClick={() => setActiveTab("audio")}
              >
                <Music size={17} />
                <span className="tab-label-full">Audio Only (MP3/M4A)</span>
                <span className="tab-label-compact">Audio (MP3)</span>
              </button>
              <button
                className={`tab-btn ${activeTab === "video_only" ? "active" : ""}`}
                onClick={() => setActiveTab("video_only")}
              >
                <Video size={17} />
                <span className="tab-label-full">Raw Video ({videoData.videoOnlyFormats.length})</span>
                <span className="tab-label-compact">Mute ({videoData.videoOnlyFormats.length})</span>
              </button>
            </div>

            {/* Tab 1: Video with Audio Grid */}
            {activeTab === "video" && (
              <div className="formats-grid">
                {videoData.resolutions.map((resOption: VideoFormatOption, idx: number) => {
                  let pillClass = "pill-sd";
                  if (resOption.height >= 4320) pillClass = "pill-8k";
                  else if (resOption.height >= 2160) pillClass = "pill-4k";
                  else if (resOption.height >= 1080) pillClass = "pill-1080p";
                  else if (resOption.height >= 720) pillClass = "pill-hd";

                  const isBest = idx === 0;

                  return (
                    <div
                      key={resOption.height}
                      className={`format-card ${isBest ? "featured" : ""}`}
                    >
                      <div className="format-header">
                        <div className="format-title-group">
                          <span className="format-quality">{resOption.qualityLabel}</span>
                          <span className="format-resolution">{resOption.resolution}</span>
                        </div>
                        <span className={`format-pill ${pillClass}`}>
                          {resOption.height >= 2160
                            ? "UHD"
                            : resOption.height >= 1080
                            ? "FHD"
                            : resOption.height >= 720
                            ? "HD"
                            : "SD"}
                        </span>
                      </div>

                      <div className="format-details">
                        <div className="detail-line">
                          <span>Container:</span>
                          <strong>MP4 (H.264/AAC Muxed)</strong>
                        </div>
                        <div className="detail-line">
                          <span>Frame Rate:</span>
                          <strong>{resOption.fps || 30} FPS</strong>
                        </div>
                        <div className="detail-line">
                          <span>Audio Track:</span>
                          <strong>Synced Stereo (AAC)</strong>
                        </div>
                        <div className="detail-line">
                          <span>Estimated Size:</span>
                          <strong>{formatFileSize(resOption.filesize)}</strong>
                        </div>
                      </div>

                      <button
                        className="btn-download-format"
                        disabled={isStartingDownload || activeJob?.status === "downloading"}
                        onClick={() =>
                          startDownload("video", { height: resOption.height })
                        }
                      >
                        <Download size={18} />
                        <span>Download {resOption.height}p MP4</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab 2: Audio Only Grid */}
            {activeTab === "audio" && (
              <div className="formats-grid">
                {videoData.audioFormats.map((audioOption: VideoFormatOption) => (
                  <div
                    key={audioOption.formatId}
                    className={`format-card ${audioOption.isBest ? "featured" : ""}`}
                  >
                    <div className="format-header">
                      <div className="format-title-group">
                        <span className="format-quality">{audioOption.qualityLabel}</span>
                        <span className="format-resolution">{audioOption.ext.toUpperCase()} Audio</span>
                      </div>
                      <span className="format-pill pill-audio">
                        {audioOption.ext.toUpperCase()}
                      </span>
                    </div>

                    <div className="format-details">
                      <div className="detail-line">
                        <span>Format:</span>
                        <strong>{audioOption.ext.toUpperCase()} Audio</strong>
                      </div>
                      <div className="detail-line">
                        <span>Bitrate:</span>
                        <strong>
                          {audioOption.formatId.includes("320")
                            ? "320 kbps (High)"
                            : audioOption.formatId.includes("192")
                            ? "192 kbps"
                            : "Original Stream"}
                        </strong>
                      </div>
                      <div className="detail-line">
                        <span>Estimated Size:</span>
                        <strong>{formatFileSize(audioOption.filesize)}</strong>
                      </div>
                    </div>

                    <button
                      className="btn-download-format audio-btn"
                      disabled={isStartingDownload || activeJob?.status === "downloading"}
                      onClick={() =>
                        startDownload("audio", { audioFormat: audioOption.formatId })
                      }
                    >
                      <Music size={18} />
                      <span>Download {audioOption.ext.toUpperCase()}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: Video Only (Raw Streams) */}
            {activeTab === "video_only" && (
              <div className="formats-grid">
                {videoData.videoOnlyFormats.map((vo: VideoFormatOption) => (
                  <div key={vo.formatId} className="format-card">
                    <div className="format-header">
                      <div className="format-title-group">
                        <span className="format-quality">{vo.qualityLabel}</span>
                        <span className="format-resolution">{vo.resolution}</span>
                      </div>
                      <span className="format-pill pill-sd">Mute Video</span>
                    </div>

                    <div className="format-details">
                      <div className="detail-line">
                        <span>Codec:</span>
                        <strong>{vo.vcodec || "Raw Stream"}</strong>
                      </div>
                      <div className="detail-line">
                        <span>Audio:</span>
                        <strong style={{ color: "#94a3b8" }}>No Audio (Silent)</strong>
                      </div>
                      <div className="detail-line">
                        <span>Estimated Size:</span>
                        <strong>{formatFileSize(vo.filesize)}</strong>
                      </div>
                    </div>

                    <button
                      className="btn-download-format"
                      disabled={isStartingDownload || activeJob?.status === "downloading"}
                      onClick={() =>
                        startDownload("video_only", { formatId: vo.formatId })
                      }
                    >
                      <Download size={18} />
                      <span>Download Stream</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Active Download Progress Dock / Modal */}
        {activeJob && (
          <div className="progress-overlay">
            <div className="progress-header">
              <div className="progress-title-block">
                {activeJob.status === "completed" ? (
                  <CheckCircle2 size={20} color="#10b981" />
                ) : (
                  <div className="pulse-spinner" />
                )}
                <span className="progress-job-title" title={activeJob.title}>
                  {activeJob.title}
                </span>
              </div>
              <button
                className="progress-close-btn"
                onClick={() => setActiveJob(null)}
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </div>

            <div className="progress-bar-track">
              <div
                className={`progress-bar-fill ${
                  activeJob.status === "completed" ? "completed" : ""
                }`}
                style={{ width: `${Math.round(activeJob.progress)}%` }}
              />
            </div>

            <div className="progress-info-row">
              <span className="progress-stage">{activeJob.stageText}</span>
              <div className="progress-stats">
                {activeJob.speed !== "--" && <span>{activeJob.speed}</span>}
                {activeJob.eta !== "--" && <span>ETA: {activeJob.eta}</span>}
                <span>{Math.round(activeJob.progress)}%</span>
              </div>
            </div>

            {activeJob.status === "completed" && (
              <button
                className="btn-save-completed"
                onClick={() => triggerFileSave(activeJob.id, activeJob.fileName)}
              >
                <Download size={18} />
                <span>Save to Device ({activeJob.fileName})</span>
              </button>
            )}

            {activeJob.status === "error" && (
              <div style={{ color: "#ef4444", fontSize: "0.85rem", marginTop: 8 }}>
                {activeJob.error || "An error occurred during download."}
              </div>
            )}
          </div>
        )}

        {/* Feature Highlights Section */}
        <section className="features-section">
          <h2 className="section-title">Built for Unmatched Speed & True Fidelity</h2>
          <div className="features-grid">
            <div className="feature-box">
              <div className="feature-icon-wrapper">
                <Zap size={22} />
              </div>
              <h3 className="feature-title">All Resolutions up to 8K</h3>
              <p className="feature-desc">
                Never settle for 720p limits. Grab full 4K UHD, 1440p QHD, and 1080p 60FPS
                with pristine high-bitrate video feeds.
              </p>
            </div>

            <div className="feature-box">
              <div className="feature-icon-wrapper">
                <Layers size={22} />
              </div>
              <h3 className="feature-title">FFmpeg Stream Muxer</h3>
              <p className="feature-desc">
                YouTube stores 1080p+ video and audio separately. Our backend seamlessly
                combines both streams into universal MP4 files.
              </p>
            </div>

            <div className="feature-box">
              <div className="feature-icon-wrapper">
                <Music size={22} />
              </div>
              <h3 className="feature-title">Studio MP3 320 kbps</h3>
              <p className="feature-desc">
                Extract high-fidelity audio tracks from music, podcasts, tutorials, and
                soundtracks encoded in crisp 320kbps MP3.
              </p>
            </div>

            <div className="feature-box">
              <div className="feature-icon-wrapper">
                <HardDrive size={22} />
              </div>
              <h3 className="feature-title">Zero Bloatware or Ads</h3>
              <p className="feature-desc">
                Clean, instantaneous web interface powered by Next.js and high-performance
                Python background workers.
              </p>
            </div>
          </div>
        </section>

        {/* Footer with About Me */}
        <footer className="footer-wrapper">
          <div className="about-me-card">
            <div className="about-me-profile">
              <div className="about-avatar">
                <span>HS</span>
                <span className="avatar-online-dot" />
              </div>
              <div className="about-info">
                <span className="about-label">Creator & Developer</span>
                <h3 className="about-name">Hannan Siddiqui</h3>
                <p className="about-bio">
                  Full-stack developer building high-performance web applications, media streaming
                  tools, and elegant digital products.
                </p>
              </div>
            </div>

            <div className="about-social-links">
              <a
                href="https://github.com/hannan-siddiqui"
                target="_blank"
                rel="noopener noreferrer"
                className="social-btn github"
              >
                <GithubIcon size={18} />
                <span>GitHub</span>
              </a>
              <a
                href="https://www.linkedin.com/in/hannan-siddiqui"
                target="_blank"
                rel="noopener noreferrer"
                className="social-btn linkedin"
              >
                <LinkedinIcon size={18} />
                <span>LinkedIn</span>
              </a>
              <a
                href="mailto:hannansiddiqui774@gmail.com"
                className="social-btn email"
              >
                <Mail size={18} />
                <span>Get in Touch</span>
              </a>
            </div>
          </div>

          <div className="footer-bottom-bar">
            <p>© {new Date().getFullYear()} ApexTube. Engineered by Hannan Siddiqui.</p>
            <p className="footer-disclaimer">
              Built for personal offline viewing, open-source media, and fair use education.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
