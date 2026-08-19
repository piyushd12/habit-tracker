# Aura - Habit Tracker

A production-ready habit tracking web application with streak calculation, timezone-aware logging, push notifications, and beautiful data visualizations.

## 🏗️ Architecture

**Frontend:** React 19 + TypeScript + Vite  
**Backend:** Node.js + Express + TypeScript  
**Database:** PostgreSQL 15 via Prisma ORM  
**Caching & Jobs:** Redis + BullMQ  
**Authentication:** JWT (access + refresh tokens) with bcrypt password hashing  
**Push Notifications:** Web Push API with VAPID

---

## ✨ Features

### Core Functionality

- ✅ **User Authentication** - Secure signup/login with JWT tokens and refresh token rotation
- ✅ **Habit CRUD** - Create, read, update, and delete habits with daily or custom schedules
- ✅ **Daily Check-offs** - Mark habits complete with timezone-aware date boundaries
- ✅ **Streak Tracking** - Automatic calculation of current and longest streaks
- ✅ **Smart Dashboard** - Real-time stats, completion rates, and progress tracking

### Advanced Features

- ✅ **Timezone Handling** - All logging respects user's local timezone (prevents streak corruption)
- ✅ **Custom Schedules** - Support for DAILY and CUSTOM (specific weekdays) frequencies
- ✅ **Data Visualizations**:
  - 7-day completion bar chart
  - 12-week GitHub-style heatmap
  - Real-time streak counters
- ✅ **Web Push Reminders** - Configurable daily reminder notifications
- ✅ **Optimistic UI Updates** - Instant feedback with automatic rollback on errors
- ✅ **Production-Quality Error Handling** - Consistent error responses and loading states

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd prompt_comp_test
```

### 2. Start Infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d
```

This starts:

- PostgreSQL 15 on port `5432`
- Redis 7 on port `6379`

### 3. Backend Setup

```bash
cd server

# Copy environment template
cp .env.example .env

# Edit .env and configure:
# - DATABASE_URL (default: postgresql://habit_user:habit_pass@localhost:5432/habit_tracker)
# - JWT_SECRET (generate a secure random string)
# - VAPID keys (see below)

# Generate VAPID keys for Web Push
npx web-push generate-vapid-keys

# Add the keys to .env:
# VAPID_PUBLIC_KEY=<public key>
# VAPID_PRIVATE_KEY=<private key>
# VAPID_SUBJECT=mailto:your-email@example.com

# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

The backend will start on **<http://localhost:5000>**

### 4. Frontend Setup

Open a new terminal:

```bash
cd client

# Copy environment template
cp .env.example .env

# Edit .env and configure:
# VITE_API_URL=http://localhost:5000
# VITE_VAPID_PUBLIC_KEY=<your VAPID public key from server .env>

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will start on **<http://localhost:5173>**

### 5. Access the Application

Open your browser and navigate to:

```
http://localhost:5173
```

Create an account and start tracking your habits! 🎉

---

## 📁 Project Structure

```
prompt_comp_test/
├── client/                      # React frontend
│   ├── public/
│   │   └── sw.js               # Service worker for push notifications
│   ├── src/
│   │   ├── assets/             # Images and static assets
│   │   ├── context/            # React context (Auth)
│   │   ├── pages/              # Route pages (Dashboard, Login, Register, Settings)
│   │   ├── services/           # API client with auto token refresh
│   │   ├── types/              # TypeScript type definitions
│   │   ├── App.tsx             # Main app with routing
│   │   ├── index.css           # Global styles (dark glassmorphic theme)
│   │   └── main.tsx            # Entry point
│   └── package.json
│
├── server/                      # Express backend
│   ├── prisma/
│   │   ├── migrations/         # Database migration history
│   │   └── schema.prisma       # Database schema definition
│   ├── src/
│   │   ├── config/             # Database and Redis clients
│   │   ├── middleware/         # Auth guards, Zod validation
│   │   ├── routes/             # API route handlers
│   │   │   ├── auth.ts         # /api/auth/* (register, login, logout, refresh, me, timezone)
│   │   │   ├── habits.ts       # /api/habits/* (CRUD operations)
│   │   │   ├── logs.ts         # /api/habits/:id/logs/* (check-offs, streak)
│   │   │   └── reminders.ts    # /api/reminders/* (settings, push subscription)
│   │   ├── services/
│   │   │   ├── scheduler.ts    # Timezone-bucketed reminder scheduler (BullMQ)
│   │   │   └── streaks.ts      # Streak calculation engine
│   │   ├── types/              # TypeScript type definitions
│   │   ├── utils/              # Error handlers, JWT utilities
│   │   └── app.ts              # Express app initialization
│   └── package.json
│
├── docker-compose.yml           # PostgreSQL + Redis orchestration
├── habit_tracker_architecture.md  # Detailed architecture documentation
├── till_now.md                  # Implementation status and handoff notes
└── README.md                    # This file
```

---

## 🔧 Development

### Backend Commands

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Database commands
npx prisma migrate dev        # Create and apply migrations
npx prisma migrate deploy     # Apply migrations (production)
npx prisma studio             # Open database GUI
npx prisma generate           # Regenerate Prisma client
```

### Frontend Commands

```bash
# Development mode
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Build Verification

Both apps should compile cleanly:

```bash
# Backend
cd server && npm run build

# Frontend
cd client && npm run build
```

---

## 🗄️ Database Schema

### Core Tables

- **users** - User accounts with email, password hash, and timezone
- **habits** - User habits with frequency, schedule, and cached streak data
- **habit_logs** - Daily completion records (unique per habit per date)
- **reminder_settings** - User's preferred reminder time and enable/disable state
- **push_subscriptions** - Web Push subscription endpoints for notifications
- **refresh_tokens** - DB-backed refresh token sessions for revocation support

### Key Design Decisions

1. **Timezone-Aware Logging**: The `habit_logs.date` field stores pre-computed `YYYY-MM-DD` strings in the user's local timezone, preventing streak corruption from UTC timestamp shifts.

2. **Cached Streaks**: `currentStreak` and `longestStreak` are denormalized on the `habits` table and updated on every log write/delete for O(1) read performance.

3. **Refresh Token Rotation**: Each token refresh generates a new token and revokes the old one, providing better security than stateless refresh tokens.

---

## 🔐 Authentication Flow

1. **Register/Login** → Server issues:
   - Short-lived access token (15 min, in-memory on client)
   - Long-lived refresh token (7 days, httpOnly cookie)
   - Refresh token hash stored in database

2. **API Requests** → Client sends access token in `Authorization: Bearer <token>` header

3. **Token Expired** → Client automatically refreshes using httpOnly cookie
   - Server rotates refresh token (revokes old, issues new)
   - Returns new access token

4. **Logout** → Revokes refresh token from database and clears cookie

---

## 📊 API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| POST | `/register` | Create new user account |
| POST | `/login` | Authenticate user |
| POST | `/logout` | Revoke refresh token and clear session |
| POST | `/refresh` | Get new access token using refresh token |
| GET | `/me` | Get current user profile |
| PUT | `/timezone` | Update user's timezone |

### Habits (`/api/habits`)

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| GET | `/` | List all user habits (includes logs) |
| POST | `/` | Create new habit |
| GET | `/:id` | Get single habit details |
| PUT | `/:id` | Update habit |
| DELETE | `/:id` | Delete habit |

### Habit Logs (`/api/habits/:id`)

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| POST | `/logs` | Mark habit complete for a date |
| DELETE | `/logs/:date` | Un-mark habit completion |
| GET | `/streak` | Get current streak calculation |

### Reminders (`/api/reminders`)

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| GET | `/settings` | Get reminder settings |
| PUT | `/settings` | Update reminder time and enabled state |
| POST | `/subscribe` | Register Web Push subscription |

All endpoints return JSON with consistent structure:

- **Success**: `{ status: "success", data: { ... } }`
- **Error**: `{ status: "error", message: "..." }`

---

## 🌍 Timezone Handling

The app handles timezone boundaries correctly to prevent streak corruption:

1. **User Timezone Storage**: Each user has a timezone field (IANA identifier like `America/New_York`)

2. **Date String Format**: Habit logs store dates as `YYYY-MM-DD` strings in the user's local timezone, not UTC timestamps

3. **Completion Validation**: Users can only toggle completions for **today** or **yesterday** to prevent historical tampering

4. **Example**: A user in Tokyo (UTC+9) completing a habit at 1:30 AM local time on Aug 10:
   - UTC timestamp: Aug 9, 4:30 PM
   - Stored date: `"2026-08-10"` (Tokyo local date)
   - ✅ Correct: Attributed to Aug 10 in streak calculation
   - ❌ Without timezone handling: Would be Aug 9, breaking the streak

---

## 🔔 Push Notifications Setup

### Configuration Steps

1. **Generate VAPID Keys**:

   ```bash
   cd server
   npx web-push generate-vapid-keys
   ```

2. **Add Keys to Server `.env`**:

   ```env
   VAPID_PUBLIC_KEY=<public key>
   VAPID_PRIVATE_KEY=<private key>
   VAPID_SUBJECT=mailto:your-email@example.com
   ```

3. **Add Public Key to Client `.env`**:

   ```env
   VITE_VAPID_PUBLIC_KEY=<same public key as server>
   ```

4. **Enable in App**:
   - Log in to the application
   - Navigate to Settings
   - Set your preferred reminder time
   - Click "Enable Push Notifications"
   - Grant browser permission when prompted

### How It Works

- **Scheduler**: Runs every 30 minutes, queries users by timezone bucket
- **Delivery**: BullMQ job queue processes push notifications asynchronously
- **Service Worker**: Handles incoming push events and displays notifications

---

## 🎨 UI Features

### Dark Glassmorphic Theme

- Frosted glass panels with backdrop blur
- CSS custom properties for consistent theming
- Smooth transitions and micro-animations
- Accessible color contrast ratios

### Data Visualizations

1. **7-Day Bar Chart** (Recharts):
   - Shows total habit completions per day
   - Styled tooltips with date and count
   - Responsive design

2. **12-Week Heatmap**:
   - GitHub contribution grid style
   - Color intensity based on completion count
   - Hover tooltips with date and count

3. **Real-Time Stats**:
   - Active habits count
   - Current streak (highest among all habits)
   - Longest streak (all-time record)
   - Today's completion percentage
