require("dotenv").config();
const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : "local-development-only-change-me");

if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required in production.");
}
if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is missing. Configure PostgreSQL before using the app.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : false,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

const seedRestaurants = [
  ["Kolachi", "Do Darya", "Pakistani", "$$$", "Sea-view dining with grilled favourites and a lively atmosphere.", "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=85"],
  ["BBQ Tonight", "Clifton", "BBQ", "$$", "A popular stop for BBQ platters, karahi and classic Pakistani flavours.", "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1000&q=85"],
  ["Cafe Aylanto", "Clifton", "Continental", "$$$$", "An elegant setting for continental dishes and a relaxed dinner.", "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1000&q=85"],
  ["Xander's", "DHA", "Cafe", "$$$", "Casual cafe dining with comfort food, coffee and brunch options.", "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=85"],
  ["Burns Road Food Street", "Saddar", "Street Food", "$", "A lively food destination for traditional Karachi street-food classics.", "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1000&q=85"],
  ["Kababjees", "Shaheed-e-Millat", "Pakistani", "$$", "Family-friendly dining with grilled dishes and a broad menu.", "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1000&q=85"],
  ["Burger O'Clock", "Gulshan-e-Iqbal", "Burgers", "$$", "A relaxed pick for burgers, fries and casual meetups.", "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1000&q=85"],
  ["Chotu Chaiwala", "Gulshan-e-Iqbal", "Cafe", "$", "A casual tea spot for chai, snacks and catching up with friends.", "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1000&q=85"]
];

const dbReady = (async () => {
  if (!process.env.DATABASE_URL) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS restaurants (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      area TEXT NOT NULL,
      cuisine TEXT NOT NULL,
      price TEXT NOT NULL DEFAULT '$$',
      description TEXT NOT NULL,
      image TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, restaurant_id)
    );
  `);
  for (const r of seedRestaurants) {
    await pool.query(
      `INSERT INTO restaurants (name, area, cuisine, price, description, image)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (name) DO NOTHING`, r
    );
  }
})();

app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(async (_req, res, next) => {
  try {
    await dbReady;
    if (!process.env.DATABASE_URL) return res.status(500).json({ error: "Database is not configured. Set DATABASE_URL." });
    next();
  } catch (error) {
    console.error("Database initialization failed:", error);
    res.status(500).json({ error: "Database connection failed. Check DATABASE_URL and deployment logs." });
  }
});

const sessionStore = new PgSession({
  pool,
  tableName: "user_sessions",
  createTableIfMissing: true
});
app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));
app.use(express.static(path.join(__dirname, "public")));

async function currentUser(req) {
  if (!req.session.userId) return null;
  const result = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [req.session.userId]);
  return result.rows[0] || null;
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in to do that." });
  next();
}

app.get("/api/me", async (req, res, next) => {
  try { res.json({ user: await currentUser(req) }); } catch (e) { next(e); }
});

app.post("/api/register", async (req, res, next) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2) return res.status(400).json({ error: "Please enter your name (at least 2 characters)." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
      [name, email, hash]
    );
    req.session.userId = result.rows[0].id;
    req.session.save(async (err) => {
      if (err) return next(err);
      try { res.status(201).json({ user: await currentUser(req) }); } catch (e) { next(e); }
    });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "An account with this email already exists." });
    next(e);
  }
});

app.post("/api/login", async (req, res, next) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  try {
    const result = await pool.query("SELECT id, password_hash FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
    req.session.userId = user.id;
    req.session.save(async (err) => {
      if (err) return next(err);
      try { res.json({ user: await currentUser(req) }); } catch (e) { next(e); }
    });
  } catch (e) { next(e); }
});

app.post("/api/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("connect.sid", { httpOnly: true, sameSite: "lax", secure: isProduction });
    res.json({ ok: true });
  });
});

app.get("/api/restaurants", async (req, res, next) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  const cuisine = String(req.query.cuisine || "").trim().slice(0, 50);
  const area = String(req.query.area || "").trim().slice(0, 60);
  const sort = String(req.query.sort || "rating");
  let order = "avg_rating DESC, review_count DESC, r.name ASC";
  if (sort === "reviews") order = "review_count DESC, avg_rating DESC";
  else if (sort === "name") order = "r.name ASC";
  try {
    const result = await pool.query(`
      SELECT r.*, COALESCE(ROUND(AVG(v.rating)::numeric, 1), 0) AS avg_rating,
             COUNT(v.id)::int AS review_count
      FROM restaurants r LEFT JOIN reviews v ON v.restaurant_id = r.id
      WHERE (r.name ILIKE $1 OR r.area ILIKE $1 OR r.cuisine ILIKE $1)
        AND ($2 = '' OR r.cuisine = $2) AND ($3 = '' OR r.area ILIKE $4)
      GROUP BY r.id ORDER BY ${order}`,
      [`%${q}%`, cuisine, area, `%${area}%`]
    );
    res.json({ restaurants: result.rows });
  } catch (e) { next(e); }
});

app.get("/api/restaurants/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid restaurant ID." });
  try {
    const found = await pool.query(`
      SELECT r.*, COALESCE(ROUND(AVG(v.rating)::numeric, 1), 0) AS avg_rating,
             COUNT(v.id)::int AS review_count
      FROM restaurants r LEFT JOIN reviews v ON v.restaurant_id = r.id
      WHERE r.id = $1 GROUP BY r.id`, [id]);
    const restaurant = found.rows[0];
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found." });
    const reviewResult = await pool.query(`
      SELECT v.id, v.rating, v.title, v.body, v.created_at, u.name AS user_name
      FROM reviews v JOIN users u ON u.id = v.user_id
      WHERE v.restaurant_id = $1 ORDER BY v.created_at DESC`, [id]);
    let mine = null;
    if (req.session.userId) {
      const mineResult = await pool.query(
        "SELECT id, rating, title, body FROM reviews WHERE restaurant_id = $1 AND user_id = $2",
        [id, req.session.userId]
      );
      mine = mineResult.rows[0] || null;
    }
    res.json({ restaurant, reviews: reviewResult.rows, myReview: mine });
  } catch (e) { next(e); }
});

app.post("/api/restaurants/:id/reviews", requireAuth, async (req, res, next) => {
  const restaurantId = Number(req.params.id);
  const rating = Number(req.body.rating);
  const title = String(req.body.title || "").trim().slice(0, 80);
  const body = String(req.body.body || "").trim().slice(0, 1200);
  if (!Number.isSafeInteger(restaurantId) || restaurantId < 1) return res.status(400).json({ error: "Invalid restaurant ID." });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Choose a rating from 1 to 5 stars." });
  if (title.length < 3) return res.status(400).json({ error: "Review title must be at least 3 characters." });
  if (body.length < 10) return res.status(400).json({ error: "Review must be at least 10 characters." });
  try {
    const restaurant = await pool.query("SELECT id FROM restaurants WHERE id = $1", [restaurantId]);
    if (!restaurant.rowCount) return res.status(404).json({ error: "Restaurant not found." });
    await pool.query(`
      INSERT INTO reviews (user_id, restaurant_id, rating, title, body)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, restaurant_id)
      DO UPDATE SET rating = EXCLUDED.rating, title = EXCLUDED.title,
                    body = EXCLUDED.body, created_at = CURRENT_TIMESTAMP`,
      [req.session.userId, restaurantId, rating, title, body]
    );
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

app.delete("/api/reviews/:id", requireAuth, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid review ID." });
  try {
    const result = await pool.query("DELETE FROM reviews WHERE id = $1 AND user_id = $2", [id, req.session.userId]);
    if (!result.rowCount) return res.status(404).json({ error: "Review not found or you do not own it." });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((err, _req, res, _next) => {
  console.error("Request failed:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong. Check the server logs for details." });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`KarachiBites running at http://localhost:${PORT}`));
}
module.exports = app;
