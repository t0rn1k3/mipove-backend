# Mipove Project Status

> Last updated: March 2025  
> Note: artisan = professional = master (same role/concept across the app)

---

## Completed

### Backend (mipove-backend)

#### Core
- [x] Express server, MongoDB (Mongoose), CORS, error handling
- [x] DB config (`src/config/db.js`), entry point (`server.js`, `app.js`)
- [x] Scripts: `npm run server`, `npm run dev`, `npm start`

#### Models
- [x] **User** – name, email, phone, password, role (`user`|`admin`), `isBlocked`, `lastActiveAt`, image. Users collection = clients + admins.
- [x] **Master** – name, email, password, phone, specialty, location, bio, instagram, website, image, slug, works, `isBlocked`. Masters collection.
- [x] **Rating** – raterId, raterType (User|Master), master, stars (1–5). Users and masters can rate.

#### Auth
- [x] Register: `POST /api/auth/users/register`, `/auth/masters/register`, `/auth/admin/register` (admin protected by `ADMIN_SECRET`)
- [x] Login: `POST /api/auth/login` – single endpoint for all roles
- [x] Profile: `GET/PUT/POST /api/auth/profile` – update profile + image upload
- [x] `GET /api/auth/me` – current user
- [x] Middlewares: `protect`, `authorize(...roles)`
- [x] Blocked users cannot log in
- [x] Passwords hashed in controller (no pre-save hook)

#### Artisans / Masters
- [x] CRUD: `GET/POST /api/artisans`, `GET/PUT/DELETE /api/artisans/:slug`
- [x] Auto-create Artisan when master registers (auth + admin flows)
- [x] Artisan linked to User via `user` ref; one artisan per master
- [x] Update/delete restricted to owner (`user: req.user._id`)

#### Star ratings
- [x] `POST /api/artisans/:slug/rate` (user only)
- [x] `GET /api/artisans/:slug/rate/me`
- [x] `GET /api/artisans/:slug/ratings`
- [x] Artisan responses include `rating: { average, count }`

#### Admin API
- [x] Role `admin`, `authorize("admin")` on admin routes
- [x] Endpoints: stats, growth, users, active/blocked/new, masters, block/unblock, create master
- [x] `POST /api/auth/admin/register` – hidden, no UI; protected by `ADMIN_SECRET`
- [x] `scripts/create-admin.js` – `npm run create-admin` for first admin

#### Profile image upload
- [x] Multer config, profiles → `uploads/profiles/`, static `/uploads`

---

### Frontend (mipove-front)

#### Join page
- [x] Controlled form state (register + login)
- [x] Role: User vs Professional (master)
- [x] API calls: `registerUser`, `registerMaster`, `login`
- [x] Redirect by role after login/register (admin → `/admin`, professional → `/professionals`)

#### Admin dashboard
- [x] `/admin` – role-protected page
- [x] CSS modules (no Tailwind on admin dashboard)
- [x] Overview, Users tab, Professionals tab
- [x] Stats, quick actions, activity list
- [x] User table: search, filter, block, upgrade to professional, delete
- [x] Professional table: search, filter, block, delete
- [x] Add Professional modal
- [x] Navbar shows “Admin” link only for admins (replacing Join when logged in as admin)
- [x] Non-admins redirected from `/admin`

#### Auth / API
- [x] `lib/api.ts` – `registerUser`, `registerMaster`, `login`, `getMe`, token helpers
- [x] `.env.local`: `NEXT_PUBLIC_API_URL`

---

## In progress / TODO

- [ ] Wire Admin Dashboard to real admin API (currently mock data)
- [ ] Profile management for masters (artisan fields, portfolio)
- [ ] Sync User profile changes to Artisan when master updates (name, email, phone)
- [ ] Logout flow and token handling across app

---

## Key paths

| Item        | Path |
|------------|------|
| Backend    | `d:\projects\mipove-backend` |
| Frontend   | `d:\projects\mipove-front` |
| API base   | `http://localhost:5000/api` |
| Frontend   | `http://localhost:3000` |

---

## Admin setup

1. Set `ADMIN_SECRET` in `.env`
2. Run `npm run create-admin` in backend
3. Login at `/join` with admin account
4. Navbar shows “Admin” → go to `/admin`
