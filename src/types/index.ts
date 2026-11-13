export type UserRole = 'customer' | 'admin';

export type BookingStatus =
  | 'Pending'
  | 'Request Received'
  | 'Site Visit Required'
  | 'Quotation Sent'
  | 'Approved'
  | 'Work in Progress'
  | 'Completed'
  | 'Cancelled';

export const BOOKING_STATUSES: BookingStatus[] = [
  'Pending',
  'Request Received',
  'Site Visit Required',
  'Quotation Sent',
  'Approved',
  'Work in Progress',
  'Completed',
  'Cancelled',
];

export type InventoryCategory =
  | 'LED lights'
  | 'Serial lights'
  | 'Rice lights'
  | 'RGB strips'
  | 'LED bulbs'
  | 'Wires and cables'
  | 'Extension boards'
  | 'Controllers'
  | 'Decorative lighting'
  | 'Other electrical equipment';

export const INVENTORY_CATEGORIES: InventoryCategory[] = [
  'LED lights',
  'Serial lights',
  'Rice lights',
  'RGB strips',
  'LED bulbs',
  'Wires and cables',
  'Extension boards',
  'Controllers',
  'Decorative lighting',
  'Other electrical equipment',
];

export interface SavedAddress {
  id: string;
  label: string;
  addressLine: string;
  city: string;
  pincode: string;
  isDefault: boolean;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

export interface CustomerRecord {
  id: string;
  profile_id: string;
  full_name: string;
  email: string;
  phone: string;
  company_name: string | null;
  saved_addresses: SavedAddress[];
  private_notes: string | null;
  total_spent: number;
  booking_count?: number;
  total_paid?: number;
  outstanding_balance?: number;
  created_at: string;
}

export interface ServicePackage {
  id: string;
  service_id: string;
  name: string;
  description: string;
  price: number;
  duration_hours: number;
  highlights: string[];
}

export interface ServiceItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  image_url: string;
  starting_price: number;
  is_active: boolean;
  featured: boolean;
  created_at: string;
  packages: ServicePackage[];
}

export interface QuotationLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Quotation {
  id: string;
  booking_id: string;
  quotation_number: string;
  line_items: QuotationLineItem[];
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  advance_required: number;
  valid_until: string;
  notes: string | null;
  status: 'Sent' | 'Accepted' | 'Rejected' | 'Revised';
  created_at: string;
  responded_at: string | null;
}

export interface BookingAllocatedItem {
  id: string;
  booking_id: string;
  inventory_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
}

export interface WorkerAssignment {
  id: string;
  booking_id: string;
  worker_id: string;
  worker_name?: string;
  worker_phone?: string;
  worker_specialty?: string;
  booking_code?: string;
  event_location?: string;
  scheduled_date: string;
  shift: string;
  role_notes: string | null;
  status: 'Scheduled' | 'In Progress' | 'Completed';
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  booking_id: string;
  booking_code?: string;
  customer_id: string;
  customer_name?: string;
  payment_type: 'Advance' | 'Partial' | 'Final';
  amount: number;
  payment_method: string;
  reference_no: string | null;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export interface Booking {
  id: string;
  booking_code: string;
  customer_id: string;
  service_id: string;
  service_name?: string;
  package_id: string | null;
  package_name?: string | null;
  customer_name: string;
  mobile_number: string;
  event_type: string;
  event_date: string;
  event_location: string;
  venue_size: string;
  estimated_budget: number;
  lighting_requirements: string;
  additional_instructions: string | null;
  reference_images: string[];
  completed_photos: string[];
  status: BookingStatus;
  site_visit_date: string | null;
  internal_notes: string | null;
  estimated_cost: number;
  created_at: string;
  updated_at: string;
  quotation?: Quotation | null;
  payments?: PaymentRecord[];
  assigned_workers?: WorkerAssignment[];
  allocated_items?: BookingAllocatedItem[];
  total_paid?: number;
  remaining_balance?: number;
}

export interface InventoryItem {
  id: string;
  product_name: string;
  category: InventoryCategory;
  quantity_available: number;
  unit: string;
  purchase_price: number;
  selling_price: number;
  min_stock_alert: number;
  supplier_name: string;
  supplier_contact: string;
  updated_at: string;
}

export interface Worker {
  id: string;
  full_name: string;
  phone: string;
  specialty: string;
  daily_rate: number;
  status: 'Available' | 'Assigned' | 'Off Duty';
  created_at: string;
  assignments?: WorkerAssignment[];
}

export interface ExpenseRecord {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  booking_id: string | null;
  booking_code?: string | null;
  vendor: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  recipient_profile_id: string | null;
  recipient_role: UserRole;
  type: string;
  title: string;
  message: string;
  related_booking_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ReviewItem {
  id: string;
  booking_id: string;
  customer_id: string;
  customer_name: string;
  service_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface AdminAnalytics {
  kpis: {
    totalCustomers: number;
    totalBookings: number;
    todaysBookings: number;
    pendingRequests: number;
    activeProjects: number;
    completedProjects: number;
    totalRevenue: number;
    outstandingPayments: number;
    totalExpenses: number;
    lowStockCount: number;
  };
  monthlyRevenue: { month: string; revenue: number; expenses: number }[];
  monthlyBookings: { month: string; bookings: number; completed: number }[];
  popularServices: { name: string; count: number; revenue: number }[];
  paymentStats: { name: string; value: number }[];
}
