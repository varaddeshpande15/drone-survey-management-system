'use client';

import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import * as z from 'zod';
import { ArrowLeft, Save, MapPin, Plane, Settings, Zap, Camera, Thermometer, Upload } from 'lucide-react';

// Fix Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Mission Planning Form Schema
const missionSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100),
  description: z.string().max(500, 'Description must be under 500 characters').optional(),
  altitude: z.number().min(20, 'Minimum altitude is 20m').max(500, 'Maximum altitude is 500m'),
  overlap: z.number().min(50, 'Minimum overlap is 50%').max(90, 'Maximum overlap is 90%'),
  speed: z.number().min(5, 'Minimum speed is 5 m/s').max(20, 'Maximum speed is 20 m/s'),
  sensors: z.array(z.string()).min(1, 'At least one sensor required'),
  pattern: z.string(),
  frequency: z.string(),
  droneId: z.string().optional(),
});

type MissionForm = z.infer<typeof missionSchema>;

// Pattern generation utilities
const generateCrosshatchPattern = (areaBounds: L.LatLngBounds, params: { altitude: number; overlap: number; speed: number }) => {
  const ne = areaBounds.getNorthEast();
  const sw = areaBounds.getSouthWest();
  const latStep = (ne.lat - sw.lat) * (1 - params.overlap / 100) / 2;
  const lngStep = (ne.lng - sw.lng) * (1 - params.overlap / 100) / 2;
  
  const waypoints: L.LatLng[] = [];
  
  // Horizontal passes
  for (let lat = sw.lat; lat <= ne.lat; lat += latStep) {
    const startLng = lat % (2 * lngStep) === 0 ? sw.lng : ne.lng;
    const endLng = lat % (2 * lngStep) === 0 ? ne.lng : sw.lng;
    
    waypoints.push(new L.LatLng(lat, startLng));
    waypoints.push(new L.LatLng(lat, endLng));
  }
  
  // Vertical passes
  for (let lng = sw.lng; lng <= ne.lng; lng += lngStep) {
    const startLat = lng % (2 * latStep) === 0 ? sw.lat : ne.lat;
    const endLat = lng % (2 * latStep) === 0 ? ne.lat : sw.lat;
    
    waypoints.push(new L.LatLng(startLat, lng));
    waypoints.push(new L.LatLng(endLat, lng));
  }
  
  return waypoints.map(point => ({
    lat: point.lat,
    lng: point.lng,
    alt: params.altitude,
  }));
};

const generatePerimeterPattern = (areaBounds: L.LatLngBounds, params: { altitude: number; overlap: number }) => {
  const ne = areaBounds.getNorthEast();
  const sw = areaBounds.getSouthWest();
  const margin = (ne.lat - sw.lat) * (params.overlap / 100) * 0.1;
  
  const waypoints: L.LatLng[] = [
    new L.LatLng(sw.lat + margin, sw.lng + margin),
    new L.LatLng(sw.lat + margin, ne.lng - margin),
    new L.LatLng(ne.lat - margin, ne.lng - margin),
    new L.LatLng(ne.lat - margin, sw.lng + margin),
    new L.LatLng(sw.lat + margin, sw.lng + margin),
  ];
  
  return waypoints.map(point => ({
    lat: point.lat,
    lng: point.lng,
    alt: params.altitude,
  }));
};

const calculateAreaCoverage = (areaGeoJSON: any, waypoints: any[]) => {
  // Simple coverage estimation based on waypoint density
  const area = areaGeoJSON.coordinates[0].reduce((acc: number, coord: [number, number], i: number) => {
    if (i === 0) return 0;
    const prev = areaGeoJSON.coordinates[0][i - 1] as [number, number];
    return acc + Math.abs((prev[1] - coord[1]) * (prev[0] + coord[0]));
  }, 0) / 2;
  
  const waypointCoverage = waypoints.length * 100; // 100m² per waypoint estimate
  return Math.min(100, Math.round((waypointCoverage / area) * 100));
};

export default function MissionPlanning() {
  const [map, setMap] = useState<L.Map | null>(null);
  const [drawnArea, setDrawnArea] = useState<any>(null);
  const [waypoints, setWaypoints] = useState<any[]>([]);
  const [selectedDrone, setSelectedDrone] = useState<string>('');
  const [drones, setDrones] = useState<{ id: string; model: string; status: string; battery: number }[]>([]);
  const [coverage, setCoverage] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const mapRef = useRef<L.Map>(null);
  const drawnItemsRef = useRef<L.FeatureGroup>(null);
  
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<MissionForm>({
    resolver: zodResolver(missionSchema),
    defaultValues: {
      title: '',
      altitude: 100,
      overlap: 80,
      speed: 10,
      sensors: ['camera'],
      pattern: 'crosshatch',
      frequency: '5s',
    },
  });

  const watchedPattern = watch('pattern');
  const watchedAltitude = watch('altitude');
  const watchedOverlap = watch('overlap');

  // Fetch available drones
  useEffect(() => {
    const fetchDrones = async () => {
      try {
        const response = await fetch('/api/drones');
        const data = await response.json();
        const availableDrones = data.drones.filter((drone: any) => 
          drone.status === 'available' && drone.battery > 20
        );
        setDrones(availableDrones);
        if (availableDrones.length > 0) {
          setSelectedDrone(availableDrones[0].id);
        }
      } catch (error) {
        console.error('Error fetching drones:', error);
        toast.error('Failed to load available drones');
      }
    };
    
    fetchDrones();
  }, []);

  // Handle drawn area
  const handleDrawCreated = (e: any) => {
    const layer = e.layer;
    const geojson = layer.toGeoJSON();
    setDrawnArea(geojson);
    
    // Calculate initial coverage
    const bounds = layer.getBounds();
    const initialWaypoints = generateCrosshatchPattern(bounds, { 
      altitude: watchedAltitude, 
      overlap: watchedOverlap, 
      speed: watch('speed') 
    });
    setWaypoints(initialWaypoints);
    setCoverage(calculateAreaCoverage(geojson, initialWaypoints));
    
    toast.success('Survey area defined! Generated initial flight path.');
  };

  // Generate pattern based on selected type
  const generatePattern = async () => {
    if (!drawnArea || !map) return;
    
    setIsGenerating(true);
    try {
      const bounds = drawnItemsRef.current!.getBounds();
      let generatedWaypoints: any[] = [];
      
      switch (watchedPattern) {
        case 'crosshatch':
          generatedWaypoints = generateCrosshatchPattern(bounds, { 
            altitude: watchedAltitude, 
            overlap: watchedOverlap, 
            speed: watch('speed') 
          });
          break;
        case 'perimeter':
          generatedWaypoints = generatePerimeterPattern(bounds, { 
            altitude: watchedAltitude, 
            overlap: watchedOverlap 
          });
          break;
        case 'spiral':
          // Simple spiral pattern (clockwise from center)
          const center = bounds.getCenter();
          const radiusStep = Math.min(bounds.getNorthEast().lat - center.lat, center.lng - bounds.getSouthWest().lng) / 4;
          for (let r = radiusStep; r < Math.max(bounds.getNorthEast().lat - center.lat, center.lng - bounds.getSouthWest().lng); r += radiusStep) {
            // Add points around circular path (simplified)
            for (let i = 0; i < 8; i++) {
              const angle = (i / 8) * 2 * Math.PI;
              generatedWaypoints.push({
                lat: center.lat + (r / 111000) * Math.cos(angle), // Rough lat/lng conversion
                lng: center.lng + (r / 111000) * Math.sin(angle),
                alt: watchedAltitude,
              });
            }
          }
          break;
        default:
          generatedWaypoints = generateCrosshatchPattern(bounds, { 
            altitude: watchedAltitude, 
            overlap: watchedOverlap, 
            speed: watch('speed') 
          });
      }
      
      setWaypoints(generatedWaypoints);
      setCoverage(calculateAreaCoverage(drawnArea, generatedWaypoints));
      
      toast.success(`Generated ${watchedPattern} pattern with ${generatedWaypoints.length} waypoints (${coverage}%)`);
    } catch (error) {
      console.error('Pattern generation error:', error);
      toast.error('Failed to generate flight pattern');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save mission
//   const onSubmit = async (data: MissionForm) => {
//     if (!drawnArea || waypoints.length === 0) {
//       toast.error('Please define survey area and generate flight path first');
//       return;
//     }

//     setSaving(true);
//     try {
//       const missionData = {
//         title: data.title,
//         description: data.description,
//         area: drawnArea,
//         waypoints: waypoints,
//         params: {
//           altitude: data.altitude,
//           overlap: data.overlap,
//           speed: data.speed,
//           sensors: data.sensors,
//           frequency: data.frequency,
//           pattern: data.pattern,
//         },
//         droneId: selectedDrone || undefined,
//         userId: 'system', // For demo
//       };

//       const response = await fetch('/api/missions', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(missionData),
//       });

//       if (!response.ok) {
//         throw new Error(`HTTP ${response.status}`);
//       }

//       const savedMission = await response.json();
//       toast.success(`Mission "${data.title}" saved successfully! ID: ${savedMission.id}`);
      
//       // Reset form
//       setValue('title', '');
//       setDrawnArea(null);
//       setWaypoints([]);
//       setCoverage(0);
//       if (drawnItemsRef.current) {
//         drawnItemsRef.current.clearLayers();
//       }
      
//     } catch (error) {
//       console.error('Save error:', error);
//       toast.error('Failed to save mission. Please try again.');
//     } finally {
//       setSaving(false);
//     }
//   };

// In the onSubmit function, replace the missionData object:
const onSubmit = async (data: MissionForm) => {
  if (!drawnArea || waypoints.length === 0) {
    toast.error('Please define survey area and generate flight path first');
    return;
  }

  setSaving(true);
  try {
    const missionData = {
      title: data.title,
      description: data.description,
      area: drawnArea,
      waypoints: waypoints,
      params: {
        altitude: data.altitude,
        overlap: data.overlap,
        speed: data.speed,
        sensors: data.sensors,
        frequency: data.frequency,
        pattern: data.pattern,
      },
      droneId: selectedDrone || undefined,
      userId: 'sample-user-1', // ✅ Use existing sample user from seed data
      coverage: coverage,
    };

    console.log('Sending mission data:', missionData);

    const response = await fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(missionData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const savedMission = await response.json();
    toast.success(`✅ Mission "${data.title}" saved! ID: ${savedMission.id}`);
    
    // Reset form for new mission
    setValue('title', '');
    setDrawnArea(null);
    setWaypoints([]);
    setCoverage(0);
    setSelectedDrone('');
    if (drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
    }
    
    // Optional: Navigate to monitor page
    // router.push(`/monitor/${savedMission.id}`);
    
  } catch (error: any) {
    console.error('Save error:', error);
    toast.error(`Failed to save mission: ${error.message}`);
  } finally {
    setSaving(false);
  }
};

  return (
    <div className="min-h-screen bg-gray-50">
      <style jsx global>{`
        .leaflet-container {
          height: 500px;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .leaflet-draw-toolbar:not(.leaflet-disabled) {
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
          border: 1px solid #ccc;
          background: white;
        }
      `}</style>
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Button>
            <div className="flex items-center space-x-2">
              <Plane className="h-5 w-5 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">Mission Planning</h1>
            </div>
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            Advanced Planning Mode
          </Badge>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Map & Drawing Area */}
          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-blue-600" />
                <span>Survey Area & Flight Path</span>
                <Badge variant="outline" className="ml-2 text-xs">
                  Draw polygon to define area
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <MapContainer
                  center={[40.7128, -74.006]}
                  zoom={13}
                  style={{ height: '500px', width: '100%', borderRadius: '0.5rem' }}
                  whenReady={setMap}
                  ref={mapRef}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  
                  <FeatureGroup ref={drawnItemsRef}>
                    <EditControl
                      position="topright"
                      onCreated={handleDrawCreated}
                      draw={{
                        polygon: {
                          shapeOptions: {
                            color: '#3388ff',
                            weight: 3,
                            opacity: 0.8,
                            fillColor: '#3388ff',
                            fillOpacity: 0.3,
                          },
                          showLength: false,
                        },
                        rectangle: {
                          shapeOptions: {
                            color: '#3388ff',
                            weight: 3,
                            opacity: 0.8,
                            fillColor: '#3388ff',
                            fillOpacity: 0.3,
                          },
                        },
                        circle: false,
                        marker: false,
                        circlemarker: false,
                        polyline: false,
                      }}
                      edit={{
                        edit: false,
                        remove: true,
                      }}
                    />
                  </FeatureGroup>
                </MapContainer>

                {/* Coverage Overlay */}
                {coverage > 0 && (
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-md border">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${
                        coverage >= 90 ? 'bg-green-500' : coverage >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span className="text-sm font-medium text-gray-900">Coverage: {coverage}%</span>
                      <Badge variant="outline" className="ml-2">
                        {waypoints.length} waypoints
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Configuration Panel */}
          <div className="space-y-6">
            {/* Mission Details Form */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5 text-gray-600" />
                  <span>Mission Details</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-sm font-medium">Mission Title *</Label>
                    <Input
                      id="title"
                      placeholder="e.g., NYC Factory Monthly Inspection"
                      {...register('title')}
                      className={errors.title ? 'border-red-300 focus:border-red-500' : ''}
                    />
                    {errors.title && (
                      <p className="text-sm text-red-600">{errors.title.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Brief description of survey objectives..."
                      {...register('description')}
                      rows={3}
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Drone Assignment</Label>
                    <div className="space-y-2">
                      <Select value={selectedDrone} onValueChange={setSelectedDrone}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select available drone" />
                        </SelectTrigger>
                        <SelectContent className="w-full">
                          {drones.map(drone => (
                            <SelectItem key={drone.id} value={drone.id}>
                              <div className="flex items-center space-x-2">
                                <Badge className="h-4 w-4 text-gray-600" />
                                <span>{drone.model}</span>
                                <Badge variant="outline" className="ml-auto">
                                  {drone.battery}%
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {drones.length === 0 && (
                        <p className="text-sm text-gray-500">No drones available. All drones are either in mission or require maintenance.</p>
                      )}
                    </div>
                  </div>

                  {/* Flight Parameters */}
                  <Card className="border-0 bg-gray-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <Plane className="h-4 w-4" />
                        <span>Flight Parameters</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium flex items-center justify-between">
                          Flight Altitude
                          <span className="text-xs text-gray-500">{watch('altitude')}m</span>
                        </Label>
                        <Slider
                          value={[watch('altitude')]}
                          onValueChange={([value]) => setValue('altitude', value)}
                          min={20}
                          max={500}
                          step={10}
                          className="w-full"
                        />
                        <div className="text-xs text-gray-500">Recommended: 80-150m for optimal coverage</div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium flex items-center justify-between">
                          Image Overlap
                          <span className="text-xs text-gray-500">{watch('overlap')}%</span>
                        </Label>
                        <Slider
                          value={[watch('overlap')]}
                          onValueChange={([value]) => setValue('overlap', value)}
                          min={50}
                          max={90}
                          step={5}
                          className="w-full"
                        />
                        <div className="text-xs text-gray-500">Higher overlap = better 3D reconstruction</div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Flight Speed</Label>
                        <Input
                          type="number"
                          {...register('speed', { valueAsNumber: true })}
                          placeholder="10"
                          className="w-full"
                          min={5}
                          max={20}
                          step={1}
                        />
                        <div className="text-xs text-gray-500">m/s - Balance between coverage and detail</div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pattern Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Flight Pattern *</Label>
                    <Select value={watchedPattern} onValueChange={(value) => setValue('pattern', value)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="crosshatch">
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 bg-grid text-xs">#</div>
                            <span>Crosshatch (Recommended)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="perimeter">
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 border rounded text-xs">□</div>
                            <span>Perimeter</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="spiral">
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 text-xs">🌀</div>
                            <span>Spiral</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sensor Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Sensors *</Label>
                    <div className="space-y-2">
                      {[
                        { value: 'camera', label: 'RGB Camera', icon: Camera },
                        { value: 'thermal', label: 'Thermal', icon: Thermometer },
                        { value: 'multispectral', label: 'Multispectral', icon: '🌈' },
                        { value: 'lidar', label: 'LiDAR', icon: '📡' },
                      ].map(({ value, label, icon: Icon }) => (
                        <div key={value} className="flex items-center space-x-2 p-2 rounded-md border hover:bg-gray-50">
                          <Switch
                            id={value}
                            checked={watch('sensors')?.includes(value)}
                            onCheckedChange={(checked) => {
                              const current = watch('sensors') || [];
                              setValue('sensors', checked 
                                ? [...current, value] 
                                : current.filter(s => s !== value)
                              );
                            }}
                          />
                          <Label htmlFor={value} className="flex items-center space-x-2 cursor-pointer flex-1">
                            {typeof Icon === 'string' ? (
                              <span className="text-lg">{Icon}</span>
                            ) : (
                              <Icon className="h-4 w-4 text-gray-500" />
                            )}
                            <span className="text-sm">{label}</span>
                          </Label>
                        </div>
                      ))}
                    </div>
                    {errors.sensors && (
                      <p className="text-sm text-red-600">{errors.sensors.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Data Collection Frequency</Label>
                    <Select defaultValue="5s" {...register('frequency')}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2s">Every 2 seconds (High resolution)</SelectItem>
                        <SelectItem value="5s">Every 5 seconds (Recommended)</SelectItem>
                        <SelectItem value="10s">Every 10 seconds (Fast survey)</SelectItem>
                        <SelectItem value="30s">Every 30 seconds (Quick overview)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Generate Pattern Button */}
                  <Button
                    type="button"
                    onClick={generatePattern}
                    disabled={!drawnArea || isGenerating}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
                  >
                    {isGenerating ? (
                      <>
                        <Zap className="h-4 w-4 mr-2 animate-spin" />
                        <span>Generating Pattern...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        <span>Generate {watchedPattern} Pattern</span>
                      </>
                    )}
                  </Button>

                  {/* Save Mission Button */}
                  <Button
                    type="submit"
                    disabled={!drawnArea || waypoints.length === 0 || saving}
                    className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white"
                  >
                    {saving ? (
                      <>
                        <Upload className="h-4 w-4 mr-2 animate-spin" />
                        <span>Saving Mission...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        <span>Save Mission</span>
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-700">Mission Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Survey Area</span>
                  <span className="font-medium">{drawnArea ? `${drawnArea.geometry.coordinates[0].length} vertices` : 'Not defined'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Waypoints</span>
                  <span className="font-medium">{waypoints.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Est. Duration</span>
                  <span className="font-medium">
                    {waypoints.length ? `${Math.round(waypoints.length * 0.5)} min` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-gray-600 font-medium">Coverage</span>
                  <Badge 
                    className={`text-xs ${
                      coverage >= 90 ? 'bg-green-100 text-green-800' :
                      coverage >= 70 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {coverage}%
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}