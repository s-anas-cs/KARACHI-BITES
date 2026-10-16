# KarachiBites — Restaurant Reviews

A full-stack restaurant discovery and review app for Karachi, built with Node.js, Express, PostgreSQL, and vanilla HTML/CSS/JavaScript.

## Features
- Search by restaurant, cuisine, and area
- Cuisine filters and sorting (top rated, most reviewed, name)
- User registration and login with bcrypt password hashing
- Add or update one review per restaurant per account
- Delete your own review
- PostgreSQL-backed restaurants, users, reviews, and persistent login sessions
- Responsive desktop/mobile layout

## Requirements
- Node.js 20 or newer
- A PostgreSQL database (Neon works well with Vercel)

## Run locally
1. Create a PostgreSQL database and copy its connection string.
2. Create a `.env` file in the project root with:

   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
   SESSION_SECRET=replace-with-a-long-random-secret
   NODE_ENV=development
   ```

3. Install packages: `npm install`
4. Start the app: `npm start`
5. Open `http://localhost:3000`

The tables and sample restaurant entries are created automatically at first request. The sample restaurant directory is starter content; verify listing details before treating them as official.

## Deploy to Vercel
1. Push this project to GitHub.
2. Import the repository at https://vercel.com/new.
3. In Vercel Project Settings → Environment Variables, add `DATABASE_URL` (the Neon pooled connection string) and `SESSION_SECRET` (a long random secret). Select Production, Preview, and Development as needed.
4. Redeploy after adding variables.
5. Test `/api/restaurants`, registration, login, add/edit review, logout, and login again.

Vercel automatically detects the Express app. No custom build command or output directory is normally needed.

## Notes
- Never commit `.env` or publish your database connection string.
- A change to Vercel environment variables only applies to new deployments.
- This starter does not include password reset, email verification, restaurant-owner accounts, image uploads, or moderation tools.
