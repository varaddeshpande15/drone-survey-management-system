// prisma/seed.js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['warn', 'error']
});

async function main() {
  console.log('🚀 Starting clean database seeding...');

  try {
    // Step 1: Create sample users first (no delete needed for clean seed)
    console.log('📝 Creating sample users...');
    const usersData = [
      {
        id: 'sample-user-1',
        name: 'John Smith',
        email: 'john.smith@flytbase.com',
        image: 'https://via.placeholder.com/150'
      },
      {
        id: 'sample-user-2',
        name: 'Sarah Johnson',
        email: 'sarah.johnson@flytbase.com',
        image: 'https://via.placeholder.com/150'
      },
      {
        id: 'sample-user-3',
        name: 'Mike Chen',
        email: 'mike.chen@flytbase.com',
        image: 'https://via.placeholder.com/150'
      }
    ];

    // Use upsert to avoid duplicates
    for (const userData of usersData) {
      await prisma.user.upsert({
        where: { id: userData.id },
        update: {},
        create: userData
      });
    }

    console.log('✅ Created 3 sample users');

    // Step 2: Create sample drones
    console.log('🛩️ Creating sample drones...');
    const dronesData = [
      {
        id: 'drone-1',
        model: 'DJI Mavic 3 Enterprise',
        status: 'available',
        battery: 95,
        vitals: { signal: 'strong', gps: 12, rssi: -42 },
        location: { lat: 40.7128, lng: -74.006, alt: 0 }
      },
      {
        id: 'drone-2',
        model: 'DJI Matrice 300 RTK',
        status: 'charging',
        battery: 100,
        vitals: { signal: 'strong', gps: 10, rssi: -38 },
        location: { lat: 51.5074, lng: -0.1278, alt: 0 }
      },
      {
        id: 'drone-3',
        model: 'Autel EVO II Pro',
        status: 'in-mission',
        battery: 72,
        vitals: { signal: 'moderate', gps: 15, rssi: -65 },
        location: { lat: 35.6762, lng: 139.6503, alt: 100 }
      },
      {
        id: 'drone-4',
        model: 'DJI Mini 3 Pro',
        status: 'available',
        battery: 88,
        vitals: { signal: 'strong', gps: 11, rssi: -45 },
        location: { lat: -33.8688, lng: 151.2093, alt: 0 }
      },
      {
        id: 'drone-5',
        model: 'Skydio X2',
        status: 'available',
        battery: 92,
        vitals: { signal: 'strong', gps: 14, rssi: -40 },
        location: { lat: 48.8566, lng: 2.3522, alt: 0 }
      },
      {
        id: 'drone-6',
        model: 'Parrot ANAFI USA',
        status: 'available',
        battery: 85,
        vitals: { signal: 'strong', gps: 13, rssi: -48 },
        location: { lat: 37.7749, lng: -122.4194, alt: 0 }
      },
      {
        id: 'drone-7',
        model: 'DJI Air 2S',
        status: 'maintenance',
        battery: 0,
        vitals: { signal: 'none', gps: 0, rssi: 0 },
        location: { lat: 40.7128, lng: -74.006, alt: 0 }
      },
      {
        id: 'drone-8',
        model: 'WingtraOne GEN II',
        status: 'available',
        battery: 97,
        vitals: { signal: 'strong', gps: 16, rssi: -35 },
        location: { lat: -23.5505, lng: -46.6333, alt: 0 }
      },
      {
        id: 'drone-9',
        model: 'SenseFly eBee X',
        status: 'available',
        battery: 90,
        vitals: { signal: 'strong', gps: 12, rssi: -44 },
        location: { lat: 55.7558, lng: 37.6176, alt: 0 }
      },
      {
        id: 'drone-10',
        model: 'DJI Matrice 30',
        status: 'available',
        battery: 93,
        vitals: { signal: 'strong', gps: 14, rssi: -41 },
        location: { lat: 1.3521, lng: 103.8198, alt: 0 }
      }
    ];

    // Use upsert for drones too
    for (const droneData of dronesData) {
      await prisma.drone.upsert({
        where: { id: droneData.id },
        update: {},
        create: droneData
      });
    }

    console.log('✅ Created 10 sample drones');

    // Step 3: Create sample missions
    console.log('🎯 Creating sample missions...');
    
    const nycArea = {
      type: 'Polygon',
      coordinates: [[
        [-74.006, 40.7128], [-73.935, 40.7128], [-73.935, 40.830], 
        [-74.006, 40.830], [-74.006, 40.7128]
      ]]
    };

    const nycWaypoints = [
      { lat: 40.7128, lng: -74.006, alt: 100 },
      { lat: 40.720, lng: -73.950, alt: 100 },
      { lat: 40.730, lng: -74.000, alt: 100 },
      { lat: 40.740, lng: -73.980, alt: 100 }
    ];

    const londonArea = {
      type: 'Polygon',
      coordinates: [[
        [-0.1278, 51.5074], [-0.1000, 51.5074], [-0.1000, 51.5200], 
        [-0.1278, 51.5200], [-0.1278, 51.5074]
      ]]
    };

    const londonWaypoints = [
      { lat: 51.5074, lng: -0.1278, alt: 50 },
      { lat: 51.5150, lng: -0.1150, alt: 50 },
      { lat: 51.5100, lng: -0.1200, alt: 50 }
    ];

    const tokyoArea = {
      type: 'Polygon',
      coordinates: [[
        [139.6503, 35.6762], [139.6700, 35.6762], [139.6700, 35.6900], 
        [139.6503, 35.6900], [139.6503, 35.6762]
      ]]
    };

    const tokyoWaypoints = [
      { lat: 35.6762, lng: 139.6503, alt: 80 },
      { lat: 35.6820, lng: 139.6600, alt: 80 },
      { lat: 35.6880, lng: 139.6550, alt: 80 }
    ];

    const missionParams = {
      altitude: 100,
      overlap: 80,
      sensors: ['camera', 'thermal'],
      frequency: '5s',
      pattern: 'crosshatch',
      speed: 10
    };

    const missionsData = [
      {
        id: 'mission-1',
        title: 'NYC Factory Inspection',
        description: 'Routine monthly inspection of manufacturing facility',
        area: nycArea,
        waypoints: nycWaypoints,
        params: missionParams,
        status: 'planned',
        droneId: 'drone-1',
        userId: 'sample-user-1'
      },
      {
        id: 'mission-2',
        title: 'London Security Patrol',
        description: 'Nighttime perimeter security check',
        area: londonArea,
        waypoints: londonWaypoints,
        params: { ...missionParams, pattern: 'perimeter', altitude: 50 },
        status: 'in-progress',
        progress: 45,
        eta: '8min',
        droneId: 'drone-2',
        userId: 'sample-user-2'
      },
      {
        id: 'mission-3',
        title: 'Tokyo Site Mapping',
        description: 'Construction site progress mapping',
        area: tokyoArea,
        waypoints: tokyoWaypoints,
        params: { ...missionParams, pattern: 'crosshatch' },
        status: 'completed',
        progress: 100,
        duration: '22min',
        distance: 3.2,
        coverage: 94,
        droneId: 'drone-3',
        userId: 'sample-user-3'
      }
    ];

    // Use upsert for missions
    for (const missionData of missionsData) {
      await prisma.mission.upsert({
        where: { id: missionData.id },
        update: {},
        create: missionData
      });
    }

    console.log('✅ Created 3 sample missions');

    // Step 4: Verify data
    const userCount = await prisma.user.count();
    const droneCount = await prisma.drone.count();
    const missionCount = await prisma.mission.count();

    console.log('\n📊 Database Summary:');
    console.log(`- 👤 Users: ${userCount}`);
    console.log(`- 🛩️ Drones: ${droneCount}`);
    console.log(`- 🎯 Missions: ${missionCount}`);
    console.log('🎉 Seeding completed successfully!');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('❌ Final seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('🔌 Database connection closed');
  });