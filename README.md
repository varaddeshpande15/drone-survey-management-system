# Drone Survey Management System

A full-stack, production-ready drone operations platform for planning, executing, monitoring, and analyzing automated survey missions across global sites.

---

### Overview

This application enables organizations to manage enterprise drone survey operations with a modern, real-time web interface. It covers the complete mission lifecycle — from area planning and flight path generation to live monitoring and post-flight analytics.

Built with **Next.js 14 (App Router)**, **TypeScript**, **Prisma**, **PostgreSQL**, and **Tailwind CSS**, the system is designed for scalability, safety, and ease of use.

---

### Core Features

#### Mission Planning & Configuration
- Draw survey areas using polygon tools on an interactive map
- Automatically generate optimized flight paths (crosshatch, perimeter, etc.)
- Configure altitude, speed, overlap, GSD, and sensor payload
- Real-time preview of coverage and estimated flight time

#### Fleet Dashboard
- Global view of all registered drones
- Real-time status: available, in-mission, charging, maintenance
- Battery level, location, and health monitoring

#### Real-Time Mission Monitoring
- Live mission progress (percentage complete, ETA)
- Visual flight path overlay with current drone position
- Mission control: Start • Pause • Resume • Abort
- Safety pre-flight checks (battery ≥20%, drone availability)

#### Survey Reports & Analytics
- Organization-wide performance dashboard
- Key metrics: total missions, coverage %, distance flown, duration
- Pattern and sensor usage analytics (bar, radar, pie charts)
- Export reports as PDF or CSV

---

### Tech Stack

| Layer              | Technology                          |
|--------------------|-------------------------------------|
| Framework          | Next.js 14 (App Router)             |
| Language           | TypeScript                          |
| Styling            | Tailwind CSS + shadcn/ui            |
| Database           | PostgreSQL                          |
| ORM                | Prisma                              |
| Maps               | React Leaflet                       |
| Charts             | Recharts                            |
| PDF/CSV Export     | jsPDF + autoTable, react-csv        |
| Deployment         | Vercel                              |
| Icons              | Lucide React                        |

---


### Key Implementation Highlights

- **Smart Flight Path Generation** – Crosshatch patterns with configurable overlap for maximum coverage
- **State Machine Logic** – Robust mission control with proper status validation
- **Safety-First Design** – Prevents takeoff if battery <20% or drone not available
- **Real-Time Updates** – Instant UI refresh on mission state changes
- **Comprehensive Analytics** – From raw mission data to visual insights and exports
- **AI-Accelerated Development** – 60%+ of code written/refactored using Claude, Cursor, and Copilot

---

### Getting Started

```bash
# Clone the repo
git clone https://github.com/yourusername/drone-survey-system.git
cd drone-survey-system

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Add your PostgreSQL DATABASE_URL

# Run migrations
npx prisma migrate dev

# Optional: seed sample data
npx prisma db seed

# Start development server
npm run dev

Open http://localhost:3000
```
