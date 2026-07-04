import { redirect } from "next/navigation";

/**
 * Gedeeld feedback-patroon voor server actions en pages.
 *
 * Server actions geven succes-/foutmeldingen door via query-params op de
 * bestemmingspagina (bv. `/planning?planError=...`). Elke pagina gebruikt een
 * eigen "kanaal" (prefix) zodat meerdere onafhankelijke feedbackstromen naast
 * elkaar kunnen bestaan: kanaal "plan" levert `planError`/`planSuccess`,
 * kanaal "entry" levert `entryError`/`entrySuccess`, enzovoort.
 */

export type FeedbackType = "success" | "error";

export type Feedback = {
  type: FeedbackType;
  message: string;
};

/** Naam van de query-param voor een kanaal + type, bv. ("plan", "error") → "planError". */
export function feedbackParam(channel: string, type: FeedbackType) {
  return `${channel}${type === "success" ? "Success" : "Error"}`;
}

/** Bouwt een URL naar `path` met de feedbackboodschap als query-param. */
export function feedbackUrl(
  path: string,
  channel: string,
  type: FeedbackType,
  message: string,
) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${feedbackParam(channel, type)}=${encodeURIComponent(message)}`;
}

/** Redirect vanuit een server action naar `path` met feedback als query-param. */
export function redirectWithFeedback(
  path: string,
  channel: string,
  type: FeedbackType,
  message: string,
): never {
  redirect(feedbackUrl(path, channel, type, message));
}

/**
 * Leest de feedback voor een kanaal uit de searchParams van een page.
 * Een foutmelding heeft voorrang op een succesmelding.
 */
export function readFeedback(
  params: Record<string, string | string[] | undefined>,
  channel: string,
): Feedback | null {
  const error = params[feedbackParam(channel, "error")];
  if (typeof error === "string" && error !== "") {
    return { type: "error", message: error };
  }
  const success = params[feedbackParam(channel, "success")];
  if (typeof success === "string" && success !== "") {
    return { type: "success", message: success };
  }
  return null;
}
