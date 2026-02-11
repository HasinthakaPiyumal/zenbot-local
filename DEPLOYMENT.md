# Production Deployment Guide

This guide explains how to deploy the **Web Embedded AI Bot** to a production environment.

## Prerequisites
-   Node.js (v18 or higher)
-   NPM or Yarn
-   Production server (Linux recommended)

## 1. Build the Application

Use the provided build script to compile both the frontend and backend.

```bash
# Update dependencies
npm install

# Build Client
cd client
npm install
npm run build 
# Output: client/dist

# Build Server
cd ../server
npm install
npm run build
# Output: server/dist
```

## 2. Prepare the Environment

Create a `.env` file in the `server/` directory for production settings.

```bash
cp server/.env.example server/.env
nano server/.env
```

**Required settings:**
-   `NODE_ENV=production`
-   `PORT=3000` (or your desired port)
-   `JWT_SECRET`: Generate a strong random string.
-   `ADMIN_PASS_HASH`: Generate a hash for your admin password.
-   `CHAT_MODEL_ID`: Set your desired model.
-   `EMBEDDING_MODEL_ID`: Set your embedding model.

## 3. Run the Server

The server is configured to serve the built frontend static files automatically when in production mode.

You can run it directly:

```bash
cd server
npm start
```

Or use a process manager like **PM2** (recommended):

```bash
npm install -g pm2
cd server
pm2 start dist/index.js --name "zenbot"
pm2 save
pm2 startup
```

## 4. Verification

Visit `http://your-server-ip:3000`. You should see the application load.
-   Chat interface should be visible.
-   Admin login should work.
-   Knowledge base search should function.

## 5. Notes

-   **Database**: The SQLite database and Vector Store (LanceDB) are stored in `server/data/`. Ensure this directory persists across deployments.
-   **Models**: The first run will download the models to the cache. This may take a few minutes.
