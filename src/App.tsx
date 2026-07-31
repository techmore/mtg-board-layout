import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import BoardPage from './pages/BoardPage'
import DecksPage from './pages/DecksPage'
import DeckDetailPage from './pages/DeckDetailPage'
import ToolsPage from './pages/ToolsPage'
import SettingsPage from './pages/SettingsPage'
import BroadcastPage from './pages/BroadcastPage'
import HomePage from './pages/HomePage'
import LobbyPage from './pages/LobbyPage'
import GamePage from './pages/GamePage'
import MultiplayerBoardPage from './pages/MultiplayerBoardPage'
import { RoomSessionProvider } from './multiplayer/useRoom'
import { useSearchParams } from 'react-router-dom'

function BoardRoute() {
  const [searchParams] = useSearchParams()
  return searchParams.get('roomId') ? <MultiplayerBoardPage /> : <BoardPage />
}

function App() {
  return (
    <BrowserRouter>
      <RoomSessionProvider>
        <Routes>
        <Route path="/broadcast" element={<BroadcastPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/game/:roomId" element={<GamePage />} />
        <Route element={<Layout />}>
          <Route path="/board" element={<BoardRoute />} />
          <Route path="/decks/:deckId" element={<DeckDetailPage />} />
          <Route path="/decks" element={<DecksPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RoomSessionProvider>
    </BrowserRouter>
  )
}

export default App
