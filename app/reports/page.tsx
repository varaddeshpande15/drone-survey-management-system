'use client';

import { useEffect, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, Legend,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Label
} from 'recharts';
import Link from 'next/link';
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription 
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {Alert, AlertDescription} from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { 
  Download, Filter, CalendarIcon, MapPin, Activity, 
  Battery, TrendingUp, FileText, Users, Globe,
  CheckCircle,
  Target,
  Camera
} from 'lucide-react';
import { format } from 'date-fns';
import { CSVLink } from 'react-csv';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Sample color palette for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

// Interface for mission data
interface MissionData {
  id: string;
  title: string;
  status: string;
  progress: number;
  duration: string | null;
  distance: number;
  coverage: number;
  createdAt: string;
  drone: {
    model: string;
    battery: number;
  } | null;
  params: {
    pattern: string;
    sensors: string[];
  };
}

// Interface for aggregated stats
interface OrgStats {
  totalMissions: number;
  completedMissions: number;
  avgCoverage: number;
  totalDistance: number;
  totalDuration: number;
  avgBatteryUsage: number;
  mostUsedDrone: string;
  busiestMonth: string;
  patternsUsed: Record<string, number>;
  sensorsUsed: Record<string, number>;
}

// Status color mapping for badges
const statusColors = {
  planned: "bg-yellow-100 text-yellow-800",
  "in-progress": "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  aborted: "bg-red-100 text-red-800",
  all: "bg-gray-100 text-gray-800",
};

export default function Reports() {
  const [missions, setMissions] = useState<MissionData[]>([]);
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({
    status: 'all',
    drone: 'all',
    dateFrom: '',
    dateTo: '',
    pattern: 'all',
  });

  // Fetch all missions and calculate stats
  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams(filter);
      const response = await fetch(`/api/missions?${params.toString()}`);
      
      if (!response.ok) throw new Error('Failed to fetch reports');
      
      const data = await response.json();
      setMissions(data.missions);
      
      // Calculate organization stats
      const orgStats = calculateOrgStats(data.missions);
      setStats(orgStats);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [filter]);

  // Calculate organization-wide statistics
 const calculateOrgStats = (missions: MissionData[]): OrgStats => {
    // HANDLE EMPTY DATA FIRST
    if (missions.length === 0) {
      return {
        totalMissions: 0,
        completedMissions: 0,
        avgCoverage: 0,
        totalDistance: 0,
        totalDuration: 0,
        avgBatteryUsage: 0,
        mostUsedDrone: 'None',
        busiestMonth: 'None',
        patternsUsed: {},
        sensorsUsed: {},
      };
    }

    const totalMissions = missions.length;
    const completedMissions = missions.filter(m => m.status === 'completed').length;
    const totalDistance = missions.reduce((sum, m) => sum + (m.distance || 0), 0);
    const totalDuration = missions.reduce((sum, m) => {
      if (!m.duration || m.duration === 'N/A') return sum;
      const [minutes] = m.duration.split('min').map(Number);
      return sum + (minutes || 0);
    }, 0);
    
    const coverages = missions
      .filter(m => m.coverage > 0)
      .map(m => m.coverage);
    const avgCoverage = coverages.length > 0 
      ? Math.round(coverages.reduce((a, b) => a + b, 0) / coverages.length)
      : 0;

    // FIXED Battery usage analysis - handles your mission data better
    const batteryUsages = missions
      .filter(m => m.drone && m.duration && m.duration !== 'N/A' && m.duration.includes('min'))
      .map(m => {
        const [minutes] = m.duration ? m.duration.split('min').map(Number) : [0];
        return minutes > 0 ? (100 - m.drone!.battery) / minutes : 0;
      });
    const avgBatteryUsage = batteryUsages.length > 0 
      ? Math.round(batteryUsages.reduce((a, b) => a + b, 0) / batteryUsages.length * 100) / 100
      : 0;

    // Most used drone
    const droneUsage = missions.reduce((acc, m) => {
      if (m.drone?.model) {
        acc[m.drone.model] = (acc[m.drone.model] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    const mostUsedDrone = Object.entries(droneUsage)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A';

    // Busiest month
    const monthlyUsage = missions.reduce((acc, m) => {
      const month = format(new Date(m.createdAt), 'MMM yyyy');
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const busiestMonth = Object.entries(monthlyUsage)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A';

    // Pattern usage
    const patternsUsed = missions.reduce((acc, m) => {
      acc[m.params.pattern] = (acc[m.params.pattern] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Sensor usage
    const sensorsUsed = missions.reduce((acc, m) => {
      m.params.sensors.forEach(sensor => {
        acc[sensor] = (acc[sensor] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    return {
      totalMissions,
      completedMissions,
      avgCoverage,
      totalDistance: Math.round(totalDistance),
      totalDuration: Math.round(totalDuration),
      avgBatteryUsage,
      mostUsedDrone,
      busiestMonth,
      patternsUsed,
      sensorsUsed,
    };
  };

  // Export functions
  const exportToCSV = () => {
    const headers = [
      { label: 'Mission ID', key: 'id' },
      { label: 'Title', key: 'title' },
      { label: 'Status', key: 'status' },
      { label: 'Progress', key: 'progress' },
      { label: 'Distance (km)', key: 'distance' },
      { label: 'Coverage (%)', key: 'coverage' },
      { label: 'Duration', key: 'duration' },
      { label: 'Drone', key: 'drone.model' },
      { label: 'Created', key: 'createdAt' },
    ];

    const csvData = missions.map(mission => ({
      id: mission.id,
      title: mission.title,
      status: mission.status,
      progress: `${mission.progress}%`,
      distance: mission.distance?.toFixed(1) || '0',
      coverage: `${mission.coverage}%`,
      duration: mission.duration || 'N/A',
      'drone.model': mission.drone?.model || 'Unassigned',
      createdAt: format(new Date(mission.createdAt), 'MMM dd, yyyy'),
    }));

    return (
      <CSVLink 
        data={csvData} 
        headers={headers} 
        filename="flytbase-missions.csv"
        className="no-underline"
      >
        <Button variant="outline" className="flex items-center space-x-2">
          <Download className="h-4 w-4" />
          <span>Export CSV</span>
        </Button>
      </CSVLink>
    );
  };
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('FlytBase Survey Report', 20, 20);

    // Organization stats table
    if (stats) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      
      const statsTable = [
        ['Metric', 'Value'],
        ['Total Missions', stats.totalMissions.toString()],
        ['Completed', stats.completedMissions.toString()],
        ['Avg Coverage', `${stats.avgCoverage}%`],
        ['Total Distance', `${stats.totalDistance} km`],
        ['Total Duration', `${stats.totalDuration} min`],
        ['Most Used Drone', stats.mostUsedDrone],
      ];

      (doc as any).autoTable({
        head: [statsTable[0]],
        body: statsTable.slice(1),
        startY: 30,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 20, right: 20 },
      });
    }

    // Missions table
    const missionsTable = missions.map(m => [
      m.title,
      m.status,
      `${m.progress}%`,
      m.duration || 'N/A',
      `${m.distance?.toFixed(1) || 0} km`,
      `${m.coverage}%`,
      m.drone?.model || 'Unassigned',
    ]);

    // Define statsTable for PDF export
    const statsTable = [
      ['Metric', 'Value'],
      ['Total Missions', stats?.totalMissions?.toString() ?? 'N/A'],
      ['Completed', stats?.completedMissions?.toString() ?? 'N/A'],
      ['Avg Coverage', `${stats?.avgCoverage ?? 0}%`],
      ['Total Distance', `${stats?.totalDistance ?? 0} km`],
      ['Total Duration', `${stats?.totalDuration ?? 0} min`],
      ['Most Used Drone', stats?.mostUsedDrone ?? 'N/A'],
    ];

    // Get the finalY from the previous autoTable to position the next table
    const statsTableResult = (doc as any).autoTable({
      head: [statsTable[0]],
      body: statsTable.slice(1),
      startY: 30,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 20, right: 20 },
    });

    (doc as any).autoTable({
      head: [['Title', 'Status', 'Progress', 'Duration', 'Distance', 'Coverage', 'Drone']],
      body: missionsTable,
      startY: statsTableResult.finalY + 10,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 20, right: 20 },
    });

    doc.save('flytbase-survey-report.pdf');
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-6 p-8">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Loading Reports</h2>
            <p className="text-gray-600">Analyzing mission data and generating insights...</p>
          </div>
        </div>
      </div>
    );
  }

  // EMPTY STATE - ADD THIS
  if (missions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-6 p-8 max-w-md mx-auto">
          <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Reports Yet</h2>
            <p className="text-gray-600 mb-6">Your organization hasn't completed any survey missions yet.</p>
          </div>
          <div className="space-y-2 text-sm text-gray-500">
            <div>• Create your first mission in the Planning section</div>
            <div>• Monitor missions in real-time</div>
            <div>• Generate comprehensive reports after completion</div>
          </div>
          <Button asChild className="bg-blue-600 hover:bg-blue-700">
            <Link href="/plan">Plan First Mission</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Survey Reports & Analytics</h1>
            <p className="text-gray-600 mt-1">Organization-wide insights and mission performance</p>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="flex space-x-2">
              {exportToCSV()}
              <Button onClick={exportToPDF} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Organization Overview Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[
              {
                title: 'Total Missions',
                value: stats.totalMissions,
                change: '+12%',
                icon: Activity,
                color: 'blue',
                description: 'All-time operations',
              },
              {
                title: 'Completed',
                value: stats.completedMissions,
                change: '+8%',
                icon: CheckCircle,
                color: 'green',
                description: 'Successfully finished',
              },
              {
                title: 'Avg Coverage',
                value: `${stats.avgCoverage}%`,
                change: '+3%',
                icon: Target,
                color: 'purple',
                description: 'Survey completeness',
              },
              {
                title: 'Total Distance',
                value: `${stats.totalDistance} km`,
                change: '+25%',
                icon: MapPin,
                color: 'indigo',
                description: 'Flown across all missions',
              },
            ].map(({ title, value, change, icon: Icon, color, description }, index) => (
              <Card key={index} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900">{title}</CardTitle>
                    <div className={`p-2 rounded-lg bg-${color}-100`}>
                      <Icon className={`h-5 w-5 text-${color}-600`} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
                  <p className="text-sm text-gray-600">{description}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-sm font-medium text-${color}-600`}>{change}</span>
                    <span className="text-xs text-gray-500">vs last month</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Recent Missions Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Recent Missions
                <Badge variant="outline">{missions.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px]">Mission</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Drone</TableHead>
                      <TableHead>Coverage</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {missions.slice(0, 5).map((mission) => (
                      <TableRow key={mission.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          <div className="text-sm">{mission.title}</div>
                          <div className="text-xs text-gray-500">{mission.id}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[mission.status as keyof typeof statusColors]}>
                            {mission.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{mission.drone?.model || 'Unassigned'}</div>
                          {mission.drone && (
                            <div className="flex items-center space-x-1 text-xs text-gray-500">
                              <Battery className="h-3 w-3" />
                              <span>{mission.drone.battery}% battery</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{mission.coverage}%</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{mission.distance?.toFixed(1)} km</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(mission.createdAt), 'MMM dd')}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {missions.length > 5 && (
                <div className="text-center py-4">
                  <Button variant="link" className="p-0 h-auto text-sm">
                    View All Missions
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <span>Performance Trends</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getTrendData(missions)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="month" 
                        stroke="#64748b" 
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="#64748b" 
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="coverage" 
                        stroke="#10b981" 
                        strokeWidth={3}
                        dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="progress" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Globe className="h-5 w-5 text-blue-600" />
                  <span>Geographic Distribution</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getLocationData(missions)}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent as number) * 100).toFixed(0)}%`}
                      >
                        {getLocationData(missions).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Advanced Analytics */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Pattern Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-purple-600" />
                <span>Pattern Analysis</span>
              </CardTitle>
              <CardDescription>
                Distribution of flight patterns across missions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Object.entries(stats?.patternsUsed || {}).map(([name, value]) => ({ name, value }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Sensor Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Camera className="h-5 w-5 text-indigo-600" />
                <span>Sensor Usage</span>
              </CardTitle>
              <CardDescription>
                Most frequently used sensors in surveys
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={Object.entries(stats?.sensorsUsed || {}).map(([name, value]) => ({ name, value }))}>
                    <PolarGrid stroke="#f1f5f9" />
                    <PolarAngleAxis dataKey="name" stroke="#64748b" />
                    <PolarRadiusAxis angle={30} domain={[0, 20]} stroke="#64748b" />
                    <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.6} />
                    <Tooltip />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Panel */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Advanced Filters</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid md:grid-cols-4 gap-4 p-6 border-t">
              <div className="space-y-2">
                <label htmlFor="status-filter" className="text-sm font-medium">Status</label>
                <Select value={filter.status} onValueChange={(value) => setFilter(prev => ({ ...prev, status: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="aborted">Aborted</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label htmlFor="drone-filter" className="text-sm font-medium">Drone</label>
                <Select value={filter.drone} onValueChange={(value) => setFilter(prev => ({ ...prev, drone: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="All drones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Drones</SelectItem>
                    {missions.map(m => m.drone?.model).filter(Boolean).map(model => (
                      <SelectItem key={model} value={model!}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Date Range</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={filter.dateFrom}
                    onChange={(e) => setFilter(prev => ({ ...prev, dateFrom: e.target.value }))}
                    placeholder="From"
                  />
                  <Input
                    type="date"
                    value={filter.dateTo}
                    onChange={(e) => setFilter(prev => ({ ...prev, dateTo: e.target.value }))}
                    placeholder="To"
                  />
                </div>
              </div>

              <div className="flex items-end space-x-2 pt-6">
                <Button 
                  variant="outline"
                  onClick={() => setFilter({
                    status: 'all',
                    drone: 'all',
                    dateFrom: '',
                    dateTo: '',
                    pattern: 'all',
                  })}
                  className="h-9 px-3"
                >
                  <Filter className="h-4 w-4 mr-1" />
                  Reset
                </Button>
                <Button 
                  onClick={fetchReports}
                  className="h-9 px-4 bg-blue-600 hover:bg-blue-700"
                  disabled={loading}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Helper functions for chart data
const getTrendData = (missions: MissionData[]) => {
  const monthlyData = missions.reduce((acc, mission) => {
    const month = format(new Date(mission.createdAt), 'MMM yy');
    const existing = acc.find(item => item.month === month);
    
    if (existing) {
      existing.coverage = (existing.coverage + mission.coverage) / 2;
      existing.progress = (existing.progress + mission.progress) / 2;
      existing.count = (existing.count || 0) + 1;
    } else {
      acc.push({
        month,
        coverage: mission.coverage,
        progress: mission.progress,
        count: 1,
      });
    }
    
    return acc;
  }, [] as any[]);
  
  return monthlyData.sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
};

const getLocationData = (missions: MissionData[]) => {
  // Mock location data based on mission IDs for demo
  const locations = missions.reduce((acc, mission) => {
    const location = mission.id.includes('mission-1') ? 'New York' :
                    mission.id.includes('mission-2') ? 'London' :
                    mission.id.includes('mission-3') ? 'Tokyo' : 'Other';
    
    acc[location] = (acc[location] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return Object.entries(locations).map(([name, value]) => ({ name, value }));
};