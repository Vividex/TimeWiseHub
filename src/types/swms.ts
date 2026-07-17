export type SwmsAcknowledgment = { userId: string; acknowledgedAt: string }
export type SwmsDocument = {
  id: string
  name: string
  storagePath: string
  acknowledgments: SwmsAcknowledgment[]
}
