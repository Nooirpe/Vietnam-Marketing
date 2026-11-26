import { useEffect, useId, useMemo, type ReactNode } from 'react'
import { geoJSON, Path, type LatLng, type PathOptions } from 'leaflet'
import { GeoJSON, MapContainer, Popup, useMap } from 'react-leaflet'
import type { GeometryCollection } from '../../types/snapshot'
import type { RegionFeature } from './mapLayers'
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
  styleFeature: (feature: RegionFeature, hatch: string) => PathOptions
  onSelect: (id: string) => void
  selectedAreaId: string | null
  popup: ReactNode
}

export function MapCanvas({ scopeKey, geometry, styleFeature, onSelect, selectedAreaId, popup }: MapCanvasProps) {
  const hatchId = `vmi-missing-${useId().replaceAll(':', '')}`
  const anchor = useMemo(() => {
    const selected = geometry?.features.find(feature => feature.properties.geoId === selectedAreaId)
    return selected ? geoJSON(selected).getBounds().getCenter() : null
  }, [geometry, selectedAreaId])

  return (
    <div role="region" aria-label="Bản đồ địa bàn" className="relative">
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <pattern id={hatchId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="8" height="8" fill="#e2e8f0" />
            <path d="M 0 0 L 0 8" stroke="#94a3b8" strokeWidth="2" />
          </pattern>
        </defs>
      </svg>
      <MapContainer center={[16, 107]} zoom={5} maxZoom={17} preferCanvas={false}
        className="vmi-map isolate h-[54vh] min-h-[340px] max-h-[720px] w-full">
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
                if (feature?.properties.geoId) onSelect(feature.properties.geoId)
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
