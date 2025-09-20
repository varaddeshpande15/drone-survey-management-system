// lib/patterns.ts
import * as L from 'leaflet';

export interface Waypoint {
  lat: number;
  lng: number;
  alt: number;
}

export interface PatternParams {
  altitude: number;
  overlap: number;
  speed?: number;
}

export const generateCrosshatchPattern = (bounds: L.LatLngBounds, params: PatternParams): Waypoint[] => {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const latStep = (ne.lat - sw.lat) * (1 - params.overlap / 100);
  const lngStep = (ne.lng - sw.lng) * (1 - params.overlap / 100);
  
  const waypoints: Waypoint[] = [];
  
  // Horizontal lines (zigzag)
  for (let lat = sw.lat; lat <= ne.lat; lat += latStep) {
    const rowWaypoints: Waypoint[] = [];
    const startLng = lat % (2 * lngStep) < lngStep ? sw.lng : ne.lng;
    const endLng = lat % (2 * lngStep) < lngStep ? ne.lng : sw.lng;
    
    // Start point
    rowWaypoints.push({ lat, lng: startLng, alt: params.altitude });
    
    // End point
    rowWaypoints.push({ lat, lng: endLng, alt: params.altitude });
    
    waypoints.push(...rowWaypoints);
  }
  
  // Add connection waypoints between rows
  for (let i = 0; i < waypoints.length - 2; i += 2) {
    if (i + 3 < waypoints.length) {
      const connection = {
        lat: (waypoints[i + 1].lat + waypoints[i + 2].lat) / 2,
        lng: waypoints[i + 1].lng,
        alt: params.altitude,
      };
      waypoints.splice(i + 2, 0, connection);
    }
  }
  
  return waypoints;
};

export const generateBoxPattern = (bounds: L.LatLngBounds, params: PatternParams): Waypoint[] => {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const margin = Math.min(ne.lat - sw.lat, ne.lng - sw.lng) * (params.overlap / 100) * 0.05;
  
  const waypoints: Waypoint[] = [
    // Bottom side
    { lat: sw.lat + margin, lng: sw.lng + margin, alt: params.altitude },
    { lat: sw.lat + margin, lng: ne.lng - margin, alt: params.altitude },
    
    // Right side
    { lat: sw.lat + margin, lng: ne.lng - margin, alt: params.altitude },
    { lat: ne.lat - margin, lng: ne.lng - margin, alt: params.altitude },
    
    // Top side
    { lat: ne.lat - margin, lng: ne.lng - margin, alt: params.altitude },
    { lat: ne.lat - margin, lng: sw.lng + margin, alt: params.altitude },
    
    // Left side
    { lat: ne.lat - margin, lng: sw.lng + margin, alt: params.altitude },
    { lat: sw.lat + margin, lng: sw.lng + margin, alt: params.altitude },
  ];
  
  return waypoints;
};

export const calculateMissionStats = (waypoints: Waypoint[], speed: number = 10): {
  distance: number;
  duration: number;
  waypoints: number;
} => {
  let totalDistance = 0;
  
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const current = waypoints[i];
    
    // Haversine distance approximation
    const latDiff = Math.abs(current.lat - prev.lat) * 111000;
    const lngDiff = Math.abs(current.lng - prev.lng) * 111000 * Math.cos(current.lat * Math.PI / 180);
    totalDistance += Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  }
  
  const duration = Math.round((totalDistance / speed) / 60); // minutes
  
  return {
    distance: Math.round(totalDistance / 1000), // km
    duration,
    waypoints: waypoints.length,
  };
};