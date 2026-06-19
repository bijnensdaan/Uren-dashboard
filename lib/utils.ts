import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatHours(value: number) {
  return `${new Intl.NumberFormat("nl-BE", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value)} u`;
}

export function formatPercent(value: number) {
  return `${new Intl.NumberFormat("nl-BE", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value)}%`;
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("nl-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
