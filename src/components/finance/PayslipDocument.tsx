import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

type Props = {
  employeeName: string
  orgName: string
  periodStart: string
  periodEnd: string
  approvedSeconds: number
  hourlyRate: number
  gross: number
  superRate: number
  superAmount: number
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#0f172a' },
  header: { backgroundColor: '#0f172a', padding: 20, marginBottom: 24 },
  orgName: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  title: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  section: { marginBottom: 16 },
  label: { fontSize: 9, color: '#64748b', marginBottom: 2 },
  value: { fontSize: 11 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 6,
  },
  rowLabel: { color: '#374151' },
  rowValue: { fontWeight: 'bold' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    padding: 8,
    marginTop: 8,
  },
  totalLabel: { fontWeight: 'bold', fontSize: 11 },
  totalValue: { fontWeight: 'bold', fontSize: 13 },
})

function fmtAud(n: number) { return `$${n.toFixed(2)}` }

export default function PayslipDocument({
  employeeName, orgName, periodStart, periodEnd,
  approvedSeconds, hourlyRate, gross, superRate, superAmount,
}: Props) {
  const net = gross - superAmount
  const hours = (approvedSeconds / 3600).toFixed(2)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{orgName}</Text>
          <Text style={styles.title}>PAYSLIP</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>EMPLOYEE</Text>
          <Text style={styles.value}>{employeeName}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>PAY PERIOD</Text>
          <Text style={styles.value}>{periodStart} – {periodEnd}</Text>
        </View>

        <View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Regular Hours</Text>
            <Text style={styles.rowValue}>{hours} hrs</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Hourly Rate</Text>
            <Text style={styles.rowValue}>{fmtAud(hourlyRate)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Gross Pay</Text>
            <Text style={styles.rowValue}>{fmtAud(gross)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Superannuation ({(superRate * 100).toFixed(1)}%)</Text>
            <Text style={styles.rowValue}>{fmtAud(superAmount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Net Pay</Text>
            <Text style={styles.totalValue}>{fmtAud(net)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
