import { Copy, MapPinned, Save, Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { Snapshot } from '../types/snapshot'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Tabs } from '../components/ui/Tabs'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { LanguageToggle } from '../components/ui/LanguageToggle'
import { useT } from '../locales/useT'
import { WorkspaceStateProvider } from './WorkspaceState'
import { useWorkspaceState } from './useWorkspaceState'

const navigation = [
  { path: '/map', labelKey: 'nav.map' },
  { path: '/compare', labelKey: 'nav.compare' },
  { path: '/decision', labelKey: 'nav.decision' },
  { path: '/shortlist', labelKey: 'nav.shortlist' },
] as const

function routeDetails(pathname: string, snapshot: Snapshot, t: (key: 'nav.map' | 'nav.compare' | 'nav.decision' | 'nav.shortlist' | 'nav.profile') => string) {
  if (pathname === '/map') return { title: t('nav.map'), areaId: null }
  if (pathname === '/compare') return { title: t('nav.compare'), areaId: null }
  if (pathname === '/decision') return { title: t('nav.decision'), areaId: null }
  if (pathname === '/shortlist') return { title: t('nav.shortlist'), areaId: null }

  const areaId = /^\/area\/([^/]+)$/.exec(pathname)?.[1] ?? null
  const area = areaId ? snapshot.unitsById.get(areaId) : undefined
  return { title: area ? `${t('nav.profile')} · ${area.name}` : t('nav.profile'), areaId }
}

function getNavigationSearch(search: string, pathname: string, snapshot: Snapshot) {
  const params = new URLSearchParams(search)
  if (pathname === '/map') {
    const periods = Object.keys(snapshot.manifest.periods).sort().reverse()
    const segments = [...new Set(snapshot.evidence.map(row => row.segment))].sort()
    const studies = [...new Set(snapshot.evidence.map(row => row.study))].sort()
    const period = params.get('period')
    const segment = params.get('segment')
    const study = params.get('study')
    params.set('period', period && periods.includes(period) ? period : periods[0] ?? '')
    if (segments.length) params.set('segment', segment && segments.includes(segment) ? segment : segments[0])
    if (studies.length) params.set('study', study && studies.includes(study) ? study : studies[0])

    if (!params.has('areas')) {
      const province = snapshot.unitsById.get(params.get('province') ?? '')
      const area = snapshot.unitsById.get(params.get('area') ?? '')
      const validArea = area && (province?.level === 'province'
        ? area.level === 'ward' && area.parentId === province.id
        : area.level === 'province')
      if (validArea) params.set('areas', area.id)
    }
  }
  return params.toString() ? `?${params.toString()}` : ''
}

export function AppShell({ snapshot, children }: { snapshot: Snapshot; children: ReactNode }) {
  return (
    <WorkspaceStateProvider>
      <AppShellContent snapshot={snapshot}>{children}</AppShellContent>
    </WorkspaceStateProvider>
  )
}

function AppShellContent({ snapshot, children }: { snapshot: Snapshot; children: ReactNode }) {
  const location = useLocation()
  const { t } = useT()
  const workspace = useWorkspaceState()
  const [viewName, setViewName] = useState('')
  const [toolStatus, setToolStatus] = useState('')
  const { title, areaId } = routeDetails(location.pathname, snapshot, t)
  const isMap = location.pathname === '/map'
  const search = getNavigationSearch(location.search, location.pathname, snapshot)
  const links = [
    ...navigation.map(item => ({ path: item.path, label: t(item.labelKey) })),
    ...(areaId ? [{ path: location.pathname, label: t('nav.profile') }] : []),
  ]

  async function copyCurrentLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href)
      } else {
        const field = document.createElement('textarea')
        field.value = window.location.href
        field.setAttribute('readonly', '')
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.append(field)
        try {
          field.select()
          if (!document.execCommand('copy')) throw new Error(t('app.clipboardDenied'))
        } finally {
          field.remove()
        }
      }
      setToolStatus(t('app.linkCopied'))
    } catch (error) {
      setToolStatus(error instanceof Error ? t('app.copyFailed', { message: error.message }) : t('app.copyLink'))
    }
  }

  function saveCurrentView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspace.saveView(viewName, location.search)) {
      setToolStatus(t('app.viewNameRequired'))
      return
    }
    setViewName('')
    setToolStatus(t('app.viewSaved'))
  }

  return (
    <div className="min-h-screen">
      <header className="no-print fixed inset-x-0 top-0 z-[1100] border-b border-app-border bg-app-surface">
        <div className="mx-auto flex h-14 max-w-[1560px] items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
          <Link to={{ pathname: '/map', search }} className="flex min-w-0 items-center gap-2 font-semibold text-app-text no-underline">
            <MapPinned size={20} aria-hidden="true" className="shrink-0 text-brand-700" />
            <span className="truncate">{t('app.name')}</span>
          </Link>
          <Tabs as="nav" label={t('nav.primary')} className="hidden gap-1 lg:flex">
            {links.map(({ path, label }) => {
              const active = path === '/map' ? isMap : path === '/compare'
                ? location.pathname === '/compare' : path === '/decision'
                  ? location.pathname === '/decision' : location.pathname === path
              return (
                <Link
                  key={label}
                  to={{ pathname: path, search }}
                  aria-current={active ? 'page' : undefined}
                  className="ui-tab whitespace-nowrap text-sm font-medium"
                >
                  {label}
                </Link>
              )
            })}
          </Tabs>
          <details className="relative shrink-0">
            <summary className="cursor-pointer rounded-control px-2 py-2 text-sm font-medium text-app-text hover:bg-app-surface-muted">
              {t('app.utilities')}
            </summary>
            <div className="absolute right-0 z-[1200] mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-panel border border-app-border bg-app-surface p-4 text-app-text shadow-popover">
              <Button type="button" variant="secondary" className="w-full justify-start" onClick={copyCurrentLink}>
                <Copy size={16} aria-hidden="true" /> {t('app.copyLink')}
              </Button>
              <form className="mt-4 flex gap-2" onSubmit={saveCurrentView}>
                <label className="sr-only" htmlFor="saved-view-name">{t('app.saveViewName')}</label>
                <input id="saved-view-name" className="ui-control min-w-0 flex-1"
                  maxLength={80} placeholder={t('app.saveViewName')} value={viewName}
                  onChange={(event) => setViewName(event.target.value)} />
                <Button type="submit" aria-label={t('app.saveView')}><Save size={16} aria-hidden="true" /></Button>
              </form>
              {workspace.savedViews.length > 0 && (
                <div className="mt-4">
                  <h2 className="text-sm font-semibold">{t('app.savedViews')}</h2>
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                    {workspace.savedViews.map((view) => (
                      <li key={view.id} className="flex items-center gap-2">
                        <Link className="min-w-0 flex-1 truncate text-sm text-brand-700 underline"
                          to={{ pathname: '/map', search: view.search }}>{view.name}</Link>
                        <Button type="button" variant="ghost" aria-label={t('app.removeView', { name: view.name })}
                          className="!min-h-8 !px-2" onClick={() => workspace.removeView(view.id)}>
                          <Trash2 size={15} aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {workspace.storageState !== 'available' && (
                <p role="status" className="mt-3 text-xs text-app-text-muted">
                  {workspace.storageState === 'blocked'
                    ? t('app.localBlocked')
                    : t('app.localInvalid')}
                </p>
              )}
              {toolStatus && <p role="status" className="mt-3 text-xs text-app-text-muted">{toolStatus}</p>}
              <div className="mt-3 border-t border-app-border pt-3">
                <LanguageToggle />
              </div>
            </div>
          </details>
          <ThemeToggle />
          {snapshot.manifest.isDemo && (
            <Badge variant="estimated" className="shrink-0 sm:px-3">
              {t('app.demo')}
            </Badge>
          )}
        </div>
      </header>

      <div className={`app-shell-content${isMap ? ' app-shell-content-map' : ''}`}>
        {!isMap && (
          <nav aria-label={t('nav.breadcrumb')} className="no-print mx-auto flex max-w-[1560px] items-center gap-2 px-4 py-2 text-sm sm:px-6 lg:px-8">
            <Link to={{ pathname: '/map', search }} className="text-brand-700 underline underline-offset-2">{t('nav.map')}</Link>
            <span aria-hidden="true" className="text-app-text-muted">/</span>
            <span aria-current="page" className="truncate font-medium text-app-text">{title}</span>
          </nav>
        )}
        {children}
      </div>

      <Tabs as="nav" label={t('nav.primary')} className="no-print fixed inset-x-0 bottom-0 z-[1100] grid border-t border-app-border bg-app-surface lg:hidden"
        style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
        {links.map(({ path, label }) => {
          const active = path === '/map' ? isMap : path === '/compare'
            ? location.pathname === '/compare' : path === '/decision'
              ? location.pathname === '/decision' : location.pathname === path
          return (
            <Link
              key={label}
              to={{ pathname: path, search }}
              aria-current={active ? 'page' : undefined}
              className="ui-tab flex min-h-16 items-center justify-center px-1 text-center text-xs font-medium"
            >
              {label}
            </Link>
          )
        })}
      </Tabs>
    </div>
  )
}
