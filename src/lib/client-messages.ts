const CLIENT_MESSAGE_ADDRESS_RE = /client-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i

function inboundDomain(): string {
  const domain = process.env.RESEND_INBOUND_DOMAIN
  if (!domain) throw new Error('RESEND_INBOUND_DOMAIN is not configured')
  return domain
}

/**
 * The business-branded, per-client address a client's replies get routed back through.
 * Display-name-wrapped so a client inspecting the address sees the business's name (org or
 * individual), not a cryptic string — that identity is the "hero" here, TimeWiseHub's
 * own domain is an invisible-as-possible implementation detail underneath it.
 */
export function buildReplyToAddress(clientId: string, senderName: string): string {
  return `"${senderName.replace(/"/g, '')}" <client-${clientId}@${inboundDomain()}>`
}

/**
 * Extracts the client UUID from a `client-<uuid>@...` address. Not anchored to the start
 * of the string — inbound webhook `to` values are documented as bare addresses, but this
 * stays robust if a display-name-wrapped form ever shows up instead.
 */
export function parseClientIdFromAddress(address: string): string | null {
  const match = address.match(CLIENT_MESSAGE_ADDRESS_RE)
  return match ? match[1] : null
}
