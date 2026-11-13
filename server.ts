import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword, uid, verifyPassword } from './server/db.ts';
import { requireAdmin, requireAuth, signToken, verifyToken, type AuthedRequest } from './server/auth.ts';

const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/src/assets', express.static(path.resolve(process.cwd(), 'src/assets')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

interface ClientMeta {
  ws: WebSocket;
  role?: 'customer' | 'admin';
  profileId?: string;
}

const wsClients = new Set<ClientMeta>();

wss.on('connection', (ws) => {
  const meta: ClientMeta = { ws };
  wsClients.add(meta);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'auth' && typeof msg.token === 'string') {
        const payload = verifyToken(msg.token);
        if (payload) {
          meta.role = payload.role;
          meta.profileId = payload.profileId;
          ws.send(JSON.stringify({ type: 'auth:ok', role: payload.role }));
        }
      }
    } catch {
      // ignore malformed ws frames
    }
  });

  ws.on('close', () => {
    wsClients.delete(meta);
  });
});

function broadcastEvent(
  event: string,
  payload: unknown,
  target?: { role?: 'customer' | 'admin'; profileId?: string }
) {
  const message = JSON.stringify({ type: event, payload, timestamp: new Date().toISOString() });
  for (const client of wsClients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (!target) {
      client.ws.send(message);
      continue;
    }
    if (target.role && client.role === target.role) {
      if (!target.profileId || client.profileId === target.profileId) {
        client.ws.send(message);
      }
    } else if (target.profileId && client.profileId === target.profileId) {
      client.ws.send(message);
    }
  }
}

function createNotification(params: {
  recipientProfileId: string | null;
  recipientRole: 'customer' | 'admin';
  type: string;
  title: string;
  message: string;
  relatedBookingId?: string | null;
}) {
  const id = uid();
  db.prepare(
    `INSERT INTO notifications (id, recipient_profile_id, recipient_role, type, title, message, related_booking_id, is_read)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(
    id,
    params.recipientProfileId,
    params.recipientRole,
    params.type,
    params.title,
    params.message,
    params.relatedBookingId ?? null
  );
  const created = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  broadcastEvent('notification:new', created, {
    role: params.recipientRole,
    profileId: params.recipientProfileId ?? undefined,
  });
}

function parseJsonField<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string') return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function hydrateBookings(rows: any[]) {
  return rows.map((b) => {
    const quotationRaw = db.prepare('SELECT * FROM quotations WHERE booking_id = ?').get(b.id) as any;
    const quotation = quotationRaw
      ? {
          ...quotationRaw,
          line_items: parseJsonField(quotationRaw.line_items, []),
        }
      : null;

    const payments = db
      .prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY payment_date DESC, created_at DESC')
      .all(b.id) as any[];

    const assigned_workers = db
      .prepare(
        `SELECT wa.*, w.full_name as worker_name, w.phone as worker_phone, w.specialty as worker_specialty
         FROM worker_assignments wa
         JOIN workers w ON w.id = wa.worker_id
         WHERE wa.booking_id = ?
         ORDER BY wa.scheduled_date ASC`
      )
      .all(b.id) as any[];

    const allocated_items = db
      .prepare('SELECT * FROM booking_items WHERE booking_id = ?')
      .all(b.id) as any[];

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalCost = quotation ? Number(quotation.total_amount) : Number(b.estimated_cost || 0);
    const remainingBalance = Math.max(0, totalCost - totalPaid);

    return {
      ...b,
      reference_images: parseJsonField<string[]>(b.reference_images, []),
      completed_photos: parseJsonField<string[]>(b.completed_photos, []),
      quotation,
      payments,
      assigned_workers,
      allocated_items,
      total_paid: totalPaid,
      remaining_balance: remainingBalance,
    };
  });
}

function checkLowStockAlert(inventoryId: string) {
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventoryId) as any;
  if (item && Number(item.quantity_available) <= Number(item.min_stock_alert)) {
    const admin = db.prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`).get() as any;
    createNotification({
      recipientProfileId: admin?.id ?? null,
      recipientRole: 'admin',
      type: 'low_stock',
      title: `Low Inventory: ${item.product_name}`,
      message: `Only ${item.quantity_available} ${item.unit} left (minimum threshold: ${item.min_stock_alert}). Supplier: ${item.supplier_name || 'N/A'}.`,
    });
  }
}

// ---------------- AUTH ROUTES ----------------
app.post('/api/auth/register', (req, res) => {
  const { email, password, full_name, phone, company_name } = req.body ?? {};
  if (!email || !password || !full_name || !phone) {
    res.status(400).json({ error: 'Full name, email, phone, and password are required.' });
    return;
  }
  if (String(password).length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM profiles WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const profileId = uid();
  const customerId = uid();
  db.prepare(
    `INSERT INTO profiles (id, email, password_hash, full_name, phone, role) VALUES (?, ?, ?, ?, ?, 'customer')`
  ).run(profileId, normalizedEmail, hashPassword(String(password)), String(full_name).trim(), String(phone).trim());

  db.prepare(
    `INSERT INTO customers (id, profile_id, company_name, saved_addresses, total_spent) VALUES (?, ?, ?, '[]', 0)`
  ).run(customerId, profileId, company_name ? String(company_name).trim() : null);

  const admin = db.prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`).get() as any;
  createNotification({
    recipientProfileId: admin?.id ?? null,
    recipientRole: 'admin',
    type: 'new_customer',
    title: 'New Customer Registered',
    message: `${String(full_name).trim()} (${normalizedEmail}) created a customer account.`,
  });

  broadcastEvent('customer:registered', { id: customerId, full_name, email: normalizedEmail }, { role: 'admin' });

  const token = signToken({
    profileId,
    customerId,
    email: normalizedEmail,
    fullName: String(full_name).trim(),
    role: 'customer',
  });

  const profile = db.prepare('SELECT id, email, full_name, phone, role, avatar_url, created_at FROM profiles WHERE id = ?').get(profileId);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;

  res.status(201).json({
    token,
    profile,
    customer: { ...customer, saved_addresses: [] },
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, expectedRole } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM profiles WHERE email = ?').get(normalizedEmail) as any;
  if (!user || !verifyPassword(String(password), user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  if (expectedRole && user.role !== expectedRole) {
    res.status(403).json({
      error:
        expectedRole === 'admin'
          ? 'This account does not have Shop Owner administrator access.'
          : 'Please sign in via the Shop Owner Admin portal.',
    });
    return;
  }

  let customer = db.prepare('SELECT * FROM customers WHERE profile_id = ?').get(user.id) as any;
  if (!customer && user.role === 'customer') {
    const cid = uid();
    db.prepare(`INSERT INTO customers (id, profile_id, saved_addresses) VALUES (?, ?, '[]')`).run(cid, user.id);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(cid);
  }

  const token = signToken({
    profileId: user.id,
    customerId: customer?.id ?? null,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
  });

  const { password_hash: _, ...safeProfile } = user;
  res.json({
    token,
    profile: safeProfile,
    customer: customer
      ? { ...customer, saved_addresses: parseJsonField(customer.saved_addresses, []) }
      : null,
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const user = db
    .prepare('SELECT id, email, full_name, phone, role, avatar_url, created_at FROM profiles WHERE id = ?')
    .get(req.auth!.profileId) as any;
  if (!user) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  const customer = db.prepare('SELECT * FROM customers WHERE profile_id = ?').get(user.id) as any;
  res.json({
    profile: user,
    customer: customer
      ? { ...customer, saved_addresses: parseJsonField(customer.saved_addresses, []) }
      : null,
  });
});

app.put('/api/auth/profile', requireAuth, (req: AuthedRequest, res) => {
  const { full_name, phone, company_name, saved_addresses } = req.body ?? {};
  if (!full_name || !phone) {
    res.status(400).json({ error: 'Full name and phone are required.' });
    return;
  }
  db.prepare(`UPDATE profiles SET full_name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`).run(
    String(full_name).trim(),
    String(phone).trim(),
    req.auth!.profileId
  );

  if (req.auth!.customerId) {
    db.prepare(`UPDATE customers SET company_name = ?, saved_addresses = ? WHERE id = ?`).run(
      company_name ? String(company_name).trim() : null,
      JSON.stringify(Array.isArray(saved_addresses) ? saved_addresses : []),
      req.auth!.customerId
    );
  }

  const profile = db
    .prepare('SELECT id, email, full_name, phone, role, avatar_url, created_at FROM profiles WHERE id = ?')
    .get(req.auth!.profileId);
  const customer = req.auth!.customerId
    ? (db.prepare('SELECT * FROM customers WHERE id = ?').get(req.auth!.customerId) as any)
    : null;

  res.json({
    profile,
    customer: customer
      ? { ...customer, saved_addresses: parseJsonField(customer.saved_addresses, []) }
      : null,
  });
});

// ---------------- FILE UPLOADS ----------------
app.post('/api/uploads', requireAuth, (req, res) => {
  const { filename, dataUrl } = req.body ?? {};
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    res.status(400).json({ error: 'Valid base64 image dataUrl is required.' });
    return;
  }
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: 'Malformed image payload.' });
    return;
  }
  const ext = match[1].replace('jpeg', 'jpg').replace('+xml', '');
  const buffer = Buffer.from(match[2], 'base64');
  const safeExt = ['jpg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const storedName = `${uid()}.${safeExt}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, storedName), buffer);
  res.status(201).json({ url: `/uploads/${storedName}`, originalName: filename || storedName });
});

// ---------------- SERVICES ----------------
app.get('/api/services', (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const services = db
    .prepare(
      includeInactive
        ? 'SELECT * FROM services ORDER BY featured DESC, created_at ASC'
        : 'SELECT * FROM services WHERE is_active = 1 ORDER BY featured DESC, created_at ASC'
    )
    .all() as any[];

  const hydrated = services.map((s) => {
    const pkgs = db
      .prepare('SELECT * FROM service_packages WHERE service_id = ? ORDER BY price ASC')
      .all(s.id) as any[];
    return {
      ...s,
      is_active: Boolean(s.is_active),
      featured: Boolean(s.featured),
      packages: pkgs.map((p) => ({
        ...p,
        highlights: parseJsonField<string[]>(p.highlights, []),
      })),
    };
  });
  res.json(hydrated);
});

app.post('/api/services', requireAdmin, (req, res) => {
  const { name, category, description, image_url, starting_price, is_active, featured, packages } = req.body ?? {};
  if (!name || !category || !description) {
    res.status(400).json({ error: 'Name, category, and description are required.' });
    return;
  }
  const id = uid();
  const slug = `${String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${id.slice(0, 4)}`;

  db.prepare(
    `INSERT INTO services (id, name, slug, category, description, image_url, starting_price, is_active, featured)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(name).trim(),
    slug,
    String(category).trim(),
    String(description).trim(),
    image_url || '/src/assets/images/hero_event_lighting_1794573598488.jpg',
    Number(starting_price || 0),
    is_active === false ? 0 : 1,
    featured ? 1 : 0
  );

  if (Array.isArray(packages)) {
    const insPkg = db.prepare(
      `INSERT INTO service_packages (id, service_id, name, description, price, duration_hours, highlights) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of packages) {
      if (!p.name) continue;
      insPkg.run(
        uid(),
        id,
        String(p.name),
        String(p.description || ''),
        Number(p.price || 0),
        Number(p.duration_hours || 8),
        JSON.stringify(Array.isArray(p.highlights) ? p.highlights : [])
      );
    }
  }

  broadcastEvent('service:updated', { id });
  res.status(201).json({ id, slug });
});

app.put('/api/services/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Service not found' });
    return;
  }
  const { name, category, description, image_url, starting_price, is_active, featured, packages } = req.body ?? {};

  db.prepare(
    `UPDATE services
     SET name = ?, category = ?, description = ?, image_url = ?, starting_price = ?, is_active = ?, featured = ?
     WHERE id = ?`
  ).run(
    name !== undefined ? String(name).trim() : existing.name,
    category !== undefined ? String(category).trim() : existing.category,
    description !== undefined ? String(description).trim() : existing.description,
    image_url !== undefined ? String(image_url) : existing.image_url,
    starting_price !== undefined ? Number(starting_price) : existing.starting_price,
    is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
    featured !== undefined ? (featured ? 1 : 0) : existing.featured,
    id
  );

  if (Array.isArray(packages)) {
    db.prepare('DELETE FROM service_packages WHERE service_id = ?').run(id);
    const insPkg = db.prepare(
      `INSERT INTO service_packages (id, service_id, name, description, price, duration_hours, highlights) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of packages) {
      if (!p.name) continue;
      insPkg.run(
        p.id && typeof p.id === 'string' && p.id.length > 8 ? p.id : uid(),
        id,
        String(p.name),
        String(p.description || ''),
        Number(p.price || 0),
        Number(p.duration_hours || 8),
        JSON.stringify(Array.isArray(p.highlights) ? p.highlights : [])
      );
    }
  }

  broadcastEvent('service:updated', { id });
  res.json({ ok: true });
});

app.delete('/api/services/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const refCount = db.prepare('SELECT COUNT(*) as c FROM bookings WHERE service_id = ?').get(id) as { c: number };
  if (refCount.c > 0) {
    db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(id);
    broadcastEvent('service:updated', { id });
    res.json({ disabled: true, message: 'Service has existing bookings and was disabled instead of deleted.' });
    return;
  }
  db.prepare('DELETE FROM services WHERE id = ?').run(id);
  broadcastEvent('service:updated', { id });
  res.json({ deleted: true });
});

// ---------------- BOOKINGS ----------------
app.get('/api/bookings', requireAuth, (req: AuthedRequest, res) => {
  let rows: any[];
  if (req.auth!.role === 'admin') {
    rows = db
      .prepare(
        `SELECT b.*, s.name as service_name, sp.name as package_name
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN service_packages sp ON sp.id = b.package_id
         ORDER BY b.created_at DESC`
      )
      .all();
  } else {
    rows = db
      .prepare(
        `SELECT b.*, s.name as service_name, sp.name as package_name
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN service_packages sp ON sp.id = b.package_id
         WHERE b.customer_id = ?
         ORDER BY b.created_at DESC`
      )
      .all(req.auth!.customerId);
  }
  res.json(hydrateBookings(rows));
});

app.post('/api/bookings', requireAuth, (req: AuthedRequest, res) => {
  const {
    customer_name,
    mobile_number,
    event_type,
    event_date,
    event_location,
    service_id,
    package_id,
    venue_size,
    estimated_budget,
    lighting_requirements,
    additional_instructions,
    reference_images,
  } = req.body ?? {};

  if (
    !customer_name ||
    !mobile_number ||
    !event_type ||
    !event_date ||
    !event_location ||
    !service_id ||
    !venue_size ||
    !lighting_requirements
  ) {
    res.status(400).json({ error: 'Please complete all required booking fields.' });
    return;
  }

  let customerId = req.auth!.customerId;
  if (!customerId && req.auth!.role === 'admin' && req.body.customer_id) {
    customerId = req.body.customer_id;
  }
  if (!customerId) {
    res.status(400).json({ error: 'Customer profile is required to submit a booking.' });
    return;
  }

  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(service_id) as any;
  if (!service) {
    res.status(404).json({ error: 'Selected service does not exist.' });
    return;
  }

  const id = uid();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const bookingCode = `LC-${new Date().getFullYear()}-${rand}`;
  const pkg = package_id ? (db.prepare('SELECT price FROM service_packages WHERE id = ?').get(package_id) as any) : null;
  const initialEst = pkg ? Number(pkg.price) : Number(estimated_budget || service.starting_price || 0);

  db.prepare(
    `INSERT INTO bookings (
      id, booking_code, customer_id, service_id, package_id, customer_name, mobile_number,
      event_type, event_date, event_location, venue_size, estimated_budget,
      lighting_requirements, additional_instructions, reference_images, completed_photos,
      status, estimated_cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'Pending', ?)`
  ).run(
    id,
    bookingCode,
    customerId,
    service_id,
    package_id || null,
    String(customer_name).trim(),
    String(mobile_number).trim(),
    String(event_type).trim(),
    String(event_date).trim(),
    String(event_location).trim(),
    String(venue_size).trim(),
    Number(estimated_budget || 0),
    String(lighting_requirements).trim(),
    additional_instructions ? String(additional_instructions).trim() : null,
    JSON.stringify(Array.isArray(reference_images) ? reference_images : []),
    initialEst
  );

  // Notify customer
  createNotification({
    recipientProfileId: req.auth!.profileId,
    recipientRole: 'customer',
    type: 'booking_confirmed',
    title: `Booking Request Submitted: ${bookingCode}`,
    message: `We received your ${service.name} request for ${event_date}. Our lighting engineer will review shortly.`,
    relatedBookingId: id,
  });

  // Notify shop owner
  const admin = db.prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`).get() as any;
  createNotification({
    recipientProfileId: admin?.id ?? null,
    recipientRole: 'admin',
    type: 'new_booking',
    title: `New Booking Request: ${bookingCode}`,
    message: `${String(customer_name).trim()} requested ${service.name} for ${event_date} at ${String(event_location).trim()}.`,
    relatedBookingId: id,
  });

  const hydrated = hydrateBookings(
    db
      .prepare(
        `SELECT b.*, s.name as service_name, sp.name as package_name
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN service_packages sp ON sp.id = b.package_id
         WHERE b.id = ?`
      )
      .all(id)
  )[0];

  broadcastEvent('booking:created', hydrated);
  res.status(201).json(hydrated);
});

app.patch('/api/bookings/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }

  const { status, site_visit_date, internal_notes, estimated_cost, completed_photos } = req.body ?? {};
  db.prepare(
    `UPDATE bookings
     SET status = ?, site_visit_date = ?, internal_notes = ?, estimated_cost = ?, completed_photos = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    status ?? existing.status,
    site_visit_date !== undefined ? site_visit_date : existing.site_visit_date,
    internal_notes !== undefined ? internal_notes : existing.internal_notes,
    estimated_cost !== undefined ? Number(estimated_cost) : existing.estimated_cost,
    completed_photos !== undefined ? JSON.stringify(completed_photos) : existing.completed_photos,
    id
  );

  // Lookup customer profile to notify
  const cust = db.prepare('SELECT profile_id FROM customers WHERE id = ?').get(existing.customer_id) as any;
  if (cust && status && status !== existing.status) {
    let title = `Booking ${existing.booking_code} Updated`;
    let msg = `Your booking status is now: ${status}.`;
    if (status === 'Approved') {
      title = `Booking Approved: ${existing.booking_code}`;
      msg = `Your event lighting booking has been approved and scheduled.`;
    } else if (status === 'Completed') {
      title = `Project Completed: ${existing.booking_code}`;
      msg = `Your lighting project is complete. Thank you for celebrating with LuminaCraft — feel free to leave a review!`;
    } else if (status === 'Site Visit Required') {
      title = `Site Visit Scheduled: ${existing.booking_code}`;
      msg = site_visit_date
        ? `A technical site visit has been scheduled for ${site_visit_date}.`
        : `Our electrical engineer will coordinate a site inspection.`;
    }
    createNotification({
      recipientProfileId: cust.profile_id,
      recipientRole: 'customer',
      type: status === 'Completed' ? 'work_completed' : 'booking_updated',
      title,
      message: msg,
      relatedBookingId: id,
    });
  }

  const updated = hydrateBookings(
    db
      .prepare(
        `SELECT b.*, s.name as service_name, sp.name as package_name
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN service_packages sp ON sp.id = b.package_id
         WHERE b.id = ?`
      )
      .all(id)
  )[0];

  broadcastEvent('booking:updated', updated);
  res.json(updated);
});

// ---------------- QUOTATIONS ----------------
app.post('/api/bookings/:id/quotations', requireAdmin, (req, res) => {
  const { id } = req.params;
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as any;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }

  const { line_items, tax_amount, discount_amount, advance_required, valid_until, notes } = req.body ?? {};
  if (!Array.isArray(line_items) || line_items.length === 0) {
    res.status(400).json({ error: 'At least one quotation line item is required.' });
    return;
  }

  const cleanItems = line_items.map((item: any) => {
    const qty = Number(item.quantity || 1);
    const unit = Number(item.unit_price || 0);
    return {
      id: item.id || uid(),
      description: String(item.description || '').trim(),
      quantity: qty,
      unit_price: unit,
      total: qty * unit,
    };
  });

  const subtotal = cleanItems.reduce((s: number, i: any) => s + i.total, 0);
  const tax = Number(tax_amount || 0);
  const discount = Number(discount_amount || 0);
  const totalAmount = Math.max(0, subtotal + tax - discount);
  const advance = Number(advance_required || Math.round(totalAmount * 0.4));

  const existing = db.prepare('SELECT * FROM quotations WHERE booking_id = ?').get(id) as any;
  if (existing) {
    db.prepare(
      `UPDATE quotations
       SET line_items = ?, subtotal = ?, tax_amount = ?, discount_amount = ?, total_amount = ?,
           advance_required = ?, valid_until = ?, notes = ?, status = 'Sent', responded_at = NULL
       WHERE id = ?`
    ).run(
      JSON.stringify(cleanItems),
      subtotal,
      tax,
      discount,
      totalAmount,
      advance,
      valid_until || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      notes || null,
      existing.id
    );
  } else {
    const qNum = `QT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    db.prepare(
      `INSERT INTO quotations (
        id, booking_id, quotation_number, line_items, subtotal, tax_amount, discount_amount,
        total_amount, advance_required, valid_until, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sent')`
    ).run(
      uid(),
      id,
      qNum,
      JSON.stringify(cleanItems),
      subtotal,
      tax,
      discount,
      totalAmount,
      advance,
      valid_until || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      notes || null
    );
  }

  db.prepare(`UPDATE bookings SET status = 'Quotation Sent', estimated_cost = ?, updated_at = datetime('now') WHERE id = ?`).run(
    totalAmount,
    id
  );

  const cust = db.prepare('SELECT profile_id FROM customers WHERE id = ?').get(booking.customer_id) as any;
  if (cust) {
    createNotification({
      recipientProfileId: cust.profile_id,
      recipientRole: 'customer',
      type: 'quotation_received',
      title: `Quotation Sent for ${booking.booking_code}`,
      message: `A quotation of ₹${totalAmount.toLocaleString('en-IN')} is ready for your review.`,
      relatedBookingId: id,
    });
  }

  const updated = hydrateBookings(
    db
      .prepare(
        `SELECT b.*, s.name as service_name, sp.name as package_name
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN service_packages sp ON sp.id = b.package_id
         WHERE b.id = ?`
      )
      .all(id)
  )[0];

  broadcastEvent('booking:updated', updated);
  res.json(updated);
});

app.post('/api/quotations/:id/respond', requireAuth, (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { action } = req.body ?? {};
  if (action !== 'Accepted' && action !== 'Rejected') {
    res.status(400).json({ error: 'Action must be Accepted or Rejected.' });
    return;
  }

  const quotation = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id) as any;
  if (!quotation) {
    res.status(404).json({ error: 'Quotation not found.' });
    return;
  }
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(quotation.booking_id) as any;
  if (req.auth!.role !== 'admin' && booking.customer_id !== req.auth!.customerId) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  db.prepare(`UPDATE quotations SET status = ?, responded_at = datetime('now') WHERE id = ?`).run(action, id);
  const nextBookingStatus = action === 'Accepted' ? 'Approved' : 'Site Visit Required';
  db.prepare(`UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    nextBookingStatus,
    booking.id
  );

  const admin = db.prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`).get() as any;
  createNotification({
    recipientProfileId: admin?.id ?? null,
    recipientRole: 'admin',
    type: action === 'Accepted' ? 'quotation_accepted' : 'quotation_rejected',
    title: `Quotation ${action}: ${booking.booking_code}`,
    message: `${booking.customer_name} ${action.toLowerCase()} quotation ${quotation.quotation_number} (₹${Number(quotation.total_amount).toLocaleString('en-IN')}).`,
    relatedBookingId: booking.id,
  });

  const updated = hydrateBookings(
    db
      .prepare(
        `SELECT b.*, s.name as service_name, sp.name as package_name
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN service_packages sp ON sp.id = b.package_id
         WHERE b.id = ?`
      )
      .all(booking.id)
  )[0];

  broadcastEvent('booking:updated', updated);
  res.json(updated);
});

// ---------------- ALLOCATE INVENTORY TO BOOKING ----------------
app.post('/api/bookings/:id/items', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { inventory_id, quantity, notes } = req.body ?? {};
  const qty = Number(quantity || 0);
  if (!inventory_id || qty <= 0) {
    res.status(400).json({ error: 'Valid inventory item and positive quantity required.' });
    return;
  }

  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventory_id) as any;
  if (!item) {
    res.status(404).json({ error: 'Inventory item not found.' });
    return;
  }
  if (Number(item.quantity_available) < qty) {
    res.status(400).json({ error: `Insufficient stock. Only ${item.quantity_available} ${item.unit} available.` });
    return;
  }

  db.prepare(`UPDATE inventory SET quantity_available = quantity_available - ?, updated_at = datetime('now') WHERE id = ?`).run(
    qty,
    inventory_id
  );
  db.prepare(
    `INSERT INTO booking_items (id, booking_id, inventory_id, item_name, quantity, unit_price, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uid(), id, inventory_id, item.product_name, qty, item.selling_price, notes || null);
  db.prepare(
    `INSERT INTO inventory_transactions (id, inventory_id, booking_id, transaction_type, quantity, notes) VALUES (?, ?, ?, 'out', ?, ?)`
  ).run(uid(), inventory_id, id, qty, notes || `Allocated to booking`);

  checkLowStockAlert(inventory_id);
  broadcastEvent('inventory:updated', { inventory_id });

  const updated = hydrateBookings(
    db
      .prepare(
        `SELECT b.*, s.name as service_name, sp.name as package_name
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN service_packages sp ON sp.id = b.package_id
         WHERE b.id = ?`
      )
      .all(id)
  )[0];
  res.status(201).json(updated);
});

// ---------------- INVENTORY ----------------
app.get('/api/inventory', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM inventory ORDER BY product_name ASC').all();
  res.json(rows);
});

app.post('/api/inventory', requireAdmin, (req, res) => {
  const {
    product_name,
    category,
    quantity_available,
    unit,
    purchase_price,
    selling_price,
    min_stock_alert,
    supplier_name,
    supplier_contact,
  } = req.body ?? {};
  if (!product_name || !category) {
    res.status(400).json({ error: 'Product name and category are required.' });
    return;
  }
  const id = uid();
  db.prepare(
    `INSERT INTO inventory (
      id, product_name, category, quantity_available, unit, purchase_price, selling_price,
      min_stock_alert, supplier_name, supplier_contact
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(product_name).trim(),
    String(category),
    Math.max(0, Number(quantity_available || 0)),
    String(unit || 'pcs').trim(),
    Number(purchase_price || 0),
    Number(selling_price || 0),
    Number(min_stock_alert || 10),
    String(supplier_name || '').trim(),
    String(supplier_contact || '').trim()
  );

  checkLowStockAlert(id);
  broadcastEvent('inventory:updated', { id });
  res.status(201).json(db.prepare('SELECT * FROM inventory WHERE id = ?').get(id));
});

app.put('/api/inventory/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Inventory item not found.' });
    return;
  }
  const {
    product_name,
    category,
    quantity_available,
    unit,
    purchase_price,
    selling_price,
    min_stock_alert,
    supplier_name,
    supplier_contact,
  } = req.body ?? {};

  const nextQty = quantity_available !== undefined ? Math.max(0, Number(quantity_available)) : existing.quantity_available;

  db.prepare(
    `UPDATE inventory
     SET product_name = ?, category = ?, quantity_available = ?, unit = ?,
         purchase_price = ?, selling_price = ?, min_stock_alert = ?,
         supplier_name = ?, supplier_contact = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    product_name ?? existing.product_name,
    category ?? existing.category,
    nextQty,
    unit ?? existing.unit,
    purchase_price !== undefined ? Number(purchase_price) : existing.purchase_price,
    selling_price !== undefined ? Number(selling_price) : existing.selling_price,
    min_stock_alert !== undefined ? Number(min_stock_alert) : existing.min_stock_alert,
    supplier_name ?? existing.supplier_name,
    supplier_contact ?? existing.supplier_contact,
    id
  );

  if (nextQty !== existing.quantity_available) {
    db.prepare(
      `INSERT INTO inventory_transactions (id, inventory_id, transaction_type, quantity, notes) VALUES (?, ?, ?, ?, ?)`
    ).run(
      uid(),
      id,
      nextQty > existing.quantity_available ? 'in' : 'adjustment',
      Math.abs(nextQty - existing.quantity_available),
      `Stock updated from ${existing.quantity_available} to ${nextQty}`
    );
  }

  checkLowStockAlert(id);
  broadcastEvent('inventory:updated', { id });
  res.json(db.prepare('SELECT * FROM inventory WHERE id = ?').get(id));
});

app.delete('/api/inventory/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM booking_items WHERE inventory_id = ?').run(req.params.id);
  db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
  broadcastEvent('inventory:updated', { id: req.params.id });
  res.json({ deleted: true });
});

// ---------------- CUSTOMERS ----------------
app.get('/api/customers', requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, p.full_name, p.email, p.phone
       FROM customers c
       JOIN profiles p ON p.id = c.profile_id
       ORDER BY c.created_at DESC`
    )
    .all() as any[];

  const hydrated = rows.map((c) => {
    const bookings = db.prepare('SELECT id, estimated_cost, status FROM bookings WHERE customer_id = ?').all(c.id) as any[];
    const paidRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE customer_id = ?').get(c.id) as { total: number };
    const totalBilled = bookings
      .filter((b) => b.status !== 'Cancelled')
      .reduce((sum, b) => {
        const q = db.prepare('SELECT total_amount FROM quotations WHERE booking_id = ?').get(b.id) as any;
        return sum + Number(q ? q.total_amount : b.estimated_cost || 0);
      }, 0);
    return {
      ...c,
      saved_addresses: parseJsonField(c.saved_addresses, []),
      booking_count: bookings.length,
      total_paid: paidRow.total,
      outstanding_balance: Math.max(0, totalBilled - paidRow.total),
    };
  });
  res.json(hydrated);
});

app.patch('/api/customers/:id', requireAdmin, (req, res) => {
  const { private_notes } = req.body ?? {};
  db.prepare('UPDATE customers SET private_notes = ? WHERE id = ?').run(private_notes ?? null, req.params.id);
  res.json({ ok: true });
});

// ---------------- WORKERS & ASSIGNMENTS ----------------
app.get('/api/workers', requireAdmin, (_req, res) => {
  const workers = db.prepare('SELECT * FROM workers ORDER BY full_name ASC').all() as any[];
  const hydrated = workers.map((w) => {
    const assignments = db
      .prepare(
        `SELECT wa.*, b.booking_code, b.event_location
         FROM worker_assignments wa
         JOIN bookings b ON b.id = wa.booking_id
         WHERE wa.worker_id = ?
         ORDER BY wa.scheduled_date DESC`
      )
      .all(w.id);
    return { ...w, assignments };
  });
  res.json(hydrated);
});

app.post('/api/workers', requireAdmin, (req, res) => {
  const { full_name, phone, specialty, daily_rate, status } = req.body ?? {};
  if (!full_name || !phone || !specialty) {
    res.status(400).json({ error: 'Worker name, phone, and specialty are required.' });
    return;
  }
  const id = uid();
  db.prepare(`INSERT INTO workers (id, full_name, phone, specialty, daily_rate, status) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id,
    String(full_name).trim(),
    String(phone).trim(),
    String(specialty).trim(),
    Number(daily_rate || 1200),
    status || 'Available'
  );
  res.status(201).json(db.prepare('SELECT * FROM workers WHERE id = ?').get(id));
});

app.put('/api/workers/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Worker not found.' });
    return;
  }
  const { full_name, phone, specialty, daily_rate, status } = req.body ?? {};
  db.prepare(`UPDATE workers SET full_name = ?, phone = ?, specialty = ?, daily_rate = ?, status = ? WHERE id = ?`).run(
    full_name ?? existing.full_name,
    phone ?? existing.phone,
    specialty ?? existing.specialty,
    daily_rate !== undefined ? Number(daily_rate) : existing.daily_rate,
    status ?? existing.status,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id));
});

app.delete('/api/workers/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM workers WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

app.post('/api/worker-assignments', requireAdmin, (req, res) => {
  const { booking_id, worker_id, scheduled_date, shift, role_notes } = req.body ?? {};
  if (!booking_id || !worker_id || !scheduled_date) {
    res.status(400).json({ error: 'Booking, worker, and scheduled date are required.' });
    return;
  }
  const id = uid();
  db.prepare(
    `INSERT INTO worker_assignments (id, booking_id, worker_id, scheduled_date, shift, role_notes, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Scheduled')`
  ).run(id, booking_id, worker_id, scheduled_date, shift || 'Full Day', role_notes || null);

  db.prepare(`UPDATE workers SET status = 'Assigned' WHERE id = ?`).run(worker_id);

  const updatedBooking = hydrateBookings(
    db
      .prepare(
        `SELECT b.*, s.name as service_name, sp.name as package_name
         FROM bookings b
         LEFT JOIN services s ON s.id = b.service_id
         LEFT JOIN service_packages sp ON sp.id = b.package_id
         WHERE b.id = ?`
      )
      .all(booking_id)
  )[0];
  broadcastEvent('booking:updated', updatedBooking);
  res.status(201).json(updatedBooking);
});

app.patch('/api/worker-assignments/:id', requireAdmin, (req, res) => {
  const { status } = req.body ?? {};
  db.prepare('UPDATE worker_assignments SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// ---------------- PAYMENTS & EXPENSES ----------------
app.get('/api/payments', requireAuth, (req: AuthedRequest, res) => {
  if (req.auth!.role === 'admin') {
    const rows = db
      .prepare(
        `SELECT p.*, b.booking_code, b.customer_name
         FROM payments p
         JOIN bookings b ON b.id = p.booking_id
         ORDER BY p.payment_date DESC, p.created_at DESC`
      )
      .all();
    res.json(rows);
  } else {
    const rows = db
      .prepare(
        `SELECT p.*, b.booking_code, b.customer_name
         FROM payments p
         JOIN bookings b ON b.id = p.booking_id
         WHERE p.customer_id = ?
         ORDER BY p.payment_date DESC, p.created_at DESC`
      )
      .all(req.auth!.customerId);
    res.json(rows);
  }
});

app.post('/api/payments', requireAdmin, (req, res) => {
  const { booking_id, payment_type, amount, payment_method, reference_no, payment_date, notes } = req.body ?? {};
  const numericAmount = Number(amount || 0);
  if (!booking_id || !payment_type || numericAmount <= 0 || !payment_method) {
    res.status(400).json({ error: 'Booking, payment type, positive amount, and method are required.' });
    return;
  }
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking_id) as any;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }
  const id = uid();
  const pDate = payment_date || new Date().toISOString().slice(0, 10);

  db.prepare(
    `INSERT INTO payments (id, booking_id, customer_id, payment_type, amount, payment_method, reference_no, payment_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    booking_id,
    booking.customer_id,
    payment_type,
    numericAmount,
    payment_method,
    reference_no || null,
    pDate,
    notes || null
  );

  db.prepare(`UPDATE customers SET total_spent = total_spent + ? WHERE id = ?`).run(numericAmount, booking.customer_id);

  const cust = db.prepare('SELECT profile_id FROM customers WHERE id = ?').get(booking.customer_id) as any;
  if (cust) {
    createNotification({
      recipientProfileId: cust.profile_id,
      recipientRole: 'customer',
      type: 'payment_recorded',
      title: `Payment Receipt: ${booking.booking_code}`,
      message: `${payment_type} payment of ₹${numericAmount.toLocaleString('en-IN')} via ${payment_method} recorded.`,
      relatedBookingId: booking_id,
    });
  }

  const admin = db.prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`).get() as any;
  createNotification({
    recipientProfileId: admin?.id ?? null,
    recipientRole: 'admin',
    type: 'payment_received',
    title: `Payment Recorded: ₹${numericAmount.toLocaleString('en-IN')}`,
    message: `${payment_type} payment received for ${booking.booking_code} (${booking.customer_name}).`,
    relatedBookingId: booking_id,
  });

  broadcastEvent('payment:recorded', { booking_id, amount: numericAmount });
  res.status(201).json(db.prepare('SELECT * FROM payments WHERE id = ?').get(id));
});

app.get('/api/expenses', requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT e.*, b.booking_code
       FROM expenses e
       LEFT JOIN bookings b ON b.id = e.booking_id
       ORDER BY e.expense_date DESC, e.created_at DESC`
    )
    .all();
  res.json(rows);
});

app.post('/api/expenses', requireAdmin, (req, res) => {
  const { category, description, amount, expense_date, booking_id, vendor } = req.body ?? {};
  const numericAmount = Number(amount || 0);
  if (!category || !description || numericAmount <= 0) {
    res.status(400).json({ error: 'Category, description, and positive amount are required.' });
    return;
  }
  const id = uid();
  db.prepare(
    `INSERT INTO expenses (id, category, description, amount, expense_date, booking_id, vendor) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(category).trim(),
    String(description).trim(),
    numericAmount,
    expense_date || new Date().toISOString().slice(0, 10),
    booking_id || null,
    String(vendor || '').trim()
  );
  broadcastEvent('payment:recorded', { expense_id: id });
  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(id));
});

app.delete('/api/expenses/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  broadcastEvent('payment:recorded', { expense_id: req.params.id });
  res.json({ deleted: true });
});

// ---------------- ANALYTICS (100% COMPUTED FROM DB) ----------------
app.get('/api/analytics', requireAdmin, (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const totalCustomers = (db.prepare('SELECT COUNT(*) as c FROM customers').get() as { c: number }).c;
  const allBookings = db
    .prepare(
      `SELECT b.*, s.name as service_name
       FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id`
    )
    .all() as any[];

  const totalBookings = allBookings.length;
  const todaysBookings = allBookings.filter(
    (b) => String(b.created_at).slice(0, 10) === today || b.event_date === today
  ).length;
  const pendingRequests = allBookings.filter((b) => ['Pending', 'Request Received', 'Site Visit Required'].includes(b.status)).length;
  const activeProjects = allBookings.filter((b) => ['Approved', 'Work in Progress', 'Quotation Sent'].includes(b.status)).length;
  const completedProjects = allBookings.filter((b) => b.status === 'Completed').length;

  const payments = db.prepare('SELECT * FROM payments').all() as any[];
  const expenses = db.prepare('SELECT * FROM expenses').all() as any[];

  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  let outstandingPayments = 0;
  for (const b of allBookings) {
    if (b.status === 'Cancelled') continue;
    const q = db.prepare('SELECT total_amount FROM quotations WHERE booking_id = ?').get(b.id) as any;
    const billed = q ? Number(q.total_amount) : Number(b.estimated_cost || 0);
    const paidForBooking = payments
      .filter((p) => p.booking_id === b.id)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    if (billed > paidForBooking) {
      outstandingPayments += billed - paidForBooking;
    }
  }

  const lowStockCount = (
    db.prepare('SELECT COUNT(*) as c FROM inventory WHERE quantity_available <= min_stock_alert').get() as { c: number }
  ).c;

  // Monthly Revenue & Expenses (last 6 active months)
  const monthLabels = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const monthNums = ['06', '07', '08', '09', '10', '11'];
  const monthlyRevenue = monthNums.map((m, idx) => {
    const rev = payments
      .filter((p) => String(p.payment_date).slice(5, 7) === m)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const exp = expenses
      .filter((e) => String(e.expense_date).slice(5, 7) === m)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return { month: monthLabels[idx], revenue: rev, expenses: exp };
  });

  // Check if any payment/booking falls in Dec or other months and include if present
  const decRev = payments
    .filter((p) => String(p.payment_date).slice(5, 7) === '12')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const decExp = expenses
    .filter((e) => String(e.expense_date).slice(5, 7) === '12')
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  if (decRev > 0 || decExp > 0) {
    monthlyRevenue.push({ month: 'Dec', revenue: decRev, expenses: decExp });
  }

  const monthlyBookings = monthNums.map((m, idx) => {
    const inMonth = allBookings.filter(
      (b) => String(b.event_date).slice(5, 7) === m || String(b.created_at).slice(5, 7) === m
    );
    return {
      month: monthLabels[idx],
      bookings: inMonth.length,
      completed: inMonth.filter((b) => b.status === 'Completed').length,
    };
  });

  // Most Popular Services
  const serviceMap = new Map<string, { name: string; count: number; revenue: number }>();
  for (const b of allBookings) {
    const name = b.service_name || 'Custom Service';
    const curr = serviceMap.get(name) || { name, count: 0, revenue: 0 };
    curr.count += 1;
    const paidForBooking = payments
      .filter((p) => p.booking_id === b.id)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    curr.revenue += paidForBooking || Number(b.estimated_cost || 0);
    serviceMap.set(name, curr);
  }
  const popularServices = Array.from(serviceMap.values()).sort((a, b) => b.count - a.count).slice(0, 6);

  // Payment statistics breakdown by payment type + outstanding
  const advanceTotal = payments.filter((p) => p.payment_type === 'Advance').reduce((s, p) => s + Number(p.amount), 0);
  const partialTotal = payments.filter((p) => p.payment_type === 'Partial').reduce((s, p) => s + Number(p.amount), 0);
  const finalTotal = payments.filter((p) => p.payment_type === 'Final').reduce((s, p) => s + Number(p.amount), 0);

  const paymentStats = [
    { name: 'Advance Paid', value: advanceTotal },
    { name: 'Partial Paid', value: partialTotal },
    { name: 'Final Settled', value: finalTotal },
    { name: 'Outstanding', value: outstandingPayments },
  ].filter((x) => x.value > 0);

  res.json({
    kpis: {
      totalCustomers,
      totalBookings,
      todaysBookings,
      pendingRequests,
      activeProjects,
      completedProjects,
      totalRevenue,
      outstandingPayments,
      totalExpenses,
      lowStockCount,
    },
    monthlyRevenue,
    monthlyBookings,
    popularServices,
    paymentStats,
  });
});

// ---------------- NOTIFICATIONS ----------------
app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
  const rows =
    req.auth!.role === 'admin'
      ? db
          .prepare(
            `SELECT * FROM notifications WHERE recipient_role = 'admin' OR recipient_profile_id = ? ORDER BY created_at DESC LIMIT 50`
          )
          .all(req.auth!.profileId)
      : db
          .prepare(`SELECT * FROM notifications WHERE recipient_profile_id = ? ORDER BY created_at DESC LIMIT 50`)
          .all(req.auth!.profileId);

  res.json(rows.map((r: any) => ({ ...r, is_read: Boolean(r.is_read) })));
});

app.patch('/api/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
  if (req.auth!.role === 'admin') {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE recipient_role = 'admin' OR recipient_profile_id = ?`).run(
      req.auth!.profileId
    );
  } else {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE recipient_profile_id = ?`).run(req.auth!.profileId);
  }
  res.json({ ok: true });
});

// ---------------- REVIEWS & PUBLIC INQUIRIES ----------------
app.get('/api/reviews', (_req, res) => {
  const rows = db.prepare('SELECT * FROM reviews ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/reviews', requireAuth, (req: AuthedRequest, res) => {
  const { booking_id, rating, comment } = req.body ?? {};
  const numericRating = Number(rating || 0);
  if (!booking_id || numericRating < 1 || numericRating > 5 || !comment) {
    res.status(400).json({ error: 'Booking, rating (1-5), and comment are required.' });
    return;
  }
  const booking = db
    .prepare(
      `SELECT b.*, s.name as service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id WHERE b.id = ?`
    )
    .get(booking_id) as any;
  if (!booking) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }
  if (booking.customer_id !== req.auth!.customerId && req.auth!.role !== 'admin') {
    res.status(403).json({ error: 'You can only review your own completed bookings.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM reviews WHERE booking_id = ?').get(booking_id);
  if (existing) {
    res.status(409).json({ error: 'You have already submitted a review for this booking.' });
    return;
  }

  const id = uid();
  db.prepare(
    `INSERT INTO reviews (id, booking_id, customer_id, customer_name, service_name, rating, comment) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, booking_id, booking.customer_id, booking.customer_name, booking.service_name || 'Event Lighting', numericRating, String(comment).trim());

  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
  broadcastEvent('review:created', review);
  res.status(201).json(review);
});

app.post('/api/inquiries', (req, res) => {
  const { name, phone, email, message } = req.body ?? {};
  if (!name || !phone || !message) {
    res.status(400).json({ error: 'Name, phone number, and message are required.' });
    return;
  }
  const admin = db.prepare(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`).get() as any;
  createNotification({
    recipientProfileId: admin?.id ?? null,
    recipientRole: 'admin',
    type: 'customer_inquiry',
    title: `New Callback Inquiry from ${String(name).trim()}`,
    message: `Phone: ${String(phone).trim()}${email ? ` · ${email}` : ''} — "${String(message).trim()}"`,
  });
  res.status(201).json({ ok: true, message: 'Thank you! Our lighting team will contact you shortly.' });
});

// ---------------- VITE / STATIC SERVING ----------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LuminaCraft platform running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
