// app/api/missions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// export async function GET(
//   request: NextRequest,
//   { params }: { params: { id: string } }
// ) {
//   try {
//     const { id } = params;
    
//     console.log(`Fetching single mission: ${id}`);
    
//     const mission = await prisma.mission.findUnique({
//       where: { id },
//       include: {
//         drone: {
//           select: { 
//             id: true,
//             model: true, 
//             status: true, 
//             battery: true, 
//             vitals: true,
//             location: true
//           }
//         },
//         user: {
//           select: { name: true, email: true }
//         }
//       },
//     });

//     if (!mission) {
//       console.log(`Mission ${id} not found`);
//       return NextResponse.json(
//         { error: 'Mission not found' },
//         { status: 404 }
//       );
//     }

//     console.log(`Mission ${id} found:`, {
//       title: mission.title,
//       status: mission.status,
//       drone: mission.drone?.model
//     });

//     return NextResponse.json(mission);
//   } catch (error) {
//     console.error('Error fetching mission:', error);
//     return NextResponse.json(
//       { error: 'Failed to fetch mission' },
//       { status: 500 }
//     );
//   }
// }




export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // ← Fixed: Promise<{ id: string }>
) {
  try {
    const { id } = await params;  // ← Fixed: await params
    
    console.log(`Fetching single mission: ${id}`);
    
    const mission = await prisma.mission.findUnique({
      where: { id },
      include: {
        drone: {
          select: { 
            id: true,
            model: true, 
            status: true, 
            battery: true, 
            vitals: true,
            location: true
          }
        },
        user: {
          select: { name: true, email: true }
        }
      },
    });

    if (!mission) {
      console.log(`Mission ${id} not found`);
      return NextResponse.json(
        { error: 'Mission not found' },
        { status: 404 }
      );
    }

    console.log(`Mission ${id} found:`, {
      title: mission.title,
      status: mission.status,
      drone: mission.drone?.model
    });

    return NextResponse.json(mission);
  } catch (error) {
    console.error('Error fetching mission:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mission' },
      { status: 500 }
    );
  }
}            