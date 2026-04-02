import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// 全局拦截长按触发的原生上下文菜单（Android Chrome「标记为广告」等）
// capture:true 确保在所有子元素之前拦截
document.addEventListener('contextmenu', e => e.preventDefault(), { capture: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
