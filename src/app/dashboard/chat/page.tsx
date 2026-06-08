import { Suspense } from 'react'
import ChatClient from '@/components/chat/ChatClient'

export default function ChatPage() {
  return (
    <div className="px-4 py-6 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={null}>
          <ChatClient />
        </Suspense>
      </div>
    </div>
  )
}
