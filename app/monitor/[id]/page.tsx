'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Check, Plane } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Polygon } from 'react-leaflet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import io, { Socket } from 'socket.io-client';
import { toast, Toaster } from 'sonner';
import { 
  Play, Pause, StopCircle, MapPin, Battery, Signal, Activity, 
  Clock, AlertCircle, Wifi, Satellite, Wind, Settings 
} from 'lucide-react';

// Fix Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom marker for current position (drone)
const createDroneMarker = (battery: number) => {
  return L.divIcon({
    html: `
      <div style="
        background: linear-gradient(135deg, 
          ${battery > 50 ? '#10b981' : battery > 20 ? '#f59e0b' : '#ef4444'}, 
          ${battery > 50 ? '#059669' : battery > 20 ? '#d97706' : '#dc2626'});
        width: 24px; height: 24px; border-radius: 50%; 
        border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; color: white; font-weight: bold;
      ">
        ${Math.round(battery)}%
      </div>
    `,
    className: 'drone-marker',
    iconAnchor: [12, 12],
  });
};

interface Mission {
  id: string;
  title: string;
  status: 'planned' | 'in-progress' | 'paused' | 'completed' | 'aborted';
  progress: number;
  eta: string;
  duration: string | null;
  distance: number;
  coverage: number;
  params: {
    altitude: number;
    speed: number;
    pattern: string;
    sensors: string[];
  };
  waypoints: Array<{ lat: number; lng: number; alt: number }>;
  area: any;
  droneId: string;
  drone: {
    model: string;
    battery: number;
    vitals: {
      signal: string;
      gps: number;
      rssi: number;
    };
  };
  createdAt: string;
}

interface Telemetry {
  battery: number;
  signal: string;
  gps: number;
  rssi: number;
  speed: number;
  altitude: number;
  heading: number;
}

const statusConfig = {
  planned: { color: 'gray', label: 'Ready to Start' },
  'in-progress': { color: 'blue', label: 'Active' },
  paused: { color: 'yellow', label: 'Paused' },
  completed: { color: 'green', label: 'Complete' },
  aborted: { color: 'red', label: 'Aborted' },
} as const;

function getSignalColor(signal: string) {
  switch (signal.toLowerCase()) {
    case 'excellent':
      return 'text-green-400';
    case 'good':
      return 'text-yellow-400';
    case 'poor':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

export default function MissionMonitor() {
  const { id } = useParams();
  const [mission, setMission] = useState<Mission | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [currentPosition, setCurrentPosition] = useState<[number, number]>([0, 0]);
  const [isConnected, setIsConnected] = useState(false);
  const [controlsEnabled, setControlsEnabled] = useState(true);
  const [autoCamera, setAutoCamera] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  const mapRef = useRef<L.Map>(null);
  const socketRef = useRef<Socket | null>(null);
  const animationRef = useRef<number | null>(null);

  // Fetch initial mission data
  useEffect(() => {
    if (!id) return;
    
    const fetchMission = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/missions/${id}`);
        if (!response.ok) throw new Error('Mission not found');
        
        const data = await response.json();
        setMission(data);
        
        // Initialize telemetry from drone data
        if (data.drone) {
          setTelemetry({
            battery: data.drone.battery,
            signal: data.drone.vitals.signal,
            gps: data.drone.vitals.gps,
            rssi: data.drone.vitals.rssi,
            speed: data.params.speed || 10,
            altitude: data.params.altitude,
            heading: 0,
          });
          
          // Set initial position to first waypoint
          if (data.waypoints && data.waypoints.length > 0) {
            setCurrentPosition([data.waypoints[0].lat, data.waypoints[0].lng]);
          }
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching mission:', error);
        toast.error('Failed to load mission data');
        setLoading(false);
      }
    };

    fetchMission();
  }, [id]);

  // Socket.io real-time connection
  useEffect(() => {
    if (!id || !mission) return;

    const socket = io({
      path: '/api/socket',
      transports: ['websocket', 'polling'],
      query: { missionId: id },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to mission control server');
      setIsConnected(true);
      socket.emit('joinMission', id);
      
      // Request current mission state
      socket.emit('getMissionState', id);
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from mission control');
      setIsConnected(false);
      setAlerts(prev => [...prev, 'Connection lost - attempting to reconnect...']);
    });

    // Real-time mission updates
    socket.on('missionUpdate', (updatedMission: Mission) => {
      console.log('📡 Mission update received:', updatedMission.status, updatedMission.progress);
      setMission(updatedMission);
      setLastUpdate(new Date());
      
      // Clear stale alerts
      setAlerts(prev => prev.filter(alert => !alert.includes('low battery') && !alert.includes('signal')));
    });

    // Real-time telemetry updates
    socket.on('telemetryUpdate', (telemetryData: Telemetry) => {
      console.log('📡 Telemetry update:', telemetryData);
      setTelemetry(telemetryData);
      
      // Update position and animate
      if (telemetryData && mission?.waypoints) {
        animateToPosition(telemetryData);
      }
      
      // Safety alerts
      checkSafetyAlerts(telemetryData);
      
      setLastUpdate(new Date());
    });

    // Connection status
    socket.on('connectionStatus', (status: string) => {
      if (status === 'connected') {
        setIsConnected(true);
        setAlerts(prev => prev.filter(a => !a.includes('Connection')));
      }
    });

    // Cleanup
    return () => {
      socket.disconnect();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [id, mission]);

  // Animate drone movement along flight path
  const animateToPosition = (telemetry: Telemetry) => {
    if (!mission?.waypoints || !mapRef.current) return;

    const totalWaypoints = mission.waypoints.length;
    const progress = mission.progress / 100;
    const targetIndex = Math.floor((totalWaypoints - 1) * progress);
    
    if (targetIndex >= 0 && targetIndex < mission.waypoints.length) {
      const targetPosition: [number, number] = [
        mission.waypoints[targetIndex].lat,
        mission.waypoints[targetIndex].lng,
      ];
      
      setCurrentPosition(targetPosition);
      
      // Smooth camera follow if enabled
      if (autoCamera && mapRef.current) {
        mapRef.current.setView(targetPosition, 16);
      }
    }
  };

  // Safety monitoring
  const checkSafetyAlerts = (telemetry: Telemetry) => {
    const newAlerts: string[] = [];
    
    // Low battery alert
    if (telemetry.battery < 20) {
      newAlerts.push(`⚠️ Low battery: ${telemetry.battery}% - Consider aborting`);
    }
    
    // Signal loss
    if (telemetry.rssi < -85) {
      newAlerts.push(`📡 Weak signal: ${telemetry.rssi}dBm - Risk of lost control`);
    }
    
    // GPS issues
    if (telemetry.gps < 6) {
      newAlerts.push(`🛰️ Poor GPS: ${telemetry.gps} satellites - Navigation accuracy reduced`);
    }
    
    // Update alerts
    if (newAlerts.length > 0) {
      setAlerts(newAlerts);
      newAlerts.forEach(alert => toast.warning(alert));
    }
  };

  // Mission control actions
  const sendControlAction = async (action: 'start' | 'pause' | 'resume' | 'abort') => {
    if (!id || !mission) return;
    
    try {
      const response = await fetch(`/api/missions/${id}/control`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      
      if (!response.ok) {
        throw new Error(`Control action failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`✅ ${action.toUpperCase()} command sent:`, result);
      toast.success(`${action.toUpperCase()} command acknowledged`);
      
      // Emit via socket as well
      if (socketRef.current) {
        socketRef.current.emit('missionControl', { missionId: id, action });
      }
    } catch (error) {
      console.error('Control error:', error);
      toast.error(`Failed to send ${action} command`);
    }
  };

  // Calculate ETA
  const calculateETA = (mission: Mission, currentProgress: number) => {
    if (!mission.eta || mission.status !== 'in-progress') return 'N/A';
    
    const [minutes] = mission.eta.split('min').map(Number);
    const remainingProgress = 100 - currentProgress;
    const remainingTime = Math.round((minutes * 60 * remainingProgress) / 100);
    
    const hours = Math.floor(remainingTime / 60);
    const mins = remainingTime % 60;
    
    return hours > 0 
      ? `${hours}h ${mins}m` 
      : `${mins}m`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-6 p-8 max-w-md">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
            <Activity className="absolute inset-0 h-16 w-16 text-blue-200 mx-auto" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Loading Mission Control</h2>
            <p className="text-gray-600">Establishing real-time connection...</p>
          </div>
          <div className="space-y-2 text-sm text-gray-500">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span>Fetching mission data</span>
            </div>
            <div className="flex items-center justify-center space-x-2 opacity-75">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse delay-150"></div>
              <span>Connecting telemetry stream</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4 p-8">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto" />
          <h2 className="text-xl font-semibold text-gray-900">Mission Not Found</h2>
          <p className="text-gray-600">The requested mission could not be located.</p>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Return to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isActive = mission.status === 'in-progress';
  const isPaused = mission.status === 'paused';
  const isCompleted = mission.status === 'completed';
  const canControl = ['planned', 'in-progress', 'paused'].includes(mission.status);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <style jsx global>{`
        .leaflet-container {
          height: 600px;
          border-radius: 0.5rem;
          border: 1px solid #374151;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
        }
        .leaflet-popup-content-wrapper {
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 0.5rem;
          color: white;
        }
        .leaflet-popup-tip {
          background: #374151;
          box-shadow: none;
        }
      `}</style>
      
      <Toaster position="top-right" richColors />
      
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Mission Header */}
        <Card className="bg-gray-800 border-gray-700 mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-3">
                  <div className={`p-2 rounded-full ${
                    isActive ? 'bg-blue-500/20 border-blue-500/30' :
                    isCompleted ? 'bg-green-500/20 border-green-500/30' :
                    isPaused ? 'bg-yellow-500/20 border-yellow-500/30' :
                    'bg-gray-500/20 border-gray-500/30'
                  } border`}>
                    {isActive ? <Activity className="h-5 w-5 text-blue-400" /> :
                     isCompleted ? <Check className="h-5 w-5 text-green-400" /> :
                     isPaused ? <Pause className="h-5 w-5 text-yellow-400" /> :
                     <Clock className="h-5 w-5 text-gray-400" />}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white">{mission.title}</h1>
                    <div className="flex items-center space-x-4 text-sm text-gray-300 mt-1">
                      <Badge 
                        className={`${
                          isActive ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                          isCompleted ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                          isPaused ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                          'bg-gray-500/20 text-gray-300 border-gray-500/30'
                        }`}
                      >
                        {mission.status.replace('-', ' ').toUpperCase()}
                      </Badge>
                      <span>ID: {mission.id}</span>
                      <span>{mission.drone?.model || 'Unassigned'}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3 flex-shrink-0">
                <div className="flex items-center space-x-2 text-sm text-gray-400">
                  <Signal className="h-4 w-4" />
                  <span>{isConnected ? '🟢 Live' : '🔴 Disconnected'}</span>
                </div>
                
                <div className="flex items-center space-x-2 text-sm text-gray-400">
                  <Clock className="h-4 w-4" />
                  <span>{lastUpdate ? `Updated ${Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s ago` : 'Never'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Control Grid */}
        <div className="grid lg:grid-cols-4 gap-6 mb-6">
          {/* Live Map */}
          <Card className="lg:col-span-3 bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-white">
                <MapPin className="h-5 w-5" />
                <span>Live Flight Path</span>
                {mission.waypoints && (
                  <Badge variant="outline" className="text-xs border-gray-600 ml-2">
                    {mission.waypoints.length} waypoints
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <MapContainer
                center={mission.waypoints?.[0] ? [mission.waypoints[0].lat, mission.waypoints[0].lng] : [40.7128, -74.006]}
                zoom={16}
                style={{ height: '500px', width: '100%', borderRadius: '0.5rem' }}
                ref={mapRef}
                className="rounded-b-lg"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                
                {/* Survey Area (if defined) */}
                {mission.area && mission.area.type === 'Polygon' && (
                  <Polygon
                    positions={mission.area.coordinates[0].map((coord: [number, number]) => [coord[1], coord[0]])}
                    pathOptions={{
                      color: 'blue',
                      weight: 2,
                      opacity: 0.7,
                      fillColor: 'blue',
                      fillOpacity: 0.1,
                    }}
                  />
                )}
                
                {/* Full flight path */}
                {mission.waypoints && mission.waypoints.length > 1 && (
                  <Polyline
                    positions={mission.waypoints.map(wp => [wp.lat, wp.lng])}
                    pathOptions={{
                      color: isActive ? '#3b82f6' : '#6b7280',
                      weight: 3,
                      opacity: isActive ? 0.8 : 0.5,
                      dashArray: isActive ? undefined : '5, 10',
                    }}
                  />
                )}
                
                {/* Current position marker */}
                {currentPosition[0] !== 0 && currentPosition[1] !== 0 && telemetry && (
                  <Marker 
                    position={currentPosition}
                    icon={createDroneMarker(telemetry.battery)}
                  >
                    <Popup className="min-w-[280px] bg-gray-800 text-white border-gray-600">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-white">{mission.drone?.model}</h3>
                          <Battery className={`h-4 w-4 ${
                            telemetry.battery > 50 ? 'text-green-400' :
                            telemetry.battery > 20 ? 'text-yellow-400' : 'text-red-400'
                          }`} />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1">
                            <div className="flex items-center text-xs text-gray-300">
                              <Battery className="h-3 w-3 mr-1" />
                              <span>Battery</span>
                            </div>
                            <div className="text-lg font-bold text-white">{telemetry.battery}%</div>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center text-xs text-gray-300">
                              <Signal className="h-3 w-3 mr-1" />
                              <span>Signal</span>
                            </div>
                            <div className={`text-sm font-medium ${
                              telemetry.rssi > -60 ? 'text-green-400' :
                              telemetry.rssi > -75 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {telemetry.signal} ({telemetry.rssi}dBm)
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center text-xs text-gray-300">
                              <Satellite className="h-3 w-3 mr-1" />
                              <span>GPS</span>
                            </div>
                            <div className="text-sm font-medium">{telemetry.gps} satellites</div>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center text-xs text-gray-300">
                              <Activity className="h-3 w-3 mr-1" />
                              <span>Speed</span>
                            </div>
                            <div className="text-sm font-medium">{telemetry.speed} m/s</div>
                          </div>
                        </div>
                        
                        <div className="pt-2 mt-2 border-t border-gray-600 text-xs text-gray-400">
                          Last update: {lastUpdate?.toLocaleTimeString() || 'Never'}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            </CardContent>
          </Card>

          {/* Mission Controls */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2 text-white">
                <Settings className="h-5 w-5" />
                <span>Mission Controls</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Control Buttons */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {canControl && (
                    <>
                      <Button
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        onClick={() => sendControlAction('start')}
                        disabled={!controlsEnabled || mission.status !== 'planned'}
                        className={`${
                          isActive ? 'bg-green-600 hover:bg-green-700' : 
                          'border-gray-600 text-white hover:bg-gray-700'
                        }`}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        {isActive ? 'Active' : 'Start Mission'}
                      </Button>
                      
                      {isActive && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendControlAction('pause')}
                            disabled={!controlsEnabled}
                            className="border-yellow-500 text-yellow-300 hover:bg-yellow-500/10"
                          >
                            <Pause className="h-4 w-4 mr-2" />
                            Pause
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendControlAction('resume')}
                            disabled={!controlsEnabled || !isPaused}
                            className="border-blue-500 text-blue-300 hover:bg-blue-500/10"
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Resume
                          </Button>
                        </>
                      )}
                      
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => sendControlAction('abort')}
                        disabled={!controlsEnabled || !isActive}
                        className="bg-red-600 hover:bg-red-700 col-span-2"
                      >
                        <StopCircle className="h-4 w-4 mr-2" />
                        Emergency Abort
                      </Button>
                    </>
                  )}
                </div>
                
                {/* Control Settings */}
                <div className="space-y-3 pt-2 border-t border-gray-600">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300 flex items-center space-x-2">
                      <Settings className="h-4 w-4" />
                      <span>Enable Controls</span>
                    </span>
                    <Switch 
                      checked={controlsEnabled} 
                      onCheckedChange={setControlsEnabled}
                      disabled={isCompleted}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300 flex items-center space-x-2">
                      <MapPin className="h-4 w-4" />
                      <span>Auto Camera Follow</span>
                    </span>
                    <Switch 
                      checked={autoCamera} 
                      onCheckedChange={setAutoCamera}
                      disabled={!isActive}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mission Progress & Telemetry */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Progress Overview */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2 text-white">
                <Activity className="h-5 w-5" />
                <span>Mission Progress</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">Progress</span>
                    <span className="font-mono text-white">{mission.progress}%</span>
                  </div>
                  <Progress 
                    value={mission.progress} 
                    className={`h-3 ${
                      mission.progress === 100 ? 'from-green-500 to-green-600' :
                      isActive ? 'from-blue-500 to-blue-600' :
                      'from-gray-500 to-gray-600'
                    }`}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      <span>ETA</span>
                    </div>
                    <div className="text-white font-mono">
                      {calculateETA(mission, mission.progress)}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <Activity className="h-3 w-3" />
                      <span>Duration</span>
                    </div>
                    <div className="text-white font-mono">
                      {mission.duration || (isActive ? 'Live' : 'N/A')}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <MapPin className="h-3 w-3" />
                    <span>Distance</span>
                  </div>
                  <div className="text-white font-mono">{mission.distance?.toFixed(1)} km</div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Coverage</span>
                    <div className={`w-2 h-2 rounded-full ${
                      mission.coverage >= 90 ? 'bg-green-500' :
                      mission.coverage >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                    }`} />
                  </div>
                  <div className="text-white font-mono">{mission.coverage}%</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Telemetry */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2 text-white">
                <Signal className="h-5 w-5" />
                <span>Live Telemetry</span>
                {telemetry && lastUpdate && (
                  <span className="text-xs text-gray-400 ml-2">
                    {Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s ago
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {telemetry ? (
                <div className="space-y-4">
                  {/* Battery */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <div className="flex items-center space-x-2">
                        <Battery className="h-3 w-3" />
                        <span>Battery</span>
                      </div>
                      <span className={`text-sm ${
                        telemetry.battery > 50 ? 'text-green-400' :
                        telemetry.battery > 20 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {telemetry.battery}%
                      </span>
                    </div>
                    <Progress 
                      value={telemetry.battery} 
                      className={`h-2 ${
                        telemetry.battery > 50 ? 'from-green-500 to-green-600' :
                        telemetry.battery > 20 ? 'from-yellow-500 to-yellow-600' : 'from-red-500 to-red-600'
                      }`}
                    />
                  </div>
                  
                  {/* Signal Strength */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <div className="flex items-center space-x-2">
                        <Wifi className="h-3 w-3" />
                        <span>Signal</span>
                      </div>
                      <span className={`text-sm font-mono ${getSignalColor(telemetry.signal)}`}>
                        {telemetry.rssi}dBm
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-gray-400">
                      <div className={`w-2 h-2 rounded-full ${
                        telemetry.rssi > -60 ? 'bg-green-500' :
                        telemetry.rssi > -75 ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span>{telemetry.signal}</span>
                    </div>
                  </div>
                  
                  {/* GPS Status */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <div className="flex items-center space-x-2">
                        <Satellite className="h-3 w-3" />
                        <span>GPS</span>
                      </div>
                      <span className="text-sm font-mono">{telemetry.gps} sats</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          telemetry.gps >= 10 ? 'bg-green-500' :
                          telemetry.gps >= 6 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(telemetry.gps * 10, 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Flight Data */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-gray-400">
                        <Activity className="h-3 w-3" />
                        <span>Speed</span>
                      </div>
                      <div className="text-white font-mono">{telemetry.speed} m/s</div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-gray-400">
                        <Plane className="h-3 w-3" />
                        <span>Altitude</span>
                      </div>
                      <div className="text-white font-mono">{telemetry.altitude}m</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Signal className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">No telemetry data available</p>
                  <p className="text-xs mt-1">Mission not started or drone offline</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Safety Alerts */}
        {alerts.length > 0 && (
          <Card className="bg-red-900/20 border-red-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center space-x-2 text-red-300">
                <AlertCircle className="h-5 w-5" />
                <span>Safety Alerts</span>
                <Badge variant="destructive" className="ml-2">
                  {alerts.length} active
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alerts.map((alert, index) => (
                  <Alert key={index} variant="destructive" className="border-red-500/50 bg-red-900/10">
                    <AlertDescription className="text-red-300 text-sm flex items-center justify-between">
                      <span>{alert}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAlerts(prev => prev.filter((_, i) => i !== index))}
                        className="h-6 px-2 text-red-300 hover:text-white"
                      >
                        Dismiss
                      </Button>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Connection Status */}
        <Card className={`border-${isConnected ? 'green' : 'red'}-500/30 bg-${isConnected ? 'green' : 'red'}-900/10`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm font-medium text-white">
                  {isConnected ? '🟢 Live Connection' : '🔴 Connection Lost'}
                </span>
              </div>
              {!isConnected && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.location.reload()}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Reconnect
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}