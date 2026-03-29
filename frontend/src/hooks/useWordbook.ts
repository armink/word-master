import { useState, useEffect } from 'react'
import type { Wordbook } from '@/types'

const STORAGE_KEY = 'word_master_wordbook'

export function useWordbook() {
  const [wordbook, setWordbookState] = useState<Wordbook | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Wordbook) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (wordbook) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wordbook))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [wordbook])

  const setWordbook = (wb: Wordbook | null) => setWordbookState(wb)

  return { wordbook, setWordbook }
}
