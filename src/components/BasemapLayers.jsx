import { TileLayer } from 'react-leaflet'

export default function BasemapLayers() {
  return (
    <>
      <style>{`.basemap-dim { filter: brightness(0.72) saturate(0.85); }`}</style>
      {/* ESRI Dark Gray Canvas — base */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='&copy; Esri'
        className="basemap-dim"
        zIndex={1}
      />
      {/* ESRI Dark Gray Reference — cities, roads, interstates */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        attribution='&copy; Esri'
        zIndex={2}
      />
      {/* ESRI World Transportation — highways */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
        attribution='&copy; Esri'
        opacity={0.6}
        zIndex={3}
      />
    </>
  )
}
