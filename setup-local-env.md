# Local E2E Testing Setup Guide

This guide helps you set up a local environment that mimics your production stack (OpenTofu) for running End-to-End (E2E) tests with Playwright.

## Prerequisites
- Docker & Docker Compose installed.
- Node.js & npm installed.

## Architecture
The local setup uses `docker-compose.yml` to spin up:
1.  **Nginx Proxy**: Acts as the reverse proxy (port 8081), mimicking production routing and headers.
2.  **App Container**: Builds your Angular/Express app from the `Dockerfile`.
    - Runs with `NODE_ENV=test` to enable the authentication backdoor.
    - Accessible only via the Nginx proxy.
3.  **Mongo Container**: Standard MongoDB instance.
    - Exposes port `27017`.

## Setup Instructions

### 1. Start the Environment
Run the following command in the `codex-admin` directory:

```bash
docker compose up --build -d
```

- `--build`: Rebuilds the image to include your latest code changes.
- `-d`: Runs in detached mode (background).

### 2. Verify Health
Check if the services are running:

```bash
docker compose ps
```

You can also visit [http://localhost:8081/codex/api/health](http://localhost:8081/codex/api/health) in your browser. It should return `{"status":"ok","db":true}`.

### 3. Run E2E Tests
Once the environment is up, run the tests:

```bash
# Run all tests (headless)
npm run test:e2e

# Run tests with UI (interactive)
npm run test:e2e:ui
```

### 4. Cleanup
To stop and remove the containers:

```bash
docker compose down
```

To also remove the database volume (fresh start):

```bash
docker compose down -v
```

## Notes on Reverse Proxy
Your production environment uses a reverse proxy. This local setup exposes the app directly on port `8080`, but the application itself handles the `/codex` base path (via `server.js`), so it mimics the behavior behind the proxy. Playwright is configured to use `http://localhost:8080/codex` as the base URL.
