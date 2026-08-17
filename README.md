# Cross-Platform TV Show & Recommendation Monorepo (v0.3)

A full-stack, multi-tenant cross-platform TV Show Tracker and Personalized Recommendation system with Cloudflare Tunnel remote backend deployment support.

The project is structured into two primary components:
1. **`/mobile`**: React Native app built with Expo (TypeScript), Expo Router (5-tab navigation + Auth modal), NativeWind (Dark Mode), and React Query.
2. **`/backend`**: Node.js Express server (TypeScript) with PostgreSQL (Prisma ORM), JWT Authentication, TVmaze API, TMDB API, Watchmode streaming provider data, dynamic `.ics` calendar feed generator, personalized recommendation engine, and nightly cron jobs.

---

## What's New in v0.3

- **Multi-Tenant User System & JWT Authentication**:
  - `bcryptjs` password hashing with salt rounds.
  - JWT token generation & verification with Express `authMiddleware`.
  - Auth endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
  - **Strict Data Isolation**: User watchlists, ratings, dismissed recommendations, and push tokens are isolated to `req.user.userId`.
- **Cloudflare Tunnel Deployment Configuration**:
  - `docker-compose.yml` includes an optional `cloudflared` tunnel container profile.
  - Exposes the backend securely over HTTPS (e.g. `https://api.yourdomain.com`) without opening router firewall ports.
- **Mobile Authentication & Session Persistence**:
  - Dedicated **Auth Screen** (`mobile/app/auth.tsx`) with Login / Sign Up tabs.
  - `useAuthStore.ts` managing persistent JWT tokens via `AsyncStorage`.
  - Axios request interceptor automatically attaching `Authorization: Bearer <token>`.
  - Settings screen with Account profile details, Sign Out action, and Cloudflare Tunnel connection status.

---

## Directory Structure

```text
tv-tracker-monorepo/
├── package.json                         # Root monorepo workspace configuration
├── README.md                            # Complete setup & API documentation
├── mobile/                              # Expo React Native App (iOS/Android)
│   ├── app/                             # Expo Router navigation
│   │   ├── _layout.tsx                  # Root layout (Dark theme, Auth session restoration)
│   │   ├── auth.tsx                     # Login & Registration modal screen
│   │   ├── (tabs)/                      # 5-Tab Navigation
│   │   │   ├── _layout.tsx              # Tab bar (Watchlist, For You, Explore, Calendar, Settings)
│   │   │   ├── index.tsx                # Watchlist Screen (Ratings, favorites, status filters)
│   │   │   ├── recommendations.tsx      # For You Screen (Personalized carousels & quick actions)
│   │   │   ├── search.tsx               # Explore / Search Screen
│   │   │   ├── calendar.tsx             # Release Calendar Screen (Timeline agenda)
│   │   │   └── settings.tsx             # Settings, Account Profile, & Dynamic .ics Feed Sync
│   │   └── show/
│   │       └── [id].tsx                 # Show Details Screen (Backdrop, streaming links, rating, similar shows)
│   ├── components/                      # Reusable UI components
│   │   ├── Header.tsx
│   │   ├── SearchBar.tsx
│   │   ├── SegmentedTabs.tsx
│   │   ├── StarRating.tsx               # 1-5 Star interactive rating widget
│   │   ├── FavoriteButton.tsx           # Heart toggle button
│   │   ├── RecommendationCarousel.tsx   # Horizontal scrollable recommendation carousel
│   │   ├── StreamingBadge.tsx           # Brand styled streaming badges
│   │   ├── ShowCard.tsx                 # Show card with ratings, favorites, next episode badge
│   │   ├── EpisodeCard.tsx              # Episode rows with release tags and synopsis
│   │   ├── EmptyState.tsx               # Empty states with action CTAs
│   │   └── StatusPickerModal.tsx        # Bottom sheet for watchlist status & deletion
│   ├── services/
│   │   ├── api.ts                       # Axios client with JWT interceptor & Cloudflare URL
│   │   └── notifications.ts             # Expo push notification handler
│   ├── store/
│   │   ├── useAuthStore.ts              # Authentication state & JWT persistence
│   │   ├── useUserStore.ts              # Local device identity & preferences
│   │   └── useWatchlistStore.ts         # Watchlist state and filters
│   ├── types/                           # TypeScript definitions
│   ├── tailwind.config.js               # NativeWind / Tailwind styling
│   ├── babel.config.js / metro.config.js
│   ├── tsconfig.json
│   ├── app.json
│   └── package.json
└── backend/                             # Express + Prisma + JWT + TVmaze + TMDB + ICS + Scheduler
    ├── prisma/
    │   └── schema.prisma                # PostgreSQL models (User, Show, Watchlist, DismissedRecommendation, Episode, StreamingProvider)
    ├── src/
    │   ├── middleware/
    │   │   └── auth.ts                  # JWT verification & AuthenticatedRequest
    │   ├── controllers/                 # Route handlers
    │   │   ├── authController.ts
    │   │   ├── showsController.ts
    │   │   ├── watchlistController.ts
    │   │   ├── recommendationController.ts
    │   │   ├── calendarController.ts
    │   │   └── userController.ts
    │   ├── routes/                      # Express route endpoints
    │   │   ├── auth.routes.ts
    │   │   ├── shows.routes.ts
    │   │   ├── watchlist.routes.ts
    │   │   ├── recommendations.routes.ts
    │   │   ├── calendar.routes.ts
    │   │   ├── user.routes.ts
    │   │   └── index.ts
    │   ├── services/                    # Core business logic & integrations
    │   │   ├── prisma.ts                # Prisma client singleton
    │   │   ├── tvmaze.ts                # TVmaze API service
    │   │   ├── tmdb.ts                  # TMDB API & similarity clustering
    │   │   ├── recommendation.ts        # Personalized recommendation engine
    │   │   ├── watchmode.ts             # Streaming availability service
    │   │   ├── ics.ts                   # Dynamic RFC-5545 .ics generator
    │   │   ├── notification.ts          # Expo Push HTTP API dispatcher
    │   │   ├── email.ts                 # Resend / HTML email digest service
    │   │   └── scheduler.ts             # node-cron nightly scheduler
    │   ├── types/                       # Backend TypeScript DTOs
    │   └── index.ts                     # Express server entry point
    ├── tests/                           # Backend automated tests
    │   ├── auth.test.ts                 # Registration, login, password hashing, JWT tests
    │   ├── recommendation.test.ts       # Recommendation filtering & dismissal tests
    │   ├── integration.test.ts          # Live TVmaze search tests
    │   ├── ics.test.ts                  # RFC-5545 calendar tests
    │   └── tvmaze.test.ts               # TVmaze helper tests
    ├── docker-compose.yml               # PostgreSQL 16 + API + Cloudflare Tunnel containerization
    ├── Dockerfile
    ├── tsconfig.json
    ├── .env.example
    └── package.json
```

---

## Quickstart

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
npm install
docker compose up -d postgres
npx prisma db push
npm run dev
```

The server runs on `http://localhost:4000`.

### 2. Cloudflare Tunnel Remote Deployment (Optional)

To expose your backend over a secure public HTTPS domain:
1. Create a Tunnel in your Cloudflare Zero Trust Dashboard.
2. Add your tunnel token to `backend/.env`:
   ```env
   CLOUDFLARE_TUNNEL_TOKEN="your_cloudflare_tunnel_token_here"
   APP_BASE_URL="https://api.yourdomain.com"
   ```
3. Start the stack with the `cloudflare` profile:
   ```bash
   docker compose --profile cloudflare up -d
   ```

### 3. Mobile Setup

```bash
cd mobile

# Point mobile to your local backend or Cloudflare Tunnel
export EXPO_PUBLIC_API_URL="http://localhost:4000" # or "https://api.yourdomain.com"

npm install
npx expo start
```
Press `i` for iOS Simulator, `a` for Android Emulator, or `w` for Web.

---

## Authentication API Reference

- `POST /api/auth/register`: Create account (`email`, `password`, `name`). Returns JWT `token` and `user`.
- `POST /api/auth/login`: Authenticate with `email` and `password`. Returns JWT `token` and `user`.
- `GET /api/auth/me`: Get profile of authenticated user (`Authorization: Bearer <token>`).
- `GET /api/watchlist`: Scoped strictly to authenticated user's token.
- `GET /api/recommendations`: Scoped strictly to authenticated user's token.
- `GET /api/calendar/:userId/feed.ics`: Dynamic personal iCalendar feed.
