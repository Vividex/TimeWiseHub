import { HRCW_CATEGORY_LABELS } from '@/lib/swms-templates'
import { JSA_HAZARD_LABELS } from '@/lib/jsa-templates'
import type { HrcwCategory, JsaHazard } from '@/types/swms'

/** `project_swms_documents.category` is a single HRCW key for SWMS, or a
 *  comma-joined list of JsaHazard keys for JSA (a JSA can cover several
 *  hazard categories). Resolves either shape to a human-readable label. */
export function resolveSwmsCategoryLabel(category: string | null, docType: 'swms' | 'jsa'): string | null {
  if (!category) return null
  if (docType === 'swms') return HRCW_CATEGORY_LABELS[category as HrcwCategory] ?? category
  return category
    .split(',')
    .map(key => JSA_HAZARD_LABELS[key as JsaHazard] ?? key)
    .join(' + ')
}
