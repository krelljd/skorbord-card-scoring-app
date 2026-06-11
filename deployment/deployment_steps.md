# Deployment Steps for Skorbord App

This guide explains how to build and deploy both the backend (Node.js/Express) and frontend (React with TailwindCSS and DaisyUI, dark theme) apps to your Raspberry Pi server (`raspberrypi.local`) using SSH and SCP. **All commands should be run from the root of the project.**

---

## Project Setup & Tooling Checklist

 
```markdown
- [ ] Create and maintain `.env`, `.env.example`, and `.gitignore` files in both `api/` and `app/` directories.
- [ ] Add a `README.md` and `code_map.json` to the project root for onboarding and structure mapping.
- [ ] Set up ESLint and Prettier for both backend and frontend; add `lint` and `format` scripts to both `package.json` files.
- [ ] Add migration and seed scripts for the backend, and ensure a migration runner is available (e.g., `npm run migrate`, `npm run seed`).
- [ ] Add `dev`, `lint`, and `format` scripts to both `api/package.json` and `app/package.json`.
- [ ] Add OpenAPI spec and `.http` files for API documentation and manual testing.
- [ ] Configure TailwindCSS, DaisyUI, and Vite proxy in the frontend; ensure `vite.config.js` proxies `/api` to backend.
- [ ] Add VS Code run tasks for starting backend/frontend in dev mode, running tests, linting, formatting, and deployment scripts.
- [ ] Add `.vscode/extensions.json` for recommended extensions (ESLint, Prettier, TailwindCSS IntelliSense, etc.).
- [ ] Add `.vscode/settings.json` for workspace-specific settings (e.g., format on save, default shell).
- [ ] Ensure all scripts are cross-platform or provide alternatives for Windows/macOS/Linux.
```

---

## 1. General Prerequisites

Ensure the following prerequisites are met before proceeding:

- Node.js and npm are installed.
- SQLite database is set up and accessible.
- Cloudflared is installed and configured.
- Raspberry Pi environment is prepared for deployment.

---

## 2. Automated Build & Deploy (Recommended)

You can use the provided scripts to automate the frontend build and deploy process:

- **For macOS/Linux:**

  
  ```sh
  ./deploy-cards-app.sh
  ```

- **For Windows/PowerShell:**

  
  ```powershell
  ./deploy-cards-app.ps1
  ```

These scripts will:

- Build the frontend (`app/`)
- Copy the build output to the Raspberry Pi (`~/skorbord-cards/app/`)
- (You may need to make the shell script executable: `chmod +x deploy-cards-app.sh`)

> **Note:** Backend deployment and DB copy are still manual (see below).

---

## 3. Manual Build & Deploy Steps

### 3.1. Build the Frontend (React + TailwindCSS + DaisyUI)

1. **Install dependencies:**

   
   ```sh
   cd app
   npm install
   cd ..
   

2. **Build the production frontend:**

   
   ```sh
   npm run --prefix app build
   ```

   This will generate a `dist` folder in `app/` with static files, styled with TailwindCSS and DaisyUI (dark theme).

---

## 4. Prepare the Backend (Node.js/Express)

1. **Install backend dependencies:**

   
   ```sh
   cd api
   npm install
   cd ..
   ```

2. **Ensure the backend is configured to serve static files:**

   - Verify that the backend Express app is set up to serve static files from the `app/dist/` directory.
   - Example configuration in `index.js`:

     ```js
     const express = require('express');
     const path = require('path');
     const app = express();

     // Serve static files
     app.use(express.static(path.join(__dirname, 'app/dist')));

     // SPA fallback
     app.get('*', (req, res) => {
       res.sendFile(path.join(__dirname, 'app/dist/index.html'));
     });

   **Note:** If your backend does not already serve static files and provide an SPA fallback, add the following to your `api/index.js` after API routes:

   
   ```js
   // Serve static files from frontend build
   app.use(express.static(join(__dirname, 'app', 'dist')));

   // SPA fallback for React Router
   app.get('*', (req, res) => {
     res.sendFile(join(__dirname, 'app', 'dist', 'index.html'));
   });
   ```
     app.listen(2525, () => {
       console.log('Server running on port 2525');
     });
   

3. **(Optional) Test locally:**

   
   ```sh
   npm run --prefix api dev
   ```

   Ensure the backend works as expected and supports REST and WebSocket (Socket.IO) APIs for real-time updates.

---

## 5. Deploy to Raspberry Pi

### 5.1. Copy Files to Raspberry Pi

1. **Create target directories on the Pi:**

   
   ```sh
   ssh pi@raspberrypi.local "mkdir -p ~/skorbord-cards/api ~/skorbord-cards/app"
   ```

2. **Copy backend files:**

   
   ```sh
   scp -r api/* pi@raspberrypi.local:~/skorbord-cards/api/
   ```

3. **Copy frontend build files:**

   
   ```sh
   scp -r app/dist/* pi@raspberrypi.local:~/skorbord-cards/api/app/
   ```

   > Ensure the frontend build output is copied to the backend directory (`~/skorbord-cards/api/app/`) to align with the unified production hosting model.

4. **Copy the SQLite database (if needed):**

   
   ```sh
   scp api/scoreboards.db pi@raspberrypi.local:~/skorbord-cards/api/
   ```

### 5.2. Install Dependencies on the Pi

1. **SSH into the Pi:**

   
   ```sh
   ssh pi@raspberrypi.local
   ```

2. **Install backend dependencies:**

   
   ```sh
   cd ~/skorbord-cards/api
   npm install
   ```

---

## 6. Run the Backend Server

1. **Start the backend:**

   
   ```sh
   cd ~/skorbord-cards/api
   npm run dev
   ```

   Or, for production:

   
   ```sh
   node index.js
   ```

2. **(Optional) Serve the frontend static files:**
   - Use a static file server (e.g., `serve`, `http-server`, or configure Express to serve static files from `../frontend`).

---

## 7. (Optional) Automate with a Script

- You can create a shell script to automate the build and deploy steps, or use the provided `deploy-cards-app.sh`/`deploy-cards-app.ps1` scripts for the frontend.

---

## 8. (Optional) Set Up as a Service

- For production, consider using `pm2` or a systemd service to keep the backend running.

---

## 9. Set Up as a systemd Service

### Cards App Service (`skorbord-cards-app.service`)

Create a file `/etc/systemd/system/skorbord-cards-app.service` with the following content:

```ini
[Unit]
Description=Skorbord Cards App (Node.js/Express, serves API and frontend)
After=network.target

[Service]
WorkingDirectory=/home/pi/skorbord-cards/api
ExecStart=/usr/bin/node index.js
Restart=always
User=pi
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

1. Copy the service file to your Pi (e.g., `scp skorbord-cards-app.service pi@raspberrypi.local:~/`)
2. Move it to `/etc/systemd/system/`:

   ```sh
   sudo mv ~/skorbord-cards-app.service /etc/systemd/system/
   ```

3. Reload systemd and enable/start the service:

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable skorbord-cards-app
   sudo systemctl start skorbord-cards-app
   ```

4. Check status:

   ```sh
   sudo systemctl status skorbord-cards-app
   ```

---

## 10. Configure Cloudflared Tunneling for Production

To securely expose your Skorbord app and API to the internet using Cloudflared, follow these steps. This will allow you to access the frontend at `https://cards.skorbord.app/:sqid` and the backend API at `https://cards.skorbord.app/api/:sqid`.

### 10.1. Cloudflared Prerequisites

- A Cloudflare account and a domain (e.g., `skorbord.app`).
- Cloudflared installed on your Raspberry Pi. [Install instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)
- Your Pi must be able to reach the internet and Cloudflare.

### 10.2. Authenticate Cloudflared

1. On your Raspberry Pi, run:

   ```sh
   cloudflared tunnel login
   ```

   - This will open a browser to authenticate with Cloudflare and select your domain.

### 10.3. Create and Configure Tunnel

1. **Create a tunnel for Skorbord:**

   ```sh
   cloudflared tunnel create skorbord
   ```

   - Note the generated Tunnel ID and credentials file path.

2. **Configure the tunnel to route all traffic to the backend:**
   Edit (or create) the config file, usually at `~/.cloudflared/config.yml`:

   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /home/pi/.cloudflared/<TUNNEL_ID>.json
   ingress:
     - hostname: cards.skorbord.app
       service: http://localhost:2525
     - service: http_status:404
   ```

   - Replace `<TUNNEL_ID>` with your actual tunnel ID.

3. **Add DNS records in Cloudflare:**

   - In your Cloudflare dashboard, add a CNAME record for `cards.skorbord.app` pointing to `your-tunnel-id.cfargotunnel.com` (Cloudflared will prompt you with the correct value).

### 10.4. Start the Tunnel

1. Start the tunnel as a service:

   ```sh
   cloudflared tunnel run skorbord
   ```

   - For production, consider running Cloudflared as a systemd service for automatic startup.

### 10.5. Test Production URLs

- Frontend: `https://cards.skorbord.app/:sqid`
- Backend API: `https://cards.skorbord.app/api/:sqid`

---

**Note:**

- All traffic to these URLs will be securely tunneled to your Raspberry Pi.
- Ensure your backend server is running and listening on port 2525.
- For more details, see the [Cloudflared documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/).

---

**Summary:**

- Build frontend → copy `dist/` to Pi  
- Copy backend and DB to Pi  
- Install backend dependencies on Pi  
- Start backend server  
- Serve frontend static files as needed
- **Automated:** Use `deploy-cards-app.sh` or `deploy-cards-app.ps1` from the project root for the frontend

---

**Best Practices:**

- Always use standards-compliant code and files.
- Ensure all code is optimized for mobile and touch use, with relative font sizes (vwh).
- Use TailwindCSS and DaisyUI for styling, adhering to the dark theme.
- Ensure all dependencies are up to date and code is maintainable.
- Document any changes to deployment steps in this file.

---

## Production Deployment Steps

For production, follow these updated steps to deploy the Skorbord app, serving both the API and frontend from the backend service. Reference the earlier sections for detailed instructions on systemd and Cloudflared setup.

### 1. Production Prerequisites

- Complete the initial setup and development deployment steps.
- Ensure your backend (Node.js/Express) is configured to serve static files from the frontend build output (`app/dist/`).

### 2. Update Backend Service

1. Edit your backend service file (`/etc/systemd/system/skorbord-cards-app.service`) to ensure it matches the following:

   ```ini
   [Unit]
   Description=Skorbord Cards Api (Node.js/Express, serves API and frontend)
   After=network.target

   [Service]
   WorkingDirectory=/home/pi/skorbord-cards/api
   ExecStart=/usr/bin/node index.js
   Restart=always
   User=pi
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

2. Reload systemd to apply any changes:

   ```sh
   sudo systemctl daemon-reload
   ```

### 3. Enable and Start Cards App Service

1. Ensure the Cards App service is enabled and started:

   ```sh
   sudo systemctl enable skorbord-cards-app
   sudo systemctl start skorbord-cards-app
   ```

2. Check the status to confirm it's running:

   ```sh
   sudo systemctl status skorbord-cards-app
   ```

### 4. Configure Cloudflared Tunnel

1. Ensure your Cloudflared tunnel is configured to route traffic to the correct ports:

   - API: `http://localhost:2525`
   - Frontend: `http://localhost:2525` (served by the backend)

2. Update your Cloudflared config (`~/.cloudflared/config.yml`) if necessary.

### 5. Start Cloudflared Tunnel

1. Start the Cloudflared tunnel:

   ```sh
   cloudflared tunnel run skorbord
   ```

2. For production, consider running Cloudflared as a systemd service for automatic startup.

3. Ensure the Cloudflared configuration file (`~/.cloudflared/config.yml`) routes all traffic to port 2525:

   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /home/pi/.cloudflared/<TUNNEL_ID>.json
   ingress:
     - hostname: cards.skorbord.app
       service: http://localhost:2525
     - service: http_status:404
   ```

   Replace `<TUNNEL_ID>` with your actual tunnel ID.

### 6. Test Production Deployment

- Access your app at `https://cards.skorbord.app/:sqid`
- Ensure both the frontend and backend are accessible and functioning correctly.

---

## Development Deployment Steps

For development, you can run the frontend and backend separately to enable hot reloading and easier debugging.

### 1. Development Prerequisites

- Complete the initial setup and production deployment steps.
- Ensure your frontend (React with Vite) is configured to proxy API requests to the backend.

### 2. Update Frontend Vite Config

1. Edit your frontend Vite config (`vite.config.js`) to proxy API requests:

   ```js
   export default defineConfig({
     // ...existing config...
     server: {
       proxy: {
         '/api': {
           target: 'http://localhost:2525',
           changeOrigin: true,
         },
       },
     },
   });
   ```

2. This configuration proxies requests from the frontend dev server to the backend API.

### 3. Run Frontend Dev Server

1. In the frontend directory, start the Vite dev server:

   ```sh
   npm run dev
   ```

2. This should run the frontend on port 2424 by default.

### 4. Run Backend Server

1. In the backend directory, start the backend server:

   ```sh
   npm run dev
   ```

2. This should run the backend on port 2525.

### 5. Test Development Deployment

- Access your app at `http://localhost:2424`
- Ensure both the frontend and backend are accessible and functioning correctly.

---

## SQL Database Management

For managing SQL scripts and database updates on the Raspberry Pi, refer to the comprehensive SQL Execution Guide:

📋 **[SQL Execution Guide](./SQL_EXECUTION_GUIDE.md)**

### Quick Reference

Execute SQL files on the production database:

```bash
# From development machine (recommended)
./deployment/run-sql-on-pi.sh api/db/insert-sqids.sql

# On Raspberry Pi directly
ssh pi@raspberrypi.local
cd ~/skorbord-cards/api
npm run sql:execute ./db/insert-sqids.sql
```

### Key Features

- Automatic database backups before execution
- Transaction-based execution with rollback on failure
- Remote execution from development machine
- Detailed logging and error handling
- Service restart capability

---

**Note:**

- In development, you need to run both the frontend and backend servers manually.
- Ensure the correct ports are used in your environment variables and config files.
- For more details on development setup, see the respective framework documentation (React, Vite, Node.js, Express).
