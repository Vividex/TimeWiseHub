import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  const buf = readFileSync(join(process.cwd(), 'public', 'app-icon.png'))
  const src = `data:image/png;base64,${buf.toString('base64')}`
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    (<img src={src} width={512} height={512} alt="" style={{ objectFit: 'cover' }} />),
    { width: 512, height: 512 },
  )
}
