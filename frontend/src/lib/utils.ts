import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind sınıflarını birleştirmek için yardımcı.
 * Koşullu sınıflar + Tailwind çakışmalarını temizler.
 *
 * Kullanım:
 *   cn("px-4 py-2", isActive && "bg-primary text-primary-foreground")
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
