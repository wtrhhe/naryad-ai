import { Text, View } from "@react-pdf/renderer";
import type {
  BarsSection,
  ColumnFormat,
  FieldsSection,
  ReportDocument,
  ReportKpi,
  ReportSection,
  TableSection,
  TextSection,
} from "@/lib/reports/document";
import { formatCell } from "@/lib/reports/format";
import { pdfStyles as s, TONE_COLORS } from "@/lib/reports/pdf/styles";

const NUMERIC_FORMATS: ReadonlySet<ColumnFormat> = new Set([
  "integer",
  "number",
  "money",
  "hours",
  "percent",
]);

const SHORT_TEXT_PARAGRAPHS = 8;

export function isNumericFormat(format: ColumnFormat): boolean {
  return NUMERIC_FORMATS.has(format);
}

export function pageLabel(template: string, page: number, total: number): string {
  return template.replace("{page}", String(page)).replace("{total}", String(total));
}

export function RunningHeader({ doc }: { doc: ReportDocument }) {
  return (
    <View style={s.runningHeader} fixed>
      <Text>{doc.labels.company}</Text>
      <Text>{`${doc.title} · ${doc.periodLabel}`}</Text>
    </View>
  );
}

export function Footer({ doc }: { doc: ReportDocument }) {
  return (
    <View style={s.footer} fixed>
      <Text>{`${doc.labels.generated}: ${doc.generatedAt}`}</Text>
      <Text
        render={({ pageNumber, totalPages }) => pageLabel(doc.labels.page, pageNumber, totalPages)}
      />
    </View>
  );
}

export function ReportHeader({ doc }: { doc: ReportDocument }) {
  return (
    <View style={s.headerBlock}>
      <Text style={s.brand}>{doc.labels.company}</Text>
      <Text style={s.title}>{doc.title}</Text>
      {doc.subtitle ? <Text style={s.subtitle}>{doc.subtitle}</Text> : null}
      <View style={s.metaRow}>
        <Text style={s.chip}>
          <Text style={s.chipLabel}>{`${doc.labels.period}: `}</Text>
          {doc.periodLabel}
        </Text>
        {doc.filters.map((filter) => (
          <Text key={filter.label} style={s.chip}>
            <Text style={s.chipLabel}>{`${filter.label}: `}</Text>
            {filter.value}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function KpiTiles({ kpis, doc }: { kpis: ReportKpi[]; doc: ReportDocument }) {
  if (kpis.length === 0) return null;
  return (
    <View style={s.kpiGrid} wrap={false}>
      {kpis.map((kpi) => (
        <View key={kpi.id} style={s.kpi}>
          <Text style={s.kpiLabel}>{kpi.label}</Text>
          <Text style={[s.kpiValue, { color: TONE_COLORS[kpi.tone ?? "default"] }]}>
            {formatCell(kpi.value, kpi.format, doc.locale, doc.labels.hoursUnit)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text style={s.sectionTitle} minPresenceAhead={60}>
      {title}
    </Text>
  );
}

export function TableBlock({ section, doc }: { section: TableSection; doc: ReportDocument }) {
  const totalWeight = section.columns.reduce((sum, column) => sum + (column.weight ?? 1), 0);
  const width = (weight = 1) => `${(weight / totalWeight) * 100}%`;
  const cells = (values: Record<string, unknown>, bold: boolean) =>
    section.columns.map((column) => {
      const raw = values[column.key];
      const value = typeof raw === "string" || typeof raw === "number" ? raw : null;
      return (
        <Text
          key={column.key}
          style={[
            s.cell,
            { width: width(column.weight) },
            isNumericFormat(column.format) ? s.right : {},
            bold ? s.boldCell : {},
          ]}
        >
          {formatCell(value, column.format, doc.locale, doc.labels.hoursUnit)}
        </Text>
      );
    });
  return (
    <View style={s.section}>
      <SectionTitle title={section.title} />
      {section.rows.length === 0 ? (
        <Text style={s.empty}>{section.empty}</Text>
      ) : (
        <View style={s.table}>
          <View style={[s.row, s.headRow]} fixed>
            {section.columns.map((column) => (
              <Text
                key={column.key}
                style={[
                  s.cell,
                  s.headCell,
                  { width: width(column.weight) },
                  isNumericFormat(column.format) ? s.right : {},
                ]}
              >
                {column.label}
              </Text>
            ))}
          </View>
          {section.rows.map((row, index) => (
            <View key={index} style={index % 2 === 1 ? [s.row, s.rowStriped] : s.row} wrap={false}>
              {cells(row, false)}
            </View>
          ))}
          {section.totals ? (
            <View style={[s.row, s.totalsRow]} wrap={false}>
              {cells(section.totals, true)}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function FieldsBlock({ section }: { section: FieldsSection }) {
  return (
    <View style={s.section}>
      <SectionTitle title={section.title} />
      <View style={s.fields}>
        {section.items.map((item) => (
          <View
            key={item.label}
            style={item.value.length > 60 ? s.fieldWide : s.field}
            wrap={false}
          >
            <Text style={s.fieldLabel}>{item.label}</Text>
            <Text style={s.fieldValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function TextBlock({ section }: { section: TextSection }) {
  return (
    <View style={s.section} wrap={section.paragraphs.length > SHORT_TEXT_PARAGRAPHS}>
      <SectionTitle title={section.title} />
      {section.paragraphs.map((paragraph, index) =>
        section.bullets ? (
          <View key={index} style={s.bulletRow} wrap={false}>
            <Text style={s.bullet}>{"•"}</Text>
            <Text style={s.bulletText}>{paragraph}</Text>
          </View>
        ) : (
          <Text key={index} style={s.paragraph}>
            {paragraph}
          </Text>
        ),
      )}
      {section.note ? <Text style={s.note}>{section.note}</Text> : null}
    </View>
  );
}

export function BarsBlock({ section, doc }: { section: BarsSection; doc: ReportDocument }) {
  const max = Math.max(0, ...section.items.map((item) => item.value));
  return (
    <View style={s.section} wrap={false}>
      <SectionTitle title={section.title} />
      {section.items.length === 0 ? <Text style={s.empty}>{section.empty}</Text> : null}
      {section.items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={s.barRow}>
          <Text style={s.barLabel}>{item.label}</Text>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${max === 0 ? 0 : (item.value / max) * 100}%` }]} />
          </View>
          <Text style={s.barValue}>
            {formatCell(item.value, section.format, doc.locale, doc.labels.hoursUnit)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function SectionBlock({ section, doc }: { section: ReportSection; doc: ReportDocument }) {
  switch (section.type) {
    case "table":
      return <TableBlock section={section} doc={doc} />;
    case "fields":
      return <FieldsBlock section={section} />;
    case "text":
      return <TextBlock section={section} />;
    case "bars":
      return <BarsBlock section={section} doc={doc} />;
  }
}
