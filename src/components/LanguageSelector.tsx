import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { languages } from '../i18n/config';

export function LanguageSelector() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // 640px is Tailwind's 'sm' breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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
        className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-600 dark:bg-gray-700 transition-colors text-base font-medium text-gray-900 dark:text-white"
        aria-label="Select language"
      >
        <span className="text-xl">{currentLanguage.flag}</span>
      </button>

      {isOpen && (
        <>
          {/* Mobile: Scrollable list */}
          {isMobile ? (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 w-[240px] max-h-[60vh] overflow-y-auto z-50">
              <div className="py-1">
                {Object.entries(languages).map(([code, { nativeName, flag }]) => (
                  <button
                    key={code}
                    onClick={() => handleLanguageChange(code)}
                    className={`w-full px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors flex items-center gap-3 ${
                      i18n.language === code ? 'bg-gray-100 dark:bg-gray-800' : ''
                    }`}
                  >
                    <span className="text-2xl">{flag}</span>
                    <span className="text-sm text-gray-900 dark:text-white font-medium">{nativeName}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Desktop: Grid layout */
            <div className={`absolute top-full mt-2 ${isRTL ? 'left-0' : 'right-0'} bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 w-[420px] z-50`}>
              <div className="grid grid-cols-4 gap-1">
                {Object.entries(languages).map(([code, { nativeName, flag }]) => (
                  <button
                    key={code}
                    onClick={() => handleLanguageChange(code)}
                    className={`px-3 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors flex flex-col items-center justify-center gap-1 ${
                      i18n.language === code ? 'bg-gray-100 dark:bg-gray-800 ring-2 ring-gray-300' : ''
                    }`}
                  >
                    <span className="text-2xl">{flag}</span>
                    <span className="text-xs text-gray-900 dark:text-white text-center leading-tight">{nativeName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
