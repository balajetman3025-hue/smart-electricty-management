-- LuminaCraft Electrical & Event Lighting Management Platform
-- Complete Supabase PostgreSQL Schema, RLS Policies, Storage & Realtime Setup

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name TEXT,
  saved_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  private_notes TEXT,
  total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SERVICES
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  starting_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. SERVICE PACKAGES
CREATE TABLE IF NOT EXISTS public.service_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL,
  duration_hours INTEGER NOT NULL DEFAULT 8,
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- 5. BOOKINGS
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_code TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id),
  package_id UUID REFERENCES public.service_packages(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_location TEXT NOT NULL,
  venue_size TEXT NOT NULL,
  estimated_budget NUMERIC(12, 2) NOT NULL DEFAULT 0,
  lighting_requirements TEXT NOT NULL,
  additional_instructions TEXT,
  reference_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN (
    'Pending', 'Request Received', 'Site Visit Required', 'Quotation Sent',
    'Approved', 'Work in Progress', 'Completed', 'Cancelled'
  )),
  site_visit_date DATE,
  internal_notes TEXT,
  estimated_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. QUOTATIONS
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  quotation_number TEXT NOT NULL UNIQUE,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  advance_required NUMERIC(12, 2) NOT NULL DEFAULT 0,
  valid_until DATE NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Sent' CHECK (status IN ('Sent', 'Accepted', 'Rejected', 'Revised')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

-- 7. INVENTORY
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'LED lights', 'Serial lights', 'Rice lights', 'RGB strips', 'LED bulbs',
    'Wires and cables', 'Extension boards', 'Controllers',
    'Decorative lighting', 'Other electrical equipment'
  )),
  quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  unit TEXT NOT NULL DEFAULT 'pcs',
  purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_stock_alert INTEGER NOT NULL DEFAULT 10,
  supplier_name TEXT NOT NULL DEFAULT '',
  supplier_contact TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. BOOKING ITEMS
CREATE TABLE IF NOT EXISTS public.booking_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES public.inventory(id),
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT
);

-- 9. INVENTORY TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('in', 'out', 'adjustment')),
  quantity INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. WORKERS
CREATE TABLE IF NOT EXISTS public.workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  specialty TEXT NOT NULL,
  daily_rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Assigned', 'Off Duty')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. WORKER ASSIGNMENTS
CREATE TABLE IF NOT EXISTS public.worker_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  shift TEXT NOT NULL DEFAULT 'Full Day',
  role_notes TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'In Progress', 'Completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('Advance', 'Partial', 'Final')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL,
  reference_no TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  vendor TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('customer', 'admin')),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. REVIEWS
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HELPER FUNCTION FOR RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- POLICIES: PROFILES & CUSTOMERS
CREATE POLICY "Users read own profile or admin reads all" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "Customers read own record or admin reads all" ON public.customers
  FOR SELECT USING (profile_id = auth.uid() OR public.is_admin());
CREATE POLICY "Customers update own addresses" ON public.customers
  FOR UPDATE USING (profile_id = auth.uid() OR public.is_admin());

-- POLICIES: PUBLIC SERVICES & PACKAGES & REVIEWS
CREATE POLICY "Anyone can view active services" ON public.services
  FOR SELECT USING (is_active = TRUE OR public.is_admin());
CREATE POLICY "Admin manages services" ON public.services
  FOR ALL USING (public.is_admin());

CREATE POLICY "Anyone can view packages" ON public.service_packages
  FOR SELECT USING (TRUE);
CREATE POLICY "Admin manages packages" ON public.service_packages
  FOR ALL USING (public.is_admin());

CREATE POLICY "Anyone can read reviews" ON public.reviews
  FOR SELECT USING (TRUE);
CREATE POLICY "Customers create review for own booking" ON public.reviews
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.profile_id = auth.uid())
  );

-- POLICIES: BOOKINGS, QUOTATIONS, PAYMENTS
CREATE POLICY "Customer sees own bookings or admin sees all" ON public.bookings
  FOR SELECT USING (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.profile_id = auth.uid())
  );
CREATE POLICY "Customer creates own booking" ON public.bookings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.profile_id = auth.uid())
  );
CREATE POLICY "Admin manages all bookings" ON public.bookings
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Customer sees own quotations or admin all" ON public.quotations
  FOR SELECT USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.customers c ON c.id = b.customer_id
      WHERE b.id = booking_id AND c.profile_id = auth.uid()
    )
  );
CREATE POLICY "Customer responds to own quotation" ON public.quotations
  FOR UPDATE USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.customers c ON c.id = b.customer_id
      WHERE b.id = booking_id AND c.profile_id = auth.uid()
    )
  );
CREATE POLICY "Admin creates quotations" ON public.quotations
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Customer sees own payments or admin all" ON public.payments
  FOR SELECT USING (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.profile_id = auth.uid())
  );
CREATE POLICY "Admin manages payments" ON public.payments
  FOR ALL USING (public.is_admin());

-- ADMIN-ONLY BUSINESS TABLES
CREATE POLICY "Admin manages inventory" ON public.inventory FOR ALL USING (public.is_admin());
CREATE POLICY "Admin manages inventory tx" ON public.inventory_transactions FOR ALL USING (public.is_admin());
CREATE POLICY "Admin manages booking items" ON public.booking_items FOR ALL USING (public.is_admin());
CREATE POLICY "Admin manages workers" ON public.workers FOR ALL USING (public.is_admin());
CREATE POLICY "Admin manages worker assignments" ON public.worker_assignments FOR ALL USING (public.is_admin());
CREATE POLICY "Admin manages expenses" ON public.expenses FOR ALL USING (public.is_admin());

-- NOTIFICATIONS
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT USING (
    recipient_profile_id = auth.uid() OR (recipient_role = 'admin' AND public.is_admin())
  );
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (
    recipient_profile_id = auth.uid() OR (recipient_role = 'admin' AND public.is_admin())
  );

-- ENABLE REALTIME REPLICATION
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quotations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;

-- STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public) VALUES ('event-media', 'event-media', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users upload event media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'event-media');
CREATE POLICY "Public read event media" ON storage.objects
  FOR SELECT USING (bucket_id = 'event-media');
