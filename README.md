# KarachiBites — Restaurant Reviews

A full-stack restaurant discovery and review app for Karachi, built with Node.js, Express, SQLite, and vanilla HTML/CSS/JavaScript.

## Features
- Search by restaurant, cuisine, and area
- Cuisine chips and sorting (top rated, most reviewed, name)
- User registration and login; passwords are hashed with bcrypt
- Add or update one review per restaurant per account
- Delete your own review
- Restaurant ratings and review counts update automatically
- SQLite database is created and seeded automatically on first run
- Responsive desktop/mobile layout

## Requirements
- Node.js 18 or newer
- Internet connection for initial npm install and remote Unsplash images / Google Fonts

## Run locally
1. Extract this ZIP.
2. Open a terminal in the project folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

The SQLite database (`restaurant-reviews.sqlite`) is created in the project directory after the server starts.

## Important before deployment
- Set a strong `SESSION_SECRET` environment variable.
- Use HTTPS and `NODE_ENV=production`.
- The default Express MemoryStore is for local development only; use a persistent session store for deployment.
- Add rate limiting, CSRF protection, input moderation/reporting, and backups before public launch.
- Seeded restaurant names are example directory entries; confirm details and get permission before presenting them as verified listings.
- Images are remote Unsplash URLs and require an internet connection.
- This starter app does not include password reset, email verification, restaurant owner accounts, or image uploads.

## Environment variables
- `PORT` (optional, default `3000`)
- `SESSION_SECRET` (required for deployment; a fallback is included for local development)
- `NODE_ENV=production` to enable secure cookies (requires HTTPS)
