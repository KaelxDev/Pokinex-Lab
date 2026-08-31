import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './Avatar.css'
import './App.css'
import './Profile.css'
import './MessageContextMenu.css'
import './MessageLayout.css'
import './MessageTimePatch.css'
import App from './AppFixed.jsx'
import MessageContextMenu from './MessageContextMenu.jsx'

function Root() {
  return (
    <>
      <App />
      <MessageContextMenu />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
