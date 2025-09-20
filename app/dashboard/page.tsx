'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Button } from '@/components/ui/button';
import { RefreshCw, MapPin, Battery, Signal, Users } from 'lucide-react';

// Fix Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Drone {
  id: string;
  model: string;
  status: string;
  battery: number;
  vitals: {
    signal: string;
    gps: number;
    rssi: number;
  };
  location: {
    lat: number;
    lng: number;
    alt: number;
  } | null;
  createdAt: string;
}

interface FleetStats {
  available: number;
  inMission: number;
  charging: number;
  maintenance: number;
  total: number;
}

const statusColors = {
  available: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-50',
  'in-mission': 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-50',
  charging: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-50',
  maintenance: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-50',
  aborted: 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-50',
} as const;

const signalColors = {
  strong: 'text-green-600',
  moderate: 'text-yellow-600',
  weak: 'text-red-600',
  none: 'text-gray-400',
} as const;

export default function FleetDashboard() {
  const [drones, setDrones] = useState<Drone[]>([]);
  const [stats, setStats] = useState<FleetStats>({
    available: 0,
    inMission: 0,
    charging: 0,
    maintenance: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch initial drone data
  const fetchDrones = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Fetching drone data...');
      const response = await fetch('/api/drones');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('📡 Received drone data:', data);
      
      if (!data.drones || !Array.isArray(data.drones)) {
        throw new Error('Invalid drone data format');
      }
      
      setDrones(data.drones);
      
      // Calculate stats
      const fleetStats = data.drones.reduce(
        (acc: FleetStats, drone: Drone) => {
          acc.total += 1;
          switch (drone.status) {
            case 'available': acc.available += 1; break;
            case 'in-mission': acc.inMission += 1; break;
            case 'charging': acc.charging += 1; break;
            case 'maintenance': acc.maintenance += 1; break;
          }
          return acc;
        },
        { available: 0, inMission: 0, charging: 0, maintenance: 0, total: 0 }
      );
      
      setStats(fleetStats);
      setLastUpdated(new Date());
      console.log('✅ Fleet data loaded successfully');
    } catch (err) {
      console.error('❌ Error fetching drones:', err);
      setError(err instanceof Error ? err.message : 'Failed to load fleet data');
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    fetchDrones();
  }, []);

  // Simulate real-time updates every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('⏰ Simulating real-time update...');
      // Simulate battery drain for in-mission drones
      setDrones(prevDrones =>
        prevDrones.map(drone => {
          if (drone.status === 'in-mission' && drone.battery > 15) {
            const newBattery = Math.max(15, drone.battery - Math.floor(Math.random() * 2));
            const newRssi = Math.max(-90, drone.vitals.rssi - Math.floor(Math.random() * 2));
            
            return {
              ...drone,
              battery: newBattery,
              vitals: {
                ...drone.vitals,
                rssi: newRssi,
                signal: newRssi > -60 ? 'strong' : newRssi > -75 ? 'moderate' : 'weak',
              },
            };
          }
          return drone;
        })
      );
      setLastUpdated(new Date());
    }, 15000); // Every 15 seconds for demo

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    return statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-50';
  };

  const getSignalColor = (signal: string) => {
    return signalColors[signal as keyof typeof signalColors] || 'text-gray-600';
  };

  const getBatteryColor = (battery: number) => {
    if (battery > 80) return 'from-green-500 to-green-600';
    if (battery > 50) return 'from-yellow-500 to-yellow-600';
    if (battery > 20) return 'from-orange-500 to-orange-600';
    return 'from-red-500 to-red-600';
  };

  const formatLocation = (location: Drone['location']) => {
    if (!location) return <span className="text-gray-400 italic">Location unavailable</span>;
    return (
      <div className="space-y-1 text-sm">
        <div className="font-medium text-gray-900">
          {`${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
        </div>
        {location.alt && location.alt > 0 && (
          <div className="text-gray-500 text-xs">{location.alt}m altitude</div>
        )}
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center space-y-6 p-8 max-w-md mx-auto">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
            <Battery className="absolute inset-0 h-16 w-16 text-blue-200 mx-auto" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Loading Fleet Dashboard</h2>
            <p className="text-gray-600">Establishing connection to global drone network...</p>
          </div>
          <div className="space-y-1 text-sm text-gray-500">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>Connecting to API</span>
            </div>
            <div className="flex items-center justify-center space-x-2 opacity-75">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
              <span>Loading drone telemetry</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        .leaflet-container {
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
        }
        .leaflet-popup-content-wrapper {
          border-radius: 0.375rem;
        }
      `}</style>
      
      <div className="space-y-6">
        {/* Header */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-3">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                    <Battery className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">Fleet Dashboard</h1>
                    <p className="text-gray-600 mt-1">
                      Real-time monitoring of <span className="font-semibold text-blue-600">{stats.total}</span> drones across{' '}
                      <span className="font-semibold">5 global sites</span>
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3 flex-shrink-0">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={fetchDrones}
                  disabled={loading}
                  className="flex items-center space-x-2 border-gray-300 hover:border-gray-400"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh Data</span>
                </Button>
                
                <Badge variant="secondary" className="px-3 py-1 bg-gray-100 text-gray-800 border-gray-200">
                  <Users className="h-3 w-3 mr-1" />
                  Organization Wide
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="border-red-200 bg-red-50 border-l-4 border-red-500">
            <AlertDescription className="text-red-800 flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <Battery className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">Fleet connection error</span>
                <span className="text-sm">{error}</span>
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={fetchDrones} 
                className="h-7 px-3 text-red-700 hover:bg-red-100 border border-red-200"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Fleet Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { 
              title: 'Available', 
              value: stats.available, 
              color: 'green', 
              icon: '✓', 
              subtitle: `${stats.total > 0 ? ((stats.available / stats.total) * 100).toFixed(1) : 0}% ready`,
              description: 'Drones ready for immediate deployment'
            },
            { 
              title: 'In Mission', 
              value: stats.inMission, 
              color: 'orange', 
              icon: '▶', 
              subtitle: `${stats.inMission} active`, 
              description: 'Currently executing operations'
            },
            { 
              title: 'Charging', 
              value: stats.charging, 
              color: 'blue', 
              icon: '⚡', 
              subtitle: 'Ready soon', 
              description: 'Drones preparing for next mission'
            },
            { 
              title: 'Maintenance', 
              value: stats.maintenance, 
              color: 'red', 
              icon: '⚠', 
              subtitle: 'Needs attention', 
              description: 'Requires service or repair'
            },
          ].map(({ title, value, color, icon, subtitle, description }, index) => (
            <Card key={index} className="border-0 shadow-sm hover:shadow-md transition-all duration-300 group">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold text-gray-900 group-hover:text-gray-800 transition-colors">
                      {title}
                    </CardTitle>
                    <p className="text-xs text-gray-500">{description}</p>
                  </div>
                  <div className={`p-2.5 rounded-full bg-${color}-100 group-hover:bg-${color}-200 transition-colors duration-200`}>
                    <div className={`w-3 h-3 bg-${color}-600 rounded-full animate-pulse`}></div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900 mb-2 group-hover:scale-[1.02] transition-transform duration-200">
                  {value}
                </div>
                <p className={`text-sm font-medium text-${color}-600`}>{subtitle}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Drone Inventory Table */}
          <Card className="xl:col-span-2 border-0 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-semibold flex items-center justify-between">
                <span className="flex items-center space-x-2">
                  <Battery className="h-5 w-5 text-gray-600" />
                  <span>Drone Inventory</span>
                </span>
                <Badge variant="outline" className="text-xs border-gray-300 bg-gray-50">
                  {stats.total} total assets
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {drones.length === 0 ? (
                <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border-2 border-dashed border-gray-200">
                  <Battery className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No drones in fleet</h3>
                  <p className="text-gray-600 mb-6 max-w-sm mx-auto">
                    Your organization currently has no drones assigned. This could be because:
                  </p>
                  <div className="grid grid-cols-1 gap-2 max-w-md mx-auto text-sm text-gray-600">
                    <div className="flex items-center space-x-2 p-2 bg-white rounded-md border">
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <span>No drones have been added to your organization</span>
                    </div>
                    <div className="flex items-center space-x-2 p-2 bg-white rounded-md border">
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <span>All drones are currently offline or in storage</span>
                    </div>
                    <div className="flex items-center space-x-2 p-2 bg-white rounded-md border">
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <span>Data synchronization is still in progress</span>
                    </div>
                  </div>
                  <Button onClick={fetchDrones} variant="outline" className="mt-6 border-gray-300">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Fleet Data
                  </Button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 border-b border-gray-200">
                        <TableHead className="w-[80px] font-semibold text-gray-700 py-3.5 pl-4">ID</TableHead>
                        <TableHead className="font-semibold text-gray-700 py-3.5">Model</TableHead>
                        <TableHead className="font-semibold text-gray-700 py-3.5">Status</TableHead>
                        <TableHead className="font-semibold text-gray-700 py-3.5">Battery</TableHead>
                        <TableHead className="font-semibold text-gray-700 py-3.5">Signal</TableHead>
                        <TableHead className="font-semibold text-gray-700 py-3.5">GPS</TableHead>
                        <TableHead className="font-semibold text-gray-700 py-3.5 pr-4">Location</TableHead>
                        <TableHead className="text-right font-semibold text-gray-700 py-3.5">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drones.map((drone, index) => (
                        <TableRow 
                          key={drone.id} 
                          className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                            index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                          }`}
                        >
                          <TableCell className="font-medium text-gray-900 py-4 pl-4">
                            <div className="flex items-center space-x-2">
                              <div className={`w-2 h-2 rounded-full ${
                                drone.status === 'available' ? 'bg-green-400' :
                                drone.status === 'in-mission' ? 'bg-orange-400' :
                                drone.status === 'charging' ? 'bg-blue-400' : 'bg-red-400'
                              }`}></div>
                              <span className="text-sm">#{drone.id.split('-')[1]}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-900 py-4">
                            <div className="font-medium text-sm">{drone.model}</div>
                            <div className="text-xs text-gray-500">Registered {new Date(drone.createdAt).toLocaleDateString()}</div>
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge 
                              className={`${getStatusColor(drone.status)} text-xs px-3 py-1 font-medium border transition-colors`}
                              variant="secondary"
                            >
                              {drone.status.replace('-', ' ').toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex items-center space-x-3">
                              <Progress 
                                value={drone.battery} 
                                className={`h-2 w-20 flex-shrink-0 ${getBatteryColor(drone.battery)} rounded-full`}
                              />
                              <span className={`text-sm font-semibold min-w-[30px] text-right ${
                                drone.battery > 20 ? 'text-gray-900' : 'text-red-600'
                              }`}>
                                {drone.battery}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="space-y-1">
                              <div className={`text-sm font-medium ${getSignalColor(drone.vitals.signal)}`}>
                                {drone.vitals.signal}
                              </div>
                              <div className="text-xs text-gray-500">{drone.vitals.rssi} dBm</div>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="text-sm font-medium text-gray-900">{drone.vitals.gps}</div>
                            <div className="text-xs text-gray-500">satellites</div>
                          </TableCell>
                          <TableCell className="py-4 pr-4">
                            {formatLocation(drone.location)}
                          </TableCell>
                          <TableCell className="text-right py-4 pr-4">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 px-3 text-blue-600 hover:bg-blue-50 text-xs border border-blue-200 hover:border-blue-300 transition-colors"
                            >
                              Assign Mission
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live Fleet Map */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center space-x-2">
                <MapPin className="h-4 w-4 text-gray-600" />
                <span>Live Fleet Positions</span>
              </CardTitle>
              <p className="text-sm text-gray-600">Real-time drone locations worldwide</p>
              <p className="text-xs text-gray-500 mt-1">
                {drones.filter(drone => drone.location).length} of {drones.length} tracked
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-80 rounded-lg overflow-hidden relative border border-gray-200">
                <MapContainer
                  center={[20, 0]}
                  zoom={2}
                  style={{ height: '100%', width: '100%' }}
                  className="rounded-lg"
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  {drones
                    .filter(drone => drone.location && drone.location.lat && drone.location.lng)
                    .map((drone) => (
                      <Marker
                        key={drone.id}
                        position={[drone.location!.lat, drone.location!.lng]}
                      >
                        <Popup className="min-w-[240px] p-0 border-0 shadow-lg rounded-lg">
                          <div className="p-4 space-y-3 bg-white">
                            <div className="flex items-start justify-between">
                              <h3 className="font-semibold text-gray-900 text-sm truncate max-w-[160px]">
                                {drone.model}
                              </h3>
                              <Badge 
                                className={`${getStatusColor(drone.status)} text-xs px-2 py-0.5`}
                              >
                                {drone.status}
                              </Badge>
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">ID:</span>
                                <span className="font-medium">{drone.id}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Battery:</span>
                                <span className={`font-medium ${drone.battery < 20 ? 'text-red-600' : ''}`}>
                                  {drone.battery}%
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Signal:</span>
                                <span className={`${getSignalColor(drone.vitals.signal)} font-medium`}>
                                  {drone.vitals.signal}
                                </span>
                              </div>
                              {drone.location?.alt && drone.location.alt > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Altitude:</span>
                                  <span className="font-medium">{drone.location.alt}m</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                </MapContainer>
                
                {/* No location overlay */}
                {drones.filter(drone => drone.location).length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/95 backdrop-blur-sm rounded-lg border-2 border-dashed border-gray-300">
                    <div className="text-center p-6">
                      <MapPin className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                      <h3 className="text-lg font-medium text-gray-900 mb-1">No location data</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        All drones are currently in storage or offline
                      </p>
                      <Button variant="outline" size="sm" className="border-gray-300">
                        View All Drones
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer with last updated */}
        {lastUpdated && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <Signal className="h-4 w-4 text-gray-400" />
                  <span>Last telemetry update: {lastUpdated.toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center space-x-4 text-xs">
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                    {drones.length} drones tracked
                  </span>
                  <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                    {stats.available} ready
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}