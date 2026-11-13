# LuminaCraft Database & Supabase Setup Guide

LuminaCraft ships ready to run out-of-the-box with a full-stack Express + SQLite (`node:sqlite`) + WebSocket server on Port 3000 so every feature (auth, bookings, real-time notifications, quotations, inventory, worker schedules, file uploads, and Excel/PDF reports) works immediately with zero external setup.

If you want to connect your own hosted **Supabase** project:

1. **Create a Supabase Project** at https://supabase.com
2. **Run the Database Schema**:
   Open the **SQL Editor** in your Supabase dashboard, paste the full contents of `/supabase/schema.sql`, and click **Run**. This creates all 15 relational tables (`profiles`, `customers`, `services`, `service_packages`, `bookings`, `quotations`, `booking_items`, `inventory`, `inventory_transactions`, `workers`, `worker_assignments`, `payments`, `expenses`, `notifications`, `reviews`), Row Level Security (RLS) policies, the `event-media` Storage bucket, and Realtime publications.
3. **Configure Environment Variables**:
   Set the following in your environment (never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend `VITE_*` variables):
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```
4. **Create an Admin Account**:
   Register an account via Supabase Auth, then update that user's row in `public.profiles` to `role = 'admin'`.
