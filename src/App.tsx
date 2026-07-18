import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import BoardPage from './pages/BoardPage'
import DecksPage from './pages/DecksPage'
import DeckDetailPage from './pages/DeckDetailPage'
import ToolsPage from './pages/ToolsPage'
import SettingsPage from './pages/SettingsPage'
import BroadcastPage from './pages/BroadcastPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/broadcast" element={<BroadcastPage />} />
        <Route element={<Layout />}>
          <Route path="/board" element={<BoardPage />} />
          <Route path="/decks/:deckId" element={<DeckDetailPage />} />
          <Route path="/decks" element={<DecksPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/board" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
