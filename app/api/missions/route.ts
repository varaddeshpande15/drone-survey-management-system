// // app/api/missions/route.ts
// import { NextResponse } from 'next/server'
// import { prisma } from '@/lib/prisma'

// export async function GET() {
//   try {
//     const missions = await prisma.mission.findMany({
//       include: {
//         drone: {
//           select: { model: true, status: true, battery: true }
//         }
//       },
//       orderBy: { createdAt: 'desc' }
//     })
//     return NextResponse.json({ missions, count: missions.length })
//   } catch (error) {
//     console.error('Error fetching missions:', error)
//     return NextResponse.json({ error: 'Failed to fetch missions' }, { status: 500 })
//   }
// }




// app/api/missions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Removed duplicate GET handler. See below for unified GET handler.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Creating mission with body:', body);
    
    // Basic validation
    const { title, area, waypoints, params, droneId, userId } = body;
    
    if (!title || !area || !waypoints || waypoints.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: title, area, or waypoints' },
        { status: 400 }
      );
    }

    // ✅ FIX: Handle userId properly
    let validUserId: string | undefined;
    
    if (userId) {
      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
      });
      
      if (existingUser) {
        validUserId = userId;
      } else {
        console.warn(`User ${userId} not found, using sample user`);
      }
    }
    
    // If no valid userId, use the first sample user (from our seed data)
    if (!validUserId) {
      const sampleUser = await prisma.user.findFirst({
        where: { id: { startsWith: 'sample-user' } },
        select: { id: true },
      });
      
      if (sampleUser) {
        validUserId = sampleUser.id;
        console.log(`Using sample user ID: ${validUserId}`);
      } else {
        // Create a system user if none exist
        const systemUser = await prisma.user.create({
          data: {
            id: 'system-user',
            name: 'System',
            email: 'system@flytbase.com',
            image: 'https://via.placeholder.com/150',
          },
          select: { id: true },
        });
        validUserId = systemUser.id;
        console.log(`Created system user: ${validUserId}`);
      }
    }

    // Validate drone assignment
    if (droneId) {
      const drone = await prisma.drone.findUnique({
        where: { id: droneId },
        select: { status: true, battery: true },
      });
      
      if (!drone) {
        return NextResponse.json(
          { error: 'Selected drone not found' },
          { status: 404 }
        );
      }
      
      if (drone.status !== 'available' || drone.battery < 20) {
        return NextResponse.json(
          { error: 'Selected drone is not available or has insufficient battery (<20%)' },
          { status: 400 }
        );
      }
    }

    // Calculate mission statistics
    type Waypoint = { lat: number; lng: number; [key: string]: any };
    const totalDistance = waypoints.reduce((acc: number, wp: Waypoint, i: number) => {
      if (i === 0) return acc;
      const prev = waypoints[i - 1] as Waypoint;
      // Simple distance calculation (Haversine approximation)
      const latDiff = Math.abs(wp.lat - prev.lat) * 111000; // meters
      const lngDiff = Math.abs(wp.lng - prev.lng) * 111000 * Math.cos((wp.lat * Math.PI) / 180);
      return acc + Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    }, 0);

    const speed = params.speed || 10;
    const estimatedDuration = Math.round((totalDistance / speed) / 60); // minutes
    const estimatedCoverage = Math.min(100, Math.round((waypoints.length * 100) / (totalDistance / 100)));

    console.log(`Mission stats - Distance: ${Math.round(totalDistance / 1000)}km, Duration: ${estimatedDuration}min, Coverage: ${estimatedCoverage}%`);

    // Create mission with VALID userId
    const mission = await prisma.mission.create({
      data: {
        title: title,
        description: body.description || '',
        area: area,
        waypoints: waypoints,
        params: params,
        status: 'planned',
        progress: 0,
        eta: `${estimatedDuration}min`,
        duration: null,
        distance: totalDistance / 1000, // km
        coverage: estimatedCoverage,
        droneId: droneId || null,
        userId: validUserId, // ✅ Now guaranteed to be valid
      },
      include: {
        drone: {
          select: { model: true, status: true, battery: true },
        },
        user: {
          select: { name: true, email: true },
        },
      },
    });

    // Update drone status if assigned
    if (droneId) {
      await prisma.drone.update({
        where: { id: droneId },
        data: { status: 'assigned' }, // Changed from 'in-mission' to 'assigned' for planned missions
      });
      console.log(`Assigned drone ${droneId} to mission`);
    }

    console.log(`✅ Mission created successfully: ${title} (ID: ${mission.id})`);
    return NextResponse.json(mission, { status: 201 });
  } catch (error: any) {
    console.error('❌ Error creating mission:', error);
    
    // More specific error handling
    if (error.code === 'P2003') {
      return NextResponse.json(
        { error: 'Database constraint violation - invalid user or drone reference' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create mission', details: error.message },
      { status: 500 }
    );
  }
}


// Add this to your existing GET handler
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const drone = searchParams.get('drone');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const pattern = searchParams.get('pattern');
    
    const where: any = {};
    
    if (status && status !== 'all') {
      where.status = status;
    }
    
if (drone && drone !== 'all') {
  where.drone = {
    model: { contains: drone, mode: 'insensitive' }
  };
}

// Add additional filters if needed (dateFrom, dateTo, pattern)
// Example: Filtering by createdAt date range
if (dateFrom || dateTo) {
  where.createdAt = {};
  if (dateFrom) where.createdAt.gte = new Date(dateFrom);
  if (dateTo) where.createdAt.lte = new Date(dateTo);
}

// Example: Filtering by pattern in title or description
if (pattern) {
  where.OR = [
    { title: { contains: pattern, mode: 'insensitive' } },
    { description: { contains: pattern, mode: 'insensitive' } }
  ];
}

const missions = await prisma.mission.findMany({
  where,
  include: {
    drone: {
      select: { model: true, status: true, battery: true }
    },
    user: {
      select: { name: true, email: true }
    }
  },
  orderBy: { createdAt: 'desc' }
});

return NextResponse.json({ missions, count: missions.length });
} catch (error) {
  console.error('Error fetching missions:', error);
  return NextResponse.json({ error: 'Failed to fetch missions' }, { status: 500 });
}
}