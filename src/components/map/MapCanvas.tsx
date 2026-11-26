import { useEffect, useId, useMemo, type ReactNode, type Ref } from 'react'
import { geoJSON, Path, type LatLng, type PathOptions } from 'leaflet'
import { GeoJSON, MapContainer, Popup, useMap, useMapEvents } from 'react-leaflet'
import type { GeometryCollection } from '../../types/snapshot'
import type { RegionFeature } from './mapLayers'
import { useReducedMotion } from '../ui/useReducedMotion'
import { useT } from '../../locales/useT'
import './map.css'

interface GeometryViewportProps {
  scopeKey: string
  geometry: GeometryCollection | null
}

const savedViewports = new Map<string, { center: LatLng; zoom: number }>()

function GeometryViewport({ scopeKey, geometry }: GeometryViewportProps) {
  const map = useMap()

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])

  useEffect(() => {
    if (!geometry?.features.length) return
    const previous = savedViewports.get(scopeKey)
    if (previous) {
      map.setView(previous.center, previous.zoom, { animate: false })
    } else {
      map.fitBounds(geoJSON(geometry).getBounds(), { padding: [24, 24], maxZoom: 13, animate: false })
    }

    function saveViewport() {
      savedViewports.set(scopeKey, { center: map.getCenter(), zoom: map.getZoom() })
    }
    saveViewport()
    map.on('moveend', saveViewport)
    return () => { map.off('moveend', saveViewport) }
  }, [geometry, map, scopeKey])

  return null
}

interface MapCanvasProps extends GeometryViewportProps {
  className?: string
  captureRef?: Ref<HTMLDivElement>
  styleFeature: (feature: RegionFeature, hatch: string) => PathOptions
  onSelect: (id: string) => void
  selectedAreaId: string | null
  popup: ReactNode
  selectingPoint: boolean
  onSelectPoint: (latitude: number, longitude: number) => void
}

function PointClickHandler({ active, onSelectPoint }: {
  active: boolean
  onSelectPoint: (latitude: number, longitude: number) => void
}) {
  useMapEvents({
    click(event) {
      if (active) onSelectPoint(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

export function MapCanvas({
  className, captureRef, scopeKey, geometry, styleFeature, onSelect, selectedAreaId, popup,
  selectingPoint, onSelectPoint,
}: MapCanvasProps) {
  const { t } = useT()
  const hatchId = `vmi-missing-${useId().replaceAll(':', '')}`
  const reducedMotion = useReducedMotion()
  const anchor = useMemo(() => {
    const selected = geometry?.features.find(feature => feature.properties.geoId === selectedAreaId)
    return selected ? geoJSON(selected).getBounds().getCenter() : null
  }, [geometry, selectedAreaId])

  return (
    <div ref={captureRef} role="region" aria-label={t('map.title')}
      className={`relative ${selectingPoint ? 'cursor-crosshair' : ''} ${className ?? ''}`}>
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <pattern id={hatchId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="8" height="8" fill="var(--app-map-missing)" />
            <path d="M 0 0 L 0 8" stroke="var(--app-map-missing-line)" strokeWidth="2" />
          </pattern>
        </defs>
      </svg>
      <MapContainer center={[16, 107]} zoom={5} maxZoom={17} preferCanvas={false}
        zoomAnimation={!reducedMotion} fadeAnimation={!reducedMotion} markerZoomAnimation={!reducedMotion}
        className={`vmi-map isolate h-[54vh] min-h-[340px] max-h-[720px] w-full ${selectingPoint ? 'vmi-map-selecting' : ''}`}>
        <PointClickHandler active={selectingPoint} onSelectPoint={onSelectPoint} />
        <GeometryViewport scopeKey={scopeKey} geometry={geometry} />
        {geometry && (
          <GeoJSON
            key={scopeKey}
            data={geometry}
            style={(feature) => feature ? styleFeature(feature as RegionFeature, `url(#${hatchId})`) : {}}
            onEachFeature={(feature, layer) => {
              if (!(layer instanceof Path)) return
              layer.on('add', () => {
                layer.getElement()?.setAttribute('data-geo-id', feature.properties.geoId)
              })
            }}
            eventHandlers={{
              click: (event) => {
                const feature = event.propagatedFrom?.feature as RegionFeature | undefined
                if (!selectingPoint && feature?.properties.geoId) onSelect(feature.properties.geoId)
              },
            }}
          />
        )}
        {anchor && popup && (
          <Popup key={selectedAreaId} position={anchor} closeButton={false}
            closeOnClick={false} closeOnEscapeKey={false} maxWidth={310} maxHeight={250} autoPanPadding={[20, 20]}>
            {popup}
          </Popup>
        )}
      </MapContainer>
    </div>
  )
}
