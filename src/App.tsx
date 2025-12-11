import { useState } from 'react';
import { Web3Provider } from './lib/web3';
import { Navigation } from './components/Navigation';
import { NetworkWarning } from './components/NetworkWarning';
import { Toast } from './components/Toast';
import { Home } from './pages/Home';
import { Launch } from './pages/Launch';
import { Trade } from './pages/Trade';
import { Tokens } from './pages/Tokens';
import { TokenDetail } from './pages/TokenDetail';
import { About } from './pages/About';
import { Token } from './lib/supabase';

type Page = 'home' | 'launch' | 'trade' | 'tokens' | 'token-detail' | 'about';

export interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info';
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedToken, setSelectedToken] = useState<Token | undefined>(undefined);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const handleNavigate = (page: string, tokenAddress?: string) => {
    setCurrentPage(page as Page);
    if (tokenAddress) {
      setSelectedTokenAddress(tokenAddress);
    }
  };

  const handleSelectToken = (token: Token) => {
    setSelectedToken(token);
    setCurrentPage('trade');
  };

  const handleViewTokenDetail = (tokenAddress: string) => {
    setSelectedTokenAddress(tokenAddress);
    setCurrentPage('token-detail');
  };

  const handleBackToTokens = () => {
    setCurrentPage('tokens');
  };

  return (
    <Web3Provider>
      <div className="min-h-screen bg-gray-100">
        <Navigation
          currentPage={currentPage}
          onNavigate={handleNavigate}
          setToast={setToast}
        />
        <NetworkWarning />

        <div>
          {currentPage === 'home' && <Home onNavigate={handleNavigate} />}
          {currentPage === 'launch' && <Launch onNavigate={handleNavigate} onShowToast={setToast} />}
          {currentPage === 'trade' && <Trade selectedToken={selectedToken} onShowToast={setToast} />}
          {currentPage === 'tokens' && (
            <Tokens
              onSelectToken={handleSelectToken}
              onViewToken={handleViewTokenDetail}
              onShowToast={setToast}
            />
          )}
          {currentPage === 'token-detail' && selectedTokenAddress && (
            <TokenDetail
              tokenAddress={selectedTokenAddress}
              onBack={handleBackToTokens}
              onTrade={handleSelectToken}
              onShowToast={setToast}
            />
          )}
          {currentPage === 'about' && <About />}
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

export default App;
