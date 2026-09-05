/**
 * Static application metadata. Client-safe (no secrets, no env).
 */
export const siteConfig = {
  name: "Studio",
  shortName: "Studio",
  description:
    "Control plane for the video-rendering pipeline: templates, jobs, files, and delivery.",
  /** Locale/direction are fixed for this app. */
  locale: "en",
  direction: "ltr",
} as const;

export type SiteConfig = typeof siteConfig;
