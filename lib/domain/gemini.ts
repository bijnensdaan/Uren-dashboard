import { z } from "zod";

/**
 * Gedeelde helper voor gestructureerde Gemini-calls (REST `generateContent` met
 * `responseSchema`). Gebruikt door de AI-verdeelsleutel (allocation-suggestion.ts),
 * de AI-PV-tekst (pv-narrative.ts), de opdrachtbrief-extracties en de fasering.
 *
 * Robuustheid:
 * - Timeout van 120 seconden per poging (er gaan soms PDF's van ~18MB als
 *   inline base64 mee, dus ruim genomen).
 * - Retry met exponentiële backoff bij HTTP 429/500/502/503 en bij
 *   netwerk-/timeoutfouten: maximaal 2 retries (3 pogingen totaal).
 * - Bij 400/403/404 wordt NIET geretried: dat wijst op een configuratie- of
 *   promptfout die niet vanzelf overgaat.
 * - Nederlandse foutmeldingen die de UI rechtstreeks kan tonen.
 */
export function getGeminiModel() {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type GeminiFilePart = { mimeType: string; dataBase64: string };

/** Timeout per poging. Ruim genomen omdat grote PDF's inline meegestuurd worden. */
const GEMINI_TIMEOUT_MS = 120_000;
/** Maximaal 2 retries = 3 pogingen totaal. */
const MAX_ATTEMPTS = 3;
/** Wachttijden vóór retry-poging 2 en 3 (exponentiële backoff). */
const RETRY_DELAYS_MS = [1_000, 4_000];
/** Statussen waarbij een retry zinvol is (tijdelijke overbelasting/serverfout). */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Vertaalt een HTTP-foutstatus naar een duidelijke Nederlandse melding voor de
 * UI. De ruwe response-body wordt alleen server-side gelogd, niet aan de
 * gebruiker getoond.
 */
function buildHttpError(status: number, errorText: string): Error {
  const detail = errorText.trim().slice(0, 500);
  if (detail) {
    console.warn(`[gemini] HTTP ${status}:`, detail);
  }
  if (status === 429) {
    return new Error("Gemini is tijdelijk overbelast, probeer het zo opnieuw.");
  }
  if (status === 400 || status === 403) {
    return new Error(
      `Gemini weigerde het verzoek (HTTP ${status}). Controleer of GEMINI_API_KEY geldig is en of het verzoek correct is geconfigureerd.`,
    );
  }
  if (status === 404) {
    return new Error(
      `Gemini-model niet gevonden (HTTP 404). Controleer de GEMINI_MODEL-instelling (${getGeminiModel()}).`,
    );
  }
  return new Error(`Gemini-aanroep mislukt (HTTP ${status}). Probeer het later opnieuw.`);
}

/** Herkent een timeout-abort van `AbortSignal.timeout(...)`. */
function isTimeoutError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/**
 * Valideert de door Gemini teruggegeven JSON tegen een zod-schema.
 * Gooit een Nederlandse foutmelding die de UI kan tonen wanneer de structuur
 * niet klopt; logt de eerste issues voor debugging op de server.
 */
export function parseGeminiData<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
): z.output<Schema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(
      "[gemini] Response met onverwachte structuur:",
      result.error.issues.slice(0, 3),
    );
    throw new Error(
      "Gemini-response had een onverwachte structuur en kon niet worden verwerkt. Probeer het opnieuw.",
    );
  }
  return result.data;
}

export async function callGeminiStructured<T>(options: {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: Record<string, unknown>;
  files?: GeminiFilePart[];
}): Promise<{ model: string; data: T }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = getGeminiModel();

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY ontbreekt. Voeg deze toe aan je lokale environment om AI-tekst te genereren.",
    );
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const fileParts = (options.files ?? []).map((file) => ({
    inlineData: { mimeType: file.mimeType, data: file.dataBase64 },
  }));

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: options.systemInstruction }] },
    contents: [{ role: "user", parts: [...fileParts, { text: options.userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: options.responseSchema,
    },
  });

  let response: Response | undefined;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await wait(RETRY_DELAYS_MS[attempt - 2] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    }

    let attemptResponse: Response;
    try {
      attemptResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });
    } catch (error) {
      // Timeout of netwerkfout: retryen tot de pogingen op zijn.
      lastError = isTimeoutError(error)
        ? new Error(
            "Gemini reageerde niet binnen de tijdslimiet (2 minuten). Probeer het zo opnieuw, eventueel met een kleiner document.",
          )
        : new Error(
            "Gemini was niet bereikbaar (netwerkfout). Controleer de verbinding en probeer het opnieuw.",
          );
      continue;
    }

    if (attemptResponse.ok) {
      response = attemptResponse;
      break;
    }

    const errorText = await attemptResponse.text().catch(() => "");
    const httpError = buildHttpError(attemptResponse.status, errorText);

    if (!RETRYABLE_STATUSES.has(attemptResponse.status)) {
      // Configuratie- of promptfout (bv. 400/403/404): retryen heeft geen zin.
      throw httpError;
    }

    lastError = httpError;
  }

  if (!response) {
    throw lastError ?? new Error("Gemini-aanroep is mislukt.");
  }

  const payload = await response.json();
  const text: string | undefined = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    const blockReason = payload?.promptFeedback?.blockReason;
    throw new Error(
      blockReason
        ? `Gemini blokkeerde het verzoek (${blockReason}).`
        : "Gemini-response bevatte geen bruikbare tekst.",
    );
  }

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error("Gemini-response kon niet als geldige JSON worden gelezen.");
  }

  return { model, data };
}
