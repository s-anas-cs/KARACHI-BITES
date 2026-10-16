const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database(path.join(__dirname, "restaurant-reviews.sqlite"));
const PORT = process.env.PORT || 3000;

db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    area TEXT NOT NULL,
    cuisine TEXT NOT NULL,
    price TEXT NOT NULL DEFAULT '$$',
    description TEXT NOT NULL,
    image TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, restaurant_id)
  );
`);

const count = db.prepare("SELECT COUNT(*) AS n FROM restaurants").get().n;
if (!count) {
  const seed = db.prepare(`INSERT INTO restaurants (name, area, cuisine, price, description, image) VALUES (?, ?, ?, ?, ?, ?)`);
  const restaurants = [
    ["Kolachi", "Do Darya", "Pakistani", "$$$", "Sea-view dining with grilled favourites and a lively atmosphere.", "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=85"],
    ["BBQ Tonight", "Clifton", "BBQ", "$$", "A popular stop for BBQ platters, karahi and classic Pakistani flavours.", "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1000&q=85"],
    ["Cafe Aylanto", "Clifton", "Continental", "$$$$", "An elegant setting for continental dishes and a relaxed dinner.", "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1000&q=85"],
    ["Xander's", "DHA", "Cafe", "$$$", "Casual cafe dining with comfort food, coffee and brunch options.", "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=85"],
    ["Burns Road Food Street", "Saddar", "Street Food", "$", "A lively food destination for traditional Karachi street-food classics.", "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1000&q=85"],
    ["Kababjees", "Shaheed-e-Millat", "Pakistani", "$$", "Family-friendly dining with grilled dishes and a broad menu.", "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1000&q=85"],
    ["Burger O'Clock", "Gulshan-e-Iqbal", "Burgers", "$$", "A relaxed pick for burgers, fries and casual meetups.", "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1000&q=85"],
    ["Chotu Chaiwala", "Gulshan-e-Iqbal", "Cafe", "$", "A casual tea spot for chai, snacks and catching up with friends.", "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1000&q=85"]
  ];
  const transaction = db.transaction(items => items.forEach(r => seed.run(...r)));
  transaction(restaurants);
}

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || "replace-this-secret-before-deploying",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(path.join(__dirname, "public")));

function currentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(req.session.userId) || null;
}
function requireAuth(req, res, next) {
  if (!currentUser(req)) return res.status(401).json({ error: "Please log in to do that." });
  next();
}

app.get("/api/me", (req, res) => res.json({ user: currentUser(req) }));

app.post("/api/register", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2) return res.status(400).json({ error: "Please enter your name (at least 2 characters)." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  try {
    const result = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(name, email, bcrypt.hashSync(password, 12));
    req.session.userId = result.lastInsertRowid;
    res.status(201).json({ user: currentUser(req) });
  } catch (e) {
    if (String(e.code).includes("SQLITE_CONSTRAINT")) return res.status(409).json({ error: "An account with this email already exists." });
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: "Email or password is incorrect." });
  req.session.userId = user.id;
  res.json({ user: currentUser(req) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/restaurants", (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  const cuisine = String(req.query.cuisine || "").trim().slice(0, 50);
  const area = String(req.query.area || "").trim().slice(0, 60);
  const sort = String(req.query.sort || "rating");
  let sql = `
    SELECT r.*, ROUND(AVG(v.rating), 1) AS avg_rating, COUNT(v.id) AS review_count
    FROM restaurants r LEFT JOIN reviews v ON v.restaurant_id = r.id
    WHERE (r.name LIKE ? OR r.area LIKE ? OR r.cuisine LIKE ?)
      AND (? = '' OR r.cuisine = ?) AND (? = '' OR r.area LIKE ?)
    GROUP BY r.id`;
  if (sort === "reviews") sql += " ORDER BY review_count DESC, avg_rating DESC";
  else if (sort === "name") sql += " ORDER BY r.name COLLATE NOCASE ASC";
  else sql += " ORDER BY avg_rating DESC, review_count DESC, r.name ASC";
  const like = `%${q}%`;
  const rows = db.prepare(sql).all(like, like, like, cuisine, cuisine, area, `%${area}%`);
  res.json({ restaurants: rows });
});

app.get("/api/restaurants/:id", (req, res) => {
  const restaurant = db.prepare(`
    SELECT r.*, ROUND(AVG(v.rating), 1) AS avg_rating, COUNT(v.id) AS review_count
    FROM restaurants r LEFT JOIN reviews v ON v.restaurant_id = r.id
    WHERE r.id = ? GROUP BY r.id`).get(Number(req.params.id));
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found." });
  const reviews = db.prepare(`
    SELECT v.id, v.rating, v.title, v.body, v.created_at, u.name AS user_name
    FROM reviews v JOIN users u ON u.id = v.user_id
    WHERE v.restaurant_id = ? ORDER BY v.created_at DESC`).all(restaurant.id);
  const mine = req.session.userId
    ? db.prepare("SELECT id, rating, title, body FROM reviews WHERE restaurant_id = ? AND user_id = ?").get(restaurant.id, req.session.userId)
    : null;
  res.json({ restaurant, reviews, myReview: mine || null });
});

app.post("/api/restaurants/:id/reviews", requireAuth, (req, res) => {
  const restaurantId = Number(req.params.id);
  if (!db.prepare("SELECT id FROM restaurants WHERE id = ?").get(restaurantId)) return res.status(404).json({ error: "Restaurant not found." });
  const rating = Number(req.body.rating);
  const title = String(req.body.title || "").trim().slice(0, 80);
  const body = String(req.body.body || "").trim().slice(0, 1200);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Choose a rating from 1 to 5 stars." });
  if (title.length < 3) return res.status(400).json({ error: "Review title must be at least 3 characters." });
  if (body.length < 10) return res.status(400).json({ error: "Review must be at least 10 characters." });
  db.prepare(`INSERT INTO reviews (user_id, restaurant_id, rating, title, body)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, restaurant_id) DO UPDATE SET rating=excluded.rating, title=excluded.title, body=excluded.body, created_at=CURRENT_TIMESTAMP`)
    .run(req.session.userId, restaurantId, rating, title, body);
  res.status(201).json({ ok: true });
});

app.delete("/api/reviews/:id", requireAuth, (req, res) => {
  const result = db.prepare("DELETE FROM reviews WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.session.userId);
  if (!result.changes) return res.status(404).json({ error: "Review not found or you do not own it." });
  res.json({ ok: true });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`Karachi Restaurant Reviews running at http://localhost:${PORT}`));
