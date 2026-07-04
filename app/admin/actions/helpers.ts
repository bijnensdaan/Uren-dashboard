import { prisma } from "@/lib/db";
import { redirectWithFeedback } from "@/lib/feedback";

/**
 * Gedeelde helpers voor de beheer-actions (app/admin/actions/*).
 * Dit bestand heeft bewust geen "use server": het exporteert synchrone
 * hulpfuncties die alleen door de action-modules worden gebruikt.
 */

/** Redirect terug naar /admin met een succes- of foutmelding als query-param. */
export function go(message: string, type: "success" | "error" = "success") {
  return redirectWithFeedback("/admin", "admin", type, message);
}

export function activeFromForm(formData: FormData) {
  return formData.get("active") === "on";
}

export function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sanitizeContractCode(value: string) {
  const code = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return code || "CONTRACT";
}

export async function uniqueContractCode(rawCode: string) {
  const base = sanitizeContractCode(rawCode);
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await prisma.contract.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export function fileNameBase(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

export function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function parseIsoDateOrNull(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function parsePositiveNumberOrNull(value: string | null | undefined) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function cleanAllocationPercentage(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}
