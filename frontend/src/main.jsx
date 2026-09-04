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
import './MobileUX.css'
import './ReplyScrollFix.css'
import './AutoMessageScroll.css'
import './Brand.css'
import MobileSidebar from './MobileSidebar.jsx'
import AutoMessageScroll from './AutoMessageScroll.jsx'
import AppEdit from './AppEdit.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MobileSidebar>
      <AutoMessageScroll>
        <AppEdit />
      </AutoMessageScroll>
    </MobileSidebar>
  </StrictMode>,
)
