import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import type { ReportDocument } from "@/lib/reports/document";
import { registerReportFonts } from "@/lib/reports/pdf/fonts";
import {
  Footer,
  KpiTiles,
  ReportHeader,
  RunningHeader,
  SectionBlock,
} from "@/lib/reports/pdf/blocks";
import { pdfStyles } from "@/lib/reports/pdf/styles";

export function ReportPdf({ doc }: { doc: ReportDocument }) {
  return (
    <Document
      title={`${doc.title} · ${doc.periodLabel}`}
      author={doc.labels.company}
      creator={doc.labels.company}
      producer={doc.labels.company}
      language={doc.locale}
    >
      <Page size="A4" style={pdfStyles.page}>
        <RunningHeader doc={doc} />
        <ReportHeader doc={doc} />
        <KpiTiles kpis={doc.kpis} doc={doc} />
        {doc.sections.map((section) => (
          <SectionBlock key={section.id} section={section} doc={doc} />
        ))}
        <Footer doc={doc} />
      </Page>
    </Document>
  );
}

export async function renderReportPdf(doc: ReportDocument): Promise<Buffer> {
  registerReportFonts();
  return renderToBuffer(<ReportPdf doc={doc} />);
}
