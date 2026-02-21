# Failover Simulation

This project demonstrates a custom failover router with heartbeat monitoring and automatic failback.

## Architecture

- **Failover Service** (port 8080): Routes traffic to primary or spare server based on health
- **Primary Server** (port 3001): Main backend server
- **Spare Server** (port 3002): Backup backend server
- **Test Client**: Browser-based load tester

## How It Works

1. **Heartbeat Monitoring**: The failover service sends a heartbeat every 1 second to the currently active server
2. **Failure Detection**: If the active server returns 3 consecutive 500 errors, traffic switches to the spare
3. **Crash Simulation**: After 20 seconds, the test client crashes the primary server
4. **Recovery**: Traffic automatically routes to the spare server

## Prerequisites

- Docker and Docker Compose
- A web browser

## Steps to Run the Simulation

### 1. Start the Services

```bash
cd src
docker compose up --build -d
```

This will start three containers:

- `src-failover-1` on port 8080
- `primary` on port 3001
- `spare` on port 3002

### 2. Verify Services are Running

```bash
docker compose ps
```

All three services should show as "Up".

You can also check individual services:

```bash
curl http://localhost:8080/failover/status
curl http://localhost:3001/health
curl http://localhost:3002/health
```

### 3. Open the Test Client

Open `public/test-client.html` in your web browser.

### 4. Run the Test

1. Click the **"Start Test"** button
2. The test will:
   - Send requests every 100-300ms (random interval)
   - Send 3 requests per burst
   - Run for 30 seconds total
   - After 20 seconds, crash the primary server
3. Watch the log output to see:
   - Initial requests going to primary
   - Failure detection after crash
   - Automatic failover to spare
   - Recovery time metrics

### 5. View Results

After the test completes, you'll see:

- **Total requests** sent
- **Success rate** percentage
- **Failed requests** count
- **Failure time** when primary crashed
- **Recovery time** how long until spare took over
- **Recovery delay** calculated from failure to first success

### 6. Check Logs

To see detailed logs from the services:

```bash
# View all logs
docker compose logs

# View specific service logs
docker compose logs failover
docker compose logs primary
docker compose logs spare

# Follow logs in real-time
docker compose logs -f
```

### 7. Stop the Services

```bash
docker compose down
```

## Expected Behavior

1. **First 20 seconds**: All requests succeed, routed to primary server
2. **At 20 seconds**: Primary server crashes (simulated via `/crash` endpoint)
3. **Failure detection**: Failover service detects consecutive failures
4. **Automatic failover**: Traffic switches to spare server
5. **Recovery**: Subsequent requests succeed via spare server

## Troubleshooting

### Services won't start

- Check if ports 8080, 3001, 3002 are available
- Run `docker compose logs` to see error messages

### CORS errors in browser

- Make sure you're opening the HTML file via a web server or file:// protocol
- The failover service includes CORS headers for `*` origin

### All requests fail immediately

- Verify services are running: `docker compose ps`
- Check failover status: `curl http://localhost:8080/failover/status`
- Reset failover state: `curl -X POST http://localhost:8080/failover/reset`

### No failover happening

- Check that the primary server actually crashed: `curl http://localhost:3001/health`
- Verify failover service received failures: `docker compose logs failover`

## Manual Testing

You can also test the failover manually:

```bash
# Check current routing
curl http://localhost:8080/failover/status

# Send requests through failover
curl http://localhost:8080/api/data

# Crash primary server
curl -X POST http://localhost:3001/crash

# Verify failover switched to spare
curl http://localhost:8080/failover/status

# Recover primary server
curl -X POST http://localhost:3001/recover

# Reset failover to use primary again
curl -X POST http://localhost:8080/failover/reset
```

## Configuration

Default settings in the failover service:

- **Heartbeat interval**: 1000ms (1 second)
- **Heartbeat timeout**: 1000ms
- **Max consecutive failures**: 3
- **Recovery**: Manual reset via `/failover/reset` endpoint
