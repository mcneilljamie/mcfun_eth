import { useState, useEffect } from 'react';
import { Trophy, Search, TrendingUp, Copy, CheckCircle, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase, Token } from '../lib/supabase';
import { formatCurrency, formatAddress, formatTimeAgo } from '../lib/utils';

interface TokensProps {
  onSelectToken: (token: Token) => void;
}

export function Tokens({ onSelectToken }: TokensProps) {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  useEffect(() => {
    loadTokens();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      setFilteredTokens(
        tokens.filter(
          (token) =>
            token.name.toLowerCase().includes(query) ||
            token.symbol.toLowerCase().includes(query) ||
            token.token_address.toLowerCase().includes(query)
        )
      );
    } else {
      setFilteredTokens(tokens);
    }
  }, [searchQuery, tokens]);

  const loadTokens = async () => {
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .order('current_eth_reserve', { ascending: false });

      if (error) throw error;

      if (data) {
        setTokens(data);
        setFilteredTokens(data);
      }
    } catch (err) {
      console.error('Failed to load tokens:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center space-x-3">
              <div className="bg-gray-900 p-2 rounded-lg">
                <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('tokens.title')}</h1>
            </div>

            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={t('tokens.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-4 text-gray-600">{t('tokens.loading')}</p>
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">
                {searchQuery ? t('tokens.noResults') : t('tokens.noTokens')}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.rank')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.token')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.address')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.liquidity')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.volume')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.created')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTokens.map((token, index) => (
                      <tr
                        key={token.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center space-x-2">
                            {index < 3 && (
                              <Trophy
                                className={`w-4 h-4 ${
                                  index === 0
                                    ? 'text-yellow-500'
                                    : index === 1
                                    ? 'text-gray-400'
                                    : 'text-amber-700'
                                }`}
                              />
                            )}
                            <span className="font-medium text-gray-900">{index + 1}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div>
                            <div className="font-semibold text-gray-900">{token.name}</div>
                            <div className="text-sm text-gray-500">{token.symbol}</div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => copyToClipboard(token.token_address)}
                              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
                            >
                              <span className="font-mono text-sm">{formatAddress(token.token_address)}</span>
                              {copiedAddress === token.token_address ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <a
                              href={`https://etherscan.io/token/${token.token_address}#balances`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center space-x-1 text-gray-600 hover:text-gray-900 transition-colors text-sm"
                              title="View top holders on Etherscan"
                            >
                              <span>{t('tokens.table.holders')}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(token.current_eth_reserve || token.initial_liquidity_eth)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {t('tokens.table.locked', { percent: token.liquidity_percent })}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-medium text-gray-900">
                            {formatCurrency(token.total_volume_eth)}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-sm text-gray-600">
                            {formatTimeAgo(token.created_at)}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <button
                            onClick={() => onSelectToken(token)}
                            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center space-x-2"
                          >
                            <TrendingUp className="w-4 h-4" />
                            <span>{t('tokens.table.trade')}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-4">
                {filteredTokens.map((token, index) => (
                  <div
                    key={token.id}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        {index < 3 && (
                          <Trophy
                            className={`w-4 h-4 ${
                              index === 0
                                ? 'text-yellow-500'
                                : index === 1
                                ? 'text-gray-400'
                                : 'text-amber-700'
                            }`}
                          />
                        )}
                        <span className="font-medium text-gray-500 text-sm">#{index + 1}</span>
                      </div>
                      <button
                        onClick={() => onSelectToken(token)}
                        className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center space-x-2"
                      >
                        <TrendingUp className="w-4 h-4" />
                        <span>{t('tokens.table.trade')}</span>
                      </button>
                    </div>

                    <div className="mb-3">
                      <div className="font-bold text-gray-900 text-lg">{token.name}</div>
                      <div className="text-sm text-gray-500">{token.symbol}</div>
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('tokens.table.liquidity')}:</span>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(token.current_eth_reserve || token.initial_liquidity_eth)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {t('tokens.table.locked', { percent: token.liquidity_percent })}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('tokens.table.volume')}:</span>
                        <span className="font-medium text-gray-900">
                          {formatCurrency(token.total_volume_eth)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('tokens.table.created')}:</span>
                        <span className="text-sm text-gray-900">
                          {formatTimeAgo(token.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => copyToClipboard(token.token_address)}
                          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
                        >
                          <span className="font-mono text-xs">{formatAddress(token.token_address)}</span>
                          {copiedAddress === token.token_address ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <a
                          href={`https://etherscan.io/token/${token.token_address}#balances`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1 text-gray-600 hover:text-gray-900 transition-colors text-sm"
                          title="View top holders on Etherscan"
                        >
                          <span>{t('tokens.table.holders')}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!isLoading && filteredTokens.length > 0 && (
            <div className="mt-6 text-center text-sm text-gray-500">
              {t('tokens.showing', { count: filteredTokens.length })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
