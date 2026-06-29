# Phase 28 — Automated Payroll + Recurring Expenses

## Goal
1. Daily cron materialises due recurring expense rows (advances `next_billing_date`).
2. Weekly cron auto-runs pay on day (weekStartDay+2) from approved timesheets.
3. PDF payslip generated per employee after each auto pay run, stored in `payslips` bucket.

## Key decisions
- Pay cron fires daily; self-gates on `todayUTCDay === (org.pay_week_start_day + 2) % 7`.
- Recurring expense cron: for each template row where `is_recurring=true` AND `next_billing_date <= today`:
  INSERT concrete child row (`expense_date=next_billing_date`, `is_recurring=false`, `next_billing_date=null`);
  UPDATE template: advance `next_billing_date` by `recurrence_interval`.
- PDF: `@react-pdf/renderer` — server-only, free, MIT. Already installed by conductor (C-1).
- Payslip storage bucket: `payslips` (not `receipts`) — confirmed from PayslipUpload component.
- Payslip file path: `{user_id}/{pay_run_id}.pdf`
- `payslips.uploaded_by`: set to org owner's user_id (fetch from organisation_members role='owner'), fallback to employee user_id.
- No new DB migration needed — all tables/columns already exist.
- Auth for crons: existing `CRON_SECRET` Bearer pattern (same as timesheet-autosubmit).
- Both new crons share the `0 1 * * *` Vercel schedule (daily 1am UTC = 11am AEST); they self-gate internally.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node).
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- Use `as unknown as T` cast for all Supabase FK join types (CLAUDE.md requirement).
- Use `createServiceClient()` (not `createClient()`) for all cron and server routes.
- Do NOT add `'use client'` to PayslipDocument — it is server-side rendered.
- Do NOT add `'use client'` to any cron or API route.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (no Codex dispatch needed).
- No DB migration needed for this phase.
- The `payslips` storage bucket already exists.

---

## C-1 — Install @react-pdf/renderer

*Conductor only (no Codex dispatch):*
- [ ] Run `pnpm add @react-pdf/renderer`
- [ ] Verify `pnpm run build` passes clean

---

## C-2 — Recurring expense materialisation cron

*Codex edits:*
- [ ] Create `src/app/api/cron/process-recurring-expenses/route.ts`

```
GET handler. Use isAuthorized() — copy exact implementation from
src/app/api/cron/timesheet-autosubmit/route.ts (CRON_SECRET Bearer pattern).

Use createServiceClient() throughout.

const now = new Date()
const todayStr = now.toISOString().slice(0, 10)

1. Query expenses: is_recurring=true AND next_billing_date <= todayStr
   SELECT: id, org_id, user_id, amount, currency, category_id, description,
           recurrence_interval, next_billing_date

2. For each row:
   a. INSERT into expenses:
      { org_id, user_id, amount, currency, category_id, description,
        expense_date: row.next_billing_date,
        receipt_path: null, status: 'draft',
        is_recurring: false, recurrence_interval: null, next_billing_date: null }
   b. Compute nextDate = calcNextBillingDate(row.next_billing_date, row.recurrence_interval)
   c. UPDATE expenses SET next_billing_date = nextDate WHERE id = row.id

calcNextBillingDate(from: string, interval: string): string {
  const d = new Date(from)
  switch (interval) {
    case 'weekly':      d.setDate(d.getDate() + 7); break
    case 'fortnightly': d.setDate(d.getDate() + 14); break
    case 'monthly':     d.setMonth(d.getMonth() + 1); break
    case 'annually':    d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString().slice(0, 10)
}

Return NextResponse.json({ ok: true, processed: N, date: todayStr })
```

---

## C-3 — PayslipDocument component + generatePayslip utility

*Codex edits:*
- [ ] Create `src/components/finance/PayslipDocument.tsx`

```
NO 'use client'. Server-side React PDF component.

Imports from '@react-pdf/renderer': Document, Page, View, Text, StyleSheet

Props type:
{
  employeeName: string
  orgName: string
  periodStart: string   // YYYY-MM-DD
  periodEnd: string     // YYYY-MM-DD
  approvedSeconds: number
  hourlyRate: number
  gross: number
  superRate: number
  superAmount: number
}

net = gross - superAmount
hours = (approvedSeconds / 3600).toFixed(2)
fmtAud = (n: number) => `$${n.toFixed(2)}`

Layout (StyleSheet):
- page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10 }
- header: { backgroundColor: '#0f172a', color: 'white', padding: 20, marginBottom: 24 }
- orgName: { fontSize: 18, fontWeight: 'bold', color: 'white' }
- title: { fontSize: 11, color: '#94a3b8', marginTop: 4 }
- section: { marginBottom: 16 }
- label: { fontSize: 9, color: '#64748b', marginBottom: 2 }
- value: { fontSize: 11, color: '#0f172a' }
- row: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.5,
         borderBottomColor: '#e2e8f0', paddingVertical: 6 }
- rowLabel: { color: '#374151' }
- rowValue: { fontWeight: 'bold', color: '#0f172a' }
- totalRow: { flexDirection: 'row', justifyContent: 'space-between',
              backgroundColor: '#f8fafc', padding: 8, marginTop: 8 }

Structure:
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
        <Text style={{ fontWeight: 'bold' }}>Net Pay</Text>
        <Text style={{ fontWeight: 'bold', fontSize: 13 }}>{fmtAud(net)}</Text>
      </View>
    </View>
  </Page>
</Document>
```

- [ ] Create `src/lib/payroll/generatePayslip.ts`

```
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import PayslipDocument from '@/components/finance/PayslipDocument'
import type { SupabaseClient } from '@supabase/supabase-js'

type GeneratePayslipArgs = {
  supabase: SupabaseClient
  payRunId: string
  userId: string
  orgId: string
  orgName: string
  employeeName: string
  periodStart: string
  periodEnd: string
  approvedSeconds: number
  hourlyRate: number
  gross: number
  superRate: number
  superAmount: number
  uploadedBy: string
}

export async function generateAndStorePayslip(args: GeneratePayslipArgs): Promise<string | null> {
  const {
    supabase, payRunId, userId, orgId, orgName, employeeName,
    periodStart, periodEnd, approvedSeconds, hourlyRate, gross,
    superRate, superAmount, uploadedBy,
  } = args

  const buffer = await renderToBuffer(
    React.createElement(PayslipDocument, {
      employeeName, orgName, periodStart, periodEnd,
      approvedSeconds, hourlyRate, gross, superRate, superAmount,
    })
  )

  const filePath = `${userId}/${payRunId}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('payslips')
    .upload(filePath, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) {
    console.error('Payslip upload error:', uploadErr)
    return null
  }

  const label = `Week ending ${periodEnd}`
  await supabase.from('payslips').upsert({
    org_id: orgId,
    user_id: userId,
    label,
    pay_date: periodEnd,
    file_path: filePath,
    uploaded_by: uploadedBy,
  }, { onConflict: 'org_id,user_id,pay_date' }).throwOnError()

  return filePath
}
```

NOTE: The `onConflict: 'org_id,user_id,pay_date'` upsert prevents duplicate payslip rows if the cron re-runs. If the payslips table lacks this unique constraint the upsert will just INSERT — that is acceptable.

---

## C-4 — On-demand PDF route

*Codex edits:*
- [ ] Create `src/app/api/pay-statements/[id]/payslip/route.ts`

```
export const runtime = 'nodejs'

GET handler. Auth: Supabase session (createClient()) — must be org owner/admin.

1. Fetch pay_statement by params.id:
   SELECT id, pay_run_id, org_id, user_id, period_start, period_end,
          approved_seconds, hourly_rate, gross, super_rate, super_amount
   Also fetch profile: profiles!pay_statements_user_id_fkey(full_name, email)
   Also fetch org: organisations!pay_statements_org_id_fkey(name)
   Use service client for the data fetch.

2. Auth check: verify calling user is org member with role in ['owner','admin','manager'].

3. Find org owner user_id for uploaded_by:
   SELECT user_id FROM organisation_members WHERE org_id=? AND role='owner' LIMIT 1
   Fallback to statement.user_id if none found.

4. Call generateAndStorePayslip(args) from @/lib/payroll/generatePayslip

5. Get signed URL (600s expiry):
   supabase.storage.from('payslips').createSignedUrl(filePath, 600)

6. Return NextResponse.redirect(signedUrl)
```

---

## C-5 — Auto pay run triggered on last timesheet approval

*Codex edits:*
- [ ] Create `src/app/api/timesheets/check-and-run-pay/route.ts`

```
POST handler. Auth: Supabase session (createClient()) — must be org member.
Use createServiceClient() for all DB writes.
Import { computeGross, computeSuper } from '@/lib/payroll/compute'
Import { generateAndStorePayslip } from '@/lib/payroll/generatePayslip'

Body: { orgId: string, weekStart: string }

Steps:
1. Verify caller session via createClient().auth.getUser()
2. Verify caller is org member (role in owner/admin/manager) via service client
3. Check remaining submitted timesheets for this org + weekStart:
   SELECT COUNT(*) FROM timesheets WHERE org_id=? AND week_start=? AND status='submitted'
   If count > 0: return { triggered: false, remaining: count }

4. Fetch all approved timesheets for org + weekStart:
   SELECT user_id, total_seconds FROM timesheets WHERE org_id=? AND week_start=? AND status='approved'
   If none: return { triggered: false, remaining: 0 }

5. Fetch org: SELECT id, super_rate, name, pay_week_start_day FROM organisations WHERE id=?
6. Find org owner for uploaded_by:
   SELECT user_id FROM organisation_members WHERE org_id=? AND role='owner' LIMIT 1

7. Compute period: periodStart = weekStart, periodEnd = date 6 days after weekStart (inclusive Sunday)
   const end = new Date(weekStart + 'T00:00:00Z')
   end.setUTCDate(end.getUTCDate() + 6)
   const periodEnd = end.toISOString().slice(0,10)

8. Create pay_run row via service client:
   INSERT pay_runs { org_id, period_start: weekStart, period_end: periodEnd, created_by: uploadedBy }
   If duplicate (error code '23505'): return { triggered: false, reason: 'already_ran' }

9. Fetch org members with hourly_rate + profiles:
   organisation_members WHERE org_id=? IN user_ids

10. For each approved timesheet user:
    - Skip if no hourly_rate
    - Compute gross = computeGross(seconds, rate), super = computeSuper(gross, superRate)
    - INSERT pay_statements row
    - Call generateAndStorePayslip(...)

11. Return { triggered: true, statementsCreated: N, skipped: M }
```

- [ ] Edit `src/components/time/ManagerTimesheetView.tsx` — after the successful timesheet approval update (after the `.eq('id', id)` call and before `setSavingId(null)`):
```
// After successful approval only (not rejection):
if (status === 'approved') {
  // Find the approved timesheet's week_start from local state
  const ts = timesheets.find(t => t.id === id)
  if (ts) {
    fetch('/api/timesheets/check-and-run-pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, weekStart: ts.week_start }),
    })
      .then(r => r.json())
      .then(d => { if (d.triggered) console.log('Pay run triggered:', d) })
      .catch(err => console.error('Pay run check failed:', err))
  }
}
```
Do NOT await this call — fire and forget so the UI isn't blocked.

---

## C-6 — Update vercel.json

*Codex edits:*
- [ ] Edit `vercel.json` — add ONE new entry to the `"crons"` array (auto-pay is now event-driven, not a cron):
  ```json
  { "path": "/api/cron/process-recurring-expenses", "schedule": "0 1 * * *" }
  ```

---

## Acceptance checklist
- [ ] C-1: @react-pdf/renderer installed, build passes
- [ ] C-2: Recurring expense cron creates child rows and advances next_billing_date
- [ ] C-3: PayslipDocument + generatePayslip utility exist and build clean
- [ ] C-4: GET /api/pay-statements/[id]/payslip generates PDF, uploads to storage, redirects
- [ ] C-5: check-and-run-pay route fires after last approval; ManagerTimesheetView hooks it
- [ ] C-6: vercel.json includes recurring-expenses cron

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task.
