import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { languages } from '../i18n/config';

export function LanguageSelector() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Mobile language subset
  const mobileLanguages = ['en', 'es', 'pt', 'ru', 'fa', 'zh'];

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

  // Filter languages based on screen size
  const displayLanguages = isMobile
    ? Object.entries(languages).filter(([code]) => mobileLanguages.includes(code))
    : Object.entries(languages);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-base font-medium text-gray-900"
        aria-label="Select language"
      >
        <span className="text-xl">{currentLanguage.flag}</span>
      </button>

      {isOpen && (
        <div className={`absolute top-full mt-2 ${isRTL ? 'left-0' : 'right-0'} bg-white rounded-lg shadow-lg border border-gray-200 p-2 w-[min(300px,calc(100vw-32px))] sm:w-[420px] max-w-[calc(100vw-16px)] z-50`}>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
            {displayLanguages.map(([code, { nativeName, flag }]) => (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                className={`px-2 sm:px-3 py-2.5 rounded-md hover:bg-gray-100 transition-colors flex flex-col items-center justify-center gap-1 ${
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
