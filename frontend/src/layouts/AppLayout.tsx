import { Outlet, NavLink } from 'react-router-dom'

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto">
      <main className="flex-1 pb-16">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 flex">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs ${isActive ? 'text-primary-600' : 'text-gray-500'}`
          }
        >
          <span className="text-xl">🏠</span>
          <span>首页</span>
        </NavLink>
        <NavLink
          to="/tasks"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs ${isActive ? 'text-primary-600' : 'text-gray-500'}`
          }
        >
          <span className="text-xl">📝</span>
          <span>今日任务</span>
        </NavLink>
        <NavLink
          to="/wordbooks"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs ${isActive ? 'text-primary-600' : 'text-gray-500'}`
          }
        >
          <span className="text-xl">📚</span>
          <span>单词本</span>
        </NavLink>
        <NavLink
          to="/records"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs ${isActive ? 'text-primary-600' : 'text-gray-500'}`
          }
        >
          <span className="text-xl">📊</span>
          <span>学习记录</span>
        </NavLink>
      </nav>
    </div>
  )
}
