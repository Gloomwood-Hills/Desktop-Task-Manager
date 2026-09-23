import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App'
import { isMobile } from './data/platform'
import DesktopContextMenuPopup from './components/desktopContextMenuPopup'

// 移动端（Android）全屏适配标记：index.css 据此关闭 #root 的桌面窗口圆角
if (isMobile) document.documentElement.classList.add('mobile')

const isTaskContextPopup = new URLSearchParams(window.location.search).get('popup') === 'task-context-menu'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      {isTaskContextPopup ? <DesktopContextMenuPopup /> : <App />}
    </MotionConfig>
  </StrictMode>,
)
