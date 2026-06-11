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
  onSpeakEnd,
}: {
  onTranscript: (text: string) => void
  enabled: boolean
  onSpeakEnd?: () => void
}) {
  const [state, setState] = useState<VoiceState>('idle')
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const onSpeakEndRef = useRef(onSpeakEnd)
  onSpeakEndRef.current = onSpeakEnd

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
    const SR = typeof window !== 'undefined' ? (w.SpeechRecognition ?? w.webkitSpeechRecognition) : undefined
    setSupported(!!SR)
  }, [])

  const startListening = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return

    // Tear down any existing instance before creating a new one.
    // Without this, calling start() on a still-alive recognition throws
    // InvalidStateError, which silently kills the loop.
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      try { recognitionRef.current.stop() } catch { /* already stopped */ }
      recognitionRef.current = null
    }

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
    try {
      recognition.start()
      setState('listening')
    } catch {
      setState('error')
    }
  }, [onTranscript])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setState('idle')
  }, [])

  async function speak(text: string) {
    if (!enabled) return
    stopSpeaking()
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        speakFallback(text)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.playbackRate = 1.2
      audioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        onSpeakEndRef.current?.()
      }
      await audio.play()
    } catch {
      speakFallback(text)
    }
  }

  function speakFallback(text: string) {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
    if (!synth) return
    synth.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'en-AU'
    utt.rate = 1.0
    utt.onend = () => onSpeakEndRef.current?.()
    synth.speak(utt)
  }

  function stopSpeaking() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }

  return { state, supported, ttsSupported: true, startListening, stopListening, speak, stopSpeaking }
}
