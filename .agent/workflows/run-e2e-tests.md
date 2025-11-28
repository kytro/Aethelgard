---
description: How to run Playwright E2E tests
---

# Running E2E Tests

## Overview
E2E tests use Playwright to test the full application stack. Due to Windows/WSL2 Docker port forwarding issues, **tests should be run inside Docker** for reliability.

## Recommended: Run Tests in Docker

### Prerequisites
- Docker Desktop running
- docker-compose installed

### Steps

// turbo
1. **Start the test environment (MongoDB, app, nginx)**
   ```powershell
   docker-compose up -d mongo app nginx
   ```

// turbo
2. **Run the E2E tests**
   ```powershell
   docker-compose run --rm e2e
   ```

// turbo
3. **Stop the test environment when done**
   ```powershell
   docker-compose down
   ```

### Using the Helper Script

// turbo
Alternatively, use the provided PowerShell script that handles all steps:
```powershell
.\scripts\run-e2e-docker.ps1
```

This script will:
- Start all required services (mongo, app, nginx)
- Wait for services to be healthy
- Run the E2E tests
- Display test results
- Clean up containers

### Viewing Test Results

After running tests, results are saved to your local filesystem:
- **HTML Report**: `playwright-report/index.html`
- **Test Artifacts**: `test-results/` directory

To view the HTML report:
```powershell
npx playwright show-report
```

### Running Specific Tests

Run specific test files:
```powershell
docker-compose run --rm e2e npx playwright test tests/e2e/auth.spec.ts
```

Run tests in debug mode:
```powershell
docker-compose run --rm e2e npx playwright test --debug
```

---

## Alternative: Run Tests Locally (Not Recommended on Windows)

> **Warning**: This method may fail on Windows due to Docker port forwarding issues.

### Prerequisites
- MongoDB container must be running: `docker-compose up -d mongo`
- Port 27017 must be accessible from host
- App and nginx must be running: `docker-compose up -d app nginx`

### Run Tests
```powershell
npm run test:e2e
```

### Troubleshooting Local Runs

If you get `MongoServerSelectionError: connect ECONNREFUSED`:
1. **Restart Docker Desktop** (most common fix)
2. Verify MongoDB is accessible: `Test-NetConnection -ComputerName 127.0.0.1 -Port 27017`
3. If TcpTestSucceeded is False, use the Docker method instead

---

## CI/CD Integration

For CI/CD pipelines, use the Docker approach:

```yaml
# Example GitHub Actions
- name: Run E2E Tests
  run: |
    docker-compose up -d mongo app nginx
    docker-compose run --rm e2e
    docker-compose down
```

---

## Common Issues

### Tests can't connect to MongoDB
- **Solution**: Use the Docker method (`docker-compose run --rm e2e`)
- This runs tests on the same Docker network as MongoDB

### Tests can't access the application
- **Solution**: Ensure app and nginx are running before tests
- The helper script and docker-compose dependencies handle this automatically

### Browser not found errors
- **Solution**: The Dockerfile.e2e uses the official Playwright image with browsers pre-installed
- If running locally, run: `npx playwright install --with-deps`
