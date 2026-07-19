import type { SwmsAuthoredContent, JsaHazard } from '@/types/swms'

/** Pre-multi-category JSA documents stored a single `category` instead of a `categories`
 *  array. Every row in a document like that was unambiguously for that one hazard, so it
 *  can be safely upgraded to the current shape before rendering. SWMS content and JSA
 *  content already in the current shape pass through unchanged.
 *
 *  `raw` is typed as `SwmsAuthoredContent` for callers, but legacy DB rows don't actually
 *  conform to it (that's the whole reason this function exists) -- an intersection type
 *  strict enough to express "maybe has `category` instead of `categories`" collapses to
 *  `never` under the current discriminated union, so the runtime check below intentionally
 *  drops to `any`, same as the inline check this replaces used to. */
export function normalizeSwmsContent(raw: SwmsAuthoredContent): SwmsAuthoredContent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = raw as any
  if (content.docType === 'jsa' && !content.categories && content.category) {
    const category = content.category as JsaHazard
    return {
      ...content,
      categories: [category],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows: (content.rows ?? []).map((r: any) => ({ ...r, category })),
    } as SwmsAuthoredContent
  }
  return raw
}
