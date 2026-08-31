import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './Avatar.css'
import './App.css'
import './Profile.css'
import './MessageContextMenu.css'
import './MessageLayout.css'
import './MessageTimePatch.css'
import './AppEdit.css'
import './UIRefinement.css'
import './AuthRefinement.css'
import './MessageLayoutFinal.css'
import './MessageGeometry.css'
import AppEdit from './AppEdit.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppEdit />
  </StrictMode>,
)
