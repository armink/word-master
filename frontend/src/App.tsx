import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import HomePage from '@/pages/HomePage'
import WordbooksPage from '@/pages/WordbooksPage'
import WordbookDetailPage from '@/pages/WordbookDetailPage'
import TasksPage from '@/pages/TasksPage'
import QuizPage from '@/pages/QuizPage'
import QuizResultPage from '@/pages/QuizResultPage'
import RecordsPage from '@/pages/RecordsPage'
import PetPage from '@/pages/PetPage'
import PetGamePage from '@/pages/PetGamePage'

export default function App() {
  // 全局禁止长按弹出系统上下文菜单（Android Chrome「标记为广告」等）
  // 放在 useEffect 而非 main.tsx 模块级，确保 Vite HMR 后仍然生效
  useEffect(() => {
    const prevent = (e: Event) => {
      const t = e.target as HTMLElement
      // 可编辑元素需要长按粘贴菜单，不拦截
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return
      e.preventDefault()
    }
    document.addEventListener('contextmenu', prevent, { capture: true })
    return () => document.removeEventListener('contextmenu', prevent, { capture: true })
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="wordbooks" element={<WordbooksPage />} />
          <Route path="wordbooks/:id" element={<WordbookDetailPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="pet" element={<PetPage />} />
        </Route>
        {/* 测验页不使用底部导航布局 */}
        <Route path="quiz/:sessionId" element={<QuizPage />} />
        <Route path="quiz/:sessionId/result" element={<QuizResultPage />} />
        <Route path="pet/game" element={<PetGamePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
