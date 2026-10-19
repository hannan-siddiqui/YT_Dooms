import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApexTube — Ultra HD YouTube Video & Audio Downloader",
  description:
    "Fast, lossless YouTube video downloader supporting all available resolutions: 8K 4320p, 4K UHD 2160p, 1080p 60fps, 720p HD, and studio-grade 320kbps MP3 audio.",
  keywords: [
    "youtube downloader",
    "download youtube 4k",
    "youtube 1080p 60fps download",
    "youtube to mp3 320kbps",
    "8k youtube downloader",
    "video format selector",
  ],
  authors: [{ name: "ApexTube Studio" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#090d16",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
