import { useState } from 'react';
import { Web3Provider } from './lib/web3';
import { Navigation } from './components/Navigation';
import { Home } from './pages/Home';
import { Launch } from './pages/Launch';
import { Trade } from './pages/Trade';
import { Tokens } from './pages/Tokens';
import { TokenDetail } from './pages/TokenDetail';
import { About } from './pages/About';
import { Token } from './lib/supabase';

type Page = 'home' | 'launch' | 'trade' | 'tokens' | 'token-detail' | 'about';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedToken, setSelectedToken] = useState<Token | undefined>(undefined);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | undefined>(undefined);

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
        />

        <div>
          {currentPage === 'home' && <Home onNavigate={handleNavigate} />}
          {currentPage === 'launch' && <Launch onNavigate={handleNavigate} />}
          {currentPage === 'trade' && <Trade selectedToken={selectedToken} />}
          {currentPage === 'tokens' && (
            <Tokens
              onSelectToken={handleSelectToken}
              onViewToken={handleViewTokenDetail}
            />
          )}
          {currentPage === 'token-detail' && selectedTokenAddress && (
            <TokenDetail
              tokenAddress={selectedTokenAddress}
              onBack={handleBackToTokens}
              onTrade={handleSelectToken}
            />
          )}
          {currentPage === 'about' && <About />}
        </div>
      </div>
    </Web3Provider>
  );
}

export default App;
