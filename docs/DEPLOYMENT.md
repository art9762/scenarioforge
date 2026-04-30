# Deployment

## Requirements

- Python 3.11+
- Node.js 18+ (for frontend build)
- WeasyPrint system dependencies (for PDF export)
- Trinity API access (gate.trinity.tg)

---

## Production Deployment

### 1. Backend

```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt update
sudo apt install -y python3.11 python3.11-venv \
  libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 \
  libffi-dev shared-mime-info

# Setup
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure
cp ../.env.example ../.env
# Edit .env with production values

# Run with gunicorn
pip install gunicorn uvicorn[standard]
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

### 2. Frontend

```bash
cd frontend
npm ci
npm run build
# Serve dist/ with nginx or any static file server
```

### 3. Nginx Configuration

```nginx
server {
    listen 80;
    server_name scenarioforge.example.com;

    # Frontend
    location / {
        root /opt/scenarioforge/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;  # Long timeout for generation
    }
}
```

### 4. Systemd Service

```ini
# /etc/systemd/system/scenarioforge.service
[Unit]
Description=ScenarioForge Backend
After=network.target

[Service]
Type=exec
User=scenarioforge
WorkingDirectory=/opt/scenarioforge/backend
EnvironmentFile=/opt/scenarioforge/.env
ExecStart=/opt/scenarioforge/backend/.venv/bin/gunicorn main:app \
  -w 4 -k uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now scenarioforge
```

---

## Docker Deployment

### docker-compose.yml

```yaml
version: "3.8"

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    volumes:
      - ./data:/app/data
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
    restart: unless-stopped
```

### backend/Dockerfile

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libpango-1.0-0 libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 libffi-dev shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn uvicorn[standard]
COPY . .

CMD ["gunicorn", "main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

### frontend/Dockerfile

```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

---

## Environment Variables

Set these in `.env` or your deployment platform:

```bash
TRINITY_API_KEY=<your-production-key>
TRINITY_AURORA_URL=https://gate.trinity.tg/aurora/v1
TRINITY_ORION_URL=https://gate.trinity.tg/orion/v1
STORAGE_DIR=/opt/scenarioforge/data
HOST=0.0.0.0
PORT=8000
```

---

## Health Check

```bash
curl http://localhost:8000/api/config/models
```

---

## Backup

Back up the `STORAGE_DIR` directory regularly — it contains all project data:

```bash
tar czf scenarioforge-backup-$(date +%Y%m%d).tar.gz /opt/scenarioforge/data
```

---

## Monitoring

- Monitor `/api/projects/{id}/status` for stuck pipelines
- Set up alerts if the backend process crashes (systemd will restart it)
- Watch disk usage in `STORAGE_DIR` for large projects with many revisions
