export type WorksheetObjectType = 'text_box' | 'stroke' | 'sticker'

export type TextBoxContent = { kind: 'text_box'; text: string }
export type StrokeContent = { kind: 'stroke'; points: [number, number][]; color: string; strokeWidth: number }
export type StickerContent =
  | { kind: 'sticker_builtin'; id: string }
  | { kind: 'sticker_custom'; storagePath: string }

export type AnnotationContent = TextBoxContent | StrokeContent | StickerContent

export type WorksheetAnnotation = {
  id: string
  topic_asset_id: string
  student_id: string
  page_number: number
  object_type: WorksheetObjectType
  x: number
  y: number
  width: number
  height: number
  content: AnnotationContent
  created_by: string
  created_at: string
  updated_at: string
}

export type NewWorksheetAnnotation = Omit<WorksheetAnnotation, 'id' | 'created_at' | 'updated_at'>
