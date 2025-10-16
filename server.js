import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { nanoid } from 'nanoid';

// ====== CONFIG ======
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || 'supersecretkey'; // change in production
const ORIGIN = process.env.CORS_ORIGIN || '*'; // set your frontend origin for production

// ====== DB SETUP ======
const db = new Low(new JSONFile('./data.json'), { dramas: [] });
await db.read();
if (!db.data) db.data = { dramas: [] };
await db.write();

// ====== APP SETUP ======
const app = express();
app.use(helmet());
app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: '2mb' }));

// ====== MIDDLEWARE: simple API key for write operations ======
function requireKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ====== UTILS ======
function paginate(array, page = 1, limit = 24) {
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    items: array.slice(start, end),
    page,
    limit,
    total: array.length,
    pages: Math.ceil(array.length / limit)
  };
}

// ====== ROUTES ======
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'Drama Catalog API', version: '1.0.0' });
});

// List + search + filter + sort + pagination
app.get('/api/dramas', async (req, res) => {
  await db.read();
  const {
    search = '',
    genre,
    status,
    min_year,
    max_year,
    sort = 'updated_at:desc',
    page = '1',
    limit = '24'
  } = req.query;

  let list = [...db.data.dramas];

  // search in title & description
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(d =>
      d.title?.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q)
    );
  }

  if (genre) {
    const g = String(genre).toLowerCase();
    list = list.filter(d => (d.genres||[]).some(x => x.toLowerCase() === g));
  }

  if (status) {
    const s = String(status).toLowerCase();
    list = list.filter(d => (d.status||'').toLowerCase() === s);
  }

  if (min_year) list = list.filter(d => (d.year||0) >= Number(min_year));
  if (max_year) list = list.filter(d => (d.year||9999) <= Number(max_year));

  // sort: field:dir
  const [field, dir] = String(sort).split(':');
  list.sort((a,b) => {
    const av = (a[field] ?? 0);
    const bv = (b[field] ?? 0);
    if (av < bv) return dir === 'desc' ? 1 : -1;
    if (av > bv) return dir === 'desc' ? -1 : 1;
    return 0;
  });

  const pg = paginate(list, Number(page), Number(limit));
  res.json(pg);
});

// Detail
app.get('/api/dramas/:id', async (req, res) => {
  await db.read();
  const item = db.data.dramas.find(d => d.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// Create (protected)
app.post('/api/dramas', requireKey, async (req, res) => {
  const now = new Date().toISOString();
  const payload = req.body || {};
  const id = nanoid(12);
  const item = {
    id,
    title: payload.title?.trim() || 'Untitled',
    original_title: payload.original_title || '',
    year: Number(payload.year) || undefined,
    country: payload.country || 'China',
    genres: Array.isArray(payload.genres) ? payload.genres : [],
    status: payload.status || 'Ongoing',
    rating: Number(payload.rating) || 0,
    poster_url: payload.poster_url || '',
    banner_url: payload.banner_url || '',
    description: payload.description || '',
    cast: Array.isArray(payload.cast) ? payload.cast : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    episodes: Array.isArray(payload.episodes) ? payload.episodes : [],
    created_at: now,
    updated_at: now
  };
  await db.read();
  db.data.dramas.unshift(item);
  await db.write();
  res.status(201).json(item);
});

// Update (protected)
app.put('/api/dramas/:id', requireKey, async (req, res) => {
  await db.read();
  const idx = db.data.dramas.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const now = new Date().toISOString();
  db.data.dramas[idx] = { ...db.data.dramas[idx], ...req.body, updated_at: now };
  await db.write();
  res.json(db.data.dramas[idx]);
});

// Delete (protected)
app.delete('/api/dramas/:id', requireKey, async (req, res) => {
  await db.read();
  const before = db.data.dramas.length;
  db.data.dramas = db.data.dramas.filter(d => d.id !== req.params.id);
  await db.write();
  res.json({ ok: true, deleted: before - db.data.dramas.length });
});

// Seed example (optional): quick populate with query ?count=6
app.post('/api/seed', requireKey, async (req, res) => {
  await db.read();
  const { count = 6 } = req.query;
  const samples = Array.from({ length: Number(count) }, (_, i) => ({
    id: nanoid(12),
    title: `Sample C-Drama ${i+1}`,
    original_title: '',
    year: 2024,
    country: 'China',
    genres: ['Romance','Historical'],
    status: i % 2 === 0 ? 'Ongoing' : 'Completed',
    rating: 8.2,
    poster_url: 'https://images.unsplash.com/photo-1520975682031-6ca0b2d0f33b?q=80&w=800&auto=format&fit=crop',
    banner_url: 'https://images.unsplash.com/photo-1517816630740-0b93f606a0d4?q=80&w=1600&auto=format&fit=crop',
    description: 'Lorem ipsum dolor sit amet, a short synopsis for sample content.',
    cast: ['Lead A','Lead B'],
    tags: ['sub indo','1080p'],
    episodes: [
      { number: 1, title: 'Episode 1', stream_url: 'https://example.com/stream1', subtitle_url: '' },
      { number: 2, title: 'Episode 2', stream_url: 'https://example.com/stream2', subtitle_url: '' }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
  db.data.dramas.unshift(...samples);
  await db.write();
  res.json({ ok: true, added: samples.length });
});

app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
