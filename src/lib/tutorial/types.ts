export type TutorialContext = Record<string, string>

export type TutorialStep = {
  id: string
  title: string
  instructions: string
  target: (ctx: TutorialContext) => string
  fallbackTarget?: string
}
