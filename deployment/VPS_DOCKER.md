# Deploying to the Hostinger VPS with Docker

The VPS (`skorbord.vps`, Ubuntu 24.04 with Docker and Traefik) runs the app as one container behind Traefik. GitHub Actions builds the image, pushes it to GHCR, and deploys over SSH on every push to `main`. This replaces the Raspberry Pi scripts once you cut over; the Pi scripts stay as the fallback until then.

## How it fits together

- `Dockerfile`: builds the frontend, compiles `better-sqlite3` for linux-x64, and runs migrations then the server.
- `deployment/docker-compose.vps.yml`: one `app` service, Traefik labels for `cards.skorbord.app`, named volume `skorbord-data` mounted at `/data` for the SQLite file.
- `.github/workflows/deploy-vps.yml`: test, build and push, then copy the compose file to the VPS, `docker compose pull && up -d`, and wait for the container to report healthy.
- `TRUST_PROXY=uniquelocal`: Traefik reaches the container from the Docker bridge, not loopback, so Express must trust private ranges to see real client IPs for rate limiting. The default stays `loopback`, so the Pi is unaffected.

## One-time VPS setup

1. Create a deploy key: `ssh-keygen -t ed25519 -f skorbord-deploy -C github-deploy`. Add the public key to `~/.ssh/authorized_keys` of a user in the `docker` group on the VPS (root works but a dedicated user is better).
2. In `/docker/skorbord-card-scoring-app/`, create `.env` with `ADMIN_PIN=...` (mode 600).
3. If the GHCR package is private, run `docker login ghcr.io` once on the VPS with a personal access token that has `read:packages`.
4. In GitHub, add an environment named `production` with secrets `VPS_HOST` (2.25.184.36), `VPS_USER`, `VPS_SSH_KEY` (private key).

## Cutover from the Pi

Follow Part A of `vps-migration/pi-to-vps-migration-plan.md` for the order of events. Differences with Docker:

- Copy the checkpointed DB into the volume: `docker run --rm -v skorbord-card-scoring-app_skorbord-data:/data -v $PWD:/in alpine cp /in/cutover.db /data/cards-sqlite.db`, then `chown 1000:1000` it. Do this before the first start, or stop the app first.
- DNS: `cards.skorbord.app` must point at the VPS IP (DNS only, grey cloud, so Traefik gets its Let's Encrypt certificate and sees the real client IP). It currently points at the Pi's Cloudflare tunnel; changing it is the cutover.
- Test before DNS moves: `curl -k --resolve cards.skorbord.app:443:2.25.184.36 https://cards.skorbord.app/health`.
- Backup: `docker compose exec app sqlite3 /data/cards-sqlite.db ".backup '/data/backup.db'"`, then copy it out with `docker cp`. A nightly cron on the VPS should do this.
- Rollback: `IMAGE_TAG=<older sha> docker compose up -d` in the project directory.
