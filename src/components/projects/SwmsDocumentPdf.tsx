import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer'
import type { HrcwCategory, JsaHazard, SwmsRow } from '@/types/swms'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'

export type SwmsPdfSignature = {
  name: string
  acknowledgedAt: string
  signatureDataUri: string | null
}

type Props = {
  projectName: string
  projectLabel: string
  docType: 'swms' | 'jsa'
  category: HrcwCategory | null
  categories: JsaHazard[]
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedNames: string[]
  whoAtRisk?: string
  equipment?: string
  emergencyProcedures?: string
  signatures: SwmsPdfSignature[]
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 9, color: '#0f172a' },
  header: { backgroundColor: '#0f172a', padding: 20, marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  subtitle: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 24, marginBottom: 16, flexWrap: 'wrap' },
  metaBlock: { minWidth: 140 },
  label: { fontSize: 7, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 10, color: '#0f172a' },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', color: '#0f172a', marginTop: 16, marginBottom: 6 },
  groupTitle: { fontSize: 9, fontWeight: 'bold', color: '#334155', marginTop: 10, marginBottom: 4 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 4, marginBottom: 4 },
  colStep: { flex: 2, fontSize: 8, fontWeight: 'bold', color: '#64748b' },
  colHazard: { flex: 2, fontSize: 8, fontWeight: 'bold', color: '#64748b' },
  colControl: { flex: 3, fontSize: 8, fontWeight: 'bold', color: '#64748b' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', paddingVertical: 5 },
  cellStep: { flex: 2, fontSize: 8 },
  cellHazard: { flex: 2, fontSize: 8 },
  cellControl: { flex: 3, fontSize: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { backgroundColor: '#f1f5f9', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3, fontSize: 8 },
  consultedList: { fontSize: 9, color: '#374151' },
  signatureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', paddingVertical: 8 },
  signatureImage: { width: 90, height: 32, objectFit: 'contain' },
  signaturePlaceholder: { width: 90, height: 32, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  signatureName: { fontSize: 9, fontWeight: 'bold', color: '#0f172a', minWidth: 120 },
  signatureTimestamp: { fontSize: 8, color: '#64748b' },
})

function RowsTable({ rows }: { rows: SwmsRow[] }) {
  return (
    <>
      <View style={styles.tableHeader}>
        <Text style={styles.colStep}>Job Step</Text>
        <Text style={styles.colHazard}>Hazard</Text>
        <Text style={styles.colControl}>Control Measure</Text>
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.cellStep}>{row.jobStep}</Text>
          <Text style={styles.cellHazard}>{row.hazard}</Text>
          <Text style={styles.cellControl}>{row.control}</Text>
        </View>
      ))}
    </>
  )
}

export default function SwmsDocumentPdf({
  projectName, projectLabel, docType, category, categories, supervisor, preparedBy, date, rows, ppe, consultedNames,
  whoAtRisk, equipment, emergencyProcedures, signatures,
}: Props) {
  const title = docType === 'jsa' ? 'Job Safety Analysis' : 'Safe Work Method Statement'
  const categoryLabel = docType === 'jsa'
    ? categories.map(c => JSA_HAZARD_LABELS[c]).join(' + ')
    : (category ? HRCW_CATEGORY_LABELS[category] : '')
  const additionalRows = rows.filter(r => !r.category)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{categoryLabel}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>{projectLabel}</Text>
            <Text style={styles.value}>{projectName}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Supervisor</Text>
            <Text style={styles.value}>{supervisor}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Prepared By</Text>
            <Text style={styles.value}>{preparedBy}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{date}</Text>
          </View>
        </View>

        {docType === 'jsa' && (whoAtRisk || equipment || emergencyProcedures) && (
          <View style={styles.metaRow}>
            {whoAtRisk && (
              <View style={styles.metaBlock}>
                <Text style={styles.label}>Who Is At Risk</Text>
                <Text style={styles.value}>{whoAtRisk}</Text>
              </View>
            )}
            {equipment && (
              <View style={styles.metaBlock}>
                <Text style={styles.label}>Plant / Equipment</Text>
                <Text style={styles.value}>{equipment}</Text>
              </View>
            )}
            {emergencyProcedures && (
              <View style={styles.metaBlock}>
                <Text style={styles.label}>Emergency Procedures</Text>
                <Text style={styles.value}>{emergencyProcedures}</Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Job Steps, Hazards &amp; Controls</Text>
        {docType === 'jsa' && categories.length > 0 ? (
          <>
            {categories.map(cat => {
              const group = rows.filter(r => r.category === cat)
              if (group.length === 0) return null
              return (
                <View key={cat}>
                  <Text style={styles.groupTitle}>{JSA_HAZARD_LABELS[cat]}</Text>
                  <RowsTable rows={group} />
                </View>
              )
            })}
            {additionalRows.length > 0 && (
              <View>
                <Text style={styles.groupTitle}>Additional Steps</Text>
                <RowsTable rows={additionalRows} />
              </View>
            )}
          </>
        ) : (
          <RowsTable rows={rows} />
        )}

        <Text style={styles.sectionTitle}>PPE Required</Text>
        <View style={styles.chipRow}>
          {ppe.map((item, i) => (
            <Text key={i} style={styles.chip}>{item}</Text>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Consultation</Text>
        <Text style={styles.consultedList}>
          {consultedNames.length > 0 ? `Consulted in developing this ${docType === 'jsa' ? 'JSA' : 'SWMS'}: ${consultedNames.join(', ')}` : 'No crew members recorded as consulted.'}
        </Text>

        <Text style={styles.sectionTitle}>Acknowledgments</Text>
        {signatures.length === 0 && (
          <Text style={styles.consultedList}>No crew members have acknowledged this document yet.</Text>
        )}
        {signatures.map((sig, i) => (
          <View key={i} style={styles.signatureRow}>
            <Text style={styles.signatureName}>{sig.name}</Text>
            {sig.signatureDataUri ? (
              <Image src={sig.signatureDataUri} style={styles.signatureImage} />
            ) : (
              <View style={styles.signaturePlaceholder} />
            )}
            <Text style={styles.signatureTimestamp}>{sig.acknowledgedAt}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}
