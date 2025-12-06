import { useState } from 'react';
import { Web3Provider } from './lib/web3';
import { Navigation } from './components/Navigation';
import { Home } from './pages/Home';
import { Launch } from './pages/Launch';
import { Trade } from './pages/Trade';
import { Tokens } from './pages/Tokens';
import { Token } from './lib/supabase';

type Page = 'home' | 'launch' | 'trade' | 'tokens';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedToken, setSelectedToken] = useState<Token | undefined>(undefined);

  const handleNavigate = (page: string) => {
    setCurrentPage(page as Page);
  };

  const handleSelectToken = (token: Token) => {
    setSelectedToken(token);
    setCurrentPage('trade');
  };

  return (
    <Web3Provider>
      <div className="min-h-screen bg-gray-100">
        <Navigation currentPage={currentPage} onNavigate={handleNavigate} />

        {currentPage === 'home' && <Home onNavigate={handleNavigate} />}
        {currentPage === 'launch' && <Launch onNavigate={handleNavigate} />}
        {currentPage === 'trade' && <Trade selectedToken={selectedToken} />}
        {currentPage === 'tokens' && <Tokens onSelectToken={handleSelectToken} />}
      </div>
    </Web3Provider>
  );
}

export default App;
