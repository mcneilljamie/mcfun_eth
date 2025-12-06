import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { languages } from '../i18n/config';

export function LanguageSelector() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng);
    setIsOpen(false);
  };

  const currentLanguage = languages[i18n.language as keyof typeof languages] || languages.en;
  const isRTL = i18n.language === 'ar' || i18n.language === 'fa';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-sm sm:text-base font-medium text-gray-900"
        aria-label="Select language"
      >
        <span className="text-xl">{currentLanguage.flag}</span>
      </button>

      {isOpen && (
        <div className={`absolute top-full mt-2 ${isRTL ? 'left-0' : 'right-0'} bg-white rounded-lg shadow-lg border border-gray-200 p-2 w-[420px] max-w-[calc(100vw-2rem)] z-50`}>
          <div className="grid grid-cols-4 gap-1">
            {Object.entries(languages).map(([code, { nativeName, flag }]) => (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                className={`px-3 py-2.5 rounded-md hover:bg-gray-100 transition-colors flex flex-col items-center justify-center gap-1 ${
                  i18n.language === code ? 'bg-gray-100 ring-2 ring-gray-300' : ''
                }`}
              >
                <span className="text-2xl">{flag}</span>
                <span className="text-xs text-gray-900 text-center leading-tight">{nativeName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
