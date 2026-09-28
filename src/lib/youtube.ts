export function isYouTubeUrl(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return false;
  const clean = url.trim().toLowerCase();
  return clean.includes("youtube.com") || clean.includes("youtu.be");
}

export function getYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const clean = url.trim();

  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i;
  const match = clean.match(regExp);
  if (match && match[1]) {
    return match[1];
  }

  if (clean.length === 11 && /^[\w-]{11}$/.test(clean)) {
    return clean;
  }

  return null;
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeMaxResThumbnail(videoId: string): string {
  // Use hqdefault as maxresdefault 404s on most YouTube Shorts and vertical videos
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function safeYouTubeThumbnailUrl(url: string | null | undefined, fallbackVideo?: string | null): string {
  if (url && url.trim()) {
    if (url.includes("maxresdefault.jpg")) {
      return url.replace("maxresdefault.jpg", "hqdefault.jpg");
    }
    return url;
  }
  if (fallbackVideo && isYouTubeUrl(fallbackVideo)) {
    const yid = getYouTubeVideoId(fallbackVideo);
    if (yid) return getYouTubeThumbnail(yid);
  }
  return "";
}
