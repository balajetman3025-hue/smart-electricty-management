import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'luminacraft.sqlite');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function uid(): string {
  return crypto.randomUUID();
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      company_name TEXT,
      saved_addresses TEXT NOT NULL DEFAULT '[]',
      private_notes TEXT,
      total_spent REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      starting_price REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS service_packages (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      duration_hours INTEGER NOT NULL DEFAULT 8,
      highlights TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      booking_code TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL REFERENCES services(id),
      package_id TEXT REFERENCES service_packages(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      mobile_number TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_location TEXT NOT NULL,
      venue_size TEXT NOT NULL,
      estimated_budget REAL NOT NULL DEFAULT 0,
      lighting_requirements TEXT NOT NULL,
      additional_instructions TEXT,
      reference_images TEXT NOT NULL DEFAULT '[]',
      completed_photos TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN (
        'Pending', 'Request Received', 'Site Visit Required', 'Quotation Sent',
        'Approved', 'Work in Progress', 'Completed', 'Cancelled'
      )),
      site_visit_date TEXT,
      internal_notes TEXT,
      estimated_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      quotation_number TEXT NOT NULL UNIQUE,
      line_items TEXT NOT NULL DEFAULT '[]',
      subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      advance_required REAL NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'Sent' CHECK (status IN ('Sent', 'Accepted', 'Rejected', 'Revised')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      responded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN (
        'LED lights', 'Serial lights', 'Rice lights', 'RGB strips', 'LED bulbs',
        'Wires and cables', 'Extension boards', 'Controllers',
        'Decorative lighting', 'Other electrical equipment'
      )),
      quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
      unit TEXT NOT NULL DEFAULT 'pcs',
      purchase_price REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      min_stock_alert INTEGER NOT NULL DEFAULT 10,
      supplier_name TEXT NOT NULL DEFAULT '',
      supplier_contact TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS booking_items (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      inventory_id TEXT NOT NULL REFERENCES inventory(id),
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY,
      inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
      booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('in', 'out', 'adjustment')),
      quantity INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      specialty TEXT NOT NULL,
      daily_rate REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Assigned', 'Off Duty')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS worker_assignments (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      scheduled_date TEXT NOT NULL,
      shift TEXT NOT NULL DEFAULT 'Full Day',
      role_notes TEXT,
      status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'In Progress', 'Completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      payment_type TEXT NOT NULL CHECK (payment_type IN ('Advance', 'Partial', 'Final')),
      amount REAL NOT NULL CHECK (amount > 0),
      payment_method TEXT NOT NULL,
      reference_no TEXT,
      payment_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      expense_date TEXT NOT NULL,
      booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
      vendor TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      recipient_role TEXT NOT NULL CHECK (recipient_role IN ('customer', 'admin')),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      service_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function seedDatabase() {
  const existingProfiles = db.prepare('SELECT COUNT(*) as count FROM profiles').get() as { count: number };
  if (existingProfiles.count > 0) return;

  // 1. Profiles (1 Admin + 4 Customers)
  const adminProfileId = uid();
  const c1ProfileId = uid();
  const c2ProfileId = uid();
  const c3ProfileId = uid();
  const c4ProfileId = uid();

  const insertProfile = db.prepare(
    `INSERT INTO profiles (id, email, password_hash, full_name, phone, role) VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertProfile.run(adminProfileId, 'owner@luminacraft.in', hashPassword('admin123'), 'Rajesh Verma', '+91 98204 51100', 'admin');
  insertProfile.run(c1ProfileId, 'ananya.sharma@example.com', hashPassword('customer123'), 'Ananya Sharma', '+91 98112 34091', 'customer');
  insertProfile.run(c2ProfileId, 'vikram.mehta@example.com', hashPassword('customer123'), 'Vikram Mehta', '+91 99201 77420', 'customer');
  insertProfile.run(c3ProfileId, 'priya.nair@example.com', hashPassword('customer123'), 'Priya Nair', '+91 97654 11890', 'customer');
  insertProfile.run(c4ProfileId, 'arjun.kapoor@example.com', hashPassword('customer123'), 'Arjun Kapoor', '+91 98330 62144', 'customer');

  const c1Id = uid();
  const c2Id = uid();
  const c3Id = uid();
  const c4Id = uid();

  const insertCustomer = db.prepare(
    `INSERT INTO customers (id, profile_id, company_name, saved_addresses, private_notes, total_spent) VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertCustomer.run(
    c1Id,
    c1ProfileId,
    'Sharma Residences',
    JSON.stringify([
      { id: uid(), label: 'Villa Residence', addressLine: '14 Lotus Enclave, Koregaon Park', city: 'Pune', pincode: '411001', isDefault: true },
      { id: uid(), label: 'Farmhouse Lawn', addressLine: 'Plot 8, Mulshi Valley Road', city: 'Pune', pincode: '412108', isDefault: false },
    ]),
    'Prefers 2700K warm-white LEDs over cool white. High-value repeat client.',
    84500
  );
  insertCustomer.run(
    c2Id,
    c2ProfileId,
    'Mehta Heritage Events',
    JSON.stringify([
      { id: uid(), label: 'Banquet Grounds', addressLine: '88 Residency Road, Civil Lines', city: 'Jaipur', pincode: '302006', isDefault: true },
    ]),
    'Requires 3-phase generator backup check before every wedding installation.',
    142000
  );
  insertCustomer.run(
    c3Id,
    c3ProfileId,
    null,
    JSON.stringify([
      { id: uid(), label: 'Home', addressLine: '402 Banyan Crest, Indiranagar', city: 'Bengaluru', pincode: '560038', isDefault: true },
    ]),
    'Prompt payer via UPI.',
    38000
  );
  insertCustomer.run(
    c4Id,
    c4ProfileId,
    'Kapoor Jewels Flagship',
    JSON.stringify([
      { id: uid(), label: 'Showroom', addressLine: '19 MG Boulevard, Camp', city: 'Pune', pincode: '411001', isDefault: true },
    ]),
    'Commercial facade & Diwali storefront client.',
    65000
  );

  // 2. All 9 Required Services + Packages
  const servicesData = [
    {
      id: uid(),
      name: 'Diwali Lighting Decoration',
      slug: 'diwali-lighting-decoration',
      category: 'Festive',
      description: 'Full facade curtain serials, warm 2700K rice-light drapes, terrace festoons, and weather-sealed timer distribution boards for homes and villas.',
      image_url: '/src/assets/images/service_diwali_decor_1794573599562.jpg',
      starting_price: 12500,
      featured: 1,
      packages: [
        { name: 'Apartment Glow', description: 'Balcony curtains, entrance warm strips, and automatic dusk timer.', price: 12500, duration_hours: 6, highlights: ['400m Warm Rice LEDs', 'IP65 Weatherproof Connections', '7-Day Rental Included'] },
        { name: 'Royal Villa Facade', description: 'Full multi-story elevation waterfall curtains, tree wraps, and driveway uplighting.', price: 32000, duration_hours: 12, highlights: ['1,400m Golden Serial Curtain', '12 Architectural Uplights', 'Dedicated MCB Safety Box'] },
      ],
    },
    {
      id: uid(),
      name: 'Wedding Lighting',
      slug: 'wedding-lighting',
      category: 'Weddings',
      description: 'Starlight micro-LED mandap canopies, crystal chandelier rigging, warm pin-spots for dining tables, and silent generator distribution.',
      image_url: '/src/assets/images/service_wedding_mandap_1794573599361.jpg',
      starting_price: 45000,
      featured: 1,
      packages: [
        { name: 'Intimate Courtyard', description: 'Overhead fairy canopy and pathway lanterns for up to 200 guests.', price: 45000, duration_hours: 18, highlights: ['Overhead Canopy Rigging', '16 Brass Pathway Lanterns', 'On-Site Standby Electrician'] },
        { name: 'Grand Palace Reception', description: 'Full estate lighting, 6 crystal chandeliers, mandap pin-spotting, and 3-phase load balancing.', price: 115000, duration_hours: 36, highlights: ['6 Chandeliers & Rigging', '3,000m Micro-LED Canopy', '24x7 Standby Crew'] },
      ],
    },
    {
      id: uid(),
      name: 'Birthday Party Lighting',
      slug: 'birthday-party-lighting',
      category: 'Private Events',
      description: 'Warm ambient festoon strings, programmable RGBW backdrop washes, neon focal accents, and safe outdoor extension distribution.',
      image_url: '/src/assets/images/hero_event_lighting_1794573598488.jpg',
      starting_price: 9500,
      featured: 0,
      packages: [
        { name: 'Terrace Soiree', description: 'Warm festoon grid + 6 RGBW backdrop par cans.', price: 9500, duration_hours: 6, highlights: ['60m Bistro Festoon Bulbs', '6 RGBW Wash Lights', 'Quick 2-Hour Setup'] },
        { name: 'Milestone Celebration', description: 'Full lawn string canopy, photo-booth ring lighting, and dance floor washes.', price: 22000, duration_hours: 10, highlights: ['Full Canopy + Dance Floor', 'DMX Color Controller', 'Technician On-Site'] },
      ],
    },
    {
      id: uid(),
      name: 'Festival Decoration',
      slug: 'festival-decoration',
      category: 'Festive',
      description: 'Ganeshotsav, Navratri, Eid, and Christmas large-scale community pandal illumination, archways, and high-efficiency LED flood arrays.',
      image_url: '/src/assets/images/service_diwali_decor_1794573599562.jpg',
      starting_price: 18000,
      featured: 0,
      packages: [
        { name: 'Society Gate & Courtyard', description: 'Welcome arch lights, temple mandap accents, and pathway bollards.', price: 18000, duration_hours: 12, highlights: ['Archway RGB Pixel Strips', '10-Day Festival Package', 'RCCB Earth-Leakage Protection'] },
        { name: 'Community Pandal', description: 'Complete pandal overhead chandeliers, floodlights, and multi-circuit distro panel.', price: 54000, duration_hours: 24, highlights: ['100A Distribution Panel', 'Emergency Exit Lighting', 'Daily Maintenance Check'] },
      ],
    },
    {
      id: uid(),
      name: 'Stage and DJ Lighting',
      slug: 'stage-and-dj-lighting',
      category: 'Production',
      description: 'Aluminum box trussing, DMX moving-head beam fixtures, warm tungsten front-wash, strobe blinder bars, and live DMX console operation.',
      image_url: '/src/assets/images/service_stage_dj_1794573600790.jpg',
      starting_price: 35000,
      featured: 1,
      packages: [
        { name: 'Sangeet Truss Rig', description: '24ft truss goal-post with 8 moving-head beams and 12 LED par washes.', price: 35000, duration_hours: 10, highlights: ['8x 230W Beam Moving Heads', 'DMX Lighting Operator', 'Haze Machine Included'] },
        { name: 'Concert Arena Stage', description: 'Full box-truss roof rig, 16 moving heads, warm blinders, and dual DMX universes.', price: 85000, duration_hours: 16, highlights: ['16 Moving Heads + Blinders', '40ft Box Truss', '3-Phase Power Distro'] },
      ],
    },
    {
      id: uid(),
      name: 'Outdoor and Garden Lighting',
      slug: 'outdoor-and-garden-lighting',
      category: 'Landscape',
      description: 'Precision tree-trunk micro-LED wraps, waterproof IP67 pathway bollards, pergola bistro festoons, and low-voltage garden uplights.',
      image_url: '/src/assets/images/service_garden_outdoor_1794573601741.jpg',
      starting_price: 14500,
      featured: 1,
      packages: [
        { name: 'Patio & Lawn Glow', description: '4 mature tree wraps plus 50m pergola festoon bulbs.', price: 14500, duration_hours: 8, highlights: ['4 Full Tree Wraps', 'Waterproof IP67 Cabling', 'Warm 2700K Tone'] },
        { name: 'Estate Landscape Package', description: '12 tree wraps, 20 brass bollard uplights, and water-feature accent illumination.', price: 38000, duration_hours: 14, highlights: ['12 Tree Wraps + 20 Bollards', 'Zero-Glare Shielded Optics', 'Automated Dusk Sensor'] },
      ],
    },
    {
      id: uid(),
      name: 'House Lighting Decoration',
      slug: 'house-lighting-decoration',
      category: 'Residential',
      description: 'Clean architectural roofline outlines, balcony railings, staircase cove strips, and entrance foyer chandelier temporary or permanent setups.',
      image_url: '/src/assets/images/service_diwali_decor_1794573599562.jpg',
      starting_price: 11000,
      featured: 0,
      packages: [
        { name: 'Bungalow Outline', description: 'Roofline, pillar drops, and main gate pillar lanterns.', price: 11000, duration_hours: 6, highlights: ['Clean Concealed Routing', 'Zero Wall Damage Clips', 'Timer Automation'] },
      ],
    },
    {
      id: uid(),
      name: 'Commercial Lighting',
      slug: 'commercial-lighting',
      category: 'Commercial',
      description: 'Showroom facade illumination, corporate gala lighting, retail seasonal window displays, and high-CRI accent track systems.',
      image_url: '/src/assets/images/service_stage_dj_1794573600790.jpg',
      starting_price: 28000,
      featured: 0,
      packages: [
        { name: 'Showroom Facade Launch', description: 'High-lumen facade architectural washers and illuminated entrance canopy.', price: 28000, duration_hours: 10, highlights: ['High-CRI 95+ Fixtures', 'Overnight Installation', 'GST Invoicing'] },
      ],
    },
    {
      id: uid(),
      name: 'Custom Electrical Work',
      slug: 'custom-electrical-work',
      category: 'Engineering',
      description: 'Event power distribution boards, 3-phase load balancing, earthing & RCCB safety audits, armored cabling, and bespoke chandelier wiring.',
      image_url: '/src/assets/images/service_garden_outdoor_1794573601741.jpg',
      starting_price: 6500,
      featured: 0,
      packages: [
        { name: 'Event Power Safety & Distro', description: '63A 3-phase distribution panel, earthing verification, and certified load testing.', price: 6500, duration_hours: 8, highlights: ['RCCB Trip Protection', 'Licensed Wireman Supervision', 'Load Balance Report'] },
      ],
    },
  ];

  const insertService = db.prepare(
    `INSERT INTO services (id, name, slug, category, description, image_url, starting_price, is_active, featured) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  );
  const insertPkg = db.prepare(
    `INSERT INTO service_packages (id, service_id, name, description, price, duration_hours, highlights) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const serviceIds: Record<string, string> = {};
  const pkgIds: Record<string, string> = {};

  for (const s of servicesData) {
    insertService.run(s.id, s.name, s.slug, s.category, s.description, s.image_url, s.starting_price, s.featured);
    serviceIds[s.slug] = s.id;
    s.packages.forEach((p, idx) => {
      const pid = uid();
      insertPkg.run(pid, s.id, p.name, p.description, p.price, p.duration_hours, JSON.stringify(p.highlights));
      if (idx === 0) pkgIds[s.slug] = pid;
    });
  }

  // 3. Inventory (10 realistic items across categories, 2 low stock for real alerts)
  const inventoryData = [
    { id: uid(), product_name: 'Warm White 2700K Rice Light Reel (50m)', category: 'Rice lights', quantity_available: 64, unit: 'reels', purchase_price: 420, selling_price: 750, min_stock_alert: 15, supplier_name: 'Bajaj Festive Electricals', supplier_contact: '+91 98201 44120' },
    { id: uid(), product_name: 'Golden Curtain Serial LED (3m x 3m)', category: 'Serial lights', quantity_available: 38, unit: 'sets', purchase_price: 680, selling_price: 1200, min_stock_alert: 12, supplier_name: 'Surya Illuminations Pune', supplier_contact: '+91 98220 91234' },
    { id: uid(), product_name: 'IP65 Addressable RGBW Strip (10m)', category: 'RGB strips', quantity_available: 9, unit: 'rolls', purchase_price: 1100, selling_price: 1950, min_stock_alert: 12, supplier_name: 'Syska Pro Lighting', supplier_contact: '+91 99110 88761' },
    { id: uid(), product_name: '230W Moving Head DMX Beam Fixture', category: 'LED lights', quantity_available: 16, unit: 'units', purchase_price: 14500, selling_price: 2500, min_stock_alert: 6, supplier_name: 'ProStage AudioVisual Mumbai', supplier_contact: '+91 98214 33490' },
    { id: uid(), product_name: '15W Warm Filament Festoon LED Bulbs', category: 'LED bulbs', quantity_available: 185, unit: 'pcs', purchase_price: 85, selling_price: 160, min_stock_alert: 40, supplier_name: 'Philips Commercial Distributors', supplier_contact: '+91 98114 55091' },
    { id: uid(), product_name: '4 sq.mm Twin-Core FR Copper Cable (90m)', category: 'Wires and cables', quantity_available: 7, unit: 'coils', purchase_price: 3800, selling_price: 4900, min_stock_alert: 10, supplier_name: 'Polycab Authorized Depot', supplier_contact: '+91 97640 22310' },
    { id: uid(), product_name: '16A Heavy-Duty 6-Socket Spike Extension', category: 'Extension boards', quantity_available: 28, unit: 'units', purchase_price: 740, selling_price: 1250, min_stock_alert: 10, supplier_name: 'Anchor Electricals Hub', supplier_contact: '+91 98208 66109' },
    { id: uid(), product_name: 'DMX-512 24-Channel Wireless Controller', category: 'Controllers', quantity_available: 5, unit: 'units', purchase_price: 6200, selling_price: 1800, min_stock_alert: 3, supplier_name: 'ProStage AudioVisual Mumbai', supplier_contact: '+91 98214 33490' },
    { id: uid(), product_name: 'Crystal Tiered Event Chandelier (Warm LED)', category: 'Decorative lighting', quantity_available: 8, unit: 'units', purchase_price: 18500, selling_price: 4500, min_stock_alert: 3, supplier_name: 'Jaipur Glass & Brass Works', supplier_contact: '+91 98290 12904' },
    { id: uid(), product_name: '63A 3-Phase Distribution Panel w/ RCCB', category: 'Other electrical equipment', quantity_available: 6, unit: 'panels', purchase_price: 12000, selling_price: 3500, min_stock_alert: 2, supplier_name: 'Havells Industrial Supply', supplier_contact: '+91 98101 74502' },
  ];

  const insertInv = db.prepare(
    `INSERT INTO inventory (id, product_name, category, quantity_available, unit, purchase_price, selling_price, min_stock_alert, supplier_name, supplier_contact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const item of inventoryData) {
    insertInv.run(
      item.id,
      item.product_name,
      item.category,
      item.quantity_available,
      item.unit,
      item.purchase_price,
      item.selling_price,
      item.min_stock_alert,
      item.supplier_name,
      item.supplier_contact
    );
  }

  // 4. Workers
  const workersData = [
    { id: uid(), full_name: 'Suresh Deshmukh', phone: '+91 98231 44012', specialty: 'Master Electrician & 3-Phase Distro', daily_rate: 1600, status: 'Assigned' },
    { id: uid(), full_name: 'Ramesh Yadav', phone: '+91 97622 89103', specialty: 'Truss Rigging & Chandeliers', daily_rate: 1400, status: 'Assigned' },
    { id: uid(), full_name: 'Imran Shaikh', phone: '+91 98904 11289', specialty: 'DMX Stage & DJ Console Operator', daily_rate: 1800, status: 'Available' },
    { id: uid(), full_name: 'Karan Patil', phone: '+91 99210 67543', specialty: 'Facade Curtain & Rice LED Installation', daily_rate: 1100, status: 'Available' },
    { id: uid(), full_name: 'Deepak Kulkarni', phone: '+91 98501 30982', specialty: 'Outdoor Landscape & IP67 Cabling', daily_rate: 1250, status: 'Available' },
  ];
  const insertWorker = db.prepare(
    `INSERT INTO workers (id, full_name, phone, specialty, daily_rate, status) VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const w of workersData) {
    insertWorker.run(w.id, w.full_name, w.phone, w.specialty, w.daily_rate, w.status);
  }

  // 5. Bookings, Quotations, Payments, Expenses, Reviews across recent months (so charts reflect real persisted SQL rows)
  const insertBooking = db.prepare(`
    INSERT INTO bookings (
      id, booking_code, customer_id, service_id, package_id, customer_name, mobile_number,
      event_type, event_date, event_location, venue_size, estimated_budget,
      lighting_requirements, additional_instructions, reference_images, completed_photos,
      status, site_visit_date, internal_notes, estimated_cost, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertQuotation = db.prepare(`
    INSERT INTO quotations (
      id, booking_id, quotation_number, line_items, subtotal, tax_amount, discount_amount,
      total_amount, advance_required, valid_until, notes, status, created_at, responded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPayment = db.prepare(`
    INSERT INTO payments (
      id, booking_id, customer_id, payment_type, amount, payment_method, reference_no, payment_date, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const b1 = uid(); // Completed wedding (June)
  const b2 = uid(); // Completed garden (July)
  const b3 = uid(); // Completed stage (August)
  const b4 = uid(); // Completed commercial (September)
  const b5 = uid(); // Work in Progress for Ananya Sharma (November)
  const b6 = uid(); // Quotation Sent for Ananya Sharma (November - ready to Accept/Reject!)
  const b7 = uid(); // Pending request for Vikram Mehta (Today)

  const today = new Date().toISOString().slice(0, 10);

  insertBooking.run(
    b1, 'LC-2026-1011', c2Id, serviceIds['wedding-lighting'], pkgIds['wedding-lighting'],
    'Vikram Mehta', '+91 99201 77420', 'Wedding Reception', '2026-06-18',
    '88 Residency Road, Civil Lines, Jaipur', '18,000 sq.ft Lawn', 145000,
    'Starlight micro-LED canopy, 6 crystal chandeliers, 3-phase generator distro.',
    'Coordinate with floral vendor by 2 PM.',
    JSON.stringify(['/src/assets/images/service_wedding_mandap_1794573599361.jpg']),
    JSON.stringify(['/src/assets/images/service_wedding_mandap_1794573599361.jpg', '/src/assets/images/hero_event_lighting_1794573598488.jpg']),
    'Completed', '2026-06-05', 'Executed smoothly with 4-person crew.', 142000,
    '2026-06-02T10:15:00Z', '2026-06-19T09:00:00Z'
  );
  insertQuotation.run(
    uid(), b1, 'QT-2026-011',
    JSON.stringify([
      { id: uid(), description: '3,000m Warm Micro-LED Canopy Rigging', quantity: 1, unit_price: 68000, total: 68000 },
      { id: uid(), description: 'Crystal Chandelier Rental & Suspension', quantity: 6, unit_price: 8500, total: 51000 },
      { id: uid(), description: '63A 3-Phase Distribution & Standby Crew', quantity: 1, unit_price: 23000, total: 23000 },
    ]),
    142000, 0, 0, 142000, 50000, '2026-06-10', 'Includes standby electrician for 12 hours.', 'Accepted',
    '2026-06-04T11:00:00Z', '2026-06-05T14:20:00Z'
  );
  insertPayment.run(uid(), b1, c2Id, 'Advance', 50000, 'NEFT', 'HDFC26060511', '2026-06-05', 'Booking confirmation advance', '2026-06-05T14:30:00Z');
  insertPayment.run(uid(), b1, c2Id, 'Final', 92000, 'Bank Transfer', 'HDFC26061988', '2026-06-19', 'Final settlement post-event', '2026-06-19T12:00:00Z');

  insertBooking.run(
    b2, 'LC-2026-1024', c3Id, serviceIds['outdoor-and-garden-lighting'], pkgIds['outdoor-and-garden-lighting'],
    'Priya Nair', '+91 97654 11890', 'Anniversary Dinner', '2026-07-22',
    '402 Banyan Crest, Indiranagar, Bengaluru', '4,500 sq.ft Garden', 40000,
    'Tree wraps, warm pathway bollards, pergola bistro lights.',
    'Low-glare warm 2700K only.',
    JSON.stringify(['/src/assets/images/service_garden_outdoor_1794573601741.jpg']),
    JSON.stringify(['/src/assets/images/service_garden_outdoor_1794573601741.jpg']),
    'Completed', '2026-07-12', 'Client loved brass bollards.', 38000,
    '2026-07-10T09:00:00Z', '2026-07-23T10:00:00Z'
  );
  insertQuotation.run(
    uid(), b2, 'QT-2026-024',
    JSON.stringify([
      { id: uid(), description: 'Estate Landscape Lighting Package', quantity: 1, unit_price: 38000, total: 38000 },
    ]),
    38000, 0, 0, 38000, 15000, '2026-07-18', 'Weatherproof IP67 setup.', 'Accepted',
    '2026-07-11T16:00:00Z', '2026-07-12T10:00:00Z'
  );
  insertPayment.run(uid(), b2, c3Id, 'Advance', 15000, 'UPI', 'UPI77419022', '2026-07-12', 'Advance received', '2026-07-12T10:15:00Z');
  insertPayment.run(uid(), b2, c3Id, 'Final', 23000, 'UPI', 'UPI77498810', '2026-07-23', 'Final settlement', '2026-07-23T11:00:00Z');

  insertBooking.run(
    b3, 'LC-2026-1035', c1Id, serviceIds['stage-and-dj-lighting'], pkgIds['stage-and-dj-lighting'],
    'Ananya Sharma', '+91 98112 34091', 'Sangeet Night', '2026-08-29',
    'Plot 8, Mulshi Valley Road, Pune', '9,000 sq.ft Courtyard', 60000,
    'Goal-post truss with golden moving-head beams and warm stage wash.',
    'Sync DMX cues with DJ console.',
    JSON.stringify(['/src/assets/images/service_stage_dj_1794573600790.jpg']),
    JSON.stringify(['/src/assets/images/service_stage_dj_1794573600790.jpg']),
    'Completed', '2026-08-18', 'Completed with Imran operating DMX.', 52500,
    '2026-08-14T13:00:00Z', '2026-08-30T11:00:00Z'
  );
  insertQuotation.run(
    uid(), b3, 'QT-2026-035',
    JSON.stringify([
      { id: uid(), description: 'Sangeet Truss Rig + 10 Moving Head Beams', quantity: 1, unit_price: 42000, total: 42000 },
      { id: uid(), description: 'Live DMX Operator & Haze Unit', quantity: 1, unit_price: 10500, total: 10500 },
    ]),
    52500, 0, 0, 52500, 20000, '2026-08-24', 'Full 10-hour event coverage.', 'Accepted',
    '2026-08-16T15:00:00Z', '2026-08-17T09:30:00Z'
  );
  insertPayment.run(uid(), b3, c1Id, 'Advance', 20000, 'UPI', 'UPI88901234', '2026-08-17', 'Advance paid', '2026-08-17T10:00:00Z');
  insertPayment.run(uid(), b3, c1Id, 'Final', 32500, 'Card', 'CARD88909912', '2026-08-30', 'Balance cleared', '2026-08-30T14:00:00Z');

  insertBooking.run(
    b4, 'LC-2026-1041', c4Id, serviceIds['commercial-lighting'], pkgIds['commercial-lighting'],
    'Arjun Kapoor', '+91 98330 62144', 'Showroom Launch', '2026-09-19',
    '19 MG Boulevard, Camp, Pune', '6,000 sq.ft Storefront', 70000,
    'High-CRI facade uplighting and entrance chandelier.',
    'Must finish rigging before 7 PM opening.',
    JSON.stringify(['/src/assets/images/service_diwali_decor_1794573599562.jpg']),
    JSON.stringify(['/src/assets/images/hero_event_lighting_1794573598488.jpg']),
    'Completed', '2026-09-10', 'Commercial flagship launch.', 65000,
    '2026-09-08T11:20:00Z', '2026-09-20T10:00:00Z'
  );
  insertQuotation.run(
    uid(), b4, 'QT-2026-041',
    JSON.stringify([
      { id: uid(), description: 'Architectural Facade High-CRI Washers', quantity: 14, unit_price: 3500, total: 49000 },
      { id: uid(), description: 'Overnight Installation & Cabling', quantity: 1, unit_price: 16000, total: 16000 },
    ]),
    65000, 0, 0, 65000, 25000, '2026-09-15', 'GST invoice issued.', 'Accepted',
    '2026-09-09T12:00:00Z', '2026-09-10T11:00:00Z'
  );
  insertPayment.run(uid(), b4, c4Id, 'Advance', 25000, 'NEFT', 'ICICI901122', '2026-09-10', 'Initial advance', '2026-09-10T12:00:00Z');
  insertPayment.run(uid(), b4, c4Id, 'Final', 40000, 'NEFT', 'ICICI909988', '2026-09-20', 'Final payment', '2026-09-20T16:00:00Z');

  // Active Booking 5 (Work in Progress for Ananya Sharma, partial payment done, balance due)
  insertBooking.run(
    b5, 'LC-2026-1048', c1Id, serviceIds['diwali-lighting-decoration'], pkgIds['diwali-lighting-decoration'],
    'Ananya Sharma', '+91 98112 34091', 'Diwali Celebration', '2026-11-16',
    '14 Lotus Enclave, Koregaon Park, Pune', '5,200 sq.ft Villa Facade', 38000,
    'Full vertical golden curtain lights on north facade + 12 garden uplights + terrace festoon.',
    'Please ensure automated evening timer at 6:15 PM.',
    JSON.stringify(['/src/assets/images/service_diwali_decor_1794573599562.jpg']),
    JSON.stringify([]),
    'Work in Progress', '2026-11-08', 'Rigging team scheduled for morning shift.', 34500,
    '2026-11-05T10:30:00Z', '2026-11-12T15:00:00Z'
  );
  insertQuotation.run(
    uid(), b5, 'QT-2026-048',
    JSON.stringify([
      { id: uid(), description: 'Royal Villa Golden Curtain Serial Setup', quantity: 1, unit_price: 24000, total: 24000 },
      { id: uid(), description: 'Terrace Festoon Bulbs & 12 Uplights', quantity: 1, unit_price: 8500, total: 8500 },
      { id: uid(), description: 'IP65 Timer Distribution Box', quantity: 1, unit_price: 2000, total: 2000 },
    ]),
    34500, 0, 0, 34500, 15000, '2026-11-14', 'Includes 7-day rental & post-Diwali dismantling.', 'Accepted',
    '2026-11-07T14:00:00Z', '2026-11-08T09:45:00Z'
  );
  insertPayment.run(uid(), b5, c1Id, 'Advance', 15000, 'UPI', 'UPI20261108', '2026-11-08', 'Advance received for Diwali villa setup', '2026-11-08T10:00:00Z');

  // Booking 6 (Quotation Sent for Ananya Sharma — Customer can Accept/Reject immediately!)
  insertBooking.run(
    b6, 'LC-2026-1052', c1Id, serviceIds['wedding-lighting'], pkgIds['wedding-lighting'],
    'Ananya Sharma', '+91 98112 34091', 'Family Engagement Party', '2026-12-05',
    'Plot 8, Mulshi Valley Road, Pune', '7,500 sq.ft Farmhouse Lawn', 55000,
    'Overhead warm fairy canopy over dining area and 12 pathway brass lanterns.',
    'Would love a crystal centerpiece chandelier above the stage.',
    JSON.stringify(['/src/assets/images/hero_event_lighting_1794573598488.jpg']),
    JSON.stringify([]),
    'Quotation Sent', '2026-11-18', 'Site surveyed; canopy poles required on west lawn.', 49500,
    '2026-11-10T11:00:00Z', '2026-11-12T17:30:00Z'
  );
  insertQuotation.run(
    uid(), b6, 'QT-2026-052',
    JSON.stringify([
      { id: uid(), description: 'Intimate Courtyard Fairy Canopy (1,800m LEDs)', quantity: 1, unit_price: 32000, total: 32000 },
      { id: uid(), description: 'Central Crystal Chandelier + Truss Pole Rig', quantity: 1, unit_price: 11500, total: 11500 },
      { id: uid(), description: '12 Brass Pathway Lanterns + Silent Distro', quantity: 1, unit_price: 6000, total: 6000 },
    ]),
    49500, 0, 0, 49500, 18000, '2026-11-25', 'Includes full setup, standby electrician, and next-day teardown.', 'Sent',
    '2026-11-12T17:30:00Z', null
  );

  // Booking 7 (Pending Today)
  insertBooking.run(
    b7, 'LC-2026-1056', c2Id, serviceIds['festival-decoration'], pkgIds['festival-decoration'],
    'Vikram Mehta', '+91 99201 77420', 'Cultural Gala Night', '2026-11-28',
    '88 Residency Road, Civil Lines, Jaipur', '12,000 sq.ft Courtyard', 60000,
    'Archway pixel lighting, warm tree wraps, and 100A event power distribution.',
    'Need site visit this weekend.',
    JSON.stringify(['/src/assets/images/service_garden_outdoor_1794573601741.jpg']),
    JSON.stringify([]),
    'Pending', null, null, 0,
    `${today}T08:15:00Z`, `${today}T08:15:00Z`
  );

  // Worker Assignments
  const insertAssign = db.prepare(`
    INSERT INTO worker_assignments (id, booking_id, worker_id, scheduled_date, shift, role_notes, status) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertAssign.run(uid(), b5, workersData[0].id, '2026-11-14', 'Morning (9 AM - 6 PM)', 'Install 63A weatherproof timer DB & earthing check', 'In Progress');
  insertAssign.run(uid(), b5, workersData[1].id, '2026-11-14', 'Morning (9 AM - 6 PM)', 'Facade golden curtain & terrace festoon rigging', 'Scheduled');

  // Booking Items (inventory allocated to b5)
  db.prepare(`INSERT INTO booking_items (id, booking_id, inventory_id, item_name, quantity, unit_price, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(uid(), b5, inventoryData[1].id, inventoryData[1].product_name, 14, 1200, 'North & East facade drops');

  // Expenses
  const insertExpense = db.prepare(`
    INSERT INTO expenses (id, category, description, amount, expense_date, booking_id, vendor) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertExpense.run(uid(), 'Crew Labor', 'On-site rigging & standby technicians (Jaipur Wedding)', 18500, '2026-06-18', b1, 'In-House & Contract Crew');
  insertExpense.run(uid(), 'Transport & Logistics', 'Truck transport for chandeliers & trusses', 6400, '2026-07-22', b2, 'Shree Logistics');
  insertExpense.run(uid(), 'Equipment Purchase', 'Replacement 2700K LED festoon bulbs (200 pcs)', 17000, '2026-08-20', null, 'Philips Commercial Distributors');
  insertExpense.run(uid(), 'Generator Fuel', 'Silent DG fuel & operator allowance', 8200, '2026-09-19', b4, 'PowerRent Services');
  insertExpense.run(uid(), 'Materials & Cables', 'IP65 waterproof connectors & cable ties', 4800, '2026-11-09', b5, 'Polycab Authorized Depot');

  // Reviews
  const insertReview = db.prepare(`
    INSERT INTO reviews (id, booking_id, customer_id, customer_name, service_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertReview.run(uid(), b1, c2Id, 'Vikram Mehta', 'Wedding Lighting', 5, 'LuminaCraft transformed our 18,000 sq.ft heritage lawn into a golden starlight canopy. Zero power flickers all night and immaculate cabling.', '2026-06-21T10:00:00Z');
  insertReview.run(uid(), b2, c3Id, 'Priya Nair', 'Outdoor and Garden Lighting', 5, 'Their 2700K brass bollards and tree wraps looked editorial. Clean installation with completely hidden wiring.', '2026-07-25T14:00:00Z');
  insertReview.run(uid(), b3, c1Id, 'Ananya Sharma', 'Stage and DJ Lighting', 5, 'Imran and the DMX team synchronized every sangeet performance cue seamlessly. Our guests are still talking about the stage beams.', '2026-09-01T11:30:00Z');

  // Notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, recipient_profile_id, recipient_role, type, title, message, related_booking_id, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertNotif.run(uid(), c1ProfileId, 'customer', 'quotation_received', 'New Quotation Ready: QT-2026-052', 'A customized quotation of ₹49,500 has been sent for booking LC-2026-1052. Review and accept to lock your event date.', b6, 0);
  insertNotif.run(uid(), c1ProfileId, 'customer', 'payment_reminder', 'Remaining Balance Reminder', 'Your Diwali lighting setup (LC-2026-1048) is in progress. Remaining balance of ₹19,500 is due upon completion.', b5, 0);
  insertNotif.run(uid(), adminProfileId, 'admin', 'new_booking', 'New Booking Request: LC-2026-1056', 'Vikram Mehta requested Festival Decoration for 2026-11-28 in Jaipur.', b7, 0);
  insertNotif.run(uid(), adminProfileId, 'admin', 'low_stock', 'Low Stock Alert: RGBW Strips & FR Cable', '2 inventory items (IP65 Addressable RGBW Strip, 4 sq.mm FR Copper Cable) are below minimum stock threshold.', null, 0);
}

initSchema();
seedDatabase();
