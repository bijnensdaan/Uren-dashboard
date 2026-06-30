import { callGeminiStructured, type GeminiFilePart } from "./gemini";
import { roundTwo } from "./calculations";
import { normalizePersonName } from "./name-normalization";

export type ContractSetupSource = "explicit" | "inferred";

export type ContractSetupProfile = {
  name: string;
  defaultAllocationPercentage: number | null;
  unitPrice: number | null;
  source: ContractSetupSource;
  rationale: string;
};

export type ContractSetupEmployee = {
  name: string;
  profileName: string;
  weeklyCapacityHours: number | null;
  source: ContractSetupSource;
  rationale: string;
};

export type ContractSetupTask = {
  name: string;
  source: ContractSetupSource;
  rationale: string;
};

export type ContractSetup = {
  contractCode: string | null;
  contractName: string | null;
  startDate: string | null;
  endDate: string | null;
  totalBudgetHours: number | null;
  totalBudgetAmount: number | null;
  vatPercentage: number | null;
  specificationCode: string | null;
  orderLetterTitle: string | null;
  orderLetterReference: string | null;
  domainManagerName: string | null;
  domainManagerRole: string | null;
  domainManagerOrg: string | null;
  projectLeadNames: string | null;
  profiles: ContractSetupProfile[];
  employees: ContractSetupEmployee[];
  tasks: ContractSetupTask[];
  overallRationale: string;
};

export type ContractSetupExtractionInput = {
  knownProfileNames: string[];
  file?: GeminiFilePart;
  sourceText?: string;
};

const SYSTEM_INSTRUCTION = [
  "Je leest een Belgische opdrachtbrief of contract en maakt een voorstel om een nieuw contract in een urenapplicatie aan te maken.",
  "Neem contractcode, contractnaam, datums, uren, bedragen, referenties en namen letterlijk over uit het document als ze aanwezig zijn.",
  "Als een verplicht veld niet letterlijk vermeld staat maar redelijk afleidbaar is, mag je het afleiden en vermeld je dat duidelijk in overallRationale.",
  "Verzin geen persoonsnamen, referenties, bedragen of datums. Gebruik null als ze niet vermeld of betrouwbaar afleidbaar zijn.",
  "Voor profielen en taken mag je ontbrekende operationele items voorstellen op basis van de opdrachtinhoud, maar markeer source dan als inferred.",
  "Gebruik bestaande profielnamen wanneer ze inhoudelijk overeenkomen met rollen in het document.",
  "Haal medewerkers alleen over als hun persoonsnaam letterlijk in het document staat en ze deel uitmaken van het projectteam/de opdrachtnemer/het uitvoerende personeel.",
  "Als het document secties bevat zoals 'Projectteam', 'Personeel', 'Team opdrachtnemer' of gelijkaardig, gebruik uitsluitend die secties voor employees.",
  "Sluit opdrachtgever, stakeholders, contactpersonen, sponsors, validatiepersonen, leden van externe teams en ondertekenaars uit employees, ook als hun naam letterlijk in het document staat.",
  "Voorbeelden van uit te sluiten rollen: opdrachtgever, FOD BOSA-contactpersoon, domein manager/sponsor, AI4Belgium-teamlid, rector, ondertekenaar.",
  "Verzin geen persoonsnamen en maak geen placeholders.",
  "Als er geen letterlijke persoonsnamen staan, geef employees als lege array terug.",
  "Als de verdeelsleutel niet letterlijk in het document staat, mag je zelf percentages voorstellen; overallRationale moet dan zeggen dat dit een AI-voorstel is.",
].join(" ");

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    contractCode: { type: "string", nullable: true },
    contractName: { type: "string", nullable: true },
    startDate: { type: "string", nullable: true, description: "ISO datum YYYY-MM-DD of null." },
    endDate: { type: "string", nullable: true, description: "ISO datum YYYY-MM-DD of null." },
    totalBudgetHours: { type: "number", nullable: true },
    totalBudgetAmount: { type: "number", nullable: true },
    vatPercentage: { type: "number", nullable: true },
    specificationCode: { type: "string", nullable: true },
    orderLetterTitle: { type: "string", nullable: true },
    orderLetterReference: { type: "string", nullable: true },
    domainManagerName: { type: "string", nullable: true },
    domainManagerRole: { type: "string", nullable: true, description: "Functietitel van de domeinmanager (bv. Domainmanager, Sponsor); null als niet vermeld." },
    domainManagerOrg: { type: "string", nullable: true, description: "Organisatie of afdeling van de domeinmanager; null als niet vermeld." },
    projectLeadNames: { type: "string", nullable: true },
    profiles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          defaultAllocationPercentage: {
            type: "number",
            nullable: true,
            description:
              "Percentage uit het document of AI-voorstel. Als onbekend: null.",
          },
          unitPrice: {
            type: "number",
            nullable: true,
            description: "Eenheidsprijs/uurtarief als expliciet vermeld; anders null.",
          },
          source: { type: "string", enum: ["explicit", "inferred"] },
          rationale: { type: "string" },
        },
        required: ["name", "defaultAllocationPercentage", "unitPrice", "source", "rationale"],
        propertyOrdering: ["name", "defaultAllocationPercentage", "unitPrice", "source", "rationale"],
      },
    },
    employees: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          profileName: { type: "string" },
          weeklyCapacityHours: { type: "number", nullable: true },
          source: { type: "string", enum: ["explicit", "inferred"] },
          rationale: { type: "string" },
        },
        required: ["name", "profileName", "weeklyCapacityHours", "source", "rationale"],
        propertyOrdering: ["name", "profileName", "weeklyCapacityHours", "source", "rationale"],
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          source: { type: "string", enum: ["explicit", "inferred"] },
          rationale: { type: "string" },
        },
        required: ["name", "source", "rationale"],
        propertyOrdering: ["name", "source", "rationale"],
      },
    },
    overallRationale: { type: "string" },
  },
  required: [
    "contractCode",
    "contractName",
    "startDate",
    "endDate",
    "totalBudgetHours",
    "totalBudgetAmount",
    "vatPercentage",
    "specificationCode",
    "orderLetterTitle",
    "orderLetterReference",
    "domainManagerName",
    "domainManagerRole",
    "domainManagerOrg",
    "projectLeadNames",
    "profiles",
    "employees",
    "tasks",
    "overallRationale",
  ],
  propertyOrdering: [
    "contractCode",
    "contractName",
    "startDate",
    "endDate",
    "totalBudgetHours",
    "totalBudgetAmount",
    "vatPercentage",
    "specificationCode",
    "orderLetterTitle",
    "orderLetterReference",
    "domainManagerName",
    "domainManagerRole",
    "domainManagerOrg",
    "projectLeadNames",
    "profiles",
    "employees",
    "tasks",
    "overallRationale",
  ],
};

type RawContractSetup = ContractSetup;

function cleanText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function cleanIsoDate(value: unknown): string | null {
  const text = cleanText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : text;
}

function cleanPositiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? roundTwo(number) : null;
}

function cleanPercentage(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? roundTwo(number) : null;
}

function cleanCapacity(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 80 ? roundTwo(number) : null;
}

function cleanSource(value: unknown): ContractSetupSource {
  return value === "explicit" ? "explicit" : "inferred";
}

export async function extractContractSetup(
  input: ContractSetupExtractionInput,
): Promise<{ model: string; setup: ContractSetup }> {
  const sourceBlock = input.sourceText?.trim()
    ? `Documenttekst:\n${input.sourceText.trim()}`
    : "Lees het bijgevoegde document en vul het schema in.";

  const knownProfiles = input.knownProfileNames.length
    ? input.knownProfileNames.map((name) => `- ${name}`).join("\n")
    : "- Geen bestaande profielen beschikbaar.";

  const { model, data } = await callGeminiStructured<RawContractSetup>({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt: [
      "Maak een voorstel om een nieuw contract automatisch aan te maken.",
      "",
      "Bestaande profielnamen:",
      knownProfiles,
      "",
      sourceBlock,
    ].join("\n"),
    responseSchema: RESPONSE_SCHEMA,
    files: input.file ? [input.file] : undefined,
  });

  const profiles = (Array.isArray(data.profiles) ? data.profiles : [])
    .map((profile) => ({
      name: cleanText(profile.name) ?? "",
      defaultAllocationPercentage: cleanPercentage(profile.defaultAllocationPercentage),
      unitPrice: cleanPositiveNumber(profile.unitPrice),
      source: cleanSource(profile.source),
      rationale: cleanText(profile.rationale) ?? "",
    }))
    .filter((profile) => profile.name.length > 0);

  const employees = (Array.isArray(data.employees) ? data.employees : [])
    .map((employee) => ({
      name: cleanText(employee.name) ?? "",
      profileName: cleanText(employee.profileName) ?? "",
      weeklyCapacityHours: cleanCapacity(employee.weeklyCapacityHours),
      source: "explicit" as const,
      rationale: cleanText(employee.rationale) ?? "",
    }))
    .filter((employee) => employee.name.length > 0 && employee.profileName.length > 0)
    .filter((employee, index, employees) => {
      const key = normalizePersonName(employee.name);
      return employees.findIndex((candidate) => normalizePersonName(candidate.name) === key) === index;
    });

  const tasks = (Array.isArray(data.tasks) ? data.tasks : [])
    .map((task) => ({
      name: cleanText(task.name) ?? "",
      source: cleanSource(task.source),
      rationale: cleanText(task.rationale) ?? "",
    }))
    .filter((task) => task.name.length > 0);

  return {
    model,
    setup: {
      contractCode: cleanText(data.contractCode),
      contractName: cleanText(data.contractName),
      startDate: cleanIsoDate(data.startDate),
      endDate: cleanIsoDate(data.endDate),
      totalBudgetHours: cleanPositiveNumber(data.totalBudgetHours),
      totalBudgetAmount: cleanPositiveNumber(data.totalBudgetAmount),
      vatPercentage: cleanPercentage(data.vatPercentage),
      specificationCode: cleanText(data.specificationCode),
      orderLetterTitle: cleanText(data.orderLetterTitle),
      orderLetterReference: cleanText(data.orderLetterReference),
      domainManagerName: cleanText(data.domainManagerName),
      domainManagerRole: cleanText(data.domainManagerRole),
      domainManagerOrg: cleanText(data.domainManagerOrg),
      projectLeadNames: cleanText(data.projectLeadNames),
      profiles,
      employees,
      tasks,
      overallRationale: cleanText(data.overallRationale) ?? "",
    },
  };
}
