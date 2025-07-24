# Build and deploy Skorbord frontend to Raspberry Pi

# 1. Build the frontend (from project root, using app as prefix)
npm --prefix app run build

ssh pi@raspberrypi.local "sudo systemctl stop skorbord-cards-app.service"

# 2. Ensure the backend's app/dist directory exists on the Pi
ssh pi@raspberrypi.local "mkdir -p ~/skorbord-cards/api/app/dist"

# 3. Copy built files to Raspberry Pi backend directory (so Express can serve them)
scp -r app/dist/* pi@raspberrypi.local:~/skorbord-cards/api/app/dist/

# 4. (Optional) Copy updated backend files if needed
rsync -av --exclude 'node_modules' --exclude 'scoreboards.db*' --exclude '*.test.js' ./api/ pi@raspberrypi.local:~/skorbord-cards/api/

# 5. Restart the backend service on the Pi (serves both API and frontend)
ssh pi@raspberrypi.local "sudo systemctl start skorbord-cards-app.service"

Write-Host "skorbord-cards-app.service started successfully on Raspberry Pi."
