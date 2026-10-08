import type { Locale } from "@/i18n/config";
import {
  isInsightKind,
  parseInsightParams,
  type InsightKind,
  type InsightParams,
  type InsightText,
  type MaterialDimension,
  type ShiftDimension,
} from "@/lib/analytics/insight";
import type { FaultCategory, ShiftPeriod } from "@/lib/analytics/types";

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function formatValue(value: number, digits = 1): string {
  return digits === 0 ? integerFormat.format(value) : numberFormat.format(value);
}

export function formatMoney(value: number, locale: Locale): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${formatValue(value / 1e9)} млрд ₸`;
  if (abs >= 1e6) return `${formatValue(value / 1e6)} млн ₸`;
  if (abs >= 1e3) return `${formatValue(value / 1e3, 0)} ${locale === "kk" ? "мың" : "тыс."} ₸`;
  return `${formatValue(value, 0)} ₸`;
}

export function plural(value: number, forms: readonly [string, string, string]): string {
  if (!Number.isInteger(value)) return forms[1];
  const tens = Math.abs(value) % 100;
  const units = tens % 10;
  if (tens > 10 && tens < 20) return forms[2];
  if (units === 1) return forms[0];
  if (units >= 2 && units <= 4) return forms[1];
  return forms[2];
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase("ru-RU") + text.slice(1);
}

function upperFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1);
}

const ADVICE_BY_CODE: Readonly<Record<string, { ru: string; kk: string }>> = {
  "М-01": {
    ru: "проверить качество и крепление футеровки, скорректировать график её замены",
    kk: "футеровканың сапасы мен бекітілуін тексеру, оны ауыстыру кестесін түзету",
  },
  "М-02": {
    ru: "проверить соосность привода, натяжение и смазку подшипниковых узлов, заменить подшипники комплектом",
    kk: "жетектің біліктестігін, мойынтірек тораптарының керілуі мен майлануын тексеру, мойынтіректерді жинағымен ауыстыру",
  },
  "М-03": {
    ru: "проверить центровку ленты, очистители и стыки, провести дефектоскопию ленты",
    kk: "таспаның орталануын, тазалағыштар мен түйіспелерді тексеру, таспаға дефектоскопия жүргізу",
  },
  "М-04": {
    ru: "проверить роликоопоры и центрирующие ролики, заменить заклинивающие ролики комплектом",
    kk: "роликті тіректер мен орталағыш роликтерді тексеру, кептелетін роликтерді жинағымен ауыстыру",
  },
  "М-05": {
    ru: "проверить защитную втулку вала и подачу уплотнительной воды, рассмотреть переход на торцевое уплотнение",
    kk: "біліктің қорғаныш втулкасын және тығыздағыш судың берілуін тексеру, торцтық тығыздағышқа көшуді қарастыру",
  },
  "М-06": {
    ru: "провести дефектоскопию рамы и сварных швов, устранить источник вибрации",
    kk: "раманың және дәнекерлеу жіктерінің дефектоскопиясын жүргізу, діріл көзін жою",
  },
  "М-07": {
    ru: "проверить центровку муфты и износ зацепления, отрегулировать соосность привода",
    kk: "муфтаның орталануы мен ілінісудің тозуын тексеру, жетектің біліктестігін реттеу",
  },
};

const ADVICE_BY_CATEGORY: Readonly<Record<FaultCategory, { ru: string; kk: string }>> = {
  mechanical: {
    ru: "провести диагностику механической части и устранить причину износа",
    kk: "механикалық бөлікке диагностика жүргізіп, тозу себебін жою",
  },
  electrical: {
    ru: "проверить нагрузку и охлаждение электродвигателя, состояние контактов и изоляции",
    kk: "электр қозғалтқыштың жүктемесі мен салқындатылуын, түйіспелер мен оқшаулаудың күйін тексеру",
  },
  hydraulic: {
    ru: "проверить чистоту и давление рабочей жидкости, состояние уплотнений и рукавов",
    kk: "жұмыс сұйықтығының тазалығы мен қысымын, тығыздағыштар мен жеңдердің күйін тексеру",
  },
  pneumatic: {
    ru: "проверить подготовку воздуха, уплотнения и клапаны пневмосистемы",
    kk: "ауаны дайындауды, пневможүйенің тығыздағыштары мен клапандарын тексеру",
  },
  lubrication: {
    ru: "пересмотреть карту смазки и проверить работу системы смазки",
    kk: "майлау картасын қайта қарап, майлау жүйесінің жұмысын тексеру",
  },
};

const GENERIC_ADVICE = {
  ru: "провести техническую диагностику узлов и устранить причину отказов",
  kk: "тораптарға техникалық диагностика жүргізіп, істен шығу себебін жою",
};

export function adviceFor(
  code: string | null,
  category: FaultCategory | null,
  locale: Locale,
): string {
  const byCode = code ? ADVICE_BY_CODE[code] : undefined;
  if (byCode) return byCode[locale];
  return category ? ADVICE_BY_CATEGORY[category][locale] : GENERIC_ADVICE[locale];
}

const PERIOD_LABELS: Readonly<Record<Locale, Record<ShiftPeriod, string>>> = {
  ru: { day: "дневная смена", night: "ночная смена" },
  kk: { day: "күндізгі ауысым", night: "түнгі ауысым" },
};

function timeRange(group: string): string {
  const [from, to] = group.split("-");
  return `${from}:00–${to}:00`;
}

export function shiftGroupLabel(dimension: ShiftDimension, group: string, locale: Locale): string {
  if (dimension === "period") {
    return upperFirst(PERIOD_LABELS[locale][group === "night" ? "night" : "day"]);
  }
  if (dimension === "crew") return locale === "kk" ? `${group} ауысымы` : `Смена ${group}`;
  return locale === "kk" ? `${timeRange(group)} аралығы` : `Период ${timeRange(group)}`;
}

function faultLabel(code: string, name: string | null, locale: Locale): string {
  const suffix = name ? ` (${lowerFirst(name)})` : "";
  return locale === "kk" ? `${code} шифры${suffix}` : `шифр ${code}${suffix}`;
}

function materialGroupLabel(params: InsightParams["material_overuse"], locale: Locale): string {
  const period = params.period ? PERIOD_LABELS[locale][params.period] : "";
  const kk = locale === "kk";
  const labels: Record<MaterialDimension, string> = {
    site_period: kk
      ? `«${params.site}» учаскесі, ${period}`
      : `Участок «${params.site}», ${period}`,
    site: kk ? `«${params.site}» учаскесі` : `Участок «${params.site}»`,
    period: upperFirst(period),
    crew: kk ? `${params.crew} ауысымы` : `Смена ${params.crew}`,
    worker: kk ? `Орындаушы ${params.worker}` : `Исполнитель ${params.worker}`,
    brigade: kk ? `«${params.brigade}» бригадасы` : `Бригада «${params.brigade}»`,
    fault: upperFirst(faultLabel(params.faultCode ?? "", params.faultName, locale)),
  };
  return labels[params.dimension];
}

type Renderer<K extends InsightKind> = (params: InsightParams[K], locale: Locale) => InsightText;

const RISK_LEVELS: Readonly<Record<Locale, Record<"high" | "elevated" | "moderate", string>>> = {
  ru: { high: "высокий", elevated: "повышенный", moderate: "умеренный" },
  kk: { high: "жоғары", elevated: "жоғарылаған", moderate: "орташа" },
};

const renderFailureRisk: Renderer<"failure_risk"> = (p, locale) => {
  const v = formatValue;
  const advice = adviceFor(p.topFaultCode, p.topFaultCategory, locale);
  const forecast = Math.round(p.expectedNext30);
  if (locale === "kk") {
    const reasons = [
      p.factors.includes("acoustic") && p.acoustic
        ? `акустика нашарлауда: спектр шыңы 30 күнде ${p.acoustic.peakSlope > 0 ? "+" : ""}${v(p.acoustic.peakSlope)} дБ, эксцесс ${v(p.acoustic.kurtosisFrom)} → ${v(p.acoustic.kurtosisTo)}`
        : null,
      p.factors.includes("frequency")
        ? `30 күнде ${p.unplanned30} істен шығу — ұқсас жабдықтан ${v(p.peerRatio)} есе көп`
        : null,
      p.factors.includes("trend") && p.trendPer30 !== null
        ? `жоспардан тыс нарядтар саны 30 күнде +${v(p.trendPer30)}`
        : null,
    ].filter((reason): reason is string => reason !== null);
    return {
      summary: `${p.equipment}: істен шығу қаупі ${p.score}/100 — ${RISK_LEVELS.kk[p.level]}.${reasons.length ? ` ${upperFirst(reasons.join("; "))}.` : ""} Қазіргі режимде алдағы 30 күнге болжам: ${forecast} жоспардан тыс тоқтау.`,
      recommendation:
        p.level === "high"
          ? `Ұсыныс: апаттық істен шығуды күтпей, бір апта ішінде ${p.equipment} жабдығын жоспарлы жөндеуге шығару: ${advice}; қосалқы бөлшектерді алдын ала дайындап, жұмыстарды ЖАЖ (ППР) жоспарына енгізу.`
          : `Ұсыныс: бақылауды күшейту — апта сайын акустикалық өлшеу және тексеру жүргізу, ${advice}; көрсеткіштер өсе берсе, жөндеуді ЖАЖ (ППР) жоспарына енгізу.`,
    };
  }
  const reasons = [
    p.factors.includes("acoustic") && p.acoustic
      ? `акустика ухудшается: пик спектра ${p.acoustic.peakSlope >= 0 ? "растёт" : "меняется"} на ${v(Math.abs(p.acoustic.peakSlope))} дБ за 30 дней, эксцесс ${v(p.acoustic.kurtosisFrom)} → ${v(p.acoustic.kurtosisTo)}`
      : null,
    p.factors.includes("frequency")
      ? `${p.unplanned30} ${plural(p.unplanned30, ["отказ", "отказа", "отказов"])} за 30 дней — в ${v(p.peerRatio)} раза больше, чем у аналогов`
      : null,
    p.factors.includes("trend") && p.trendPer30 !== null
      ? `число внеплановых нарядов растёт на ${v(p.trendPer30)} за 30 дней`
      : null,
  ].filter((reason): reason is string => reason !== null);
  return {
    summary: `${p.equipment}: риск отказа ${p.score}/100 — ${RISK_LEVELS.ru[p.level]}.${reasons.length ? ` ${upperFirst(reasons.join("; "))}.` : ""} Прогноз на ближайшие 30 дней при текущем режиме: ${forecast} ${plural(forecast, ["внеплановая остановка", "внеплановые остановки", "внеплановых остановок"])}.`,
    recommendation:
      p.level === "high"
        ? `Рекомендуем в течение недели вывести ${p.equipment} в плановый ремонт, не дожидаясь аварийного отказа: ${advice}; заранее подготовить запчасти и включить работы в план ППР.`
        : `Рекомендуем усилить контроль — еженедельно выполнять акустический замер и осмотр, ${advice}; при дальнейшем росте показателей включить ремонт в план ППР.`,
  };
};

const renderProblemEquipment: Renderer<"problem_equipment"> = (p, locale) => {
  const v = formatValue;
  const advice = adviceFor(p.topFaultCode, p.topFaultCategory, locale);
  const dominant = p.unplanned > 0 && p.topFaultCount / p.unplanned >= 0.4;
  if (locale === "kk") {
    const fault = p.topFaultCode
      ? dominant
        ? ` Оның ${p.topFaultCount} — ${faultLabel(p.topFaultCode, p.topFaultName, locale)}.`
        : ` Жиі кездесетіні — ${faultLabel(p.topFaultCode, p.topFaultName, locale)}: ${p.topFaultCount}.`
      : "";
    return {
      summary: `${p.equipment}: ${p.days} күнде ${p.unplanned} жоспардан тыс тоқтау — ұқсас жабдық медианасынан (${v(p.peerMedian)}) ${v(p.peerRatio)} есе көп.${fault} Тоқтап тұру ${v(p.downtimeHours, 0)} сағ, шығын ${formatMoney(p.downtimeCost, locale)}.`,
      recommendation: `Ұсыныс: ${advice}, ${p.equipment} жабдығын ЖАЖ (ППР) жоспарына басым түрде енгізу.`,
    };
  }
  const fault = p.topFaultCode
    ? dominant
      ? ` ${p.topFaultCount} из них — ${faultLabel(p.topFaultCode, p.topFaultName, locale)}.`
      : ` Чаще всего — ${faultLabel(p.topFaultCode, p.topFaultName, locale)}: ${p.topFaultCount}.`
    : "";
  return {
    summary: `${p.equipment}: ${p.unplanned} ${plural(p.unplanned, ["внеплановая остановка", "внеплановые остановки", "внеплановых остановок"])} за ${p.days} ${plural(p.days, ["день", "дня", "дней"])} — в ${v(p.peerRatio)} раза больше медианы аналогичного оборудования (${v(p.peerMedian)}).${fault} Простой ${v(p.downtimeHours, 0)} ч, потери ${formatMoney(p.downtimeCost, locale)}.`,
    recommendation: `Рекомендуем ${advice} и включить ${p.equipment} в план ППР с приоритетом.`,
  };
};

const RCA_SENTENCES: Readonly<
  Record<Locale, Record<"none" | "created" | "open" | "in_progress", string>>
> = {
  ru: {
    none: "",
    created: " Открыт разбор первопричины (RCA) с черновиком «5 почему».",
    open: " Разбор первопричины (RCA) открыт — дополните «5 почему» и рекомендацию.",
    in_progress: " Разбор первопричины (RCA) в работе — повторы продолжаются.",
  },
  kk: {
    none: "",
    created: " Түпкі себепті талдау (RCA) «5 неге» жобасымен ашылды.",
    open: " Түпкі себепті талдау (RCA) ашық — «5 неге» мен ұсынысты толықтырыңыз.",
    in_progress: " Түпкі себепті талдау (RCA) жүріп жатыр — қайталанулар жалғасуда.",
  },
};

const renderRepeatFault: Renderer<"repeat_fault"> = (p, locale) => {
  const v = formatValue;
  const advice = adviceFor(p.faultCode, p.faultCategory, locale);
  const fault = faultLabel(p.faultCode, p.faultName, locale);
  const rca = RCA_SENTENCES[locale][p.rcaState];
  if (locale === "kk") {
    return {
      summary: `${p.equipment}: ${fault} — ${v(p.spanDays)} тәулікте ${p.occurrences} жағдай, істен шығулар арасындағы аралық ${v(p.minGapDays)}–${v(p.maxGapDays)} тәулік. Ұқсас жабдық үшін 30 күнде ${v(p.expected)} жағдай күтіледі.${rca}`,
      recommendation: `Ұсыныс: соңғы жөндеулерді орындағандармен «5 неге» талдауын өткізу, ${advice}, шараны ЖАЖ (ППР) жоспарына енгізу.`,
    };
  }
  return {
    summary: `${p.equipment}: ${fault} — ${p.occurrences} ${plural(p.occurrences, ["случай", "случая", "случаев"])} за ${v(p.spanDays)} сут., интервал между отказами ${v(p.minGapDays)}–${v(p.maxGapDays)} сут. Для аналогичного оборудования ожидается ${v(p.expected)} за 30 дней.${rca}`,
    recommendation: `Рекомендуем провести разбор «5 почему» с исполнителями последних ремонтов, ${advice} и внести мероприятие в план ППР.`,
  };
};

const renderPostMaintenance: Renderer<"post_maintenance_failure"> = (p, locale) => {
  const v = formatValue;
  if (locale === "kk") {
    const fault = p.topFaultCode
      ? ` Көбіне — ${faultLabel(p.topFaultCode, p.topFaultName, locale)}.`
      : "";
    return {
      summary: `${p.equipment}: жоспарлы жөндеуден (ЖАЖ) кейін 7 күн ішінде жоспардан тыс тоқтау ${p.maintenances} жөндеудің ${p.followed} жағдайында болды — орта есеппен ${v(p.medianGapDays)} тәуліктен соң. ЖАЖ-ға байланыссыз 7 күнде істен шығу ықтималдығы — ${v(p.baselinePercent, 0)}%.${fault}`,
      recommendation:
        "Ұсыныс: ЖАЖ сапасын тексеру — регламент пен жұмыстарды қабылдау, тораптарды жинау мен тарту, жөндеуден кейінгі сынақ; ЖАЖ-дан кейін 2–3 тәулікте бақылау тексерісін енгізу.",
    };
  }
  const fault = p.topFaultCode
    ? ` Чаще всего — ${faultLabel(p.topFaultCode, p.topFaultName, locale)}.`
    : "";
  return {
    summary: `${p.equipment}: после ${p.followed} из ${p.maintenances} плановых ремонтов (ППР) в течение 7 дней произошла внеплановая остановка — в среднем через ${v(p.medianGapDays)} сут. Без связи с ППР вероятность отказа за 7 дней — ${v(p.baselinePercent, 0)}%.${fault}`,
    recommendation:
      "Рекомендуем проверить качество ППР: регламент и приёмку работ, сборку и затяжку узлов, обкатку после ремонта; ввести контрольный осмотр на 2–3 сутки после ППР.",
  };
};

const renderWorker: Renderer<"worker_repeat_failures"> = (p, locale) => {
  const v = formatValue;
  if (locale === "kk") {
    return {
      summary: `Орындаушы ${p.worker} (таб. № ${p.personnelNumber}): оның жөндеулерінен кейін 7 күн ішінде сол жабдықта сол ақау қайталанды — ${p.repairs} жөндеудің ${p.repeats} жағдайында, ${v(p.rate, 0)}%; қалған орындаушыларда ${v(p.teamRate, 0)}% (z = ${v(p.z)}).`,
      recommendation:
        "Ұсыныс: орындаушымен соңғы қайталанған істен шығуларды талдау, жөндеу технологиясының сақталуын және оның жұмыстарының қабылдануын тексеру, қажет болса тәлімгер немесе оқыту тағайындау.",
    };
  }
  return {
    summary: `Исполнитель ${p.worker} (таб. № ${p.personnelNumber}): после ${p.repeats} из ${p.repairs} его ремонтов в течение 7 дней та же неисправность повторилась на том же оборудовании — ${v(p.rate, 0)}% против ${v(p.teamRate, 0)}% у остальных исполнителей (z = ${v(p.z)}).`,
    recommendation:
      "Рекомендуем разобрать с исполнителем последние повторные отказы, проверить соблюдение технологии ремонта и приёмку его работ, при необходимости назначить наставника или обучение.",
  };
};

const renderBrigade: Renderer<"brigade_repeat_failures"> = (p, locale) => {
  const v = formatValue;
  if (locale === "kk") {
    return {
      summary: `«${p.brigade}» бригадасы: жөндеулерден кейін 7 күн ішінде сол ақау қайталанды — ${p.repairs} жөндеудің ${p.repeats} жағдайында, ${v(p.rate, 0)}%; басқа бригадаларда ${v(p.teamRate, 0)}% (z = ${v(p.z)}).`,
      recommendation:
        "Ұсыныс: бригадамен қайталанған істен шығуларды талдау, жөндеудің технологиялық карталарын, құрал-сайманды және шебердің жұмысты қабылдауын тексеру.",
    };
  }
  return {
    summary: `Бригада «${p.brigade}»: после ${p.repeats} из ${p.repairs} ремонтов в течение 7 дней та же неисправность повторилась — ${v(p.rate, 0)}% против ${v(p.teamRate, 0)}% у других бригад (z = ${v(p.z)}).`,
    recommendation:
      "Рекомендуем провести с бригадой разбор повторных отказов, проверить технологические карты ремонта, инструмент и приёмку работ мастером.",
  };
};

const renderShift: Renderer<"shift_effect"> = (p, locale) => {
  const v = formatValue;
  const label = shiftGroupLabel(p.dimension, p.group, locale);
  if (p.measure === "repeat_rate") {
    if (locale === "kk") {
      return {
        summary: `${label}: жөндеулерден кейін 7 күн ішінде сол ақау қайталанды — ${p.total} жөндеудің ${p.count} жағдайында, ${v(p.share, 0)}%; басқа ауысымдарда ${v(p.expectedShare, 0)}% (z = ${v(p.z)}).`,
        recommendation:
          "Ұсыныс: ауысымның жасақталуы мен біліктілігін, жабдықты тапсыру тәртібін және шебердің жұмысты қабылдауын тексеру.",
      };
    }
    return {
      summary: `${label}: после ${p.count} из ${p.total} ремонтов в течение 7 дней та же неисправность повторилась — ${v(p.share, 0)}% против ${v(p.expectedShare, 0)}% в остальных сменах (z = ${v(p.z)}).`,
      recommendation:
        "Рекомендуем проверить укомплектованность и квалификацию смены, порядок передачи оборудования и приёмку работ мастером.",
    };
  }
  if (locale === "kk") {
    return {
      summary: `${label}: ${p.total} жоспардан тыс істен шығудың ${p.count} — ${v(p.share, 0)}%, күтілгені ${v(p.expectedShare, 0)}% (z = ${v(p.z)}).`,
      recommendation:
        "Ұсыныс: осы кезеңде жабдықпен не болатынын тексеру: жүктеме, айналып тексеру, ауысымды қабылдау-тапсыру сапасы.",
    };
  }
  return {
    summary: `${label}: ${p.count} из ${p.total} внеплановых отказов (${v(p.share, 0)}%) при ожидаемых ${v(p.expectedShare, 0)}% (z = ${v(p.z)}).`,
    recommendation:
      "Рекомендуем проверить, что происходит с оборудованием в этот период: загрузку, обходы, качество приёмки-передачи смены.",
  };
};

const renderMaterial: Renderer<"material_overuse"> = (p, locale) => {
  const v = formatValue;
  const label = materialGroupLabel(p, locale);
  if (locale === "kk") {
    const top = p.topMaterial
      ? `; ең көбі — «${p.topMaterial}» (нормадан +${v(p.topMaterialPercent ?? 0, 0)}%)`
      : "";
    return {
      summary: `${label}: материалдарды есептен шығару нормадан ${v(p.overusePercent, 0)}% жоғары (${p.orders} наряд, z = ${v(p.z)}). Нормадан тыс ${formatMoney(p.excessCost, locale)} есептен шығарылды${top}.`,
      recommendation:
        "Ұсыныс: есептен шығаруды қоймадағы нақты шығынмен салыстыру, нормадан тыс есептен шығаруға шебердің растауын енгізу және материалдардың сақталуын тексеру.",
    };
  }
  const top = p.topMaterial
    ? `; больше всего — «${p.topMaterial}» (+${v(p.topMaterialPercent ?? 0, 0)}% к норме)`
    : "";
  return {
    summary: `${label}: списание материалов на ${v(p.overusePercent, 0)}% выше нормы (${p.orders} ${plural(p.orders, ["наряд", "наряда", "нарядов"])}, z = ${v(p.z)}). Сверх нормы списано на ${formatMoney(p.excessCost, locale)}${top}.`,
    recommendation:
      "Рекомендуем сверить списания с фактическим расходом на складе, ввести подтверждение мастером списаний сверх нормы и проверить сохранность материалов.",
  };
};

const renderProblemSite: Renderer<"problem_site"> = (p, locale) => {
  const v = formatValue;
  const list = p.topEquipment.join(", ");
  if (locale === "kk") {
    return {
      summary: `«${p.site}» учаскесі: ${p.days} күнде ${p.unplanned} жоспардан тыс наряд, тоқтап тұру ${v(p.downtimeHours, 0)} сағ, шығын ${formatMoney(p.downtimeCost, locale)} — тоқтап тұрудан болған барлық шығынның ${v(p.costShare, 0)}%.${p.rateSignificant ? ` Жабдық бірлігіне шаққанда істен шығу басқа учаскелерге қарағанда ${v(p.rateRatio)} есе көп.` : ""}${list ? ` Негізгі үлес: ${list}.` : ""}`,
      recommendation: `Ұсыныс: учаске жиналысында тоқтап тұру себептерін талдау${list ? ` — ең алдымен ${list}` : ""}, жауаптыларды тағайындау және шығынның азаюын апта сайын бақылау.`,
    };
  }
  return {
    summary: `Участок «${p.site}»: ${p.unplanned} ${plural(p.unplanned, ["внеплановый наряд", "внеплановых наряда", "внеплановых нарядов"])} за ${p.days} ${plural(p.days, ["день", "дня", "дней"])}, простой ${v(p.downtimeHours, 0)} ч, потери ${formatMoney(p.downtimeCost, locale)} — ${v(p.costShare, 0)}% всех потерь от простоев.${p.rateSignificant ? ` Отказов на единицу оборудования в ${v(p.rateRatio)} раза больше, чем на других участках.` : ""}${list ? ` Основной вклад: ${list}.` : ""}`,
    recommendation: `Рекомендуем на планёрке участка разобрать причины простоев${list ? ` — в первую очередь ${list}` : ""}, назначить ответственных и еженедельно контролировать снижение потерь.`,
  };
};

const RENDERERS: { [K in InsightKind]: Renderer<K> } = {
  failure_risk: renderFailureRisk,
  problem_equipment: renderProblemEquipment,
  repeat_fault: renderRepeatFault,
  post_maintenance_failure: renderPostMaintenance,
  worker_repeat_failures: renderWorker,
  brigade_repeat_failures: renderBrigade,
  material_overuse: renderMaterial,
  shift_effect: renderShift,
  problem_site: renderProblemSite,
};

export function renderInsightText<K extends InsightKind>(
  kind: K,
  params: InsightParams[K],
  locale: Locale,
): InsightText {
  return (RENDERERS[kind] as Renderer<K>)(params, locale);
}

export function renderStoredInsightText(
  kind: string,
  params: unknown,
  locale: Locale,
): InsightText | null {
  if (!isInsightKind(kind)) return null;
  const parsed = parseInsightParams(kind, params);
  return parsed ? renderInsightText(kind, parsed, locale) : null;
}

export function digestTitle(count: number, locale: Locale): string {
  return locale === "kk"
    ? `Апталық талдау: ${count} қорытынды`
    : `Аналитика за неделю: ${count} ${plural(count, ["вывод", "вывода", "выводов"])}`;
}

export function digestEmptyBody(locale: Locale): string {
  return locale === "kk"
    ? "Осы аптада елеулі ауытқулар табылған жоқ."
    : "На этой неделе существенных отклонений не найдено.";
}
