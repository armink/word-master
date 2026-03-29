import { useState, useEffect } from 'react'
import type { Student } from '@/types'

const STORAGE_KEY = 'word_master_student'

export function useStudent() {
  const [student, setStudentState] = useState<Student | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Student) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (student) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(student))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [student])

  const setStudent = (s: Student | null) => setStudentState(s)
  const clearStudent = () => setStudentState(null)

  return { student, setStudent, clearStudent }
}
