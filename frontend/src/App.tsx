import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import HomePage from '@/pages/HomePage'
import WordbooksPage from '@/pages/WordbooksPage'
import WordbookDetailPage from '@/pages/WordbookDetailPage'
import TasksPage from '@/pages/TasksPage'
import QuizPage from '@/pages/QuizPage'
import QuizResultPage from '@/pages/QuizResultPage'
import RecordsPage from '@/pages/RecordsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="wordbooks" element={<WordbooksPage />} />
          <Route path="wordbooks/:id" element={<WordbookDetailPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="records" element={<RecordsPage />} />
        </Route>
        {/* 测验页不使用底部导航布局 */}
        <Route path="quiz/:sessionId" element={<QuizPage />} />
        <Route path="quiz/:sessionId/result" element={<QuizResultPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
