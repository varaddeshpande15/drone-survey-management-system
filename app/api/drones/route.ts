// app/api/drones/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const drones = await prisma.drone.findMany({
      select: {
        id: true,
        model: true,
        status: true,
        battery: true,
        vitals: true,
        location: true,
        createdAt: true
      }
    })
    return NextResponse.json({ drones, count: drones.length })
  } catch (error) {
    console.error('Error fetching drones:', error)
    return NextResponse.json({ error: 'Failed to fetch drones' }, { status: 500 })
  }
}