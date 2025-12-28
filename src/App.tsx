import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Web3Provider } from './lib/web3';
import { Navigation } from './components/Navigation';
import { NetworkWarning } from './components/NetworkWarning';
import { Toast } from './components/Toast';
import { Home } from './pages/Home';
import { Launch } from './pages/Launch';
import { Trade } from './pages/Trade';
import { Tokens } from './pages/Tokens';
import { TokenDetail } from './pages/TokenDetail';
import Portfolio from './pages/Portfolio';
import { Lock } from './pages/Lock';
import { MyLocks } from './pages/MyLocks';
import { Burn } from './pages/Burn';
import { About } from './pages/About';
import { Token } from './lib/supabase';

export interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info';
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedToken, setSelectedToken] = useState<Token | undefined>(undefined);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const handleNavigate = (page: string, tokenAddress?: string) => {
    if (page === 'home') navigate('/');
    else if (page === 'launch') navigate('/launch');
    else if (page === 'trade') navigate('/trade');
    else if (page === 'tokens') navigate('/tokens');
    else if (page === 'portfolio') navigate('/portfolio');
    else if (page === 'lock') navigate('/lock');
    else if (page === 'my-locks') navigate('/my-locks');
    else if (page === 'burn') navigate('/burn');
    else if (page === 'token-detail' && tokenAddress) navigate(`/token/${tokenAddress}`);
    else if (page === 'about') navigate('/about');
  };

  const handleSelectToken = (token: Token) => {
    setSelectedToken(token);
    navigate('/trade');
  };

  const handleViewTokenDetail = (tokenAddress: string) => {
    navigate(`/token/${tokenAddress}`);
  };

  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === '/') return 'home';
    if (path === '/launch') return 'launch';
    if (path === '/trade') return 'trade';
    if (path === '/tokens') return 'tokens';
    if (path === '/portfolio') return 'portfolio';
    if (path === '/lock' || path.startsWith('/lock/')) return 'lock';
    if (path === '/my-locks') return 'my-locks';
    if (path === '/burn') return 'burn';
    if (path.startsWith('/token/')) return 'token-detail';
    if (path === '/about') return 'about';
    return 'home';
  };

  return (
    <Web3Provider>
      <div className="min-h-screen bg-gray-100">
        <Navigation
          currentPage={getCurrentPage()}
          onNavigate={handleNavigate}
          setToast={setToast}
        />
        <NetworkWarning />

        <div>
          <Routes>
            <Route path="/" element={<Home onNavigate={handleNavigate} />} />
            <Route path="/launch" element={<Launch onNavigate={handleNavigate} onShowToast={setToast} />} />
            <Route path="/trade" element={<Trade selectedToken={selectedToken} onShowToast={setToast} />} />
            <Route path="/tokens" element={
              <Tokens
                onSelectToken={handleSelectToken}
                onViewToken={handleViewTokenDetail}
                onShowToast={setToast}
              />
            } />
            <Route path="/token/:tokenAddress" element={
              <TokenDetail
                onTrade={handleSelectToken}
                onShowToast={setToast}
              />
            } />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/lock" element={<Lock onShowToast={setToast} />} />
            <Route path="/lock/:tokenAddress" element={<Lock onShowToast={setToast} />} />
            <Route path="/my-locks" element={<MyLocks onShowToast={setToast} />} />
            <Route path="/burn" element={<Burn onShowToast={setToast} />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </div>

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </Web3Provider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
