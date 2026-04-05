import { Rocket, Shield, DollarSign, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface HomeProps {
  onNavigate: (page: string) => void;
}

export function Home({ onNavigate }: HomeProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-16 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-white dark:text-white mb-4 sm:mb-6 px-2 transition-colors">
            {t('home.hero.title')}
            <br />
            <span className="text-gray-600 dark:text-gray-400 dark:text-gray-300 transition-colors">{t('home.hero.subtitle')}</span>
          </h1>
          <p className="text-base sm:text-xl text-gray-600 dark:text-gray-400 dark:text-gray-400 max-w-2xl mx-auto mb-6 sm:mb-8 px-4 transition-colors">
            {t('home.hero.description')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
            <button
              onClick={() => onNavigate('launch')}
              className="bg-gray-900 dark:bg-white dark:bg-gray-800 text-white dark:text-gray-900 dark:text-white px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold text-base sm:text-lg hover:bg-gray-800 dark:hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-gray-800 transition-all transform hover:scale-105 shadow-lg touch-manipulation"
            >
              {t('home.hero.launchNow')}
            </button>
            <button
              onClick={() => onNavigate('tokens')}
              className="bg-white dark:bg-gray-800 dark:bg-gray-800 text-gray-900 dark:text-white dark:text-white px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold text-base sm:text-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700 transition-all transform hover:scale-105 shadow-lg border-2 border-gray-900 dark:border-white touch-manipulation"
            >
              {t('home.hero.explore')}
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16">
          <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 p-5 sm:p-6 rounded-xl shadow-md hover:shadow-xl transition-all">
            <div className="bg-gray-100 dark:bg-gray-800 dark:bg-gray-700 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center mb-3 sm:mb-4 transition-colors">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-gray-900 dark:text-white dark:text-white transition-colors" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white dark:text-white mb-2 transition-colors">{t('home.features.fast.title')}</h3>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 dark:text-gray-400 transition-colors">
              {t('home.features.fast.description')}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 p-5 sm:p-6 rounded-xl shadow-md hover:shadow-xl transition-all">
            <div className="bg-gray-100 dark:bg-gray-800 dark:bg-gray-700 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center mb-3 sm:mb-4 transition-colors">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-gray-900 dark:text-white dark:text-white transition-colors" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white dark:text-white mb-2 transition-colors">{t('home.features.secure.title')}</h3>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 dark:text-gray-400 transition-colors">
              {t('home.features.secure.description')}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 p-5 sm:p-6 rounded-xl shadow-md hover:shadow-xl transition-all">
            <div className="bg-gray-100 dark:bg-gray-800 dark:bg-gray-700 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center mb-3 sm:mb-4 transition-colors">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-gray-900 dark:text-white dark:text-white transition-colors" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white dark:text-white mb-2 transition-colors">{t('home.features.noFees.title')}</h3>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 dark:text-gray-400 transition-colors">
              {t('home.features.noFees.description')}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 p-5 sm:p-6 rounded-xl shadow-md hover:shadow-xl transition-all">
            <div className="bg-gray-100 dark:bg-gray-800 dark:bg-gray-700 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center mb-3 sm:mb-4 transition-colors">
              <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-gray-900 dark:text-white dark:text-white transition-colors" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white dark:text-white mb-2 transition-colors">{t('home.features.fair.title')}</h3>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 dark:text-gray-400 transition-colors">
              {t('home.features.fair.description')}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8 mb-12 sm:mb-16 transition-colors">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white dark:text-white mb-6 text-center transition-colors">{t('home.howItWorks.title')}</h2>
          <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
            <div className="text-center">
              <div className="bg-gray-900 dark:bg-white dark:bg-gray-800 text-white dark:text-gray-900 dark:text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-lg sm:text-xl font-bold mx-auto mb-3 sm:mb-4 transition-colors">
                1
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white dark:text-white mb-2 transition-colors">{t('home.howItWorks.step1.title')}</h3>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 dark:text-gray-400 transition-colors">
                {t('home.howItWorks.step1.description')}
              </p>
            </div>

            <div className="text-center">
              <div className="bg-gray-900 dark:bg-white dark:bg-gray-800 text-white dark:text-gray-900 dark:text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-lg sm:text-xl font-bold mx-auto mb-3 sm:mb-4 transition-colors">
                2
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white dark:text-white mb-2 transition-colors">{t('home.howItWorks.step2.title')}</h3>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 dark:text-gray-400 transition-colors">
                {t('home.howItWorks.step2.description')}
              </p>
            </div>

            <div className="text-center">
              <div className="bg-gray-900 dark:bg-white dark:bg-gray-800 text-white dark:text-gray-900 dark:text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-lg sm:text-xl font-bold mx-auto mb-3 sm:mb-4 transition-colors">
                3
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white dark:text-white mb-2 transition-colors">{t('home.howItWorks.step3.title')}</h3>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 dark:text-gray-400 transition-colors">
                {t('home.howItWorks.step3.description')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-lg p-6 sm:p-8 text-white text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">{t('home.why.title')}</h2>
          <p className="text-base sm:text-lg text-gray-300 mb-5 sm:mb-6 max-w-3xl mx-auto px-2">
            {t('home.why.description')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-4xl mx-auto">
            <div className="bg-white dark:bg-gray-800/10 backdrop-blur-sm px-5 sm:px-6 py-4 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold mb-1">{t('home.why.benefits.simple.title')}</div>
              <div className="text-xs sm:text-sm text-gray-300">{t('home.why.benefits.simple.description')}</div>
            </div>
            <div className="bg-white dark:bg-gray-800/10 backdrop-blur-sm px-5 sm:px-6 py-4 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold mb-1">{t('home.why.benefits.safe.title')}</div>
              <div className="text-xs sm:text-sm text-gray-300">{t('home.why.benefits.safe.description')}</div>
            </div>
            <div className="bg-white dark:bg-gray-800/10 backdrop-blur-sm px-5 sm:px-6 py-4 rounded-lg">
              <div className="text-xl sm:text-2xl font-bold mb-1">{t('home.why.benefits.lowCost.title')}</div>
              <div className="text-xs sm:text-sm text-gray-300">{t('home.why.benefits.lowCost.description')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
