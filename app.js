/* ══════════════════════════════════════════════════════════════════
   MEDISTORE — CORE LOGIC
   FILE: app.js
   ══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   1. CONSTANTS
   ───────────────────────────────────────────── */
const PRODUCT_UNITS = [
  'strip', 'tablet', 'capsule', 'bottle', 'tube', 'sachet', 'vial', 
  'ampoule', 'syringe', 'injection', 'drops', 'syrup', 'box', 'pack', 
  'piece', 'jar', 'tin', 'can', 'roll', 'packet'
];

const MEDICINE_CATEGORIES = [
  'Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Cream', 'Drops',
  'Inhaler', 'Powder', 'Sachet', 'Gel', 'Lotion', 'Spray', 'Suppository',
  'Vaccine', 'Surgical', 'Other'
];

const SCHEDULE_TYPES = ['', 'OTC', 'H', 'H1', 'X', 'Narcotic'];

const SUPPLIER_CATEGORIES = [
  'Distributor', 'Wholesaler', 'Manufacturer', 'C&F', 'Stockist', 'Other'
];

const GST_RATES = [0, 5, 12, 18, 28];

const INVOICE_PREFIX = 'INV-';
const RETURN_PREFIX  = 'RET-';

/* ─────────────────────────────────────────────
   2. SUPABASE INITIALIZATION
   ───────────────────────────────────────────── */
// Uses the config defined in index.html
const sb = supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL, 
  window.APP_CONFIG.SUPABASE_ANON_KEY
);

/* ─────────────────────────────────────────────
   3. GLOBAL STATE & DB CACHE
   ───────────────────────────────────────────── */
let SESSION = null;
let charts  = [];

let SETTINGS = {
  shop_name:         'MediStore',
  owner_name:        'Owner',
  address:           '',
  city:              '',
  license:           '',
  dl_number:         '',
  upi:               '',
  phone:             '',
  email:             '',
  logo:              '',
  gst_enabled:       false,
  gst_number:        '',
  gst_rate:          window.APP_CONFIG.DEFAULT_GST_RATE,
  near_expiry_days:  window.APP_CONFIG.DEFAULT_NEAR_EXPIRY_DAYS,
  enable_non_batch:  false,
  print_footer:      'Thank you! Get well soon',
  loaded:            false
};

const DB = {
  customers:               [],
  doctors:                 [],
  suppliers:               [],
  products:                [],
  product_batches:         [],
  invoices:                [],
  invoice_items:           [],
  payments:                [],
  supplier_invoices:       [],
  supplier_invoice_items:  [],
  supplier_payments:       [],
  returns:                 [],
  expenses:                [],
  settings:                null
};

window.DB_SYNCED       = false;
window.DB_SYNC_ERRORS  = [];
window.DB_SYNCING      = false;

/* ─────────────────────────────────────────────
   4. DOM HELPERS
   ───────────────────────────────────────────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ─────────────────────────────────────────────
   5. SECURITY & SANITIZATION (XSS PREVENTION)
   ───────────────────────────────────────────── */
/**
 * Escapes HTML entities in a string to prevent XSS.
 * MUST be used whenever inserting untrusted data (DB or User) into innerHTML.
 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', 
    '<': '&lt;', 
    '>': '&gt;', 
    '"': '&quot;', 
    "'": '&#39;'
  }[c]));
}

/* ─────────────────────────────────────────────
   6. DATE & TIME HELPERS
   ───────────────────────────────────────────── */
const todayStr = () => new Date().toISOString().slice(0, 10);
const isFuture = d => d && d > todayStr();

const fmtDate = (d) => {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const txDate = (r, k) => (r && (r[k] || (r.created_at ? r.created_at.slice(0, 10) : ''))) || '';

const txDT = (r, k) => {
  if (!r) return '-';
  const d = txDate(r, k);
  if (!d) return '-';
  return fmtDate(d) + (r.tx_time ? ' ' + r.tx_time : '');
};

const enteredOn = (r) => {
  if (!r || !r.created_at) return '';
  const d = new Date(r.created_at);
  return 'Entered: ' + d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
       + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const fmtExpiryShort = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).slice(0, 10));
  if (isNaN(dt.getTime())) return '—';
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return mm + '/' + yy;
};

/* ─────────────────────────────────────────────
   7. NUMBER & CURRENCY FORMATTERS (Indian System)
   ───────────────────────────────────────────── */
function inr(n) {
  const num = Number(n || 0);
  const neg = num < 0;
  const s   = Math.abs(num).toFixed(2);
  const p   = s.split('.');
  let intPart = p[0];
  const decPart = p[1];
  
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest  = intPart.slice(0, -3);
    intPart = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return (neg ? '-' : '') + intPart + '.' + decPart;
}

const rs = (n) => '₹' + inr(n);

const fmtNum = (n) => {
  const v = Number(n || 0);
  return v % 1 === 0 ? String(v) : v.toFixed(2);
};

/* ─────────────────────────────────────────────
   8. UI: TOASTS
   ───────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const root = $('#toast-root');
  if (!root) return;

  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  
  // SAFE: Using textContent instead of innerHTML to prevent XSS from DB errors
  el.textContent = msg; 
  
  root.appendChild(el);
  
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ─────────────────────────────────────────────
   9. SUBSCRIPTION HELPERS (From Config)
   ───────────────────────────────────────────── */
const SUB_PLAN_AMOUNT = window.APP_CONFIG.SUB_PLAN_AMOUNT;
const SUB_OWNER_UPI   = window.APP_CONFIG.SUB_OWNER_UPI;
const SUB_OWNER_NAME  = window.APP_CONFIG.SUB_OWNER_NAME;

window.SUB = {
  loaded: false,
  active: true, // Default fail-open for local dev, will sync with DB
  expires_at: null,
  last_paid_at: null
};

console.log('[MediStore] Core Logic Block 1 loaded');
