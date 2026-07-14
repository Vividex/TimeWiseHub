// src/types/whiteboard.ts
export type WhiteboardObjectType = 'text_box' | 'stroke' | 'sticker'

export type WhiteboardTextBoxContent = { kind: 'text_box'; text: string }
export type WhiteboardStrokeContent = { kind: 'stroke'; points: [number, number][]; color: string; strokeWidth: number }
export type WhiteboardStickerContent =
  | { kind: 'sticker_builtin'; id: string }
  | { kind: 'sticker_custom'; storagePath: string }

export type WhiteboardObjectContent = WhiteboardTextBoxContent | WhiteboardStrokeContent | WhiteboardStickerContent

export type WhiteboardObject = {
  id: string
  session_id: string
  object_type: WhiteboardObjectType
  x: number
  y: number
  width: number
  height: number
  content: WhiteboardObjectContent
  created_by: string
  created_at: string
  updated_at: string
}

export type NewWhiteboardObject = Omit<WhiteboardObject, 'id' | 'created_at' | 'updated_at'>
