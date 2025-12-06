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
        <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-[200px] z-50">
          {Object.entries(languages).map(([code, { nativeName, flag }]) => (
            <button
              key={code}
              onClick={() => handleLanguageChange(code)}
              className={`w-full px-4 py-2.5 text-left hover:bg-gray-100 transition-colors flex items-center gap-3 ${
                i18n.language === code ? 'bg-gray-50 font-semibold' : ''
              }`}
            >
              <span className="text-xl">{flag}</span>
              <span className="text-sm text-gray-900">{nativeName}</span>
              {i18n.language === code && (
                <span className="ml-auto text-gray-900">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
