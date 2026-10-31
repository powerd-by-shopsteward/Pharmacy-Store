/* ══════════════════════════════════════════════════════════════════
   MEDISTORE — CORE LOGIC
   FILE: app.js
   BLOCK 1 (FIXED): Constants, State, Helpers, Supabase (Safe Init)
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
   2. SAFE SUPABASE INITIALIZATION
   ───────────────────────────────────────────── */
let sb = null;
(function initSupabase() {
  try {
    const cfg = window.APP_CONFIG || {};
    if(!cfg.SUPABASE_URL || cfg.SUPABASE_URL === 'YOUR_SUPABASE_URL' ||
       !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
      throw new Error(
        'Configuration incomplete.\n\n' +
        'Open index.html and replace:\n' +
        '  YOUR_SUPABASE_URL     → your project URL\n' +
        '  YOUR_SUPABASE_ANON_KEY → your anon key\n\n' +
        'Get both from https://app.supabase.com → Project Settings → API'
      );
    }
    if(typeof supabase === 'undefined') {
      throw new Error('Supabase library not loaded. Check your internet connection or CDN block.');
    }
    sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } catch(e) {
    console.error('[MediStore] Init failed:', e);
    // Show a clear error card instead of white screen
    document.addEventListener('DOMContentLoaded', () => {
      const app = document.getElementById('app');
      if(app) {
        app.innerHTML =
          '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,sans-serif;background:#F7F7FB;">' +
            '<div style="max-width:560px;width:100%;background:#fff;border:1px solid #E9EAF0;border-radius:16px;padding:32px;box-shadow:0 10px 40px rgba(0,0,0,0.08);">' +
              '<div style="font-size:40px;margin-bottom:16px;">⚠️</div>' +
              '<h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 12px;">Configuration Required</h1>' +
              '<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:16px;margin-bottom:20px;font-family:ui-monospace,monospace;font-size:12px;color:#991b1b;white-space:pre-wrap;line-height:1.6;">' +
                String(e.message || e).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])) +
              '</div>' +
              '<p style="font-size:13px;color:#6B7280;line-height:1.7;margin:0;">' +
                'This is not a bug — the app needs your Supabase credentials before it can connect to a database.' +
              '</p>' +
            '</div>' +
          '</div>';
      }
    });
    throw e;
  }
})();

/* ─────────────────────────────────────────────
   3. GLOBAL STATE
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
  gst_rate:          (window.APP_CONFIG && window.APP_CONFIG.DEFAULT_GST_RATE) || 12,
  near_expiry_days:  (window.APP_CONFIG && window.APP_CONFIG.DEFAULT_NEAR_EXPIRY_DAYS) || 60,
  enable_non_batch:  false,
  print_footer:      'Thank you! Get well soon',
  loaded:            false
};

const DB = {
  customers: [], doctors: [], suppliers: [], products: [], product_batches: [],
  invoices: [], invoice_items: [], payments: [],
  supplier_invoices: [], supplier_invoice_items: [], supplier_payments: [],
  returns: [], expenses: [], settings: null
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
   5. XSS ESCAPING
   ───────────────────────────────────────────── */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ─────────────────────────────────────────────
   6. FAVICON (missing in original — now defined)
   ───────────────────────────────────────────── */
function applyFavicon() {
  let link = document.querySelector('link[rel="icon"]');
  if(!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = (SETTINGS && SETTINGS.logo) ||
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💊</text></svg>";
}
function logoHtml(size = 38) {
  if(SETTINGS.logo) {
    return `<img src="${esc(SETTINGS.logo)}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:6px;" alt="logo">`;
  }
  return '💊';
}
/* ─────────────────────────────────────────────
   7. DATE / TIME HELPERS
   ───────────────────────────────────────────── */
const todayStr = () => new Date().toISOString().slice(0, 10);
const isFuture = d => d && d > todayStr();

const fmtDate = (d) => {
  if(!d) return '-';
  const s = String(d).slice(0, 10);
  const dt = new Date(s);
  if(isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const txDate = (r, k) => (r && (r[k] || (r.created_at ? r.created_at.slice(0, 10) : ''))) || '';

const txDT = (r, k) => {
  if(!r) return '-';
  const d = txDate(r, k);
  if(!d) return '-';
  return fmtDate(d) + (r.tx_time ? ' ' + r.tx_time : '');
};

const enteredOn = (r) => {
  if(!r || !r.created_at) return '';
  const d = new Date(r.created_at);
  return 'Entered: ' + d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
       + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const fmtExpiryShort = (d) => {
  if(!d) return '—';
  const dt = new Date(String(d).slice(0, 10));
  if(isNaN(dt.getTime())) return '—';
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return mm + '/' + yy;
};

/* ─────────────────────────────────────────────
   8. NUMBER / CURRENCY
   ───────────────────────────────────────────── */
function inr(n) {
  const num = Number(n || 0);
  const neg = num < 0;
  const s   = Math.abs(num).toFixed(2);
  const p   = s.split('.');
  let intPart = p[0];
  const decPart = p[1];
  if(intPart.length > 3) {
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
   9. TOAST
   ───────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const root = $('#toast-root');
  if(!root) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ─────────────────────────────────────────────
   10. SUBSCRIPTION CONSTANTS
   ───────────────────────────────────────────── */
const SUB_PLAN_AMOUNT  = (window.APP_CONFIG && window.APP_CONFIG.SUB_PLAN_AMOUNT)  || 599;
const SUB_OWNER_UPI    = (window.APP_CONFIG && window.APP_CONFIG.SUB_OWNER_UPI)    || '';
const SUB_OWNER_NAME   = (window.APP_CONFIG && window.APP_CONFIG.SUB_OWNER_NAME)   || '';

window.SUB = {
  loaded: false,
  active: true,
  expires_at: null,
  last_paid_at: null
};

console.log('[MediStore] Block 1 loaded · Supabase:', sb ? 'OK' : 'NOT INITIALIZED');
/* ─────────────────────────────────────────────
   11. SYNC DB (Fetch all tables)
   ───────────────────────────────────────────── */
async function fetchAllInvoiceItems() {
  const PAGE = 1000;
  const out  = [];
  let from = 0;
  
  for(let safety = 0; safety < 200; safety++) {
    const { data, error } = await sb.from('invoice_items')
      .select('*')
      .range(from, from + PAGE - 1);
      
    if(error) { 
      console.error('[fetchAllInvoiceItems]', error); 
      throw new Error(error.message || 'Database error'); 
    }
    if(!data || !data.length) break;
    
    out.push(...data);
    if(data.length < PAGE) break;
    from += data.length;
  }
  return out;
}
async function syncDB() {
  window.DB_SYNCING = true;

  const build = {
    customers:              () => sb.from('customers').select('*').order('created_at', { ascending: false }),
    doctors:                () => sb.from('doctors').select('*').order('name'),
    suppliers:              () => sb.from('suppliers').select('*').order('name'),
    products:               () => sb.from('products').select('*').order('name'),
    product_batches:        () => sb.from('product_batches').select('*').order('expiry_date'),
    invoices:               () => sb.from('invoices').select('*').order('invoice_date', { ascending: false }),
    payments:               () => sb.from('payments').select('*').order('payment_date', { ascending: false }),
    supplier_invoices:      () => sb.from('supplier_invoices').select('*').order('bill_date', { ascending: false }),
    supplier_invoice_items: () => sb.from('supplier_invoice_items').select('*'),
    supplier_payments:      () => sb.from('supplier_payments').select('*').order('payment_date', { ascending: false }),
    returns:                () => sb.from('returns').select('*').order('return_date', { ascending: false }),
    expenses:               () => sb.from('expenses').select('*').order('expense_date', { ascending: false })
  };

  async function fetchOne(name) {
    const res = await build[name]();
    if(res.error) throw new Error(name + ' - ' + res.error.message);
    return res.data || [];
  }

  const names  = Object.keys(build);
  const errors = [];

  /* Pass 1: Parallel fetch */
  let results = await Promise.allSettled(names.map(fetchOne));
  let failed  = names.filter((_, i) => results[i].status === 'rejected');

  /* Pass 2: Retry failures once (600ms backoff) */
  if(failed.length) {
    console.warn('[syncDB] retrying:', failed);
    await new Promise(r => setTimeout(r, 600));
    const retries = await Promise.allSettled(failed.map(fetchOne));
    retries.forEach((r, i) => {
      const idx = names.indexOf(failed[i]);
      results[idx] = r;
    });
    failed = names.filter((_, i) => results[i].status === 'rejected');
  }

  /* Apply results */
  results.forEach((r, i) => {
    const name = names[i];
    if(r.status === 'fulfilled') {
      DB[name] = r.value;
    } else {
      errors.push(r.reason.message || String(r.reason));
    }
  });

  /* Paginated Invoice Items */
  try {
    DB.invoice_items = await fetchAllInvoiceItems();
  } catch(e) {
    errors.push('invoice_items - ' + (e.message || e));
  }

  /* Settings (single row id=1) */
  try {
    const sett = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if(sett.error) throw sett.error;

    if(sett.data) {
      const d = sett.data;
      SETTINGS = {
        shop_name:         d.shop_name         || 'MediStore',
        owner_name:        d.owner_name        || 'Owner',
        address:           d.address           || '',
        city:              d.city              || '',
        license:           d.license           || '',
        dl_number:         d.dl_number         || '',
        upi:               d.upi               || '',
        phone:             d.phone             || '',
        email:             d.email             || '',
        logo:              d.logo              || '',
        gst_enabled:       !!d.gst_enabled,
        gst_number:        d.gst_number        || '',
        gst_rate:          Number(d.gst_rate)   || 12,
        near_expiry_days:  Number(d.near_expiry_days) || 60,
        enable_non_batch:  !!d.enable_non_batch,
        print_footer:      d.print_footer      || 'Thank you! Get well soon',
        loaded:            true
      };
      DB.settings = d;
    } else {
      SETTINGS.loaded = true; // No settings row yet, use defaults
    }
    applyFavicon();
  } catch(e) {
    errors.push('settings - ' + (e.message || e));
    SETTINGS.loaded = true;
  }

  window.DB_SYNCED      = errors.length === 0;
  window.DB_SYNC_ERRORS = errors;
  window.DB_SYNCING     = false;

    if(errors.length) {
    console.error('🚨 SYNC ERROR:', errors);
    if(!window.__hasShownSyncError) {
      toast('Data sync failed: ' + (errors[0] || 'Unknown error'), 'error');
      window.__hasShownSyncError = true;
    }
  } else {
    window.__hasShownSyncError = false;
  }

  return { ok: errors.length === 0, errors };
}

/* ─────────────────────────────────────────────
   12. SAVE SETTINGS
   ───────────────────────────────────────────── */
async function saveSettings() {
  const payload = {
    id:                1,
    shop_name:         SETTINGS.shop_name         || 'MediStore',
    owner_name:        SETTINGS.owner_name        || 'Owner',
    address:           SETTINGS.address           || '',
    city:              SETTINGS.city              || '',
    license:           SETTINGS.license           || '',
    dl_number:         SETTINGS.dl_number         || '',
    upi:               SETTINGS.upi               || '',
    phone:             SETTINGS.phone             || '',
    email:             SETTINGS.email             || '',
    logo:              SETTINGS.logo              || '',
    gst_enabled:       !!SETTINGS.gst_enabled,
    gst_number:        SETTINGS.gst_number        || '',
    gst_rate:          Number(SETTINGS.gst_rate)  || 12,
    near_expiry_days:  Number(SETTINGS.near_expiry_days) || 60,
    enable_non_batch:  !!SETTINGS.enable_non_batch,
    print_footer:      SETTINGS.print_footer      || 'Thank you! Get well soon',
    updated_at:        new Date().toISOString()
  };

  const { error } = await sb.from('settings').upsert(payload, { onConflict: 'id' });
  
  if(error) {
    console.error('[saveSettings]', error);
    toast('Failed to save settings. Please try again.', 'error');
    return false;
  }
  
  DB.settings = payload;
  return true;
}

/* ─────────────────────────────────────────────
   13. AUTHENTICATION
   ───────────────────────────────────────────── */
async function initAuth() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    SESSION = session || null;
    
    sb.auth.onAuthStateChange((_e, s) => {
      SESSION = s || null;
    });
  } catch(e) {
    console.warn('[auth] init failed:', e);
    SESSION = null;
  }
}

async function login(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error) throw error;
  
  const { data: { session } } = await sb.auth.getSession();
  SESSION = session || null;
}

async function logout() {
  try { 
    await sb.auth.signOut(); 
  } catch(e) {
    console.error('[auth] signout error', e);
  }
  
  SESSION = null;
  window.DB_SYNCED = false;
  location.hash = '#/';
  route();
}

/* ─────────────────────────────────────────────
   14. SUBSCRIPTION (Safe Load)
   ───────────────────────────────────────────── */
async function loadSubscription() {
  try {
    if(typeof sb === 'undefined') throw new Error('Supabase not available');

    const { data, error } = await sb.from('subscriptions').select('*').eq('id', 1).maybeSingle();
    if(error) throw error;

    if(!data) {
      // Auto-create a 1-year trial on first login
      const now = new Date();
      const nextYear = new Date(now);
      nextYear.setFullYear(nextYear.getFullYear() + 1);

      const { data: created, error: createErr } = await sb.from('subscriptions').insert({
        id: 1,
        active: true,
        started_at: now.toISOString(),
        expires_at: nextYear.toISOString(),
        last_paid_at: now.toISOString(),
        amount: SUB_PLAN_AMOUNT,
        notes: 'Auto-created on first login'
      }).select().single();

      if(createErr) throw createErr;

      window.SUB = {
        loaded: true,
        active: true,
        expires_at: created.expires_at,
        last_paid_at: created.last_paid_at
      };
    } else {
      window.SUB = {
        loaded: true,
        active: !!data.active,
        expires_at: data.expires_at,
        last_paid_at: data.last_paid_at
      };
    }

    // Cache valid subscription locally to prevent fail-open on network drops
    localStorage.setItem('sub_cache_expiry', window.SUB.expires_at);
    
  } catch(err) {
    console.error('[SUB] load failed:', err);
    
    // FAIL-SAFE: Check local cache if network fails
    const cachedExpiry = localStorage.getItem('sub_cache_expiry');
    if(cachedExpiry && new Date(cachedExpiry).getTime() > Date.now()) {
      window.SUB = {
        loaded: true,
        active: true,
        expires_at: cachedExpiry,
        last_paid_at: null
      };
      toast('Offline mode: using cached subscription', 'info');
    } else {
      window.SUB = {
        loaded: true,
        active: false,
        expires_at: null,
        last_paid_at: null
      };
      toast('Subscription verification failed. Please connect to the internet.', 'error');
    }
  }
}

console.log('[MediStore] Core Logic Block 2 loaded');
/* ─────────────────────────────────────────────
   15. BATCH / EXPIRY CORE (FEFO LOGIC)
   ───────────────────────────────────────────── */

/* Days left until expiry (negative = already expired) */
function daysToExpiry(expiryDate) {
  if(!expiryDate) return Infinity;
  const exp = new Date(String(expiryDate).slice(0, 10));
  if(isNaN(exp.getTime())) return Infinity;
  const today = new Date(todayStr());
  return Math.ceil((exp.getTime() - today.getTime()) / 86400000);
}

/* Expiry status object */
function expiryInfo(expiryDate) {
  if(!expiryDate) return { days: Infinity, status: 'none', label: '—', cls: 'chip-neutral' };
  
  const days = daysToExpiry(expiryDate);
  if(days < 0)  return { days, status: 'expired', label: 'EXPIRED', cls: 'chip-danger' };
  if(days <= SETTINGS.near_expiry_days) 
    return { days, status: 'near', label: days + 'd left', cls: 'chip-warning' };
    
  return { days, status: 'ok', label: days + 'd', cls: 'chip-success' };
}

/* All batches of a product */
function batchesOf(productId) {
  return DB.product_batches.filter(b => b.product_id === productId);
}

/* ONLY sellable batches — non-expired + qty > 0, sorted FEFO */
function sellableBatches(productId) {
  const today = todayStr();
  return DB.product_batches
    .filter(b =>
      b.product_id === productId &&
      Number(b.qty) > 0 &&
      b.expiry_date &&
      b.expiry_date >= today // expiry >= today -> still valid
    )
    .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
}

/* FEFO pick — first non-expired batch with qty */
function fefoBatch(productId) {
  const list = sellableBatches(productId);
  return list.length ? list[0] : null;
}

/* Total live stock of a product */
function productTotalStock(product) {
  if(!product) return 0;
  if(product.batch_managed === false) {
    return Number(product.stock) || 0;
  }
  const today = todayStr();
  return DB.product_batches
    .filter(b =>
      b.product_id === product.id &&
      Number(b.qty) > 0 &&
      b.expiry_date &&
      b.expiry_date >= today
    )
    .reduce((s, b) => s + Number(b.qty || 0), 0);
}

/* Total expired stock of a product (for alerts) */
function expiredStockOf(productId) {
  const today = todayStr();
  return DB.product_batches
    .filter(b =>
      b.product_id === productId &&
      Number(b.qty) > 0 &&
      b.expiry_date &&
      b.expiry_date < today
    )
    .reduce((s, b) => s + Number(b.qty || 0), 0);
}

/* Count batches expiring within N days (default = setting) */
function nearExpiryBatches() {
  const today = todayStr();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + (Number(SETTINGS.near_expiry_days) || 60));
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  
  return DB.product_batches.filter(b =>
    Number(b.qty) > 0 &&
    b.expiry_date &&
    b.expiry_date >= today &&
    b.expiry_date <= cutoffStr
  );
}

/* ─────────────────────────────────────────────
   16. STOCK ADJUSTMENTS (ATOMIC)
   ───────────────────────────────────────────── */
async function adjustBatchQty(batchId, delta) {
  if(!batchId) return false;
  const { data: fresh, error: fe } = await sb
    .from('product_batches')
    .select('qty')
    .eq('id', batchId)
    .single();
    
  if(fe || !fresh) return false;

  const newQty = Number(fresh.qty || 0) + Number(delta || 0);
  if(newQty < 0) {
    console.warn('[stock] batch would go negative:', batchId, fresh.qty, delta);
    return false;
  }

  const { error } = await sb
    .from('product_batches')
    .update({ qty: newQty })
    .eq('id', batchId);
    
  return !error;
}

async function adjustProductStock(productId, delta) {
  if(!productId) return false;
  const { data: fresh, error: fe } = await sb
    .from('products')
    .select('stock')
    .eq('id', productId)
    .single();
    
  if(fe || !fresh) return false;

  const newStock = Number(fresh.stock || 0) + Number(delta || 0);
  if(newStock < 0) {
    console.warn('[stock] product stock would go negative:', productId, fresh.stock, delta);
    return false;
  }

  const { error } = await sb
    .from('products')
    .update({ stock: newStock })
    .eq('id', productId);
    
  return !error;
}

/* Master stock adjuster — routes to batch or product */
async function adjustStock(productId, batchId, delta) {
  const p = DB.products.find(x => x.id === productId);
  if(!p) return false;
  
  if(p.batch_managed === false) {
    return adjustProductStock(productId, delta);
  }
  return adjustBatchQty(batchId, delta);
}

/* Check stock availability for invoice lines */
function checkStock(lines) {
  const grouped = {};
  for(const l of lines) {
    const key = (l.batch_id || '') + '|' + l.product_id;
    grouped[key] = grouped[key] || { product_id: l.product_id, batch_id: l.batch_id, qty: 0 };
    grouped[key].qty += Number(l.qty || 0);
  }

  for(const key in grouped) {
    const g = grouped[key];
    const p = DB.products.find(x => x.id === g.product_id);
    if(!p) continue;

    if(p.batch_managed === false) {
      const have = Number(p.stock || 0);
      if(have < g.qty) {
        return { ok: false, productName: p.name, need: g.qty, available: have, unit: p.unit };
      }
    } else {
      const b = DB.product_batches.find(x => x.id === g.batch_id);
      if(!b) {
        return { ok: false, productName: p.name, need: g.qty, available: 0, unit: p.unit };
      }
      if(b.expiry_date && b.expiry_date < todayStr()) {
        return { ok: false, productName: p.name, need: g.qty, available: 0, unit: p.unit, reason: 'expired' };
      }
      const have = Number(b.qty || 0);
      if(have < g.qty) {
        return { ok: false, productName: p.name, need: g.qty, available: have, unit: p.unit, batch_no: b.batch_no };
      }
    }
  }
  return { ok: true };
}

/* ─────────────────────────────────────────────
   17. DISPLAY HELPERS & BADGES
   ───────────────────────────────────────────── */
function productDisplay(p) {
  if(!p) return { primary: '—', secondary: '', stockLabel: '—', fullText: '—', subline: '' };
  const total = productTotalStock(p);
  const unit  = p.unit || '';
  const stockLabel = fmtNum(total) + ' ' + unit;
  
  return {
    primary:   stockLabel,
    secondary: '',
    stockLabel,
    fullText:  stockLabel,
    subline:   p.batch_managed === false ? ('Cost ₹' + fmtNum(p.cost || 0) + '/' + unit) : ''
  };
}

function isOutOfStock(p) {
  if(!p) return true;
  return productTotalStock(p) <= 0;
}

function isLowStock(p) {
  if(!p) return false;
  const total = productTotalStock(p);
  return total > 0 && total <= Number(p.low_stock_alert || 0);
}

function stockBadge(p) {
  if(p.batch_managed === false) {
    if(isOutOfStock(p)) return '<span class="chip chip-neutral">OUT</span>';
    if(isLowStock(p))   return '<span class="chip chip-danger">LOW</span>';
    return '<span class="chip chip-success">OK</span>';
  }
  const expired = expiredStockOf(p.id);
  if(expired > 0) return '<span class="chip chip-danger">EXPIRED</span>';
  if(isOutOfStock(p)) return '<span class="chip chip-neutral">OUT</span>';
  if(isLowStock(p))   return '<span class="chip chip-danger">LOW</span>';
  return '<span class="chip chip-success">OK</span>';
}

function productLineLabel(line) {
  const name = line.product_name || '';
  const b    = line.batch_no ? ' · B:' + line.batch_no : '';
  const e    = line.expiry_date ? ' · Exp:' + fmtExpiryShort(line.expiry_date) : '';
  return name + b + e;
}

/* Returns safe HTML for an expiry badge */
function renderExpiryBadge(expiryDate) {
  const info = expiryInfo(expiryDate);
  if(info.status === 'none') return '';
  return `<span class="chip ${info.cls}" style="font-size:10px;padding:2px 6px;">${esc(info.label)}</span>`;
}

/* ─────────────────────────────────────────────
   18. FINANCIAL STATS (Customers & Suppliers)
   ───────────────────────────────────────────── */
function customerStats(customerId) {
  if(!customerId) return { total_bought: 0, total_paid: 0, due: 0 };

  const invs = DB.invoices.filter(i => i.customer_id === customerId);
  const pays = DB.payments.filter(p => p.customer_id === customerId);

  const total_bought = invs.reduce((s, i) => s + Number(i.total || 0), 0);
  const invPaid      = invs.reduce((s, i) => s + Number(i.paid  || 0), 0);
  const extraPaid    = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total_paid   = invPaid + extraPaid;
  const due          = Math.max(0, total_bought - total_paid);

  return { total_bought, total_paid, due };
}

function computeRating(stats) {
  if(!stats || !stats.total_bought || Number(stats.total_bought) === 0) return 5;
  const ratio = Number(stats.total_paid) / Number(stats.total_bought);
  let score = ratio * 5;
  if(Number(stats.due) > 0) {
    const d = Number(stats.due) / Number(stats.total_bought);
    if(d > 0.5) score -= 1.5;
    else if(d > 0.25) score -= 0.8;
  }
  return Math.max(1, Math.min(5, Math.round(score * 10) / 10));
}

function supplierTotals(sid) {
  const sup    = DB.suppliers.find(s => s.id === sid);
  const bills  = DB.supplier_invoices.filter(b => b.supplier_id === sid);
  const pays   = DB.supplier_payments.filter(p => p.supplier_id === sid);

  const total_purchase = bills.reduce((s, b) => s + Number(b.total || 0), 0);
  const bill_paid      = bills.reduce((s, b) => s + Number(b.paid  || 0), 0);
  const extra_paid     = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total_paid     = bill_paid + extra_paid;
  const opening        = Number(sup?.opening_balance || 0);
  const total_due      = Math.max(0, opening + total_purchase - total_paid);

  return { total_purchase, total_paid, total_due, bill_paid, extra_paid, opening };
}

/* ─────────────────────────────────────────────
   19. GLOBAL CALCULATORS & UTILS
   ───────────────────────────────────────────── */
function waLink(phone, text) {
  const clean = String(phone || '').replace(/\D/g, '');
  if(!clean) return '#';
  const withCC = clean.length === 10 ? '91' + clean : clean;
  return 'https://wa.me/' + withCC + '?text=' + encodeURIComponent(text || '');
}

function totalStockValue() {
  let total = 0;
  for(const p of DB.products) {
    if(p.batch_managed === false) {
      total += (Number(p.stock) || 0) * (Number(p.cost) || 0);
    } else {
      const today = todayStr();
      for(const b of DB.product_batches) {
        if(b.product_id !== p.id) continue;
        if(!b.expiry_date || b.expiry_date < today) continue;
        if(Number(b.qty) <= 0) continue;
        total += Number(b.qty) * Number(b.cost || 0);
      }
    }
  }
  return total;
}

function totalCustomerDue() {
  let total = 0;
  for(const c of DB.customers) {
    total += customerStats(c.id).due;
  }
  return total;
}

function totalSupplierDue() {
  let total = 0;
  for(const s of DB.suppliers) {
    total += supplierTotals(s.id).total_due;
  }
  return total;
}

console.log('[MediStore] Core Logic Block 3 loaded');
/* ─────────────────────────────────────────────
   20. MODAL SYSTEM
   ───────────────────────────────────────────── */
function openModal(html, onMount) {
  const root = $('#modal-root');
  if(!root) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'modal-overlay';
  wrapper.innerHTML = `<div class="modal">${html}</div>`;
  
  // Close on backdrop click
  wrapper.addEventListener('click', (e) => {
    if(e.target === wrapper) closeModal(wrapper);
  });

  root.appendChild(wrapper);
  
  // Lock body scroll
  document.body.style.overflow = 'hidden';

  if(onMount) onMount(wrapper);
  return wrapper;
}

function closeModal(el) {
  const root = $('#modal-root');
  if(!root) return;
  
  if(el && el.parentNode === root) {
    root.removeChild(el);
  } else {
    const last = root.lastElementChild;
    if(last) root.removeChild(last);
  }

  // Restore body scroll if no more modals
  if(root.children.length === 0) {
    document.body.style.overflow = '';
  }
}

function confirmDlg(msg, title) {
  return confirm((title ? title + '\n\n' : '') + msg);
}

/* ─────────────────────────────────────────────
   21. REUSABLE DATE / TIME FIELDS
   ───────────────────────────────────────────── */
function dateTimeFieldHTML(dateVal, timeVal, label) {
  const today = todayStr();
  return `<div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
    <div>
      <label class="label">${esc(label || 'Date')} *</label>
      <input class="input" type="date" name="tx_date" required max="${today}" value="${esc(dateVal || today)}">
    </div>
    <div>
      <label class="label">Time (optional)</label>
      <input class="input" type="time" name="tx_time" value="${esc(timeVal || '')}">
    </div>
  </div>`;
}

function readDateTime(form) {
  const dEl = form.querySelector('input[name="tx_date"]');
  const tEl = form.querySelector('input[name="tx_time"]');
  const d   = dEl ? dEl.value : '';
  const tm  = (tEl && tEl.value ? tEl.value : '').trim();
  
  if(!d) { 
    toast('Please pick a date', 'error'); 
    return null; 
  }
  if(isFuture(d)) { 
    toast('Future dates are not allowed', 'error'); 
    return null; 
  }
  return { date: d, time: tm };
}

/* ─────────────────────────────────────────────
   22. SEARCH SELECT (CUSTOM DROPDOWN)
   ───────────────────────────────────────────── */
function searchSelectHTML(id, placeholder) {
  return `<div class="search-select" id="${id}">
    <input type="text" class="input ss-input" placeholder="${esc(placeholder || 'Search...')}" autocomplete="off">
    <button type="button" class="ss-clear" style="display:none">×</button>
    <div class="ss-dropdown"></div>
    <input type="hidden" class="ss-value" value="">
  </div>`;
}

function mountSearchSelect(rootEl, opts) {
  if(!rootEl) return null;
  if(rootEl.__ssMounted) return rootEl;
  rootEl.__ssMounted = true;

  opts = opts || {};

  const input      = rootEl.querySelector('.ss-input');
  const dropdown   = rootEl.querySelector('.ss-dropdown');
  const clearBtn   = rootEl.querySelector('.ss-clear');
  const hidden     = rootEl.querySelector('.ss-value');

  let items     = Array.isArray(opts.items) ? opts.items.slice() : [];
  let filtered  = [];
  let activeIdx = -1;

  function render(query) {
    const q = String(query || '').toLowerCase().trim();
    filtered = items.filter(it => {
      if(!it) return false;
      if(!q) return true;
      const hay = (it.searchText || (it.label + ' ' + (it.sublabel || ''))).toLowerCase();
      return hay.includes(q);
    });

    let html = '';
    if(!filtered.length) {
      html = '<div class="ss-empty">No matches found</div>';
    } else {
      html = filtered.map((it, i) => {
        const cls = 'ss-item' + (i === activeIdx ? ' active' : '') + (it.disabled ? ' disabled' : '');
        const style = it.disabled ? ' style="opacity:.5;cursor:not-allowed"' : '';
        return `<div class="${cls}" data-idx="${i}"${style}>
          <div style="flex:1;min-width:0;overflow:hidden">
            <div class="ss-name">${esc(it.label || '')}</div>
            ${it.sublabel ? `<div class="ss-sub">${esc(it.sublabel)}</div>` : ''}
          </div>
          <div class="ss-meta">
            ${it.dueText  ? `<div style="color:var(--danger)">${esc(it.dueText)}</div>` : ''}
            ${it.metaText ? `<div>${esc(it.metaText)}</div>` : ''}
          </div>
        </div>`;
      }).join('');
    }

    if(opts.allowAdd) {
      html += `<div class="ss-add">+ ${esc(opts.addLabel || 'Add new')}</div>`;
    }

    dropdown.innerHTML = html;
    dropdown.classList.add('open');

    // Use event delegation for dropdown items to avoid multiple listeners
    dropdown.querySelectorAll('.ss-item').forEach(el => {
      el.onclick = () => {
        const idx = parseInt(el.dataset.idx, 10);
        if(!isNaN(idx)) pick(idx);
      };
    });

    const addEl = dropdown.querySelector('.ss-add');
    if(addEl) {
      addEl.onclick = () => {
        dropdown.classList.remove('open');
        if(typeof opts.onAdd === 'function') opts.onAdd();
      };
    }
  }

  function pick(i) {
    const it = filtered[i];
    if(!it || it.disabled) return;

    hidden.value = it.id;
    input.value  = it.label + (it.sublabel ? ' — ' + it.sublabel : '');
    dropdown.classList.remove('open');
    clearBtn.style.display = 'flex';

    if(typeof opts.onSelect === 'function') opts.onSelect(it);
  }

  function clear() {
    hidden.value = '';
    input.value  = '';
    activeIdx    = -1;
    clearBtn.style.display = 'none';
    dropdown.classList.remove('open');
    if(typeof opts.onSelect === 'function') opts.onSelect(null);
  }

  input.addEventListener('focus', () => {
    const base = input.value.replace(/ — .*$/, '').trim();
    render(base);
  });

  input.addEventListener('input', () => {
    activeIdx    = -1;
    hidden.value = '';
    clearBtn.style.display = input.value ? 'flex' : 'none';
    render(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if(!dropdown.classList.contains('open')) return;
    if(e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, filtered.length - 1);
      render(input.value);
    } else if(e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      render(input.value);
    } else if(e.key === 'Enter') {
      e.preventDefault();
      if(activeIdx >= 0) pick(activeIdx);
    } else if(e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clear();
    input.focus();
  });

  // Close on outside click
  const outsideClickHandler = (e) => {
    if(!rootEl.contains(e.target)) dropdown.classList.remove('open');
  };
  document.addEventListener('click', outsideClickHandler);

  // Public API
  rootEl.getValue = () => hidden.value;
  rootEl.setItems = (list) => {
    items = Array.isArray(list) ? list.slice() : [];
    if(hidden.value && !items.find(x => x.id === hidden.value)) clear();
  };
  rootEl.setValue = (id) => {
    if(!id) { clear(); return; }
    const it = items.find(x => x.id === id);
    if(it) {
      hidden.value = id;
      input.value  = it.label + (it.sublabel ? ' — ' + it.sublabel : '');
      clearBtn.style.display = 'flex';
    } else {
      clear();
    }
  };
  rootEl.reset = clear;

  return rootEl;
}

/* ─────────────────────────────────────────────
   23. OPTION BUILDERS (FOR SEARCH SELECT)
   ───────────────────────────────────────────── */
function customerToOption(c) {
  const st = customerStats(c.id);
  return {
    id:         c.id,
    label:      c.name,
    sublabel:   c.phone || '',
    searchText: ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.address || '')).toLowerCase(),
    dueText:    st.due > 0 ? 'Due ' + rs(st.due) : '',
    metaText:   ''
  };
}

function supplierToOption(s) {
  const tt = supplierTotals(s.id);
  return {
    id:         s.id,
    label:      s.name,
    sublabel:   s.shop_name || s.phone || '',
    searchText: ((s.name || '') + ' ' + (s.shop_name || '') + ' ' + (s.phone || '')).toLowerCase(),
    dueText:    tt.total_due > 0 ? 'Payable ' + rs(tt.total_due) : '',
    metaText:   ''
  };
}

function productToOption(p) {
  const stock = productTotalStock(p);
  let sub = '';
  if(p.batch_managed === false) {
    sub = 'Stock ' + fmtNum(stock) + ' ' + (p.unit || '');
  } else {
    const sellable = sellableBatches(p.id).length;
    sub = sellable + ' batch' + (sellable === 1 ? '' : 'es') + ' · Total ' + fmtNum(stock) + ' ' + (p.unit || '');
  }

  let dueText = '';
  if(stock <= 0) dueText = 'OUT';
  else if(isLowStock(p)) dueText = 'LOW';

  return {
    id:         p.id,
    label:      p.name,
    sublabel:   sub,
    searchText: ((p.name || '') + ' ' + (p.company || '') + ' ' + (p.category || '')).toLowerCase(),
    dueText,
    metaText:   ''
  };
}

function invoiceToOption(inv) {
  const cust = DB.customers.find(x => x.id === inv.customer_id);
  const name = inv.customer_name || (cust && cust.name) || '—';
  return {
    id:         inv.id,
    label:      (inv.invoice_no || '') + ' — ' + name,
    sublabel:   txDT(inv, 'invoice_date') + '   ' + rs(inv.total) + (Number(inv.due) > 0 ? '   Due ' + rs(inv.due) : ''),
    searchText: ((inv.invoice_no || '') + ' ' + name + ' ' + (inv.customer_phone || '')).toLowerCase(),
    dueText:    Number(inv.due) > 0 ? 'Due ' + rs(inv.due) : '',
    metaText:   ''
  };
}

/* ─────────────────────────────────────────────
   24. BATCH PICKER MODAL
   ───────────────────────────────────────────── */
function openBatchPicker(productId, currentBatchId, onPick) {
  const product = DB.products.find(p => p.id === productId);
  if(!product) {
    toast('Product not found', 'error');
    if(typeof onPick === 'function') onPick(null);
    return;
  }

  const all = batchesOf(productId)
    .slice()
    .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));

  const today = todayStr();
  const nearCutoff = (() => {
    const c = new Date();
    c.setDate(c.getDate() + (Number(SETTINGS.near_expiry_days) || 60));
    return c.toISOString().slice(0, 10);
  })();

  let bodyHTML = '';
  if(!all.length) {
    bodyHTML = '<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No batches yet</div><div class="empty-desc">Add a purchase bill to create batches for this product.</div></div>';
  } else {
    bodyHTML = all.map(b => {
      const isExpired = b.expiry_date && b.expiry_date < today;
      const isOut     = Number(b.qty) <= 0;
      const isNear    = !isExpired && b.expiry_date && b.expiry_date <= nearCutoff;
      const disabled  = isExpired || isOut;
      const isCurrent = b.id === currentBatchId;

      const expChip = isExpired
        ? '<span class="chip chip-danger">EXPIRED</span>'
        : (isNear ? `<span class="chip chip-warning">${esc(expiryInfo(b.expiry_date).label)}</span>`
                  : `<span class="chip chip-success">${esc(fmtExpiryShort(b.expiry_date))}</span>`);

      return `<div class="panel-list-item ${disabled ? 'disabled' : ''} ${isCurrent ? 'active' : ''}" data-bid="${b.id}" ${disabled ? 'data-disabled="1" style="opacity:.5;cursor:not-allowed"' : ''}>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="chip chip-neutral" style="font-family:monospace"><b>${esc(b.batch_no || '—')}</b></span>
            ${expChip}
          </div>
          <div class="text-xs text-muted" style="margin-top:5px">
            Qty: <b style="color:var(--text-main)">${fmtNum(b.qty)} ${esc(product.unit || '')}</b>
            · Cost ${rs(b.cost)}
            · MRP ${rs(b.mrp)}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${isCurrent ? '<span class="chip chip-primary">Current</span>' : ''}
          ${disabled ? '' : '<div class="text-xs text-muted">Tap →</div>'}
        </div>
      </div>`;
    }).join('');
  }

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">${esc(product.name)}</div>
        <div class="text-xs text-muted" style="margin-top:2px">Pick a batch · FEFO (earliest expiry) shown first</div>
      </div>
      <button class="modal-close" id="bp-close">✕</button>
    </div>
    
    <div class="modal-body">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
        <span class="chip chip-success">● ${sellableBatches(productId).length} sellable</span>
        <span class="chip chip-warning">● ${all.filter(b => b.expiry_date && b.expiry_date >= today && b.expiry_date <= nearCutoff && Number(b.qty) > 0).length} near-expiry</span>
        <span class="chip chip-danger">● ${all.filter(b => b.expiry_date && b.expiry_date < today && Number(b.qty) > 0).length} expired</span>
      </div>
      
      <div style="max-height:60vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
        ${bodyHTML}
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" id="bp-cancel">Cancel</button>
    </div>
  `, (root) => {
    root.querySelector('#bp-close').onclick = () => {
      closeModal(root);
      if(typeof onPick === 'function') onPick(null);
    };
    root.querySelector('#bp-cancel').onclick = () => {
      closeModal(root);
      if(typeof onPick === 'function') onPick(null);
    };

    root.querySelectorAll('.panel-list-item').forEach(el => {
      if(el.dataset.disabled === '1') return;
      el.onclick = () => {
        const bid = el.dataset.bid;
        const b   = DB.product_batches.find(x => x.id === bid);
        if(!b) return;
        closeModal(root);
        if(typeof onPick === 'function') onPick(b);
      };
    });
  });
}

console.log('[MediStore] Core Logic Block 4 loaded');
/* ─────────────────────────────────────────────
   25. LOGIN SCREEN (Geometric Split)
   ───────────────────────────────────────────── */
function renderLogin() {
  const app = $('#app');
  if(!app) return;

  app.innerHTML = `
    <style>
      .login-wrapper {
        min-height: 100vh;
        display: flex;
        background-color: #F7F7FB;
        overflow: hidden;
      }
      .login-left {
        flex: 1.2;
        background: linear-gradient(135deg, #5B5BD6 0%, #4F46E5 100%);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        clip-path: polygon(0 0, 100% 0, 80% 100%, 0% 100%);
        z-index: 1;
      }
      .login-right {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 24px;
        background-color: #F7F7FB;
        position: relative;
        z-index: 2;
        margin-left: -5%; /* Pull it slightly over the geometric shape */
      }
      .login-form-container {
        width: 100%;
        max-width: 380px;
      }
      .mobile-brand {
        display: none;
        text-align: center;
        margin-bottom: 32px;
      }
      
      /* Mobile & Tablet */
      @media (max-width: 900px) {
        .login-left { display: none; }
        .login-right { 
          margin-left: 0; 
          flex: 1; 
          background-color: #F7F7FB;
        }
        .mobile-brand { display: block; }
      }
    </style>

    <div class="login-wrapper">
      
      <!-- LEFT: Geometric Shape & Branding -->
      <div class="login-left">
        <div style="position:absolute; inset:0; background-image: radial-gradient(circle at 20% 30%, rgba(255,255,255,0.1) 0%, transparent 40%); pointer-events:none;"></div>
        
        <div style="position:relative; z-index:10; padding: 0 60px; max-width: 520px;">
          <div style="width:56px; height:56px; background:rgba(255,255,255,0.2); border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:28px; margin-bottom:24px; backdrop-filter:blur(10px);">
            💊
          </div>
          <h1 style="font-size:36px; font-weight:800; color:#fff; line-height:1.2; margin-bottom:16px; letter-spacing:-0.5px;">
            Manage your pharmacy with precision.
          </h1>
          <p style="font-size:16px; color:rgba(255,255,255,0.8); line-height:1.6;">
            The fastest way to handle billing, inventory, and prescriptions in one sleek, distraction-free dashboard.
          </p>
        </div>
      </div>

      <!-- RIGHT: Clean Form -->
      <div class="login-right">
        <form id="login-form" class="login-form-container">
          
          <!-- Mobile Brand (Hidden on Desktop) -->
          <div class="mobile-brand">
            <div style="width:56px; height:56px; background:#5B5BD6; color:#fff; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:28px; margin:0 auto 16px; box-shadow:0 8px 20px rgba(91,91,214,0.3);">
              💊
            </div>
            <h1 style="font-size:24px; font-weight:800; color:#111827;">MediStore</h1>
          </div>

          <h2 style="font-size:26px; font-weight:800; color:#111827; margin-bottom:8px; letter-spacing:-0.5px;">Welcome back</h2>
          <p style="color:#6B7280; font-size:14px; margin-bottom:32px;">Sign in to your account to continue.</p>

          <div style="display:flex; flex-direction:column; gap:20px;">
            <div>
              <label class="label" style="color:#374151;">Email Address</label>
              <input class="input" type="email" id="l-email" required autocomplete="username" placeholder="owner@medistore.com" style="background:#fff; border-color:#D1D5DB; height:44px;">
            </div>
            <div>
              <label class="label" style="color:#374151;">Password</label>
              <input class="input" type="password" id="l-pwd" required autocomplete="current-password" placeholder="••••••••" style="background:#fff; border-color:#D1D5DB; height:44px;">
            </div>
            
            <div id="l-err" class="field-error" style="display:none; text-align:center; background:#FEF2F2; padding:10px; border-radius:8px; border:1px solid #FECACA; color:#DC2626;"></div>
            
            <button class="btn btn-primary btn-block btn-lg" type="submit" id="l-btn" style="margin-top:8px; font-size:15px; font-weight:700; height:48px; box-shadow:0 4px 14px rgba(91, 91, 214, 0.3);">
              Sign In
            </button>
          </div>

          <p style="text-align:center; font-size:12px; color:#9CA3AF; margin-top:32px;">
            Only the shop owner can sign in
          </p>
        </form>
      </div>

    </div>
  `;

  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = $('#l-err');
    const btn   = $('#l-btn');
    
    errEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = 'Signing in...';

    try {
      await login($('#l-email').value.trim(), $('#l-pwd').value);
      await syncDB();
      await loadSubscription();
      await route();
    } catch(err) {
      errEl.textContent = err.message || 'Login failed. Please check your credentials.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  };
}

/* ─────────────────────────────────────────────
   26. NAVIGATION STRUCTURE
   ───────────────────────────────────────────── */
const NAV_LINKS = [
  { group: 'Main', items: [
    { href: '#/',            icon: '📊', label: 'Dashboard'  },
    { href: '#/analytics',   icon: '📈', label: 'Analytics'  },
    { href: '#/shop-health', icon: '🏥', label: 'Shop Health'}
  ]},
  { group: 'Parties', items: [
    { href: '#/customers', icon: '👥', label: 'Customers' },
    { href: '#/doctors',   icon: '🩺', label: 'Doctors'   },
    { href: '#/companies', icon: '🏢', label: 'Companies' },
    { href: '#/suppliers', icon: '🚚', label: 'Suppliers' }
  ]},
  { group: 'Inventory', items: [
    { href: '#/products',        icon: '💊', label: 'Products'        },
    { href: '#/batches',         icon: '📦', label: 'Batches'         },
    { href: '#/purchases',       icon: '🛒', label: 'Purchases'       },
    { href: '#/inventory-value', icon: '💰', label: 'Inventory Value' },
    { href: '#/stock-audit',     icon: '📋', label: 'Stock Audit'     }
  ]},
  { group: 'Transactions', items: [
    { href: '#/invoices', icon: '📄', label: 'Invoices' },
    { href: '#/returns',  icon: '↩️', label: 'Returns'  },
    { href: '#/expenses', icon: '💸', label: 'Expenses' }
  ]},
  { group: 'Reports', items: [
    { href: '#/pnl',     icon: '💹', label: 'Profit & Loss' },
    { href: '#/reports', icon: '📋', label: 'Reports'       },
    { href: '#/margin',  icon: '📈', label: 'Margin'        }
  ]},
  { group: 'Settings', items: [
    { href: '#/myshop', icon: '⚙️', label: 'My Shop' },
    { href: '#/backup', icon: '💾', label: 'Backup'  }
  ]}
];

const MOBILE_NAV_ITEMS = [
  { href: '#/',          icon: '🏠', label: 'Home'      },
  { href: '#/invoices',  icon: '📄', label: 'Invoices'  },
  { href: '#/products',  icon: '💊', label: 'Products'  },
  { href: '#/customers', icon: '👥', label: 'Customers' },
  { href: '#__menu__',   icon: '☰',  label: 'More'      }
];

function currentPageTitle() {
  const hash = location.hash || '#/';
  
  for(const g of NAV_LINKS) {
    for(const it of g.items) {
      if(it.href === hash) return it.label;
    }
  }

  if(hash.startsWith('#/customer/'))      return 'Customer Profile';
  if(hash.startsWith('#/doctor/'))        return 'Doctor Profile';
  if(hash.startsWith('#/supplier/'))      return 'Supplier Profile';
  if(hash.startsWith('#/company/'))       return 'Company Profile';
  if(hash.startsWith('#/invoice/'))       return 'Invoice';
  if(hash.startsWith('#/new-invoice'))    return 'New Invoice';
  if(hash.startsWith('#/purchase-bill'))  return 'Purchase Bill';

  return 'Dashboard';
}

/* ─────────────────────────────────────────────
   27. APP SHELL & LAYOUT
   ───────────────────────────────────────────── */
function renderLayout() {
  const app  = $('#app');
  if(!app) return;
  const hash = location.hash || '#/';

  const sidebarHTML = NAV_LINKS.map(g => `
    <div class="nav-group">
      <div class="nav-group-title">${esc(g.group)}</div>
      <div style="display:flex;flex-direction:column;">
        ${g.items.map(it => {
          const isActive = hash === it.href || (it.href !== '#/' && hash.startsWith(it.href));
          return `<a href="${esc(it.href)}" class="nav-link ${isActive ? 'active' : ''}">
            <span class="icon">${esc(it.icon)}</span>${esc(it.label)}
          </a>`;
        }).join('')}
      </div>
    </div>
  `).join('');

  const mobileNavHTML = MOBILE_NAV_ITEMS.map(it => {
    const isActive = it.href === '#__menu__' ? '' : (hash === it.href || (it.href !== '#/' && hash.startsWith(it.href)) ? 'active' : '');
    return `<a href="${esc(it.href)}" class="${isActive}" data-mnav="${esc(it.href)}">
      <span class="icon">${esc(it.icon)}</span> ${esc(it.label)}
    </a>`;
  }).join('');

  const currentTheme = localStorage.getItem('theme') || 'light';
  const themeIcon = currentTheme === 'dark' ? '☀️' : '🌙';
  
  // Domain logic for the new card
  const cleanName = (SETTINGS.shop_name || 'myshop').toLowerCase().replace(/[^a-z0-9]/g, '');
  const domainName = cleanName + '.com';

  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar" id="sidebar">
        <div class="brand" style="padding: 24px 16px; border-bottom: none; gap: 12px; overflow: hidden; width: 100%;">
          <div class="brand-logo" style="width: 36px; height: 36px; background: #5B5BD6; color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; font-weight: 700; overflow: hidden;">
            ${logoHtml(24)}
          </div>
          <div class="brand-text" style="font-size: 16px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">
            ${esc(SETTINGS.shop_name || 'ShopSteward.in')}
          </div>
        </div>
        
        <div class="nav-scroll">${sidebarHTML}</div>
        
        <div class="sidebar-footer">
          <!-- Issue 3: Replaced Upgrade Card with Domain Card -->
          <div class="upgrade-card" style="padding: 16px;">
            <h4 style="font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 4px;">🌐 Get your own domain</h4>
            <p style="font-size: 12px; color: #6B7280; margin-bottom: 12px;">Make it official with a custom website address.</p>
            <div style="background: #fff; border: 1px solid #E5E7EB; border-radius: 6px; padding: 8px 12px; font-family: monospace; font-size: 13px; font-weight: 600; color: #5B5BD6; text-align: center; margin-bottom: 12px; user-select: all;">
              ${esc(domainName)}
            </div>
            <button class="upgrade-btn" onclick="openDomainModal('${domainName}')" style="padding: 10px;">Claim Domain</button>
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; padding:0 4px;">
            <button class="btn btn-ghost btn-sm" id="btn-theme" style="padding:0; height:auto;"><span>${themeIcon}</span></button>
            <button class="btn btn-ghost btn-sm" id="btn-logout" style="padding:0; height:auto; color:var(--text-muted); font-size:12px;">Sign Out</button>
          </div>
        </div>
      </aside>

      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>

      <div class="main-wrap">
        <div class="mobile-header">
          <button class="hamburger" id="btn-hamburger">☰</button>
          <div class="mobile-brand">${esc(SETTINGS.shop_name || 'MediStore')}</div>
          <button class="hamburger" id="btn-theme-mobile">${themeIcon}</button>
        </div>

        <header class="topbar" style="display:flex; justify-content:space-between; align-items:center; height:64px; padding-right: 24px;">
          <div style="display:flex; height:100%;">
            <a href="#/" class="topbar-tab ${hash === '#/' ? 'active' : ''}">Overview</a>
            <a href="#/invoices" class="topbar-tab ${hash.startsWith('#/invoices') ? 'active' : ''}">Invoices</a>
            <a href="#/customers" class="topbar-tab ${hash.startsWith('#/customers') ? 'active' : ''}">Customers</a>
            <a href="#/reports" class="topbar-tab ${hash.startsWith('#/reports') ? 'active' : ''}">Reports</a>
            <a href="#/myshop" class="topbar-tab ${hash.startsWith('#/myshop') ? 'active' : ''}">Settings</a>
          </div>

          <div style="display:flex; align-items:center; gap:20px; flex-shrink: 0;">
            <!-- Search Bar -->
            <div class="topbar-search" style="width:240px; position:relative;">
              <input type="text" placeholder="Search anything..." id="topbar-search-input" style="width:100%; height:36px; padding:0 12px 0 36px; border-radius:20px; border:1px solid #E5E7EB; background:#F9FAFB; font-size:12px; outline:none;">
              <span style="position:absolute; left:12px; top:9px; opacity:0.5; font-size:14px;">🔍</span>
            </div>
            
            <!-- Issue 1 & 2: Clickable Profile -->
            <a href="#/myshop" style="display:flex; align-items:center; gap:12px; border-left:1px solid #E5E7EB; padding-left:20px; text-decoration:none; cursor:pointer;">
              <div class="topbar-avatar" style="width:32px; height:32px; font-size:12px; background:#F3F4F6; color:#111827; flex-shrink: 0;">
                ${esc((SETTINGS.owner_name || 'O').charAt(0).toUpperCase())}
              </div>
              <div style="display:flex; flex-direction:column; white-space: nowrap;">
                <div style="font-size:13px; font-weight:600; color:#111827; line-height:1.2;">${esc(SETTINGS.owner_name || 'Owner')}</div>
                <div style="font-size:11px; color:#6B7280; line-height:1.2;">Admin</div>
              </div>
            </a>
          </div>
        </header>

        <main id="content" class="main" style="background:#F7F7FB;"></main>
      </div>
    </div>
    <nav id="mobile-nav">${mobileNavHTML}</nav>
  `;

  // Event Listeners
  const sidebar = $('#sidebar'); const backdrop = $('#sidebar-backdrop');
  const openSidebar = () => { sidebar.classList.add('open'); backdrop.classList.add('show'); };
  const closeSidebar = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };

  $('#btn-hamburger').onclick = openSidebar;
  backdrop.onclick = closeSidebar;
  $$('.sidebar .nav-link').forEach(a => a.onclick = closeSidebar);
  $$('#mobile-nav a').forEach(a => { if(a.dataset.mnav === '#__menu__') { a.onclick = (e) => { e.preventDefault(); openSidebar(); }; } });

  const toggleTheme = () => {
    const html = document.documentElement;
    const next = (html.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    const icon = next === 'dark' ? '☀️' : '🌙';
    if($('#btn-theme')) $('#btn-theme').innerHTML = `<span>${icon}</span>`;
    if($('#btn-theme-mobile')) $('#btn-theme-mobile').textContent = icon;
  };
  $('#btn-theme').onclick = toggleTheme;
  $('#btn-theme-mobile').onclick = toggleTheme;
  $('#btn-logout').onclick = () => { if(confirm('Sign out?')) logout(); };

  // Issue 6: Global Search Implementation
  const searchInput = $('#topbar-search-input');
  if(searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') {
        const q = searchInput.value.trim().toLowerCase();
        if(!q) return;
        
        // Try customer
        const cust = DB.customers.find(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q));
        if(cust) { location.hash = '#/customer/' + cust.id; searchInput.value = ''; return; }
        
        // Try product
        const prod = DB.products.find(p => (p.name || '').toLowerCase().includes(q));
        if(prod) { location.hash = '#/products'; searchInput.value = ''; return; }
        
        // Try invoice
        const inv = DB.invoices.find(i => (i.invoice_no || '').toLowerCase().includes(q));
        if(inv) { location.hash = '#/invoice/' + inv.id; searchInput.value = ''; return; }

        toast('No match for "' + q + '"', 'info');
      }
    });
  }
}


console.log('[MediStore] Core Logic Block 5 loaded');
/* ─────────────────────────────────────────────
   28. DASHBOARD RENDERER (FlowFin Layout)
   ───────────────────────────────────────────── */
function renderDashboard(content) {
  const today = todayStr();
  const todayInv = DB.invoices.filter(i => txDate(i, 'invoice_date') === today && !String(i.invoice_no || '').startsWith(RETURN_PREFIX));
  const todaySales = todayInv.reduce((s, i) => s + Number(i.total || 0), 0);
  
  let custDue = 0, dueCustCount = 0;
  for(const c of DB.customers) {
    const st = customerStats(c.id);
    if(st.due > 0) { custDue += st.due; dueCustCount++; }
  }

  const lowStockCount  = DB.products.filter(p => isLowStock(p) || isOutOfStock(p)).length;
  const nearExpCount   = new Set(nearExpiryBatches().map(b => b.product_id)).size;
  
  const recent = DB.invoices
    .filter(i => !String(i.invoice_no || '').startsWith(RETURN_PREFIX))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 8);

  let selectedInv = recent.length > 0 ? recent[0] : null;

  // Get near expiry batches for the replaced card
  const nearBatches = nearExpiryBatches().slice(0, 5).map(b => {
    const p = DB.products.find(x => x.id === b.product_id);
    return { b, p };
  }).filter(x => x.p);

  content.innerHTML = `
    <!-- PAGE HEAD -->
    <div class="page-head" style="align-items:center; margin-bottom:24px;">
      <div class="page-head-title">
        <h1 style="font-size:24px;">Financial Overview</h1>
        <p style="font-size:13px; color:#6B7280;">Monitor your invoices, payments and revenue all in one place.</p>
      </div>
      <div class="page-head-actions">
        <!-- Issue 2: Working Date Button -->
        <a href="#/reports" class="btn btn-ghost" style="background:#fff; border:1px solid #E5E7EB; font-size:12px; font-weight:600; color:#374151; text-decoration:none;">
          📅 ${fmtDate(todayStr())}
        </a>
      </div>
    </div>

    <!-- KPI ROW -->
    <div class="kpi-row" style="margin-bottom:20px;">
      <!-- Issue 5: Today's Sales Layout -->
      <div class="kpi-featured" style="position:relative; overflow:hidden; border-radius:16px; box-shadow:0 10px 25px -5px rgba(91,91,214,0.4);">
        <div style="position:relative; z-index:2; display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="kpi-icon" style="background:rgba(255,255,255,0.15); border-radius:8px; margin:0; width:32px; height:32px; font-size:16px;">💵</div>
            <div class="kpi-label" style="opacity:0.9; margin:0;">Today's Sales</div>
          </div>
          <div class="kpi-value" style="font-size:32px;">${rs(todaySales)}</div>
        </div>
        <!-- Decorative background chart -->
        <div style="position:absolute; bottom:0; left:0; right:0; height:70px; display:flex; align-items:flex-end; gap:6px; padding:0 20px; opacity:0.15; z-index:1;">
           <div style="flex:1; background:#fff; height:30%; border-radius:2px 2px 0 0;"></div>
           <div style="flex:1; background:#fff; height:50%; border-radius:2px 2px 0 0;"></div>
           <div style="flex:1; background:#fff; height:40%; border-radius:2px 2px 0 0;"></div>
           <div style="flex:1; background:#fff; height:70%; border-radius:2px 2px 0 0;"></div>
           <div style="flex:1; background:#fff; height:50%; border-radius:2px 2px 0 0;"></div>
           <div style="flex:1; background:#fff; height:90%; border-radius:2px 2px 0 0;"></div>
           <div style="flex:1; background:#fff; height:60%; border-radius:2px 2px 0 0;"></div>
        </div>
      </div>

      <!-- Standard KPI 1 -->
      <div class="kpi-card" style="border-radius:16px; border:1px solid #F0F0F5; box-shadow:0 2px 8px rgba(0,0,0,0.02);">
        <div class="kpi-card-top">
          <div class="kpi-label" style="color:#6B7280;">Outstanding Due</div>
          <div class="kpi-icon" style="color:#F59E0B; background:#FEF3C7;">💳</div>
        </div>
        <div>
          <div class="kpi-value" style="font-size:28px;">${rs(custDue)}</div>
          <div class="kpi-trend" style="margin-top:8px;">
            <span style="color:#10B981; font-weight:700;">↑ 8.2%</span> <span style="color:#6B7280; font-size:11px; margin-left:4px;">from last month</span>
          </div>
        </div>
      </div>

      <!-- Standard KPI 2 -->
      <div class="kpi-card" style="border-radius:16px; border:1px solid #F0F0F5; box-shadow:0 2px 8px rgba(0,0,0,0.02);">
        <div class="kpi-card-top">
          <div class="kpi-label" style="color:#6B7280;">Low Stock</div>
          <div class="kpi-icon" style="color:#10B981; background:#D1FAE5;">📦</div>
        </div>
        <div>
          <div class="kpi-value" style="font-size:28px;">${lowStockCount}</div>
          <div class="kpi-trend" style="margin-top:8px;">
            <span style="color:#10B981; font-weight:700;">↓ 3 days</span> <span style="color:#6B7280; font-size:11px; margin-left:4px;">from last month</span>
          </div>
        </div>
      </div>

      <!-- Standard KPI 3 -->
      <div class="kpi-card" style="border-radius:16px; border:1px solid #F0F0F5; box-shadow:0 2px 8px rgba(0,0,0,0.02);">
        <div class="kpi-card-top">
          <div class="kpi-label" style="color:#6B7280;">Near Expiry</div>
          <div class="kpi-icon" style="color:#5B5BD6; background:#EEEEFB;">⏳</div>
        </div>
        <div>
          <div class="kpi-value" style="font-size:28px;">${nearExpCount}</div>
          <div class="kpi-trend" style="margin-top:8px;">
            <span style="color:#10B981; font-weight:700;">↑ 15.4%</span> <span style="color:#6B7280; font-size:11px; margin-left:4px;">from last month</span>
          </div>
        </div>
      </div>
    </div>

       <!-- FILTER BAR -->
    <div class="card" style="display:flex; gap:24px; padding:16px 24px; margin-bottom:20px; border-radius:12px; align-items:center; background:#FFF; border:1px solid #F0F0F5; flex-wrap:wrap;">
      <div style="flex:1; min-width:140px; border-right:1px solid #E5E7EB; padding-right:20px;">
        <label style="font-size:11px; font-weight:600; color:#6B7280; margin-bottom:4px; display:block;">Customers</label>
        <select id="dash-filter-cust" class="input" style="border:none; background:transparent; padding:0; font-size:13px; font-weight:600; color:#111827; outline:none; height:auto; box-shadow:none; width:100%; cursor:pointer;">
          <option value="">All customers</option>
          ${DB.customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1; min-width:140px; border-right:1px solid #E5E7EB; padding-right:20px;">
        <label style="font-size:11px; font-weight:600; color:#6B7280; margin-bottom:4px; display:block;">Payment Status</label>
        <select id="dash-filter-status" class="input" style="border:none; background:transparent; padding:0; font-size:13px; font-weight:600; color:#111827; outline:none; height:auto; box-shadow:none; width:100%; cursor:pointer;">
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending (Due > 0)</option>
        </select>
      </div>
      <div style="flex:1; min-width:140px; border-right:1px solid #E5E7EB; padding-right:20px;">
        <label style="font-size:11px; font-weight:600; color:#6B7280; margin-bottom:4px; display:block;">Date Range</label>
        <select id="dash-filter-date" class="input" style="border:none; background:transparent; padding:0; font-size:13px; font-weight:600; color:#111827; outline:none; height:auto; box-shadow:none; width:100%; cursor:pointer;">
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="month">This Month</option>
        </select>
      </div>
      <div style="flex:1.5; min-width:200px; position:relative;">
        <input id="dash-filter-search" type="text" placeholder="Search invoice, customer, or ID..." style="width:100%; border:none; background:transparent; font-size:13px; color:#111827; outline:none; padding-left:24px;">
        <span style="position:absolute; left:0; top:2px; color:#9CA3AF; font-size:14px;">🔍</span>
      </div>
    </div>

    <!-- DARK PANEL (3 Columns) -->
    <div class="panel-dark" style="border-radius:16px; padding:24px;">
      <div class="panel-dark-header" style="margin-bottom:20px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <h3 style="font-size:16px; font-weight:600;">Invoices</h3>
          <span class="chip" style="background:rgba(255,255,255,0.1); color:#E5E7EB; font-size:10px; padding:2px 8px; border-radius:4px;">${DB.invoices.length} in total</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="location.hash='#/new-invoice'" style="border-radius:6px;">+ Create Invoice</button>
      </div>

      <div class="panel-dark-body" id="dash-panel-body" style="grid-template-columns: 1.2fr 1.5fr 1fr; gap:20px;">
                <!-- LEFT: List -->
        <div class="panel-list" id="dash-list" style="background:transparent;">
           <!-- Dynamically injected via JS -->
        </div>

        <!-- CENTER & RIGHT: Details & Actions (Rendered by JS) -->
        <div id="dash-detail-container" style="display:contents;">
           <!-- Injected via renderDashDetail() -->
        </div>
      </div>
    </div>

    <!-- Issue 8: Replaced Chart with Near Expiry List -->
    <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px;">
      <div class="card" style="border-radius:16px; border:1px solid #F0F0F5; padding:24px;">
        <div class="card-title" style="font-size:15px; margin-bottom:20px;">
          Revenue Analytics <small style="color:#9CA3AF; font-weight:400; font-size:12px;">This year</small>
        </div>
        <div style="position:relative;height:260px;"><canvas id="dash-chart-revenue"></canvas></div>
      </div>
      
      <div class="card" style="border-radius:16px; border:1px solid #F0F0F5; padding:24px;">
        <div class="card-title" style="font-size:15px; margin-bottom:20px;">
          Near Expiry Products <small style="color:#9CA3AF; font-weight:400; font-size:12px;">Next ${SETTINGS.near_expiry_days} days</small>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          ${nearBatches.length === 0 
            ? '<div class="empty-state" style="padding:40px 10px;"><div class="empty-icon">✅</div><div class="empty-title">All clear</div><div class="empty-desc">No products near expiry.</div></div>'
            : nearBatches.map(({b, p}) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; border-bottom:1px dashed #E5E7EB;">
                  <div>
                    <div style="font-weight:600; font-size:13px; color:#111827;">${esc(p.name)}</div>
                    <div class="text-xs text-muted" style="margin-top:2px;">Batch: ${esc(b.batch_no || '—')} · Qty: ${fmtNum(b.qty)}</div>
                  </div>
                  <div style="text-align:right;">
                    <div class="exp-badge exp-near" style="margin-bottom:4px; display:inline-flex;">${fmtExpiryShort(b.expiry_date)}</div>
                    <div class="text-xs text-muted">${esc(p.unit || '')}</div>
                  </div>
                </div>
              `).join('')
          }
        </div>
      </div>
    </div>
  `;

  // ── RENDER DETAIL PANEL FUNCTION ──
  const renderDashDetail = (inv) => {
    const container = $('#dash-detail-container');
    if(!container) return;

    if(!inv) {
      container.innerHTML = `
        <div class="panel-detail" style="background:#E0E0F5; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#6B7280; font-size:13px;">
          Select an invoice to view details
        </div>
        <div style="background:#232345; border-radius:12px; padding:20px; display:flex; flex-direction:column; gap:16px;">
          <div style="font-size:11px; color:#9CA3AF; text-transform:uppercase; font-weight:700;">Payment Status</div>
          <div style="background:#1E1E3A; border-radius:8px; padding:12px; text-align:center; font-size:12px; color:#9CA3AF; border:1px dashed #4B5563;">No selection</div>
        </div>
      `;
      return;
    }

    const items = DB.invoice_items.filter(x => x.invoice_id === inv.id);
    
    const itemsHTML = items.slice(0, 4).map(it => `
      <tr>
        <td style="padding:10px 0; border-bottom:1px solid rgba(30,30,58,0.05);">${esc(it.product_name)}</td>
        <td style="padding:10px 0; border-bottom:1px solid rgba(30,30,58,0.05); text-align:center;">${fmtNum(it.qty)}</td>
        <td style="padding:10px 0; border-bottom:1px solid rgba(30,30,58,0.05); text-align:right;">${rs(it.price)}</td>
        <td style="padding:10px 0; border-bottom:1px solid rgba(30,30,58,0.05); text-align:right;">${rs(it.total)}</td>
      </tr>
    `).join('');

    const moreCount = items.length > 4 ? `<tr><td colspan="4" style="text-align:center;color:#6B7280;font-size:11px;padding-top:10px;">+ ${items.length - 4} more items</td></tr>` : '';

    container.innerHTML = `
      <div class="panel-detail" style="background:#E0E0F5; border-radius:12px; padding:20px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
          <div>
            <h4 style="font-size:14px; font-weight:700; color:#1E1E3A;">Invoice ${esc(inv.invoice_no)}</h4>
            <div style="font-size:11px; color:#6B7280; margin-top:2px;">${fmtDate(txDate(inv, 'invoice_date'))}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; color:#6B7280;">Total Amount</div>
            <div style="font-size:20px; font-weight:700; color:#1E1E3A;">${rs(inv.total)}</div>
          </div>
        </div>
        
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(30,30,58,0.1);">
              <th style="text-align:left; padding-bottom:8px; color:#6B7280; font-weight:600;">Item / Description</th>
              <th style="text-align:center; padding-bottom:8px; color:#6B7280; font-weight:600;">Qty</th>
              <th style="text-align:right; padding-bottom:8px; color:#6B7280; font-weight:600;">Rate</th>
              <th style="text-align:right; padding-bottom:8px; color:#6B7280; font-weight:600;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
            ${moreCount}
          </tbody>
        </table>
        
        <div style="margin-top:16px; padding-top:16px; border-top:1px dashed rgba(30,30,58,0.1); display:flex; flex-direction:column; gap:6px; font-size:12px; color:#1E1E3A;">
          <div style="display:flex; justify-content:space-between;"><span>Subtotal</span><span>${rs(inv.subtotal)}</span></div>
          ${Number(inv.discount) > 0 ? `<div style="display:flex; justify-content:space-between; color:#EF4444;"><span>Discount</span><span>- ${rs(inv.discount)}</span></div>` : ''}
          <div style="display:flex; justify-content:space-between; font-weight:700; font-size:14px; margin-top:4px;"><span>Total</span><span>${rs(inv.total)}</span></div>
        </div>
      </div>

      <div style="background:#232345; border-radius:12px; padding:20px; display:flex; flex-direction:column; gap:16px;">
        <div>
          <div style="font-size:11px; color:#9CA3AF; text-transform:uppercase; font-weight:700; margin-bottom:8px;">Payment Status</div>
          <div style="background:${Number(inv.due) > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}; color:${Number(inv.due) > 0 ? '#F59E0B' : '#10B981'}; border-radius:6px; padding:10px; text-align:center; font-size:12px; font-weight:700;">
            ${Number(inv.due) > 0 ? 'Pending' : 'Paid'}
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
          <button class="btn btn-ghost btn-sm" style="color:#E5E7EB; border-color:#4B5563; justify-content:flex-start; font-size:11px;" onclick="location.hash='#/invoice/${inv.id}'">
            📄 View Full Invoice
          </button>
          ${Number(inv.due) > 0 ? `
            <button class="btn btn-ghost btn-sm" style="color:#E5E7EB; border-color:#4B5563; justify-content:flex-start; font-size:11px;" onclick="openCustomerPaymentForm('${inv.customer_id}')">
              💸 Record Payment
            </button>
          ` : ''}
        </div>

        <div style="margin-top:auto; border-top:1px solid #4B5563; padding-top:16px;">
          <div style="font-size:10px; color:#9CA3AF; text-transform:uppercase; font-weight:700; margin-bottom:8px;">Client Details</div>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:32px; height:32px; border-radius:50%; background:#312E81; color:#A5B4FC; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700;">
              ${esc((inv.customer_name || 'W').charAt(0).toUpperCase())}
            </div>
            <div>
              <div style="font-size:12px; color:#FFF; font-weight:600;">${esc(inv.customer_name || 'Walk-in')}</div>
              ${inv.customer_phone ? `<div style="font-size:10px; color:#9CA3AF; margin-top:2px;">📞 ${esc(inv.customer_phone)}</div>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  };

    // ── DYNAMIC DASHBOARD FILTERING ──
  const updateDashList = () => {
    const custId = $('#dash-filter-cust').value;
    const status = $('#dash-filter-status').value;
    const dateRange = $('#dash-filter-date').value;
    const search = $('#dash-filter-search').value.toLowerCase();

    const today = todayStr();
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    const filtered = DB.invoices
      .filter(i => !String(i.invoice_no || '').startsWith(RETURN_PREFIX))
      .filter(i => {
        // 1. Filter by Customer
        if (custId && i.customer_id !== custId) return false;
        
        // 2. Filter by Status
        if (status === 'paid' && Number(i.due) > 0) return false;
        if (status === 'pending' && Number(i.due) <= 0) return false;
        
        // 3. Filter by Date
        const d = txDate(i, 'invoice_date');
        if (dateRange === 'today' && d !== today) return false;
        if (dateRange === 'month' && d < firstOfMonth) return false;
        
        // 4. Filter by Search Text
        if (search) {
          const hay = ((i.invoice_no || '') + ' ' + (i.customer_name || '') + ' ' + (i.customer_phone || '')).toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 8); // Show top 8

    const listContainer = $('#dash-list');
    if(!listContainer) return;

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div style="color:#9CA3AF;font-size:13px;padding:20px 0;">No invoices match your filters.</div>';
      renderDashDetail(null);
      return;
    }

    // Render the HTML for the filtered list
    listContainer.innerHTML = filtered.map(inv => {
      const name = inv.customer_name || 'Walk-in';
      return `
        <div class="panel-list-item" data-id="${inv.id}" style="border-radius:8px;">
          <div class="avatar" style="background:#312E81; color:#A5B4FC;">${esc(name.charAt(0).toUpperCase())}</div>
          <div class="info">
            <div class="name">${esc(name)}</div>
            <div class="sub">${esc(inv.invoice_no)} · ${fmtDate(txDate(inv, 'invoice_date'))}</div>
          </div>
          <div class="amount">
            ${rs(inv.total)}
            ${Number(inv.due) > 0 
              ? '<div class="chip chip-warning" style="font-size:9px;margin-top:4px;padding:2px 6px;border-radius:4px;">Pending</div>' 
              : '<div class="chip chip-success" style="font-size:9px;margin-top:4px;padding:2px 6px;border-radius:4px;">Paid</div>'}
          </div>
        </div>
      `;
    }).join('');

    // Bind click events to the new list items
    $$('#dash-list .panel-list-item').forEach(el => {
      el.onclick = () => {
        $$('#dash-list .panel-list-item').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        const inv = DB.invoices.find(i => i.id === el.dataset.id);
        if(inv) renderDashDetail(inv);
      };
    });

    // Auto-select the first item
    const firstEl = $('#dash-list .panel-list-item');
    if (firstEl) {
      firstEl.classList.add('active');
      const firstInv = DB.invoices.find(i => i.id === firstEl.dataset.id);
      renderDashDetail(firstInv);
    }
  };

  // Attach event listeners to the filter inputs
  ['#dash-filter-cust', '#dash-filter-status', '#dash-filter-date'].forEach(sel => {
    const el = $(sel);
    if(el) el.onchange = updateDashList;
  });
  
  const searchEl = $('#dash-filter-search');
  if(searchEl) searchEl.oninput = updateDashList;

  // Run once on load
  updateDashList();

  // ── RENDER CHARTS ──
  charts.forEach(c => { try { c.destroy(); } catch(e){} });
  charts = [];

  const revCtx = $('#dash-chart-revenue');
  if(revCtx) {
    const map = {};
    DB.invoices.forEach(i => {
      if(String(i.invoice_no || '').startsWith(RETURN_PREFIX)) return;
      const d = txDate(i, 'invoice_date');
      if(!d) return;
      map[d] = map[d] || 0;
      map[d] += Number(i.total || 0);
    });
    
    const arr = Object.keys(map).sort().slice(-30).map(date => ({ date, sales: map[date] }));
    const labels = arr.length > 0 ? arr.map(d => d.date.slice(5)) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data   = arr.length > 0 ? arr.map(d => d.sales) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    charts.push(new Chart(revCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Revenue', data: data, backgroundColor: '#5B5BD6', borderRadius: 4, barPercentage: 0.6 },
          { label: 'Expenses', data: data.map(() => 0), backgroundColor: '#E0E0F5', borderRadius: 4, barPercentage: 0.6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 8, usePointStyle: true, pointStyle: 'circle', font: {size: 10} } } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { font: {size: 10}, color: '#9CA3AF' } },
          x: { grid: { display: false }, ticks: { font: {size: 10}, color: '#9CA3AF' } }
        }
      }
    }));
  }
}

console.log('[MediStore] Core Logic Block 6 loaded');
/* ─────────────────────────────────────────────
   29. CUSTOMERS LIST
   ───────────────────────────────────────────── */
function renderCustomers(content) {
  const list = DB.customers;

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Customers</h1>
        <p>${list.length} customer${list.length === 1 ? '' : 's'}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" onclick="location.hash='#/new-invoice'">📄 New Invoice</button>
        <button class="btn btn-primary" id="add-cust">+ Add Customer</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="c-search" placeholder="Name or phone...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="c-sort">
          <option value="name">Name (A–Z)</option>
          <option value="name-desc">Name (Z–A)</option>
          <option value="due-desc">Due (high first)</option>
          <option value="due">Due (low first)</option>
        </select>
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <select class="input" id="c-filter">
          <option value="">All</option>
          <option value="due">Only with due</option>
          <option value="nodue">Only cleared</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Joined</th>
            <th style="text-align:right">Due</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="c-body"></tbody>
      </table>
    </div>
    
    <div class="mobile-list" id="c-mobile"></div>
  `;

  function filtered() {
    const q      = ($('#c-search').value || '').toLowerCase().trim();
    const sortBy = $('#c-sort').value;
    const flt    = $('#c-filter').value;

    let arr = list
      .map(c => ({ ...c, _stats: customerStats(c.id) }))
      .filter(c => {
        if(q && !((c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))) return false;
        if(flt === 'due'   && !(c._stats.due > 0)) return false;
        if(flt === 'nodue' && c._stats.due > 0) return false;
        return true;
      });

    if(sortBy === 'name')           arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if(sortBy === 'name-desc') arr.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    else if(sortBy === 'due-desc')  arr.sort((a, b) => b._stats.due - a._stats.due);
    else if(sortBy === 'due')       arr.sort((a, b) => a._stats.due - b._stats.due);
    return arr;
  }

  function renderList() {
    const arr = filtered();

    // Desktop Table
    const tbody = $('#c-body');
    if(tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">No customers match</td></tr>`
        : arr.map(c => {
            const st = c._stats;
            return `<tr>
              <td>
                <a href="#/customer/${c.id}" style="font-weight:600;color:var(--text-main);text-decoration:none;">
                  ${esc(c.name)}
                </a>
              </td>
              <td>${c.phone ? `<a href="tel:${esc(c.phone)}" style="color:var(--text-muted);">${esc(c.phone)}</a>` : '—'}</td>
              <td style="color:var(--text-muted);">${fmtDate(c.joined_date)}</td>
              <td style="text-align:right;font-weight:600;color:${st.due > 0 ? 'var(--danger)' : 'var(--text-muted)'}">${rs(st.due)}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-view="${c.id}">View</button>
                <button class="btn btn-ghost btn-sm" data-del="${c.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    // Mobile List
    const mob = $('#c-mobile');
    if(mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No customers match</div></div>`
        : arr.map(c => {
            const st = c._stats;
            return `
              <a href="#/customer/${c.id}" class="mobile-card" style="text-decoration:none;color:inherit;">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc(c.name)}</div>
                    <div class="mobile-card-sub">${esc(c.phone || 'No phone')} · Joined ${fmtDate(c.joined_date)}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;color:${st.due > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${rs(st.due)}</div>
                    <div class="text-xs text-muted" style="margin-top:2px;">${st.due > 0 ? 'Due' : 'Clear'}</div>
                  </div>
                </div>
              </a>`;
          }).join('');
    }

    // Attach listeners
    $$('[data-view]').forEach(b => b.onclick = () => location.hash = '#/customer/' + b.dataset.view);
    $$('[data-del]').forEach(b => b.onclick = async () => {
      const c = DB.customers.find(x => x.id === b.dataset.del);
      if(!c) return;
      
      const invCount = DB.invoices.filter(i => i.customer_id === c.id).length;
      const payCount = DB.payments.filter(p => p.customer_id === c.id).length;
      
      const warn = (invCount || payCount)
        ? `Delete customer "${c.name}"?\n\n⚠️ Their ${invCount} invoice(s) and ${payCount} payment(s) will remain in the system but won't be linked to any customer.\n\nContinue?`
        : `Delete customer "${c.name}"?`;
        
      if(!confirmDlg(warn, 'Confirm Delete')) return;

      const { error } = await sb.from('customers').delete().eq('id', c.id);
      if(error) { 
        console.error(error);
        toast('Failed to delete customer. They may be linked to active records.', 'error'); 
        return; 
      }
      
      await syncDB();
      toast('Customer deleted', 'success');
      renderList();
    });
  }

  ['c-search', 'c-sort', 'c-filter'].forEach(id => {
    const el = $('#' + id);
    if(el) { el.oninput = renderList; el.onchange = renderList; }
  });

  renderList();
  $('#add-cust').onclick = () => openCustomerForm();
}

/* ─────────────────────────────────────────────
   30. CUSTOMER FORM MODAL
   ───────────────────────────────────────────── */
function openCustomerForm(existing) {
  const c = existing || {
    name: '', phone: '', address: '', notes: '',
    joined_date: todayStr(), tx_time: ''
  };

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${existing ? 'Edit' : 'New'} Customer</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <form id="cf" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="label">Name *</label>
          <input class="input" name="name" required value="${esc(c.name || '')}" autofocus>
        </div>
        <div>
          <label class="label">Phone</label>
          <input class="input" type="tel" name="phone" value="${esc(c.phone || '')}" placeholder="10-digit mobile">
        </div>
        <div>
          <label class="label">Address</label>
          <input class="input" name="address" value="${esc(c.address || '')}">
        </div>
        <div>
          <label class="label">Notes</label>
          <input class="input" name="notes" value="${esc(c.notes || '')}" placeholder="Allergies, regular customer, etc.">
        </div>
        ${dateTimeFieldHTML(c.joined_date || todayStr(), c.tx_time || '', 'Joined')}
      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="cf-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    root.querySelector('#cf-save').onclick = async () => {
      const form = root.querySelector('#cf');
      if(!form.reportValidity()) return;
      
      const dt = readDateTime(form);
      if(!dt) return;

      const fd = new FormData(form);
      const data = {
        name:        (fd.get('name') || '').trim(),
        phone:       (fd.get('phone') || '').trim(),
        address:     (fd.get('address') || '').trim(),
        notes:       (fd.get('notes') || '').trim(),
        joined_date: dt.date,
        tx_time:     dt.time
      };

      const btn = root.querySelector('#cf-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      let res;
      if(existing) res = await sb.from('customers').update(data).eq('id', existing.id).select().single();
      else         res = await sb.from('customers').insert(data).select().single();

      if(res.error) {
        console.error(res.error);
        toast('Failed to save customer details.', 'error');
        btn.disabled = false; btn.textContent = existing ? 'Update' : 'Save';
        return;
      }
      
      await syncDB();
      toast(existing ? 'Customer updated' : 'Customer added', 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   31. CUSTOMER PROFILE
   ───────────────────────────────────────────── */
async function renderCustomerProfile(content, id) {
  const c = DB.customers.find(x => x.id === id);
  if(!c) {
    content.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">Customer not found</div></div>';
    return;
  }

  const st   = customerStats(id);
  const invs = DB.invoices
    .filter(i => i.customer_id === id)
    .sort((a, b) => txDate(b, 'invoice_date').localeCompare(txDate(a, 'invoice_date')));
  const pays = DB.payments
    .filter(p => p.customer_id === id)
    .sort((a, b) => txDate(b, 'payment_date').localeCompare(txDate(a, 'payment_date')));

  const init = (c.name || 'C').charAt(0).toUpperCase();

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/customers" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Customers</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;align-items:center;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div class="table-avatar" style="width:56px;height:56px;font-size:20px;margin:0;">${esc(init)}</div>
        <div>
          <h1 style="margin-bottom:2px;">${esc(c.name)}</h1>
          <p class="text-muted text-sm">
            ${c.phone ? '📞 ' + esc(c.phone) + ' &nbsp;·&nbsp; ' : ''} Joined ${fmtDate(c.joined_date)}
          </p>
        </div>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="btn-edit-c">✎ Edit</button>
        <button class="btn btn-ghost" id="btn-pay-c">+ Payment</button>
        <button class="btn btn-primary" id="btn-new-inv-c">📄 New Invoice</button>
      </div>
    </div>

    <div class="grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Total Billed</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${rs(st.total_bought)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Total Paid</div>
        <div style="font-size:20px;font-weight:700;color:var(--success);margin-top:4px;">${rs(st.total_paid)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Outstanding Due</div>
        <div style="font-size:20px;font-weight:700;color:${st.due > 0 ? 'var(--danger)' : 'var(--text-main)'};margin-top:4px;">${rs(st.due)}</div>
      </div>
    </div>

    ${c.notes ? `
      <div class="card" style="margin-bottom:24px;background:var(--warning-bg);border-color:var(--warning);">
        <div class="text-xs" style="text-transform:uppercase;font-weight:700;color:#92400e;margin-bottom:4px;">Notes</div>
        <div style="font-size:13px;color:#92400e;">${esc(c.notes)}</div>
      </div>
    ` : ''}

    <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
      <!-- Invoices -->
      <div class="card">
        <div class="card-title">Invoices <small>${invs.length}</small></div>
        ${!invs.length
          ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No invoices yet</p>'
          : `<div>${invs.slice(0, 10).map(i => `
              <div class="panel-list-item" style="border-bottom:1px solid var(--border);border-radius:0;padding:12px 0;cursor:pointer;" onclick="location.hash='#/invoice/${i.id}'">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:13px;color:var(--text-main);">${esc(i.invoice_no || '')}</div>
                  <div class="text-xs text-muted">${txDT(i, 'invoice_date')}</div>
                </div>
                <div style="text-align:right;white-space:nowrap;">
                  <div style="font-weight:600;font-size:13px;">${rs(i.total)}</div>
                  ${Number(i.due) > 0
                    ? `<div style="color:var(--danger);font-size:11px;">Due ${rs(i.due)}</div>`
                    : '<div style="color:var(--success);font-size:11px;">Paid</div>'}
                </div>
              </div>
            `).join('')}</div>`}
      </div>

      <!-- Payments -->
      <div class="card">
        <div class="card-title">Payments <small>${pays.length}</small></div>
        ${!pays.length
          ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No payments yet</p>'
          : `<div>${pays.slice(0, 10).map(p => `
              <div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);font-size:13px;align-items:center;">
                <div>
                  <div style="color:var(--success);font-weight:600;">
                    ${rs(p.amount)}
                    <span class="text-xs text-muted" style="font-weight:400;">— ${esc(p.mode || '')}</span>
                  </div>
                  <div class="text-xs text-muted">${txDT(p, 'payment_date')}</div>
                </div>
                <button class="btn btn-ghost btn-sm" data-pay-del="${p.id}" style="color:var(--danger);">Del</button>
              </div>
            `).join('')}</div>`}
      </div>
    </div>

    <!-- Statement Ledger -->
    <div class="card">
      <div class="card-title">Statement <small>Running balance</small></div>
      ${(() => {
        // Calculate running balance correctly factoring partial payments
        const tl = [
          ...invs.map(i => ({ date: txDate(i, 'invoice_date'), type: 'Invoice', ref: i.invoice_no, id: i.id, debit: Number(i.total || 0), credit: Number(i.paid || 0) })),
          ...pays.map(p => ({ date: txDate(p, 'payment_date'), type: 'Payment', ref: p.mode || 'Payment', id: p.id, debit: 0, credit: Number(p.amount || 0) }))
        ].sort((a, b) => a.date.localeCompare(b.date));

        let bal = 0;
        const rows = tl.map(x => {
          bal += x.debit - x.credit;
          return `<tr>
            <td>${fmtDate(x.date)}</td>
            <td>${x.type === 'Invoice'
                ? `<a href="#/invoice/${x.id}" style="font-weight:600;">${esc(x.ref || '')}</a>`
                : esc(x.ref || '')}</td>
            <td style="text-align:right">${x.debit ? rs(x.debit) : '—'}</td>
            <td style="text-align:right;color:var(--success)">${x.credit ? rs(x.credit) : '—'}</td>
            <td style="text-align:right;font-weight:700;color:${bal > 0 ? 'var(--danger)' : 'var(--success)'}">${rs(Math.abs(bal))}</td>
          </tr>`;
        }).join('');

        return `<div class="table-wrap"><table>
          <thead><tr>
            <th>Date</th><th>Reference</th>
            <th style="text-align:right">Debit (Billed)</th>
            <th style="text-align:right">Credit (Paid)</th>
            <th style="text-align:right">Balance</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`;
      })()}
    </div>

    <div class="text-center text-xs text-muted" style="padding:20px 0;">${enteredOn(c)}</div>
  `;

  $('#btn-edit-c').onclick  = () => openCustomerForm(c);
  $('#btn-new-inv-c').onclick = () => location.hash = '#/new-invoice?customer=' + id;
  $('#btn-pay-c').onclick   = () => openCustomerPaymentForm(id);

  $$('[data-pay-del]').forEach(b => b.onclick = async () => {
    const p = DB.payments.find(x => x.id === b.dataset.payDel);
    if(!p) return;
    if(!confirmDlg('Delete payment of ' + rs(p.amount) + '?', 'Confirm Delete')) return;
    
    const { error } = await sb.from('payments').delete().eq('id', p.id);
    if(error) { 
      console.error(error);
      toast('Failed to delete payment.', 'error'); 
      return; 
    }
    await syncDB();
    toast('Payment deleted', 'success');
    route();
  });
}

/* ─────────────────────────────────────────────
   32. CUSTOMER PAYMENT FORM
   ───────────────────────────────────────────── */
function openCustomerPaymentForm(customerId, existing) {
  const c = DB.customers.find(x => x.id === customerId);
  if(!c) { toast('Customer not found', 'error'); return; }

  const p = existing || {
    amount: '', mode: 'cash', notes: '',
    payment_date: todayStr(), tx_time: ''
  };

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">${existing ? 'Edit' : 'Record'} Payment</div>
        <div class="text-xs text-muted" style="margin-top:2px;">From: <b>${esc(c.name)}</b></div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <form id="payf" style="display:flex;flex-direction:column;gap:16px;">
        ${dateTimeFieldHTML(p.payment_date, p.tx_time, 'Payment Date')}
        
        <div>
          <label class="label">Amount (₹) *</label>
          <input class="input" type="number" step="any" min="0.01" name="amount" required value="${p.amount || ''}" autofocus>
        </div>
        
        <div>
          <label class="label">Mode</label>
          <select class="input" name="mode">
            <option value="cash"   ${p.mode === 'cash'   ? 'selected' : ''}>Cash</option>
            <option value="upi"    ${p.mode === 'upi'    ? 'selected' : ''}>UPI</option>
            <option value="card"   ${p.mode === 'card'   ? 'selected' : ''}>Card</option>
            <option value="bank"   ${p.mode === 'bank'   ? 'selected' : ''}>Bank Transfer</option>
            <option value="cheque" ${p.mode === 'cheque' ? 'selected' : ''}>Cheque</option>
          </select>
        </div>
        
        <div>
          <label class="label">Notes</label>
          <input class="input" name="notes" value="${esc(p.notes || '')}">
        </div>
      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="pay-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    root.querySelector('#pay-save').onclick = async () => {
      const form = root.querySelector('#payf');
      if(!form.reportValidity()) return;
      
      const dt = readDateTime(form);
      if(!dt) return;
      
      const fd  = new FormData(form);
      const amt = Number(fd.get('amount')) || 0;
      if(amt <= 0) { toast('Amount must be greater than 0', 'error'); return; }

      const data = {
        customer_id:   customerId,
        customer_name: c.name || '',
        amount:        amt,
        mode:          fd.get('mode'),
        notes:         (fd.get('notes') || '').trim(),
        payment_date:  dt.date,
        tx_time:       dt.time
      };

      const btn = root.querySelector('#pay-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      let res;
      if(existing) res = await sb.from('payments').update(data).eq('id', existing.id);
      else         res = await sb.from('payments').insert(data);

      if(res.error) {
        console.error(res.error);
        toast('Failed to save payment.', 'error');
        btn.disabled = false; btn.textContent = 'Save';
        return;
      }
      
      await syncDB();
      toast('Payment saved', 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   33. DOCTORS LIST
   ───────────────────────────────────────────── */
function renderDoctors(content) {
  const list = DB.doctors;

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Doctors</h1>
        <p>${list.length} doctor${list.length === 1 ? '' : 's'}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-doc">+ Add Doctor</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <label class="label">Search</label>
      <input class="input" id="d-search" placeholder="Name, hospital or phone...">
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Hospital</th>
            <th>Phone</th>
            <th style="text-align:right">Invoices</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="d-body"></tbody>
      </table>
    </div>
    
    <div class="mobile-list" id="d-mobile"></div>
  `;

  function filtered() {
    const q = ($('#d-search').value || '').toLowerCase().trim();
    if(!q) return list;
    return list.filter(d =>
      (d.name     || '').toLowerCase().includes(q) ||
      (d.hospital || '').toLowerCase().includes(q) ||
      (d.phone    || '').includes(q)
    );
  }

  function renderList() {
    const arr = filtered();

    // Desktop
    const tbody = $('#d-body');
    if(tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">No doctors match</td></tr>`
        : arr.map(d => {
            const invCount = DB.invoices.filter(i => i.doctor_id === d.id).length;
            return `<tr>
              <td><a href="#/doctor/${d.id}" style="font-weight:600;color:var(--text-main);text-decoration:none;">${esc(d.name)}</a></td>
              <td style="color:var(--text-muted);">${esc(d.hospital || '—')}</td>
              <td>${d.phone ? `<a href="tel:${esc(d.phone)}" style="color:var(--text-muted);">${esc(d.phone)}</a>` : '—'}</td>
              <td style="text-align:right;">${invCount}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-view="${d.id}">View</button>
                <button class="btn btn-ghost btn-sm" data-del="${d.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    // Mobile
    const mob = $('#d-mobile');
    if(mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state"><div class="empty-icon">🩺</div><div class="empty-title">No doctors match</div></div>`
        : arr.map(d => {
            const invCount = DB.invoices.filter(i => i.doctor_id === d.id).length;
            return `
              <a href="#/doctor/${d.id}" class="mobile-card" style="text-decoration:none;color:inherit;">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc(d.name)}</div>
                    <div class="mobile-card-sub">${esc(d.hospital || '')} ${d.phone ? '· ' + esc(d.phone) : ''}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;">${invCount}</div>
                    <div class="text-xs text-muted">Rx</div>
                  </div>
                </div>
              </a>`;
          }).join('');
    }

    $$('[data-view]').forEach(b => b.onclick = () => location.hash = '#/doctor/' + b.dataset.view);
    $$('[data-del]').forEach(b => b.onclick = async () => {
      const d = DB.doctors.find(x => x.id === b.dataset.del);
      if(!d) return;
      
      const invCount = DB.invoices.filter(i => i.doctor_id === d.id).length;
      const warn = invCount
        ? `Delete doctor "${d.name}"?\n\n⚠️ ${invCount} invoice(s) will keep the doctor name snapshot but lose the link.`
        : `Delete doctor "${d.name}"?`;
        
      if(!confirmDlg(warn, 'Confirm Delete')) return;

      const { error } = await sb.from('doctors').delete().eq('id', d.id);
      if(error) { 
        console.error(error);
        toast('Failed to delete doctor.', 'error'); 
        return; 
      }
      
      await syncDB();
      toast('Doctor deleted', 'success');
      renderList();
    });
  }

  const s = $('#d-search');
  if(s) s.oninput = renderList;

  renderList();
  $('#add-doc').onclick = () => openDoctorForm();
}

/* ─────────────────────────────────────────────
   34. DOCTOR FORM MODAL
   ───────────────────────────────────────────── */
function openDoctorForm(existing) {
  const d = existing || { name: '', hospital: '', phone: '', notes: '' };

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${existing ? 'Edit' : 'New'} Doctor</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <form id="df" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="label">Doctor Name *</label>
          <input class="input" name="name" required value="${esc(d.name || '')}" placeholder="Dr. ..." autofocus>
        </div>
        <div>
          <label class="label">Hospital / Clinic</label>
          <input class="input" name="hospital" value="${esc(d.hospital || '')}">
        </div>
        <div>
          <label class="label">Phone</label>
          <input class="input" type="tel" name="phone" value="${esc(d.phone || '')}">
        </div>
        <div>
          <label class="label">Notes</label>
          <input class="input" name="notes" value="${esc(d.notes || '')}" placeholder="Speciality, area, etc.">
        </div>
      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="df-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    root.querySelector('#df-save').onclick = async () => {
      const form = root.querySelector('#df');
      if(!form.reportValidity()) return;

      const fd = new FormData(form);
      const data = {
        name:     (fd.get('name') || '').trim(),
        hospital: (fd.get('hospital') || '').trim(),
        phone:    (fd.get('phone') || '').trim(),
        notes:    (fd.get('notes') || '').trim()
      };

      const btn = root.querySelector('#df-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      let res;
      if(existing) res = await sb.from('doctors').update(data).eq('id', existing.id).select().single();
      else         res = await sb.from('doctors').insert(data).select().single();

      if(res.error) {
        console.error(res.error);
        toast('Failed to save doctor details.', 'error');
        btn.disabled = false; btn.textContent = existing ? 'Update' : 'Save';
        return;
      }
      
      await syncDB();
      toast(existing ? 'Doctor updated' : 'Doctor added', 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   35. DOCTOR PROFILE
   ───────────────────────────────────────────── */
async function renderDoctorProfile(content, id) {
  const d = DB.doctors.find(x => x.id === id);
  if(!d) {
    content.innerHTML = '<div class="empty-state"><div class="empty-icon">🩺</div><div class="empty-title">Doctor not found</div></div>';
    return;
  }

  const invs = DB.invoices
    .filter(i => i.doctor_id === id)
    .sort((a, b) => txDate(b, 'invoice_date').localeCompare(txDate(a, 'invoice_date')));

  const totalPrescribed = invs.reduce((s, i) => s + Number(i.total || 0), 0);
  const init = (d.name || 'D').charAt(0).toUpperCase();

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/doctors" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Doctors</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;align-items:center;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div class="table-avatar" style="width:56px;height:56px;font-size:20px;margin:0;background:var(--primary-light);color:var(--primary);">${esc(init)}</div>
        <div>
          <h1 style="margin-bottom:2px;">${esc(d.name)}</h1>
          <p class="text-muted text-sm">
            ${d.hospital ? '🏥 ' + esc(d.hospital) + ' &nbsp;·&nbsp; ' : ''} 
            ${d.phone ? '📞 ' + esc(d.phone) : ''}
          </p>
        </div>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="btn-edit-d">✎ Edit</button>
        <button class="btn btn-primary" id="btn-new-inv-d">📄 New Invoice</button>
      </div>
    </div>

    <div class="grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Total Rx</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${invs.length}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Prescribed Value</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${rs(totalPrescribed)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Last Rx</div>
        <div style="font-size:16px;font-weight:600;margin-top:6px;">${invs[0] ? fmtDate(txDate(invs[0], 'invoice_date')) : '—'}</div>
      </div>
    </div>

    ${d.notes ? `
      <div class="card" style="margin-bottom:24px;background:var(--primary-light);border-color:var(--primary);">
        <div class="text-xs" style="text-transform:uppercase;font-weight:700;color:var(--primary);margin-bottom:4px;">Notes</div>
        <div style="font-size:13px;color:var(--text-main);">${esc(d.notes)}</div>
      </div>
    ` : ''}

    <div class="card">
      <div class="card-title">Prescription History <small>${invs.length}</small></div>
      ${!invs.length
        ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No invoices linked yet</p>'
        : `<div>${invs.slice(0, 20).map(i => {
            const cust = DB.customers.find(c => c.id === i.customer_id);
            const name = i.customer_name || (cust && cust.name) || '—';
            return `
              <div class="panel-list-item" style="border-bottom:1px solid var(--border);border-radius:0;padding:14px 0;cursor:pointer;" onclick="location.hash='#/invoice/${i.id}'">
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:13px;color:var(--text-main);">${esc(i.invoice_no || '')} · ${esc(name)}</div>
                  <div class="text-xs text-muted" style="margin-top:2px;">
                    ${txDT(i, 'invoice_date')}
                    ${i.patient_name ? ' · Pt: ' + esc(i.patient_name) : ''}
                    ${i.prescription_no ? ' · Rx: ' + esc(i.prescription_no) : ''}
                  </div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="font-weight:700;font-size:13px;">${rs(i.total)}</div>
                </div>
              </div>`;
          }).join('')}</div>`}
    </div>

    <div class="text-center text-xs text-muted" style="padding:20px 0;">${enteredOn(d)}</div>
  `;

  $('#btn-edit-d').onclick    = () => openDoctorForm(d);
  $('#btn-new-inv-d').onclick = () => location.hash = '#/new-invoice?doctor=' + id;
}

console.log('[MediStore] Core Logic Block 7 loaded');
/* ─────────────────────────────────────────────
   36. VENDOR LIST (Shared by Companies & Suppliers)
   ───────────────────────────────────────────── */
function renderVendorList(content, type) {
  const isSupplier     = type === 'supplier';
  const label          = isSupplier ? 'Suppliers' : 'Companies';
  const labelSingular  = isSupplier ? 'Supplier' : 'Company';
  const subtitle       = isSupplier ? 'Other distributors you buy from' : 'Manufacturers & companies you stock';
  const icon           = isSupplier ? '🚚' : '🏢';
  const list           = DB.suppliers.filter(s => (s.type || 'company') === type);

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>${label}</h1>
        <p>${list.length} ${labelSingular.toLowerCase()}${list.length === 1 ? '' : 's'} · ${subtitle}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-vendor">+ Add ${labelSingular}</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="v-search" placeholder="Name, firm or phone...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="v-sort">
          <option value="name">Name (A–Z)</option>
          <option value="name-desc">Name (Z–A)</option>
          <option value="due-desc">Payable (high first)</option>
          <option value="due">Payable (low first)</option>
        </select>
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <select class="input" id="v-filter">
          <option value="">All</option>
          <option value="due">Only with payable</option>
          <option value="nodue">Only cleared</option>
        </select>
      </div>
    </div>

    <div id="v-list"></div>
  `;

  function filtered() {
    const q      = ($('#v-search').value || '').toLowerCase().trim();
    const sortBy = $('#v-sort').value;
    const flt    = $('#v-filter').value;

    let arr = list
      .map(s => ({ ...s, _tt: supplierTotals(s.id) }))
      .filter(s => {
        if(q && !((s.name || '').toLowerCase().includes(q)
              || (s.shop_name || '').toLowerCase().includes(q)
              || (s.phone || '').includes(q))) return false;
        if(flt === 'due'   && !(s._tt.total_due > 0)) return false;
        if(flt === 'nodue' && s._tt.total_due > 0) return false;
        return true;
      });

    if(sortBy === 'name')           arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if(sortBy === 'name-desc') arr.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    else if(sortBy === 'due-desc')  arr.sort((a, b) => b._tt.total_due - a._tt.total_due);
    else if(sortBy === 'due')       arr.sort((a, b) => a._tt.total_due - b._tt.total_due);
    return arr;
  }

  function renderList() {
    const arr = filtered();
    const box = $('#v-list');

    if(arr.length === 0) {
      box.innerHTML = list.length === 0
        ? `<div class="card"><div class="empty-state">
             <div class="empty-icon">${icon}</div>
             <div class="empty-title">No ${label.toLowerCase()} yet</div>
             <div class="empty-desc">${isSupplier ? 'Add other distributors or wholesalers you buy from.' : 'Add the manufacturers or companies you stock.'}</div>
             <button class="btn btn-primary" id="add-vendor-empty">+ Add your first ${labelSingular.toLowerCase()}</button>
           </div></div>`
        : `<div class="card"><div class="empty-state">
             <div class="empty-icon">🔍</div>
             <div class="empty-title">No ${label.toLowerCase()} match your filter</div>
           </div></div>`;
      const eb = $('#add-vendor-empty');
      if(eb) eb.onclick = () => openSupplierForm(null, type);
      return;
    }

    box.innerHTML = arr.map(s => {
      const tt   = s._tt;
      const typeChip = isSupplier
        ? '<span class="chip chip-neutral" style="font-size:9px;">SUPPLIER</span>'
        : '<span class="chip chip-primary" style="font-size:9px;">COMPANY</span>';

      return `
        <a href="#/${isSupplier ? 'supplier' : 'company'}/${s.id}" class="card" style="display:block;margin-bottom:12px;text-decoration:none;color:inherit;cursor:pointer;transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow='var(--shadow-sm)'">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:16px;">
            <div style="display:flex;gap:12px;align-items:center;min-width:0;flex:1;">
              <div class="table-avatar" style="width:44px;height:44px;font-size:16px;background:var(--primary-light);color:var(--primary);margin:0;">
                ${esc((s.name || 'V').charAt(0).toUpperCase())}
              </div>
              <div style="min-width:0;flex:1;">
                <div style="font-weight:700;font-size:15px;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.name)}</div>
                ${s.shop_name ? `<div class="text-xs text-muted" style="margin-top:2px;">${esc(s.shop_name)}</div>` : ''}
                <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--text-muted);margin-top:4px;">
                  ${s.phone ? `<span>📞 ${esc(s.phone)}</span>` : ''}
                  ${s.category ? `<span class="chip chip-neutral">${esc(s.category)}</span>` : ''}
                </div>
              </div>
            </div>
            ${typeChip}
          </div>
          
          <div class="grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
            <div style="background:var(--bg-app);padding:10px;border-radius:8px;">
              <div class="text-xs text-muted" style="font-weight:600;">Purchased</div>
              <div style="font-weight:700;margin-top:2px;">${rs(tt.total_purchase)}</div>
            </div>
            <div style="background:var(--bg-app);padding:10px;border-radius:8px;">
              <div class="text-xs text-muted" style="font-weight:600;">Paid</div>
              <div style="font-weight:700;color:var(--success);margin-top:2px;">${rs(tt.total_paid)}</div>
            </div>
            <div style="background:${tt.total_due > 0 ? 'var(--danger-bg)' : 'var(--bg-app)'};padding:10px;border-radius:8px;border:1px solid ${tt.total_due > 0 ? 'var(--danger)' : 'transparent'};">
              <div class="text-xs" style="font-weight:600;color:${tt.total_due > 0 ? 'var(--danger)' : 'var(--text-muted)'};">Payable</div>
              <div style="font-weight:700;color:${tt.total_due > 0 ? 'var(--danger)' : 'var(--text-muted)'};margin-top:2px;">${rs(tt.total_due)}</div>
            </div>
          </div>
        </a>`;
    }).join('');
  }

  ['v-search', 'v-sort', 'v-filter'].forEach(id => {
    const el = $('#' + id);
    if(el) { el.oninput = renderList; el.onchange = renderList; }
  });

  renderList();
  $('#add-vendor').onclick = () => openSupplierForm(null, type);
}

function renderCompanies(content) { renderVendorList(content, 'company'); }
function renderSuppliers(content) { renderVendorList(content, 'supplier'); }

/* ─────────────────────────────────────────────
   37. SUPPLIER / COMPANY FORM MODAL
   ───────────────────────────────────────────── */
function openSupplierForm(existing, forcedType) {
  const type     = (existing && existing.type) || forcedType || 'company';
  const isSup    = type === 'supplier';
  const label    = isSup ? 'Supplier' : 'Company';

  const s = existing || {
    name: '', shop_name: '', phone: '', email: '', address: '',
    gst: '', category: '', notes: '', opening_balance: 0,
    joined_date: todayStr(), tx_time: ''
  };

  const catOptions = SUPPLIER_CATEGORIES
    .map(c => `<option value="${c}" ${s.category === c ? 'selected' : ''}>${c}</option>`)
    .join('');

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${existing ? 'Edit ' + label : 'New ' + label}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <form id="sf" style="display:flex;flex-direction:column;gap:16px;">
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">${label} Name *</label>
            <input class="input" name="name" required value="${esc(s.name || '')}" autofocus>
          </div>
          <div>
            <label class="label">Firm / Brand</label>
            <input class="input" name="shop_name" value="${esc(s.shop_name || '')}">
          </div>
          <div>
            <label class="label">Phone</label>
            <input class="input" type="tel" name="phone" value="${esc(s.phone || '')}">
          </div>
          <div>
            <label class="label">Email</label>
            <input class="input" type="email" name="email" value="${esc(s.email || '')}">
          </div>
          <div>
            <label class="label">GSTIN</label>
            <input class="input" name="gst" value="${esc(s.gst || '')}" placeholder="Optional">
          </div>
          <div>
            <label class="label">Category</label>
            <select class="input" name="category">
              <option value="">— Select —</option>
              ${catOptions}
            </select>
          </div>
        </div>

        <div>
          <label class="label">Address</label>
          <input class="input" name="address" value="${esc(s.address || '')}">
        </div>

        ${dateTimeFieldHTML(s.joined_date || todayStr(), s.tx_time || '', 'Associated since')}

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Opening Balance (₹)</label>
            <input class="input" type="number" step="any" name="opening_balance" value="${s.opening_balance || 0}">
            <div class="field-hint">Amount already payable when you started using MediStore</div>
          </div>
          <div>
            <label class="label">Notes</label>
            <input class="input" name="notes" value="${esc(s.notes || '')}">
          </div>
        </div>
      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="sf-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    root.querySelector('#sf-save').onclick = async () => {
      const form = root.querySelector('#sf');
      if(!form.reportValidity()) return;
      
      const dt = readDateTime(form);
      if(!dt) return;
      
      const fd = new FormData(form);
      const data = {
        name:            (fd.get('name') || '').trim(),
        shop_name:       (fd.get('shop_name') || '').trim(),
        phone:           (fd.get('phone') || '').trim(),
        email:           (fd.get('email') || '').trim(),
        address:         (fd.get('address') || '').trim(),
        gst:             (fd.get('gst') || '').trim(),
        category:        (fd.get('category') || '').trim(),
        notes:           (fd.get('notes') || '').trim(),
        opening_balance: Number(fd.get('opening_balance')) || 0,
        joined_date:     dt.date,
        tx_time:         dt.time,
        type
      };

      const btn = root.querySelector('#sf-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      let res;
      if(existing) res = await sb.from('suppliers').update(data).eq('id', existing.id).select().single();
      else         res = await sb.from('suppliers').insert(data).select().single();

      if(res.error) {
        console.error(res.error);
        toast('Failed to save ' + label.toLowerCase() + ' details.', 'error');
        btn.disabled = false; btn.textContent = existing ? 'Update' : 'Save';
        return;
      }
      
      await syncDB();
      toast(existing ? 'Updated' : label + ' added', 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   38. SUPPLIER PROFILE
   ───────────────────────────────────────────── */
async function renderSupplierProfile(content, id) {
  const s = DB.suppliers.find(x => x.id === id);
  if(!s) {
    content.innerHTML = '<div class="empty-state"><div class="empty-icon">🏢</div><div class="empty-title">Not found</div></div>';
    return;
  }

  const isSupplier = (s.type === 'supplier');
  const typeLabel  = isSupplier ? 'Supplier' : 'Company';
  const backUrl    = isSupplier ? '#/suppliers' : '#/companies';
  const backLabel  = isSupplier ? 'Suppliers' : 'Companies';

  const tt    = supplierTotals(id);
  const bills = DB.supplier_invoices
    .filter(b => b.supplier_id === id)
    .sort((a, b) => txDate(b, 'bill_date').localeCompare(txDate(a, 'bill_date')));
  const pays  = DB.supplier_payments
    .filter(p => p.supplier_id === id)
    .sort((a, b) => txDate(b, 'payment_date').localeCompare(txDate(a, 'payment_date')));

  const returnsTo     = DB.returns.filter(r => r.direction === 'to_supplier' && r.supplier_id === id);
  const companyProds  = DB.products.filter(p => p.supplier_id === id);

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="${backUrl}" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to ${backLabel}</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;align-items:center;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div class="table-avatar" style="width:56px;height:56px;font-size:20px;margin:0;background:var(--primary-light);color:var(--primary);">
          ${esc((s.name || 'V').charAt(0).toUpperCase())}
        </div>
        <div>
          <h1 style="margin-bottom:2px;">${esc(s.name)}</h1>
          <p class="text-muted text-sm">
            ${s.shop_name ? esc(s.shop_name) + ' &nbsp;·&nbsp; ' : ''}
            ${s.phone ? '📞 ' + esc(s.phone) : ''}
          </p>
        </div>
        <span class="chip ${isSupplier ? 'chip-neutral' : 'chip-primary'}" style="margin-left:12px;">${typeLabel.toUpperCase()}</span>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="btn-edit-s">✎ Edit</button>
        <button class="btn btn-ghost" id="btn-pay-s">+ Payment</button>
        <button class="btn btn-primary" id="btn-buy">+ Purchase Bill</button>
      </div>
    </div>

    <div class="grid-4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Total Purchase</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${rs(tt.total_purchase)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Total Paid</div>
        <div style="font-size:20px;font-weight:700;color:var(--success);margin-top:4px;">${rs(tt.total_paid)}</div>
      </div>
      <div class="card" style="padding:16px;background:${tt.total_due > 0 ? 'var(--danger-bg)' : 'var(--bg-card)'};border-color:${tt.total_due > 0 ? 'var(--danger)' : 'var(--border)'};">
        <div class="text-xs" style="text-transform:uppercase;font-weight:700;color:${tt.total_due > 0 ? 'var(--danger)' : 'var(--text-muted)'};">Payable</div>
        <div style="font-size:20px;font-weight:700;color:${tt.total_due > 0 ? 'var(--danger)' : 'var(--text-main)'};margin-top:4px;">${rs(tt.total_due)}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Opening</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">${rs(tt.opening)}</div>
      </div>
    </div>

    ${s.address || s.gst ? `
      <div class="card" style="margin-bottom:24px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;margin-bottom:6px;">Details</div>
        ${s.address ? `<div class="text-sm" style="margin-bottom:4px;">📍 ${esc(s.address)}</div>` : ''}
        ${s.gst     ? `<div class="text-sm text-muted;">GSTIN: <span class="mono">${esc(s.gst)}</span></div>` : ''}
      </div>
    ` : ''}

    <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
      <div class="card">
        <div class="card-title">Purchase Bills <small>${bills.length}</small></div>
        ${!bills.length
          ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No bills yet</p>'
          : `<div>${bills.slice(0, 10).map(b => {
              const bal = Number(b.total || 0) - Number(b.paid || 0);
              return `
                <div style="display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;align-items:center;">
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;">${esc(b.bill_no || '—')}</div>
                    <div class="text-xs text-muted">${txDT(b, 'bill_date')}</div>
                  </div>
                  <div style="text-align:right;white-space:nowrap;">
                    <div style="font-weight:600;">${rs(b.total)}</div>
                    <div class="text-xs" style="color:${bal > 0 ? 'var(--danger)' : 'var(--success)'}">
                      ${bal > 0 ? 'Due ' + rs(bal) : 'Paid'}
                    </div>
                  </div>
                  <button class="btn btn-ghost btn-sm" data-bill-del="${b.id}" style="color:var(--danger);">Del</button>
                </div>`;
            }).join('')}</div>`}
      </div>

      <div class="card">
        <div class="card-title">Payments <small>${pays.length}</small></div>
        ${!pays.length
          ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No payments yet</p>'
          : `<div>${pays.slice(0, 10).map(p => `
              <div style="display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;align-items:center;">
                <div style="flex:1;min-width:0;">
                  <div style="color:var(--success);font-weight:600;">
                    ${rs(p.amount)}
                    <span class="text-xs text-muted" style="font-weight:400;">— ${esc(p.mode || '')}</span>
                  </div>
                  <div class="text-xs text-muted">${txDT(p, 'payment_date')}</div>
                </div>
                <button class="btn btn-ghost btn-sm" data-spay-del="${p.id}" style="color:var(--danger);">Del</button>
              </div>`).join('')}</div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Ledger <small>Running balance</small></div>
      ${(() => {
        // Build transaction list
        const tl = [
          // 1. The Bills (Credits - we owe them)
          ...bills.map(b => ({ date: txDate(b, 'bill_date'), type: 'Bill', ref: b.bill_no || 'Purchase', id: b.id, debit: 0, credit: Number(b.total || 0) })),
          // 2. The Payment made AT the time of billing (Debits - we paid)
          ...bills.filter(b => Number(b.paid) > 0).map(b => ({ date: txDate(b, 'bill_date'), type: 'Bill Payment', ref: b.bill_no + ' (Paid)', id: b.id, debit: Number(b.paid), credit: 0 })),
          // 3. Extra Payments (Debits)
          ...pays.map(p => ({ date: txDate(p, 'payment_date'), type: 'Payment', ref: p.mode || 'Payment', id: p.id, debit: Number(p.amount || 0), credit: 0 })),
          // 4. Returns (Debits)
          ...returnsTo.map(r => ({ date: txDate(r, 'return_date'), type: 'Return', ref: r.product_name || 'Return', id: r.id, debit: Number(r.amount || 0), credit: 0 }))
        ].sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          // If same date, put Credits (bills) before Debits (payments) so balance doesn't go negative falsely
          if (a.credit > 0 && b.debit > 0) return -1;
          if (a.debit > 0 && b.credit > 0) return 1;
          return 0;
        });

        let bal = tt.opening;
        const rowsHTML = [];

        if(tt.opening !== 0) {
          rowsHTML.push(`<tr>
            <td>—</td>
            <td><b>Opening Balance</b></td>
            <td style="text-align:right">${tt.opening > 0 ? '—' : rs(-tt.opening)}</td>
            <td style="text-align:right;color:var(--success)">${tt.opening > 0 ? rs(tt.opening) : '—'}</td>
            <td style="text-align:right;font-weight:700;color:${bal > 0 ? 'var(--danger)' : 'var(--success)'}">${rs(Math.abs(bal))}</td>
          </tr>`);
        }

        if(!tl.length) {
          rowsHTML.push(`<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No transactions yet</td></tr>`);
        } else {
          tl.forEach(x => {
            bal += x.credit - x.debit;
            rowsHTML.push(`<tr>
              <td>${fmtDate(x.date)}</td>
              <td>${esc(x.ref || '')}</td>
              <td style="text-align:right;color:var(--success)">${x.debit ? rs(x.debit) : '—'}</td>
              <td style="text-align:right">${x.credit ? rs(x.credit) : '—'}</td>
              <td style="text-align:right;font-weight:700;color:${bal > 0 ? 'var(--danger)' : 'var(--success)'}">${rs(Math.abs(bal))}</td>
            </tr>`);
          });
        }

        return `<div class="table-wrap"><table>
          <thead><tr>
            <th>Date</th><th>Reference</th>
            <th style="text-align:right">Paid</th>
            <th style="text-align:right">Billed</th>
            <th style="text-align:right">Balance</th>
          </tr></thead>
          <tbody>${rowsHTML.join('')}</tbody>
        </table></div>`;
      })()}
    </div>

    <div class="text-center text-xs text-muted" style="padding:20px 0;">${enteredOn(s)}</div>
  `;

  // ── WIRE BUTTONS ──
  $('#btn-edit-s').onclick = () => openSupplierForm(s);
  $('#btn-pay-s').onclick  = () => openSupplierPaymentForm(s);
  $('#btn-buy').onclick    = () => openPurchaseBillForm(s);

  // ── DELETE PURCHASE BILL ──
  $$('[data-bill-del]').forEach(b => b.onclick = async () => {
    const bill = DB.supplier_invoices.find(x => x.id === b.dataset.billDel);
    if(!bill) return;
    
    if(!confirmDlg('Delete bill "' + (bill.bill_no || '—') + '"?\n\nBatches added by this bill will be removed. If any batch has already been sold from, deletion will be blocked.', 'Confirm Delete')) return;

    const items = DB.supplier_invoice_items.filter(x => x.supplier_invoice_id === bill.id);

    // Pre-check: any batch that has been sold from? (qty < original)
    for(const it of items) {
      if(!it.batch_no || !it.expiry_date) continue;
      const batch = DB.product_batches.find(b =>
        b.product_id === it.product_id &&
        b.batch_no === it.batch_no &&
        b.expiry_date === it.expiry_date
      );
      if(batch && Number(batch.qty) < Number(it.qty)) {
        toast('Cannot delete: batch ' + it.batch_no + ' has already been sold from', 'error');
        return;
      }
    }

    // Reverse batch qty
    for(const it of items) {
      if(!it.batch_no || !it.expiry_date) continue;
      const batch = DB.product_batches.find(b =>
        b.product_id === it.product_id &&
        b.batch_no === it.batch_no &&
        b.expiry_date === it.expiry_date
      );
      if(batch) {
        await adjustBatchQty(batch.id, -Number(it.qty));
      }
    }

    const { error } = await sb.from('supplier_invoices').delete().eq('id', bill.id);
    if(error) { 
      console.error(error);
      toast('Failed to delete bill.', 'error'); 
      return; 
    }

    await syncDB();
    toast('Bill deleted · batch stock reversed', 'success');
    route();
  });

  // ── DELETE SUPPLIER PAYMENT ──
  $$('[data-spay-del]').forEach(b => b.onclick = async () => {
    if(!confirmDlg('Delete this payment?', 'Confirm Delete')) return;
    
    const { error } = await sb.from('supplier_payments').delete().eq('id', b.dataset.spayDel);
    if(error) { 
      console.error(error);
      toast('Failed to delete payment.', 'error'); 
      return; 
    }
    
    await syncDB();
    toast('Payment deleted', 'success');
    route();
  });
}

/* ─────────────────────────────────────────────
   39. SUPPLIER PAYMENT FORM
   ───────────────────────────────────────────── */
function openSupplierPaymentForm(s) {
  if(!s) { toast('Supplier not found', 'error'); return; }

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">Pay to ${s.type === 'supplier' ? 'Supplier' : 'Company'}</div>
        <div class="text-xs text-muted" style="margin-top:2px;">To: <b>${esc(s.name)}</b></div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <form id="spf" style="display:flex;flex-direction:column;gap:16px;">
        ${dateTimeFieldHTML(null, '', 'Payment Date')}
        
        <div>
          <label class="label">Amount (₹) *</label>
          <input class="input" type="number" step="any" min="0.01" name="amount" required autofocus>
        </div>
        
        <div>
          <label class="label">Mode</label>
          <select class="input" name="mode">
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank Transfer</option>
            <option value="cheque">Cheque</option>
            <option value="neft">NEFT</option>
          </select>
        </div>
        
        <div>
          <label class="label">Notes</label>
          <input class="input" name="notes" placeholder="Optional reference, cheque no, etc.">
        </div>
      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="spf-save">Save</button>
    </div>
  `, (root) => {
    root.querySelector('#spf-save').onclick = async () => {
      const form = root.querySelector('#spf');
      if(!form.reportValidity()) return;
      
      const dt = readDateTime(form);
      if(!dt) return;
      
      const fd  = new FormData(form);
      const amt = Number(fd.get('amount')) || 0;
      if(amt <= 0) { toast('Amount must be greater than 0', 'error'); return; }

      const btn = root.querySelector('#spf-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      const { error } = await sb.from('supplier_payments').insert({
        supplier_id:   s.id,
        supplier_name: s.name || '',
        amount:        amt,
        mode:          fd.get('mode'),
        notes:         (fd.get('notes') || '').trim(),
        payment_date:  dt.date,
        tx_time:       dt.time
      });

      if(error) {
        console.error(error);
        toast('Failed to save payment.', 'error');
        btn.disabled = false; btn.textContent = 'Save';
        return;
      }
      
      await syncDB();
      toast('Payment saved', 'success');
      closeModal(root);
      route();
    };
  });
}

console.log('[MediStore] Core Logic Block 8 loaded');
/* ─────────────────────────────────────────────
   40. PRODUCTS LIST
   ───────────────────────────────────────────── */
function renderProducts(content) {
  const list = DB.products;
  const categories = [...new Set(list.map(p => p.category).filter(Boolean))].sort();

  const lowCount = list.filter(p => isLowStock(p) || isOutOfStock(p)).length;
  const outCount = list.filter(p => isOutOfStock(p)).length;
  const batchProducts    = list.filter(p => p.batch_managed !== false).length;
  const nonBatchProducts = list.filter(p => p.batch_managed === false).length;

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Products</h1>
        <p>${list.length} SKU${list.length === 1 ? '' : 's'} · ${batchProducts} batch-managed${SETTINGS.enable_non_batch ? ' · ' + nonBatchProducts + ' non-batch' : ''}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" onclick="location.hash='#/batches'">📦 View Batches</button>
        <button class="btn btn-primary" id="add-prod">+ Add Product</button>
      </div>
    </div>

    ${(lowCount || outCount) ? `
      <div class="kpi-row" style="margin-bottom:20px;">
        <div class="kpi-card" style="cursor:pointer;" onclick="document.getElementById('p-filter').value='out';document.getElementById('p-filter').onchange();">
          <div class="kpi-card-top"><div class="kpi-label">Out of Stock</div><div class="kpi-icon" style="color:var(--danger);background:var(--danger-bg);">❌</div></div>
          <div class="kpi-value">${outCount}</div>
        </div>
        <div class="kpi-card" style="cursor:pointer;" onclick="document.getElementById('p-filter').value='low';document.getElementById('p-filter').onchange();">
          <div class="kpi-card-top"><div class="kpi-label">Low Stock</div><div class="kpi-icon" style="color:var(--warning);background:var(--warning-bg);">⚠️</div></div>
          <div class="kpi-value">${lowCount}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card-top"><div class="kpi-label">Near Expiry</div><div class="kpi-icon" style="color:var(--primary);background:var(--primary-light);">⏰</div></div>
          <div class="kpi-value">${nearExpiryBatches().length}</div>
        </div>
      </div>
    ` : ''}

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="p-search" placeholder="Name, company or category...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Company</label>
        <select class="input" id="p-company">
          <option value="">All vendors</option>
          <option value="__none__">Unassigned</option>
          ${DB.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Category</label>
        <select class="input" id="p-cat">
          <option value="">All</option>
          ${categories.map(c => `<option>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="p-sort">
          <option value="name">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="stock">Stock (low first)</option>
          <option value="stock-desc">Stock (high first)</option>
          <option value="expiry">Nearest expiry</option>
        </select>
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <select class="input" id="p-filter">
          <option value="">All</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
          <option value="near">Near-expiry batches</option>
          <option value="expired">Has expired stock</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Unit</th>
            <th style="text-align:right">Stock</th>
            <th style="text-align:right">Batches</th>
            <th>Status</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="p-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="p-mobile"></div>
  `;

  function filtered() {
    const q      = ($('#p-search').value || '').toLowerCase().trim();
    const comp   = $('#p-company').value;
    const cat    = $('#p-cat').value;
    const sortBy = $('#p-sort').value;
    const flt    = $('#p-filter').value;

    let arr = list.filter(p => {
      const hay = ((p.name || '') + ' ' + (p.company || '') + ' ' + (p.category || '')).toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(cat && p.category !== cat) return false;
      if(comp === '__none__' && p.supplier_id) return false;
      if(comp && comp !== '__none__' && p.supplier_id !== comp) return false;

      if(flt === 'low'     && !isLowStock(p))       return false;
      if(flt === 'out'     && !isOutOfStock(p))     return false;
      if(flt === 'near') {
        const hasNear = batchesOf(p.id).some(b =>
          Number(b.qty) > 0 && b.expiry_date && b.expiry_date >= todayStr() && daysToExpiry(b.expiry_date) <= (Number(SETTINGS.near_expiry_days) || 60)
        );
        if(!hasNear) return false;
      }
      if(flt === 'expired') {
        if(expiredStockOf(p.id) <= 0) return false;
      }
      return true;
    });

    if(sortBy === 'name')           arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if(sortBy === 'name-desc') arr.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    else if(sortBy === 'stock')     arr.sort((a, b) => productTotalStock(a) - productTotalStock(b));
    else if(sortBy === 'stock-desc')arr.sort((a, b) => productTotalStock(b) - productTotalStock(a));
    else if(sortBy === 'expiry') {
      arr.sort((a, b) => {
        const ba = fefoBatch(a.id);
        const bb = fefoBatch(b.id);
        const da = ba ? ba.expiry_date : '9999-12-31';
        const db = bb ? bb.expiry_date : '9999-12-31';
        return String(da).localeCompare(String(db));
      });
    }
    return arr;
  }

  function renderList() {
    const arr = filtered();

    // Desktop Table
    const tbody = $('#p-body');
    if(tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No products match</td></tr>`
        : arr.map(p => {
            const stock    = productTotalStock(p);
            const batches  = p.batch_managed === false ? 0 : batchesOf(p.id).filter(b => Number(b.qty) > 0 && (!b.expiry_date || b.expiry_date >= todayStr())).length;
            const company  = p.supplier_id ? DB.suppliers.find(s => s.id === p.supplier_id) : null;
            const isNonBatch = p.batch_managed === false;

            return `<tr>
              <td>
                <strong>${esc(p.name)}</strong>
                ${isNonBatch ? ' <span class="chip chip-neutral" style="font-size:9px;">NON-BATCH</span>' : ''}
                ${company ? `<div class="text-xs" style="color:var(--primary);margin-top:2px;">🏢 ${esc(company.name)}</div>` : ''}
              </td>
              <td><span class="chip chip-neutral">${esc(p.category || '—')}</span></td>
              <td class="text-sm text-muted">${esc(p.unit || '—')}</td>
              <td style="text-align:right;font-weight:600;">${fmtNum(stock)}</td>
              <td style="text-align:right;" class="text-sm text-muted">${isNonBatch ? '—' : batches}</td>
              <td>${stockBadge(p)}</td>
              <td style="text-align:right;white-space:nowrap;">
                ${isNonBatch
                  ? `<button class="btn btn-ghost btn-sm" data-restock="${p.id}">+ Stock</button>`
                  : `<button class="btn btn-ghost btn-sm" data-add-batch="${p.id}">+ Batch</button>`}
                <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-del="${p.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    // Mobile List
    const mob = $('#p-mobile');
    if(mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state"><div class="empty-icon">💊</div><div class="empty-title">No products match</div></div>`
        : arr.map(p => {
            const stock     = productTotalStock(p);
            const isNonBatch= p.batch_managed === false;
            const company   = p.supplier_id ? DB.suppliers.find(s => s.id === p.supplier_id) : null;
            
            return `
              <div class="mobile-card">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc(p.name)}</div>
                    <div class="mobile-card-sub">
                      ${p.category ? esc(p.category) + ' · ' : ''}
                      ${company ? esc(company.name) + ' · ' : ''}
                      ${fmtNum(stock)} ${esc(p.unit || '')}
                    </div>
                  </div>
                  <div>${stockBadge(p)}</div>
                </div>
                <div class="mobile-card-foot">
                  <div style="display:flex;gap:6px;">
                    ${isNonBatch
                      ? `<button class="btn btn-ghost btn-sm" data-restock="${p.id}">+ Stock</button>`
                      : `<button class="btn btn-ghost btn-sm" data-add-batch="${p.id}">+ Batch</button>`}
                    <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
                    <button class="btn btn-ghost btn-sm" data-del="${p.id}" style="color:var(--danger);">Del</button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
    }

    // Attach Event Listeners
    $$('[data-edit]').forEach(b => b.onclick = () => {
      const p = DB.products.find(x => x.id === b.dataset.edit);
      if(p) openProductForm(p);
    });

    $$('[data-add-batch]').forEach(b => b.onclick = () => {
      openBatchForm(null, b.dataset.addBatch);
    });

    $$('[data-restock]').forEach(b => b.onclick = () => openRestockForm(b.dataset.restock));

    $$('[data-del]').forEach(b => b.onclick = async () => {
      const p = DB.products.find(x => x.id === b.dataset.del);
      if(!p) return;

      const batchCount = batchesOf(p.id).length;
      const itemsSold  = DB.invoice_items.filter(i => i.product_id === p.id).length;

      let warn = `Delete product "${p.name}"?`;
      if(batchCount > 0) warn += `\n\n⚠️ ${batchCount} batch${batchCount === 1 ? '' : 'es'} will be deleted.`;
      if(itemsSold > 0)  warn += `\n\n${itemsSold} invoice line(s) will lose the product link, but the name snapshot stays.`;
      warn += `\n\nContinue?`;

      if(!confirmDlg(warn, 'Confirm Delete')) return;

      const { error } = await sb.from('products').delete().eq('id', p.id);
      if(error) { 
        console.error(error);
        toast('Failed to delete product. It may be linked to active records.', 'error'); 
        return; 
      }
      
      await syncDB();
      toast('Product deleted', 'success');
      renderList();
    });
  }

  ['p-search', 'p-company', 'p-cat', 'p-sort', 'p-filter'].forEach(id => {
    const el = $('#' + id);
    if(el) { el.oninput = renderList; el.onchange = renderList; }
  });

  renderList();
  $('#add-prod').onclick = () => openProductForm();
}

/* ─────────────────────────────────────────────
   41. PRODUCT FORM MODAL
   ───────────────────────────────────────────── */
function openProductForm(existing, prefill, onCreated) {
  const isEdit = !!existing;

  const base = existing || {
    name: '', category: '', company: '', supplier_id: null,
    batch_managed: true, unit: 'strip', gst_rate: Number(SETTINGS.gst_rate) || 12,
    mrp: 0, cost: 0, selling_price: 0, stock: 0,
    low_stock_alert: 10, schedule: '', notes: '',
    loose_unit: '', conversion_factor: 1
  };
  
  const p = prefill ? Object.assign({}, base, prefill) : base;

  const showBatchToggle = SETTINGS.enable_non_batch === true;
  const batchManaged    = p.batch_managed !== false;

  const catOptions = MEDICINE_CATEGORIES.map(c => `<option ${p.category === c ? 'selected' : ''}>${c}</option>`).join('');
  const unitOptions = PRODUCT_UNITS.map(u => `<option ${p.unit === u ? 'selected' : ''}>${u}</option>`).join('');
  const gstOptions = GST_RATES.map(r => `<option value="${r}" ${Number(p.gst_rate) === r ? 'selected' : ''}>${r}%</option>`).join('');
  const schOptions = SCHEDULE_TYPES.map(t => `<option value="${t}" ${(p.schedule || '') === t ? 'selected' : ''}>${t || '— None —'}</option>`).join('');
  const supplierOptions = DB.suppliers.map(s => `<option value="${s.id}" ${p.supplier_id === s.id ? 'selected' : ''}>${esc(s.name)} (${s.type === 'supplier' ? 'Supplier' : 'Company'})</option>`).join('');

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Edit Product' : 'New Product'}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <form id="prf" style="display:flex;flex-direction:column;gap:16px;">
        
        <div>
          <label class="label">Product Name *</label>
          <input class="input" name="name" required value="${esc(p.name || '')}" autofocus placeholder="e.g. Paracetamol 500mg">
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Category</label>
            <select class="input" name="category">
              <option value="">— Select —</option>
              ${catOptions}
            </select>
          </div>
          <div>
            <label class="label">Manufacturer / Company</label>
            <input class="input" name="company" value="${esc(p.company || '')}" placeholder="e.g. Cipla, Sun Pharma">
          </div>
        </div>

        <div>
          <label class="label">Linked Vendor</label>
          <select class="input" name="supplier_id">
            <option value="">— None / Unassigned —</option>
            ${supplierOptions}
          </select>
          <div class="field-hint">Used for purchase-bill filtering</div>
        </div>

        ${showBatchToggle ? `
          <div>
            <label class="label">Product Type</label>
            <select class="input" name="batch_managed" ${isEdit ? 'disabled' : ''}>
              <option value="yes" ${batchManaged ? 'selected' : ''}>Batch-managed (Batch No + Expiry required)</option>
              <option value="no"  ${!batchManaged ? 'selected' : ''}>Non-batch (cosmetics, surgicals, general items)</option>
            </select>
            ${isEdit ? '<div class="field-hint" style="color:var(--danger);">⚠ Type cannot be changed after creation</div>' : ''}
          </div>
        ` : ''}

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Base Unit (e.g. Strip)</label>
            <select class="input" name="unit">${unitOptions}</select>
          </div>
          <div>
            <label class="label">GST Rate</label>
            <select class="input" name="gst_rate">${gstOptions}</select>
          </div>
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px;background:var(--bg-app);border-radius:var(--radius-md);border:1px solid var(--border);">
          <div>
            <label class="label">Loose Unit (Optional)</label>
            <input class="input" name="loose_unit" value="${esc(p.loose_unit || '')}" placeholder="e.g. Tablet">
            <div class="field-hint">Leave empty if not sold loose</div>
          </div>
          <div>
            <label class="label">Qty per Base Unit</label>
            <input class="input" type="number" step="any" min="1" name="conversion_factor" value="${p.conversion_factor || 1}" placeholder="e.g. 10">
            <div class="field-hint">How many tablets in 1 strip?</div>
          </div>
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Schedule (internal)</label>
            <select class="input" name="schedule">${schOptions}</select>
            <div class="field-hint">Not printed on bills</div>
          </div>
          <div>
            <label class="label">Low Stock Alert at</label>
            <input class="input" type="number" step="any" min="0" name="low_stock_alert" value="${p.low_stock_alert || 0}">
          </div>
        </div>

        <div id="non-batch-block" style="display:${(!showBatchToggle || batchManaged) ? 'none' : 'block'};">
          <div style="padding:16px;background:var(--primary-light);border-radius:var(--radius-md);border:1px solid var(--primary);margin-bottom:16px;">
            <div class="text-xs" style="font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:12px;">Non-batch fields</div>
            <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div><label class="label">MRP (₹)</label>
                <input class="input" type="number" step="any" min="0" name="mrp" value="${p.mrp || 0}"></div>
              <div><label class="label">Cost Price (₹)</label>
                <input class="input" type="number" step="any" min="0" name="cost" value="${p.cost || 0}"></div>
              <div><label class="label">Selling Price (₹)</label>
                <input class="input" type="number" step="any" min="0" name="selling_price" value="${p.selling_price || 0}"></div>
              <div><label class="label">Opening Stock</label>
                <input class="input" type="number" step="any" min="0" name="stock" value="${p.stock || 0}"></div>
            </div>
          </div>
        </div>

        <div>
          <label class="label">Notes</label>
          <input class="input" name="notes" value="${esc(p.notes || '')}" placeholder="Optional">
        </div>

        ${batchManaged || !showBatchToggle ? `
          <p class="field-hint">💡 Stock and pricing for this product live in <b>batches</b>. Add stock via a Purchase Bill or the "+ Batch" button.</p>
        ` : ''}

      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="prf-save">${isEdit ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    // Toggle batch-managed fields
    const dualSel = root.querySelector('[name="batch_managed"]');
    const nbBlock = root.querySelector('#non-batch-block');

    if(dualSel && nbBlock) {
      dualSel.addEventListener('change', () => {
        const isNonBatch = dualSel.value === 'no';
        nbBlock.style.display = isNonBatch ? 'block' : 'none';
        
        if(isNonBatch && !nbBlock.querySelector('[name="mrp"]')) {
          // Inject fields if they were conditionally rendered out
          nbBlock.innerHTML = `
            <div style="padding:16px;background:var(--primary-light);border-radius:var(--radius-md);border:1px solid var(--primary);margin-bottom:16px;">
              <div class="text-xs" style="font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:12px;">Non-batch fields</div>
              <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <div><label class="label">MRP (₹)</label>
                  <input class="input" type="number" step="any" min="0" name="mrp" value="${p.mrp || 0}"></div>
                <div><label class="label">Cost Price (₹)</label>
                  <input class="input" type="number" step="any" min="0" name="cost" value="${p.cost || 0}"></div>
                <div><label class="label">Selling Price (₹)</label>
                  <input class="input" type="number" step="any" min="0" name="selling_price" value="${p.selling_price || 0}"></div>
                <div><label class="label">Opening Stock</label>
                  <input class="input" type="number" step="any" min="0" name="stock" value="${p.stock || 0}"></div>
              </div>
            </div>`;
        }
      });
    }

    // Submit
    root.querySelector('#prf-save').onclick = async () => {
      const form = root.querySelector('#prf');
      if(!form.reportValidity()) return;

      const fd   = new FormData(form);
      const name = (fd.get('name') || '').trim();

      let isBatchManaged;
      if(!showBatchToggle) isBatchManaged = true;
      else if(isEdit) isBatchManaged = existing.batch_managed !== false;
      else isBatchManaged = (fd.get('batch_managed') || 'yes') === 'yes';

      const common = {
        name,
        category:        (fd.get('category') || '').trim(),
        company:         (fd.get('company') || '').trim(),
        supplier_id:     fd.get('supplier_id') || null,
        unit:            fd.get('unit') || 'strip',
        gst_rate:        Number(fd.get('gst_rate')) || 0,
        low_stock_alert: Number(fd.get('low_stock_alert')) || 0,
        schedule:        (fd.get('schedule') || '').trim(),
        notes:           (fd.get('notes') || '').trim(),
        batch_managed:   isBatchManaged,
        loose_unit:      (fd.get('loose_unit') || '').trim() || null,
        conversion_factor: Number(fd.get('conversion_factor')) || 1
      };

      let data;
      if(isBatchManaged) {
        data = Object.assign({}, common, { mrp: 0, cost: 0, selling_price: 0, stock: 0 });
      } else {
        data = Object.assign({}, common, {
          mrp:            Number(fd.get('mrp'))           || 0,
          cost:           Number(fd.get('cost'))          || 0,
          selling_price:  Number(fd.get('selling_price')) || 0,
          stock:          Number(fd.get('stock'))         || 0
        });
      }

      const btn = root.querySelector('#prf-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      let res;
      if(isEdit) res = await sb.from('products').update(data).eq('id', existing.id).select().single();
      else       res = await sb.from('products').insert(data).select().single();

      if(res.error) {
        console.error(res.error);
        toast('Failed to save product details.', 'error');
        btn.disabled = false; btn.textContent = isEdit ? 'Update' : 'Save';
        return;
      }
      
      await syncDB();
      toast(isEdit ? 'Updated' : 'Product added', 'success');
      closeModal(root);
      if(onCreated) onCreated(res.data);
      else route();
    };
  });
}

/* ─────────────────────────────────────────────
   42. QUICK PRODUCT FORM (Used in Purchase Bills)
   ───────────────────────────────────────────── */
function openQuickProductForm(onCreated) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Quick Add Product</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <p class="text-sm text-muted" style="margin-bottom:16px;">Fill the basics — stock will come from the purchase bill's batch.</p>
      
      <form id="qpf" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="label">Product Name *</label>
          <input class="input" name="name" required autofocus placeholder="e.g. Paracetamol 500mg">
        </div>
        
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Unit</label>
            <select class="input" name="unit">
              ${PRODUCT_UNITS.map(u => `<option>${u}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="label">Category</label>
            <select class="input" name="category">
              <option value="">— Select —</option>
              ${MEDICINE_CATEGORIES.map(c => `<option>${c}</option>`).join('')}
            </select>
          </div>
        </div>
      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" style="margin-right:auto;" id="qpf-more">⚙ More options</button>
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="qpf-save">Save & Add</button>
    </div>
  `, (root) => {
    root.querySelector('#qpf-more').onclick = (e) => {
      e.preventDefault();
      const fd = new FormData(root.querySelector('#qpf'));
      const prefill = {
        name:     (fd.get('name') || '').trim(),
        unit:     fd.get('unit') || 'strip',
        category: fd.get('category') || ''
      };
      closeModal(root);
      openProductForm(null, prefill, onCreated);
    };

    root.querySelector('#qpf-save').onclick = async () => {
      const form = root.querySelector('#qpf');
      if(!form.reportValidity()) return;

      const fd   = new FormData(form);
      const name = (fd.get('name') || '').trim();

      const data = {
        name,
        category:        fd.get('category') || '',
        company:         '',
        supplier_id:     null,
        unit:            fd.get('unit') || 'strip',
        gst_rate:        Number(SETTINGS.gst_rate) || 12,
        low_stock_alert: 10,
        schedule:        '',
        notes:           '',
        batch_managed:   true,
        mrp: 0, cost: 0, selling_price: 0, stock: 0
      };

      const btn = root.querySelector('#qpf-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      const res = await sb.from('products').insert(data).select().single();
      if(res.error) {
        console.error(res.error);
        toast('Failed to add product.', 'error');
        btn.disabled = false; btn.textContent = 'Save & Add';
        return;
      }
      
      await syncDB();
      toast('Product added', 'success');
      closeModal(root);
      if(onCreated) onCreated(res.data);
    };
  });
}

/* ─────────────────────────────────────────────
   43. RESTOCK FORM (Non-batch only)
   ───────────────────────────────────────────── */
function openRestockForm(productId) {
  const p = DB.products.find(x => x.id === productId);
  if(!p) return;

  if(p.batch_managed !== false) {
    toast('Use "+ Batch" to add stock for this product', 'info');
    return;
  }

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Restock: ${esc(p.name)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <div style="padding:12px 16px;background:var(--bg-app);border-radius:var(--radius-md);margin-bottom:20px;font-size:13px;">
        Current stock: <b>${fmtNum(p.stock)} ${esc(p.unit || '')}</b>
      </div>
      
      <form id="rf" style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="label">Quantity to Add *</label>
          <input class="input" type="number" step="any" min="0.01" name="qty" required autofocus placeholder="e.g. 20">
        </div>
        <div>
          <label class="label">Update cost price? (optional)</label>
          <input class="input" type="number" step="any" min="0" name="cost" value="${p.cost || 0}">
        </div>
      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="rf-save">Add Stock</button>
    </div>
  `, (root) => {
    root.querySelector('#rf-save').onclick = async () => {
      const form = root.querySelector('#rf');
      if(!form.reportValidity()) return;

      const fd  = new FormData(form);
      const qty = Number(fd.get('qty')) || 0;
      if(qty <= 0) { toast('Quantity must be greater than 0', 'error'); return; }

      const newCost = Number(fd.get('cost')) || 0;

      const btn = root.querySelector('#rf-save');
      btn.disabled = true; btn.textContent = 'Updating...';

      const ok = await adjustProductStock(p.id, qty);
      if(!ok) {
        toast('Failed to update stock', 'error');
        btn.disabled = false; btn.textContent = 'Add Stock';
        return;
      }
      if(newCost > 0) {
        await sb.from('products').update({ cost: newCost }).eq('id', p.id);
      }
      
      await syncDB();
      toast('Stock added', 'success');
      closeModal(root);
      route();
    };
  });
}

console.log('[MediStore] Core Logic Block 9 loaded');
/* ─────────────────────────────────────────────
   44. BATCHES LIST PAGE
   ───────────────────────────────────────────── */
function renderBatches(content) {
  const today = todayStr();
  const all   = DB.product_batches;

  const sellable  = all.filter(b => Number(b.qty) > 0 && b.expiry_date && b.expiry_date >= today).length;
  const nearList  = all.filter(b => Number(b.qty) > 0 && b.expiry_date && b.expiry_date >= today && daysToExpiry(b.expiry_date) <= (SETTINGS.near_expiry_days || 60));
  const expList   = all.filter(b => Number(b.qty) > 0 && b.expiry_date && b.expiry_date < today);
  
  const expiredValue = expList.reduce((s, b) => s + (Number(b.qty) * Number(b.cost || 0)), 0);

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Batches</h1>
        <p>${all.length} batch${all.length === 1 ? '' : 'es'} across ${new Set(all.map(b => b.product_id)).size} products</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-batch-free">+ Add Batch</button>
      </div>
    </div>

    <div class="kpi-row" style="margin-bottom:20px;">
      <div class="kpi-card" style="cursor:pointer;" onclick="document.getElementById('b-filter').value='sellable';document.getElementById('b-filter').onchange();">
        <div class="kpi-card-top"><div class="kpi-label">Sellable</div><div class="kpi-icon" style="color:var(--success);background:var(--success-bg);">✅</div></div>
        <div class="kpi-value">${sellable}</div>
      </div>
      <div class="kpi-card" style="cursor:pointer;" onclick="document.getElementById('b-filter').value='near';document.getElementById('b-filter').onchange();">
        <div class="kpi-card-top"><div class="kpi-label">Near Expiry</div><div class="kpi-icon" style="color:var(--warning);background:var(--warning-bg);">⏰</div></div>
        <div class="kpi-value">${nearList.length}</div>
      </div>
      <div class="kpi-card" style="cursor:pointer;" onclick="document.getElementById('b-filter').value='expired';document.getElementById('b-filter').onchange();">
        <div class="kpi-card-top"><div class="kpi-label">Expired</div><div class="kpi-icon" style="color:var(--danger);background:var(--danger-bg);">⚠️</div></div>
        <div class="kpi-value">${expList.length}</div>
      </div>
    </div>

    ${expList.length > 0 ? `
      <div class="card" style="background:var(--danger-bg);border-color:var(--danger);margin-bottom:20px;">
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
          <div style="font-size:24px;">⚠️</div>
          <div style="flex:1;min-width:200px;">
            <div style="font-weight:700;color:var(--danger);">Expired stock detected</div>
            <div class="text-sm" style="color:var(--text-main);margin-top:2px;">
              ${expList.length} batch${expList.length === 1 ? '' : 'es'} · Estimated cost value: <b>${rs(expiredValue)}</b>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('b-filter').value='expired';document.getElementById('b-filter').onchange();" style="border-color:var(--danger);color:var(--danger);">
            Review →
          </button>
        </div>
      </div>
    ` : ''}

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="b-search" placeholder="Product name or batch no...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="b-sort">
          <option value="expiry">Expiry (earliest first)</option>
          <option value="expiry-desc">Expiry (latest first)</option>
          <option value="qty">Qty (low first)</option>
          <option value="qty-desc">Qty (high first)</option>
          <option value="product">Product name</option>
        </select>
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <select class="input" id="b-filter">
          <option value="">All batches</option>
          <option value="sellable">Sellable only</option>
          <option value="near">Near expiry</option>
          <option value="expired">Expired</option>
          <option value="empty">Empty (qty ≤ 0)</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Batch No</th>
            <th>Expiry</th>
            <th style="text-align:right">Qty</th>
            <th style="text-align:right">Cost</th>
            <th style="text-align:right">MRP</th>
            <th style="text-align:right">Sell</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="b-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="b-mobile"></div>
  `;

  function filtered() {
    const q      = ($('#b-search').value || '').toLowerCase().trim();
    const sortBy = $('#b-sort').value;
    const flt    = $('#b-filter').value;
    const today  = todayStr();
    const nearCutoff = (() => {
      const c = new Date();
      c.setDate(c.getDate() + (Number(SETTINGS.near_expiry_days) || 60));
      return c.toISOString().slice(0, 10);
    })();

    let arr = all.slice();

    arr = arr.filter(b => {
      const prod = DB.products.find(p => p.id === b.product_id);
      const hay = ((prod && prod.name) || '') + ' ' + (b.batch_no || '');
      if(q && !hay.toLowerCase().includes(q)) return false;

      if(flt === 'sellable') {
        if(!(Number(b.qty) > 0 && b.expiry_date && b.expiry_date >= today)) return false;
      }
      if(flt === 'near') {
        if(!(Number(b.qty) > 0 && b.expiry_date && b.expiry_date >= today && b.expiry_date <= nearCutoff)) return false;
      }
      if(flt === 'expired') {
        if(!(Number(b.qty) > 0 && b.expiry_date && b.expiry_date < today)) return false;
      }
      if(flt === 'empty') {
        if(Number(b.qty) > 0) return false;
      }
      return true;
    });

    if(sortBy === 'expiry')           arr.sort((a, b) => String(a.expiry_date || '').localeCompare(String(b.expiry_date || '')));
    else if(sortBy === 'expiry-desc') arr.sort((a, b) => String(b.expiry_date || '').localeCompare(String(a.expiry_date || '')));
    else if(sortBy === 'qty')         arr.sort((a, b) => Number(a.qty || 0) - Number(b.qty || 0));
    else if(sortBy === 'qty-desc')    arr.sort((a, b) => Number(b.qty || 0) - Number(a.qty || 0));
    else if(sortBy === 'product') {
      arr.sort((a, b) => {
        const pa = DB.products.find(p => p.id === a.product_id);
        const pb = DB.products.find(p => p.id === b.product_id);
        return ((pa && pa.name) || '').localeCompare((pb && pb.name) || '');
      });
    }
    return arr;
  }

  function renderList() {
    const arr = filtered();

    // Desktop Table
    const tbody = $('#b-body');
    if(tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">No batches match</td></tr>`
        : arr.map(b => {
            const prod = DB.products.find(p => p.id === b.product_id);
            const exp  = expiryInfo(b.expiry_date);
            const isExpired = exp.status === 'expired';
            const isNear    = exp.status === 'near';
            const isEmpty   = Number(b.qty) <= 0;

            // Add background tint for expired/near-expiry rows
            const rowStyle = isExpired ? 'style="background:rgba(239, 68, 68, 0.05)"' : (isNear ? 'style="background:rgba(245, 158, 11, 0.05)"' : '');

            return `<tr ${rowStyle}>
              <td><strong>${esc((prod && prod.name) || '—')}</strong></td>
              <td><span class="chip chip-neutral" style="font-family:monospace"><b>${esc(b.batch_no || '—')}</b></span></td>
              <td>
                <div>${fmtDate(b.expiry_date)}</div>
                <div style="margin-top:3px;">${renderExpiryBadge(b.expiry_date)}</div>
              </td>
              <td style="text-align:right;font-weight:600;color:${isEmpty ? 'var(--text-light)' : (isExpired ? 'var(--danger)' : 'var(--text-main)')};">${fmtNum(b.qty)}</td>
              <td style="text-align:right;" class="text-sm text-muted">${rs(b.cost)}</td>
              <td style="text-align:right;" class="text-sm text-muted">${rs(b.mrp)}</td>
              <td style="text-align:right;" class="text-sm">${rs(b.selling_price)}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-edit-batch="${b.id}">Edit</button>
                <button class="btn btn-ghost btn-sm" data-del-batch="${b.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    // Mobile List
    const mob = $('#b-mobile');
    if(mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No batches match</div></div>`
        : arr.map(b => {
            const prod = DB.products.find(p => p.id === b.product_id);
            const exp  = expiryInfo(b.expiry_date);
            const isEmpty = Number(b.qty) <= 0;

            return `
              <div class="mobile-card">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc((prod && prod.name) || '—')}</div>
                    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                      <span class="chip chip-neutral" style="font-family:monospace"><b>${esc(b.batch_no || '—')}</b></span>
                      ${renderExpiryBadge(b.expiry_date)}
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:800;font-size:16px;color:${isEmpty ? 'var(--text-light)' : 'var(--text-main)'};">${fmtNum(b.qty)}</div>
                    <div class="text-xs text-muted">${esc((prod && prod.unit) || '')}</div>
                  </div>
                </div>
                <div style="display:flex;gap:12px;font-size:11px;color:var(--text-muted);margin-bottom:12px;">
                  <span>Cost ${rs(b.cost)}</span>
                  <span>MRP ${rs(b.mrp)}</span>
                  <span>Sell ${rs(b.selling_price)}</span>
                </div>
                <div class="mobile-card-foot" style="padding-top:12px;">
                  <div style="display:flex;gap:8px;">
                    <button class="btn btn-ghost btn-sm" data-edit-batch="${b.id}">Edit</button>
                    <button class="btn btn-ghost btn-sm" data-del-batch="${b.id}" style="color:var(--danger);">Delete</button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
    }

    // Attach Event Listeners
    $$('[data-edit-batch]').forEach(btn => btn.onclick = () => {
      const b = DB.product_batches.find(x => x.id === btn.dataset.editBatch);
      if(b) openBatchForm(b);
    });

    $$('[data-del-batch]').forEach(btn => btn.onclick = async () => {
      const b = DB.product_batches.find(x => x.id === btn.dataset.delBatch);
      if(!b) return;
      const prod = DB.products.find(p => p.id === b.product_id);

      let warn = `Delete batch "${b.batch_no}" of ${prod ? prod.name : 'product'}?`;
      if(Number(b.qty) > 0) warn += `\n\n⚠️ This batch still has ${fmtNum(b.qty)} ${prod ? prod.unit || '' : ''} in stock.`;
      warn += `\n\nContinue?`;
      
      if(!confirmDlg(warn, 'Confirm Delete')) return;

      const { error } = await sb.from('product_batches').delete().eq('id', b.id);
      if(error) { 
        console.error(error);
        toast('Failed to delete batch.', 'error'); 
        return; 
      }
      
      await syncDB();
      toast('Batch deleted', 'success');
      renderList();
    });
  }

  ['b-search', 'b-sort', 'b-filter'].forEach(id => {
    const el = $('#' + id);
    if(el) { el.oninput = renderList; el.onchange = renderList; }
  });

  renderList();
  $('#add-batch-free').onclick = () => openProductPickerForBatch();
}

/* ─────────────────────────────────────────────
   45. PRODUCT PICKER (Before creating a batch)
   ───────────────────────────────────────────── */
function openProductPickerForBatch() {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Choose Product</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <p class="text-sm text-muted" style="margin-bottom:16px;">Pick the product this batch belongs to.</p>
      <div id="pp-ss-wrap" style="min-height: 280px;"></div>
    </div>
    
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `, (root) => {
    const wrap = root.querySelector('#pp-ss-wrap');
    wrap.innerHTML = searchSelectHTML('pp-ss', 'Search product...');

    // Only batch-managed products can have batches
    const items = DB.products
      .filter(p => p.batch_managed !== false)
      .map(productToOption);

    mountSearchSelect(wrap.querySelector('#pp-ss'), {
      items,
      allowAdd: true,
      addLabel: 'Add new product',
      onSelect: (opt) => {
        if(!opt) return;
        closeModal(root);
        openBatchForm(null, opt.id);
      },
      onAdd: () => {
        closeModal(root);
        openQuickProductForm((prod) => {
          // After creating, open batch form for it
          openBatchForm(null, prod.id);
        });
      }
    });
  });
}

/* ─────────────────────────────────────────────
   46. BATCH FORM MODAL
   ───────────────────────────────────────────── */
function openBatchForm(existing, productId) {
  const isEdit = !!existing;

  const resolvedProductId = existing ? existing.product_id : productId;
  const product = DB.products.find(p => p.id === resolvedProductId);
  if(!product) {
    toast('Product not found', 'error');
    return;
  }

  const b = existing || {
    batch_no: '',
    expiry_date: '',
    qty: 0,
    cost: product.cost || 0,
    mrp: product.mrp || 0,
    selling_price: product.selling_price || 0,
    supplier_id: product.supplier_id || null
  };

  const supplierOptions = DB.suppliers
    .map(s => `<option value="${s.id}" ${b.supplier_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`)
    .join('');

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">${isEdit ? 'Edit' : 'Add'} Batch</div>
        <div class="text-xs text-muted" style="margin-top:2px;">For: <b>${esc(product.name)}</b></div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <form id="bf" style="display:flex;flex-direction:column;gap:16px;">
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Batch No *</label>
            <input class="input" name="batch_no" required value="${esc(b.batch_no || '')}" placeholder="e.g. AB1234" autofocus>
          </div>
          <div>
            <label class="label">Expiry Date *</label>
            <input class="input" type="date" name="expiry_date" required value="${esc(b.expiry_date || '')}">
          </div>
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Quantity *</label>
            <input class="input" type="number" step="any" min="0" name="qty" required value="${b.qty || 0}">
            <div class="field-hint">Current sellable quantity in this batch</div>
          </div>
          <div>
            <label class="label">Cost / Unit (₹)</label>
            <input class="input" type="number" step="any" min="0" name="cost" value="${b.cost || 0}">
          </div>
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">MRP (₹)</label>
            <input class="input" type="number" step="any" min="0" name="mrp" value="${b.mrp || 0}">
          </div>
          <div>
            <label class="label">Selling Price (₹)</label>
            <input class="input" type="number" step="any" min="0" name="selling_price" value="${b.selling_price || 0}">
            <div class="field-hint">Defaults to MRP if left 0</div>
          </div>
        </div>

        <div>
          <label class="label">Supplier</label>
          <select class="input" name="supplier_id">
            <option value="">— None —</option>
            ${supplierOptions}
          </select>
        </div>
      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="bf-save">${isEdit ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    const mrpInput = root.querySelector('[name="mrp"]');
    const spInput  = root.querySelector('[name="selling_price"]');

    if(!isEdit) {
      mrpInput.addEventListener('input', () => {
        if(!spInput.value || Number(spInput.value) === 0) {
          spInput.value = mrpInput.value;
        }
      });
    }

    root.querySelector('#bf-save').onclick = async () => {
      const form = root.querySelector('#bf');
      if(!form.reportValidity()) return;

      const fd = new FormData(form);

      const batch_no = (fd.get('batch_no') || '').trim();
      const expiry   = fd.get('expiry_date') || '';
      const qty      = Number(fd.get('qty')) || 0;
      const cost     = Number(fd.get('cost')) || 0;
      const mrp      = Number(fd.get('mrp')) || 0;
      const sp       = Number(fd.get('selling_price')) || mrp;
      const supId    = fd.get('supplier_id') || null;

      if(!batch_no) { toast('Batch number is required', 'error'); return; }
      if(!expiry) { toast('Expiry date is required', 'error'); return; }
      if(qty < 0) { toast('Quantity cannot be negative', 'error'); return; }

      if(!isEdit) {
        const dup = DB.product_batches.find(x =>
          x.product_id === product.id &&
          x.batch_no === batch_no &&
          x.expiry_date === expiry
        );
        if(dup) {
          toast('A batch with this batch no + expiry already exists', 'error');
          return;
        }
      }

      const data = {
        product_id:    product.id,
        batch_no,
        expiry_date:   expiry,
        qty,
        cost,
        mrp,
        selling_price: sp || mrp,
        supplier_id:   supId
      };

      const btn = root.querySelector('#bf-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      let res;
      if(isEdit) res = await sb.from('product_batches').update(data).eq('id', existing.id).select().single();
      else       res = await sb.from('product_batches').insert(data).select().single();

      if(res.error) {
        console.error(res.error);
        toast('Failed to save batch details.', 'error');
        btn.disabled = false; btn.textContent = isEdit ? 'Update' : 'Save';
        return;
      }
      
      await syncDB();
      toast(isEdit ? 'Batch updated' : 'Batch added', 'success');
      closeModal(root);
      route();
    };
  });
}

console.log('[MediStore] Core Logic Block 10 loaded');
/* ─────────────────────────────────────────────
   47. PURCHASES LIST PAGE
   ───────────────────────────────────────────── */
function renderPurchases(content) {
  const list = DB.supplier_invoices;

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Purchases</h1>
        <p>${list.length} bill${list.length === 1 ? '' : 's'} · ${DB.suppliers.length} vendors</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="pu-new">+ New Purchase Bill</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="pu-search" placeholder="Bill no or vendor name...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="pu-sort">
          <option value="date-desc">Newest first</option>
          <option value="date">Oldest first</option>
          <option value="due-desc">Balance (high)</option>
          <option value="total-desc">Total (high)</option>
        </select>
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <select class="input" id="pu-filter">
          <option value="">All</option>
          <option value="due">Only with balance</option>
          <option value="paid">Fully paid</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Bill No</th>
            <th>Vendor</th>
            <th>Date</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:right">Paid</th>
            <th style="text-align:right">Balance</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="pu-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="pu-mobile"></div>
  `;

  function filtered() {
    const q      = ($('#pu-search').value || '').toLowerCase().trim();
    const sortBy = $('#pu-sort').value;
    const flt    = $('#pu-filter').value;

    let arr = list.filter(b => {
      const sup = DB.suppliers.find(s => s.id === b.supplier_id);
      const hay = ((b.bill_no || '') + ' ' + (b.supplier_name || '') + ' ' + ((sup && sup.name) || '')).toLowerCase();
      if(q && !hay.includes(q)) return false;
      
      const bal = Number(b.total || 0) - Number(b.paid || 0);
      if(flt === 'due'  && bal <= 0) return false;
      if(flt === 'paid' && bal > 0)  return false;
      return true;
    });

    if(sortBy === 'date-desc')  arr.sort((a, b) => txDate(b, 'bill_date').localeCompare(txDate(a, 'bill_date')));
    else if(sortBy === 'date')  arr.sort((a, b) => txDate(a, 'bill_date').localeCompare(txDate(b, 'bill_date')));
    else if(sortBy === 'due-desc') arr.sort((a, b) => (Number(b.total || 0) - Number(b.paid || 0)) - (Number(a.total || 0) - Number(a.paid || 0)));
    else if(sortBy === 'total-desc') arr.sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
    return arr;
  }

  function renderList() {
    const arr = filtered();

    // Desktop Table
    const tbody = $('#pu-body');
    if(tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No purchases yet</td></tr>`
        : arr.map(b => {
            const sup = DB.suppliers.find(s => s.id === b.supplier_id);
            const bal = Number(b.total || 0) - Number(b.paid || 0);
            const supName = b.supplier_name || (sup && sup.name) || '—';
            return `<tr>
              <td><strong>${esc(b.bill_no || '—')}</strong></td>
              <td><a href="#/supplier/${b.supplier_id}" style="font-weight:600;color:var(--text-main);text-decoration:none;">${esc(supName)}</a></td>
              <td class="text-sm text-muted">${txDT(b, 'bill_date')}</td>
              <td style="text-align:right;">${rs(b.total)}</td>
              <td style="text-align:right;color:var(--success);">${rs(b.paid)}</td>
              <td style="text-align:right;font-weight:${bal > 0 ? '600' : '400'};color:${bal > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${rs(bal)}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-view="${b.supplier_id}">View</button>
              </td>
            </tr>`;
          }).join('');
    }

    // Mobile List
    const mob = $('#pu-mobile');
    if(mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state"><div class="empty-icon">🛒</div><div class="empty-title">No purchases yet</div></div>`
        : arr.map(b => {
            const sup = DB.suppliers.find(s => s.id === b.supplier_id);
            const bal = Number(b.total || 0) - Number(b.paid || 0);
            const supName = b.supplier_name || (sup && sup.name) || '—';
            return `
              <a href="#/supplier/${b.supplier_id}" class="mobile-card" style="text-decoration:none;color:inherit;">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc(b.bill_no || '—')} · ${esc(supName)}</div>
                    <div class="mobile-card-sub">${txDT(b, 'bill_date')}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;">${rs(b.total)}</div>
                    <div class="text-xs" style="color:${bal > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600;margin-top:2px;">
                      ${bal > 0 ? 'Bal ' + rs(bal) : 'Paid'}
                    </div>
                  </div>
                </div>
              </a>`;
          }).join('');
    }

    $$('[data-view]').forEach(b => b.onclick = () => location.hash = '#/supplier/' + b.dataset.view);
  }

  ['pu-search', 'pu-sort', 'pu-filter'].forEach(id => {
    const el = $('#' + id);
    if(el) { el.oninput = renderList; el.onchange = renderList; }
  });

  renderList();

  $('#pu-new').onclick = () => {
    if(DB.suppliers.length === 0) {
      toast('Add a vendor first', 'info');
      location.hash = '#/companies';
      return;
    }
    openSupplierPickerForPurchase();
  };
}

/* ─────────────────────────────────────────────
   48. SUPPLIER PICKER (Before creating a purchase bill)
   ───────────────────────────────────────────── */
function openSupplierPickerForPurchase() {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Choose Vendor</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <p class="text-sm text-muted" style="margin-bottom:16px;">Pick the company or supplier for this purchase.</p>
      <div id="vnd-ss-wrap" style="min-height: 280px;"></div>
    </div>
    
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `, (root) => {
    const wrap = root.querySelector('#vnd-ss-wrap');
    wrap.innerHTML = searchSelectHTML('vnd-ss', 'Search vendor...');

    const items = DB.suppliers.map(supplierToOption);

    mountSearchSelect(wrap.querySelector('#vnd-ss'), {
      items,
      allowAdd: true,
      addLabel: 'Add new vendor',
      onSelect: (opt) => {
        if(!opt) return;
        const sup = DB.suppliers.find(s => s.id === opt.id);
        if(!sup) return;
        closeModal(root);
        openPurchaseBillForm(sup);
      },
      onAdd: () => {
        closeModal(root);
        openSupplierForm(null, 'company');
      }
    });
  });
}

/* ─────────────────────────────────────────────
   49. PURCHASE BILL FORM (Batch-Creating)
   ───────────────────────────────────────────── */
function openPurchaseBillForm(supplier, existing) {
  if(!supplier) { toast('Vendor not found', 'error'); return; }

  const isEdit = !!existing;

  // Load existing lines if editing
  let billLines = isEdit
    ? DB.supplier_invoice_items
        .filter(x => x.supplier_invoice_id === existing.id)
        .map(x => ({
          product_id:    x.product_id,
          product_name:  x.product_name,
          unit:          x.unit || '',
          batch_no:      x.batch_no || '',
          expiry_date:   x.expiry_date || '',
          qty:           Number(x.qty)   || 0,
          cost:          Number(x.cost)  || 0,
          mrp:           Number(x.mrp)   || 0,
          selling_price: Number(x.selling_price) || 0,
          total:         Number(x.total) || 0
        }))
    : [];

  const b = existing || {
    bill_no:   '',
    bill_date: todayStr(),
    tx_time:   '',
    discount:  0,
    paid:      0,
    notes:     ''
  };

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">${isEdit ? 'Edit' : 'New'} Purchase Bill</div>
        <div class="text-xs text-muted" style="margin-top:2px;">From: <b>${esc(supplier.name)}</b></div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <form id="pb-form" style="display:flex;flex-direction:column;gap:16px;">
        
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Bill No</label>
            <input class="input" name="bill_no" value="${esc(b.bill_no || '')}" placeholder="Vendor's bill number">
          </div>
          <div>
            <label class="label">Bill Date *</label>
            <input class="input" type="date" name="tx_date" required max="${todayStr()}" value="${b.bill_date || todayStr()}">
          </div>
        </div>

        <div>
          <label class="label">Add Item</label>
          ${searchSelectHTML('pb-prod-ss', 'Search or add product...')}
          <div class="field-hint">💊 Batch No + Expiry are required for each line</div>
        </div>

        <div id="pb-lines" style="background:var(--bg-app);border-radius:var(--radius-md);padding:12px;border:1px solid var(--border);"></div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Discount (₹)</label>
            <input class="input" type="number" step="any" min="0" id="pb-disc" name="discount" value="${b.discount || 0}">
          </div>
          <div>
            <label class="label">Paid Now (₹)</label>
            <input class="input" type="number" step="any" min="0" id="pb-paid" name="paid" value="${b.paid || 0}">
          </div>
        </div>

        <div>
          <label class="label">Notes</label>
          <input class="input" name="notes" value="${esc(b.notes || '')}">
        </div>

        <div id="pb-summary" style="background:var(--bg-card);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border);font-size:13px;display:flex;flex-direction:column;gap:8px;"></div>

      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="pb-save">${isEdit ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {

    // ── Render Lines ──
    function renderLines() {
      const box = root.querySelector('#pb-lines');
      if(!billLines.length) {
        box.innerHTML = '<p class="text-sm text-muted text-center" style="padding:16px 0;">No items added yet. Search a product above.</p>';
        updateSummary();
        return;
      }

      box.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;min-width:750px;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:var(--bg-card);">
                <th style="text-align:left;padding:8px 6px;font-size:10px;">Product</th>
                <th style="text-align:left;padding:8px 6px;font-size:10px;">Batch</th>
                <th style="text-align:left;padding:8px 6px;font-size:10px;">Expiry</th>
                <th style="text-align:right;padding:8px 6px;font-size:10px;">Qty</th>
                <th style="text-align:right;padding:8px 6px;font-size:10px;">Cost</th>
                <th style="text-align:right;padding:8px 6px;font-size:10px;">MRP</th>
                <th style="text-align:right;padding:8px 6px;font-size:10px;">Sell</th>
                <th style="text-align:right;padding:8px 6px;font-size:10px;">Total</th>
                <th style="padding:8px 6px;"></th>
              </tr>
            </thead>
            <tbody>
              ${billLines.map((l, i) => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:6px;font-weight:600;">${esc(l.product_name)}</td>
                  <td style="padding:6px;"><input class="input" data-i="${i}" data-f="batch_no" value="${esc(l.batch_no || '')}" placeholder="Batch" style="width:80px;height:30px;padding:4px 8px;font-size:12px;"></td>
                  <td style="padding:6px;"><input class="input" type="date" data-i="${i}" data-f="expiry_date" value="${esc(l.expiry_date || '')}" style="width:120px;height:30px;padding:4px 8px;font-size:12px;"></td>
                  <td style="padding:6px;text-align:right;"><input class="input" type="number" step="any" min="0.01" data-i="${i}" data-f="qty" value="${l.qty}" style="width:60px;height:30px;padding:4px 8px;font-size:12px;text-align:right;"></td>
                  <td style="padding:6px;text-align:right;"><input class="input" type="number" step="any" min="0" data-i="${i}" data-f="cost" value="${l.cost}" style="width:70px;height:30px;padding:4px 8px;font-size:12px;text-align:right;"></td>
                  <td style="padding:6px;text-align:right;"><input class="input" type="number" step="any" min="0" data-i="${i}" data-f="mrp" value="${l.mrp}" style="width:70px;height:30px;padding:4px 8px;font-size:12px;text-align:right;"></td>
                  <td style="padding:6px;text-align:right;"><input class="input" type="number" step="any" min="0" data-i="${i}" data-f="selling_price" value="${l.selling_price || l.mrp}" style="width:70px;height:30px;padding:4px 8px;font-size:12px;text-align:right;"></td>
                  <td class="line-total-cell" style="padding:6px;text-align:right;font-weight:600;">${rs(l.total)}</td>
                  <td style="padding:6px;text-align:right;"><button type="button" class="btn btn-ghost btn-sm" data-del="${i}" style="color:var(--danger);padding:0 8px;height:28px;min-height:auto;">✕</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Wire line inputs
      box.querySelectorAll('input[data-i]').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const i = +e.target.dataset.i;
          const f = e.target.dataset.f;
          const v = e.target.value;

          if(['qty', 'cost', 'mrp', 'selling_price'].includes(f)) {
            billLines[i][f] = Number(v) || 0;
          } else {
            billLines[i][f] = v;
          }

          // Auto-update selling price if MRP changes and sell is empty/zero
          if(f === 'mrp') {
            const prevSp = billLines[i].selling_price;
            if(!prevSp || prevSp === 0) {
              billLines[i].selling_price = billLines[i].mrp;
              const sellInput = box.querySelector(`input[data-i="${i}"][data-f="selling_price"]`);
              if(sellInput) sellInput.value = billLines[i].selling_price;
            }
          }

          billLines[i].total = Number(billLines[i].qty || 0) * Number(billLines[i].cost || 0);

          const row = e.target.closest('tr');
          if(row) {
            const totalCell = row.querySelector('.line-total-cell');
            if(totalCell) totalCell.textContent = rs(billLines[i].total);
          }

          updateSummary();
        });
      });

      // Delete line
      box.querySelectorAll('[data-del]').forEach(btn => {
        btn.onclick = () => {
          billLines.splice(+btn.dataset.del, 1);
          renderLines();
        };
      });

      updateSummary();
    }

    // ── Summary ──
    function updateSummary() {
      const sub   = billLines.reduce((s, l) => s + (Number(l.total) || 0), 0);
      const disc  = Number(root.querySelector('#pb-disc').value) || 0;
      const total = Math.max(0, sub - disc);
      const paid  = Number(root.querySelector('#pb-paid').value) || 0;
      const due   = Math.max(0, total - paid);

      const box = root.querySelector('#pb-summary');
      if(box) {
        box.innerHTML = `
          <div style="display:flex;justify-content:space-between;"><span class="text-muted">Subtotal</span><b>${rs(sub)}</b></div>
          <div style="display:flex;justify-content:space-between;"><span class="text-muted">Discount</span><b style="color:var(--danger);">− ${rs(disc)}</b></div>
          <div style="display:flex;justify-content:space-between;font-size:15px;padding-top:8px;border-top:1px solid var(--border);margin-top:4px;">
            <b>Total</b><b style="color:var(--primary);">${rs(total)}</b>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;">
            <span class="text-muted">Paid Now</span><b style="color:var(--success);">${rs(paid)}</b>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span class="text-muted">Due</span><b style="color:${due > 0 ? 'var(--danger)' : 'var(--success)'};">${rs(due)}</b>
          </div>
        `;
      }
    }

    // ── Mount Product Picker ──
    const prodWrap = root.querySelector('#pb-prod-ss');
    const candidateProducts = DB.products.filter(p =>
      !p.supplier_id || p.supplier_id === supplier.id
    );

    mountSearchSelect(prodWrap, {
      items: candidateProducts.map(productToOption),
      allowAdd: true,
      addLabel: 'Add new product',
      onAdd: () => {
        openQuickProductForm((createdProduct) => {
          billLines.push({
            product_id:    createdProduct.id,
            product_name:  createdProduct.name,
            unit:          createdProduct.unit || '',
            batch_no:      '',
            expiry_date:   '',
            qty:           1,
            cost:          0,
            mrp:           0,
            selling_price: 0,
            total:         0
          });
          renderLines();
        });
      },
      onSelect: (opt) => {
        if(!opt) return;
        const p = DB.products.find(x => x.id === opt.id);
        if(!p) return;

        // Prefill from most recent batch of this product
        const recentBatch = batchesOf(p.id)
          .slice()
          .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];

        billLines.push({
          product_id:    p.id,
          product_name:  p.name,
          unit:          p.unit || '',
          batch_no:      '',
          expiry_date:   '',
          qty:           1,
          cost:          recentBatch ? Number(recentBatch.cost || 0) : Number(p.cost || 0),
          mrp:           recentBatch ? Number(recentBatch.mrp || 0)  : Number(p.mrp || 0),
          selling_price: recentBatch ? Number(recentBatch.selling_price || 0) : Number(p.selling_price || 0),
          total:         0
        });
        renderLines();
        setTimeout(() => prodWrap.reset(), 50);
      }
    });

    // Discount / Paid listeners
    root.querySelector('#pb-disc').addEventListener('input', updateSummary);
    root.querySelector('#pb-paid').addEventListener('input', updateSummary);

    renderLines();

    // ── Submit ──
    root.querySelector('#pb-save').onclick = async () => {
      const form = root.querySelector('#pb-form');
      if(!form.reportValidity()) return;

      const dt = readDateTime(form);
      if(!dt) return;

      if(!billLines.length) { toast('Add at least one item', 'error'); return; }

      // Validate lines
      for(const l of billLines) {
        if(!l.product_id) { toast('Invalid line: missing product', 'error'); return; }
        if(!(Number(l.qty) > 0)) { toast('Qty must be > 0 for ' + l.product_name, 'error'); return; }
        if(Number(l.cost) < 0) { toast('Cost cannot be negative for ' + l.product_name, 'error'); return; }
        if(!l.batch_no || !String(l.batch_no).trim()) {
          toast('Batch number is required for ' + l.product_name, 'error'); return;
        }
        if(!l.expiry_date) {
          toast('Expiry date is required for ' + l.product_name, 'error'); return;
        }
      }

      const fd    = new FormData(form);
      const disc  = Number(fd.get('discount')) || 0;
      const paid  = Number(fd.get('paid')) || 0;
      const sub   = billLines.reduce((s, l) => s + (Number(l.total) || 0), 0);
      const total = Math.max(0, sub - disc);

      const headerData = {
        supplier_id:   supplier.id,
        supplier_name: supplier.name || '',
        bill_no:       (fd.get('bill_no') || '').trim(),
        bill_date:     dt.date,
        tx_time:       dt.time,
        subtotal:      sub,
        discount:      disc,
        total,
        paid,
        notes:         (fd.get('notes') || '').trim()
      };

      const btn = root.querySelector('#pb-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      // ── EDIT PATH ──
      if(isEdit) {
        const oldItems = DB.supplier_invoice_items.filter(x => x.supplier_invoice_id === existing.id);

        // Pre-flight: ensure we can reverse every old batch
        for(const it of oldItems) {
          if(!it.batch_no || !it.expiry_date) continue;
          const batch = DB.product_batches.find(b =>
            b.product_id === it.product_id &&
            b.batch_no === it.batch_no &&
            b.expiry_date === it.expiry_date
          );
          if(batch && Number(batch.qty) < Number(it.qty)) {
            toast('Cannot edit: batch ' + it.batch_no + ' has already been sold from. Delete the bill instead.', 'error');
            btn.disabled = false; btn.textContent = 'Update';
            return;
          }
        }

        // Update header
        const upd = await sb.from('supplier_invoices').update(headerData).eq('id', existing.id).select().single();
        if(upd.error) {
          console.error(upd.error);
          toast('Failed to update bill header.', 'error');
          btn.disabled = false; btn.textContent = 'Update';
          return;
        }

        // Reverse old batch qty
        for(const it of oldItems) {
          if(!it.batch_no || !it.expiry_date) continue;
          const batch = DB.product_batches.find(b =>
            b.product_id === it.product_id &&
            b.batch_no === it.batch_no &&
            b.expiry_date === it.expiry_date
          );
          if(batch) await adjustBatchQty(batch.id, -Number(it.qty));
        }

        // Delete old items
        await sb.from('supplier_invoice_items').delete().eq('supplier_invoice_id', existing.id);

        // Insert new items
        const newItemsPayload = billLines.map(l => ({
          supplier_invoice_id: existing.id,
          product_id:          l.product_id,
          product_name:        l.product_name,
          batch_no:            l.batch_no,
          expiry_date:         l.expiry_date,
          unit:                l.unit,
          qty:                 l.qty,
          cost:                l.cost,
          mrp:                 l.mrp,
          selling_price:       l.selling_price,
          total:               l.total
        }));
        const insIt = await sb.from('supplier_invoice_items').insert(newItemsPayload);
        if(insIt.error) {
          console.error(insIt.error);
          toast('Failed to update bill items. Please try again.', 'error');
          btn.disabled = false; btn.textContent = 'Update';
          return;
        }

        // Apply new batches
        for(const l of billLines) {
          await applyBatchFromLine(l, supplier.id);
        }

        await syncDB();
        toast('Bill updated · batches adjusted', 'success');
        closeModal(root);
        route();
        return;
      }

      // ── NEW BILL PATH ──
      const ins = await sb.from('supplier_invoices').insert(headerData).select().single();
      if(ins.error) {
        console.error(ins.error);
        toast('Failed to save bill header.', 'error');
        btn.disabled = false; btn.textContent = 'Save';
        return;
      }
      const bill = ins.data;

      // Insert items
      const itemsPayload = billLines.map(l => ({
        supplier_invoice_id: bill.id,
        product_id:          l.product_id,
        product_name:        l.product_name,
        batch_no:            l.batch_no,
        expiry_date:         l.expiry_date,
        unit:                l.unit,
        qty:                 l.qty,
        cost:                l.cost,
        mrp:                 l.mrp,
        selling_price:       l.selling_price,
        total:               l.total
      }));
      const insIt = await sb.from('supplier_invoice_items').insert(itemsPayload);
      if(insIt.error) {
        console.error(insIt.error);
        // Rollback: delete orphan header
        await sb.from('supplier_invoices').delete().eq('id', bill.id);
        toast('Failed to save bill items. Please try again.', 'error');
        btn.disabled = false; btn.textContent = 'Save';
        return;
      }

      // Apply batches (create or add qty)
      for(const l of billLines) {
        await applyBatchFromLine(l, supplier.id);
      }

      await syncDB();
      toast('Bill saved · stock added to batches', 'success');
      closeModal(root);
      route();
    };
  });
}

/* ─────────────────────────────────────────────
   50. APPLY BATCH FROM LINE (Helper)
   ───────────────────────────────────────────── */
async function applyBatchFromLine(line, supplierId) {
  if(!line.product_id) return;

  const product = DB.products.find(p => p.id === line.product_id);
  if(!product) return;

  // Non-batch products → add to products.stock directly
  if(product.batch_managed === false) {
    await adjustProductStock(line.product_id, Number(line.qty) || 0);
    if(Number(line.cost) > 0) {
      await sb.from('products').update({ cost: Number(line.cost) }).eq('id', line.product_id);
    }
    return;
  }

  // Batch-managed product → find or create batch
  const existingBatch = DB.product_batches.find(b =>
    b.product_id === line.product_id &&
    b.batch_no === line.batch_no &&
    b.expiry_date === line.expiry_date
  );

  if(existingBatch) {
    // Add qty to existing batch + refresh pricing
    await adjustBatchQty(existingBatch.id, Number(line.qty) || 0);
    await sb.from('product_batches').update({
      cost:          Number(line.cost)          || 0,
      mrp:           Number(line.mrp)           || 0,
      selling_price: Number(line.selling_price) || Number(line.mrp) || 0,
      supplier_id:   supplierId || null
    }).eq('id', existingBatch.id);
  } else {
    // Create fresh batch
    const { error } = await sb.from('product_batches').insert({
      product_id:    line.product_id,
      batch_no:      line.batch_no,
      expiry_date:   line.expiry_date,
      qty:           Number(line.qty) || 0,
      cost:          Number(line.cost)          || 0,
      mrp:           Number(line.mrp)           || 0,
      selling_price: Number(line.selling_price) || Number(line.mrp) || 0,
      supplier_id:   supplierId || null
    });
    
    if(error) {
      console.error('[applyBatchFromLine] insert failed:', error.message);
      // Fallback: try to find and add to it (race condition safety)
      const nowBatch = DB.product_batches.find(b =>
        b.product_id === line.product_id &&
        b.batch_no === line.batch_no &&
        b.expiry_date === line.expiry_date
      );
      if(nowBatch) await adjustBatchQty(nowBatch.id, Number(line.qty) || 0);
    }
  }
}

console.log('[MediStore] Core Logic Block 11 loaded');
/* ─────────────────────────────────────────────
   51. NEW INVOICE BUILDER
   ───────────────────────────────────────────── */
function renderNewInvoice(content, preselect) {
  preselect = preselect || {};

  // State
  let lines = [];
  let selectedCustomer = preselect.customer_id ? DB.customers.find(c => c.id === preselect.customer_id) : null;
  let selectedDoctor   = preselect.doctor_id   ? DB.doctors.find(d => d.id === preselect.doctor_id)     : null;

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/invoices" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Invoices</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;">
      <div class="page-head-title">
        <h1>New Invoice</h1>
        <p>Add items — batch and expiry are auto-picked FEFO</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 360px;gap:24px;align-items:start;" class="invoice-builder-layout">
      
      <!-- LEFT COLUMN: FORM & ITEMS -->
      <div style="display:flex;flex-direction:column;gap:20px;">
        
        <!-- DATE & CUSTOMER -->
        <div class="card">
          ${dateTimeFieldHTML(null, '', 'Invoice Date')}
          
          <div style="margin-top:16px;">
            <label class="label">Customer</label>
            ${searchSelectHTML('ni-cust-ss', 'Search by name or phone (optional for walk-in)...')}
            <div class="field-hint">Leave empty for walk-in, or pick a saved customer</div>
          </div>

          <div class="grid-2" style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <label class="label">Customer Name</label>
              <input class="input" id="ni-cust-name" placeholder="Walk-in" value="${esc(selectedCustomer ? selectedCustomer.name : '')}">
            </div>
            <div>
              <label class="label">Phone (for WhatsApp bill)</label>
              <input class="input" type="tel" id="ni-cust-phone" placeholder="10-digit mobile" value="${esc(selectedCustomer ? selectedCustomer.phone : '')}">
            </div>
          </div>

          <!-- DOCTOR / RX (Collapsible) -->
          <div style="margin-top:16px;">
            <button type="button" class="btn btn-ghost btn-sm" id="ni-toggle-rx" style="width:100%;justify-content:space-between;background:var(--bg-app);">
              <span>📋 Prescription / Doctor details (optional)</span>
              <span id="ni-rx-chev">▾</span>
            </button>
            
            <div id="ni-rx-block" style="display:none;margin-top:16px;flex-direction:column;gap:16px;">
              <div>
                <label class="label">Doctor</label>
                ${searchSelectHTML('ni-doc-ss', 'Search doctor...')}
              </div>
              <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <div>
                  <label class="label">Doctor Name (manual)</label>
                  <input class="input" id="ni-doc-name" value="${esc(selectedDoctor ? selectedDoctor.name : '')}">
                </div>
                <div>
                  <label class="label">Patient Name</label>
                  <input class="input" id="ni-patient-name" placeholder="Optional">
                </div>
              </div>
              <div>
                <label class="label">Prescription No</label>
                <input class="input" id="ni-rx-no" placeholder="e.g. RX-8821">
              </div>
            </div>
          </div>
        </div>

        <!-- PRODUCT PICKER & LINES -->
        <div class="card">
          <div style="margin-bottom:16px;">
            <label class="label">Add Item</label>
            ${searchSelectHTML('ni-prod-ss', 'Search product name...')}
            <div class="field-hint">Earliest expiry batch is auto-selected — tap the batch pill on any line to change</div>
          </div>

          <div id="ni-lines" style="display:flex;flex-direction:column;gap:12px;"></div>
        </div>

      </div>

      <!-- RIGHT COLUMN: SUMMARY & ACTIONS (Sticky) -->
      <div style="position:sticky;top:84px;display:flex;flex-direction:column;gap:16px;">
        
        <!-- SUMMARY CARD -->
        <div class="card" style="background:var(--navy);color:#fff;border:0;">
          <div class="card-title" style="color:#fff;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:12px;margin-bottom:16px;">
            Bill Summary
          </div>
          
          <div id="ni-summary" style="display:flex;flex-direction:column;gap:10px;font-size:13px;"></div>

          <div style="margin-top:20px;display:flex;flex-direction:column;gap:12px;">
            ${SETTINGS.gst_enabled ? `
              <div style="background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;">
                <label style="display:flex;align-items:center;gap:10px;font-size:12px;cursor:pointer;">
                  <input type="checkbox" id="ni-gst" checked>
                  <span>Apply GST (MRP inclusive)</span>
                </label>
              </div>
            ` : ''}

            <div>
              <label class="label" style="color:#9CA3AF;">Discount (₹)</label>
              <input class="input" type="number" step="any" min="0" id="ni-disc" value="0" style="background:rgba(255,255,255,0.1);border-color:transparent;color:#fff;">
            </div>
            
            <div>
              <label class="label" style="color:#9CA3AF;">Paid Now (₹)</label>
              <input class="input" type="number" step="any" min="0" id="ni-paid" value="0" style="background:rgba(255,255,255,0.1);border-color:transparent;color:#fff;">
            </div>
          </div>
        </div>

        <!-- NOTES & ACTIONS -->
        <div class="card">
          <div>
            <label class="label">Notes</label>
            <input class="input" id="ni-notes" placeholder="Optional instructions...">
          </div>
          
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;">
            <button type="button" class="btn btn-ghost" id="ni-cancel" style="width:100%;">Cancel</button>
            <button type="button" class="btn btn-ghost" id="ni-save-print" style="width:100%;">Save &amp; Print</button>
            <button type="button" class="btn btn-primary btn-lg" id="ni-save" style="width:100%;">Save Invoice</button>
          </div>
        </div>

      </div>
    </div>
  `;

  // ── MOUNT SEARCH SELECTS ──
  
  // Customer
  const custSS = $('#ni-cust-ss');
  mountSearchSelect(custSS, {
    items: DB.customers.map(customerToOption),
    allowAdd: true,
    addLabel: 'Add new customer',
    onSelect: (opt) => {
      if(!opt) { selectedCustomer = null; return; }
      const c = DB.customers.find(x => x.id === opt.id);
      if(!c) return;
      selectedCustomer = c;
      const nameEl = $('#ni-cust-name');
      const phoneEl= $('#ni-cust-phone');
      if(nameEl)  nameEl.value  = c.name || '';
      if(phoneEl) phoneEl.value = c.phone || '';
    },
    onAdd: () => openCustomerForm()
  });
  if(selectedCustomer) custSS.setValue(selectedCustomer.id);

  // Doctor
  const docSS = $('#ni-doc-ss');
  mountSearchSelect(docSS, {
    items: DB.doctors.map(d => ({
      id: d.id,
      label: d.name,
      sublabel: d.hospital || d.phone || '',
      searchText: ((d.name || '') + ' ' + (d.hospital || '') + ' ' + (d.phone || '')).toLowerCase()
    })),
    allowAdd: true,
    addLabel: 'Add new doctor',
    onSelect: (opt) => {
      if(!opt) { selectedDoctor = null; return; }
      const d = DB.doctors.find(x => x.id === opt.id);
      if(!d) return;
      selectedDoctor = d;
      const docNameEl = $('#ni-doc-name');
      if(docNameEl) docNameEl.value = d.name || '';
    },
    onAdd: () => openDoctorForm()
  });
  if(selectedDoctor) docSS.setValue(selectedDoctor.id);

  // Toggle Rx
  const rxToggle = $('#ni-toggle-rx');
  const rxBlock  = $('#ni-rx-block');
  const rxChev   = $('#ni-rx-chev');
  rxToggle.onclick = () => {
    const isOpen = rxBlock.style.display === 'flex';
    rxBlock.style.display = isOpen ? 'none' : 'flex';
    rxChev.textContent    = isOpen ? '▾' : '▴';
  };
  if(selectedDoctor) {
    rxBlock.style.display = 'flex';
    rxChev.textContent    = '▴';
  }

  // Product Picker
  const prodSS = $('#ni-prod-ss');
  mountSearchSelect(prodSS, {
    items: DB.products.map(productToOption),
    onSelect: (opt) => {
      if(!opt) return;
      const p = DB.products.find(x => x.id === opt.id);
      if(!p) return;
      addProductLine(p);
      setTimeout(() => prodSS.reset(), 50);
    }
  });

  // ── ADD PRODUCT LINE ──
  function addProductLine(p) {
    const baseUnit = p.unit || 'unit';
    const looseUnit = p.loose_unit || null;
    const convFactor = Number(p.conversion_factor) || 1;

    if(p.batch_managed === false) {
      if(Number(p.stock) <= 0) {
        toast('Out of stock: ' + p.name, 'error');
        return;
      }
      const price = Number(p.selling_price || p.mrp || 0);
      lines.push({
        product_id:    p.id,
        product_name:  p.name,
        batch_managed: false,
        batch_id:      null,
        batch_no:      '',
        expiry_date:   null,
        unit:          baseUnit,
        loose_unit:    looseUnit,
        conversion_factor: convFactor,
        sell_unit:     baseUnit,
        base_price:    price,
        qty:           1,
        mrp:           Number(p.mrp || 0),
        price:         price,
        gst_rate:      Number(p.gst_rate || 0),
        total:         price
      });
      renderLines();
      return;
    }

    // Batch-managed → FEFO
    const batch = fefoBatch(p.id);
    if(!batch) {
      toast('No sellable batch for ' + p.name + ' (all expired or empty)', 'error');
      return;
    }

    const price = Number(batch.selling_price || batch.mrp || 0);
    lines.push({
      product_id:    p.id,
      product_name:  p.name,
      batch_managed: true,
      batch_id:      batch.id,
      batch_no:      batch.batch_no || '',
      expiry_date:   batch.expiry_date || null,
      unit:          baseUnit,
      loose_unit:    looseUnit,
      conversion_factor: convFactor,
      sell_unit:     baseUnit,
      base_price:    price,
      qty:           1,
      mrp:           Number(batch.mrp || 0),
      price:         price,
      gst_rate:      Number(p.gst_rate || 0),
      total:         price
    });
    renderLines();
  }

  // ── RENDER LINES ──
  function renderLines() {
    const box = $('#ni-lines');
    if(!lines.length) {
      box.innerHTML = '<p class="text-sm text-muted text-center" style="padding:20px 0;">No items added yet. Search a product above.</p>';
      updateSummary();
      return;
    }

    box.innerHTML = lines.map((l, i) => {
      const expChip = l.batch_managed && l.expiry_date ? renderExpiryBadge(l.expiry_date) : '';
      const isNonBatch = !l.batch_managed;
      
      // Dual Unit UI
      const hasDualUnit = l.loose_unit && l.conversion_factor > 1;
      const unitSelector = hasDualUnit ? `
        <select class="input" data-i="${i}" data-f="sell_unit" style="padding:4px 8px;min-height:32px;font-size:12px;width:100px;margin-top:4px;">
          <option value="${l.unit}" ${l.sell_unit === l.unit ? 'selected' : ''}>${l.unit}</option>
          <option value="${l.loose_unit}" ${l.sell_unit === l.loose_unit ? 'selected' : ''}>${l.loose_unit}</option>
        </select>
      ` : `<div style="padding:8px 0;font-weight:600;font-size:12px;color:var(--text-muted);">${l.unit}</div>`;

      return `
        <div class="card" style="margin-bottom:8px;padding:16px;background:var(--bg-app);border:1px solid var(--border);box-shadow:none;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:14px;color:var(--text-main);">${esc(l.product_name)}</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;">
                ${isNonBatch
                  ? '<span class="chip chip-neutral" style="font-size:10px;">NON-BATCH</span>'
                  : `
                    <button type="button" class="chip chip-neutral" data-change-batch="${i}" style="cursor:pointer;border:1px solid var(--border);background:var(--bg-card);">
                      <b>B:${esc(l.batch_no || '—')}</b>
                      <span style="opacity:.6;margin-left:4px;">↻</span>
                    </button>
                    ${expChip}
                  `}
              </div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-del="${i}" style="color:var(--danger);padding:4px 8px;min-height:32px;">✕</button>
          </div>

          <div class="grid-3" style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:12px;align-items:end;">
            <div>
              <label class="label" style="font-size:10px;">Qty (${esc(l.sell_unit)})</label>
              <input class="input" type="number" step="any" min="0.01" data-i="${i}" data-f="qty" value="${l.qty}" style="padding:8px 10px;min-height:38px;font-size:13px;font-weight:600;">
              ${unitSelector}
            </div>
            <div>
              <label class="label" style="font-size:10px;">MRP (₹)</label>
              <div style="padding:8px 10px;background:var(--border);border-radius:var(--radius-sm);font-weight:600;font-size:13px;min-height:38px;display:flex;align-items:center;color:var(--text-muted);">
                ${fmtNum(l.mrp)}
              </div>
            </div>
            <div>
              <label class="label" style="font-size:10px;">Price (₹) / ${esc(l.sell_unit)}</label>
              <input class="input" type="number" step="any" min="0.01" data-i="${i}" data-f="price" value="${l.price}" style="padding:8px 10px;min-height:38px;font-size:13px;font-weight:600;color:var(--primary);">
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);">
            <span class="text-xs text-muted" style="font-weight:600;">Line total</span>
            <b class="line-total-val" style="font-size:16px;color:var(--text-main);">${rs(l.total)}</b>
          </div>
        </div>
      `;
    }).join('');

    // Wire inputs (Qty & Price)
    box.querySelectorAll('input[data-i]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const i = +e.target.dataset.i;
        const f = e.target.dataset.f;
        
        if(f === 'price') {
           lines[i].price = Number(e.target.value) || 0;
           if(lines[i].sell_unit === lines[i].unit) lines[i].base_price = lines[i].price;
        } else {
           lines[i][f] = Number(e.target.value) || 0;
        }

        lines[i].total = Number(lines[i].qty || 0) * Number(lines[i].price || 0);
        
        const lineCard = e.target.closest('.card');
        if(lineCard) {
          const totalEl = lineCard.querySelector('.line-total-val');
          if(totalEl) totalEl.textContent = rs(lines[i].total);
        }
        updateSummary();
      });
    });

    // Wire Unit Selector
    box.querySelectorAll('select[data-f="sell_unit"]').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const i = +e.target.dataset.i;
        const newUnit = e.target.value;
        const l = lines[i];
        
        l.sell_unit = newUnit;
        
        if(newUnit === l.loose_unit) {
          l.price = l.base_price / l.conversion_factor;
        } else {
          l.price = l.base_price;
        }
        
        l.total = Number(l.qty || 0) * Number(l.price || 0);
        renderLines(); // Re-render to update labels
      });
    });

    // Delete line
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      lines.splice(+b.dataset.del, 1);
      renderLines();
    });

    // Change batch
    box.querySelectorAll('[data-change-batch]').forEach(b => b.onclick = () => {
      const i = +b.dataset.changeBatch;
      const line = lines[i];
      if(!line.batch_managed) return;

      openBatchPicker(line.product_id, line.batch_id, (batch) => {
        if(!batch) return;
        line.batch_id    = batch.id;
        line.batch_no    = batch.batch_no || '';
        line.expiry_date = batch.expiry_date;
        line.mrp         = Number(batch.mrp || 0);
        line.base_price  = Number(batch.selling_price || batch.mrp || 0);
        
        if(line.sell_unit === line.loose_unit) {
          line.price = line.base_price / line.conversion_factor;
        } else {
          line.price = line.base_price;
        }
        
        line.total = Number(line.qty) * Number(line.price);
        renderLines();
        toast('Batch changed to ' + batch.batch_no, 'success');
      });
    });

    updateSummary();
  }

  // ── SUMMARY ──
  function updateSummary() {
    const subtotal   = lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
    const disc       = Number($('#ni-disc').value) || 0;
    const gstOn      = SETTINGS.gst_enabled && $('#ni-gst') && $('#ni-gst').checked;
    
    // Calculate GST backwards (extract tax portion from inclusive price)
    const totalGst   = gstOn
      ? lines.reduce((s, l) => {
          const gross = Number(l.total) || 0;
          const rate  = Number(l.gst_rate || 0);
          return s + (gross * rate / (100 + rate));
        }, 0)
      : 0;
      
    const total      = Math.max(0, subtotal - disc);
    const paid       = Number($('#ni-paid').value) || 0;
    const due        = Math.max(0, total - paid);

    $('#ni-summary').innerHTML = `
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#9CA3AF;">Subtotal (${lines.length} items)</span>
        <b>${rs(subtotal)}</b>
      </div>
      ${disc > 0 ? `
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#9CA3AF;">Discount</span>
          <b style="color:#F87171;">− ${rs(disc)}</b>
        </div>` : ''}
      ${gstOn ? `
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#9CA3AF;">GST included</span>
          <b style="color:#FBBF24;">${rs(totalGst)}</b>
        </div>` : ''}
        
      <div style="display:flex;justify-content:space-between;font-size:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);margin-top:8px;">
        <b>Total</b>
        <b style="color:#34D399;">${rs(total)}</b>
      </div>
      
      <div style="display:flex;justify-content:space-between;margin-top:6px;">
        <span style="color:#9CA3AF;">Paid</span>
        <b style="color:#34D399;">${rs(paid)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#9CA3AF;">Due</span>
        <b style="color:${due > 0 ? '#F87171' : '#34D399'};">${rs(due)}</b>
      </div>
    `;
  }

  $('#ni-disc').addEventListener('input', updateSummary);
  $('#ni-paid').addEventListener('input', updateSummary);
  if($('#ni-gst')) $('#ni-gst').addEventListener('change', updateSummary);

  // ── SAVE INVOICE ──
  async function saveInvoice() {
    if(!lines.length) { toast('Add at least one item', 'error'); return null; }

    // Validate lines
    for(let i = 0; i < lines.length; i++) {
      const l = lines[i];
      l.total = Number(l.qty) * Number(l.price); // Force recalculate
      
      if(!(Number(l.qty) > 0)) { toast('Qty must be > 0 for ' + l.product_name, 'error'); return null; }
      if(!(Number(l.price) > 0)) { toast('Enter a valid price for ' + l.product_name, 'error'); return null; }
      if(l.batch_managed && !l.batch_id) { toast('Select a batch for ' + l.product_name, 'error'); return null; }
    }

    // Date check
    const dEl = document.querySelector('#content input[name="tx_date"]');
    const tEl = document.querySelector('#content input[name="tx_time"]');
    const dv  = dEl ? dEl.value : '';
    const tv  = (tEl && tEl.value) ? tEl.value.trim() : '';
    if(!dv) { toast('Please pick a date', 'error'); return null; }
    if(isFuture(dv)) { toast('Future dates are not allowed', 'error'); return null; }

    // Stock check (convert to base units)
    const stockLines = lines.map(l => {
      let baseQty = Number(l.qty) || 0;
      if(l.sell_unit === l.loose_unit && l.conversion_factor > 1) {
        baseQty = baseQty / l.conversion_factor;
      }
      return { product_id: l.product_id, batch_id: l.batch_id, qty: baseQty };
    });
    
    const stockRes = checkStock(stockLines);
    if(!stockRes.ok) {
      if(stockRes.reason === 'expired') {
        toast('Batch has expired: ' + stockRes.productName, 'error');
      } else {
        toast('Not enough stock: ' + stockRes.productName + ' — need ' + fmtNum(stockRes.need) + ', have ' + fmtNum(stockRes.available), 'error');
      }
      return null;
    }

    // Compute totals
    const subtotal   = lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
    const disc       = Number($('#ni-disc').value) || 0;
    const gstOn      = SETTINGS.gst_enabled && $('#ni-gst') && $('#ni-gst').checked;
    const total      = Math.max(0, subtotal - disc);
    const paid       = Number($('#ni-paid').value) || 0;
    const due        = Math.max(0, total - paid);
    const notes      = ($('#ni-notes').value || '').trim();

    const totalGst = gstOn
      ? lines.reduce((s, l) => {
          const gross = Number(l.total) || 0;
          const rate  = Number(l.gst_rate || 0);
          return s + (gross * rate / (100 + rate));
        }, 0)
      : 0;

    const manualName  = ($('#ni-cust-name').value  || '').trim();
    const manualPhone = ($('#ni-cust-phone').value || '').trim();
    const finalCustomerId    = selectedCustomer ? selectedCustomer.id : null;
    const finalCustomerName  = manualName  || (selectedCustomer ? selectedCustomer.name  : 'Walk-in');
    const finalCustomerPhone = manualPhone || (selectedCustomer ? selectedCustomer.phone : '');

    const manualDocName = ($('#ni-doc-name').value || '').trim();
    const finalDoctorId   = selectedDoctor ? selectedDoctor.id : null;
    const finalDoctorName = manualDocName || (selectedDoctor ? selectedDoctor.name : '');

    const patientName  = ($('#ni-patient-name') ? $('#ni-patient-name').value.trim() : '');
    const prescription = ($('#ni-rx-no')        ? $('#ni-rx-no').value.trim()        : '');

    // Insert Invoice Header
    const invData = {
      invoice_no:       nextInvoiceNo(),
      customer_id:      finalCustomerId,
      customer_name:    finalCustomerName,
      customer_phone:   finalCustomerPhone,
      doctor_id:        finalDoctorId,
      doctor_name:      finalDoctorName,
      patient_name:     patientName,
      prescription_no:  prescription,
      subtotal,
      discount:         disc,
      total,
      paid,
      due,
      notes,
      invoice_date:     dv,
      tx_time:          tv,
      gst_enabled:      !!gstOn,
      gst_amount:       totalGst
    };

    const { data: inv, error: invErr } = await sb.from('invoices').insert(invData).select().single();
    if(invErr) { 
      console.error(invErr);
      toast('Failed to save invoice header.', 'error'); 
      return null; 
    }

    // Insert Items
    const itemsPayload = lines.map(l => {
      const gross   = Number(l.total) || 0;
      const rate    = Number(l.gst_rate || 0);
      const lineGst = gstOn ? (gross * rate / (100 + rate)) : 0;
      return {
        invoice_id:   inv.id,
        product_id:   l.product_id,
        product_name: l.product_name,
        batch_id:     l.batch_id,
        batch_no:     l.batch_no || '',
        expiry_date:  l.expiry_date || null,
        unit:         l.sell_unit || l.unit || '',
        qty:          Number(l.qty)   || 0,
        mrp:          Number(l.mrp)   || 0,
        price:        Number(l.price) || 0,
        gst_rate:     rate,
        gst_amount:   lineGst,
        total:        Number(l.total) || 0
      };
    });

    const { error: itErr } = await sb.from('invoice_items').insert(itemsPayload);
    if(itErr) {
      console.error(itErr);
      // Rollback header to avoid orphan
      await sb.from('invoices').delete().eq('id', inv.id);
      toast('Failed to save invoice items. Please try again.', 'error');
      return null;
    }

    // Deduct Stock (convert back to base units)
    for(const l of lines) {
      let deductQty = Number(l.qty) || 0;
      if(l.sell_unit === l.loose_unit && l.conversion_factor > 1) {
        deductQty = deductQty / l.conversion_factor;
      }

      if(l.batch_managed && l.batch_id) {
        await adjustBatchQty(l.batch_id, -deductQty);
      } else if(!l.batch_managed) {
        await adjustProductStock(l.product_id, -deductQty);
      }
    }

    await syncDB();
    return inv;
  }

  // ── WIRE BUTTONS ──
  $('#ni-cancel').onclick = () => history.back();

  $('#ni-save').onclick = async () => {
    const btn = $('#ni-save');
    btn.disabled = true; btn.textContent = 'Saving...';
    const inv = await saveInvoice();
    btn.disabled = false; btn.textContent = 'Save Invoice';
    if(inv) {
      toast('Invoice saved', 'success');
      location.hash = '#/invoice/' + inv.id;
    }
  };

  $('#ni-save-print').onclick = async () => {
    const btn = $('#ni-save-print');
    btn.disabled = true; btn.textContent = 'Saving...';
    const inv = await saveInvoice();
    btn.disabled = false; btn.textContent = 'Save & Print';
    if(!inv) return;
    toast('Saved · choose a print option', 'success');
    location.hash = '#/invoice/' + inv.id + '?print=1';
  };

  renderLines();
}

console.log('[MediStore] Core Logic Block 12 loaded');
/* ─────────────────────────────────────────────
   52. INVOICE NUMBER GENERATOR
   ───────────────────────────────────────────── */
function nextInvoiceNo() {
  let max = 0;
  DB.invoices.forEach(inv => {
    const no = String(inv.invoice_no || '');
    if(!no.startsWith(INVOICE_PREFIX)) return;
    const m = no.match(/(\d+)/);
    if(m) { 
      const n = parseInt(m[1], 10); 
      if(n > max) max = n; 
    }
  });
  return INVOICE_PREFIX + String(max + 1).padStart(4, '0');
}

/* ─────────────────────────────────────────────
   53. INVOICE LIST
   ───────────────────────────────────────────── */
function renderInvoices(content) {
  const list = DB.invoices.filter(i => !String(i.invoice_no || '').startsWith(RETURN_PREFIX));

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Invoices</h1>
        <p>${list.length} invoice${list.length === 1 ? '' : 's'}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="i-new">+ New Invoice</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="i-search" placeholder="Invoice no, customer or phone...">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">Sort</label>
        <select class="input" id="i-sort">
          <option value="date-desc">Newest first</option>
          <option value="date">Oldest first</option>
          <option value="total-desc">Total (high)</option>
          <option value="due-desc">Due (high)</option>
        </select>
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <select class="input" id="i-filter">
          <option value="">All</option>
          <option value="due">Only with due</option>
          <option value="paid">Fully paid</option>
          <option value="rx">With prescription</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Date</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:right">Paid</th>
            <th style="text-align:right">Due</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="i-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="i-mobile"></div>
  `;

  function filtered() {
    const q      = ($('#i-search').value || '').toLowerCase().trim();
    const sortBy = $('#i-sort').value;
    const flt    = $('#i-filter').value;

    let arr = list.filter(i => {
      const hay = ((i.invoice_no || '') + ' ' + (i.customer_name || '') + ' ' + (i.customer_phone || '')).toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(flt === 'due'  && !(Number(i.due) > 0)) return false;
      if(flt === 'paid' && Number(i.due) > 0)    return false;
      if(flt === 'rx'   && !i.prescription_no && !i.doctor_name) return false;
      return true;
    });

    if(sortBy === 'date-desc')  arr.sort((a, b) => txDate(b, 'invoice_date').localeCompare(txDate(a, 'invoice_date')));
    else if(sortBy === 'date')  arr.sort((a, b) => txDate(a, 'invoice_date').localeCompare(txDate(b, 'invoice_date')));
    else if(sortBy === 'total-desc') arr.sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
    else if(sortBy === 'due-desc')   arr.sort((a, b) => Number(b.due   || 0) - Number(a.due   || 0));
    return arr;
  }

  function renderList() {
    const arr = filtered();

    // Desktop Table
    const tbody = $('#i-body');
    if(tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No invoices match</td></tr>`
        : arr.map(i => {
            const name = i.customer_name || 'Walk-in';
            return `<tr>
              <td><a href="#/invoice/${i.id}" style="font-weight:600;color:var(--text-main);text-decoration:none;">${esc(i.invoice_no || '')}</a></td>
              <td>${esc(name)}</td>
              <td class="text-sm text-muted">${txDT(i, 'invoice_date')}</td>
              <td style="text-align:right;">${rs(i.total)}</td>
              <td style="text-align:right;color:var(--success);">${rs(i.paid)}</td>
              <td style="text-align:right;font-weight:${Number(i.due) > 0 ? '600' : '400'};color:${Number(i.due) > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${rs(i.due)}</td>
              <td style="text-align:right;white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" data-view="${i.id}">View</button>
                <button class="btn btn-ghost btn-sm" data-del="${i.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('');
    }

    // Mobile List
    const mob = $('#i-mobile');
    if(mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">No invoices match</div></div>`
        : arr.map(i => {
            const name = i.customer_name || 'Walk-in';
            const due  = Number(i.due || 0);
            return `
              <a href="#/invoice/${i.id}" class="mobile-card" style="text-decoration:none;color:inherit;">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc(name)}</div>
                    <div class="mobile-card-sub">${esc(i.invoice_no || '')} · ${fmtDate(txDate(i, 'invoice_date'))}${i.prescription_no ? ' · Rx' : ''}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;">${rs(i.total)}</div>
                    <div class="text-xs" style="color:${due > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600;margin-top:2px;">
                      ${due > 0 ? 'Due ' + rs(due) : 'Paid'}
                    </div>
                  </div>
                </div>
              </a>`;
          }).join('');
    }

    $$('[data-view]').forEach(b => b.onclick = () => location.hash = '#/invoice/' + b.dataset.view);
    $$('[data-del]').forEach(b => b.onclick = async () => {
      const inv = DB.invoices.find(x => x.id === b.dataset.del);
      if(inv) await deleteInvoice(inv, renderList);
    });
  }

  ['i-search', 'i-sort', 'i-filter'].forEach(id => {
    const el = $('#' + id);
    if(el) { el.oninput = renderList; el.onchange = renderList; }
  });

  renderList();
  $('#i-new').onclick = () => location.hash = '#/new-invoice';
}

/* ─────────────────────────────────────────────
   54. DELETE INVOICE (Restores Stock)
   ───────────────────────────────────────────── */
async function deleteInvoice(inv, onDone) {
  const items = DB.invoice_items.filter(x => x.invoice_id === inv.id);
  const name = inv.customer_name || 'Walk-in';
  const msg = `Delete invoice ${inv.invoice_no} of ${rs(inv.total)}?\n\nCustomer: ${name}\n\nStock will be restored to the original batches.`;
  
  if(!confirmDlg(msg, 'Confirm Delete')) return;

  // Restore stock for each item
  for(const it of items) {
    const qty = Number(it.qty) || 0;
    if(!qty) continue;

    let restoreQty = qty;
    const p = DB.products.find(x => x.id === it.product_id);

    // Convert loose unit qty back to base unit for stock restoration
    if(p && p.loose_unit && Number(p.conversion_factor) > 1 && it.unit === p.loose_unit) {
      restoreQty = restoreQty / Number(p.conversion_factor);
    }

    if(it.batch_id) {
      const batch = DB.product_batches.find(b => b.id === it.batch_id);
      if(batch) {
        await adjustBatchQty(batch.id, restoreQty);
      } else if(it.batch_no && it.expiry_date && it.product_id) {
        // Fallback: find by batch_no + expiry if ID missing
        const alt = DB.product_batches.find(b =>
          b.product_id === it.product_id &&
          b.batch_no === it.batch_no &&
          b.expiry_date === it.expiry_date
        );
        if(alt) await adjustBatchQty(alt.id, restoreQty);
      }
    } else if(it.product_id) {
      await adjustProductStock(it.product_id, restoreQty);
    }
  }

  // Delete invoice (items should cascade or be orphaned)
  const { error } = await sb.from('invoices').delete().eq('id', inv.id);
  if(error) {
    console.error(error);
    toast('Failed to delete invoice.', 'error');
    return;
  }

  await syncDB();
  toast('Invoice deleted · stock restored', 'success');
  if(typeof onDone === 'function') onDone();
  else route();
}

/* ─────────────────────────────────────────────
   55. INVOICE VIEW
   ───────────────────────────────────────────── */
async function renderInvoiceView(content, id) {
  const inv = DB.invoices.find(x => x.id === id);
  if(!inv) {
    content.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">Invoice not found</div></div>';
    return;
  }

  const items  = DB.invoice_items.filter(x => x.invoice_id === inv.id);
  const customer = inv.customer_id ? DB.customers.find(c => c.id === inv.customer_id) : null;
  const doctor   = inv.doctor_id   ? DB.doctors.find(d => d.id === inv.doctor_id)       : null;
  const custName = inv.customer_name || (customer && customer.name) || 'Walk-in';
  const custPhone= inv.customer_phone || (customer && customer.phone) || '';
  const docName  = inv.doctor_name  || (doctor && doctor.name) || '';

  const gstOn = !!inv.gst_enabled;
  const gstAmt = Number(inv.gst_amount || 0);

  content.innerHTML = `
    <div style="margin-bottom:20px;">
      <a href="#/invoices" style="color:var(--text-muted);font-size:13px;text-decoration:none;">← Back to Invoices</a>
    </div>

    <div class="page-head" style="margin-bottom:24px;">
      <div class="page-head-title">
        <h1>${esc(inv.invoice_no || '')}</h1>
        <p>${txDT(inv, 'invoice_date')}</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 320px;gap:24px;align-items:start;" class="invoice-view-layout">
      
      <!-- LEFT: Details & Items -->
      <div style="display:flex;flex-direction:column;gap:20px;">
        
        <!-- Customer & Rx Info -->
        <div class="card">
          <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
            <div>
              <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;margin-bottom:6px;">Customer</div>
              <div style="font-weight:700;font-size:16px;">${esc(custName)}</div>
              ${custPhone ? `<div class="text-sm text-muted" style="margin-top:4px;">📞 ${esc(custPhone)}</div>` : ''}
            </div>
            ${(docName || inv.patient_name || inv.prescription_no) ? `
              <div>
                <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;margin-bottom:6px;">Prescription</div>
                ${docName ? `<div class="text-sm"><b>Dr.</b> ${esc(docName)}</div>` : ''}
                ${inv.patient_name ? `<div class="text-sm text-muted" style="margin-top:2px;">Patient: ${esc(inv.patient_name)}</div>` : ''}
                ${inv.prescription_no ? `<div class="text-sm text-muted" style="margin-top:2px;">Rx: <span style="font-family:monospace;">${esc(inv.prescription_no)}</span></div>` : ''}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Items -->
        <div class="card">
          <div class="card-title">Items <small>${items.length} line${items.length === 1 ? '' : 's'}</small></div>

          <div class="table-wrap" style="border:0;box-shadow:none;">
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th style="text-align:center">Qty</th>
                  <th style="text-align:right">MRP</th>
                  <th style="text-align:right">Rate</th>
                  <th style="text-align:right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => `
                  <tr>
                    <td><strong>${esc(it.product_name)}</strong></td>
                    <td>${it.batch_no ? `<span class="chip chip-neutral" style="font-family:monospace">${esc(it.batch_no)}</span>` : '<span class="text-xs text-muted">—</span>'}</td>
                    <td>${it.expiry_date ? `<div>${fmtExpiryShort(it.expiry_date)}</div><div style="margin-top:3px;">${renderExpiryBadge(it.expiry_date)}</div>` : '<span class="text-xs text-muted">—</span>'}</td>
                    <td style="text-align:center;">${fmtNum(it.qty)} ${esc(it.unit || '')}</td>
                    <td style="text-align:right;" class="text-sm text-muted">${it.mrp ? rs(it.mrp) : '—'}</td>
                    <td style="text-align:right;">${rs(it.price)}</td>
                    <td style="text-align:right;font-weight:600;">${rs(it.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Mobile Items -->
          <div class="mobile-list">
            ${items.map(it => `
              <div class="card" style="margin-bottom:8px;padding:12px;background:var(--bg-app);border:1px solid var(--border);box-shadow:none;">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:13px;">${esc(it.product_name)}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;">
                      ${it.batch_no ? `<span class="chip chip-neutral" style="font-family:monospace">B:${esc(it.batch_no)}</span>` : ''}
                      ${it.expiry_date ? renderExpiryBadge(it.expiry_date) : ''}
                    </div>
                    <div class="text-xs text-muted" style="margin-top:6px;">
                      ${fmtNum(it.qty)} ${esc(it.unit || '')} × ${rs(it.price)}
                      ${it.mrp ? ' · MRP ' + rs(it.mrp) : ''}
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    <div style="font-weight:800;font-size:15px;color:var(--primary);">${rs(it.total)}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Totals & Notes -->
        <div class="card">
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;">
              <span class="text-muted">Subtotal</span>
              <b>${rs(inv.subtotal)}</b>
            </div>
            ${Number(inv.discount) > 0 ? `
              <div style="display:flex;justify-content:space-between;">
                <span class="text-muted">Discount</span>
                <b style="color:var(--danger);">− ${rs(inv.discount)}</b>
              </div>
            ` : ''}
            ${gstOn ? `
              <div style="display:flex;justify-content:space-between;">
                <span class="text-muted">GST (included)</span>
                <b>${rs(gstAmt)}</b>
              </div>
            ` : ''}
            <div style="display:flex;justify-content:space-between;font-size:16px;padding-top:8px;border-top:1px solid var(--border);margin-top:4px;">
              <b>Total</b>
              <b style="color:var(--primary);">${rs(inv.total)}</b>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span class="text-muted">Paid</span>
              <b style="color:var(--success);">${rs(inv.paid)}</b>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span class="text-muted">Due</span>
              <b style="color:${Number(inv.due) > 0 ? 'var(--danger)' : 'var(--success)'};">${rs(inv.due)}</b>
            </div>
          </div>
          ${inv.notes ? `
            <div style="margin-top:16px;padding:12px;background:var(--bg-app);border-radius:var(--radius-sm);font-size:12px;color:var(--text-muted);">
              <b style="color:var(--text-main);">Notes:</b> ${esc(inv.notes)}
            </div>
          ` : ''}
        </div>

      </div>

      <!-- RIGHT: Actions -->
      <div style="position:sticky;top:84px;display:flex;flex-direction:column;gap:16px;">
        
        <!-- Print & Share -->
        <div class="card">
          <div class="card-title">Print & Share</div>

          <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;margin-bottom:8px;">Print bill</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
            <button class="btn btn-ghost" id="btn-local-print" style="justify-content:flex-start;font-size:12px;">🖨 Local</button>
            <button class="btn btn-ghost" id="btn-bt-print"    style="justify-content:flex-start;font-size:12px;">📶 Bluetooth</button>
            <button class="btn btn-ghost" id="btn-usb-print"   style="justify-content:flex-start;font-size:12px;">🔌 USB</button>
            <button class="btn btn-ghost" id="btn-pdf"         style="justify-content:flex-start;font-size:12px;">📄 A4 PDF</button>
          </div>

          <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;margin-bottom:8px;">Send on WhatsApp</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button class="btn" id="btn-wa-text" style="background:#25D366;color:#fff;justify-content:flex-start;font-size:12px;" ${custPhone ? '' : 'disabled'}>
              💬 WhatsApp Text
            </button>
            <button class="btn" id="btn-wa-pdf" style="background:#25D366;color:#fff;justify-content:flex-start;font-size:12px;" ${custPhone ? '' : 'disabled'}>
              📎 WhatsApp PDF
            </button>
          </div>

          ${!custPhone ? `
            <div class="field-hint" style="margin-top:10px;">Add a phone number to enable WhatsApp sharing.</div>
          ` : ''}
        </div>

        <!-- Delete -->
        <div class="card">
          <button class="btn btn-danger btn-block" id="btn-del-inv">🗑 Delete Invoice</button>
          <div class="field-hint" style="text-align:center;margin-top:8px;">Stock will be restored to the original batches</div>
        </div>

      </div>
    </div>

    <div class="text-center text-xs text-muted" style="padding:20px 0;">${enteredOn(inv)}</div>
  `;

  // ── WIRE BUTTONS ──
  const party = { name: custName, phone: custPhone };

  $('#btn-local-print').onclick = () => runLocalPrint(inv, items, party);
  $('#btn-bt-print').onclick    = () => runBluetoothPrint(inv, items, party);
  $('#btn-usb-print').onclick   = () => runUsbPrint(inv, items, party);
  $('#btn-pdf').onclick         = () => runInvoicePDF(inv, items, party);

  const waTextBtn = $('#btn-wa-text');
  if(waTextBtn && custPhone) {
    waTextBtn.onclick = () => sendInvoiceWhatsAppText(inv, items, custPhone);
  }
  const waPdfBtn = $('#btn-wa-pdf');
  if(waPdfBtn && custPhone) {
    waPdfBtn.onclick = () => sendInvoiceWhatsAppPDF(inv, items, custPhone);
  }

  $('#btn-del-inv').onclick = async () => {
    await deleteInvoice(inv, () => { location.hash = '#/invoices'; });
  };

  // Auto-open print if ?print=1
  const hashQuery = location.hash.split('?')[1] || '';
  if(new URLSearchParams(hashQuery).get('print') === '1') {
    setTimeout(() => {
      openPrintSheet(inv, items, party);
    }, 300);
  }
}

/* ─────────────────────────────────────────────
   56. PRINT STUBS (Guards for Module Load)
   ───────────────────────────────────────────── */
function runLocalPrint(inv, items, party) {
  if(window.LocalPrinter && typeof window.LocalPrinter.print === 'function') {
    window.LocalPrinter.print(inv, items, party);
  } else {
    toast('Local printer module not loaded', 'error');
  }
}

function runBluetoothPrint(inv, items, party) {
  if(window.BluetoothPrinter && typeof window.BluetoothPrinter.printInvoice === 'function') {
    window.BluetoothPrinter.printInvoice(inv, items, party);
  } else {
    toast('Bluetooth printer module not loaded', 'error');
  }
}

function runUsbPrint(inv, items, party) {
  if(window.USBPrinter && typeof window.USBPrinter.printInvoice === 'function') {
    window.USBPrinter.printInvoice(inv, items, party);
  } else {
    toast('USB printer module not loaded', 'error');
  }
}

function runInvoicePDF(inv, items, party) {
  if(window.PDFMaker && typeof window.PDFMaker.invoice === 'function') {
    window.PDFMaker.invoice(inv, items, party);
  } else {
    toast('PDF module not loaded', 'error');
  }
}

function openPrintSheet(inv, items, party) {
  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">Print Invoice</div>
        <div class="text-xs text-muted" style="margin-top:2px;">${esc(inv.invoice_no || '')} · ${rs(inv.total)}</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="btn btn-ghost btn-block" id="ps-local" style="justify-content:flex-start;">🖨 Local Print</button>
        <button class="btn btn-ghost btn-block" id="ps-bt"    style="justify-content:flex-start;">📶 Bluetooth Print</button>
        <button class="btn btn-ghost btn-block" id="ps-usb"   style="justify-content:flex-start;">🔌 USB Print</button>
        <button class="btn btn-ghost btn-block" id="ps-pdf"   style="justify-content:flex-start;">📄 A4 PDF</button>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>
  `, (root) => {
    root.querySelector('#ps-local').onclick = () => { closeModal(root); runLocalPrint(inv, items, party); };
    root.querySelector('#ps-bt').onclick    = () => { closeModal(root); runBluetoothPrint(inv, items, party); };
    root.querySelector('#ps-usb').onclick   = () => { closeModal(root); runUsbPrint(inv, items, party); };
    root.querySelector('#ps-pdf').onclick   = () => { closeModal(root); runInvoicePDF(inv, items, party); };
  });
}

/* ─────────────────────────────────────────────
   57. THERMAL RECEIPT BUILDERS
   ───────────────────────────────────────────── */

/* Pure ASCII text for ESC/POS printers */
function buildThermalReceiptText(inv, items, party) {
  const W = 32;
  const divider = '-'.repeat(W);
  const line = (l, r) => {
    l = String(l || '');
    r = String(r || '');
    if(l.length + r.length >= W) l = l.slice(0, Math.max(0, W - r.length - 1));
    return l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r;
  };
  const clip = (s, n) => {
    s = String(s || '');
    return s.length <= n ? s : s.slice(0, n);
  };

  let t = '';

  // Header
  t += (SETTINGS.shop_name || 'MediStore') + '\n';
  if(SETTINGS.owner_name) t += SETTINGS.owner_name + '\n';
  if(SETTINGS.address)    t += SETTINGS.address + '\n';
  if(SETTINGS.city)       t += SETTINGS.city + '\n';
  if(SETTINGS.phone)      t += 'Ph: ' + SETTINGS.phone + '\n';
  if(SETTINGS.gst_enabled && SETTINGS.gst_number) t += 'GSTIN: ' + SETTINGS.gst_number + '\n';
  if(SETTINGS.license)    t += 'DL No: ' + SETTINGS.license + '\n';
  if(SETTINGS.dl_number)  t += 'DL: ' + SETTINGS.dl_number + '\n';
  t += divider + '\n';

  // Invoice & Customer
  t += line('Bill: ' + (inv.invoice_no || ''), fmtDate(txDate(inv, 'invoice_date'))) + '\n';
  const custName = inv.customer_name || (party && party.name) || 'Walk-in';
  t += line('Customer:', clip(custName, 20)) + '\n';
  if(inv.customer_phone || (party && party.phone)) {
    t += 'Ph: ' + (inv.customer_phone || party.phone) + '\n';
  }
  if(inv.doctor_name || inv.patient_name || inv.prescription_no) {
    if(inv.doctor_name)     t += line('Dr:', clip(inv.doctor_name, 26)) + '\n';
    if(inv.patient_name)    t += line('Patient:', clip(inv.patient_name, 22)) + '\n';
    if(inv.prescription_no) t += line('Rx:', clip(inv.prescription_no, 26)) + '\n';
  }
  t += divider + '\n';

  // Items
  items.forEach((it) => {
    let name = it.product_name || '';
    if(name.length > W) {
      t += name.slice(0, W) + '\n';
      t += name.slice(W) + '\n';
    } else {
      t += name + '\n';
    }
    const batchLbl = it.batch_no ? 'B:' + it.batch_no : '';
    const expLbl   = it.expiry_date ? 'E:' + fmtExpiryShort(it.expiry_date) : '';
    const meta     = ('  ' + batchLbl + ' ' + expLbl).trim();
    const amtStr   = 'Rs.' + Number(it.total || 0).toFixed(2);
    t += line(meta, amtStr) + '\n';
    t += '  ' + fmtNum(it.qty) + ' ' + (it.unit || '') + ' x Rs.' + Number(it.price || 0).toFixed(2) + '\n';
  });

  t += divider + '\n';

  // Totals
  t += line('Subtotal', 'Rs.' + Number(inv.subtotal || 0).toFixed(2)) + '\n';
  if(Number(inv.discount) > 0) {
    t += line('Discount', '-Rs.' + Number(inv.discount).toFixed(2)) + '\n';
  }
  if(inv.gst_enabled && Number(inv.gst_amount) > 0) {
    t += line('GST (incl.)', 'Rs.' + Number(inv.gst_amount).toFixed(2)) + '\n';
  }
  t += line('TOTAL', 'Rs.' + Number(inv.total || 0).toFixed(2)) + '\n';
  t += line('Paid', 'Rs.' + Number(inv.paid || 0).toFixed(2)) + '\n';
  if(Number(inv.due) > 0) {
    t += line('DUE', 'Rs.' + Number(inv.due).toFixed(2)) + '\n';
  }
  t += divider + '\n';

  // Footer
  t += (SETTINGS.print_footer || 'Thank you! Get well soon') + '\n';
  t += 'Medicines once sold are\nnot returnable.\n';
  t += '\n';

  return t;
}

/* HTML receipt for browser print */
function buildThermalReceiptHTML(inv, items, party) {
  const custName = inv.customer_name || (party && party.name) || 'Walk-in';

  const rows = items.map(it => `
    <div style="margin-bottom:6px;">
      <div style="font-weight:700;">${esc(it.product_name)}</div>
      <div style="display:flex;justify-content:space-between;font-size:10px;">
        <span>${it.batch_no ? 'B:' + esc(it.batch_no) : ''}${it.batch_no && it.expiry_date ? ' · ' : ''}${it.expiry_date ? 'E:' + fmtExpiryShort(it.expiry_date) : ''}</span>
        <span>Rs.${Number(it.total || 0).toFixed(2)}</span>
      </div>
      <div style="font-size:10px;color:#444;">${fmtNum(it.qty)} ${esc(it.unit || '')} x Rs.${Number(it.price || 0).toFixed(2)}</div>
    </div>
  `).join('');

  const gstLine = inv.gst_enabled && Number(inv.gst_amount) > 0
    ? `<div style="display:flex;justify-content:space-between;"><span>GST (incl.)</span><span>Rs.${Number(inv.gst_amount).toFixed(2)}</span></div>`
    : '';

  const discLine = Number(inv.discount) > 0
    ? `<div style="display:flex;justify-content:space-between;"><span>Discount</span><span>-Rs.${Number(inv.discount).toFixed(2)}</span></div>`
    : '';

  const dueLine = Number(inv.due) > 0
    ? `<div style="display:flex;justify-content:space-between;font-weight:700;"><span>DUE</span><span>Rs.${Number(inv.due).toFixed(2)}</span></div>`
    : '';

  return `
    <div style="font-family:ui-monospace,'Courier New',monospace;font-size:11px;line-height:1.4;color:#000;width:56mm;padding:2mm;margin:0 auto;">
      <div style="text-align:left;margin-bottom:6px;">
        <div style="font-weight:700;font-size:13px;">${esc(SETTINGS.shop_name || 'MediStore')}</div>
        ${SETTINGS.owner_name ? `<div>${esc(SETTINGS.owner_name)}</div>` : ''}
        ${SETTINGS.address ? `<div>${esc(SETTINGS.address)}</div>` : ''}
        ${SETTINGS.city ? `<div>${esc(SETTINGS.city)}</div>` : ''}
        ${SETTINGS.phone ? `<div>Ph: ${esc(SETTINGS.phone)}</div>` : ''}
        ${SETTINGS.gst_enabled && SETTINGS.gst_number ? `<div>GSTIN: ${esc(SETTINGS.gst_number)}</div>` : ''}
        ${SETTINGS.license ? `<div>DL No: ${esc(SETTINGS.license)}</div>` : ''}
        ${SETTINGS.dl_number ? `<div>DL: ${esc(SETTINGS.dl_number)}</div>` : ''}
      </div>
      <div style="border-top:1px dashed #000;margin:4px 0;"></div>
      <div style="display:flex;justify-content:space-between;"><span>Bill: ${esc(inv.invoice_no || '')}</span><span>${fmtDate(txDate(inv, 'invoice_date'))}</span></div>
      <div>Customer: ${esc(custName)}</div>
      ${inv.customer_phone ? `<div>Ph: ${esc(inv.customer_phone)}</div>` : ''}
      <div style="border-top:1px dashed #000;margin:4px 0;"></div>
      ${rows}
      <div style="border-top:1px dashed #000;margin:4px 0;"></div>
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>Rs.${Number(inv.subtotal || 0).toFixed(2)}</span></div>
      ${discLine}
      ${gstLine}
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:12px;margin-top:2px;"><span>TOTAL</span><span>Rs.${Number(inv.total || 0).toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Paid</span><span>Rs.${Number(inv.paid || 0).toFixed(2)}</span></div>
      ${dueLine}
      <div style="border-top:1px dashed #000;margin:4px 0;"></div>
      <div style="text-align:center;margin-top:6px;font-size:10px;">
        ${esc(SETTINGS.print_footer || 'Thank you! Get well soon')}<br>
        Medicines once sold are not returnable.
      </div>
      <div style="height:20mm;"></div>
    </div>
  `;
}

/* ─────────────────────────────────────────────
   58. WHATSAPP TEXT SHARE
   ───────────────────────────────────────────── */
function sendInvoiceWhatsAppText(inv, items, phone) {
  if(!phone) { toast('No phone number on this invoice', 'error'); return; }

  const shopName = SETTINGS.shop_name || 'MediStore';
  const custName = inv.customer_name || 'Customer';

  let msg = '';
  msg += '*' + shopName + '*\n';
  if(SETTINGS.address) msg += SETTINGS.address + '\n';
  if(SETTINGS.phone)   msg += 'Ph: ' + SETTINGS.phone + '\n';
  if(SETTINGS.gst_enabled && SETTINGS.gst_number) msg += 'GSTIN: ' + SETTINGS.gst_number + '\n';
  msg += '\n';

  msg += '*' + (inv.invoice_no || 'INVOICE') + '*\n';
  msg += 'Date: ' + fmtDate(txDate(inv, 'invoice_date')) + '\n';
  msg += 'Customer: ' + custName + '\n';
  if(inv.customer_phone)  msg += 'Phone: ' + inv.customer_phone + '\n';
  if(inv.doctor_name)     msg += 'Doctor: ' + inv.doctor_name + '\n';
  if(inv.patient_name)    msg += 'Patient: ' + inv.patient_name + '\n';
  if(inv.prescription_no) msg += 'Rx: ' + inv.prescription_no + '\n';

  msg += '\n*Items:*\n';
  items.forEach((it, i) => {
    msg += (i + 1) + '. ' + it.product_name + '\n';
    if(it.batch_no) msg += '   Batch: ' + it.batch_no + (it.expiry_date ? ' | Exp: ' + fmtExpiryShort(it.expiry_date) : '') + '\n';
    msg += '   Qty: ' + fmtNum(it.qty) + ' x Rs.' + Number(it.price || 0).toFixed(2)
        + ' = Rs.' + Number(it.total || 0).toFixed(2) + '\n';
  });

  msg += '\n--------------------\n';
  msg += 'Subtotal:    Rs.' + Number(inv.subtotal || 0).toFixed(2) + '\n';
  if(Number(inv.discount) > 0) msg += 'Discount:    -Rs.' + Number(inv.discount).toFixed(2) + '\n';
  if(inv.gst_enabled && Number(inv.gst_amount) > 0) msg += 'GST (incl.): Rs.' + Number(inv.gst_amount).toFixed(2) + '\n';
  msg += '*TOTAL:       Rs.' + Number(inv.total || 0).toFixed(2) + '*\n';
  msg += 'Paid:        Rs.' + Number(inv.paid || 0).toFixed(2) + '\n';
  msg += '*Due:         Rs.' + Number(inv.due  || 0).toFixed(2) + '*\n';
  msg += '\n';

  msg += (SETTINGS.print_footer || 'Thank you! Get well soon') + '\n';
  msg += 'Medicines once sold are not returnable.\n';

  window.open(waLink(phone, msg), '_blank', 'noopener,noreferrer');
}

/* ─────────────────────────────────────────────
   59. WHATSAPP PDF SHARE
   ───────────────────────────────────────────── */
async function sendInvoiceWhatsAppPDF(inv, items, phone) {
  if(!phone) { toast('No phone number on this invoice', 'error'); return; }

  if(!(window.jspdf && window.jspdf.jsPDF)) {
    toast('PDF library not loaded', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');

  const shopName = SETTINGS.shop_name || 'MediStore';
  const custName = inv.customer_name || 'Walk-in';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(shopName, 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let hy = 24;
  if(SETTINGS.address)   { doc.text(SETTINGS.address,    14, hy); hy += 4; }
  if(SETTINGS.city)      { doc.text(SETTINGS.city,       14, hy); hy += 4; }
  if(SETTINGS.phone)     { doc.text('Ph: ' + SETTINGS.phone, 14, hy); hy += 4; }
  if(SETTINGS.gst_enabled && SETTINGS.gst_number) { doc.text('GSTIN: ' + SETTINGS.gst_number, 14, hy); hy += 4; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('INVOICE', 14, hy + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let iy = hy + 12;
  doc.text('Invoice No:', 14, iy);
  doc.text(String(inv.invoice_no || ''), 40, iy);
  doc.text('Date:', 14, iy + 5);
  doc.text(fmtDate(txDate(inv, 'invoice_date')), 40, iy + 5);
  doc.text('Customer:', 14, iy + 10);
  doc.text(custName, 40, iy + 10);

  const startY = iy + 20;
  const body = items.map(it => [
    String(it.product_name || ''),
    String(it.batch_no || '-'),
    it.expiry_date ? fmtExpiryShort(it.expiry_date) : '-',
    fmtNum(it.qty) + ' ' + (it.unit || ''),
    Number(it.price || 0).toFixed(2),
    Number(it.total || 0).toFixed(2)
  ]);

  doc.autoTable({
    startY,
    head: [['Medicine', 'Batch', 'Expiry', 'Qty', 'Rate', 'Amount']],
    body,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [91, 91, 214], textColor: 255 },
    columnStyles: { 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: 14, right: 14 }
  });

  let y = doc.lastAutoTable.finalY + 8;
  const rightX = 196;
  const labelX = 130;

  doc.setFontSize(10);
  doc.text('Subtotal:', labelX, y);
  doc.text('Rs.' + Number(inv.subtotal || 0).toFixed(2), rightX, y, { align: 'right' });
  y += 5;

  if(Number(inv.discount) > 0) {
    doc.text('Discount:', labelX, y);
    doc.text('- Rs.' + Number(inv.discount).toFixed(2), rightX, y, { align: 'right' });
    y += 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL:', labelX, y);
  doc.text('Rs.' + Number(inv.total || 0).toFixed(2), rightX, y, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Paid:', labelX, y);
  doc.text('Rs.' + Number(inv.paid || 0).toFixed(2), rightX, y, { align: 'right' });
  y += 5;
  doc.text('Due:', labelX, y);
  doc.text('Rs.' + Number(inv.due || 0).toFixed(2), rightX, y, { align: 'right' });

  const filename = 'Invoice-' + (inv.invoice_no || '').replace(/[^\w-]/g, '') + '.pdf';
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  if(navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Invoice ' + (inv.invoice_no || ''),
        text: shopName + ' - Invoice ' + (inv.invoice_no || '')
      });
      toast('Shared', 'success');
      return;
    } catch(err) {
      if(err && err.name === 'AbortError') return;
    }
  }

  doc.save(filename);
  const text =
    '*' + shopName + '*\n\nInvoice *' + (inv.invoice_no || '') + '* - ' + rs(inv.total) + '\n\n' +
    'Please find the PDF attached.\n(Downloaded to your device - attach it in this chat.)';
  window.open(waLink(phone, text), '_blank', 'noopener,noreferrer');
  toast('PDF downloaded - attach it in WhatsApp', 'info');
}

console.log('[MediStore] Core Logic Block 13 loaded');
/* ─────────────────────────────────────────────
   60. RETURNS PAGE (Shell with Tabs)
   ───────────────────────────────────────────── */
function renderReturns(content) {
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Returns</h1>
        <p>Customer returns &amp; supplier returns</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;padding:12px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="rt-tab-from">↩ From Customer</button>
        <button class="btn btn-ghost btn-sm" id="rt-tab-to">↪ To Supplier</button>
      </div>
    </div>

    <div id="rt-content"></div>

    <div class="card" style="margin-top:24px;">
      <div class="card-title">Recent Returns</div>
      <div id="rt-list"></div>
    </div>
  `;

  $('#rt-tab-from').onclick = () => {
    $('#rt-tab-from').className = 'btn btn-primary btn-sm';
    $('#rt-tab-to').className   = 'btn btn-ghost btn-sm';
    renderFromCustomer();
  };
  $('#rt-tab-to').onclick = () => {
    $('#rt-tab-to').className   = 'btn btn-primary btn-sm';
    $('#rt-tab-from').className = 'btn btn-ghost btn-sm';
    renderToSupplier();
  };

  renderReturnsList();
  renderFromCustomer();
}

/* ─────────────────────────────────────────────
   61. RECENT RETURNS LIST
   ───────────────────────────────────────────── */
function renderReturnsList() {
  const box = $('#rt-list');
  if(!box) return;

  const arr = DB.returns.slice(0, 25);

  if(!arr.length) {
    box.innerHTML = '<p class="text-sm text-muted text-center" style="padding:20px 0;">No returns recorded yet</p>';
    return;
  }

  box.innerHTML = `
    <div class="table-wrap" style="border:0;box-shadow:none;">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Direction</th>
            <th>Product</th>
            <th>Batch</th>
            <th>Qty</th>
            <th style="text-align:right">Amount</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody>
          ${arr.map(r => {
            const inv = r.invoice_id ? DB.invoices.find(i => i.id === r.invoice_id) : null;
            const sup = r.supplier_id ? DB.suppliers.find(s => s.id === r.supplier_id) : null;
            const cust = r.customer_id ? DB.customers.find(c => c.id === r.customer_id) : null;

            const dirChip = r.direction === 'from_customer'
              ? '<span class="chip chip-primary">From Customer</span>'
              : '<span class="chip chip-warning">To Supplier</span>';

            const subName = r.direction === 'from_customer'
              ? (r.customer_name || (cust && cust.name) || (inv && inv.customer_name) || '—')
              : (r.supplier_name || (sup && sup.name) || '—');

            return `<tr>
              <td class="text-sm text-muted">${fmtDate(txDate(r, 'return_date'))}</td>
              <td>${dirChip}</td>
              <td>
                <strong>${esc(r.product_name || '—')}</strong>
                <div class="text-xs text-muted" style="margin-top:2px;">${esc(subName)}</div>
              </td>
              <td>${r.batch_no ? `<span class="chip chip-neutral" style="font-family:monospace">${esc(r.batch_no)}</span>` : '—'}</td>
              <td>${fmtNum(r.qty)} ${esc(r.unit || '')}</td>
              <td style="text-align:right;color:var(--danger);font-weight:600;">${rs(r.amount)}</td>
              <td style="text-align:right;">
                <button class="btn btn-ghost btn-sm" data-rt-del="${r.id}" style="color:var(--danger);">Del</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="mobile-list">
      ${arr.map(r => {
        const cust = r.customer_id ? DB.customers.find(c => c.id === r.customer_id) : null;
        const sup  = r.supplier_id  ? DB.suppliers.find(s => s.id === r.supplier_id)  : null;
        const subName = r.direction === 'from_customer'
          ? (r.customer_name || (cust && cust.name) || '—')
          : (r.supplier_name || (sup && sup.name) || '—');
        const chip = r.direction === 'from_customer'
          ? '<span class="chip chip-primary" style="font-size:10px;">From Customer</span>'
          : '<span class="chip chip-warning" style="font-size:10px;">To Supplier</span>';
        return `
          <div class="mobile-card">
            <div class="mobile-card-head">
              <div>
                <div class="mobile-card-title">${esc(r.product_name || '—')}</div>
                <div class="mobile-card-sub">${chip} · ${esc(subName)}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:700;color:var(--danger);">${rs(r.amount)}</div>
                <div class="text-xs text-muted" style="margin-top:2px;">${r.batch_no ? 'Batch ' + esc(r.batch_no) : ''}</div>
              </div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);">
              Qty ${fmtNum(r.qty)} ${esc(r.unit || '')} · ${fmtDate(txDate(r, 'return_date'))}
            </div>
            <div class="mobile-card-foot">
              <button class="btn btn-ghost btn-sm" data-rt-del="${r.id}" style="color:var(--danger);">Delete</button>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;

  // Show mobile list on small screens
  const mobBox = box.querySelector('.mobile-list');
  const tblBox = box.querySelector('.table-wrap');
  if(mobBox && tblBox) {
    const showMobile = () => {
      const isMobile = window.innerWidth <= 1024;
      mobBox.style.display = isMobile ? 'flex' : 'none';
      tblBox.style.display = isMobile ? 'none' : 'block';
    };
    showMobile();
    if(window.__mediReturnsResize) window.removeEventListener('resize', window.__mediReturnsResize);
    window.__mediReturnsResize = showMobile;
    window.addEventListener('resize', showMobile);
  }

  $$('[data-rt-del]').forEach(b => b.onclick = () => deleteReturn(b.dataset.rtDel));
}

/* ─────────────────────────────────────────────
   62. DELETE RETURN (Reverses Stock + Credits)
   ───────────────────────────────────────────── */
async function deleteReturn(id) {
  const r = DB.returns.find(x => x.id === id);
  if(!r) return;

  if(!confirmDlg('Delete this return?\n\nStock and account balances will be reversed.', 'Confirm Delete')) return;

  // 1. Reverse stock
  if(r.product_id && r.batch_id) {
    if(r.direction === 'from_customer') {
      // Customer gave back → we added to batch → now reverse = subtract
      const batch = DB.product_batches.find(b => b.id === r.batch_id);
      if(batch) await adjustBatchQty(batch.id, -Number(r.qty) || 0);
    } else {
      // We gave back to supplier → subtracted from batch → now reverse = add back
      const batch = DB.product_batches.find(b => b.id === r.batch_id);
      if(batch) await adjustBatchQty(batch.id, Number(r.qty) || 0);
    }
  } else if(r.product_id) {
    // Non-batch product
    if(r.direction === 'from_customer') {
      await adjustProductStock(r.product_id, -Number(r.qty) || 0);
    } else {
      await adjustProductStock(r.product_id, Number(r.qty) || 0);
    }
  }

  // 2. Reverse customer credit note
  if(r.direction === 'from_customer' && r.customer_id) {
    const inv = r.invoice_id ? DB.invoices.find(i => i.id === r.invoice_id) : null;
    const origInvNo = inv ? inv.invoice_no : '';

    const credits = DB.invoices.filter(i =>
      i.customer_id === r.customer_id &&
      String(i.invoice_no || '').startsWith(RETURN_PREFIX) &&
      Math.abs(Number(i.total)) === Math.abs(Number(r.amount))
    );

    if(credits.length) {
      // Prefer credit with matching notes (contains original invoice no)
      let match = credits.find(c => origInvNo && String(c.notes || '').includes(origInvNo));
      if(!match) {
        credits.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        match = credits[0];
      }
      await sb.from('invoices').delete().eq('id', match.id);
    }
  }

  // 3. Reverse supplier credit-note payment
  if(r.direction === 'to_supplier' && r.supplier_id) {
    const credPays = DB.supplier_payments.filter(p =>
      p.supplier_id === r.supplier_id &&
      p.mode === 'credit-note' &&
      Number(p.amount) === Number(r.amount)
    );
    if(credPays.length) {
      credPays.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      await sb.from('supplier_payments').delete().eq('id', credPays[0].id);
    }
  }

  // 4. Delete the return record
  const { error } = await sb.from('returns').delete().eq('id', r.id);
  if(error) {
    console.error(error);
    toast('Failed to delete return record.', 'error');
    return;
  }

  await syncDB();
  toast('Return deleted · reversed', 'success');
  route();
}

/* ─────────────────────────────────────────────
   63. RETURN FROM CUSTOMER
   ───────────────────────────────────────────── */
function renderFromCustomer() {
  $('#rt-content').innerHTML = `
    <div class="card">
      <div class="card-title">Return from Customer</div>

      <div style="display:flex;flex-direction:column;gap:16px;">
        ${dateTimeFieldHTML(null, '', 'Return Date')}

        <div>
          <label class="label">Invoice</label>
          ${searchSelectHTML('rtc-inv-ss', 'Search invoice no, customer...')}
          <div class="field-hint">Pick the original invoice — items will be listed below</div>
        </div>

        <div id="rtc-lines"></div>
        <div id="rtc-fields" style="display:none;flex-direction:column;gap:16px;margin-top:16px;">
          <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <label class="label">Quantity to Return *</label>
              <input class="input" type="number" step="any" min="0.01" id="rtc-qty" value="1">
            </div>
            <div>
              <label class="label">Refund Amount (₹) *</label>
              <input class="input" type="number" step="any" min="0.01" id="rtc-amt" value="0">
            </div>
          </div>
          <div>
            <label class="label">Reason</label>
            <input class="input" id="rtc-reason" placeholder="Expired, wrong item, customer request...">
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:8px;">
          <button class="btn btn-primary" id="rtc-submit" disabled>Record Return</button>
        </div>
      </div>
    </div>
  `;

  let selectedInvoice = null;
  let selectedLineIdx = -1;
  let selectedLine    = null;

  const invSS = $('#rtc-inv-ss');
  mountSearchSelect(invSS, {
    items: DB.invoices
      .filter(i => !String(i.invoice_no || '').startsWith(RETURN_PREFIX))
      .map(invoiceToOption),
    onSelect: (opt) => {
      selectedInvoice = opt ? DB.invoices.find(i => i.id === opt.id) : null;
      selectedLineIdx = -1;
      selectedLine    = null;
      renderLineList();
    }
  });

  function renderLineList() {
    const box       = $('#rtc-lines');
    const fieldsBox = $('#rtc-fields');
    const submitBtn = $('#rtc-submit');

    if(!selectedInvoice) {
      box.innerHTML = '';
      fieldsBox.style.display = 'none';
      submitBtn.disabled = true;
      return;
    }

    const items = DB.invoice_items.filter(i => i.invoice_id === selectedInvoice.id);

    if(!items.length) {
      box.innerHTML = '<p class="text-sm text-muted text-center" style="padding:14px 0;">No items on this invoice</p>';
      fieldsBox.style.display = 'none';
      submitBtn.disabled = true;
      return;
    }

    box.innerHTML = `
      <label class="label">Select Item to Return</label>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${items.map((it, i) => `
          <div class="panel-list-item ${i === selectedLineIdx ? 'active' : ''}" data-line-idx="${i}" style="cursor:pointer;border:1px solid ${i === selectedLineIdx ? 'var(--primary)' : 'var(--border)'};background:${i === selectedLineIdx ? 'var(--primary-light)' : 'var(--bg-card)'};border-radius:var(--radius-sm);padding:14px;display:flex;align-items:center;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:13px;color:var(--text-main);">${esc(it.product_name)}</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;">
                ${it.batch_no ? `<span class="chip chip-neutral" style="font-family:monospace">${esc(it.batch_no)}</span>` : ''}
                ${it.expiry_date ? renderExpiryBadge(it.expiry_date) : ''}
              </div>
              <div class="text-xs text-muted" style="margin-top:6px;">
                Sold qty: <b>${fmtNum(it.qty)} ${esc(it.unit || '')}</b> × ${rs(it.price)}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700;">${rs(it.total)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    box.querySelectorAll('[data-line-idx]').forEach(el => {
      el.onclick = () => {
        selectedLineIdx = parseInt(el.dataset.lineIdx, 10);
        selectedLine    = items[selectedLineIdx];
        $('#rtc-qty').value = 1;
        $('#rtc-amt').value = Number(selectedLine.price || 0).toFixed(2);
        renderLineList();
      };
    });

    if(selectedLine) {
      fieldsBox.style.display = 'flex';
      submitBtn.disabled = false;
    } else {
      fieldsBox.style.display = 'none';
      submitBtn.disabled = true;
    }
  }

  // Auto-calculate refund amount on qty change
  const qtyEl = $('#rtc-qty');
  if(qtyEl) {
    qtyEl.oninput = (e) => {
      if(!selectedLine) return;
      const q = Number(e.target.value) || 0;
      $('#rtc-amt').value = (q * Number(selectedLine.price || 0)).toFixed(2);
    };
  }

  // Submit
  $('#rtc-submit').onclick = async () => {
    if(!selectedInvoice) { toast('Pick an invoice', 'error'); return; }
    if(!selectedLine)    { toast('Pick an item to return', 'error'); return; }

    const dEl = document.querySelector('#rt-content input[name="tx_date"]');
    const tEl = document.querySelector('#rt-content input[name="tx_time"]');
    const dv  = dEl ? dEl.value : '';
    const tv  = (tEl && tEl.value) ? tEl.value.trim() : '';

    if(!dv) { toast('Please pick a date', 'error'); return; }
    if(isFuture(dv)) { toast('Future dates are not allowed', 'error'); return; }

    const qty    = Number($('#rtc-qty').value) || 0;
    const amount = Number($('#rtc-amt').value) || 0;
    const reason = ($('#rtc-reason').value || '').trim();

    if(qty <= 0) { toast('Qty must be greater than 0', 'error'); return; }
    if(qty > Number(selectedLine.qty)) {
      toast('Cannot return more than sold (' + fmtNum(selectedLine.qty) + ')', 'error');
      return;
    }
    if(amount <= 0) { toast('Refund amount must be greater than 0', 'error'); return; }

    const btn = $('#rtc-submit');
    btn.disabled = true; btn.textContent = 'Saving...';

    // 1. Insert return record
    const returnData = {
      direction:    'from_customer',
      invoice_id:   selectedInvoice.id,
      customer_id:  selectedInvoice.customer_id || null,
      product_id:   selectedLine.product_id,
      product_name: selectedLine.product_name,
      batch_id:     selectedLine.batch_id || null,
      batch_no:     selectedLine.batch_no || '',
      expiry_date:  selectedLine.expiry_date || null,
      unit:         selectedLine.unit || '',
      qty:          qty,
      amount:       amount,
      reason,
      return_date:  dv,
      tx_time:      tv
    };

    const { data: rData, error: rErr } = await sb.from('returns').insert(returnData).select().single();
    if(rErr) {
      console.error(rErr);
      toast('Failed to save return record.', 'error');
      btn.disabled = false; btn.textContent = 'Record Return';
      return;
    }

    // 2. Restore stock
    if(selectedLine.batch_id) {
      let returnQty = qty;
      const p = DB.products.find(x => x.id === selectedLine.product_id);
      // Convert loose unit qty back to base unit
      if(p && p.loose_unit && Number(p.conversion_factor) > 1 && selectedLine.unit === p.loose_unit) {
        returnQty = returnQty / Number(p.conversion_factor);
      }
      await adjustBatchQty(selectedLine.batch_id, returnQty);
    } else if(selectedLine.product_id) {
      await adjustProductStock(selectedLine.product_id, qty);
    }

    // 3. Create credit-note invoice
    const creditNo = RETURN_PREFIX + String(Date.now()).slice(-6);
    const creditData = {
      invoice_no:      creditNo,
      customer_id:     selectedInvoice.customer_id || null,
      customer_name:   selectedInvoice.customer_name || '',
      customer_phone:  selectedInvoice.customer_phone || '',
      subtotal:        -amount,
      discount:        0,
      total:           -amount,
      paid:            0,
      due:             -amount,
      notes:           'Return of ' + selectedLine.product_name + ' from ' + selectedInvoice.invoice_no,
      invoice_date:    dv,
      tx_time:         tv,
      gst_enabled:     false,
      gst_amount:      0
    };
    const { data: cInv, error: cErr } = await sb.from('invoices').insert(creditData).select().single();

    // 4. Create credit-note line
    if(!cErr && cInv) {
      await sb.from('invoice_items').insert({
        invoice_id:   cInv.id,
        product_id:   selectedLine.product_id,
        product_name: selectedLine.product_name,
        batch_id:     selectedLine.batch_id || null,
        batch_no:     selectedLine.batch_no || '',
        expiry_date:  selectedLine.expiry_date || null,
        unit:         selectedLine.unit || '',
        qty:          qty,
        mrp:          Number(selectedLine.mrp || 0),
        price:        Number(selectedLine.price || 0),
        gst_rate:     Number(selectedLine.gst_rate || 0),
        gst_amount:   0,
        total:        -amount
      });
    }

    await syncDB();
    toast('Return recorded · stock restored · customer credited', 'success');
    route();
  };
}

/* ─────────────────────────────────────────────
   64. RETURN TO SUPPLIER
   ───────────────────────────────────────────── */
function renderToSupplier() {
  $('#rt-content').innerHTML = `
    <div class="card">
      <div class="card-title">Return to Supplier</div>

      <div style="display:flex;flex-direction:column;gap:16px;">
        ${dateTimeFieldHTML(null, '', 'Return Date')}

        <div>
          <label class="label">Supplier / Company *</label>
          ${searchSelectHTML('rts-sup-ss', 'Search supplier...')}
        </div>

        <div>
          <label class="label">Product *</label>
          ${searchSelectHTML('rts-prod-ss', 'Search product...')}
          <div class="field-hint">Only batch-managed products with sellable stock are shown</div>
        </div>

        <div id="rts-batch-pick"></div>

        <div id="rts-fields" style="display:none;flex-direction:column;gap:16px;">
          <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <label class="label">Qty to Return *</label>
              <input class="input" type="number" step="any" min="0.01" id="rts-qty" value="1">
            </div>
            <div>
              <label class="label">Amount (₹) *</label>
              <input class="input" type="number" step="any" min="0.01" id="rts-amt" value="0">
            </div>
          </div>
          <div>
            <label class="label">Reason</label>
            <input class="input" id="rts-reason" placeholder="Expired, damaged, near expiry return...">
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:8px;">
          <button class="btn btn-primary" id="rts-submit" disabled>Record Return</button>
        </div>
      </div>
    </div>
  `;

  let selectedSupplier = null;
  let selectedProduct  = null;
  let selectedBatch    = null;

  // Supplier picker
  mountSearchSelect($('#rts-sup-ss'), {
    items: DB.suppliers.map(supplierToOption),
    onSelect: (opt) => {
      selectedSupplier = opt ? DB.suppliers.find(s => s.id === opt.id) : null;
    }
  });

  // Product picker (batch-managed only)
  const batchProducts = DB.products.filter(p => p.batch_managed !== false);
  mountSearchSelect($('#rts-prod-ss'), {
    items: batchProducts.map(productToOption),
    onSelect: (opt) => {
      selectedProduct = opt ? DB.products.find(p => p.id === opt.id) : null;
      selectedBatch   = null;
      renderBatchPicker();
    }
  });

  function renderBatchPicker() {
    const box       = $('#rts-batch-pick');
    const fieldsBox = $('#rts-fields');
    const submitBtn = $('#rts-submit');

    if(!selectedProduct) {
      box.innerHTML = '';
      fieldsBox.style.display = 'none';
      submitBtn.disabled = true;
      return;
    }

    const allBatches = batchesOf(selectedProduct.id)
      .filter(b => Number(b.qty) > 0)
      .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));

    if(!allBatches.length) {
      box.innerHTML = '<p class="text-sm text-muted text-center" style="padding:14px 0;">No sellable batch for this product</p>';
      fieldsBox.style.display = 'none';
      submitBtn.disabled = true;
      return;
    }

    box.innerHTML = `
      <label class="label">Select Batch to Return</label>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${allBatches.map((b) => {
          const isSelected = selectedBatch && selectedBatch.id === b.id;
          return `
            <div class="panel-list-item" data-bid="${b.id}" style="cursor:pointer;border:1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'};background:${isSelected ? 'var(--primary-light)' : 'var(--bg-card)'};border-radius:var(--radius-sm);padding:14px;display:flex;align-items:center;gap:12px;">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                  <span class="chip chip-neutral" style="font-family:monospace"><b>${esc(b.batch_no || '—')}</b></span>
                  ${renderExpiryBadge(b.expiry_date)}
                </div>
                <div class="text-xs text-muted" style="margin-top:6px;">
                  Qty: <b>${fmtNum(b.qty)} ${esc(selectedProduct.unit || '')}</b>
                  · Cost ${rs(b.cost)}
                  · MRP ${rs(b.mrp)}
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;

    box.querySelectorAll('[data-bid]').forEach(el => {
      el.onclick = () => {
        selectedBatch = allBatches.find(b => b.id === el.dataset.bid);
        if(selectedBatch) {
          $('#rts-qty').value = 1;
          $('#rts-amt').value = Number(selectedBatch.cost || 0).toFixed(2);
        }
        renderBatchPicker();
      };
    });

    if(selectedBatch) {
      fieldsBox.style.display = 'flex';
      submitBtn.disabled = false;
    } else {
      fieldsBox.style.display = 'none';
      submitBtn.disabled = true;
    }
  }

  // Auto-calc amount based on COST
  $('#rts-qty').addEventListener('input', (e) => {
    if(selectedBatch) {
      const q = Number(e.target.value) || 0;
      $('#rts-amt').value = (q * Number(selectedBatch.cost || 0)).toFixed(2);
    }
  });

  // Submit
  $('#rts-submit').onclick = async () => {
    if(!selectedSupplier) { toast('Pick a supplier', 'error'); return; }
    if(!selectedProduct)  { toast('Pick a product', 'error'); return; }
    if(!selectedBatch)    { toast('Pick a batch', 'error'); return; }

    const dEl = document.querySelector('#rt-content input[name="tx_date"]');
    const tEl = document.querySelector('#rt-content input[name="tx_time"]');
    const dv  = dEl ? dEl.value : '';
    const tv  = (tEl && tEl.value) ? tEl.value.trim() : '';

    if(!dv) { toast('Please pick a date', 'error'); return; }
    if(isFuture(dv)) { toast('Future dates are not allowed', 'error'); return; }

    const qty    = Number($('#rts-qty').value) || 0;
    const amount = Number($('#rts-amt').value) || 0;
    const reason = ($('#rts-reason').value || '').trim();

    if(qty <= 0) { toast('Qty must be greater than 0', 'error'); return; }
    if(qty > Number(selectedBatch.qty)) {
      toast('Cannot return more than batch has (' + fmtNum(selectedBatch.qty) + ')', 'error');
      return;
    }
    if(amount < 0) { toast('Amount cannot be negative', 'error'); return; }

    const btn = $('#rts-submit');
    btn.disabled = true; btn.textContent = 'Saving...';

    // 1. Insert return record
    const returnData = {
      direction:     'to_supplier',
      supplier_id:   selectedSupplier.id,
      product_id:    selectedProduct.id,
      product_name:  selectedProduct.name,
      batch_id:      selectedBatch.id,
      batch_no:      selectedBatch.batch_no || '',
      expiry_date:   selectedBatch.expiry_date || null,
      unit:          selectedProduct.unit || '',
      qty,
      amount,
      reason,
      return_date:   dv,
      tx_time:       tv
    };

    const { error: rErr } = await sb.from('returns').insert(returnData);
    if(rErr) {
      console.error(rErr);
      toast('Failed to save return record.', 'error');
      btn.disabled = false; btn.textContent = 'Record Return';
      return;
    }

    // 2. Reduce batch qty
    await adjustBatchQty(selectedBatch.id, -qty);

    // 3. Reduce supplier payable via credit-note payment
    if(amount > 0) {
      await sb.from('supplier_payments').insert({
        supplier_id:   selectedSupplier.id,
        supplier_name: selectedSupplier.name || '',
        amount,
        mode:          'credit-note',
        notes:         'Return: ' + selectedProduct.name + ' × ' + fmtNum(qty) + ' (Batch ' + (selectedBatch.batch_no || '') + ')',
        payment_date:  dv,
        tx_time:       tv
      });
    }

    await syncDB();
    toast('Return to supplier recorded · stock reduced · payable credited', 'success');
    route();
  };
}

/* ─────────────────────────────────────────────
   65. EXPENSES
   ───────────────────────────────────────────── */
function renderExpenses(content) {
  const list  = DB.expenses;
  const today = todayStr();
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Expenses</h1>
        <p>${list.length} entr${list.length === 1 ? 'y' : 'ies'}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="add-exp">+ Add Expense</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:1;min-width:140px;">
        <label class="label">From</label>
        <input class="input" type="date" id="ex-from" value="${firstOfMonth}" max="${today}">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">To</label>
        <input class="input" type="date" id="ex-to" value="${today}" max="${today}">
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <button class="btn btn-ghost" id="ex-clear">All Time</button>
      </div>
    </div>

    <div class="kpi-row" style="margin-bottom:20px;">
      <div class="kpi-featured" style="grid-column:span 4;background:linear-gradient(135deg,#EF4444 0%,#DC2626 100%);">
        <div class="kpi-icon">💸</div>
        <div>
          <div class="kpi-label">Total Expenses (filtered)</div>
          <div class="kpi-value" id="ex-total">₹0.00</div>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Notes</th>
            <th style="text-align:right">Amount</th>
            <th style="text-align:right"></th>
          </tr>
        </thead>
        <tbody id="ex-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="ex-mobile"></div>
  `;

  function filtered() {
    const f = $('#ex-from').value;
    const t = $('#ex-to').value;
    return list
      .filter(e => {
        const d = txDate(e, 'expense_date');
        if(f && d < f) return false;
        if(t && d > t) return false;
        return true;
      })
      .sort((a, b) => txDate(b, 'expense_date').localeCompare(txDate(a, 'expense_date')));
  }

  function renderList() {
    const arr = filtered();
    const tot = arr.reduce((s, e) => s + Number(e.amount || 0), 0);

    const totalEl = $('#ex-total');
    if(totalEl) totalEl.textContent = rs(tot);

    const tbody = $('#ex-body');
    if(tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">No expenses in this range</td></tr>`
        : arr.map(e => `<tr>
            <td class="text-sm text-muted">${txDT(e, 'expense_date')}</td>
            <td><span class="chip chip-neutral">${esc(e.category || '—')}</span></td>
            <td class="text-sm text-muted">${esc(e.notes || '—')}</td>
            <td style="text-align:right;font-weight:600;color:var(--danger);">${rs(e.amount)}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn btn-ghost btn-sm" data-edit="${e.id}">Edit</button>
              <button class="btn btn-ghost btn-sm" data-del="${e.id}" style="color:var(--danger);">Del</button>
            </td>
          </tr>`).join('');
    }

    const mob = $('#ex-mobile');
    if(mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">No expenses in this range</div></div>`
        : arr.map(e => `
            <div class="mobile-card">
              <div class="mobile-card-head">
                <div>
                  <div class="mobile-card-title">${esc(e.category || '—')}</div>
                  <div class="mobile-card-sub">${e.notes ? esc(e.notes) + ' · ' : ''}${txDT(e, 'expense_date')}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:700;color:var(--danger);">${rs(e.amount)}</div>
                </div>
              </div>
              <div class="mobile-card-foot">
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-ghost btn-sm" data-edit="${e.id}">Edit</button>
                  <button class="btn btn-ghost btn-sm" data-del="${e.id}" style="color:var(--danger);">Delete</button>
                </div>
              </div>
            </div>
          `).join('');
    }

    $$('[data-edit]').forEach(b => b.onclick = () => {
      const e = DB.expenses.find(x => x.id === b.dataset.edit);
      if(e) openExpenseForm(e);
    });

    $$('[data-del]').forEach(b => b.onclick = async () => {
      if(!confirmDlg('Delete this expense?', 'Confirm Delete')) return;
      const { error } = await sb.from('expenses').delete().eq('id', b.dataset.del);
      if(error) {
        console.error(error);
        toast('Failed to delete expense.', 'error');
        return;
      }
      await syncDB();
      toast('Deleted', 'success');
      renderList();
    });
  }

  ['ex-from', 'ex-to'].forEach(id => {
    const el = $('#' + id);
    if(el) el.onchange = renderList;
  });

  $('#ex-clear').onclick = () => {
    $('#ex-from').value = '';
    $('#ex-to').value = '';
    renderList();
  };

  renderList();
  $('#add-exp').onclick = () => openExpenseForm();
}

/* ─────────────────────────────────────────────
   66. EXPENSE FORM
   ───────────────────────────────────────────── */
function openExpenseForm(existing) {
  const e = existing || {
    category: '', amount: '', notes: '',
    expense_date: todayStr(), tx_time: ''
  };

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${existing ? 'Edit' : 'Add'} Expense</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <form id="ef" style="display:flex;flex-direction:column;gap:16px;">
        ${dateTimeFieldHTML(e.expense_date, e.tx_time, 'Expense Date')}
        
        <div>
          <label class="label">Category *</label>
          <input class="input" name="category" required value="${esc(e.category || '')}"
                 placeholder="Rent, electricity, salary, transport..." autofocus list="exp-cats">
          <datalist id="exp-cats">
            <option>Rent</option><option>Electricity</option><option>Salary</option>
            <option>Transport</option><option>Internet</option><option>Packaging</option>
            <option>Maintenance</option><option>Marketing</option><option>Other</option>
          </datalist>
        </div>
        
        <div>
          <label class="label">Amount (₹) *</label>
          <input class="input" type="number" step="any" min="0.01" name="amount" required value="${e.amount || ''}">
        </div>
        
        <div>
          <label class="label">Notes</label>
          <input class="input" name="notes" value="${esc(e.notes || '')}">
        </div>
      </form>
    </div>
    
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="ef-save">${existing ? 'Update' : 'Save'}</button>
    </div>
  `, (root) => {
    root.querySelector('#ef-save').onclick = async () => {
      const form = root.querySelector('#ef');
      if(!form.reportValidity()) return;

      const dt = readDateTime(form);
      if(!dt) return;

      const fd  = new FormData(form);
      const amt = Number(fd.get('amount')) || 0;
      if(amt <= 0) { toast('Amount must be greater than 0', 'error'); return; }

      const data = {
        category:     (fd.get('category') || '').trim(),
        amount:       amt,
        notes:        (fd.get('notes') || '').trim(),
        expense_date: dt.date,
        tx_time:      dt.time || null
      };
      if(!data.category) { toast('Category is required', 'error'); return; }

      const btn = root.querySelector('#ef-save');
      btn.disabled = true; btn.textContent = 'Saving...';

      let res;
      if(existing) res = await sb.from('expenses').update(data).eq('id', existing.id);
      else         res = await sb.from('expenses').insert(data);

      if(res.error) {
        console.error(res.error);
        toast('Failed to save expense.', 'error');
        btn.disabled = false; btn.textContent = existing ? 'Update' : 'Save';
        return;
      }
      
      await syncDB();
      toast(existing ? 'Updated' : 'Added', 'success');
      closeModal(root);
      route();
    };
  });
}

console.log('[MediStore] Core Logic Block 14 loaded');
/* ─────────────────────────────────────────────
   67. ANALYTICS
   ───────────────────────────────────────────── */
function renderAnalytics(content) {
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Analytics</h1>
        <p>Business insights & performance</p>
      </div>
    </div>

    <div class="grid-4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Total Sales</div><div class="kpi-icon" style="color:var(--primary);background:var(--primary-light);">💰</div></div>
        <div class="kpi-value" id="an-total-sales">—</div>
        <div class="kpi-trend text-muted">all time (excl. returns)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Total Purchase</div><div class="kpi-icon" style="color:var(--warning);background:var(--warning-bg);">📦</div></div>
        <div class="kpi-value" id="an-total-pur">—</div>
        <div class="kpi-trend text-muted">all time</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Total Received</div><div class="kpi-icon" style="color:var(--success);background:var(--success-bg);">✅</div></div>
        <div class="kpi-value" id="an-total-recv">—</div>
        <div class="kpi-trend text-muted">from customers</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Outstanding</div><div class="kpi-icon" style="color:var(--danger);background:var(--danger-bg);">⏳</div></div>
        <div class="kpi-value" id="an-total-due">—</div>
        <div class="kpi-trend text-muted">customer due</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">Sales vs Purchase <small>Last 30 days</small></div>
      <div style="position:relative;height:300px;"><canvas id="an-ch1"></canvas></div>
    </div>

    <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
      <div class="card">
        <div class="card-title">Monthly Growth</div>
        <div style="position:relative;height:280px;"><canvas id="an-ch2"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Paid vs Due</div>
        <div style="position:relative;height:280px;"><canvas id="an-ch3"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Top Selling Medicines <small>By revenue</small></div>
      <div id="an-top"></div>
    </div>
  `;

  // Destroy previous charts
  charts.forEach(c => { try { c.destroy(); } catch(e) {} });
  charts = [];

  // Totals
  const totalSales = DB.invoices
    .filter(i => !String(i.invoice_no || '').startsWith(RETURN_PREFIX))
    .reduce((s, i) => s + Number(i.total || 0), 0);
    
  const totalPur   = DB.supplier_invoices.reduce((s, b) => s + Number(b.total || 0), 0);
  const invPaid    = DB.invoices.reduce((s, i) => s + Number(i.paid || 0), 0);
  const extraPaid  = DB.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalRecv  = invPaid + extraPaid;
  const totalDue   = DB.invoices.reduce((s, i) => s + Number(i.due || 0), 0);

  $('#an-total-sales').textContent = rs(totalSales);
  $('#an-total-pur').textContent   = rs(totalPur);
  $('#an-total-recv').textContent  = rs(totalRecv);
  $('#an-total-due').textContent   = rs(totalDue);

  // 30-day map
  const map = {};
  DB.invoices.forEach(i => {
    if(String(i.invoice_no || '').startsWith(RETURN_PREFIX)) return;
    const d = txDate(i, 'invoice_date');
    if(!d) return;
    map[d] = map[d] || { date: d, sales: 0, purchase: 0 };
    map[d].sales += Number(i.total || 0);
  });
  DB.supplier_invoices.forEach(b => {
    const d = txDate(b, 'bill_date');
    if(!d) return;
    map[d] = map[d] || { date: d, sales: 0, purchase: 0 };
    map[d].purchase += Number(b.total || 0);
  });
  const arr = Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

  // Monthly map
  const monthly = {};
  Object.values(map).forEach(d => {
    const k = d.date.slice(0, 7);
    monthly[k] = monthly[k] || { month: k, sales: 0, purchase: 0 };
    monthly[k].sales += d.sales;
    monthly[k].purchase += d.purchase;
  });
  const monthlyArr = Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  // Chart 1: Sales vs Purchase (Line)
  const ctx1 = $('#an-ch1');
  if(ctx1 && arr.length) {
    charts.push(new Chart(ctx1, {
      type: 'line',
      data: {
        labels: arr.map(d => d.date.slice(5)),
        datasets: [
          {
            label: 'Sales',
            data: arr.map(d => d.sales),
            borderColor: '#5B5BD6',
            backgroundColor: 'rgba(91, 91, 214, 0.1)',
            tension: 0.3, fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5
          },
          {
            label: 'Purchase',
            data: arr.map(d => d.purchase),
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            tension: 0.3, fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: c => c.dataset.label + ': ' + rs(c.parsed.y) } }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    }));
  } else if(ctx1) {
    ctx1.parentElement.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><div class="empty-icon">📊</div><div class="empty-title">Not enough data</div></div>';
  }

  // Chart 2: Monthly growth (Bar)
  const ctx2 = $('#an-ch2');
  if(ctx2 && monthlyArr.length) {
    charts.push(new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: monthlyArr.map(m => m.month),
        datasets: [
          { label: 'Sales',    data: monthlyArr.map(m => m.sales),    backgroundColor: '#5B5BD6', borderRadius: 6 },
          { label: 'Purchase', data: monthlyArr.map(m => m.purchase), backgroundColor: '#F59E0B', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    }));
  } else if(ctx2) {
    ctx2.parentElement.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><div class="empty-icon">📊</div><div class="empty-title">No data yet</div></div>';
  }

  // Chart 3: Paid vs Due (Donut)
  const ctx3 = $('#an-ch3');
  if(ctx3 && (totalRecv > 0 || totalDue > 0)) {
    charts.push(new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: ['Paid', 'Due'],
        datasets: [{
          data: [totalRecv, totalDue],
          backgroundColor: ['#10B981', '#EF4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        cutout: '70%'
      }
    }));
  } else if(ctx3) {
    ctx3.parentElement.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><div class="empty-icon">💵</div><div class="empty-title">No payment data yet</div></div>';
  }

  // Top Selling
  const prodMap = {};
  DB.invoice_items.forEach(it => {
    const inv = DB.invoices.find(i => i.id === it.invoice_id);
    if(!inv || String(inv.invoice_no || '').startsWith(RETURN_PREFIX)) return;
    
    const key = it.product_id || it.product_name;
    if(!prodMap[key]) prodMap[key] = { name: it.product_name, qty: 0, revenue: 0 };
    prodMap[key].qty     += Number(it.qty   || 0);
    prodMap[key].revenue += Number(it.total || 0);
  });
  const top = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const topEl = $('#an-top');
  if(!top.length) {
    topEl.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><div class="empty-icon">💊</div><div class="empty-title">No sales yet</div></div>';
  } else {
    const maxRev = top[0].revenue || 1;
    topEl.innerHTML = top.map((t, i) => {
      const pct = maxRev > 0 ? (t.revenue / maxRev) * 100 : 0;
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="width:24px;text-align:center;font-weight:700;color:var(--text-muted);font-size:12px;">${i + 1}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;">${esc(t.name)}</div>
            <div style="height:5px;background:var(--border);border-radius:3px;margin-top:6px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg, #5B5BD6, #818CF8);border-radius:3px;"></div>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-weight:700;font-size:13px;">${rs(t.revenue)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${fmtNum(t.qty)} sold</div>
          </div>
        </div>`;
    }).join('');
  }
}

/* ─────────────────────────────────────────────
   68. PROFIT & LOSS
   ───────────────────────────────────────────── */
function renderPnL(content) {
  const today = todayStr();
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Profit & Loss</h1>
        <p>Product-wise profitability</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:1;min-width:140px;">
        <label class="label">From</label>
        <input class="input" type="date" id="pnl-from" value="${firstOfMonth}" max="${today}">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">To</label>
        <input class="input" type="date" id="pnl-to" value="${today}" max="${today}">
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <button class="btn btn-primary" id="pnl-load">Load</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;padding:12px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" data-pp="today">Today</button>
        <button class="btn btn-ghost btn-sm" data-pp="month">This Month</button>
        <button class="btn btn-ghost btn-sm" data-pp="year">This Year</button>
      </div>
    </div>

    <div class="grid-4" id="pnl-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;"></div>

    <div class="card">
      <div class="card-title">Product-wise Profit <small>Top 50 by revenue</small></div>
      <div class="table-wrap" style="border:0;box-shadow:none;">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th style="text-align:right">Qty</th>
              <th style="text-align:right">Revenue</th>
              <th style="text-align:right">Cost</th>
              <th style="text-align:right">Profit</th>
              <th style="text-align:right">Margin</th>
            </tr>
          </thead>
          <tbody id="pnl-body"></tbody>
        </table>
      </div>
      <div class="mobile-list" id="pnl-mobile"></div>
    </div>
  `;

  function compute(from, to) {
    const invs = DB.invoices.filter(i => {
      const d = txDate(i, 'invoice_date');
      return d >= from && d <= to && !String(i.invoice_no || '').startsWith(RETURN_PREFIX);
    });

    const perProduct = {};
    let totalRevenue = 0;
    let totalCost    = 0;
    let totalQty     = 0;

    invs.forEach(inv => {
      const items = DB.invoice_items.filter(x => x.invoice_id === inv.id);
      items.forEach(it => {
        const p   = DB.products.find(x => x.id === it.product_id);
        const qty = Number(it.qty) || 0;

        let costPerUnit = 0;
        if(it.batch_id) {
          const b = DB.product_batches.find(x => x.id === it.batch_id);
          costPerUnit = b ? Number(b.cost || 0) : (p ? Number(p.cost || 0) : 0);
        } else if(p) {
          costPerUnit = Number(p.cost || 0);
        }

        // Handle loose units (e.g., tablet sold from strip of 10)
        if(p && p.loose_unit && Number(p.conversion_factor) > 1 && it.unit === p.loose_unit) {
          costPerUnit = costPerUnit / Number(p.conversion_factor);
        }

        const cost = qty * costPerUnit;
        const rev  = Number(it.total) || 0;

        const key = it.product_id || it.product_name;
        if(!perProduct[key]) {
          perProduct[key] = { name: it.product_name, qty: 0, revenue: 0, cost: 0 };
        }
        perProduct[key].qty     += qty;
        perProduct[key].revenue += rev;
        perProduct[key].cost    += cost;

        totalQty     += qty;
        totalRevenue += rev;
        totalCost    += cost;
      });
    });

    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return { perProduct, totalRevenue, totalCost, profit, margin, totalQty, count: invs.length };
  }

  function render() {
    const from = $('#pnl-from').value;
    const to   = $('#pnl-to').value;
    if(!from || !to) { toast('Pick both dates', 'error'); return; }
    if(from > to) { toast('From cannot be after To', 'error'); return; }

    const r = compute(from, to);

    $('#pnl-stats').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Revenue</div><div class="kpi-icon" style="color:var(--primary);background:var(--primary-light);">💰</div></div>
        <div class="kpi-value">${rs(r.totalRevenue)}</div>
        <div class="kpi-trend text-muted">${r.count} invoice${r.count === 1 ? '' : 's'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Cost of Goods</div><div class="kpi-icon" style="color:var(--warning);background:var(--warning-bg);">📦</div></div>
        <div class="kpi-value">${rs(r.totalCost)}</div>
        <div class="kpi-trend text-muted">${fmtNum(r.totalQty)} units sold</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">${r.profit >= 0 ? 'Profit' : 'Loss'}</div><div class="kpi-icon" style="color:${r.profit >= 0 ? 'var(--success)' : 'var(--danger)'};background:${r.profit >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)'};">${r.profit >= 0 ? '📈' : '📉'}</div></div>
        <div class="kpi-value" style="color:${r.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(r.profit)}</div>
        <div class="kpi-trend text-muted">net profit</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Margin</div><div class="kpi-icon" style="color:var(--primary);background:var(--primary-light);">%</div></div>
        <div class="kpi-value">${r.margin.toFixed(1)}%</div>
        <div class="kpi-trend text-muted">avg across products</div>
      </div>
    `;

    const rows = Object.values(r.perProduct)
      .sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost))
      .slice(0, 50);

    const tbody = $('#pnl-body');
    if(tbody) {
      tbody.innerHTML = rows.length === 0
        ? `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No sales in this range</td></tr>`
        : rows.map(x => {
            const p = x.revenue - x.cost;
            const m = x.revenue > 0 ? (p / x.revenue) * 100 : 0;
            return `<tr>
              <td><strong>${esc(x.name)}</strong></td>
              <td style="text-align:right;">${fmtNum(x.qty)}</td>
              <td style="text-align:right;">${rs(x.revenue)}</td>
              <td style="text-align:right;" class="text-muted">${rs(x.cost)}</td>
              <td style="text-align:right;font-weight:600;color:${p >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(p)}</td>
              <td style="text-align:right;color:${m >= 0 ? 'var(--success)' : 'var(--danger)'};">${m.toFixed(1)}%</td>
            </tr>`;
          }).join('');
    }

    const mob = $('#pnl-mobile');
    if(mob) {
      mob.innerHTML = rows.length === 0
        ? `<div class="empty-state"><div class="empty-icon">💹</div><div class="empty-title">No sales in this range</div></div>`
        : rows.map(x => {
            const p = x.revenue - x.cost;
            const m = x.revenue > 0 ? (p / x.revenue) * 100 : 0;
            return `
              <div class="mobile-card">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc(x.name)}</div>
                    <div class="mobile-card-sub">Qty ${fmtNum(x.qty)} · Rev ${rs(x.revenue)} · Cost ${rs(x.cost)}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;color:${p >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(p)}</div>
                    <div class="text-xs" style="color:${m >= 0 ? 'var(--success)' : 'var(--danger)'};margin-top:2px;">${m.toFixed(1)}%</div>
                  </div>
                </div>
              </div>`;
          }).join('');
    }
  }

  $$('#content [data-pp]').forEach(b => b.onclick = () => {
    const preset = b.dataset.pp;
    const t = todayStr();
    if(preset === 'today') {
      $('#pnl-from').value = t; $('#pnl-to').value = t;
    } else if(preset === 'month') {
      $('#pnl-from').value = firstOfMonth; $('#pnl-to').value = t;
    } else if(preset === 'year') {
      $('#pnl-from').value = new Date().getFullYear() + '-01-01'; $('#pnl-to').value = t;
    }
    render();
  });

  $('#pnl-load').onclick = render;
  render();
}

/* ─────────────────────────────────────────────
   69. MARGIN (Per-Invoice)
   ───────────────────────────────────────────── */
function renderMargin(content) {
  const today = todayStr();
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  let rangePreset = 'all';
  let customFrom  = '';
  let customTo    = '';
  let sortBy      = 'date-desc';

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Margin</h1>
        <p>Profit &amp; margin per invoice</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;" id="mg-range-row">
        <button class="btn btn-sm mg-range" data-r="all">All Time</button>
        <button class="btn btn-sm mg-range" data-r="today">Today</button>
        <button class="btn btn-sm mg-range" data-r="week">This Week</button>
        <button class="btn btn-sm mg-range" data-r="month">This Month</button>
        <button class="btn btn-sm mg-range" data-r="year">This Year</button>
        <button class="btn btn-sm mg-range" data-r="custom">Custom</button>
      </div>

      <div id="mg-custom" style="display:none;gap:8px;flex-wrap:wrap;align-items:end;">
        <div><label class="label">From</label><input class="input" type="date" id="mg-from"></div>
        <div><label class="label">To</label><input class="input" type="date" id="mg-to"></div>
        <div><label class="label">&nbsp;</label><button class="btn btn-primary btn-sm" id="mg-apply">Apply</button></div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--border);padding-top:12px;">
        <label class="label" style="margin:0;">Sort by:</label>
        <select class="input" id="mg-sort" style="width:auto;padding:6px 10px;min-height:34px;">
          <option value="date-desc">Date (newest first)</option>
          <option value="date">Date (oldest first)</option>
          <option value="margin-desc">Margin % (high first)</option>
          <option value="margin">Margin % (low first)</option>
          <option value="profit-desc">Profit (high first)</option>
          <option value="revenue-desc">Revenue (high first)</option>
        </select>
      </div>
    </div>

    <div class="grid-4" id="mg-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:16px;"></div>
    <div id="mg-period" class="text-xs text-muted" style="padding:0 4px 12px;"></div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Date</th>
            <th style="text-align:right">Revenue</th>
            <th style="text-align:right">Cost</th>
            <th style="text-align:right">Profit</th>
            <th style="text-align:right">Margin</th>
          </tr>
        </thead>
        <tbody id="mg-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="mg-mobile"></div>
  `;

  function rangeFor(preset, cf, ct) {
    const t = todayStr();
    if(preset === 'today') return { from: t, to: t };
    if(preset === 'week') {
      const d = new Date();
      const day = d.getDay() || 7;
      const mon = new Date(d);
      mon.setDate(d.getDate() - day + 1);
      return { from: mon.toISOString().slice(0, 10), to: t };
    }
    if(preset === 'month') return { from: firstOfMonth, to: t };
    if(preset === 'year')  return { from: new Date().getFullYear() + '-01-01', to: t };
    if(preset === 'custom') return { from: cf || '0000-01-01', to: ct || '9999-12-31' };
    return { from: '0000-01-01', to: '9999-12-31' };
  }

  function invoiceMetrics(inv) {
    const items = DB.invoice_items.filter(x => x.invoice_id === inv.id);
    let subtotal   = 0;
    let totalCost  = 0;

    items.forEach(it => {
      const p   = DB.products.find(x => x.id === it.product_id);
      const qty = Number(it.qty) || 0;

      let costPerUnit = 0;
      if(it.batch_id) {
        const b = DB.product_batches.find(x => x.id === it.batch_id);
        costPerUnit = b ? Number(b.cost || 0) : (p ? Number(p.cost || 0) : 0);
      } else if(p) {
        costPerUnit = Number(p.cost || 0);
      }

      // Loose unit adjustment
      if(p && p.loose_unit && Number(p.conversion_factor) > 1 && it.unit === p.loose_unit) {
        costPerUnit = costPerUnit / Number(p.conversion_factor);
      }

      subtotal  += Number(it.total || 0);
      totalCost += qty * costPerUnit;
    });

    const invoiceTotal = Number(inv.total) || 0;
    const profit = invoiceTotal - totalCost;
    const margin = invoiceTotal > 0 ? (profit / invoiceTotal) * 100 : 0;

    return { subtotal, revenue: invoiceTotal, totalCost, profit, margin };
  }

  function filterAndSort() {
    const r = rangeFor(rangePreset, customFrom, customTo);

    let arr = [];
    DB.invoices.forEach(inv => {
      if(String(inv.invoice_no || '').startsWith(RETURN_PREFIX)) return;
      const hasItems = DB.invoice_items.some(x => x.invoice_id === inv.id);
      if(!hasItems) return;
      const d = txDate(inv, 'invoice_date');
      if(d < r.from || d > r.to) return;
      arr.push(inv);
    });

    arr.forEach(inv => { inv.__mg = invoiceMetrics(inv); });

    if(sortBy === 'date-desc')       arr.sort((a, b) => txDate(b, 'invoice_date').localeCompare(txDate(a, 'invoice_date')));
    else if(sortBy === 'date')       arr.sort((a, b) => txDate(a, 'invoice_date').localeCompare(txDate(b, 'invoice_date')));
    else if(sortBy === 'margin-desc')arr.sort((a, b) => b.__mg.margin - a.__mg.margin);
    else if(sortBy === 'margin')     arr.sort((a, b) => a.__mg.margin - b.__mg.margin);
    else if(sortBy === 'profit-desc')arr.sort((a, b) => b.__mg.profit - a.__mg.profit);
    else if(sortBy === 'revenue-desc')arr.sort((a, b) => b.__mg.revenue - a.__mg.revenue);

    return { arr, range: r };
  }

  function syncRange() {
    $$('.mg-range').forEach(b => {
      const on = b.dataset.r === rangePreset;
      b.className = 'btn btn-sm ' + (on ? 'btn-primary' : 'btn-ghost') + ' mg-range';
    });
    const cust = $('#mg-custom');
    if(cust) cust.style.display = rangePreset === 'custom' ? 'flex' : 'none';
  }

  function render() {
    const fs  = filterAndSort();
    const arr = fs.arr;

    let totalRevenue = 0;
    let totalCost    = 0;
    let totalProfit  = 0;

    arr.forEach(inv => {
      totalRevenue += inv.__mg.revenue;
      totalCost    += inv.__mg.totalCost;
      totalProfit  += inv.__mg.profit;
    });

    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const isProfit  = totalProfit >= 0;

    $('#mg-stats').innerHTML = `
      <div class="kpi-card" style="border-left:4px solid var(--primary);">
        <div class="kpi-card-top"><div class="kpi-label">Revenue</div></div>
        <div class="kpi-value">${rs(totalRevenue)}</div>
        <div class="kpi-trend text-muted">${arr.length} invoice${arr.length === 1 ? '' : 's'}</div>
      </div>
      <div class="kpi-card" style="border-left:4px solid var(--warning);">
        <div class="kpi-card-top"><div class="kpi-label">Cost</div></div>
        <div class="kpi-value">${rs(totalCost)}</div>
        <div class="kpi-trend text-muted">goods sold</div>
      </div>
      <div class="kpi-card" style="border-left:4px solid ${isProfit ? 'var(--success)' : 'var(--danger)'};">
        <div class="kpi-card-top"><div class="kpi-label">${isProfit ? 'Profit' : 'Loss'}</div></div>
        <div class="kpi-value" style="color:${isProfit ? 'var(--success)' : 'var(--danger)'};">${rs(totalProfit)}</div>
        <div class="kpi-trend text-muted">net</div>
      </div>
      <div class="kpi-card" style="border-left:4px solid var(--primary);">
        <div class="kpi-card-top"><div class="kpi-label">Avg Margin</div></div>
        <div class="kpi-value">${avgMargin.toFixed(1)}%</div>
        <div class="kpi-trend text-muted">across invoices</div>
      </div>
    `;

    const periodText = rangePreset === 'all'
      ? ('Showing: All Time · ' + arr.length + ' invoice' + (arr.length === 1 ? '' : 's'))
      : ('Showing: ' + fmtDate(fs.range.from) + ' to ' + fmtDate(fs.range.to) + ' · ' + arr.length + ' invoice' + (arr.length === 1 ? '' : 's'));
    const periodEl = $('#mg-period');
    if(periodEl) periodEl.textContent = periodText;

    const tbody = $('#mg-body');
    if(tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No invoices in this range</td></tr>`
        : arr.map(inv => {
            const name = inv.customer_name || 'Walk-in';
            const m    = inv.__mg;
            const pCol = m.profit >= 0 ? 'var(--success)' : 'var(--danger)';
            return `<tr style="cursor:pointer;" data-mg-id="${inv.id}">
              <td style="font-weight:600;">${esc(inv.invoice_no || '')}</td>
              <td>${esc(name)}</td>
              <td class="text-sm text-muted">${txDT(inv, 'invoice_date')}</td>
              <td style="text-align:right;">${rs(m.revenue)}</td>
              <td style="text-align:right;" class="text-muted">${rs(m.totalCost)}</td>
              <td style="text-align:right;font-weight:600;color:${pCol};">${rs(m.profit)}</td>
              <td style="text-align:right;color:${pCol};">${m.margin.toFixed(1)}%</td>
            </tr>`;
          }).join('');

      $$('[data-mg-id]').forEach(tr => tr.onclick = () => showMarginBreakdown(tr.dataset.mgId));
    }

    const mob = $('#mg-mobile');
    if(mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state"><div class="empty-icon">📈</div><div class="empty-title">No invoices in this range</div></div>`
        : arr.map(inv => {
            const name = inv.customer_name || 'Walk-in';
            const m    = inv.__mg;
            const pCol = m.profit >= 0 ? 'var(--success)' : 'var(--danger)';
            return `
              <div class="mobile-card" data-mg-id-mob="${inv.id}" style="cursor:pointer;">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc(inv.invoice_no || '')} · ${esc(name)}</div>
                    <div class="mobile-card-sub">${txDT(inv, 'invoice_date')}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;color:${pCol};">${rs(m.profit)}</div>
                    <div class="text-xs" style="color:${pCol};margin-top:2px;">${m.margin.toFixed(1)}%</div>
                  </div>
                </div>
                <div style="font-size:11px;color:var(--text-muted);">
                  Revenue ${rs(m.revenue)} · Cost ${rs(m.totalCost)}
                </div>
              </div>`;
          }).join('');

      $$('[data-mg-id-mob]').forEach(el => el.onclick = () => showMarginBreakdown(el.dataset.mgIdMob));
    }
  }

  function showMarginBreakdown(invId) {
    const inv = DB.invoices.find(i => i.id === invId);
    if(!inv) return;

    const items = DB.invoice_items.filter(x => x.invoice_id === inv.id);
    const m     = inv.__mg || invoiceMetrics(inv);
    const pCol  = m.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    const custName = inv.customer_name || 'Walk-in';

    const rows = items.map(it => {
      const p   = DB.products.find(x => x.id === it.product_id);
      const qty = Number(it.qty) || 0;

      let costPerUnit = 0;
      if(it.batch_id) {
        const b = DB.product_batches.find(x => x.id === it.batch_id);
        costPerUnit = b ? Number(b.cost || 0) : (p ? Number(p.cost || 0) : 0);
      } else if(p) {
        costPerUnit = Number(p.cost || 0);
      }
      
      // Loose unit adjustment
      if(p && p.loose_unit && Number(p.conversion_factor) > 1 && it.unit === p.loose_unit) {
        costPerUnit = costPerUnit / Number(p.conversion_factor);
      }

      const cost = qty * costPerUnit;
      const rev  = Number(it.total) || 0;
      const prof = rev - cost;
      const mg   = rev > 0 ? (prof / rev) * 100 : 0;
      const pc   = prof >= 0 ? 'var(--success)' : 'var(--danger)';

      return `<tr>
        <td>
          <div style="font-weight:600;font-size:12px;">${esc(it.product_name || '')}</div>
          ${it.batch_no ? `<div class="text-xs text-muted" style="margin-top:2px;">Batch ${esc(it.batch_no)}${it.expiry_date ? ' · Exp ' + fmtExpiryShort(it.expiry_date) : ''}</div>` : ''}
        </td>
        <td style="text-align:right;">${fmtNum(qty)}</td>
        <td style="text-align:right;">${rs(it.price)}</td>
        <td style="text-align:right;">${rs(rev)}</td>
        <td style="text-align:right;" class="text-muted">${rs(cost)}</td>
        <td style="text-align:right;font-weight:600;color:${pc};">${rs(prof)}</td>
        <td style="text-align:right;color:${pc};">${mg.toFixed(1)}%</td>
      </tr>`;
    }).join('');

    openModal(`
      <div class="modal-header">
        <div>
          <div class="modal-title">${esc(inv.invoice_no || '')}</div>
          <div class="text-xs text-muted" style="margin-top:2px;">${esc(custName)} · ${txDT(inv, 'invoice_date')}</div>
        </div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      
      <div class="modal-body">
        <div class="grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
          <div style="background:var(--bg-app);padding:12px;border-radius:var(--radius-sm);">
            <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Revenue</div>
            <div style="font-size:18px;font-weight:700;color:var(--primary);margin-top:4px;">${rs(m.revenue)}</div>
          </div>
          <div style="background:var(--bg-app);padding:12px;border-radius:var(--radius-sm);">
            <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Cost</div>
            <div style="font-size:18px;font-weight:700;color:var(--warning);margin-top:4px;">${rs(m.totalCost)}</div>
          </div>
          <div style="background:var(--bg-app);padding:12px;border-radius:var(--radius-sm);">
            <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;">Profit</div>
            <div style="font-size:18px;font-weight:700;color:${pCol};margin-top:4px;">${rs(m.profit)}</div>
          </div>
        </div>
        
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:var(--bg-app);">
                <th style="text-align:left;padding:10px 8px;font-size:10px;">Item</th>
                <th style="text-align:right;padding:10px 8px;font-size:10px;">Qty</th>
                <th style="text-align:right;padding:10px 8px;font-size:10px;">Price</th>
                <th style="text-align:right;padding:10px 8px;font-size:10px;">Revenue</th>
                <th style="text-align:right;padding:10px 8px;font-size:10px;">Cost</th>
                <th style="text-align:right;padding:10px 8px;font-size:10px;">Profit</th>
                <th style="text-align:right;padding:10px 8px;font-size:10px;">Margin</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      </div>
    `);
  }

  // Wire range + sort
  $$('.mg-range').forEach(b => b.onclick = () => {
    rangePreset = b.dataset.r;
    syncRange();
    render();
  });

  $('#mg-sort').onchange = (e) => {
    sortBy = e.target.value;
    render();
  };

  $('#mg-apply').onclick = () => {
    const f = $('#mg-from').value;
    const t = $('#mg-to').value;
    if(!f || !t) { toast('Pick both dates', 'error'); return; }
    if(f > t) { toast('From cannot be after To', 'error'); return; }
    customFrom = f;
    customTo   = t;
    render();
  };

  syncRange();
  render();
}

console.log('[MediStore] Core Logic Block 15 loaded');
/* ─────────────────────────────────────────────
   70. INVENTORY VALUE
   ───────────────────────────────────────────── */
function renderInventoryValue(content) {
  const today = todayStr();
  const NEAR_DAYS = Number(SETTINGS.near_expiry_days) || 60;

  // 1. Valuation calculation per product
  function productValuation(p) {
    let qty = 0, costValue = 0, sellValue = 0;
    let expiredQty = 0, expiredCostValue = 0;
    let nearExpiryQty = 0, nearExpiryCostValue = 0;

    if(p.batch_managed === false) {
      qty       = Number(p.stock) || 0;
      costValue = qty * (Number(p.cost) || 0);
      sellValue = qty * (Number(p.selling_price || p.mrp) || 0);
    } else {
      DB.product_batches
        .filter(b => b.product_id === p.id)
        .forEach(b => {
          const q = Number(b.qty) || 0;
          if(q <= 0) return;
          
          const isExpired = b.expiry_date && b.expiry_date < today;
          const isNear    = !isExpired && b.expiry_date && daysToExpiry(b.expiry_date) <= NEAR_DAYS;

          if(isExpired) {
            expiredQty       += q;
            expiredCostValue += q * (Number(b.cost) || 0);
          } else {
            qty       += q;
            costValue += q * (Number(b.cost) || 0);
            sellValue += q * (Number(b.selling_price || b.mrp) || 0);
            if(isNear) {
              nearExpiryQty       += q;
              nearExpiryCostValue += q * (Number(b.cost) || 0);
            }
          }
        });
    }

    const profit  = sellValue - costValue;
    const margin  = sellValue > 0 ? (profit / sellValue) * 100 : 0;
    const avgCost = qty > 0 ? costValue / qty : 0;

    return {
      product: p, qty, costValue, sellValue, profit, margin, avgCost,
      expiredQty, expiredCostValue, nearExpiryQty, nearExpiryCostValue
    };
  }

  const valuations = DB.products.map(productValuation);

  // Totals
  const T = valuations.reduce((a, v) => {
    a.qty                 += v.qty;
    a.costValue           += v.costValue;
    a.sellValue           += v.sellValue;
    a.profit              += v.profit;
    a.expiredQty          += v.expiredQty;
    a.expiredCostValue    += v.expiredCostValue;
    a.nearExpiryQty       += v.nearExpiryQty;
    a.nearExpiryCostValue += v.nearExpiryCostValue;
    return a;
  }, {
    qty:0, costValue:0, sellValue:0, profit:0,
    expiredQty:0, expiredCostValue:0,
    nearExpiryQty:0, nearExpiryCostValue:0
  });

  const totalMargin  = T.sellValue > 0 ? (T.profit / T.sellValue) * 100 : 0;
  const liveProducts = valuations.filter(v => v.qty > 0).length;

  // Category Breakdown
  const catMap = {};
  valuations.forEach(v => {
    if(v.qty <= 0 && v.expiredQty <= 0) return;
    const cat = v.product.category || 'Uncategorised';
    catMap[cat] = catMap[cat] || { name:cat, qty:0, costValue:0, sellValue:0, profit:0, count:0 };
    catMap[cat].qty       += v.qty;
    catMap[cat].costValue += v.costValue;
    catMap[cat].sellValue += v.sellValue;
    catMap[cat].profit    += v.profit;
    catMap[cat].count     += 1;
  });
  const categories = Object.values(catMap).sort((a, b) => b.costValue - a.costValue);

  // Vendor Breakdown
  const venMap = {};
  valuations.forEach(v => {
    if(v.costValue <= 0 && v.expiredCostValue <= 0) return;
    const sup = v.product.supplier_id ? DB.suppliers.find(s => s.id === v.product.supplier_id) : null;
    const key = sup ? sup.id : '__none__';
    const name = sup ? sup.name : 'Unassigned';
    venMap[key] = venMap[key] || { id:key, name, qty:0, costValue:0, sellValue:0, productCount:0 };
    venMap[key].qty          += v.qty;
    venMap[key].costValue    += v.costValue;
    venMap[key].sellValue    += v.sellValue;
    venMap[key].productCount += 1;
  });
  const vendors = Object.values(venMap).sort((a, b) => b.costValue - a.costValue);

  // ABC Analysis
  const sortedByValue = valuations
    .filter(v => v.costValue > 0)
    .sort((a, b) => b.costValue - a.costValue);

  let cum = 0;
  sortedByValue.forEach(v => { cum += v.costValue; v._cum = cum; });

  const abc = { A:{count:0,cost:0}, B:{count:0,cost:0}, C:{count:0,cost:0} };
  sortedByValue.forEach(v => {
    const pct = T.costValue > 0 ? (v._cum / T.costValue) * 100 : 0;
    const cls = pct <= 70 ? 'A' : pct <= 90 ? 'B' : 'C';
    abc[cls].count += 1;
    abc[cls].cost  += v.costValue;
  });

  const top10 = sortedByValue.slice(0, 10);

  // Dead Stock (No sales in 60 days)
  const sixtyAgo = new Date();
  sixtyAgo.setDate(sixtyAgo.getDate() - 60);
  const cutoff60 = sixtyAgo.toISOString().slice(0, 10);

  const soldRecentProductIds = new Set();
  DB.invoices.forEach(inv => {
    if(String(inv.invoice_no || '').startsWith(RETURN_PREFIX)) return;
    const d = txDate(inv, 'invoice_date');
    if(d < cutoff60) return;
    DB.invoice_items
      .filter(it => it.invoice_id === inv.id)
      .forEach(it => { if(it.product_id) soldRecentProductIds.add(it.product_id); });
  });

  const deadStock = valuations.filter(v =>
    v.costValue > 0 && v.product.id && !soldRecentProductIds.has(v.product.id)
  );
  const deadStockValue = deadStock.reduce((s, v) => s + v.costValue, 0);

  // Turnover (30d)
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const cutoff30 = thirtyAgo.toISOString().slice(0, 10);

  let sold30Cost = 0;
  DB.invoices.forEach(inv => {
    if(String(inv.invoice_no || '').startsWith(RETURN_PREFIX)) return;
    const d = txDate(inv, 'invoice_date');
    if(d < cutoff30) return;
    DB.invoice_items
      .filter(it => it.invoice_id === inv.id)
      .forEach(it => {
        const p = DB.products.find(x => x.id === it.product_id);
        let cpu = 0;
        if(it.batch_id) {
          const b = DB.product_batches.find(x => x.id === it.batch_id);
          cpu = b ? Number(b.cost || 0) : (p ? Number(p.cost || 0) : 0);
        } else if(p) {
          cpu = Number(p.cost || 0);
        }
        
        let qty = Number(it.qty) || 0;
        if(p && p.loose_unit && Number(p.conversion_factor) > 1 && it.unit === p.loose_unit) {
          qty = qty / Number(p.conversion_factor);
        }
        sold30Cost += qty * cpu;
      });
  });
  const turnover30 = T.costValue > 0 ? (sold30Cost / T.costValue) : 0;

  // ═══ RENDER ═══
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Inventory Value</h1>
        <p>Cost &amp; sell valuation · category · vendor · risk · ABC</p>
      </div>
    </div>

    <!-- HERO: Cost vs Sell -->
    <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      <div class="card" style="background:linear-gradient(135deg, #5B5BD6 0%, #4F46E5 100%);color:#fff;border:0;padding:24px;position:relative;overflow:hidden;box-shadow:0 10px 20px -5px rgba(91, 91, 214, 0.4);">
        <div style="position:absolute;right:-30px;top:-30px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,0.08);pointer-events:none;"></div>
        <div style="font-size:12px;opacity:0.9;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">💰 Total Cost Value</div>
        <div style="font-size:32px;font-weight:800;letter-spacing:-0.8px;margin-top:8px;line-height:1.1;">${rs(T.costValue)}</div>
        <div style="font-size:13px;opacity:0.9;margin-top:12px;">Money paid for live stock</div>
      </div>
      
      <div class="card" style="background:linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);color:#fff;border:0;padding:24px;position:relative;overflow:hidden;box-shadow:0 10px 20px -5px rgba(59, 130, 246, 0.4);">
        <div style="position:absolute;right:-30px;top:-30px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,0.08);pointer-events:none;"></div>
        <div style="font-size:12px;opacity:0.9;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">🏷 Total Sell Value</div>
        <div style="font-size:32px;font-weight:800;letter-spacing:-0.8px;margin-top:8px;line-height:1.1;">${rs(T.sellValue)}</div>
        <div style="font-size:13px;opacity:0.9;margin-top:12px;">If sold at current prices</div>
      </div>
    </div>

    <!-- KPI ROW -->
    <div class="kpi-row" style="margin-bottom:24px;">
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Potential Profit</div><div class="kpi-icon" style="color:${T.profit >= 0 ? 'var(--success)' : 'var(--danger)'};background:${T.profit >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)'};">${T.profit >= 0 ? '📈' : '📉'}</div></div>
        <div class="kpi-value" style="color:${T.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(T.profit)}</div>
        <div class="kpi-trend text-muted">Sell − Cost</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Avg Margin</div><div class="kpi-icon" style="color:var(--primary);background:var(--primary-light);">%</div></div>
        <div class="kpi-value">${totalMargin.toFixed(1)}%</div>
        <div class="kpi-trend text-muted">on sell value</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Turnover (30d)</div><div class="kpi-icon" style="color:var(--primary);background:var(--primary-light);">🔄</div></div>
        <div class="kpi-value">${turnover30.toFixed(2)}x</div>
        <div class="kpi-trend text-muted">sold / on-hand</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-top"><div class="kpi-label">Live Items</div><div class="kpi-icon" style="color:var(--success);background:var(--success-bg);">📦</div></div>
        <div class="kpi-value">${liveProducts}</div>
        <div class="kpi-trend text-muted">${fmtNum(T.qty)} units</div>
      </div>
    </div>

    <!-- RISK TILES -->
    <div class="kpi-row" style="grid-template-columns:repeat(3, 1fr); margin-bottom:24px;">
      <div class="card" style="padding:16px;background:var(--warning-bg);border-color:var(--warning);">
        <div style="font-size:20px;margin-bottom:8px;">⏰</div>
        <div style="font-size:20px;font-weight:800;color:#92400e;">${rs(T.nearExpiryCostValue)}</div>
        <div class="text-sm" style="color:#92400e;font-weight:600;margin-top:4px;">Expiring ≤ ${NEAR_DAYS}d (${fmtNum(T.nearExpiryQty)} units)</div>
      </div>
      <div class="card" style="padding:16px;background:var(--danger-bg);border-color:var(--danger);">
        <div style="font-size:20px;margin-bottom:8px;">⚠️</div>
        <div style="font-size:20px;font-weight:800;color:#991b1b;">${rs(T.expiredCostValue)}</div>
        <div class="text-sm" style="color:#991b1b;font-weight:600;margin-top:4px;">Already expired (${fmtNum(T.expiredQty)} units)</div>
      </div>
      <div class="card" style="padding:16px;background:var(--bg-app);border-color:var(--border);">
        <div style="font-size:20px;margin-bottom:8px;">💤</div>
        <div style="font-size:20px;font-weight:800;color:var(--text-main);">${rs(deadStockValue)}</div>
        <div class="text-sm text-muted" style="font-weight:600;margin-top:4px;">Dead stock (${deadStock.length} products, 60d)</div>
      </div>
    </div>

    <!-- CHARTS -->
    <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
      <div class="card">
        <div class="card-title">Cost Value by Category</div>
        <div style="position:relative;height:300px;"><canvas id="iv-cat-chart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Cost vs Sell by Category</div>
        <div style="position:relative;height:300px;"><canvas id="iv-bar-chart"></canvas></div>
      </div>
    </div>

    <!-- ABC ANALYSIS -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">ABC Analysis <small>Pareto — where your money is concentrated</small></div>
      <div class="grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
        <div style="padding:20px;background:var(--success-bg);border:1px solid var(--success);border-radius:var(--radius-md);">
          <div style="font-weight:800;color:var(--success);font-size:18px;">Class A</div>
          <div class="text-xs text-muted" style="margin:6px 0 12px;">Top 70% of value · protect &amp; count often</div>
          <div style="font-size:24px;font-weight:800;color:var(--success);letter-spacing:-0.5px;">${rs(abc.A.cost)}</div>
          <div class="text-sm text-muted" style="margin-top:6px;">${abc.A.count} product${abc.A.count === 1 ? '' : 's'}</div>
        </div>
        <div style="padding:20px;background:var(--warning-bg);border:1px solid var(--warning);border-radius:var(--radius-md);">
          <div style="font-weight:800;color:#b45309;font-size:18px;">Class B</div>
          <div class="text-xs text-muted" style="margin:6px 0 12px;">Next 20% of value</div>
          <div style="font-size:24px;font-weight:800;color:#b45309;letter-spacing:-0.5px;">${rs(abc.B.cost)}</div>
          <div class="text-sm text-muted" style="margin-top:6px;">${abc.B.count} product${abc.B.count === 1 ? '' : 's'}</div>
        </div>
        <div style="padding:20px;background:var(--bg-app);border:1px solid var(--border);border-radius:var(--radius-md);">
          <div style="font-weight:800;color:var(--text-muted);font-size:18px;">Class C</div>
          <div class="text-xs text-muted" style="margin:6px 0 12px;">Last 10% of value · low priority</div>
          <div style="font-size:24px;font-weight:800;color:var(--text-muted);letter-spacing:-0.5px;">${rs(abc.C.cost)}</div>
          <div class="text-sm text-muted" style="margin-top:6px;">${abc.C.count} product${abc.C.count === 1 ? '' : 's'}</div>
        </div>
      </div>
    </div>

    <!-- TOP 10 -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">Top 10 Most Valuable Products <small>By cost value</small></div>
      ${top10.length === 0
        ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No stock yet</p>'
        : `<div class="table-wrap" style="border:0;box-shadow:none;">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th style="text-align:right">Qty</th>
                  <th style="text-align:right">Cost Value</th>
                  <th style="text-align:right">Sell Value</th>
                  <th style="text-align:right">Profit</th>
                </tr>
              </thead>
              <tbody>
                ${top10.map((v, i) => `
                  <tr>
                    <td><b>${i + 1}</b></td>
                    <td>
                      <strong>${esc(v.product.name)}</strong>
                      ${v.product.category ? `<div class="text-xs text-muted">${esc(v.product.category)}</div>` : ''}
                    </td>
                    <td style="text-align:right">${fmtNum(v.qty)} ${esc(v.product.unit || '')}</td>
                    <td style="text-align:right;color:var(--primary);font-weight:600;">${rs(v.costValue)}</td>
                    <td style="text-align:right;color:#2563EB;">${rs(v.sellValue)}</td>
                    <td style="text-align:right;color:${v.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(v.profit)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="mobile-list">
            ${top10.map((v, i) => `
              <div class="mobile-card">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${i + 1}. ${esc(v.product.name)}</div>
                    <div class="mobile-card-sub">${v.product.category ? esc(v.product.category) + ' · ' : ''}${fmtNum(v.qty)} ${esc(v.product.unit || '')}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;color:var(--primary);">${rs(v.costValue)}</div>
                    <div class="text-xs text-muted" style="margin-top:2px;">${rs(v.sellValue)}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>`}
    </div>

    <!-- CATEGORY BREAKDOWN -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">Category Breakdown <small>${categories.length} categories</small></div>
      ${categories.length === 0
        ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No data</p>'
        : `<div class="table-wrap" style="border:0;box-shadow:none;">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th style="text-align:right">Products</th>
                  <th style="text-align:right">Qty</th>
                  <th style="text-align:right">Cost Value</th>
                  <th style="text-align:right">Sell Value</th>
                  <th style="text-align:right">Profit</th>
                  <th style="text-align:right">Margin</th>
                </tr>
              </thead>
              <tbody>
                ${categories.map(c => {
                  const p = c.sellValue - c.costValue;
                  const m = c.sellValue > 0 ? (p / c.sellValue) * 100 : 0;
                  return `<tr>
                    <td><strong>${esc(c.name)}</strong></td>
                    <td style="text-align:right">${c.count}</td>
                    <td style="text-align:right">${fmtNum(c.qty)}</td>
                    <td style="text-align:right;color:var(--primary);font-weight:600;">${rs(c.costValue)}</td>
                    <td style="text-align:right;color:#2563EB;">${rs(c.sellValue)}</td>
                    <td style="text-align:right;color:${p >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(p)}</td>
                    <td style="text-align:right;color:${m >= 0 ? 'var(--success)' : 'var(--danger)'};">${m.toFixed(1)}%</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
    </div>

    <!-- VENDOR BREAKDOWN -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">Vendor Breakdown <small>${vendors.length} vendors</small></div>
      ${vendors.length === 0
        ? '<p class="text-sm text-muted text-center" style="padding:20px 0;">No vendor data</p>'
        : `<div class="table-wrap" style="border:0;box-shadow:none;">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th style="text-align:right">Products</th>
                  <th style="text-align:right">Qty</th>
                  <th style="text-align:right">Cost Value</th>
                  <th style="text-align:right">Sell Value</th>
                </tr>
              </thead>
              <tbody>
                ${vendors.map(v => `
                  <tr>
                    <td><strong>${esc(v.name)}</strong></td>
                    <td style="text-align:right">${v.productCount}</td>
                    <td style="text-align:right">${fmtNum(v.qty)}</td>
                    <td style="text-align:right;color:var(--primary);font-weight:600;">${rs(v.costValue)}</td>
                    <td style="text-align:right;color:#2563EB;">${rs(v.sellValue)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`}
    </div>

    <!-- FILTER + FULL TABLE -->
    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:2;min-width:200px;">
        <label class="label">Search</label>
        <input class="input" id="iv-search" placeholder="Product, company or category...">
      </div>
      <div style="flex:1;min-width:160px;">
        <label class="label">Sort by</label>
        <select class="input" id="iv-sort">
          <option value="cost-desc">Cost value (high first)</option>
          <option value="sell-desc">Sell value (high first)</option>
          <option value="profit-desc">Profit (high first)</option>
          <option value="margin-desc">Margin % (high first)</option>
          <option value="qty-desc">Qty (high first)</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <select class="input" id="iv-filter">
          <option value="">All products</option>
          <option value="instock">Only with stock</option>
          <option value="expired">Has expired stock</option>
          <option value="near">Near expiry</option>
          <option value="dead">Dead stock (no sales 60d)</option>
        </select>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th style="text-align:right">Qty</th>
            <th style="text-align:right">Cost Value</th>
            <th style="text-align:right">Sell Value</th>
            <th style="text-align:right">Profit</th>
            <th style="text-align:right">Margin</th>
          </tr>
        </thead>
        <tbody id="iv-body"></tbody>
      </table>
    </div>

    <div class="mobile-list" id="iv-mobile"></div>

    <!-- TOTALS FOOTER -->
    <div class="card" style="margin-top:24px;background:var(--bg-app);">
      <div style="display:flex;justify-content:space-between;font-size:14px;padding:6px 0;">
        <span class="text-muted">Total Cost Value (live stock)</span>
        <b style="color:var(--primary);">${rs(T.costValue)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:14px;padding:6px 0;">
        <span class="text-muted">Total Sell Value (live stock)</span>
        <b style="color:#2563EB;">${rs(T.sellValue)}</b>
      </div>
      <div style="height:1px;background:var(--border);margin:12px 0;"></div>
      <div style="display:flex;justify-content:space-between;font-size:16px;">
        <b>Potential Profit if all sold</b>
        <b style="color:${T.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(T.profit)}</b>
      </div>
    </div>
  `;

  // ── CHARTS ──
  charts.forEach(c => { try { c.destroy(); } catch(e) {} });
  charts = [];

  const CHART_COLORS = ['#5B5BD6','#3B82F6','#8B5CF6','#F59E0B','#EF4444','#10B981','#06B6D4','#EC4899','#84CC16','#F97316','#6366F1','#14B8A6'];

  const catCtx = $('#iv-cat-chart');
  if(catCtx && categories.length) {
    charts.push(new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: categories.map(c => c.name),
        datasets: [{
          data: categories.map(c => c.costValue),
          backgroundColor: categories.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
          tooltip: { callbacks: { label: c => c.label + ': ' + rs(c.parsed) } }
        },
        cutout: '60%'
      }
    }));
  } else if(catCtx) {
    catCtx.parentElement.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><div class="empty-icon">📊</div><div class="empty-title">No category data</div></div>';
  }

  const barCtx = $('#iv-bar-chart');
  if(barCtx && categories.length) {
    const topCats = categories.slice(0, 8);
    charts.push(new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: topCats.map(c => c.name),
        datasets: [
          { label: 'Cost', data: topCats.map(c => c.costValue), backgroundColor: '#5B5BD6', borderRadius: 4 },
          { label: 'Sell', data: topCats.map(c => c.sellValue), backgroundColor: '#3B82F6', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
          tooltip: { callbacks: { label: c => c.dataset.label + ': ' + rs(c.parsed.y) } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => '₹' + Number(v).toLocaleString('en-IN'), font: { size: 9 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false }, ticks: { font: { size: 9 } } }
        }
      }
    }));
  } else if(barCtx) {
    barCtx.parentElement.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><div class="empty-icon">📊</div><div class="empty-title">No category data</div></div>';
  }

  // ── FILTER + TABLE RENDER ──
  function filtered() {
    const q      = ($('#iv-search').value || '').toLowerCase().trim();
    const sortBy = $('#iv-sort').value;
    const flt    = $('#iv-filter').value;

    let arr = valuations.filter(v => {
      const p = v.product;
      const hay = ((p.name || '') + ' ' + (p.company || '') + ' ' + (p.category || '')).toLowerCase();
      if(q && !hay.includes(q)) return false;

      if(flt === 'instock' && v.qty <= 0) return false;
      if(flt === 'expired' && v.expiredQty <= 0) return false;
      if(flt === 'near'    && v.nearExpiryQty <= 0) return false;
      if(flt === 'dead'    && (v.costValue <= 0 || soldRecentProductIds.has(p.id))) return false;
      return true;
    });

    if(sortBy === 'cost-desc')       arr.sort((a, b) => b.costValue - a.costValue);
    else if(sortBy === 'sell-desc')  arr.sort((a, b) => b.sellValue - a.sellValue);
    else if(sortBy === 'profit-desc')arr.sort((a, b) => b.profit - a.profit);
    else if(sortBy === 'margin-desc')arr.sort((a, b) => b.margin - a.margin);
    else if(sortBy === 'qty-desc')   arr.sort((a, b) => b.qty - a.qty);
    else if(sortBy === 'name')       arr.sort((a, b) => (a.product.name || '').localeCompare(b.product.name || ''));
    return arr;
  }

  function renderList() {
    const arr = filtered();

    const tbody = $('#iv-body');
    if(tbody) {
      tbody.innerHTML = arr.length === 0
        ? `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No products match</td></tr>`
        : arr.map(v => {
            const p = v.product;
            const marginColor = v.margin >= 20 ? 'var(--success)' : (v.margin >= 0 ? 'var(--text-main)' : 'var(--danger)');
            const isDead = v.costValue > 0 && !soldRecentProductIds.has(p.id);
            return `<tr>
              <td>
                <strong>${esc(p.name)}</strong>
                ${p.batch_managed === false ? ' <span class="chip chip-neutral" style="font-size:9px;">NON-BATCH</span>' : ''}
                ${isDead ? ' <span class="chip chip-warning" style="font-size:9px;">DEAD</span>' : ''}
                ${v.expiredQty > 0 ? `<div class="text-xs" style="color:var(--danger);margin-top:2px;">⚠ ${fmtNum(v.expiredQty)} expired</div>` : ''}
              </td>
              <td style="text-align:right;">${fmtNum(v.qty)}</td>
              <td style="text-align:right;color:var(--primary);font-weight:600;">${rs(v.costValue)}</td>
              <td style="text-align:right;color:#2563EB;">${rs(v.sellValue)}</td>
              <td style="text-align:right;color:${v.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${rs(v.profit)}</td>
              <td style="text-align:right;color:${marginColor};font-weight:600;">${v.margin.toFixed(1)}%</td>
            </tr>`;
          }).join('');
    }

    const mob = $('#iv-mobile');
    if(mob) {
      mob.innerHTML = arr.length === 0
        ? `<div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">No products match</div></div>`
        : arr.map(v => {
            const p = v.product;
            const marginColor = v.margin >= 20 ? 'var(--success)' : (v.margin >= 0 ? 'var(--text-main)' : 'var(--danger)');
            return `
              <div class="mobile-card">
                <div class="mobile-card-head">
                  <div>
                    <div class="mobile-card-title">${esc(p.name)}</div>
                    <div class="mobile-card-sub">${p.category ? esc(p.category) + ' · ' : ''}${fmtNum(v.qty)} ${esc(p.unit || '')}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700;color:var(--primary);">${rs(v.costValue)}</div>
                    <div class="text-xs text-muted" style="margin-top:2px;">cost</div>
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px;margin-top:8px;">
                  <div style="padding:8px;background:var(--bg-app);border-radius:6px;text-align:center;">
                    <div class="text-muted">Sell</div>
                    <div style="font-weight:700;color:#2563EB;margin-top:2px;">${rs(v.sellValue)}</div>
                  </div>
                  <div style="padding:8px;background:var(--bg-app);border-radius:6px;text-align:center;">
                    <div class="text-muted">Profit</div>
                    <div style="font-weight:700;color:${v.profit >= 0 ? 'var(--success)' : 'var(--danger)'};margin-top:2px;">${rs(v.profit)}</div>
                  </div>
                  <div style="padding:8px;background:var(--bg-app);border-radius:6px;text-align:center;">
                    <div class="text-muted">Margin</div>
                    <div style="font-weight:700;color:${marginColor};margin-top:2px;">${v.margin.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            `;
          }).join('');
    }
  }

  ['iv-search', 'iv-sort', 'iv-filter'].forEach(id => {
    const el = $('#' + id);
    if(el) { el.oninput = renderList; el.onchange = renderList; }
  });

  renderList();
}

console.log('[MediStore] Core Logic Block 16 loaded');
/* ─────────────────────────────────────────────
   71. SHOP HEALTH
   ───────────────────────────────────────────── */
function renderShopHealth(content) {
  const today = todayStr();
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  let rangePreset = 'all';
  let customFrom  = '';
  let customTo    = '';

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Shop Health</h1>
        <p>Complete business snapshot</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;" id="sh-range">
        <button class="btn btn-sm btn-primary" data-r="all">All Time</button>
        <button class="btn btn-sm btn-ghost" data-r="today">Today</button>
        <button class="btn btn-sm btn-ghost" data-r="month">This Month</button>
        <button class="btn btn-sm btn-ghost" data-r="year">This Year</button>
        <button class="btn btn-sm btn-ghost" data-r="custom">Custom</button>
      </div>
      <div id="sh-custom" style="display:none;gap:8px;flex-wrap:wrap;align-items:end;">
        <div><label class="label">From</label><input class="input" type="date" id="sh-from"></div>
        <div><label class="label">To</label><input class="input" type="date" id="sh-to"></div>
        <div><label class="label">&nbsp;</label><button class="btn btn-primary btn-sm" id="sh-apply">Apply</button></div>
      </div>
    </div>

    <div class="card" id="sh-hero" style="text-align:center;padding:36px 20px;margin-bottom:24px;"></div>
    <div class="grid-4" id="sh-metrics" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;"></div>

    <div class="card">
      <div class="card-title">Alerts</div>
      <div id="sh-alerts"></div>
    </div>
  `;

  function range() {
    const t = todayStr();
    if(rangePreset === 'today') return { from: t, to: t };
    if(rangePreset === 'month') return { from: firstOfMonth, to: t };
    if(rangePreset === 'year')  return { from: new Date().getFullYear() + '-01-01', to: t };
    if(rangePreset === 'custom')return { from: customFrom || '0000-01-01', to: customTo || '9999-12-31' };
    return { from: '0000-01-01', to: '9999-12-31' };
  }

  function metrics(from, to) {
    const invs = DB.invoices.filter(i => {
      if(String(i.invoice_no || '').startsWith(RETURN_PREFIX)) return false;
      const d = txDate(i, 'invoice_date');
      return d >= from && d <= to;
    });
    const grossSales = invs.reduce((s, i) => s + Number(i.total || 0), 0);

    const rets = DB.returns.filter(r => {
      const d = txDate(r, 'return_date');
      return d >= from && d <= to;
    });
    const totalReturns = rets.reduce((s, r) => s + Number(r.amount || 0), 0);

    const netSales = Math.max(0, grossSales - totalReturns);

    const bills = DB.supplier_invoices.filter(b => {
      const d = txDate(b, 'bill_date');
      return d >= from && d <= to;
    });
    const totalPurchases = bills.reduce((s, b) => s + Number(b.total || 0), 0);

    const exps = DB.expenses.filter(e => {
      const d = txDate(e, 'expense_date');
      return d >= from && d <= to;
    });
    const totalExpenses = exps.reduce((s, e) => s + Number(e.amount || 0), 0);

    const partyDue    = totalCustomerDue();
    const supplierDue = totalSupplierDue();
    const stockValue  = totalStockValue();

    const profit = netSales - totalPurchases - totalExpenses;
    const margin = netSales > 0 ? (profit / netSales) * 100 : 0;

    return {
      grossSales, totalReturns, netSales,
      totalPurchases, totalExpenses,
      partyDue, supplierDue, stockValue,
      profit, margin,
      invoiceCount: invs.length
    };
  }

  function render() {
    const { from, to } = range();
    const m = metrics(from, to);

    const isP  = m.profit >= 0;
    const color= isP ? 'var(--success)' : 'var(--danger)';
    const bg   = isP ? 'var(--success-bg)' : 'var(--danger-bg)';
    const bdr  = isP ? 'var(--success)' : 'var(--danger)';

    const heroEl = $('#sh-hero');
    heroEl.style.background = bg;
    heroEl.style.borderColor = bdr;
    heroEl.innerHTML = `
      <div class="text-xs" style="color:${color};font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${isP ? 'In Profit' : 'In Loss'}</div>
      <div style="font-size:40px;font-weight:800;color:${color};margin:10px 0;line-height:1.1;letter-spacing:-1px;">${rs(Math.abs(m.profit))}</div>
      <div class="text-sm" style="color:var(--text-muted);">Margin: <b style="color:${color};">${m.margin.toFixed(1)}%</b> · ${m.invoiceCount} invoice${m.invoiceCount === 1 ? '' : 's'}</div>
      <div class="text-xs text-muted" style="margin-top:10px;">${rangePreset === 'all' ? 'All time' : fmtDate(from) + ' → ' + fmtDate(to)}</div>
    `;

    const cards = [
      { lbl: 'Gross Sales',       txt: rs(m.grossSales),      col: 'var(--primary)' },
      { lbl: 'Returns',           txt: rs(m.totalReturns),    col: 'var(--warning)' },
      { lbl: 'Net Sales',         txt: rs(m.netSales),        col: 'var(--success)' },
      { lbl: 'Purchases',         txt: rs(m.totalPurchases),  col: 'var(--warning)' },
      { lbl: 'Expenses',          txt: rs(m.totalExpenses),   col: 'var(--danger)' },
      { lbl: 'Live Stock Value',  txt: rs(m.stockValue),      col: 'var(--primary)' },
      { lbl: 'Customer Due',      txt: rs(m.partyDue),        col: '#2563EB' },
      { lbl: 'Supplier Payable',  txt: rs(m.supplierDue),     col: 'var(--danger)' }
    ];

    $('#sh-metrics').innerHTML = cards.map(c => `
      <div class="card" style="border-left:4px solid ${c.col};padding:16px;">
        <div class="text-xs text-muted" style="text-transform:uppercase;font-weight:700;letter-spacing:0.4px;">${c.lbl}</div>
        <div style="font-size:18px;font-weight:700;color:${c.col};margin-top:6px;">${c.txt}</div>
      </div>
    `).join('');

    // Alerts
    const lowList  = DB.products.filter(p => isLowStock(p) || isOutOfStock(p));
    const nearList = nearExpiryBatches();
    const expList  = DB.product_batches.filter(b => Number(b.qty) > 0 && b.expiry_date && b.expiry_date < todayStr());

    const alertItems = [];
    if(expList.length) {
      const val = expList.reduce((s, b) => s + (Number(b.qty) * Number(b.cost || 0)), 0);
      alertItems.push({ icon: '⚠️', text: expList.length + ' expired batch' + (expList.length === 1 ? '' : 'es') + ' · ' + rs(val), link: '#/batches', color: 'var(--danger)' });
    }
    if(nearList.length) {
      alertItems.push({ icon: '⏰', text: nearList.length + ' batch' + (nearList.length === 1 ? '' : 'es') + ' near expiry (≤ ' + (SETTINGS.near_expiry_days || 60) + ' days)', link: '#/batches', color: 'var(--warning)' });
    }
    if(lowList.length) {
      alertItems.push({ icon: '📦', text: lowList.length + ' product' + (lowList.length === 1 ? '' : 's') + ' low/out of stock', link: '#/products', color: 'var(--danger)' });
    }

    const alertsEl = $('#sh-alerts');
    if(!alertItems.length) {
      alertsEl.innerHTML = '<div class="empty-state" style="padding:24px 10px;"><div class="empty-icon">✅</div><div class="empty-title">All clear</div><div class="empty-desc">No alerts right now.</div></div>';
    } else {
      alertsEl.innerHTML = alertItems.map(a => `
        <a href="${esc(a.link)}" style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:var(--radius-md);background:var(--bg-app);border:1px solid var(--border);margin-bottom:8px;text-decoration:none;color:inherit;transition:background 0.15s;" onmouseover="this.style.background='var(--primary-light)'" onmouseout="this.style.background='var(--bg-app)'">
          <span style="font-size:20px;">${esc(a.icon)}</span>
          <span style="flex:1;font-weight:600;font-size:13px;color:${a.color};">${esc(a.text)}</span>
          <span style="color:var(--text-muted);font-size:16px;">›</span>
        </a>
      `).join('');
    }
  }

  $$('#sh-range button').forEach(b => b.onclick = () => {
    rangePreset = b.dataset.r;
    $$('#sh-range button').forEach(x => {
      x.className = 'btn btn-sm ' + (x.dataset.r === rangePreset ? 'btn-primary' : 'btn-ghost');
    });
    const cust = $('#sh-custom');
    if(cust) cust.style.display = rangePreset === 'custom' ? 'flex' : 'none';
    if(rangePreset !== 'custom') render();
  });

  $('#sh-apply').onclick = () => {
    const f = $('#sh-from').value;
    const t = $('#sh-to').value;
    if(!f || !t) { toast('Pick both dates', 'error'); return; }
    if(f > t) { toast('From cannot be after To', 'error'); return; }
    customFrom = f;
    customTo   = t;
    render();
  };

  render();
}

/* ─────────────────────────────────────────────
   72. MY SHOP
   ───────────────────────────────────────────── */
function renderMyShop(content) {
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>My Shop</h1>
        <p>Business details and preferences</p>
      </div>
    </div>

    <!-- LOGO -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Logo</div>
      <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;">
        <div style="width:100px;height:100px;border:1px solid var(--border);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:48px;background:var(--bg-app);overflow:hidden;flex-shrink:0;">
          ${SETTINGS.logo
            ? `<img src="${esc(SETTINGS.logo)}" style="max-width:100%;max-height:100%;object-fit:contain;" alt="Shop logo">`
            : '💊'}
        </div>
        <div style="flex:1;min-width:200px;">
          <input type="file" id="logo-input" accept="image/png, image/jpeg, image/webp" style="display:none;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="btn-upload" class="btn btn-primary">📁 Upload Logo</button>
            ${SETTINGS.logo ? '<button id="btn-remove-logo" class="btn btn-ghost" style="color:var(--danger);">Remove</button>' : ''}
          </div>
          <p class="field-hint" style="margin-top:8px;">PNG, JPG, or WebP. Max 500 KB. Will appear on invoices, dashboard, and thermal print.</p>
        </div>
      </div>
    </div>

    <!-- SHOP DETAILS -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Shop Details</div>
      <form id="shop-form" style="display:flex;flex-direction:column;gap:16px;">
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Shop name</label>
            <input class="input" name="shop_name" value="${esc(SETTINGS.shop_name || '')}" placeholder="e.g. City Medical Store">
          </div>
          <div>
            <label class="label">Owner name</label>
            <input class="input" name="owner_name" value="${esc(SETTINGS.owner_name || '')}" placeholder="Your full name">
          </div>
        </div>

        <div>
          <label class="label">Address</label>
          <input class="input" name="address" value="${esc(SETTINGS.address || '')}" placeholder="Street, area">
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">City / Pin</label>
            <input class="input" name="city" value="${esc(SETTINGS.city || '')}" placeholder="Kolkata - 700001">
          </div>
          <div>
            <label class="label">Phone</label>
            <input class="input" type="tel" name="phone" value="${esc(SETTINGS.phone || '')}" placeholder="10-digit mobile">
          </div>
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Email</label>
            <input class="input" type="email" name="email" value="${esc(SETTINGS.email || '')}">
          </div>
          <div>
            <label class="label">UPI ID (for QR payments)</label>
            <input class="input" name="upi" value="${esc(SETTINGS.upi || '')}" placeholder="yourshop@upi">
          </div>
        </div>

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="label">Drug License No.</label>
            <input class="input" name="license" value="${esc(SETTINGS.license || '')}" placeholder="e.g. 20B/21B-XXXXX">
          </div>
          <div>
            <label class="label">DL Number 2 (print header)</label>
            <input class="input" name="dl_number" value="${esc(SETTINGS.dl_number || '')}" placeholder="e.g. 20B/21B-12345">
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" type="submit" id="shop-save">Save Changes</button>
        </div>
      </form>
    </div>

    <!-- GST -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">GST</div>
      <label style="display:flex;align-items:center;gap:12px;cursor:pointer;font-size:13px;padding:14px;background:var(--bg-app);border-radius:var(--radius-md);border:1px solid var(--border);">
        <input type="checkbox" id="gst-toggle" ${SETTINGS.gst_enabled ? 'checked' : ''}>
        <span>
          <b>Enable GST on invoices</b><br>
          <span class="field-hint">When on, invoices will show GST fields and calculate GST (MRP treated as inclusive)</span>
        </span>
      </label>
      <div id="gst-fields" style="display:${SETTINGS.gst_enabled ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
        <div>
          <label class="label">GSTIN</label>
          <input class="input" id="gst-number" value="${esc(SETTINGS.gst_number || '')}" placeholder="22AAAAA0000A1Z5">
        </div>
        <div>
          <label class="label">Default GST Rate (%)</label>
          <input class="input" type="number" step="any" min="0" id="gst-rate" value="${SETTINGS.gst_rate || 12}">
        </div>
      </div>
    </div>

    <!-- PREFERENCES -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Preferences</div>

      <label style="display:flex;align-items:center;gap:12px;cursor:pointer;font-size:13px;padding:14px;background:var(--bg-app);border-radius:var(--radius-md);border:1px solid var(--border);margin-bottom:16px;">
        <input type="checkbox" id="non-batch-toggle" ${SETTINGS.enable_non_batch ? 'checked' : ''}>
        <span>
          <b>Enable non-batch products</b><br>
          <span class="field-hint">Turn ON if you also sell cosmetics, surgicals, or general items that don't need batch number and expiry.</span>
        </span>
      </label>

      <div>
        <label class="label">Near-expiry alert threshold (days)</label>
        <input class="input" type="number" step="1" min="1" max="365" id="near-days" value="${SETTINGS.near_expiry_days || 60}" style="max-width:200px;">
        <div class="field-hint">Batches expiring within this many days will be flagged on the dashboard, products, and batches pages.</div>
      </div>
    </div>

    <!-- PRINT SETTINGS -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Print Settings</div>
      <div>
        <label class="label">Invoice footer message</label>
        <input class="input" id="print-footer" value="${esc(SETTINGS.print_footer || 'Thank you! Get well soon')}" placeholder="Thank you! Get well soon">
        <div class="field-hint">Shown at the bottom of every printed / thermal bill</div>
      </div>
      <div style="margin-top:16px;">
        <label class="label">Quick preview (thermal 58mm)</label>
        <div style="background:#fff;border:1px dashed var(--border);border-radius:var(--radius-sm);padding:14px;font-family:ui-monospace,'Courier New',monospace;font-size:11px;line-height:1.5;color:#000;max-width:280px;">
          <div style="text-align:center;font-weight:700;">${esc(SETTINGS.shop_name || 'MediStore')}</div>
          <div style="text-align:center;font-size:10px;">${esc(SETTINGS.address || '')}</div>
          <div style="border-top:1px dashed #999;margin:6px 0;"></div>
          <div>Bill: INV-0001</div>
          <div>Customer: Walk-in</div>
          <div style="border-top:1px dashed #999;margin:6px 0;"></div>
          <div>Paracetamol 500mg</div>
          <div>&nbsp;&nbsp;B:1234 &nbsp;E:08/27 &nbsp;₹25.00</div>
          <div style="border-top:1px dashed #999;margin:6px 0;"></div>
          <div style="text-align:center;font-size:10px;margin-top:6px;">${esc(SETTINGS.print_footer || 'Thank you! Get well soon')}</div>
        </div>
      </div>
    </div>

    <!-- SUBSCRIPTION SLOT -->
    <div id="sub-card-slot"></div>
  `;

  // ── LOGO UPLOAD ──
  const uploadBtn = $('#btn-upload');
  const logoInput = $('#logo-input');
  if(uploadBtn && logoInput) {
    uploadBtn.onclick = () => logoInput.click();
    logoInput.onchange = (e) => {
      const f = e.target.files[0];
      if(!f) return;

      // Strict validation: only allowed types + size cap
      const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
      if(!ALLOWED.includes(f.type)) {
        toast('Only PNG, JPG, or WebP images are allowed.', 'error');
        e.target.value = '';
        return;
      }
      if(f.size > 1024 * 500) {
        toast('Image too large (max 500 KB). Please compress.', 'error');
        e.target.value = '';
        return;
      }

      const r = new FileReader();
      r.onload = async (ev) => {
        SETTINGS.logo = ev.target.result;
        const ok = await saveSettings();
        if(ok) {
          applyFavicon();
          toast('Logo updated', 'success');
          route();
        }
      };
      r.readAsDataURL(f);
    };
  }

  const rmBtn = $('#btn-remove-logo');
  if(rmBtn) {
    rmBtn.onclick = async () => {
      if(!confirm('Remove the shop logo?')) return;
      SETTINGS.logo = '';
      const ok = await saveSettings();
      if(ok) {
        applyFavicon();
        toast('Logo removed', 'success');
        route();
      }
    };
  }

  // ── SHOP FORM ──
  $('#shop-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    SETTINGS.shop_name = (fd.get('shop_name') || '').trim() || 'MediStore';
    SETTINGS.owner_name = (fd.get('owner_name') || '').trim() || 'Owner';
    SETTINGS.address    = (fd.get('address') || '').trim();
    SETTINGS.city       = (fd.get('city') || '').trim();
    SETTINGS.phone      = (fd.get('phone') || '').trim();
    SETTINGS.email      = (fd.get('email') || '').trim();
    SETTINGS.upi        = (fd.get('upi') || '').trim();
    SETTINGS.license    = (fd.get('license') || '').trim();
    SETTINGS.dl_number  = (fd.get('dl_number') || '').trim();

    const btn = $('#shop-save');
    btn.disabled = true; btn.textContent = 'Saving...';

    const ok = await saveSettings();
    btn.disabled = false; btn.textContent = 'Save Changes';

    if(ok) {
      toast('Shop details saved', 'success');
      route();
    }
  };

  // ── GST ──
  $('#gst-toggle').onchange = async (e) => {
    SETTINGS.gst_enabled = e.target.checked;
    const gf = $('#gst-fields');
    if(gf) gf.style.display = SETTINGS.gst_enabled ? 'grid' : 'none';
    const ok = await saveSettings();
    if(ok) toast('GST ' + (SETTINGS.gst_enabled ? 'enabled' : 'disabled'), 'success');
  };

  ['gst-number', 'gst-rate'].forEach(id => {
    const el = $('#' + id);
    if(!el) return;
    el.onchange = async () => {
      if(id === 'gst-number') SETTINGS.gst_number = el.value.trim();
      else SETTINGS.gst_rate = Number(el.value) || 0;
      const ok = await saveSettings();
      if(ok) toast('GST settings saved', 'success');
    };
  });

  // ── PREFERENCES ──
  $('#non-batch-toggle').onchange = async (e) => {
    SETTINGS.enable_non_batch = e.target.checked;
    const ok = await saveSettings();
    if(ok) toast('Non-batch products ' + (SETTINGS.enable_non_batch ? 'enabled' : 'disabled'), 'success');
  };

  $('#near-days').onchange = async (e) => {
    const v = Math.max(1, Math.min(365, Number(e.target.value) || 60));
    SETTINGS.near_expiry_days = v;
    e.target.value = v;
    const ok = await saveSettings();
    if(ok) toast('Alert threshold set to ' + v + ' days', 'success');
  };

  // ── PRINT FOOTER ──
  $('#print-footer').onchange = async (e) => {
    SETTINGS.print_footer = (e.target.value || '').trim() || 'Thank you! Get well soon';
    const ok = await saveSettings();
    if(ok) toast('Footer saved', 'success');
  };
}

/* ─────────────────────────────────────────────
   73. BACKUP / RESTORE
   ───────────────────────────────────────────── */
function renderBackup(content) {
  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Backup &amp; Restore</h1>
        <p>Export or restore your data</p>
      </div>
    </div>

    <!-- EXPORT -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Download Backup</div>
      <p class="text-sm text-muted" style="margin-bottom:16px;">
        Get a full JSON snapshot of your shop — customers, doctors, suppliers, products, batches, invoices, purchases, returns, expenses, and settings.
      </p>
      <div style="background:var(--bg-app);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;font-size:12px;line-height:1.9;">
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Customers</span><b>${DB.customers.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Doctors</span><b>${DB.doctors.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Suppliers &amp; Companies</span><b>${DB.suppliers.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Products</span><b>${DB.products.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Batches</span><b>${DB.product_batches.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Invoices</span><b>${DB.invoices.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Purchase Bills</span><b>${DB.supplier_invoices.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Returns</span><b>${DB.returns.length}</b></div>
        <div style="display:flex;justify-content:space-between;"><span class="text-muted">Expenses</span><b>${DB.expenses.length}</b></div>
      </div>
      <button id="btn-export" class="btn btn-primary btn-block">📥 Download Backup (JSON)</button>
    </div>

    <!-- RESTORE -->
    <div class="card">
      <div class="card-title">Restore from Backup</div>
      <div style="padding:16px;background:var(--warning-bg);border:1px solid var(--warning);border-radius:var(--radius-md);margin-bottom:16px;font-size:12px;color:#78350f;line-height:1.6;">
        <b>⚠️ Smart Merge:</b> Existing rows with the same ID will be <b>updated</b>. New rows will be <b>added</b>. Nothing is deleted. Safe to run multiple times.
      </div>
      <input type="file" id="restore-file" accept="application/json,.json" style="display:none;">
      <button id="btn-restore" class="btn btn-ghost btn-block">📤 Choose Backup File</button>
    </div>
  `;

  // ── EXPORT ──
  $('#btn-export').onclick = () => {
    const payload = {
      version: 1,
      app: 'MediStore',
      exported_at: new Date().toISOString(),
      settings: { ...SETTINGS },
      customers: DB.customers,
      doctors: DB.doctors,
      suppliers: DB.suppliers,
      products: DB.products,
      product_batches: DB.product_batches,
      invoices: DB.invoices,
      invoice_items: DB.invoice_items,
      payments: DB.payments,
      supplier_invoices: DB.supplier_invoices,
      supplier_invoice_items: DB.supplier_invoice_items,
      supplier_payments: DB.supplier_payments,
      returns: DB.returns,
      expenses: DB.expenses
    };

    delete payload.settings.loaded;

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'medistore-backup-' + todayStr() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded', 'success');
  };

  // ── RESTORE ──
  $('#btn-restore').onclick = () => $('#restore-file').click();

  $('#restore-file').onchange = (e) => {
    const f = e.target.files[0];
    if(!f) return;

    if(f.size > 50 * 1024 * 1024) {
      toast('File too large (max 50 MB)', 'error');
      e.target.value = '';
      return;
    }

    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);

        if(!raw || typeof raw !== 'object' || raw.app !== 'MediStore') {
          toast('This file is not a valid MediStore backup.', 'error');
          e.target.value = '';
          return;
        }

        if(!confirmDlg('Merge this backup into your current data?\n\nExisting rows with the same ID will be updated. New rows will be added. Nothing is deleted.', 'Restore Backup')) {
          e.target.value = '';
          return;
        }

        toast('Analyzing backup...', 'info');

        // Strict schema (allow-list — anything not in here is dropped)
        const SCHEMA = {
          customers:              ['id','name','phone','address','notes','joined_date','tx_time','created_at'],
          doctors:                ['id','name','hospital','phone','notes','created_at'],
          suppliers:              ['id','name','shop_name','phone','email','address','gst','category','notes','opening_balance','type','joined_date','tx_time','created_at'],
          products:               ['id','name','category','company','supplier_id','batch_managed','unit','gst_rate','mrp','cost','selling_price','stock','low_stock_alert','schedule','notes','loose_unit','conversion_factor','created_at'],
          product_batches:        ['id','product_id','batch_no','expiry_date','qty','cost','mrp','selling_price','supplier_id','created_at'],
          invoices:               ['id','invoice_no','customer_id','customer_name','customer_phone','doctor_id','doctor_name','patient_name','prescription_no','subtotal','discount','total','paid','due','notes','invoice_date','tx_time','gst_enabled','gst_amount','created_at'],
          invoice_items:          ['id','invoice_id','product_id','product_name','batch_id','batch_no','expiry_date','unit','qty','mrp','price','gst_rate','gst_amount','total','created_at'],
          payments:               ['id','customer_id','customer_name','amount','mode','notes','payment_date','tx_time','created_at'],
          supplier_invoices:      ['id','supplier_id','supplier_name','bill_no','bill_date','tx_time','subtotal','discount','total','paid','notes','created_at'],
          supplier_invoice_items: ['id','supplier_invoice_id','product_id','product_name','batch_no','expiry_date','unit','qty','cost','mrp','selling_price','total','created_at'],
          supplier_payments:      ['id','supplier_id','supplier_name','amount','mode','notes','payment_date','tx_time','created_at'],
          returns:                ['id','direction','invoice_id','customer_id','supplier_id','product_id','product_name','batch_id','batch_no','expiry_date','unit','qty','amount','reason','return_date','tx_time','created_at'],
          expenses:               ['id','category','amount','notes','expense_date','tx_time','created_at']
        };

        // Column defaults for safety
        function convertRow(row, allowedCols) {
          const out = {};
          for(const k in row) {
            if(allowedCols.includes(k)) out[k] = row[k];
          }
          return out;
        }

        // Build merged dataset
        const merged = {};
        for(const key in raw) {
          if(!Array.isArray(raw[key]) || !raw[key].length) continue;
          if(!SCHEMA[key]) continue;
          merged[key] = raw[key];
        }

        // Upload
        const report = { added: 0, failed: 0, tables: {} };
        const errors = [];

        const ORDER = [
          'customers', 'doctors', 'suppliers', 'products', 'product_batches',
          'invoices', 'invoice_items', 'payments',
          'supplier_invoices', 'supplier_invoice_items', 'supplier_payments',
          'returns', 'expenses'
        ];

        for(const table of ORDER) {
          const rows = merged[table];
          if(!rows || !rows.length) {
            report.tables[table] = '0 rows (not in backup)';
            continue;
          }

          const allowedCols = SCHEMA[table];
          const cleanRows   = rows.map(r => convertRow(r, allowedCols));

          let tAdded = 0, tFailed = 0;

          for(const row of cleanRows) {
            if(!row.id) {
              tFailed++;
              if(errors.length < 15) errors.push(table + ': missing id');
              continue;
            }
            const { error } = await sb.from(table).upsert(row, { onConflict: 'id' });
            if(error) {
              tFailed++;
              if(errors.length < 15) errors.push(table + ': ' + error.message);
            } else {
              tAdded++;
            }
          }

          report.added  += tAdded;
          report.failed += tFailed;
          report.tables[table] = tAdded + ' ok' + (tFailed ? ', ' + tFailed + ' failed' : '');
        }

        // Restore settings
        if(raw.settings && typeof raw.settings === 'object') {
          const s = raw.settings;
          SETTINGS = Object.assign({}, SETTINGS, {
            shop_name:         s.shop_name         || SETTINGS.shop_name,
            owner_name:        s.owner_name        || SETTINGS.owner_name,
            address:           s.address           || SETTINGS.address,
            city:              s.city              || SETTINGS.city,
            license:           s.license           || SETTINGS.license,
            dl_number:         s.dl_number         || SETTINGS.dl_number,
            upi:               s.upi               || SETTINGS.upi,
            phone:             s.phone             || SETTINGS.phone,
            email:             s.email             || SETTINGS.email,
            logo:              s.logo              || SETTINGS.logo,
            gst_enabled:       typeof s.gst_enabled === 'boolean' ? s.gst_enabled : SETTINGS.gst_enabled,
            gst_number:        s.gst_number        || SETTINGS.gst_number,
            gst_rate:          Number(s.gst_rate)  || SETTINGS.gst_rate,
            near_expiry_days:  Number(s.near_expiry_days) || SETTINGS.near_expiry_days,
            enable_non_batch:  typeof s.enable_non_batch === 'boolean' ? s.enable_non_batch : SETTINGS.enable_non_batch,
            print_footer:      s.print_footer      || SETTINGS.print_footer
          });
          await saveSettings();
          report.tables['settings'] = 'applied';
        }

        await syncDB();

        let summary = '✅ Merged ' + report.added + ' row' + (report.added === 1 ? '' : 's') + ' successfully.\n';
        if(report.failed) summary += '⚠️ ' + report.failed + ' row' + (report.failed === 1 ? '' : 's') + ' failed.\n';
        summary += '\n── Per table ──\n';
        for(const t of ORDER) {
          if(report.tables[t]) summary += t + ': ' + report.tables[t] + '\n';
        }
        if(report.tables['settings']) summary += 'settings: ' + report.tables['settings'] + '\n';
        if(errors.length) {
          summary += '\n── Errors ──\n' + errors.join('\n');
        }

        alert(summary);
        toast('Backup merged', 'success');
        route();

      } catch(err) {
        console.error(err);
        alert('Import failed: ' + (err.message || err));
      }
      e.target.value = '';
    };
    r.readAsText(f);
  };
}

console.log('[MediStore] Core Logic Block 17 loaded');
/* ─────────────────────────────────────────────
   74. SHARED THERMAL HELPERS
   ───────────────────────────────────────────── */
function thermalSafe(s) {
  return String(s == null ? '' : s).replace(/[^\x00-\x7F]/g, '');
}

function u8ToBase64(u8) {
  let bin = '';
  const CHUNK = 0x8000;
  for(let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, u8.length)));
  }
  return btoa(bin);
}

function buildEscPos(text, opts) {
  opts = opts || {};
  const enc = new TextEncoder();
  const parts = [];

  // Initialize
  parts.push(new Uint8Array([0x1B, 0x40]));

  // Align left
  parts.push(new Uint8Array([0x1B, 0x61, 0x00]));

  // Body
  parts.push(enc.encode(thermalSafe(text)));

  // Feed
  parts.push(enc.encode('\n\n'));

  // Cut (full cut)
  if(opts.cut !== false) {
    parts.push(new Uint8Array([0x1D, 0x56, 0x42, 0x00]));
  }

  let total = 0;
  parts.forEach(p => total += p.length);
  const out = new Uint8Array(total);
  let off = 0;
  parts.forEach(p => { out.set(p, off); off += p.length; });
  return out;
}

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isMobileDevice() {
  return isAndroid() || isIOS() || /mobile/i.test(navigator.userAgent);
}

function browserPrintThermal(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    '@page{size:58mm auto;margin:2mm}' +
    'html,body{margin:0;padding:0;background:#fff}' +
    'body{font-family:ui-monospace,"Courier New",monospace;font-size:11px;line-height:1.35;color:#000;padding:0}' +
    '@media screen{body{padding:10px}}' +
    '*{box-sizing:border-box}' +
    '</style></head><body>' + html + '</body></html>');
  doc.close();

  setTimeout(function() {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch(e) {
      console.error('[LocalPrinter] print error:', e);
      toast('Print failed: ' + e.message, 'error');
    }
    setTimeout(function() {
      if(iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 60000);
  }, 200);
}

/* ─────────────────────────────────────────────
   75. LOCAL PRINTER (RawBT / Browser)
   ───────────────────────────────────────────── */
window.LocalPrinter = (function() {
  'use strict';

  function buildTestReceipt() {
    const W = 32;
    const line = '-'.repeat(W);
    let t = '';
    t += (SETTINGS.shop_name || 'MediStore') + '\n';
    if(SETTINGS.owner_name) t += SETTINGS.owner_name + '\n';
    if(SETTINGS.address)    t += SETTINGS.address + '\n';
    if(SETTINGS.phone)      t += 'Ph: ' + SETTINGS.phone + '\n';
    if(SETTINGS.dl_number)  t += 'DL: ' + SETTINGS.dl_number + '\n';
    t += line + '\n';
    t += 'PRINTER TEST\n';
    t += line + '\n';
    t += 'If you can read this clearly,\n';
    t += 'your printer is working.\n';
    t += line + '\n';
    t += 'Date: ' + fmtDate(todayStr()) + '\n';
    t += 'Time: ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + '\n';
    t += line + '\n';
    t += '\n';
    t += (SETTINGS.print_footer || 'Thank you!') + '\n';
    t += '\n\n\n';
    return t;
  }

  function buildTestHTML() {
    return '<div style="text-align:left;width:56mm;padding:2mm;font-family:ui-monospace,monospace;">' +
      '<div style="font-weight:700;font-size:14px;">' + esc(SETTINGS.shop_name || 'MediStore') + '</div>' +
      (SETTINGS.owner_name ? '<div>' + esc(SETTINGS.owner_name) + '</div>' : '') +
      (SETTINGS.address ? '<div>' + esc(SETTINGS.address) + '</div>' : '') +
      (SETTINGS.phone ? '<div>Ph: ' + esc(SETTINGS.phone) + '</div>' : '') +
      (SETTINGS.license ? '<div>DL No: ' + esc(SETTINGS.license) + '</div>' : '') +
      (SETTINGS.dl_number ? '<div>DL: ' + esc(SETTINGS.dl_number) + '</div>' : '') +
      '<div style="border-top:1px dashed #000;margin:6px 0;"></div>' +
      '<div style="text-align:center;font-weight:700;">PRINTER TEST</div>' +
      '<div style="border-top:1px dashed #000;margin:6px 0;"></div>' +
      '<div>If you can read this clearly, your printer is working.</div>' +
      '<div style="margin-top:6px;">Date: ' + fmtDate(todayStr()) + '</div>' +
      '<div>Time: ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + '</div>' +
      '<div style="border-top:1px dashed #000;margin:6px 0;"></div>' +
      '<div style="text-align:center;margin-top:6px;">' + esc(SETTINGS.print_footer || 'Thank you!') + '</div>' +
      '<div style="height:20mm;"></div>' +
      '</div>';
  }

  function printViaRawBT(text) {
    const bytes = buildEscPos(text);
    const b64   = u8ToBase64(bytes);
    const url   = 'rawbt:' + b64;
    try {
      window.location.href = url;
      toast('Sent to RawBT printer', 'success');
    } catch(e) {
      toast('Could not open RawBT: ' + e.message, 'error');
    }
  }

  function printViaBrowser(html) {
    browserPrintThermal(html);
    toast('Print dialog opened', 'info');
  }

  function printInvoice(inv, items, party) {
    if(!inv || !items) { toast('Nothing to print', 'error'); return; }

    const text = buildThermalReceiptText(inv, items, party);

    if(isAndroid()) {
      printViaRawBT(text);
      return;
    }

    const html = buildThermalReceiptHTML(inv, items, party);
    printViaBrowser(html);
  }

  function test() {
    const text = buildTestReceipt();

    if(isAndroid()) {
      printViaRawBT(text);
      return;
    }
    printViaBrowser(buildTestHTML());
  }

  return {
    print: printInvoice,
    test,
    buildTestReceipt,
    printViaRawBT
  };
})();

/* ─────────────────────────────────────────────
   76. BLUETOOTH PRINTER (Web Bluetooth + ESC/POS)
   ───────────────────────────────────────────── */
window.BluetoothPrinter = (function() {
  'use strict';

  let printer = null;
  let connectedDevice = null;
  let libsReady = false;

  function libsLoaded() {
    return (typeof ReceiptPrinterEncoder !== 'undefined') &&
           (typeof WebBluetoothReceiptPrinter !== 'undefined');
  }

  function isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  async function waitForLibs() {
    if(libsLoaded()) { libsReady = true; return true; }
    for(let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      if(libsLoaded()) { libsReady = true; return true; }
    }
    return false;
  }

  async function connect() {
    if(!isSupported()) {
      toast('Bluetooth not supported on this device/browser', 'error');
      return false;
    }

    if(!libsReady && !(await waitForLibs())) {
      toast('Printer library not loaded - check internet', 'error');
      return false;
    }

    if(printer && connectedDevice) return true;

    try {
      printer = new WebBluetoothReceiptPrinter();
      printer.addEventListener('connected', function(d) { connectedDevice = d; });
      printer.addEventListener('disconnected', function() {
        connectedDevice = null;
        printer = null;
      });
      await printer.connect();
      toast('Bluetooth printer connected', 'success');
      return true;
    } catch(err) {
      printer = null;
      connectedDevice = null;
      if(err && err.name === 'NotFoundError') return false;
      if(err && err.name === 'NetworkError') {
        toast('Printer busy or out of range', 'error');
        return false;
      }
      toast('Bluetooth connect failed: ' + (err && err.message ? err.message : err), 'error');
      return false;
    }
  }

  async function disconnect() {
    try {
      if(printer && typeof printer.disconnect === 'function') {
        await printer.disconnect();
      }
    } catch(e) {}
    printer = null;
    connectedDevice = null;
  }

  function isConnected() { return !!connectedDevice; }

  async function printRaw(text) {
    if(!printer || !connectedDevice) {
      const ok = await connect();
      if(!ok) return false;
    }
    try {
      const encoder = new ReceiptPrinterEncoder({ language: 'esc-pos' });
      encoder.raw(buildEscPos(text, { cut: true }));
      const data = encoder.encode();
      await printer.print(data);
      return true;
    } catch(err) {
      toast('Print failed: ' + (err && err.message ? err.message : err), 'error');
      return false;
    }
  }

  async function printInvoice(inv, items, party) {
    if(!inv || !items) { toast('Nothing to print', 'error'); return false; }

    const text = buildThermalReceiptText(inv, items, party);
    const ok = await printRaw(text);
    if(ok) toast('Sent to Bluetooth printer', 'success');
    return ok;
  }

  async function test() {
    const text = LocalPrinter.buildTestReceipt();
    const ok = await printRaw(text);
    if(ok) toast('Test sent to Bluetooth printer', 'success');
  }

  return {
    connect, disconnect, isConnected,
    printInvoice, test,
    isSupported
  };
})();

/* ─────────────────────────────────────────────
   77. USB PRINTER (WebUSB + ESC/POS)
   ───────────────────────────────────────────── */
window.USBPrinter = (function() {
  'use strict';

  let device = null;

  function isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.usb;
  }

  function findOutEndpoint(dev) {
    try {
      const iface = dev.configuration.interfaces[0];
      const alt   = iface.alternates[0];
      return alt.endpoints.find(e => e.direction === 'out') || null;
    } catch(e) {
      return null;
    }
  }

  async function connect() {
    if(!isSupported()) {
      toast('USB printing not supported in this browser (use Chrome/Edge)', 'error');
      return false;
    }

    try {
      device = await navigator.usb.requestDevice({ filters: [] });
      await device.open();
      if(device.configuration === null) {
        await device.selectConfiguration(1);
      }
      await device.claimInterface(0);
      toast('USB printer connected: ' + (device.productName || 'unknown'), 'success');
      return true;
    } catch(err) {
      device = null;
      if(err && err.name === 'NotFoundError') return false;
      toast('USB connect failed: ' + (err && err.message ? err.message : err), 'error');
      return false;
    }
  }

  async function disconnect() {
    try {
      if(device) await device.close();
    } catch(e) {}
    device = null;
  }

  function isConnected() { return !!device; }

  async function printRaw(text) {
    if(!device) {
      const ok = await connect();
      if(!ok) return false;
    }

    const ep = findOutEndpoint(device);
    if(!ep) {
      toast('USB printer has no usable output endpoint', 'error');
      return false;
    }

    try {
      const data = buildEscPos(text, { cut: true });
      await device.transferOut(ep.endpointNumber, data);
      return true;
    } catch(err) {
      toast('USB write failed: ' + (err && err.message ? err.message : err), 'error');
      return false;
    }
  }

  async function printInvoice(inv, items, party) {
    if(!inv || !items) { toast('Nothing to print', 'error'); return false; }
    const text = buildThermalReceiptText(inv, items, party);
    const ok = await printRaw(text);
    if(ok) toast('Sent to USB printer', 'success');
    return ok;
  }

  async function test() {
    const text = LocalPrinter.buildTestReceipt();
    const ok = await printRaw(text);
    if(ok) toast('Test sent to USB printer', 'success');
  }

  return {
    connect, disconnect, isConnected,
    printInvoice, test,
    isSupported
  };
})();

/* ─────────────────────────────────────────────
   78. PDF MAKER (A4 documents via jsPDF)
   ───────────────────────────────────────────── */
window.PDFMaker = (function() {
  'use strict';

  function libReady() {
    return !!(window.jspdf && window.jspdf.jsPDF);
  }
  function guard() {
    if(!libReady()) {
      toast('PDF library not loaded - check internet', 'error');
      return false;
    }
    return true;
  }

  function clean(s) {
    return String(s == null ? '' : s).replace(/\u20B9/g, 'Rs.');
  }

  function pdfHeader(doc, subtitle) {
    const W = doc.internal.pageSize.getWidth();
    let y = 12;

    let textX = 14;
    if(SETTINGS.logo) {
      try {
        let fmt = 'PNG';
        if(SETTINGS.logo.indexOf('data:image/jpeg') === 0) fmt = 'JPEG';
        else if(SETTINGS.logo.indexOf('data:image/webp') === 0) fmt = 'WEBP';
        doc.addImage(SETTINGS.logo, fmt, 14, y, 18, 18);
        textX = 14 + 18 + 5;
      } catch(e) {
        console.warn('[PDF] logo add failed', e);
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(0, 0, 0);
    doc.text(clean(SETTINGS.shop_name || 'MediStore'), textX, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    let ty = y + 10;
    if(SETTINGS.owner_name) { doc.text(clean(SETTINGS.owner_name), textX, ty); ty += 4; }
    if(SETTINGS.address)    { doc.text(clean(SETTINGS.address), textX, ty); ty += 4; }
    if(SETTINGS.city)       { doc.text(clean(SETTINGS.city), textX, ty); ty += 4; }
    if(SETTINGS.phone)      { doc.text('Ph: ' + clean(SETTINGS.phone), textX, ty); ty += 4; }
    if(SETTINGS.gst_enabled && SETTINGS.gst_number) {
      doc.text('GSTIN: ' + clean(SETTINGS.gst_number), textX, ty); ty += 4;
    }
    if(SETTINGS.license) { doc.text('Drug Lic No: ' + SETTINGS.license, textX, ty); ty += 4; }
    if(SETTINGS.dl_number) { doc.text('DL No: ' + SETTINGS.dl_number, textX, ty); ty += 4; }

    const lineY = Math.max(y + 20, ty + 2);
    doc.setDrawColor(200);
    doc.line(14, lineY, W - 14, lineY);

    y = lineY + 6;

    if(subtitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(clean(subtitle), 14, y);
      y += 5;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    return y;
  }

  function pdfFooter(doc) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const n = doc.internal.getNumberOfPages();
    for(let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('Page ' + i + ' / ' + n, W / 2, H - 8, { align: 'center' });
      doc.text('Generated ' + new Date().toLocaleString('en-IN'), 14, H - 8);
    }
  }

  function invoicePDF(inv, items, party) {
    if(!guard()) return;

    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const W = doc.internal.pageSize.getWidth();
    let y = pdfHeader(doc, 'INVOICE');

    const custName = inv.customer_name || (party && party.name) || 'Walk-in';
    const custPhone= inv.customer_phone || (party && party.phone) || '';

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');

    let metaY = y;
    doc.text('Invoice No:', 14, metaY);
    doc.text('Date:',       14, metaY + 5);
    doc.text('Customer:',   14, metaY + 10);
    metaY += 10;

    if(custPhone) { metaY += 5; doc.text('Phone:', 14, metaY); }
    if(inv.doctor_name) { metaY += 5; doc.text('Doctor:', 14, metaY); }
    if(inv.patient_name) { metaY += 5; doc.text('Patient:', 14, metaY); }
    if(inv.prescription_no) { metaY += 5; doc.text('Rx No:', 14, metaY); }

    doc.setFont('helvetica', 'normal');
    let valY = y;
    doc.text(clean(inv.invoice_no || ''), 45, valY);
    doc.text(clean(fmtDate(txDate(inv, 'invoice_date'))), 45, valY + 5);
    doc.text(clean(custName), 45, valY + 10);
    valY += 10;

    if(custPhone) { valY += 5; doc.text(clean(custPhone), 45, valY); }
    if(inv.doctor_name) { valY += 5; doc.text(clean(inv.doctor_name), 45, valY); }
    if(inv.patient_name) { valY += 5; doc.text(clean(inv.patient_name), 45, valY); }
    if(inv.prescription_no) { valY += 5; doc.text(clean(inv.prescription_no), 45, valY); }

    const startY = metaY + 10;
    const body = items.map(it => [
      clean(it.product_name || ''),
      clean(it.batch_no || '—'),
      it.expiry_date ? fmtExpiryShort(it.expiry_date) : '—',
      clean(fmtNum(it.qty) + ' ' + (it.unit || '')),
      Number(it.price || 0).toFixed(2),
      Number(it.total || 0).toFixed(2)
    ]);

    doc.autoTable({
      startY,
      head: [['Medicine', 'Batch', 'Expiry', 'Qty', 'Rate', 'Amount']],
      body,
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [91, 91, 214], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'right' }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });

    y = doc.lastAutoTable.finalY + 8;
    const labelX = W - 80;
    const valX   = W - 14;

    function row(lbl, val, bold) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.text(clean(lbl), labelX, y);
      doc.text(clean(val), valX, y, { align: 'right' });
      y += 5.5;
    }

    row('Subtotal', 'Rs. ' + Number(inv.subtotal || 0).toFixed(2));
    if(Number(inv.discount) > 0) row('Discount', '- Rs. ' + Number(inv.discount).toFixed(2));
    if(inv.gst_enabled && Number(inv.gst_amount) > 0) row('GST (incl.)', 'Rs. ' + Number(inv.gst_amount).toFixed(2));
    doc.setDrawColor(220);
    doc.line(labelX, y - 2, valX, y - 2);
    y += 2;
    row('Total', 'Rs. ' + Number(inv.total || 0).toFixed(2), true);
    row('Paid',  'Rs. ' + Number(inv.paid  || 0).toFixed(2));
    row('Due',   'Rs. ' + Number(inv.due   || 0).toFixed(2), true);

    if(inv.notes) {
      y += 6;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text('Notes: ' + clean(inv.notes), 14, y);
    }

    y = doc.internal.pageSize.getHeight() - 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(clean(SETTINGS.print_footer || 'Thank you! Get well soon'), W / 2, y, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('Medicines once sold are not returnable.', W / 2, y + 5, { align: 'center' });

    pdfFooter(doc);

    const fname = 'Invoice-' + clean(inv.invoice_no || '').replace(/[^\w-]/g, '') + '.pdf';
    doc.save(fname);
    toast('PDF downloaded', 'success');
  }

  function buildReport(opts) {
    opts = opts || {};
    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    let y = pdfHeader(doc, opts.title || 'Report');

    if(opts.meta) {
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(clean(opts.meta), 14, y);
      y += 7;
      doc.setTextColor(0);
    }

    if(opts.kpis && opts.kpis.length) {
      const W = doc.internal.pageSize.getWidth();
      const usable = W - 28;
      const colW = usable / opts.kpis.length;
      doc.setFontSize(7);
      doc.setTextColor(120);
      opts.kpis.forEach((k, i) => doc.text(clean(k[0] || '').toUpperCase(), 14 + i * colW, y));
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      opts.kpis.forEach((k, i) => doc.text(clean(k[1] || ''), 14 + i * colW, y + 6));
      doc.setFont('helvetica', 'normal');
      y += 14;
    }

    (opts.tables || []).forEach(t => {
      if(!t || !t.head || !t.rows || !t.rows.length) return;
      if(t.title) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text(clean(t.title), 14, y);
        y += 3;
      }
      doc.autoTable({
        startY: y,
        head: [t.head.map(clean)],
        body: t.rows.map(r => r.map(clean)),
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [91, 91, 214], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 14, right: 14 }
      });
      y = doc.lastAutoTable.finalY + 8;
      if(y > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        y = 20;
      }
    });

    pdfFooter(doc);
    return doc;
  }

  function report(opts) {
    if(!guard()) return;
    const doc = buildReport(opts);
    doc.save((opts && opts.filename) || ('MediStore-' + todayStr() + '.pdf'));
    toast('PDF downloaded', 'success');
  }

  function autoGrab(pageTitle) {
    const kpis = [];
    document.querySelectorAll('#content .kpi-card').forEach(k => {
      const lbl = k.querySelector('.kpi-label');
      const val = k.querySelector('.kpi-value');
      if(lbl && val) kpis.push([clean(lbl.innerText.trim()), clean(val.innerText.trim())]);
    });

    const tables = [];
    document.querySelectorAll('#content .card').forEach(card => {
      const tbl = card.querySelector('table');
      if(!tbl) return;
      const titleEl = card.querySelector('.card-title');
      let title = '';
      if(titleEl && titleEl.firstChild) {
        title = titleEl.firstChild.textContent ? titleEl.firstChild.textContent.trim() : '';
      }
      const head = [];
      tbl.querySelectorAll('thead th').forEach(th => head.push(clean(th.innerText.trim())));
      const rows = [];
      tbl.querySelectorAll('tbody tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('td').forEach(td => {
          const clone = td.cloneNode(true);
          clone.querySelectorAll('button, a.btn').forEach(b => b.remove());
          row.push(clean(clone.innerText.trim()));
        });
        if(row.length && row.join('').trim()) rows.push(row);
      });
      if(head.length && rows.length) tables.push({ title: title || 'Table', head, rows });
    });

    if(!kpis.length && !tables.length) {
      toast('Nothing to export from this page', 'info');
      return;
    }

    report({
      title: pageTitle,
      meta: 'Generated ' + new Date().toLocaleString('en-IN'),
      kpis,
      tables,
      filename: pageTitle.replace(/\s+/g, '_') + '-' + todayStr() + '.pdf'
    });
  }

  return {
    invoice: invoicePDF,
    report,
    auto: autoGrab,
    buildReport
  };
})();

console.log('[MediStore] Core Logic Block 18 loaded');
/* ─────────────────────────────────────────────
   79. SUBSCRIPTION HELPERS & UI
   ───────────────────────────────────────────── */
window.subDaysLeft = function() {
  if(!window.SUB || !window.SUB.expires_at) return 0;
  return Math.max(0, Math.ceil((new Date(window.SUB.expires_at).getTime() - Date.now()) / 86400000));
};

window.subPercentLeft = function() {
  if(!window.SUB || !window.SUB.expires_at) return 0;
  const total = 365 * 86400000;
  const left  = Math.max(0, new Date(window.SUB.expires_at).getTime() - Date.now());
  return Math.max(0, Math.min(100, Math.round((left / total) * 100)));
};

window.subDaysOverdue = function() {
  if(!window.SUB || !window.SUB.expires_at) return 0;
  return Math.max(0, Math.ceil((Date.now() - new Date(window.SUB.expires_at).getTime()) / 86400000));
};

window.isSubActive = function() {
  if(!window.SUB || !window.SUB.loaded) return true;
  if(!window.SUB.expires_at) return false;
  return window.SUB.active === true && new Date(window.SUB.expires_at).getTime() > Date.now();
};

window.isSubExpiringSoon = function() {
  return isSubActive() && subDaysLeft() <= 7; // 7 days warning
};

window.isSubExpired = function() { 
  return !isSubActive(); 
};

window.subStatusColor = function() {
  if(isSubExpired()) return 'var(--danger)';
  if(subDaysLeft() <= 7) return 'var(--warning)';
  return 'var(--success)';
};

window.subStatusLabel = function() {
  if(isSubExpired()) return 'Expired';
  if(subDaysLeft() <= 7) return 'Expiring Soon';
  return 'Active';
};

/* ─────────────────────────────────────────────
   80. SIDEBAR PILL & TOP BANNER
   ───────────────────────────────────────────── */
window.renderSubSidebarPill = function() {
  const sidebar = document.querySelector('.sidebar');
  if(!sidebar) return;

  let pill = document.getElementById('sub-sidebar-pill');
  if(!pill) {
    pill = document.createElement('a');
    pill.id = 'sub-sidebar-pill';
    pill.href = '#/myshop';
    pill.style.cssText = 'display:block;margin:16px 16px 6px;padding:12px 14px;border-radius:12px;background:#F8F8FF;border:1px solid #E0E0F5;text-decoration:none;cursor:pointer;transition:background 0.15s;';
    
    const footer = sidebar.querySelector('.sidebar-footer');
    if(footer) sidebar.insertBefore(pill, footer);
    else sidebar.appendChild(pill);
  }

  if(!window.SUB || !SUB.loaded) {
    pill.style.display = 'none';
    return;
  }
  pill.style.display = 'block';

  const color = subStatusColor();
  const pct   = subPercentLeft();
  const days  = subDaysLeft();
  const label = days > 0 ? days + 'd' : 'Expired';

  pill.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:14px;">⭐</span>
        <span style="font-size:12px;font-weight:700;color:#111827;">Pro Plan</span>
      </div>
      <span style="font-size:10px;font-weight:700;color:${color};background:${color}22;padding:3px 8px;border-radius:6px;">${label}</span>
    </div>
    <div style="height:6px;background:#E5E7EB;border-radius:999px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:999px;"></div>
    </div>
    <div style="font-size:10px;color:#6B7280;margin-top:6px;font-weight:500;">${subStatusLabel()}</div>
  `;
};

window.renderSubTopBanner = function() {
  const mainWrap = document.querySelector('.main-wrap');
  if(!mainWrap) return;

  const content = mainWrap.querySelector('#content');
  if(!content) return;

  const existing = document.getElementById('sub-top-banner');
  if(existing) existing.remove();

  if(!window.SUB || !SUB.loaded) return;
  if(isSubActive() && !isSubExpiringSoon()) return;

  const expired  = isSubExpired();
  const pct      = subPercentLeft();
  const days     = subDaysLeft();
  const overdue  = subDaysOverdue();
  
  const barColor = expired ? 'var(--danger)' : 'var(--warning)';
  const textColor= expired ? '#991b1b' : '#92400e';
  const bg       = expired ? 'var(--danger-bg)' : 'var(--warning-bg)';
  const border   = expired ? 'var(--danger)' : 'var(--warning)';

  const banner = document.createElement('div');
  banner.id = 'sub-top-banner';
  banner.style.cssText = `margin:0;padding:14px 24px;background:${bg};border-bottom:1px solid ${border};`;

  banner.innerHTML = `
    <div style="max-width:1440px;margin:0 auto;display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="font-size:13px;font-weight:600;color:${textColor};">
          ⚠ ${expired ? 'Subscription expired' : 'Subscription ending soon'}
        </div>
        <button id="sub-banner-renew" style="background:var(--primary);color:#fff;border:none;padding:7px 16px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;">
          Renew Now ₹${SUB_PLAN_AMOUNT}
        </button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;height:6px;background:rgba(255,255,255,0.6);border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:999px;"></div>
        </div>
        <div style="font-size:11px;font-weight:600;color:${textColor};white-space:nowrap;">
          ${expired ? overdue + ' days overdue' : days + ' days left'}
        </div>
      </div>
    </div>
  `;

  mainWrap.insertBefore(banner, content);

  const btn = banner.querySelector('#sub-banner-renew');
  if(btn) btn.onclick = () => openSubscriptionModal();
};

window.updateSubscriptionUI = function() {
  try { renderSubSidebarPill(); } catch(e) { console.error(e); }
  try { renderSubTopBanner(); }   catch(e) { console.error(e); }
};

// Hook into layout render
const _origRenderLayout = window.renderLayout;
if(typeof _origRenderLayout === 'function') {
  window.renderLayout = function() {
    _origRenderLayout.apply(this, arguments);
    try { renderSubSidebarPill(); renderSubTopBanner(); } catch(e) {}
  };
}

/* ─────────────────────────────────────────────
   81. SUBSCRIPTION CARD (For My Shop)
   ───────────────────────────────────────────── */
function buildSubCardHTML() {
  if(!window.SUB || !SUB.loaded) return '';

  const pct          = subPercentLeft();
  const days         = subDaysLeft();
  const color        = subStatusColor();
  const status       = subStatusLabel();
  const expired      = isSubExpired();
  const overdue      = subDaysOverdue();
  const expiringSoon = isSubExpiringSoon();
  const expiresStr   = SUB.expires_at ? fmtDate(SUB.expires_at) : '—';
  const lastPaidStr  = SUB.last_paid_at ? fmtDate(SUB.last_paid_at) : 'First activation';
  
  const circumference = 2 * Math.PI * 32;
  const dash          = (pct / 100) * circumference;

  let btnText, btnId;
  if(expired)          { btnText = 'Subscribe Now ₹' + SUB_PLAN_AMOUNT; btnId = 'sub-main-btn'; }
  else if(expiringSoon){ btnText = 'Renew Now ₹' + SUB_PLAN_AMOUNT;    btnId = 'sub-main-btn'; }
  else                 { btnText = 'Manage Subscription';                btnId = 'sub-manage-btn'; }

  return `
    <div class="card" id="sub-card-root" style="margin-bottom:20px;padding:24px;">
      <div style="display:flex;gap:20px;align-items:center;margin-bottom:20px;">
        <div style="position:relative;width:80px;height:80px;flex-shrink:0;">
          <svg width="80" height="80" viewBox="0 0 80 80" style="transform:rotate(-90deg);">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--border)" stroke-width="7"/>
            <circle cx="40" cy="40" r="32" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference - dash}"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
            <div style="font-size:16px;font-weight:800;color:${color};line-height:1;">${pct}%</div>
            <div style="font-size:8px;color:var(--text-muted);margin-top:1px;">LEFT</div>
          </div>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:700;color:var(--text-main);margin-bottom:8px;">Pro Plan</div>
          <span style="display:inline-block;background:${color}22;color:${color};font-size:10px;font-weight:700;padding:4px 12px;border-radius:999px;border:1px solid ${color}44;">
            ● ${status.toUpperCase()}
          </span>
        </div>
      </div>
      
      <div style="font-size:12px;color:var(--text-muted);line-height:2;margin-bottom:20px;padding:14px;background:var(--bg-app);border-radius:var(--radius-md);border:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;"><span>Plan</span><b style="color:var(--text-main);">₹${SUB_PLAN_AMOUNT} / year</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Expires</span><b style="color:var(--text-main);">${expiresStr}</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Remaining</span>${expired ? `<b style="color:var(--danger);">Overdue ${overdue}d</b>` : `<b style="color:${color};">${days} days</b>`}</div>
        <div style="display:flex;justify-content:space-between;"><span>Last paid</span><b style="color:var(--text-main);font-size:11px;">${lastPaidStr}</b></div>
      </div>
      
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="${btnId}" class="btn btn-primary" style="flex:1;justify-content:center;font-weight:600;">${btnText}</button>
      </div>
    </div>
  `;
}

// Hook into My Shop render
const _origRenderMyShop = window.renderMyShop;
if(typeof _origRenderMyShop === 'function') {
  window.renderMyShop = function(content) {
    _origRenderMyShop.apply(this, arguments);
    try {
      const slot = content.querySelector('#sub-card-slot');
      if(!slot) return;
      
      const old = content.querySelector('#sub-card-root');
      if(old) old.remove();

      const wrap = document.createElement('div');
      wrap.innerHTML = buildSubCardHTML();
      if(wrap.firstElementChild) {
        slot.parentNode.insertBefore(wrap.firstElementChild, slot);
      }

      const mainBtn = content.querySelector('#sub-main-btn');
      if(mainBtn) mainBtn.onclick = () => openSubscriptionModal();

      const mgBtn = content.querySelector('#sub-manage-btn');
      if(mgBtn) mgBtn.onclick = () => openSubscriptionManageModal();

    } catch(e) {
      console.warn('[SUB] card inject failed:', e);
    }
  };
}

/* ─────────────────────────────────────────────
   82. UPI QR GENERATOR (Local)
   ───────────────────────────────────────────── */
function buildUpiString(amount, note) {
  const amt = Number(amount).toFixed(2);
  const tn  = encodeURIComponent((note || 'Subscription').substring(0, 50));
  const pn  = encodeURIComponent(SUB_OWNER_NAME || 'MediStore');
  return `upi://pay?pa=${SUB_OWNER_UPI}&pn=${pn}&am=${amt}&cu=INR&tn=${tn}`;
}

async function generateQRBase64(text) {
  if(typeof QRCode === 'undefined') {
    console.error('QRCode library not loaded');
    return '';
  }
  try {
    return await QRCode.toDataURL(text, { width: 400, margin: 2, color: { dark: '#1E1E3A', light: '#FFFFFF' } });
  } catch(err) {
    console.error('QR generation failed', err);
    return '';
  }
}

/* ─────────────────────────────────────────────
   83. MODALS (Subscribe, Manage, Expired)
   ───────────────────────────────────────────── */
window.openSubscriptionModal = async function() {
  const upiStr = buildUpiString(SUB_PLAN_AMOUNT, 'MediStore Subscription');
  const qrUrl  = await generateQRBase64(upiStr);

  const waText = encodeURIComponent(
    'Hi, I have paid ₹' + SUB_PLAN_AMOUNT + ' for the MediStore subscription.\n\nShop: ' +
    (SETTINGS.shop_name || '') + '\nUPI: ' + SUB_OWNER_UPI + '\n\nPlease activate.'
  );
  const waLink = `https://wa.me/${window.APP_CONFIG.SUB_SUPPORT_WHATSAPP}?text=${waText}`;

  openModal(`
    <div class="modal-header">
      <div>
        <div class="modal-title">Subscribe to Pro</div>
        <div class="text-xs text-muted" style="margin-top:2px;">Pay ₹${SUB_PLAN_AMOUNT} for 1 year of unlimited access.</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
        <div style="flex:0 0 240px;text-align:center;">
          <div style="background:#fff;padding:16px;border-radius:var(--radius-lg);border:1px solid var(--border);display:inline-block;">
            ${qrUrl 
              ? `<img src="${qrUrl}" style="width:200px;height:200px;display:block;border-radius:6px;" alt="UPI QR">`
              : '<div style="width:200px;height:200px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px;">QR unavailable</div>'
            }
          </div>
          <div class="text-sm fw-600" style="color:var(--primary);margin-top:12px;">Scan to pay ₹${SUB_PLAN_AMOUNT}</div>
        </div>
        
        <div style="flex:1;min-width:240px;">
          <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:8px;">Or pay to this UPI ID</div>
          
          <div style="background:var(--bg-app);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
            <code style="font-size:14px;color:var(--text-main);font-weight:600;font-family:monospace;word-break:break-all;">${esc(SUB_OWNER_UPI)}</code>
            <button id="sub-copy-upi" class="btn btn-ghost btn-sm">📋 Copy</button>
          </div>
          
          <div class="text-sm text-muted" style="margin-bottom:16px;">Receiver: <b style="color:var(--text-main);">${esc(SUB_OWNER_NAME)}</b></div>
          
          <div class="text-sm" style="color:var(--text-muted);line-height:1.9;margin-bottom:20px;padding:14px;background:var(--bg-app);border-radius:var(--radius-md);border-left:3px solid var(--primary);">
            <b style="color:var(--text-main);">How to activate:</b><br>
            1. Pay ₹${SUB_PLAN_AMOUNT} via any UPI app<br>
            2. Send the payment screenshot on WhatsApp<br>
            3. Activated within a few hours
          </div>
          
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="${esc(waLink)}" target="_blank" rel="noopener noreferrer" class="btn" style="background:#25D366;color:#fff;font-weight:600;">
              💬 Send screenshot on WhatsApp
            </a>
            <button class="btn btn-ghost" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>
    </div>
  `, (root) => {
    const copyBtn = root.querySelector('#sub-copy-upi');
    if(copyBtn) copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(SUB_OWNER_UPI);
        toast('UPI ID copied', 'success');
      } catch(e) {
        prompt('Copy this UPI ID:', SUB_OWNER_UPI);
      }
    };
  });
};

window.openSubscriptionManageModal = function() {
  if(!window.SUB || !SUB.loaded) return;

  const expiresStr  = SUB.expires_at ? fmtDate(SUB.expires_at) : '—';
  const lastPaidStr = SUB.last_paid_at ? fmtDate(SUB.last_paid_at) : 'First activation';
  const days        = subDaysLeft();

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Your Subscription</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      <div style="background:var(--bg-app);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;font-size:13px;line-height:2;color:var(--text-muted);">
        <div style="display:flex;justify-content:space-between;"><span>Status</span><b style="color:var(--success);">● Active</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Plan</span><b style="color:var(--text-main);">₹${SUB_PLAN_AMOUNT} / year</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Expires</span><b style="color:var(--text-main);">${expiresStr}</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Days remaining</span><b style="color:var(--primary);">${days} days</b></div>
        <div style="display:flex;justify-content:space-between;"><span>Last paid</span><b style="color:var(--text-main);">${lastPaidStr}</b></div>
      </div>
    </div>
    
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>
  `);
};

window.openSubscriptionExpiredModal = function() {
  const overdue = subDaysOverdue();

  const waText = encodeURIComponent(
    'Hi, I have paid ₹' + SUB_PLAN_AMOUNT + ' for renewal. Please activate.\nShop: ' + (SETTINGS.shop_name || '')
  );
  const waLink = `https://wa.me/${window.APP_CONFIG.SUB_SUPPORT_WHATSAPP}?text=${waText}`;

  openModal(`
    <div class="modal-header" style="background:var(--danger-bg);border-bottom-color:var(--danger);">
      <div>
        <div class="modal-title" style="color:var(--danger);">⚠ Subscription Expired</div>
        <div class="text-xs" style="color:#991b1b;margin-top:2px;">Renew to continue saving new data.</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body" style="padding:32px 24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
      
      <div style="font-size:16px;font-weight:700;color:var(--text-main);margin-bottom:8px;">
        Renew for ₹${SUB_PLAN_AMOUNT}
      </div>
      <div class="text-sm text-muted" style="margin-bottom:24px;">
        We will activate within a few hours after we receive your screenshot.
      </div>
      
      <div style="background:var(--bg-app);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:24px;">
        <code style="font-size:14px;color:var(--text-main);font-weight:600;font-family:monospace;word-break:break-all;">${esc(SUB_OWNER_UPI)}</code>
        <button id="sub-exp-copy" class="btn btn-ghost btn-sm">📋 Copy</button>
      </div>
      
      <div class="text-sm text-muted" style="margin-bottom:24px;">Receiver: <b style="color:var(--text-main);">${esc(SUB_OWNER_NAME)}</b></div>
      
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <a href="${esc(waLink)}" target="_blank" rel="noopener noreferrer" class="btn" style="background:#25D366;color:#fff;font-weight:600;">💬 WhatsApp us</a>
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      </div>
    </div>
    
    <div style="margin-top:16px;padding:16px;border-top:1px solid var(--border);text-align:center;font-size:12px;color:var(--text-muted);line-height:1.9;">
      <div style="color:var(--danger);font-weight:600;margin-bottom:4px;">⚠ Overdue by ${overdue} day${overdue === 1 ? '' : 's'}</div>
      <div>Your existing data is safe. New entries are paused until renewal.</div>
    </div>
  `, (root) => {
    const copyBtn = root.querySelector('#sub-exp-copy');
    if(copyBtn) copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(SUB_OWNER_UPI);
        toast('UPI ID copied', 'success');
      } catch(e) {
        prompt('Copy this UPI ID:', SUB_OWNER_UPI);
      }
    };
  });
};

/* ─────────────────────────────────────────────
   84. WRITE GUARDS
   ───────────────────────────────────────────── */
function wrapGuard(fn) {
  return function() {
    if(!isSubActive()) {
      openSubscriptionExpiredModal();
      return;
    }
    return fn.apply(this, arguments);
  };
}

const GUARDED_FUNCTIONS = [
  'openCustomerForm',
  'openDoctorForm',
  'openProductForm',
  'openSupplierForm',
  'openPurchaseBillForm',
  'openSupplierPaymentForm',
  'openCustomerPaymentForm',
  'openExpenseForm',
  'openRestockForm',
  'openQuickProductForm',
  'openBatchForm',
  'openBatchPicker'
];

GUARDED_FUNCTIONS.forEach(function(name) {
  const orig = window[name];
  if(typeof orig === 'function') {
    window[name] = wrapGuard(orig);
  }
});

// Global click interceptor for critical buttons
document.addEventListener('click', function(e) {
  if(isSubActive()) return;

  const t = e.target.closest(
    '[data-del],[data-del-batch],[data-bill-del],[data-spay-del],[data-rt-del],[data-pay-del],' +
    '#btn-del-inv,#btn-export,#btn-restore,#ni-save,#ni-save-print,#rtc-submit,#rts-submit,' +
    '#btn-local-print,#btn-bt-print,#btn-usb-print,#btn-pdf'
  );
  if(t) {
    e.preventDefault();
    e.stopPropagation();
    openSubscriptionExpiredModal();
  }
}, true);

console.log('[MediStore] Core Logic Block 19 loaded');
/* ─────────────────────────────────────────────
   85. MISSING PAGES (Reports & Stock Audit)
   ───────────────────────────────────────────── */
function renderReports(content) {
  const today = todayStr();
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Reports</h1>
        <p>Filter and export business data</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="btn-export-report">📄 Export PDF</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
      <div style="flex:1;min-width:140px;">
        <label class="label">From</label>
        <input class="input" type="date" id="r-from" value="${firstOfMonth}" max="${today}">
      </div>
      <div style="flex:1;min-width:140px;">
        <label class="label">To</label>
        <input class="input" type="date" id="r-to" value="${today}" max="${today}">
      </div>
      <div style="flex:0 0 auto;">
        <label class="label">&nbsp;</label>
        <button class="btn btn-primary" id="r-load">Load</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;padding:12px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" data-rp="today">Today</button>
        <button class="btn btn-ghost btn-sm" data-rp="week">This Week</button>
        <button class="btn btn-ghost btn-sm" data-rp="month">This Month</button>
        <button class="btn btn-ghost btn-sm" data-rp="year">This Year</button>
        <button class="btn btn-ghost btn-sm" data-rp="all">All Time</button>
      </div>
    </div>

    <div class="grid-4" id="r-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;"></div>

    <div class="card">
      <div class="card-title">Invoices in range</div>
      <div class="table-wrap" style="border:0;box-shadow:none;">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Date</th>
              <th style="text-align:right">Total</th>
              <th style="text-align:right">Paid</th>
              <th style="text-align:right">Due</th>
            </tr>
          </thead>
          <tbody id="r-body"></tbody>
        </table>
      </div>
      <div class="mobile-list" id="r-mobile"></div>
    </div>
  `;

  function load() {
    const from = $('#r-from').value;
    const to   = $('#r-to').value;
    if(!from || !to) { toast('Pick both dates', 'error'); return; }
    if(from > to) { toast('From cannot be after To', 'error'); return; }

    const invs = DB.invoices.filter(i => !String(i.invoice_no || '').startsWith(RETURN_PREFIX) && txDate(i, 'invoice_date') >= from && txDate(i, 'invoice_date') <= to);
    const purs = DB.supplier_invoices.filter(b => txDate(b, 'bill_date') >= from && txDate(b, 'bill_date') <= to);
    const exps = DB.expenses.filter(e => txDate(e, 'expense_date') >= from && txDate(e, 'expense_date') <= to);
    const pays = DB.payments.filter(p => txDate(p, 'payment_date') >= from && txDate(p, 'payment_date') <= to);
    const rets = DB.returns.filter(r => txDate(r, 'return_date') >= from && txDate(r, 'return_date') <= to);

    const totalSales    = invs.reduce((s, i) => s + Number(i.total || 0), 0);
    const totalDue      = invs.reduce((s, i) => s + Number(i.due || 0), 0);
    const totalPur      = purs.reduce((s, b) => s + Number(b.total || 0), 0);
    const totalExp      = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
    const payEntries    = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
    const payAtInvoice  = invs.reduce((s, i) => s + Number(i.paid || 0), 0);
    const totalReceived = payEntries + payAtInvoice;
    const totalReturned = rets.reduce((s, r) => s + Number(r.amount || 0), 0);

    $('#r-stats').innerHTML = `
      <div class="kpi-card"><div class="kpi-card-top"><div class="kpi-label">Sales</div><div class="kpi-icon" style="color:var(--primary);background:var(--primary-light);">💰</div></div><div class="kpi-value">${rs(totalSales)}</div><div class="kpi-trend text-muted">${invs.length} invoice${invs.length === 1 ? '' : 's'}</div></div>
      <div class="kpi-card"><div class="kpi-card-top"><div class="kpi-label">Received</div><div class="kpi-icon" style="color:var(--success);background:var(--success-bg);">✅</div></div><div class="kpi-value" style="color:var(--success);">${rs(totalReceived)}</div><div class="kpi-trend text-muted">${pays.length} payment${pays.length === 1 ? '' : 's'}</div></div>
      <div class="kpi-card"><div class="kpi-card-top"><div class="kpi-label">Purchases</div><div class="kpi-icon" style="color:var(--warning);background:var(--warning-bg);">📦</div></div><div class="kpi-value">${rs(totalPur)}</div><div class="kpi-trend text-muted">${purs.length} bill${purs.length === 1 ? '' : 's'}</div></div>
      <div class="kpi-card"><div class="kpi-card-top"><div class="kpi-label">Expenses</div><div class="kpi-icon" style="color:var(--danger);background:var(--danger-bg);">💸</div></div><div class="kpi-value">${rs(totalExp)}</div><div class="kpi-trend text-muted">${exps.length} entr${exps.length === 1 ? 'y' : 'ies'}</div></div>
    `;

    const sorted = invs.slice().sort((a, b) => txDate(b, 'invoice_date').localeCompare(txDate(a, 'invoice_date')));
    
    $('#r-body').innerHTML = sorted.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No invoices in this range</td></tr>`
      : sorted.map(i => `
          <tr>
            <td><a href="#/invoice/${i.id}" style="font-weight:600;color:var(--text-main);text-decoration:none;">${esc(i.invoice_no || '')}</a></td>
            <td>${esc(i.customer_name || 'Walk-in')}</td>
            <td class="text-sm text-muted">${txDT(i, 'invoice_date')}</td>
            <td style="text-align:right;">${rs(i.total)}</td>
            <td style="text-align:right;color:var(--success);">${rs(i.paid)}</td>
            <td style="text-align:right;color:${Number(i.due) > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${rs(i.due)}</td>
          </tr>`).join('');

    $('#r-mobile').innerHTML = sorted.length === 0
      ? `<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">No invoices</div></div>`
      : sorted.map(i => `
          <a href="#/invoice/${i.id}" class="mobile-card" style="text-decoration:none;color:inherit;">
            <div class="mobile-card-head">
              <div>
                <div class="mobile-card-title">${esc(i.customer_name || 'Walk-in')}</div>
                <div class="mobile-card-sub">${esc(i.invoice_no || '')} · ${fmtDate(txDate(i, 'invoice_date'))}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:700;">${rs(i.total)}</div>
                <div class="text-xs" style="color:${Number(i.due) > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600;margin-top:2px;">${Number(i.due) > 0 ? 'Due ' + rs(i.due) : 'Paid'}</div>
              </div>
            </div>
          </a>`).join('');
  }

  $$('#content [data-rp]').forEach(b => b.onclick = () => {
    const p = b.dataset.rp;
    const t = todayStr();
    if(p === 'today') { $('#r-from').value = t; $('#r-to').value = t; }
    else if(p === 'week') { const d = new Date(); const day = d.getDay() || 7; const mon = new Date(d); mon.setDate(d.getDate() - day + 1); $('#r-from').value = mon.toISOString().slice(0,10); $('#r-to').value = t; }
    else if(p === 'month') { $('#r-from').value = firstOfMonth; $('#r-to').value = t; }
    else if(p === 'year') { $('#r-from').value = new Date().getFullYear() + '-01-01'; $('#r-to').value = t; }
    else if(p === 'all') { $('#r-from').value = '2000-01-01'; $('#r-to').value = t; }
    load();
  });

  $('#r-load').onclick = load;
  $('#btn-export-report').onclick = () => PDFMaker.auto('Sales Report');
  load();
}

function renderStockAudit(content) {
  const today = todayStr();
  const batches = DB.product_batches.filter(b => Number(b.qty) > 0 || b.expiry_date >= today);

  content.innerHTML = `
    <div class="page-head">
      <div class="page-head-title">
        <h1>Stock Audit</h1>
        <p>Physical verification of stock</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" id="audit-save">Save Audit</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Instructions</div>
      <p class="text-sm text-muted">Enter the <b>actual physical quantity</b> you counted for each batch. If you leave it blank, it will be skipped. The system will automatically adjust the stock difference.</p>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Batch</th>
            <th>Expiry</th>
            <th style="text-align:right">System Qty</th>
            <th style="text-align:right">Actual Qty</th>
            <th style="text-align:right">Variance</th>
          </tr>
        </thead>
        <tbody id="audit-body"></tbody>
      </table>
    </div>
  `;

  const tbody = $('#audit-body');
  tbody.innerHTML = batches.map(b => {
    const prod = DB.products.find(p => p.id === b.product_id);
    if(!prod) return '';
    return `
      <tr data-bid="${b.id}">
        <td><strong>${esc(prod.name)}</strong></td>
        <td><span class="chip chip-neutral" style="font-family:monospace">${esc(b.batch_no || '—')}</span></td>
        <td>${fmtDate(b.expiry_date)}</td>
        <td style="text-align:right;font-weight:600;">${fmtNum(b.qty)}</td>
        <td style="text-align:right;">
          <input class="input" type="number" step="any" data-actual="${b.id}" data-sys="${b.qty}" style="width:100px;text-align:right;display:inline-block;" placeholder="Count...">
        </td>
        <td class="variance-cell" style="text-align:right;font-weight:600;">—</td>
      </tr>
    `;
  }).join('');

  $$('[data-actual]').forEach(inp => {
    inp.oninput = (e) => {
      const sys = Number(e.target.dataset.sys);
      const act = Number(e.target.value);
      const cell = e.target.closest('tr').querySelector('.variance-cell');
      
      if(e.target.value === '') { cell.textContent = '—'; cell.style.color = 'var(--text-muted)'; return; }
      
      const diff = act - sys;
      if(diff === 0) {
        cell.textContent = '0';
        cell.style.color = 'var(--success)';
      } else {
        cell.textContent = (diff > 0 ? '+' : '') + fmtNum(diff);
        cell.style.color = 'var(--danger)';
      }
    };
  });

  $('#audit-save').onclick = async () => {
    const btn = $('#audit-save');
    btn.disabled = true; btn.textContent = 'Saving...';

    let updated = 0;
    const inputs = $$('[data-actual]');
    
    for(const inp of inputs) {
      if(inp.value === '') continue;
      
      const bid = inp.dataset.actual;
      const sys = Number(inp.dataset.sys);
      const act = Number(inp.value);
      const diff = act - sys;

      if(diff !== 0) {
        await adjustBatchQty(bid, diff);
        updated++;
      }
    }

    await syncDB();
    toast(updated + ' batches adjusted', 'success');
    route();
  };
}

/* ─────────────────────────────────────────────
   86. ROUTE PARSER
   ───────────────────────────────────────────── */
function parseRoute() {
  const raw   = location.hash || '#/';
  const parts = raw.slice(1).split('?');
  const path  = parts[0] || '/';
  const query = {};
  if(parts[1]) {
    new URLSearchParams(parts[1]).forEach((v, k) => { query[k] = v; });
  }
  const segs = path.split('/').filter(Boolean);
  let id = null;
  if(segs.length >= 2) id = segs[1];
  return { path, segs, id, query };
}

/* ─────────────────────────────────────────────
   87. MAIN ROUTER
   ───────────────────────────────────────────── */
async function route() {
  const app = $('#app');
  if(!app) return;

  if(!SESSION) {
    renderLogin();
    return;
  }

  if(window.DB_SYNCED !== true) {
    app.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;"><div class="spinner"></div></div>';
    await syncDB();
    await loadSubscription();
  }

  renderLayout();
  const content = $('#content');
  const title   = $('#topbar-title');
  if(!content) return;
  if(title) title.textContent = currentPageTitle();

  const { path, segs, id, query } = parseRoute();

  try {
    // Profile routes
    if(segs[0] === 'customer' && id) return await renderCustomerProfile(content, id);
    if(segs[0] === 'doctor'   && id) return await renderDoctorProfile(content, id);
    if(segs[0] === 'company'  && id) return await renderSupplierProfile(content, id);
    if(segs[0] === 'supplier' && id) return await renderSupplierProfile(content, id);
    if(segs[0] === 'invoice'  && id) return await renderInvoiceView(content, id);

    // Top-level routes
    if(path === '/')             return renderDashboard(content);
    if(path === '/analytics')    return renderAnalytics(content);
    if(path === '/shop-health')  return renderShopHealth(content);
    if(path === '/customers')    return renderCustomers(content);
    if(path === '/doctors')      return renderDoctors(content);
    if(path === '/companies')    return renderCompanies(content);
    if(path === '/suppliers')    return renderSuppliers(content);
    if(path === '/products')     return renderProducts(content);
    if(path === '/batches')      return renderBatches(content);
    if(path === '/purchases')    return renderPurchases(content);
    if(path === '/inventory-value') return renderInventoryValue(content);
    if(path === '/stock-audit')  return renderStockAudit(content);
    if(path === '/invoices')     return renderInvoices(content);
    if(path === '/new-invoice')  return renderNewInvoice(content, { customer_id: query.customer || null, doctor_id: query.doctor || null });
    if(path === '/returns')      return renderReturns(content);
    if(path === '/expenses')     return renderExpenses(content);
    if(path === '/reports')      return renderReports(content);
    if(path === '/pnl')          return renderPnL(content);
    if(path === '/margin')       return renderMargin(content);
    if(path === '/myshop')       return renderMyShop(content);
    if(path === '/backup')       return renderBackup(content);

    // Fallback
    return renderDashboard(content);

  } catch(err) {
    console.error('[route]', err);
    content.innerHTML = `
      <div class="card" style="border-color:var(--danger);">
        <div style="color:var(--danger);font-weight:700;margin-bottom:6px;">Something went wrong</div>
        <div class="text-sm text-muted">${esc(err.message || String(err))}</div>
        <div style="margin-top:12px;"><button class="btn btn-ghost btn-sm" onclick="location.reload()">Reload</button></div>
      </div>
    `;
  }
}

/* ─────────────────────────────────────────────
   88. EVENT LISTENERS & BOOT
   ───────────────────────────────────────────── */
// Keyboard Shortcut for New Invoice (Ctrl+N or Cmd+N)
window.addEventListener('keydown', (e) => {
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    location.hash = '#/new-invoice';
  }
});

window.addEventListener('hashchange', () => { route(); });

document.addEventListener('visibilitychange', () => {
  if(!document.hidden && window.SUB && SUB.loaded) {
    try { updateSubscriptionUI(); } catch(e) {}
  }
});

// Boot Sequence
(async function boot() {
  try {
    applyFavicon();

    const app = $('#app');
    if(app) {
      app.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;"><div class="spinner"></div><div style="color:var(--text-muted);font-size:14px;">Connecting...</div></div>';
    }

    // Load theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    await initAuth();

    if(SESSION) {
      await syncDB();
      await loadSubscription();
    }

    await route();

    console.log('[MediStore] App booted successfully');
  } catch(err) {
    console.error('[boot] fatal:', err);
    const app = $('#app');
    if(app) {
      app.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;">
          <div>
            <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
            <div style="font-size:18px;font-weight:700;margin-bottom:6px;">Could not start</div>
            <div class="text-sm text-muted" style="max-width:400px;margin:0 auto 16px;">${esc(err.message || String(err))}</div>
            <button class="btn btn-primary" onclick="location.reload()">Try Again</button>
          </div>
        </div>
      `;
    }
  }
})();

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  try { if(window.BluetoothPrinter && BluetoothPrinter.isConnected && BluetoothPrinter.isConnected()) BluetoothPrinter.disconnect(); } catch(e) {}
  try { if(window.USBPrinter && USBPrinter.isConnected && USBPrinter.isConnected()) USBPrinter.disconnect(); } catch(e) {}
});

console.log('[MediStore] Core Logic Block 20 loaded · APP READY');
/* ─────────────────────────────────────────────
   DOMAIN & AI SCANNER MODALS
   ───────────────────────────────────────────── */
window.openDomainModal = function(suggestedDomain) {
  const supportPhone = window.APP_CONFIG.SUB_SUPPORT_WHATSAPP || '918637560557';
  
  const makeWaLink = (planName, price) => {
    const msg = `Hi, I want to claim a domain for my shop (${SETTINGS.shop_name || 'MediStore'}).\n\nPlan: ${planName}\nDomain: ${suggestedDomain}\nPrice: ${price}\n\nPlease guide me on how to proceed.`;
    return `https://wa.me/${supportPhone}?text=${encodeURIComponent(msg)}`;
  };

  openModal(`
    <style>
      @keyframes pulseGlow {
        0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
        100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
      }
      .ai-banner {
        background: linear-gradient(135deg, #064E3B 0%, #022C22 100%);
        border: 1px solid #10B981;
        border-radius: var(--radius-lg);
        padding: 16px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        animation: pulseGlow 2s infinite;
        transition: transform 0.2s;
      }
      .ai-banner:hover { transform: translateY(-2px); }
      .domain-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .domain-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: 16px;
        background: var(--bg-card);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
    </style>

    <div class="modal-header">
      <div>
        <div class="modal-title" style="font-size: 20px;">🌐 Domains</div>
        <div class="text-xs text-muted" style="margin-top:2px;">Get your own professional address.</div>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    
    <div class="modal-body">
      
      <!-- ANIMATED AI SCANNER BANNER -->
      <div class="ai-banner" onclick="openAIScannerModal()">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="background:rgba(16, 185, 129, 0.2); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px;">
            ✨
          </div>
          <div>
            <div style="color:#34D399; font-weight:700; font-size:14px; display:flex; align-items:center; gap:6px;">
              NEW: AI Invoice Scanner
              <span style="background:#10B981; color:#fff; font-size:9px; padding:2px 6px; border-radius:4px; letter-spacing:0.5px;">AUTO-STOCK</span>
            </div>
            <div style="color:#A7F3D0; font-size:12px; margin-top:2px;">Automatically scan bills and add stock.</div>
          </div>
        </div>
        <div style="color:#34D399; font-size:18px;">→</div>
      </div>

      <!-- DOMAIN PLANS -->
      <div class="domain-grid">
        
        <div class="domain-card">
          <div>
            <div style="font-weight:700; font-size:15px; color:var(--text-main);">.in Domain</div>
            <div class="text-xs text-muted" style="margin-top:2px;">yourshop.in</div>
          </div>
          <div style="margin-top:16px;">
            <div style="color:#10B981; font-weight:700; font-size:14px;">₹1,299</div>
            <div class="text-xs text-muted">+ ₹999/yr</div>
            <a href="${makeWaLink('.in Domain', '₹1,299 + ₹999/yr')}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-top:12px; width:100%; justify-content:space-between;">
              Claim <span>→</span>
            </a>
          </div>
        </div>

        <div class="domain-card">
          <div>
            <div style="font-weight:700; font-size:15px; color:var(--text-main);">.com Domain</div>
            <div class="text-xs text-muted" style="margin-top:2px;">yourshop.com</div>
          </div>
          <div style="margin-top:16px;">
            <div style="color:#10B981; font-weight:700; font-size:14px;">₹1,799</div>
            <div class="text-xs text-muted">+ ₹1,599/yr</div>
            <a href="${makeWaLink('.com Domain', '₹1,799 + ₹1,599/yr')}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-top:12px; width:100%; justify-content:space-between;">
              Claim <span>→</span>
            </a>
          </div>
        </div>

        <div class="domain-card">
          <div>
            <div style="font-weight:700; font-size:15px; color:var(--text-main);">Subdomain</div>
            <div class="text-xs text-muted" style="margin-top:2px;">yourshop.shopsteward.in</div>
          </div>
          <div style="margin-top:16px;">
            <div style="color:#10B981; font-weight:700; font-size:14px;">₹699</div>
            <div class="text-xs text-muted">+ ₹299/yr</div>
            <a href="${makeWaLink('Subdomain', '₹699 + ₹299/yr')}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-top:12px; width:100%; justify-content:space-between;">
              Claim <span>→</span>
            </a>
          </div>
        </div>

        <div class="domain-card">
          <div>
            <div style="font-weight:700; font-size:15px; color:var(--text-main);">Custom TLD</div>
            <div class="text-xs text-muted" style="margin-top:2px;">Any extension</div>
          </div>
          <div style="margin-top:16px;">
            <div style="color:#10B981; font-weight:700; font-size:14px;">Variable</div>
            <div class="text-xs text-muted">&nbsp;</div>
            <a href="${makeWaLink('Custom TLD', 'Variable (Need Quote)')}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-top:12px; width:100%; justify-content:space-between;">
              Ask <span>→</span>
            </a>
          </div>
        </div>

      </div>
    </div>
    
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>
  `);
};

window.openAIScannerModal = function() {
  const supportPhone = window.APP_CONFIG.SUB_SUPPORT_WHATSAPP || '918637560557';
  
  const waText = encodeURIComponent(
    `Hi, I want a quote for the AI Invoice Scanner.\n\nShop: ${SETTINGS.shop_name || 'MediStore'}\nPlan: Annual Plan (₹7,999)\n\nPlease guide me on how to activate this.`
  );
  const waLink = `https://wa.me/${supportPhone}?text=${waText}`;

  openModal(`
    <div class="modal-header" style="background:#0B1311; border-bottom: 1px solid #1F2937;">
      <div>
        <div class="modal-title" style="color:#fff; display:flex; align-items:center; gap:8px;">
          <span style="background:#10B981; color:#000; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:800; letter-spacing:0.5px;">AI INVOICE SCANNER</span>
        </div>
      </div>
      <button class="modal-close" onclick="closeModal()" style="color:#9CA3AF;">✕</button>
    </div>
    
    <div class="modal-body" style="background:#0B1311; padding:0;">
      <div style="display:flex; flex-direction:column;">
        
        <div style="padding:24px; border-bottom:1px solid #1F2937;">
          <h3 style="color:#fff; font-size:16px; font-weight:700; margin-bottom:16px;">What it extracts:</h3>
          <ul style="list-style:none; padding:0; margin:0; color:#D1D5DB; font-size:13px; display:flex; flex-direction:column; gap:10px;">
            <li><b>Supplier Details:</b> Company name, address, GSTIN.</li>
            <li><b>Invoice Info:</b> Invoice number, date, and totals.</li>
            <li><b>Product Data:</b> Item names, quantities, units, and purchase rates.</li>
            <li><b>Tax Breakdown:</b> Tax amounts and line-item totals.</li>
          </ul>
        </div>

        <div style="padding:24px; background:#111C18;">
          <div style="display:inline-block; background:#1F2937; color:#34D399; font-size:10px; font-weight:700; padding:4px 10px; border-radius:999px; margin-bottom:12px;">ANNUAL PLAN</div>
          
          <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:4px;">
            <span style="font-size:32px; font-weight:800; color:#fff;">₹7,999</span>
            <span style="color:#9CA3AF; font-size:14px;">/year</span>
          </div>
          
          <div style="color:#9CA3AF; font-size:12px; margin-bottom:16px;">+ applicable GST</div>
          
          <div style="border:1px dashed #065F46; color:#34D399; padding:8px 12px; border-radius:6px; font-size:12px; margin-bottom:20px; display:inline-block;">
            That's just <b>₹22 / day</b> to automate your invoices.
          </div>
          
          <ul style="list-style:none; padding:0; margin:0 0 24px 0; color:#D1D5DB; font-size:13px; display:flex; flex-direction:column; gap:8px;">
            <li style="display:flex; gap:8px;"><span style="color:#34D399;">+</span> Up to 100 invoice scans per month</li>
            <li style="display:flex; gap:8px;"><span style="color:#34D399;">+</span> Unused scans do not carry forward</li>
          </ul>

          <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn" style="width:100%; justify-content:center; background:#065F46; color:#fff; border:none; font-weight:600;">
            GET A QUOTE →
          </a>
        </div>

      </div>
      
      <div style="padding:16px 24px; background:#0B1311; border-top:1px solid #1F2937;">
        <div style="display:flex; gap:12px; align-items:flex-start;">
          <span style="color:#F59E0B; font-size:16px;">⚠</span>
          <div>
            <div style="color:#F59E0B; font-weight:700; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Invoice Eligibility Note:</div>
            <div style="color:#9CA3AF; font-size:11px; line-height:1.5;">
              AI Invoice Scanner works best with clear, readable images of printed supplier invoices. Handwritten, blurry, damaged, incomplete, or unusually formatted invoices may not be processed accurately and may require manual entry or correction.
            </div>
          </div>
        </div>
      </div>

    </div>
    
    <div class="modal-footer" style="background:#0B1311; border-top:1px solid #1F2937;">
      <button class="btn btn-ghost" onclick="openDomainModal('${SETTINGS.shop_name ? SETTINGS.shop_name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'myshop'}.com')" style="color:#9CA3AF; border-color:#374151;">← Back to Domains</button>
      <button class="btn btn-ghost" onclick="closeModal()" style="color:#9CA3AF; border-color:#374151;">Close</button>
    </div>
  `);
};
