const LEADING_TITLES = [
  "prof",
  "professor",
  "dr",
  "doctor",
  "ir",
  "ing",
  "mr",
  "mevr",
  "mevrouw",
  "dhr",
  "de heer",
];

const TITLE_PATTERN = new RegExp(
  `^(?:${LEADING_TITLES.map((title) => title.replace(" ", "\\s+")).join("|")})\\.?\\s+`,
  "i",
);

export function stripPersonTitles(value: string) {
  let text = value.trim();
  for (let guard = 0; guard < 6; guard += 1) {
    const next = text.replace(TITLE_PATTERN, "").trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

export function normalizePersonName(value: string) {
  return stripPersonTitles(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`´.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function hasPersonTitle(value: string) {
  return stripPersonTitles(value) !== value.trim();
}
