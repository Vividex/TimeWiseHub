// src/hooks/useVoice.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Web Speech API types are not in all TS DOM libs — declare minimally here
interface SpeechRecognitionResult { readonly 0: { transcript: string } }
interface SpeechRecognitionResultList { readonly 0: SpeechRecognitionResult }
interface SpeechRecognitionEvent extends Event { readonly results: SpeechRecognitionResultList }
interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
interface SpeechRecognitionCtor {
  new(): SpeechRecognitionInstance
}

type VoiceState = 'idle' | 'listening' | 'error'

export function useVoice({
  onTranscript,
  enabled,
}: {
  onTranscript: (text: string) => void
  enabled: boolean
}) {
  const [state, setState] = useState<VoiceState>('idle')
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
    const SR = typeof window !== 'undefined' ? (w.SpeechRecognition ?? w.webkitSpeechRecognition) : undefined
    setSupported(!!SR)
  }, [])

  const startListening = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-AU'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (transcript.trim()) onTranscript(transcript.trim())
      setState('idle')
    }
    recognition.onerror = () => setState('error')
    recognition.onend = () => setState('idle')

    recognitionRef.current = recognition
    recognition.start()
    setState('listening')
  }, [onTranscript])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setState('idle')
  }, [])

  function speak(text: string) {
    if (!enabled || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-AU'
    utterance.rate = 1.05
    window.speechSynthesis.speak(utterance)
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  return { state, supported, startListening, stopListening, speak, stopSpeaking }
}
