const $ = (s) => document.querySelector(s);
let activeCuisine = "";
let selectedRating = 5;
let toastTimer;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
const stars = (rating) => "★".repeat(Number(rating) || 0) + "☆".repeat(5 - (Number(rating) || 0));
function showToast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function setUser(user) {
  $("#welcome").textContent = user ? `Hi, ${user.name.split(" ")[0]}` : "";
  $("#loginBtn").classList.toggle("hidden", !!user);
  $("#signupBtn").classList.toggle("hidden", !!user);
  $("#logoutBtn").classList.toggle("hidden", !user);
}
function openModal(html) {
  $("#modalContent").innerHTML = html;
  $("#modalBackdrop").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("#modalBackdrop").classList.add("hidden");
  document.body.style.overflow = "";
}
$("#closeModal").addEventListener("click", closeModal);
$("#modalBackdrop").addEventListener("click", e => { if (e.target === $("#modalBackdrop")) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

function authModal(mode = "login") {
  const signup = mode === "signup";
  openModal(`<div class="eyebrow dark-eyebrow">WELCOME TO KARACHIBITES</div>
    <h2 id="modalTitle">${signup ? "Join the table." : "Good to see you."}</h2>
    <p class="modal-intro">${signup ? "Create an account to share your favourite places and help Karachi eat well." : "Log in to write reviews and share your food discoveries."}</p>
    <form id="authForm">${signup ? `<label class="form-field"><span>Your name</span><input name="name" required minlength="2" maxlength="80" autocomplete="name" placeholder="e.g. Anas Khan"></label>` : ""}
      <label class="form-field"><span>Email address</span><input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>
      <label class="form-field"><span>Password</span><input type="password" name="password" required minlength="${signup ? 8 : 1}" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="${signup ? "At least 8 characters" : "Your password"}"></label>
      <div id="authError" class="form-error"></div><button class="btn btn-green form-submit" type="submit">${signup ? "Create account" : "Log in"}</button></form>
    <div class="modal-switch">${signup ? "Already have an account?" : "New to KarachiBites?"} <button class="text-button" id="switchAuth">${signup ? "Log in" : "Join free"}</button></div>`);
  $("#switchAuth").addEventListener("click", () => authModal(signup ? "login" : "signup"));
  $("#authForm").addEventListener("submit", async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const result = await api(`/api/${signup ? "register" : "login"}`, { method: "POST", body: JSON.stringify(payload) });
      setUser(result.user); closeModal(); showToast(signup ? "Welcome! Your account is ready." : "You are now logged in.");
      const openId = window.pendingRestaurantId; if (openId) { window.pendingRestaurantId = null; showRestaurant(openId, true); }
    } catch (err) { $("#authError").textContent = err.message; }
  });
}
$("#loginBtn").addEventListener("click", () => authModal("login"));
$("#signupBtn").addEventListener("click", () => authModal("signup"));
$("#logoutBtn").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST", body: "{}" }); setUser(null); showToast("You have logged out."); loadRestaurants(); }
  catch (e) { showToast(e.message); }
});

function restaurantCard(r) {
  const rating = Number(r.avg_rating || 0);
  return `<article class="restaurant-card" tabindex="0" role="button" aria-label="View ${esc(r.name)} reviews" data-id="${r.id}">
    <div class="card-image"><img loading="lazy" src="${esc(r.image)}" alt="${esc(r.name)}" onerror="this.style.display='none'"><span class="image-tag">${esc(r.cuisine)}</span></div>
    <div class="card-body"><div class="card-title-row"><h3>${esc(r.name)}</h3><span class="price">${esc(r.price)}</span></div>
    <div class="rating-row"><span class="stars">${stars(Math.round(rating))}</span><span class="rating-number">${rating ? rating.toFixed(1) : "New"}</span><span class="review-count">(${r.review_count} ${r.review_count === 1 ? "review" : "reviews"})</span></div>
    <p class="card-description">${esc(r.description)}</p>
    <div class="card-meta"><span>⌖ ${esc(r.area)}, Karachi</span><span>${esc(r.cuisine)}</span></div>
    <span class="card-link">Read reviews &nbsp; ↗</span></div></article>`;
}
async function loadRestaurants() {
  const params = new URLSearchParams({ q: $("#searchInput").value.trim(), area: $("#areaSelect").value, cuisine: activeCuisine, sort: $("#sortSelect").value });
  $("#status").textContent = "Finding your next favourite…";
  try {
    const { restaurants } = await api(`/api/restaurants?${params}`);
    $("#status").textContent = `${restaurants.length} ${restaurants.length === 1 ? "place" : "places"} to explore`;
    $("#restaurantGrid").innerHTML = restaurants.length ? restaurants.map(restaurantCard).join("") : `<div class="empty-state"><strong>No places found just yet.</strong>Try a different search or choose another area.</div>`;
  } catch (e) { $("#status").textContent = e.message; }
}
$("#searchForm").addEventListener("submit", e => { e.preventDefault(); loadRestaurants(); $("#discover").scrollIntoView({ behavior: "smooth" }); });
$("#sortSelect").addEventListener("change", loadRestaurants);
$("#areaSelect").addEventListener("change", loadRestaurants);
$("#cuisineChips").addEventListener("click", e => {
  const chip = e.target.closest("[data-cuisine]"); if (!chip) return;
  activeCuisine = chip.dataset.cuisine;
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("selected", c === chip));
  loadRestaurants();
});
$("#restaurantGrid").addEventListener("click", e => {
  const card = e.target.closest("[data-id]"); if (card) showRestaurant(Number(card.dataset.id));
});
$("#restaurantGrid").addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-id]")) { e.preventDefault(); showRestaurant(Number(e.target.dataset.id)); }
});

async function showRestaurant(id, focusReview = false) {
  try {
    const { restaurant: r, reviews, myReview } = await api(`/api/restaurants/${id}`);
    const rating = Number(r.avg_rating || 0);
    const reviewMarkup = reviews.length ? reviews.map(v => `<div class="review-item"><h4>${esc(v.title)} <span class="stars">${stars(v.rating)}</span></h4><div class="review-by">By ${esc(v.user_name)} · ${esc(new Date(v.created_at + "Z").toLocaleDateString())}</div><p>${esc(v.body)}</p>${window.currentUser && v.user_name === window.currentUser.name ? `<button class="text-button delete-review" data-review="${v.id}">Delete my review</button>` : ""}</div>`).join("") : `<div class="review-empty">No reviews yet. Be the first to share your experience.</div>`;
    openModal(`<div class="detail-hero"><img src="${esc(r.image)}" alt="${esc(r.name)}"></div>
      <div class="eyebrow dark-eyebrow">${esc(r.cuisine)} · ${esc(r.price)}</div><h2 id="modalTitle">${esc(r.name)}</h2>
      <div class="detail-meta">⌖ ${esc(r.area)}, Karachi<br>${esc(r.description)}</div>
      <div class="detail-rating"><span class="stars">${stars(Math.round(rating))}</span> <strong>${rating ? rating.toFixed(1) : "No rating yet"}</strong> <span class="review-count">· ${r.review_count} reviews</span></div>
      <button id="writeReviewBtn" class="btn btn-green">${myReview ? "Update your review" : "Write a review"} ↗</button>
      <div id="reviewFormSlot"></div><div class="review-list"><h3>Community reviews</h3>${reviewMarkup}</div>`);
    $("#writeReviewBtn").addEventListener("click", () => {
      if (!window.currentUser) { window.pendingRestaurantId = id; authModal("login"); return; }
      showReviewForm(id, myReview);
    });
    document.querySelectorAll(".delete-review").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("Delete your review?")) return;
      try { await api(`/api/reviews/${btn.dataset.review}`, { method: "DELETE" }); showToast("Review deleted."); showRestaurant(id); loadRestaurants(); }
      catch (e) { showToast(e.message); }
    }));
    if (focusReview) showReviewForm(id, myReview);
  } catch (e) { showToast(e.message); }
}
function showReviewForm(id, existing) {
  selectedRating = existing ? Number(existing.rating) : 5;
  $("#reviewFormSlot").innerHTML = `<form id="reviewForm" class="review-form"><h3>${existing ? "Update your review" : "Share your experience"}</h3>
    <label class="form-field"><span>Your rating</span><div class="star-picker" id="starPicker">${[1,2,3,4,5].map(n => `<button type="button" data-rating="${n}" class="${n <= selectedRating ? "on" : ""}" aria-label="${n} stars">★</button>`).join("")}</div></label>
    <label class="form-field"><span>Review title</span><input name="title" required minlength="3" maxlength="80" value="${esc(existing?.title || "")}" placeholder="What stood out?"></label>
    <label class="form-field"><span>Your review</span><textarea name="body" required minlength="10" maxlength="1200" placeholder="Food, service, atmosphere…">${esc(existing?.body || "")}</textarea></label>
    <div id="reviewError" class="form-error"></div><button class="btn btn-green form-submit" type="submit">${existing ? "Save changes" : "Publish review"}</button></form>`;
  $("#starPicker").addEventListener("click", e => {
    const b = e.target.closest("[data-rating]"); if (!b) return;
    selectedRating = Number(b.dataset.rating);
    document.querySelectorAll("#starPicker button").forEach(btn => btn.classList.toggle("on", Number(btn.dataset.rating) <= selectedRating));
  });
  $("#reviewForm").addEventListener("submit", async e => {
    e.preventDefault(); const payload = Object.fromEntries(new FormData(e.currentTarget).entries()); payload.rating = selectedRating;
    try { await api(`/api/restaurants/${id}/reviews`, { method: "POST", body: JSON.stringify(payload) }); showToast("Your review has been published!"); showRestaurant(id); loadRestaurants(); }
    catch (err) { $("#reviewError").textContent = err.message; }
  });
  $("#reviewForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
$("#communityReviewBtn").addEventListener("click", () => {
  if (!window.currentUser) return authModal("signup");
  $("#discover").scrollIntoView({ behavior: "smooth" }); showToast("Choose a restaurant card to write a review.");
});
async function init() {
  $("#year").textContent = new Date().getFullYear();
  try { const data = await api("/api/me"); window.currentUser = data.user; setUser(data.user); }
  catch { window.currentUser = null; setUser(null); }
  const oldSetUser = setUser;
  // Keep the client-side user state in sync after authentication changes.
  const originalLogin = $("#authForm");
  loadRestaurants();
}
const originalSetUser = setUser;
setUser = function(user) { window.currentUser = user; originalSetUser(user); };
init();
