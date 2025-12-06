import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import ru from './locales/ru.json';
import pt from './locales/pt.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';
import ka from './locales/ka.json';
import tr from './locales/tr.json';
import hi from './locales/hi.json';
import id from './locales/id.json';
import vi from './locales/vi.json';
import ko from './locales/ko.json';
import ja from './locales/ja.json';
import fa from './locales/fa.json';

export const languages = {
  en: { nativeName: 'English', flag: '🇬🇧' },
  es: { nativeName: 'Español', flag: '🇪🇸' },
  fr: { nativeName: 'Français', flag: '🇫🇷' },
  it: { nativeName: 'Italiano', flag: '🇮🇹' },
  ru: { nativeName: 'Русский', flag: '🇷🇺' },
  pt: { nativeName: 'Português', flag: '🇵🇹' },
  ar: { nativeName: 'العربية', flag: '🇸🇦' },
  zh: { nativeName: '中文', flag: '🇨🇳' },
  ka: { nativeName: 'ქართული', flag: '🇬🇪' },
  tr: { nativeName: 'Türkçe', flag: '🇹🇷' },
  hi: { nativeName: 'हिन्दी', flag: '🇮🇳' },
  id: { nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  vi: { nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  ko: { nativeName: '한국어', flag: '🇰🇷' },
  ja: { nativeName: '日本語', flag: '🇯🇵' },
  fa: { nativeName: 'فارسی', flag: '🇦🇫' },
};

const savedLanguage = localStorage.getItem('language') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      it: { translation: it },
      ru: { translation: ru },
      pt: { translation: pt },
      ar: { translation: ar },
      zh: { translation: zh },
      ka: { translation: ka },
      tr: { translation: tr },
      hi: { translation: hi },
      id: { translation: id },
      vi: { translation: vi },
      ko: { translation: ko },
      ja: { translation: ja },
      fa: { translation: fa },
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('language', lng);
  document.documentElement.dir = (lng === 'ar' || lng === 'fa') ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
});

document.documentElement.dir = (savedLanguage === 'ar' || savedLanguage === 'fa') ? 'rtl' : 'ltr';
document.documentElement.lang = savedLanguage;

export default i18n;
