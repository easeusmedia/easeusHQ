import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { PROVIDER, runs, type ContractDetails, type Section } from "./contract.ts";

// The contract as a black-and-white A4 PDF, to the SOP's rendering spec (§6):
// Helvetica, 25mm side margins, section heads with their own number column,
// tables with a light fill for headers.

const mm = (n: number) => n * 2.8346;
const BLK = "#000000";
const BODY = "#222222";
const GRAY = "#888888";
const LTGRAY = "#cccccc";
const BGFILL = "#f5f5f5";
const ALT_ROW = "#fafafa";

const s = StyleSheet.create({
  page: { paddingTop: mm(24), paddingBottom: mm(24), paddingHorizontal: mm(25), fontFamily: "Helvetica", color: BODY },
  title: { fontFamily: "Helvetica-Bold", fontSize: 22, lineHeight: 28 / 22, color: BLK },
  subtitle: { fontSize: 10, lineHeight: 14 / 10, color: GRAY, marginTop: 2 },
  date: { fontSize: 9, lineHeight: 12 / 9, color: GRAY, marginTop: 2 },
  ruleThick: { borderBottomWidth: 2, borderBottomColor: BLK, marginTop: 10 },
  ruleThin: { borderBottomWidth: 0.4, borderBottomColor: BLK, marginTop: 2 },
  head: { flexDirection: "row", marginTop: mm(8), paddingBottom: 3, borderBottomWidth: 0.6, borderBottomColor: BLK, marginBottom: 7 },
  headNum: { width: mm(8), fontFamily: "Helvetica-Bold", fontSize: 12, lineHeight: 16 / 12, color: BLK },
  headTitle: { fontFamily: "Helvetica-Bold", fontSize: 12, lineHeight: 16 / 12, color: BLK },
  body: { fontSize: 9.5, lineHeight: 14.5 / 9.5, textAlign: "justify", marginBottom: 6 },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 18, fontSize: 9.5, lineHeight: 14.5 / 9.5, paddingLeft: 6 },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 14.5 / 9.5, textAlign: "justify" },
  table: { borderWidth: 0.5, borderColor: LTGRAY, marginVertical: 6 },
  row: { flexDirection: "row" },
  th: { backgroundColor: BGFILL, fontFamily: "Helvetica-Bold", fontSize: 8.5, lineHeight: 12 / 8.5, paddingVertical: 5, paddingHorizontal: 8, color: BLK },
  td: { fontSize: 9, lineHeight: 13 / 9, paddingVertical: 5, paddingHorizontal: 8 },
  divider: { borderLeftWidth: 0.5, borderLeftColor: LTGRAY },
  rowRule: { borderTopWidth: 0.5, borderTopColor: LTGRAY },
  feeBox: { backgroundColor: BGFILL, borderWidth: 0.5, borderColor: LTGRAY, paddingVertical: 10, marginVertical: 6, alignItems: "center" },
  feeFigure: { fontFamily: "Helvetica-Bold", fontSize: 15, lineHeight: 20 / 15, color: BLK },
  feeSub: { fontSize: 9, color: GRAY, marginTop: 2 },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  sigCol: { width: "48%" },
  sigBox: { width: "87.5%", borderWidth: 0.5, borderColor: LTGRAY, padding: 10 },
  sigLabel: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: GRAY, marginBottom: 6 },
  sigName: { fontFamily: "Helvetica-Bold", fontSize: 10.5, lineHeight: 14 / 10.5, color: BLK },
  sigLine: { fontSize: 9, marginTop: mm(10), flexDirection: "row", alignItems: "flex-end" },
  sigBlank: { flex: 1, borderBottomWidth: 0.5, borderBottomColor: BLK, marginLeft: 4, height: 14, justifyContent: "flex-end" },
  end: { marginTop: mm(10) },
  endText: { textAlign: "center", fontSize: 9, color: GRAY, marginTop: 6 },
  footer: { position: "absolute", left: mm(25), right: mm(25), bottom: mm(13), fontSize: 7, color: GRAY },
  footerRule: { position: "absolute", left: mm(25), right: mm(25), bottom: mm(18), borderTopWidth: 0.4, borderTopColor: LTGRAY },
});

function Rich({ text, style }: { text: string; style: Style }) {
  return (
    <Text style={style}>
      {runs(text).map((r, i) => (
        <Text key={i} style={r.bold ? { fontFamily: "Helvetica-Bold" } : r.italic ? { fontFamily: "Helvetica-Oblique" } : {}}>
          {r.text}
        </Text>
      ))}
    </Text>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.filter(Boolean).map((l, i) => (
        <Rich key={i} text={l} style={i === 0 ? { ...s.td, paddingVertical: 0, paddingHorizontal: 0, fontFamily: "Helvetica-Bold" } : { ...s.td, paddingVertical: 0, paddingHorizontal: 0 }} />
      ))}
    </>
  );
}

// A signature box: the party, the name, and lines to sign and date on
function SignatureBox({ label, lines }: { label: string; lines: string[] }) {
  return (
    <View style={s.sigBox}>
      <Text style={s.sigLabel}>{label}</Text>
      <Text style={s.sigName}>{lines[0]}</Text>
      {lines.slice(1).map((l) => (
        <Text key={l} style={{ fontSize: 9, lineHeight: 13 / 9 }}>
          {l}
        </Text>
      ))}
      <View style={s.sigLine}>
        <Text>Signature:</Text>
        <View style={s.sigBlank} />
      </View>
      <View style={{ ...s.sigLine, marginTop: 10 }}>
        <Text>Date:</Text>
        <View style={s.sigBlank} />
      </View>
    </View>
  );
}

function Table({ name, v, d }: { name: string; v: Record<string, string>; d: ContractDetails }) {
  if (name === "parties") {
    return (
      <View style={s.table} wrap={false}>
        <View style={s.row}>
          <Text style={{ ...s.th, width: "50%" }}>SERVICE PROVIDER</Text>
          <Text style={{ ...s.th, width: "50%", ...s.divider }}>CLIENT</Text>
        </View>
        <View style={{ ...s.row, ...s.rowRule }}>
          <View style={{ ...s.td, width: "50%" }}>
            <Lines lines={[PROVIDER.name, `Represented by: ${PROVIDER.person}`, `GST: ${PROVIDER.gst}`, PROVIDER.location]} />
          </View>
          <View style={{ ...s.td, width: "50%", ...s.divider }}>
            <Lines
              lines={[
                v.CLIENT_ENTITY,
                v.CLIENT_TRADING_NAME_LINE,
                `Represented by: ${v.CLIENT_SIGNATORY_LIST}`,
                ...d.signatories.map((x) => (x.email.trim() ? `Email: ${x.email.trim()}` : "")),
                v.CLIENT_ADDRESS,
                v.CLIENT_COUNTRY,
              ]}
            />
          </View>
        </View>
      </View>
    );
  }
  if (name === "fee") {
    return (
      <View style={s.feeBox} wrap={false}>
        <Text style={s.feeFigure}>{v.MONTHLY_FEE} / Month</Text>
        <Text style={s.feeSub}>
          {v.TERM_LENGTH.charAt(0).toUpperCase() + v.TERM_LENGTH.slice(1)} Contract · Total Value: {v.TOTAL_VALUE}
        </Text>
      </View>
    );
  }
  if (name === "scope") {
    const rows = d.deliverables.filter((x) => x.name.trim() && x.detail.trim());
    return (
      <View style={s.table}>
        <View style={s.row}>
          <Text style={{ ...s.th, width: "40%" }}>DELIVERABLE</Text>
          <Text style={{ ...s.th, width: "60%", ...s.divider }}>DETAILS</Text>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={{ ...s.row, ...s.rowRule, backgroundColor: i % 2 ? ALT_ROW : "#ffffff" }} wrap={false}>
            <Text style={{ ...s.td, width: "40%", fontFamily: "Helvetica-Bold" }}>{r.name.trim()}</Text>
            <Text style={{ ...s.td, width: "60%", ...s.divider }}>{r.detail.trim()}</Text>
          </View>
        ))}
      </View>
    );
  }
  // signatures: ours, then the client(s)
  const clients = d.signatories.filter((x) => x.name.trim());
  return (
    <View wrap={false}>
      <View style={s.sigRow}>
        <View style={s.sigCol}>
          <SignatureBox label="SERVICE PROVIDER" lines={[PROVIDER.name, `Name: ${PROVIDER.person}`]} />
        </View>
        <View style={{ ...s.sigCol, alignItems: "flex-end" }}>
          <SignatureBox label="CLIENT" lines={[v.CLIENT_ENTITY, `Name: ${clients[0]?.name.trim() ?? ""}`]} />
        </View>
      </View>
      {clients[1] && (
        <View style={{ ...s.sigRow, justifyContent: "flex-end", marginTop: 12 }}>
          <View style={{ ...s.sigCol, alignItems: "flex-end" }}>
            <SignatureBox label="CLIENT" lines={[v.CLIENT_ENTITY, `Name: ${clients[1].name.trim()}`]} />
          </View>
        </View>
      )}
    </View>
  );
}

export async function contractPdf({
  sections,
  values: v,
  details: d,
}: {
  sections: Section[];
  values: Record<string, string>;
  details: ContractDetails;
}): Promise<Uint8Array> {
  const doc = (
    <Document title={`Service Agreement · ${v.CLIENT_ENTITY}`} author="Easeus Media">
      <Page size="A4" style={s.page}>
        <View fixed style={s.footerRule} />
        <View fixed style={{ ...s.footer, flexDirection: "row", justifyContent: "space-between" }}>
          <Text>Easeus Media · Service Agreement · {v.CLIENT_ENTITY}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

        <Text style={s.title}>SERVICE AGREEMENT</Text>
        <Text style={s.subtitle}>Easeus Media · {v.CLIENT_ENTITY}</Text>
        <Text style={s.date}>{v.SIGNING_DATE}</Text>
        <View style={s.ruleThick} />
        <View style={s.ruleThin} />

        {sections.map((sec) => (
          <View key={sec.id}>
            {/* a heading never sits alone at the foot of a page */}
            <View style={s.head} minPresenceAhead={40}>
              <Text style={s.headNum}>{sec.number}.</Text>
              <Text style={s.headTitle}>{sec.title}</Text>
            </View>
            {sec.blocks.map((b, i) =>
              b.kind === "p" ? (
                <Rich key={i} text={b.text} style={s.body} />
              ) : b.kind === "bullets" ? (
                <View key={i} style={{ marginBottom: 6 }}>
                  {b.items.map((item, j) => (
                    <View key={j} style={s.bullet}>
                      <Text style={s.bulletDot}>•</Text>
                      <Rich text={item} style={s.bulletText} />
                    </View>
                  ))}
                </View>
              ) : (
                <Table key={i} name={b.name} v={v} d={d} />
              )
            )}
          </View>
        ))}

        <View style={s.end} wrap={false}>
          <View style={s.ruleThick} />
          <View style={s.ruleThin} />
          <Text style={s.endText}>— End of Agreement —</Text>
        </View>
      </Page>
    </Document>
  );
  return new Uint8Array(await renderToBuffer(doc));
}
