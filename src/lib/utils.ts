import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names and resolve Tailwind conflicts.
 * Used by all shadcn/ui components and app components.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
