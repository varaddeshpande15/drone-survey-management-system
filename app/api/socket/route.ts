// // app/api/socket/route.ts
// import { NextRequest } from 'next/server';
// import { Server } from 'socket.io';
// import { createServer } from 'http';

// let io: Server | null = null;

// export async function GET(request: NextRequest) {
//   const httpServer = createServer();
  
//   if (!io) {
//     io = new Server(httpServer, {
//       cors: {
//         origin: process.env.NODE_ENV === 'production' 
//           ? 'https://your-vercel-domain.vercel.app'
//           : 'http://localhost:3000',
//         methods: ['GET', 'POST'],
//       },
//     });

//     io.on('connection', (socket) => {
//       console.log('🟢 Client connected:', socket.id);

//       socket.on('joinFleet', () => {
//         console.log('📡 Client joined fleet channel');
//         socket.join('fleet');
//       });

//       // Simulate periodic updates (for demo)
//       const interval = setInterval(() => {
//         if (socket.rooms.has('fleet')) {
//           // Simulate battery drain for in-mission drones
//           const update = {
//             id: 'drone-3',
//             battery: Math.max(0, 72 - Math.floor(Math.random() * 3)),
//             vitals: {
//               signal: 'moderate',
//               gps: 15,
//               rssi: -65 - Math.floor(Math.random() * 5),
//             },
//           };
//           socket.to('fleet').emit('droneUpdate', update);
//         }
//       }, 10000);

//       socket.on('disconnect', () => {
//         console.log('🔴 Client disconnected:', socket.id);
//         clearInterval(interval);
//       });
//     });
//   }

//   httpServer.on('upgrade', (req, socket, head) => {
//     io?.engine.handleUpgrade(req as any, socket, head);
//   });

//   return new Response('Socket server ready', { status: 200 });
// }



// app/api/socket/route.ts
import { NextRequest } from 'next/server';
import { Server, Socket } from 'socket.io';
import { prisma } from '@/lib/prisma';

let io: Server | null = null;

export async function GET(request: NextRequest) {
  // For Vercel, we need to handle WebSocket differently
  // This is a placeholder - in production, you'd use a dedicated WebSocket server
  
  if (!io) {
    console.log('Initializing Socket.io server...');
    // io = new Server((req as any).socket.server, {
    //   cors: { origin: '*' }
    // });
    
    // For demo purposes, simulate the server behavior
    simulateSocketServer();
  }

  return new Response('Socket server ready', { status: 200 });
}

// Simulate real-time updates for demo
const simulateSocketServer = () => {
  console.log('🎮 Starting mission simulation server...');
  
  // Simulate periodic updates for active missions
  setInterval(async () => {
    try {
      const activeMissions = await prisma.mission.findMany({
        where: { status: 'in-progress' },
        include: { drone: true },
        take: 3,
      });
      
      activeMissions.forEach(async (mission) => {
        if (mission.progress < 95) {
          // Simulate progress
          const newProgress = Math.min(100, mission.progress + Math.random() * 3);
          const updatedMission = await prisma.mission.update({
            where: { id: mission.id },
            data: { 
              progress: Math.floor(newProgress),
              eta: `${Math.max(0, Math.floor((100 - newProgress) / 5))}min`,
            },
            include: { drone: true },
          });
          
          console.log(`📡 Simulated update: Mission ${mission.id} - ${newProgress}%`);
          
          // Simulate battery drain
          if (mission.droneId && mission.drone) {
            const newBattery = Math.max(5, mission.drone.battery - Math.random() * 2);
            await prisma.drone.update({
              where: { id: mission.droneId },
              data: { battery: Math.floor(newBattery) },
            });
          }
          
          // In a real app, this would emit to connected clients:
          // io?.to(`mission:${mission.id}`).emit('missionUpdate', updatedMission);
        }
      });
    } catch (error) {
      console.error('Simulation error:', error);
    }
  }, 5000); // Update every 5 seconds
}

// Export for use in other files
export { io };