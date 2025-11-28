#!/usr/bin/env pwsh
# Script to run Playwright E2E tests inside Docker
# This avoids Windows/WSL2 port forwarding issues by running tests
# on the same Docker network as MongoDB and the application

Write-Host "`n=== Codex Admin E2E Test Runner ===" -ForegroundColor Cyan
Write-Host "Running Playwright tests in Docker...`n" -ForegroundColor Cyan

# Configuration
$ErrorActionPreference = "Stop"
$services = @("mongo", "app", "nginx")
$maxWaitSeconds = 60

# Step 1: Start required services
Write-Host "[1/4] Starting services: $($services -join ', ')..." -ForegroundColor Yellow
try {
    docker-compose up -d $services 2>&1 | Out-Null
    Write-Host "✓ Services started" -ForegroundColor Green
}
catch {
    Write-Host "✗ Failed to start services" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Step 2: Wait for MongoDB to be healthy
Write-Host "[2/4] Waiting for MongoDB to be ready..." -ForegroundColor Yellow
$waited = 0
$interval = 2
while ($waited -lt $maxWaitSeconds) {
    $health = docker inspect codex-test-db --format='{{.State.Health.Status}}' 2>$null
    if ($health -eq "healthy") {
        Write-Host "✓ MongoDB is ready" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds $interval
    $waited += $interval
    Write-Host "  Waiting... ($waited/$maxWaitSeconds seconds)" -ForegroundColor Gray
}

if ($waited -ge $maxWaitSeconds) {
    Write-Host "✗ MongoDB did not become healthy in time" -ForegroundColor Red
    Write-Host "  Check logs with: docker logs codex-test-db" -ForegroundColor Yellow
    docker-compose down 2>&1 | Out-Null
    exit 1
}

# Step 3: Run E2E tests
Write-Host "[3/4] Running E2E tests..." -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

# Run tests and capture exit code
docker-compose run --rm e2e
$testExitCode = $LASTEXITCODE

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

if ($testExitCode -eq 0) {
    Write-Host "✓ E2E tests passed!" -ForegroundColor Green
}
else {
    Write-Host "✗ E2E tests failed (exit code: $testExitCode)" -ForegroundColor Red
}

# Step 4: Cleanup
Write-Host "[4/4] Cleaning up..." -ForegroundColor Yellow
try {
    docker-compose down 2>&1 | Out-Null
    Write-Host "✓ Services stopped and removed" -ForegroundColor Green
}
catch {
    Write-Host "⚠ Warning: Cleanup may have failed" -ForegroundColor Yellow
}

# Display results location
Write-Host "`n📊 Test Results:" -ForegroundColor Cyan
Write-Host "  HTML Report: playwright-report\index.html" -ForegroundColor White
Write-Host "  Test Artifacts: test-results\" -ForegroundColor White
Write-Host "`nTo view the HTML report, run:" -ForegroundColor Cyan
Write-Host "  npx playwright show-report" -ForegroundColor White

# Exit with the same code as the tests
Write-Host "`n=== Test run complete ===" -ForegroundColor Cyan
exit $testExitCode
