import { Globe } from "lucide-react";

// YouTube, Instagram, LinkedIn and X as plain outline marks, in the text colour — the
// same weight as every other icon in the app, not the brands' own colours.
export function YoutubeIcon({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="M10 9.2v5.6l4.8-2.8z" />
    </svg>
  );
}

export function InstagramIcon({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className={`shrink-0 ${className}`}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LinkedinIcon({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 10.5V16" />
      <circle cx="8" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
      <path d="M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.4-2.6s2.1.9 2.1 2.6V16" />
    </svg>
  );
}

export function XIcon({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <path d="M4.5 4.5h4L19.5 19.5h-4z" />
      <path d="M19.5 4.5l-6.4 6.9M10.9 12.6l-6.4 6.9" />
    </svg>
  );
}

// A link's platform, from its address: its mark, or a globe for anywhere else
export function PlatformMark({ url, size = 14, className = "" }: { url: string; size?: number; className?: string }) {
  const host = /^(?:https?:\/\/)?(?:www\.)?([^/?#]+)/i.exec(url.trim())?.[1]?.toLowerCase() ?? "";
  const Mark = /(^|\.)(youtube\.com|youtu\.be)$/.test(host)
    ? YoutubeIcon
    : /(^|\.)instagram\.com$/.test(host)
      ? InstagramIcon
      : /(^|\.)linkedin\.com$/.test(host)
        ? LinkedinIcon
        : /(^|\.)(x\.com|twitter\.com)$/.test(host)
          ? XIcon
          : null;
  return Mark ? <Mark size={size} className={className} /> : <Globe size={size} className={`shrink-0 ${className}`} />;
}
