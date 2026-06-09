import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  const logoBuffer = readFileSync(join(process.cwd(), 'public', 'logo-transparent.png'))
  const logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background:
            'radial-gradient(circle at 50% 45%, #22d3ee 0%, #0ea5e9 28%, #0284c7 55%, #1e40af 80%, #172554 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 88,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={390} height={390} alt="" style={{ objectFit: 'contain' }} />
      </div>
    ),
    { width: 512, height: 512 },
  )
}
