import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import Layout from './components/Layout'
import { RoomSessionProvider } from './multiplayer/useRoom'

const BoardPage = lazy(() => import('./pages/BoardPage'))
const DecksPage = lazy(() => import('./pages/DecksPage'))
const DeckBuilderPage = lazy(() => import('./pages/DeckBuilderPage'))
const DeckDetailPage = lazy(() => import('./pages/DeckDetailPage'))
const ToolsPage = lazy(() => import('./pages/ToolsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const BroadcastPage = lazy(() => import('./pages/BroadcastPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const LobbyPage = lazy(() => import('./pages/LobbyPage'))
const GamePage = lazy(() => import('./pages/GamePage'))
const MultiplayerBoardPage = lazy(() => import('./pages/MultiplayerBoardPage'))

function BoardRoute() {
  const [searchParams] = useSearchParams()
  return searchParams.get('roomId') ? <MultiplayerBoardPage /> : <BoardPage />
}

function App() {
  return (
    <BrowserRouter>
      <RoomSessionProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/broadcast" element={<BroadcastPage />} />
            <Route path="/" element={<HomePage />} />
            <Route path="/lobby" element={<LobbyPage />} />
            <Route path="/game/:roomId" element={<GamePage />} />
            <Route element={<Layout />}>
              <Route path="/board" element={<BoardRoute />} />
              <Route path="/decks/:deckId" element={<DeckDetailPage />} />
              <Route path="/decks/builder" element={<DeckBuilderPage />} />
              <Route path="/decks" element={<DecksPage />} />
              <Route path="/tools" element={<ToolsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </RoomSessionProvider>
    </BrowserRouter>
  )
}

export default App
