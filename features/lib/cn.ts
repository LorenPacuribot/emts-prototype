import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge does not know the custom `text-xxs` font size from
 * app/globals.css, and would treat it as a text colour (dropping
 * `text-gray-400` next to it). Register it as a font size.
 */
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["xxs"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
