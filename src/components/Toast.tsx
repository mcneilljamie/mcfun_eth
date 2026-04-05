import { useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = 'info', onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle size={20} className="text-green-600 dark:text-green-400" />,
    error: <AlertCircle size={20} className="text-red-600 dark:text-red-400" />,
    info: <Info size={20} className="text-blue-600 dark:text-blue-400" />,
  };

  const colors = {
    success: 'bg-green-50 dark:bg-green-900/90 border-green-200 dark:border-green-700',
    error: 'bg-red-50 dark:bg-red-900/90 border-red-200 dark:border-red-700',
    info: 'bg-blue-50 dark:bg-blue-900/90 border-blue-200 dark:border-blue-700',
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 max-w-sm w-full sm:w-auto animate-slide-up`}>
      <div className={`${colors[type]} border rounded-lg shadow-lg p-4 flex items-start space-x-3`}>
        {icons[type]}
        <p className="flex-1 text-sm font-medium text-gray-900 dark:text-white">{message}</p>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-gray-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
