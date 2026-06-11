
import { Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom'
import CardApp from './components/CardApp.jsx'
import ModernCardApp from './components/ModernCardApp.jsx'
import { ConnectionProvider } from './contexts/ConnectionContext.jsx'
import { GameStateProvider } from './contexts/GameStateContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'


// Wrapper to provide sqid from route params to ConnectionProvider
function CardAppWithConnection() {
  const { sqid } = useParams()
  const [searchParams] = useSearchParams()
  
  // Allow testing modern version with ?modern=true query parameter
  //const useModernApp = searchParams.get('modern') === 'true'
  const useLegacyApp = searchParams.get('legacy') === 'true'
  const AppComponent = useLegacyApp ? CardApp : ModernCardApp

  return (
    <ErrorBoundary>
      <ConnectionProvider sqid={sqid}>
        <GameStateProvider>
          <AppComponent />
        </GameStateProvider>
      </ConnectionProvider>
    </ErrorBoundary>
  )
}

function App() {
  return (
    <div className="min-h-screen bg-base-100">
      <Routes>
        {/* Main card scoring route with Sqid parameter */}
        <Route path="/cards/:sqid" element={<CardAppWithConnection />} />

        {/* Redirect root to a default Sqid for demo purposes */}
        <Route path="/" element={<Navigate to="/cards/demo" replace />} />

        {/* Catch-all redirect to demo */}
        <Route path="*" element={<Navigate to="/cards/demo" replace />} />
      </Routes>
    </div>
  )
}

export default App
