import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './AppShell'
import { createStaticRepository } from '../data/staticRepository'
import type { Snapshot } from '../types/snapshot'
import { Button } from '../components/ui/Button'
import { I18nProvider } from '../locales/I18nProvider'
import { useT } from '../locales/useT'

const repositories = {
  schematic: createStaticRepository(`${import.meta.env.BASE_URL}data/v1/`),
  boundary: createStaticRepository(`${import.meta.env.BASE_URL}data/v1-boundaries/`),
}
const MapWorkspace = lazy(() => import('../pages/MapWorkspace').then((module) => ({ default: module.MapWorkspace })))
const MarketProfile = lazy(() => import('../pages/MarketProfile').then((module) => ({ default: module.MarketProfile })))
const CompareMarkets = lazy(() => import('../pages/CompareMarkets').then((module) => ({ default: module.CompareMarkets })))
const DecisionWorkbench = lazy(() => import('../pages/DecisionWorkbench').then((module) => ({ default: module.DecisionWorkbench })))
const ShortlistPage = lazy(() => import('../pages/ShortlistPage').then((module) => ({ default: module.ShortlistPage })))

type LoadState = { status: 'loading' } | { status: 'ready'; snapshot: Snapshot } | { status: 'error'; message: string }

export function App() {
  const { search } = useLocation()
  const mode = new URLSearchParams(search).get('snapshot') === 'demo' ? 'schematic' : 'boundary'
  return <I18nProvider><WorkspaceRoutes key={mode} mode={mode} /></I18nProvider>
}

function WorkspaceRoutes({ mode }: { mode: keyof typeof repositories }) {
  const { t } = useT()
  const repository = repositories[mode]
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    repository.loadSnapshot().then(
      (snapshot) => { if (active) setLoad({ status: 'ready', snapshot }) },
      (error: unknown) => { if (active) setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) }) },
    )
    return () => { active = false }
  }, [attempt, repository])

  if (load.status !== 'ready') return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-4 text-2xl font-semibold">{t('app.title')}</h1>
      {load.status === 'loading' ? <p role="status">{t('app.loadingData')}</p> : (
        <div role="alert">
          <p>{t('app.loadFailed')} {load.message}</p>
          <Button className="mt-4" onClick={() => {
            setLoad({ status: 'loading' })
            setAttempt((value) => value + 1)
          }}>{t('decision.retry')}</Button>
        </div>
      )}
    </main>
  )

  return (
    <Suspense fallback={<p className="p-8" role="status">{t('app.opening')}</p>}>
      <AppShell snapshot={load.snapshot}>
        <Routes>
          <Route path="/map" element={<MapWorkspace snapshot={load.snapshot} loadGeometry={repository.loadGeometry} />} />
          <Route path="/area/:geoId" element={<MarketProfile snapshot={load.snapshot} />} />
          <Route path="/compare" element={<CompareMarkets snapshot={load.snapshot} />} />
          <Route path="/decision" element={<DecisionWorkbench snapshot={load.snapshot} loadGeometry={repository.loadGeometry} />} />
          <Route path="/shortlist" element={<ShortlistPage snapshot={load.snapshot} />} />
          <Route path="*" element={<Navigate to={{ pathname: '/map', search: mode === 'schematic' ? '?snapshot=demo' : '' }} replace />} />
        </Routes>
      </AppShell>
    </Suspense>
  )
}
