// app/api/missions/[id]/control/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { action } = body; // start, pause, resume, abort
    
    console.log(`Control action for mission ${id}: ${action}`);

    const mission = await prisma.mission.findUnique({
      where: { id },
      include: { 
        drone: { 
          select: { model: true, status: true, battery: true } 
        },
        user: {
          select: { name: true }
        }
      },
    });

    if (!mission) {
      return NextResponse.json(
        { error: 'Mission not found' },
        { status: 404 }
      );
    }

    let updateData: any = {};
    let message = '';

    switch (action) {
      case 'start':
        if (mission.status !== 'planned') {
          return NextResponse.json(
            { error: 'Can only start planned missions' },
            { status: 400 }
          );
        }
        
        // Validate drone readiness
        if (mission.droneId) {
          const drone = await prisma.drone.findUnique({
            where: { id: mission.droneId },
            select: { status: true, battery: true },
          });
          
          if (drone?.battery === undefined || drone.battery < 20) {
            return NextResponse.json(
              { error: 'Drone not ready for takeoff (battery < 20% or not available)', drone },
              { status: 400 }
            );
          }
        }
        
        updateData = {
          status: 'in-progress',
          progress: 0,
          eta: mission.eta || 'Calculating...',
        };
        
        // Update drone status
        if (mission.droneId) {
          await prisma.drone.update({
            where: { id: mission.droneId },
            data: { 
              location: mission.waypoints?.[0] ? mission.waypoints[0] : Prisma.JsonNull,
              status: 'in-mission',},
          });
        }
        
        message = 'Mission started successfully';
        break;

      case 'pause':
        if (mission.status !== 'in-progress') {
          return NextResponse.json(
            { error: 'Can only pause active missions' },
            { status: 400 }
          );
        }
        updateData = { status: 'paused' };
        message = 'Mission paused';
        break;

      case 'resume':
        if (mission.status !== 'paused') {
          return NextResponse.json(
            { error: 'Can only resume paused missions' },
            { status: 400 }
          );
        }
        updateData = { status: 'in-progress' };
        message = 'Mission resumed';
        break;

      case 'abort':
        updateData = { 
          status: 'aborted',
          progress: 0,
          eta: null,
        };
        
        // Reset drone status and return to base
        if (mission.droneId) {
          await prisma.drone.update({
            where: { id: mission.droneId },
            data: { 
              status: 'available',
              location: Prisma.JsonNull, // Return to base
            },
          });
        }
        
        message = 'Mission aborted - drone returning to base';
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid control action' },
          { status: 400 }
        );
    }

    const updatedMission = await prisma.mission.update({
      where: { id },
      data: updateData,
      include: {
        drone: {
          select: { model: true, status: true, battery: true },
        },
      },
    });

    console.log(`${message} - Mission ${id}: ${updatedMission.status}`);

    // Emit real-time update via socket (if socket server exists)
    // socket?.emit('missionUpdate', updatedMission);

    return NextResponse.json({
      success: true,
      message,
      mission: updatedMission,
    });
  } catch (error: any) {
    console.error('Mission control error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to execute control action',
        details: error.message,
      },
      { status: 500 }
    );
  }
}