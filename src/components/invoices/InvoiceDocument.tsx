import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer'

type Item = {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

type Props = {
  invoiceNumber: string
  letterhead: string
  clientName: string
  dueDate: string | null
  currency: string
  items: Item[]
  subtotal: number
  paymentLines: string[]
  hasPaymentDetails: boolean
  logoUrl?: string
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#0f172a' },
  header: { backgroundColor: '#0f172a', padding: 20, marginBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orgName: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  invoiceTitle: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  invoiceNumber: { fontSize: 13, fontWeight: 'bold', color: 'white', textAlign: 'right' },
  metaRow: { flexDirection: 'row', gap: 32, marginBottom: 24 },
  metaBlock: { flex: 1 },
  label: { fontSize: 8, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 11, color: '#0f172a' },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 6, marginBottom: 4 },
  colDesc: { flex: 3, fontSize: 9, fontWeight: 'bold', color: '#64748b' },
  colQty: { flex: 1, fontSize: 9, fontWeight: 'bold', color: '#64748b', textAlign: 'right' },
  colPrice: { flex: 1, fontSize: 9, fontWeight: 'bold', color: '#64748b', textAlign: 'right' },
  colAmount: { flex: 1, fontSize: 9, fontWeight: 'bold', color: '#64748b', textAlign: 'right' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', paddingVertical: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 12, marginTop: 4 },
  totalLabel: { fontSize: 11, fontWeight: 'bold', color: '#0f172a', marginRight: 24 },
  totalValue: { fontSize: 13, fontWeight: 'bold', color: '#0f172a' },
  paymentBox: { backgroundColor: '#f8fafc', borderRadius: 4, padding: 12, marginTop: 24 },
  paymentTitle: { fontSize: 9, fontWeight: 'bold', color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  paymentLine: { fontSize: 10, color: '#374151', marginBottom: 2 },
})

function fmtMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`
}

export default function InvoiceDocument({
  invoiceNumber, letterhead, clientName, dueDate, currency,
  items, subtotal, paymentLines, hasPaymentDetails, logoUrl,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {logoUrl && (
              <Image src={logoUrl} style={{ width: 60, marginBottom: 6 }} />
            )}
            <Text style={styles.orgName}>{letterhead}</Text>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
          </View>
          <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Bill To</Text>
            <Text style={styles.value}>{clientName}</Text>
          </View>
          {dueDate && (
            <View style={styles.metaBlock}>
              <Text style={styles.label}>Due Date</Text>
              <Text style={styles.value}>{dueDate}</Text>
            </View>
          )}
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Currency</Text>
            <Text style={styles.value}>{currency}</Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Description</Text>
          <Text style={styles.colQty}>Qty</Text>
          <Text style={styles.colPrice}>Unit Price</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>

        {items.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.colDesc}>{item.description}</Text>
            <Text style={styles.colQty}>{Number(item.quantity).toFixed(2)}</Text>
            <Text style={styles.colPrice}>{Number(item.unitPrice).toFixed(2)}</Text>
            <Text style={styles.colAmount}>{fmtMoney(item.amount, currency)}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{fmtMoney(subtotal, currency)}</Text>
        </View>

        {hasPaymentDetails && paymentLines.length > 0 && (
          <View style={styles.paymentBox}>
            <Text style={styles.paymentTitle}>Bank Transfer Details</Text>
            {paymentLines.map((line, i) => (
              <Text key={i} style={styles.paymentLine}>{line}</Text>
            ))}
          </View>
        )}

      </Page>
    </Document>
  )
}
