//// webapp/Frontend/src/components/InteractiveMap.jsx

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
const mapboxKey = import.meta.env.VITE_MAPBOX_API_KEY;

export default function InteractiveMap({ longitude, latitude }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
   mapboxgl.accessToken = mapboxKey;
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

    //Create popup
    const popup = new mapboxgl.Popup({ offset: 25 })
  .setText("Log 1");
  
    // Create marker
    markerRef.current = new mapboxgl.Marker()
      .setLngLat([longitude, latitude])
      .setPopup(popup)
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
    return () => mapRef.current.remove();
  }, []);

  return (
    <div
      ref={mapContainer}
      style={{ width: "100%", height: "100vh" }}
    />
  );
}