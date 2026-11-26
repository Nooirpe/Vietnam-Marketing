import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWorkspaceState } from '../app/useWorkspaceState'
import { sortShortlist, type ShortlistSort } from '../domain/workspaceState'
import type { Snapshot } from '../types/snapshot'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { Select } from '../components/ui/Select'
import { useT } from '../locales/useT'

export function ShortlistPage({ snapshot }: { snapshot: Snapshot }) {
  const { t } = useT()
  const { search } = useLocation()
  const { shortlist, storageState, setNote, move, unpin } = useWorkspaceState()
  const [sort, setSort] = useState<ShortlistSort>('manual')
  const names = useMemo(() => new Map(snapshot.units.map((unit) => [unit.id, unit.name])), [snapshot])
  const sorted = sortShortlist(shortlist, sort, names)
  const available = sorted.flatMap((item) => {
    const area = snapshot.unitsById.get(item.geoId)
    return area && area.level !== 'country' ? [{ item, area }] : []
  })
  const firstLevel = available[0]?.area.level
  const compatibleIds = available
    .filter(({ area }) => area.level === firstLevel)
    .map(({ area }) => area.id)
  const compareIds = compatibleIds.slice(0, 3)
  const createLink = (pathname: string, ids: string[]) => {
    const params = new URLSearchParams(search)
    params.set('areas', ids.join(','))
    return { pathname, search: params.toString() }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-3xl font-semibold">{t('shortlist.title')}</h1>
        <p className="mt-2 text-sm text-app-text-muted">{t('shortlist.help')}</p>
      </header>
      {storageState !== 'available' && (
        <p role="status" className="rounded border border-app-border bg-app-surface-muted p-3 text-sm">
          {storageState === 'blocked'
            ? t('shortlist.blocked')
            : t('shortlist.invalidStorage')}
        </p>
      )}
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t('shortlist.pinnedCount', { count: available.length })}</h2>
            {available.length >= 2 && compatibleIds.length !== available.length && (
              <p className="mt-1 text-sm text-app-text-muted">{t('shortlist.sameLevelOnly')}</p>
            )}
          </div>
          <label className="grid min-w-44 gap-1 text-sm">{t('shortlist.sort')}
            <Select value={sort} onChange={(event) => setSort(event.target.value as ShortlistSort)}>
              <option value="manual">{t('shortlist.sortManual')}</option>
              <option value="name">{t('shortlist.sortName')}</option>
              <option value="recent">{t('shortlist.sortRecent')}</option>
            </Select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button as="link" to={createLink('/compare', compareIds)}
            aria-disabled={compareIds.length < 2} tabIndex={compareIds.length < 2 ? -1 : undefined}
            className={compareIds.length < 2 ? 'pointer-events-none opacity-50' : ''}>
            {t('shortlist.compare', { count: compareIds.length })}
          </Button>
          <Button as="link" to={createLink('/decision', compatibleIds)}
            aria-disabled={compatibleIds.length < 2} tabIndex={compatibleIds.length < 2 ? -1 : undefined}
            className={compatibleIds.length < 2 ? 'pointer-events-none opacity-50' : ''}>
            {t('shortlist.score', { count: compatibleIds.length })}
          </Button>
        </div>
        {available.length === 0 ? (
          <p className="mt-5 text-sm text-app-text-muted">
            {t('shortlist.empty')}
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-app-border">
            {available.map(({ item, area }, index) => (
              <li key={item.geoId} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <h3 className="font-semibold">
                    <Link to={{ pathname: `/area/${area.id}`, search }} className="text-brand-700 underline underline-offset-2">
                      {area.name}
                    </Link>
                    <span className="ml-2 text-sm font-normal text-app-text-muted">{area.code}</span>
                  </h3>
                  <label className="mt-2 grid gap-1 text-sm">{t('shortlist.note')}
                    <textarea value={item.note} maxLength={280} rows={2}
                      aria-label={t('shortlist.noteFor', { area: area.name })}
                      className="ui-control min-h-20 resize-y"
                      placeholder={t('shortlist.notePlaceholder')}
                      onChange={(event) => setNote(area.id, event.target.value)} />
                    <span className="text-right text-xs text-app-text-muted">{item.note.length}/280</span>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {sort === 'manual' && (
                    <>
                      <Button variant="secondary" aria-label={t('shortlist.moveUp', { area: area.name })}
                        disabled={index === 0} onClick={() => move(area.id, -1)}>{t('shortlist.up')}</Button>
                      <Button variant="secondary" aria-label={t('shortlist.moveDown', { area: area.name })}
                        disabled={index === available.length - 1} onClick={() => move(area.id, 1)}>{t('shortlist.down')}</Button>
                    </>
                  )}
                  <Button variant="ghost" onClick={() => unpin(area.id)}>{t('shortlist.unpin')}</Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </main>
  )
}
