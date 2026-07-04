import { createHmac, timingSafeEqual } from 'crypto'

export function verifyResendWebhookSignature(opts: {
  id: string
  timestamp: string
  signatureHeader: string
  rawBody: string
  secret: string
}): boolean {
  const { id, timestamp, signatureHeader, rawBody, secret } = opts

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signedContent = `${id}.${timestamp}.${rawBody}`
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64')
  const expectedBuf = Buffer.from(expected, 'base64')

  for (const candidate of signatureHeader.split(' ')) {
    const [version, sig] = candidate.split(',')
    if (version !== 'v1' || !sig) continue
    const sigBuf = Buffer.from(sig, 'base64')
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return true
    }
  }
  return false
}
