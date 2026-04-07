import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export default function InteractiveMap({ longitude, latitude }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const mapboxToken =
    (typeof process !== "undefined" && process.env && process.env.VITE_MAPBOX_API_KEY) ||
    import.meta.env.VITE_MAPBOX_API_KEY ||
    "";
  const hasToken = !!mapboxToken;

  useEffect(() => {
    if (!hasToken || !mapContainer.current || mapRef.current) {
      return;
    }

    mapboxgl.accessToken = mapboxToken;
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/standard-satellite",
      projection: "globe",
      zoom: 10,
      center: [longitude, latitude],
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl());
    mapRef.current.scrollZoom.disable();

    mapRef.current.on("style.load", () => {
      mapRef.current.setFog({});
    });

    // Create marker
    markerRef.current = new mapboxgl.Marker()
      .setLngLat([longitude, latitude])
      .addTo(mapRef.current);
    //marker ref can be used to add more markers many times

    //Add layer for path
    mapRef.current.on('load', () => {
  mapRef.current.addSource('route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [-75.6972, 45.4215], // Ottawa
          [-73.5673, 45.5017]  // Montreal
        ]
      }
    }
  });

  mapRef.current.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#007cbf',
      'line-width': 4
    }
  });
});
    // cleanup (important in React)
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
    };
  }, [hasToken, latitude, longitude, mapboxToken]);

  useEffect(() => {
    if (!hasToken || !mapRef.current || !markerRef.current) {
      return;
    }
    markerRef.current.setLngLat([longitude, latitude]);
    mapRef.current.easeTo({ center: [longitude, latitude], duration: 500 });
  }, [hasToken, latitude, longitude]);

  if (!hasToken) {
    return (
      <div style={{ width: "100%", minHeight: "160px", padding: "12px", borderRadius: "8px", background: "rgba(0,0,0,0.08)" }}>
        Map unavailable: missing `VITE_MAPBOX_API_KEY`.
      </div>
    );
  }

  return (
    <div
      ref={mapContainer}
      style={{ width: "100%", height: "100vh" }}
    />
  );
}