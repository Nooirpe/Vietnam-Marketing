import { useT } from '../../locales/useT'
import { Button } from './Button'

export function LanguageToggle() {
  const { language, setLanguage, storageBlocked, t } = useT()
  return (
    <div className="flex items-center gap-1">
      <div role="group" aria-label={t('language.group')} className="flex rounded-control border border-app-border p-0.5">
        <Button type="button" variant="ghost" aria-label={t('language.vietnamese')}
          aria-pressed={language === 'vi'} onClick={() => setLanguage('vi')}
          className="!min-h-8 !px-2 !py-1 text-xs aria-pressed:bg-app-surface-muted">
          VI
        </Button>
        <Button type="button" variant="ghost" aria-label={t('language.english')}
          aria-pressed={language === 'en'} onClick={() => setLanguage('en')}
          className="!min-h-8 !px-2 !py-1 text-xs aria-pressed:bg-app-surface-muted">
          EN
        </Button>
      </div>
      {storageBlocked && <span role="status" className="sr-only">{t('language.storageBlocked')}</span>}
    </div>
  )
}
