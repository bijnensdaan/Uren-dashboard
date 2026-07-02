import { describe, expect, it } from "vitest";
import { flagUnsupportedBullets } from "../../lib/domain/pv-narrative";

describe("flagUnsupportedBullets", () => {
  const taskNotes = "Analyse retributiesysteem en digitale rapportering van projecten";

  it("markeert een bullet zonder enig gedeeld trefwoord met de notities", () => {
    const flags = flagUnsupportedBullets(
      ["Volledig nieuwe blockchain module gebouwd;"],
      taskNotes,
    );
    expect(flags).toEqual([true]);
  });

  it("markeert een bullet met overlap niet", () => {
    const flags = flagUnsupportedBullets(
      ["Rapport over de analyse van het retributiesysteem;"],
      taskNotes,
    );
    expect(flags).toEqual([false]);
  });

  it("combineert gemarkeerde en niet-gemarkeerde bullets in één lijst", () => {
    const flags = flagUnsupportedBullets(
      [
        "Digitale rapportering van projecten opgezet;",
        "Kwantumcomputer aangekocht;",
      ],
      taskNotes,
    );
    expect(flags).toEqual([false, true]);
  });

  it("geeft geen enkele vlag bij lege notities", () => {
    const flags = flagUnsupportedBullets(
      ["Volledig nieuwe blockchain module gebouwd;", "Nog een bullet;"],
      "",
    );
    expect(flags).toEqual([false, false]);
  });
});
