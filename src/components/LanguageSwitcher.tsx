import React from 'react'
import i18n from '../i18n'

const LanguageSwitcher: React.FC = () => {
  const set = (lng: 'en'|'fr'|'ar') => {
    i18n.changeLanguage(lng)
    const html = document.documentElement
    if (lng === 'ar') html.setAttribute('dir','rtl'); else html.setAttribute('dir','ltr')
  }
  const cur = i18n.language as 'en'|'fr'|'ar'
  return (
    <div className="flex gap-1">
      {(['en','fr','ar'] as const).map(l => (
        <button key={l} onClick={()=>set(l)} className={`btn-ghost ${cur===l?'opacity-100':'opacity-70'}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
export default LanguageSwitcher
