import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export default function InteractiveMap({events, latitude, longitude}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const RedDotRef = useRef(null);
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
      zoom: 10
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl());
    mapRef.current.scrollZoom.disable();

    mapRef.current.on("style.load", () => {
      mapRef.current.setFog({});
       
    });

   
    
    // cleanup (important in React) executes when user leaves
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      // Clear old markers
  markersRef.current.forEach(marker => marker.remove());
  markersRef.current = [];
  if(RedDotRef.current){
  RedDotRef.current.remove();
  RedDotRef.current=null;
  }
    };
  }, [hasToken, mapboxToken]
);


//Done after events is loaded in on the main timeline page
useEffect(()=>{
if (!hasToken || !mapRef.current) {
      return;
    }
    if(events){

  // Clear old markers
  markersRef.current.forEach(marker => marker.remove());
  markersRef.current = [];

  const coordinates = [];

  events.forEach((event, index) => {
    if (event.latitude && event.longitude) {
      const lngLat = [event.longitude, event.latitude];

      // Save for path
      coordinates.push(lngLat);

      // Create marker
      const marker = new mapboxgl.Marker()
        .setLngLat(lngLat)
        .setPopup(
    new mapboxgl.Popup().setText(`Log ${index}: ${lngLat[1]}, ${lngLat[0]}`)
  )
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    }
  });
//Delete old path if exists
    if(mapRef.current.getSource('route')){
      mapRef.current.removeLayer('route');
      mapRef.current.removeSource('route');
    }

    //Add path
  if (coordinates.length>1){

    mapRef.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      }
    });

    mapRef.current.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      paint: {
        'line-width': 4,
        'line-color': '#007cbf'
      }
    });
  }
    }
}, events)

  useEffect(() => {
    if (!hasToken || !mapRef.current||!longitude||!latitude) {
      return;
    }
    if(!RedDotRef.current){
      RedDotRef.current = new mapboxgl.Marker({ color: "red" })
      .setLngLat([0, 0])
      .addTo(mapRef.current);
    }
    else {RedDotRef.current.setLngLat([longitude, latitude]);}
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