import { createClient } from '@/lib/supabase-browser'
import type { AnnotationContent, NewWorksheetAnnotation, WorksheetAnnotation } from '@/types/worksheets'

export function worksheetChannelName(topicAssetId: string, studentId: string): string {
  return `worksheet:${topicAssetId}:${studentId}`
}

export async function fetchAnnotations(topicAssetId: string, studentId: string): Promise<WorksheetAnnotation[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('worksheet_annotations')
    .select('*')
    .eq('topic_asset_id', topicAssetId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as WorksheetAnnotation[]
}

export async function insertAnnotation(row: NewWorksheetAnnotation): Promise<WorksheetAnnotation> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('worksheet_annotations')
    .insert(row)
    .select('*')
    .single()
  if (error) throw error
  return data as unknown as WorksheetAnnotation
}

export async function updateAnnotationContent(id: string, content: AnnotationContent): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('worksheet_annotations')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteAnnotation(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('worksheet_annotations').delete().eq('id', id)
  if (error) throw error
}
