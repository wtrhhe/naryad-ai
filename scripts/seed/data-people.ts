import type { AppRole, ShiftCrew, SiteCode, Specialty } from "./types";

export type BrigadeKey = "crushing" | "enrichment" | "workshop";

export type PersonSpec = {
  readonly personnelNumber: string;
  readonly pin: string;
  readonly fullName: string;
  readonly role: AppRole;
  readonly specialty?: Specialty;
  readonly grade?: number;
  readonly brigade?: BrigadeKey;
  readonly crew?: ShiftCrew;
  readonly siteCodes?: readonly SiteCode[];
};

export const BRIGADE_SPECS: ReadonlyArray<{
  readonly key: BrigadeKey;
  readonly name: string;
  readonly siteCode: SiteCode;
}> = [
  { key: "crushing", name: "Механослужба дробления", siteCode: "CRUSH" },
  { key: "enrichment", name: "Механослужба обогащения", siteCode: "ENRICH" },
  { key: "workshop", name: "Ремонтная бригада РМЦ", siteCode: "RMC" },
];

const worker = (
  personnelNumber: string,
  fullName: string,
  specialty: Specialty,
  grade: number,
  brigade: BrigadeKey,
  crew: ShiftCrew,
): PersonSpec => ({
  personnelNumber,
  pin: "1234",
  fullName,
  role: "worker",
  specialty,
  grade,
  brigade,
  crew,
});

export const PEOPLE: readonly PersonSpec[] = [
  {
    personnelNumber: "1001",
    pin: "1111",
    fullName: "Кравцов Сергей Викторович",
    role: "master",
    siteCodes: ["CRUSH", "LOAD"],
  },
  {
    personnelNumber: "1002",
    pin: "2222",
    fullName: "Нурланов Ерлан Маратович",
    role: "master",
    siteCodes: ["ENRICH", "RMC"],
  },
  { personnelNumber: "3001", pin: "3333", fullName: "Омарова Айгуль Сериковна", role: "manager" },
  { personnelNumber: "9001", pin: "9999", fullName: "Беляев Андрей Николаевич", role: "admin" },
  worker("2001", "Ахметов Ержан Болатович", "fitter", 5, "crushing", "A"),
  worker("2002", "Иванов Дмитрий Петрович", "fitter", 4, "crushing", "B"),
  worker("2003", "Сейтказин Руслан Асхатович", "electrician", 5, "crushing", "C"),
  worker("2004", "Попов Алексей Игоревич", "fitter", 4, "crushing", "D"),
  worker("2005", "Касымов Талгат Рашидович", "lubricator", 3, "crushing", "A"),
  worker("2006", "Мукашев Бауыржан Тлеуович", "fitter", 6, "enrichment", "B"),
  worker("2007", "Федоренко Игорь Владимирович", "fitter", 3, "enrichment", "C"),
  worker("2008", "Жунусов Аскар Кайратович", "electrician", 4, "enrichment", "D"),
  worker("2009", "Литвинов Павел Сергеевич", "hydraulic", 4, "enrichment", "A"),
  worker("2010", "Байтурсынов Данияр Нурланович", "instrumentation", 5, "enrichment", "B"),
  worker("2011", "Ким Виктор Анатольевич", "welder", 5, "workshop", "C"),
  worker("2012", "Абдрахманов Тимур Ермекович", "electrician", 5, "workshop", "A"),
  worker("2013", "Шевченко Олег Анатольевич", "welder", 4, "workshop", "D"),
  worker("2014", "Сулейменов Марат Бахытович", "electrician", 3, "workshop", "B"),
  worker("2015", "Кузнецов Андрей Михайлович", "lubricator", 4, "workshop", "C"),
];

export const REPEAT_FAILURE_WORKER = "2004";
export const EXPIRED_HEIGHT_PERMIT_WORKER = "2007";
export const EXPIRED_LIFTING_PERMIT_WORKER = "2013";
export const MASTER_BY_SITE_DAY: Readonly<Record<SiteCode, string>> = {
  CRUSH: "1001",
  LOAD: "1001",
  ENRICH: "1002",
  RMC: "1002",
};
export const NIGHT_DUTY_MASTER = "1002";
