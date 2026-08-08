import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { isMobile } from './data/platform'

// 移动端（Android）全屏适配标记：index.css 据此关闭 #root 的桌面窗口圆角
if (isMobile) document.documentElement.classList.add('mobile')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)