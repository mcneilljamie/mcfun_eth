import { useState, useEffect } from 'react';
import { X, Copy, CheckCircle, ExternalLink, Sparkles } from 'lucide-react';
import { useWeb3 } from '../lib/web3';
import { getExplorerUrl } from '../contracts/addresses';

interface LaunchCelebrationProps {
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  ammAddress: string;
  txHash: string;
  onClose: () => void;
  onViewToken: () => void;
}

export function LaunchCelebration({
  tokenName,
  tokenSymbol,
  tokenAddress,
  ammAddress,
  txHash,
  onClose,
  onViewToken,
}: LaunchCelebrationProps) {
  const { chainId } = useWeb3();
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [fireworks, setFireworks] = useState<Array<{ id: number; x: number; y: number }>>([]);

  useEffect(() => {
    const fireworkInterval = setInterval(() => {
      const newFirework = {
        id: Date.now() + Math.random(),
        x: Math.random() * 100,
        y: Math.random() * 60 + 20,
      };
      setFireworks((prev) => [...prev, newFirework]);
      setTimeout(() => {
        setFireworks((prev) => prev.filter((fw) => fw.id !== newFirework.id));
      }, 2000);
    }, 400);

    setTimeout(() => clearInterval(fireworkInterval), 5000);

    return () => clearInterval(fireworkInterval);
  }, []);

  const copyToClipboard = async (text: string, item: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(item);
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const chartUrl = `${window.location.origin}/?token=${tokenAddress}`;
  const explorerUrl = getExplorerUrl(chainId || 11155111);
  const etherscanTokenUrl = `${explorerUrl}/token/${tokenAddress}`;
  const etherscanPoolUrl = `${explorerUrl}/address/${ammAddress}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      {fireworks.map((fw) => (
        <div
          key={fw.id}
          className="absolute pointer-events-none"
          style={{
            left: `${fw.x}%`,
            top: `${fw.y}%`,
          }}
        >
          <div className="relative">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-firework"
                style={{
                  background: `hsl(${Math.random() * 360}, 100%, 60%)`,
                  transform: `rotate(${i * 30}deg) translateY(0)`,
                  animation: `firework 1s ease-out forwards`,
                  animationDelay: `${Math.random() * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes firework {
          0% {
            transform: rotate(var(--rotation, 0deg)) translateY(0);
            opacity: 1;
          }
          100% {
            transform: rotate(var(--rotation, 0deg)) translateY(-60px);
            opacity: 0;
          }
        }
        .animate-firework:nth-child(1) { --rotation: 0deg; }
        .animate-firework:nth-child(2) { --rotation: 30deg; }
        .animate-firework:nth-child(3) { --rotation: 60deg; }
        .animate-firework:nth-child(4) { --rotation: 90deg; }
        .animate-firework:nth-child(5) { --rotation: 120deg; }
        .animate-firework:nth-child(6) { --rotation: 150deg; }
        .animate-firework:nth-child(7) { --rotation: 180deg; }
        .animate-firework:nth-child(8) { --rotation: 210deg; }
        .animate-firework:nth-child(9) { --rotation: 240deg; }
        .animate-firework:nth-child(10) { --rotation: 270deg; }
        .animate-firework:nth-child(11) { --rotation: 300deg; }
        .animate-firework:nth-child(12) { --rotation: 330deg; }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative animate-scale-in">
        <style>{`
          @keyframes scale-in {
            from {
              transform: scale(0.9);
              opacity: 0;
            }
            to {
              transform: scale(1);
              opacity: 1;
            }
          }
          .animate-scale-in {
            animation: scale-in 0.3s ease-out;
          }
        `}</style>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full mb-4 animate-bounce">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Congratulations!
            </h2>
            <p className="text-lg text-gray-600">
              Your token <span className="font-semibold text-gray-900">{tokenName}</span> ({tokenSymbol}) has been successfully launched!
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <ExternalLink className="w-5 h-5 mr-2" />
                Shareable Links
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Token Chart
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={chartUrl}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(chartUrl, 'chart')}
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title="Copy chart link"
                    >
                      {copiedItem === 'chart' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Token Contract Address
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={tokenAddress}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(tokenAddress, 'token')}
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title="Copy token address"
                    >
                      {copiedItem === 'token' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                    <a
                      href={etherscanTokenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title="View on Etherscan"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    DEX Pool Address
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={ammAddress}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(ammAddress, 'amm')}
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title="Copy pool address"
                    >
                      {copiedItem === 'amm' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                    <a
                      href={etherscanPoolUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title="View on Etherscan"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transaction Hash
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={txHash}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(txHash, 'tx')}
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title="Copy transaction hash"
                    >
                      {copiedItem === 'tx' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                    <a
                      href={`${explorerUrl}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title="View on block explorer"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Share with your community!</h4>
              <p className="text-sm text-blue-800">
                I just launched ${tokenSymbol} on McFun! Check it out: {chartUrl}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onViewToken}
                className="flex-1 bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
              >
                View Your Token
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-100 text-gray-900 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Launch Another Token
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
