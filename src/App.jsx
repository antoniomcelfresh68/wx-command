import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MainContent from './components/MainContent'
import ChatBubble from './components/ChatBubble'

const queryClient = new QueryClient()

const DEFAULT_LOCATION = { label: 'OKC / KOKC', lat: 35.22, lon: -97.47, stationId: 'KOKC' }

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [location, setLocation] = useState(DEFAULT_LOCATION)

  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: '#090b14' }}>
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} location={location} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <TopBar location={location} setLocation={setLocation} />
          <MainContent activeTab={activeTab} setActiveTab={setActiveTab} location={location} />
        </div>
        <ChatBubble location={location} />
      </div>
    </QueryClientProvider>
  )
}
