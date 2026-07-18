import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { HrcwCategory, SwmsRow } from '@/types/swms'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'

type Props = {
  projectName: string
  category: HrcwCategory
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedNames: string[]
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
})

export default function SwmsDocumentPdf({
  projectName, category, supervisor, preparedBy, date, rows, ppe, consultedNames,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Safe Work Method Statement</Text>
          <Text style={styles.subtitle}>{HRCW_CATEGORY_LABELS[category]}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Project</Text>
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

        <Text style={styles.sectionTitle}>Job Steps, Hazards &amp; Controls</Text>
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

        <Text style={styles.sectionTitle}>PPE Required</Text>
        <View style={styles.chipRow}>
          {ppe.map((item, i) => (
            <Text key={i} style={styles.chip}>{item}</Text>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Consultation</Text>
        <Text style={styles.consultedList}>
          {consultedNames.length > 0 ? `Consulted in developing this SWMS: ${consultedNames.join(', ')}` : 'No crew members recorded as consulted.'}
        </Text>
      </Page>
    </Document>
  )
}
