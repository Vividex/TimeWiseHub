import type { HrcwCategory, JsaHazard, SwmsRow } from '@/types/swms'
import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'

export type SwmsContentSignature = {
  name: string
  acknowledgedAt: string
  signatureUrl: string | null
}

type AuthoredProps = {
  source: 'authored'
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
  signatures: SwmsContentSignature[]
}

type UploadedProps = {
  source: 'uploaded'
  name: string
  openUrl: string | null
}

type Props = AuthoredProps | UploadedProps

function RowsTable({ rows }: { rows: SwmsRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 dark:border-slate-800">
          <th className="py-2 pr-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Job Step</th>
          <th className="py-2 pr-4 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Hazard</th>
          <th className="py-2 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Control Measure</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="py-3 pr-4 align-top text-gray-900 dark:text-slate-100">{row.jobStep}</td>
            <td className="py-3 pr-4 align-top text-gray-700 dark:text-slate-300">{row.hazard}</td>
            <td className="py-3 align-top text-gray-700 dark:text-slate-300">{row.control}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function SwmsDocumentContent(props: Props) {
  if (props.source === 'uploaded') {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">
          This document was uploaded as a file rather than built in the SWMS/JSA builder, so it can&apos;t be shown inline.
        </p>
        {props.openUrl ? (
          <a
            href={props.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] px-4 py-2 text-sm font-semibold"
          >
            Open document — {props.name}
          </a>
        ) : (
          <p className="mt-4 text-sm font-semibold text-red-600">Couldn&apos;t generate a link to this file. Try again shortly.</p>
        )}
      </div>
    )
  }

  const {
    docType, category, categories, supervisor, preparedBy, date, rows, ppe, consultedNames,
    whoAtRisk, equipment, emergencyProcedures, signatures, projectName, projectLabel,
  } = props
  const title = docType === 'jsa' ? 'Job Safety Analysis' : 'Safe Work Method Statement'
  const categoryLabel = docType === 'jsa'
    ? categories.map(c => JSA_HAZARD_LABELS[c]).join(' + ')
    : (category ? HRCW_CATEGORY_LABELS[category] : '')
  const additionalRows = rows.filter(r => !r.category)

  return (
    <div className="space-y-8 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <p className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 text-sm font-semibold text-cyan-600 dark:text-cyan-400">{categoryLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 border-t border-gray-100 pt-6 dark:border-slate-800">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{projectLabel}</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{projectName}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Supervisor</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{supervisor}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Prepared By</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{preparedBy}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Date</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{date}</p>
        </div>
      </div>

      {docType === 'jsa' && (whoAtRisk || equipment || emergencyProcedures) && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 border-t border-gray-100 pt-6 dark:border-slate-800">
          {whoAtRisk && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Who Is At Risk</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{whoAtRisk}</p>
            </div>
          )}
          {equipment && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Plant / Equipment</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{equipment}</p>
            </div>
          )}
          {emergencyProcedures && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Emergency Procedures</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{emergencyProcedures}</p>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-100 pt-6 dark:border-slate-800">
        <p className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-100">Job Steps, Hazards &amp; Controls</p>
        {docType === 'jsa' && categories.length > 0 ? (
          <div className="space-y-6">
            {categories.map(cat => {
              const group = rows.filter(r => r.category === cat)
              if (group.length === 0) return null
              return (
                <div key={cat}>
                  <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">{JSA_HAZARD_LABELS[cat]}</p>
                  <RowsTable rows={group} />
                </div>
              )
            })}
            {additionalRows.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">Additional Steps</p>
                <RowsTable rows={additionalRows} />
              </div>
            )}
          </div>
        ) : (
          <RowsTable rows={rows} />
        )}
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-800">
        <p className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-100">PPE Required</p>
        <div className="flex flex-wrap gap-2">
          {ppe.map((item, i) => (
            <span key={i} className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700 dark:bg-slate-800 dark:text-slate-300">{item}</span>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-800">
        <p className="mb-2 text-lg font-bold text-gray-900 dark:text-slate-100">Consultation</p>
        <p className="text-sm text-gray-600 dark:text-slate-400">
          {consultedNames.length > 0
            ? `Consulted in developing this ${docType === 'jsa' ? 'JSA' : 'SWMS'}: ${consultedNames.join(', ')}`
            : 'No crew members recorded as consulted.'}
        </p>
      </div>

      <div className="border-t border-gray-100 pt-6 dark:border-slate-800">
        <p className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-100">Acknowledgments</p>
        {signatures.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-slate-400">No crew members have acknowledged this document yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50 dark:divide-slate-800">
            {signatures.map((sig, i) => (
              <li key={i} className="flex items-center gap-4 py-3">
                <span className="min-w-[140px] text-sm font-bold text-gray-900 dark:text-slate-100">{sig.name}</span>
                {sig.signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sig.signatureUrl} alt={`${sig.name}'s signature`} className="h-10 max-w-[160px] object-contain" />
                ) : (
                  <span className="h-10 w-[160px] border-b border-gray-200 dark:border-slate-700" />
                )}
                <span className="text-xs text-gray-500 dark:text-slate-500">{sig.acknowledgedAt}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
