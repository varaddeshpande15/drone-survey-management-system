'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Play, Clock, MapPin, Battery, Activity } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface MissionSummary {
  id: string;
  title: string;
  status: string;
  progress: number;
  eta: string;
  drone: { model: string; battery: number } | null;
  createdAt: string;
}

const statusColors = {
  planned: 'bg-gray-100 text-gray-800',
  'in-progress': 'bg-blue-100 text-blue-800',
  paused: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  aborted: 'bg-red-100 text-red-800',
} as const;

export default function MissionList() {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMissions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/missions');
      if (!response.ok) throw new Error('Failed to fetch missions');
      
      const data = await response.json();
      setMissions(data.missions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMissions();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchMissions, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Loading missions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mission Control</h1>
          <p className="text-gray-600 mt-1">Monitor all active and planned drone operations</p>
        </div>
        <Button asChild>
          <Link href="/plan">
            <Play className="h-4 w-4 mr-2" />
            New Mission
          </Link>
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Missions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Active Missions
            <Badge variant="outline">{missions.length} total</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {missions.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No missions yet</h3>
              <p className="text-gray-500 mb-4">Get started by planning your first drone survey.</p>
              <Button asChild>
                <Link href="/plan">Plan First Mission</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Mission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Drone</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missions.map((mission) => (
                    <TableRow key={mission.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">
                        <div>{mission.title}</div>
                        <div className="text-sm text-gray-500">
                          {new Date(mission.createdAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[mission.status as keyof typeof statusColors]}>
                          {mission.status.replace('-', ' ').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Progress value={mission.progress} className="w-16 h-2" />
                          <span className="text-sm font-medium">{mission.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{mission.eta}</div>
                      </TableCell>
                      <TableCell>
                        {mission.drone ? (
                          <div className="space-y-1">
                            <div className="text-sm font-medium">{mission.drone.model}</div>
                            <div className="flex items-center space-x-1 text-xs text-gray-500">
                              <Battery className="h-3 w-3" />
                              <span>{mission.drone.battery}%</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/monitor/${mission.id}`}>Monitor</Link>
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
    </div>
  );
}