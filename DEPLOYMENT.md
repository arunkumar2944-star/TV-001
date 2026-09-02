# Deployment

Target: a private Trichy Vision office server, reachable only on the office network (or through a
VPN). The database stays on Supabase; n8n is hosted and managed separately.

```
      staff browsers
            │  HTTPS
            ▼
   ┌───────────────────┐        ┌──────────────────┐
   │ nginx (TLS, /api) │ ─────► │ Express API :4000│ ──► Supabase PostgreSQL
   │  serves the SPA   │        │  media volume    │ ◄── n8n callbacks
   └───────────────────┘        └──────────────────┘
```

---

## 1. Server preparation

- Linux with Docker 24+ and the Compose plugin (or Node.js 22 LTS for a bare install)
- Outbound HTTPS to Supabase and to the n8n host
- Inbound 443 from the office network only
- Disk sized for media: budget roughly `daily video minutes × 15 MB` plus headroom
- NTP in sync - JWT expiry and audit timestamps depend on it

```bash
sudo useradd -r -m -s /bin/bash trichy
sudo mkdir -p /opt/trichy-vision /srv/trichy-vision/media
sudo chown -R trichy:trichy /opt/trichy-vision /srv/trichy-vision
```

## 2. Configuration

```bash
cd /opt/trichy-vision
cp backend/.env.example backend/.env
chmod 600 backend/.env
```

Production values that matter:

```bash
NODE_ENV=production
PORT=4000

DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
DATABASE_SSL=true
DATABASE_POOL_MAX=10

AUTH_SECRET=<node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
AUTH_COOKIE_SECURE=true          # required: the app is served over HTTPS
AUTH_COOKIE_SAMESITE=lax
AUTH_TOKEN_TTL=8h

FRONTEND_URL=https://newsroom.trichyvision.local
PUBLIC_API_URL=https://newsroom.trichyvision.local

N8N_WEBHOOK_URL=https://n8n.office.local/webhook/trichy-vision-publish
N8N_WEBHOOK_SECRET=<same value configured in n8n>

STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/app/storage/uploads
MAX_UPLOAD_SIZE_MB=200

LOG_LEVEL=info
```

The API **refuses to start** in production without `DATABASE_URL` and `AUTH_SECRET`, and if
`AUTH_SECRET` still contains the placeholder.

Never commit `.env`. `.gitignore` already excludes it; keep the real values in the office password
manager.

## 3. Database check

Read-only, changes nothing:

```bash
npm --prefix backend run verify:schema
npm --prefix backend run seed:platforms     # inserts only missing platforms
```

Apply `backend/sql/schema-reference.sql` only if verify reports something missing, after reviewing
[DATABASE.md](DATABASE.md).

## 4. First accounts

```bash
SEED_ADMIN_EMAIL=admin@trichyvision.local \
SEED_ADMIN_PASSWORD='<chosen securely>' \
npm --prefix backend run seed:users
```

Any password you do not supply is generated and printed once. Store them in the password manager and
have each user change theirs from the Account page.

## 5a. Deploy with Docker (recommended)

```bash
cd /opt/trichy-vision
docker compose up -d --build
docker compose ps
docker compose logs -f backend
curl -fsS http://localhost:8080/api/health
```

Both services use `restart: unless-stopped` and have health checks; the UI waits for the API to be
healthy. Media lives in the named volume `trichy_vision_media`. To keep it on a specific disk:

```yaml
volumes:
  media:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /srv/trichy-vision/media
```

Update:

```bash
git pull
docker compose up -d --build
docker image prune -f
```

## 5b. Deploy without Docker

```bash
npm --prefix backend  ci --omit=dev
npm --prefix frontend ci && npm --prefix frontend run build
sudo cp -r frontend/dist/* /var/www/trichy-vision/
```

`/etc/systemd/system/trichy-vision-api.service`:

```ini
[Unit]
Description=Trichy Vision API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=trichy
WorkingDirectory=/opt/trichy-vision/backend
EnvironmentFile=/opt/trichy-vision/backend/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=trichy-vision-api

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/trichy-vision/media
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now trichy-vision-api
sudo systemctl status trichy-vision-api
```

The process handles `SIGTERM`: it stops accepting connections, drains in-flight requests, closes the
pool, and exits - so restarts do not drop an upload mid-stream.

## 6. Reverse proxy and HTTPS

`/etc/nginx/sites-available/trichy-vision`:

```nginx
server {
    listen 80;
    server_name newsroom.trichyvision.local;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name newsroom.trichyvision.local;

    ssl_certificate     /etc/ssl/trichy-vision/fullchain.pem;
    ssl_certificate_key /etc/ssl/trichy-vision/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Robots-Tag "noindex, nofollow" always;

    client_max_body_size 250m;      # must exceed MAX_UPLOAD_SIZE_MB

    # Static SPA
    root /var/www/trichy-vision;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout    900s;
        proxy_send_timeout    900s;
        proxy_request_buffering off;      # stream large uploads straight through
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Serving the UI and API from the **same origin** is what keeps the session cookie `SameSite=Lax`. The
API trusts exactly one proxy hop, so `req.ip` in the audit trail and the rate limiter is the real
client address.

For an internal-only hostname use an internal CA or a self-signed certificate distributed to office
machines; for a public hostname use Let's Encrypt (`certbot --nginx`).

### n8n reachability

n8n must reach `POST /api/n8n/publish-result`. Either keep both on the office network, or expose only
`/api/n8n/` to the n8n host:

```nginx
location /api/n8n/ {
    allow 10.0.0.25;      # the n8n server
    deny all;
    proxy_pass http://127.0.0.1:4000;
    # ... same proxy_set_header block as above
}
```

## 7. Health checks and monitoring

```
GET /api/health   →  200 {"success":true,"status":"ok",...}
                     503 {"success":false,"status":"degraded",...}  when the database is unreachable
```

Point Uptime Kuma, Zabbix or a cron script at it. Suggested alerts:

| Signal | Threshold |
| --- | --- |
| `/api/health` non-200 | 2 consecutive failures |
| Container/service restarts | more than 3 in an hour |
| `PUBLISH_DISPATCH_FAILED` audit rows | any in the last hour (n8n is down) |
| Posts stuck in `PUBLISHING` | older than 30 minutes (a callback never arrived) |
| Disk free on the media volume | below 15% |

Useful queries:

```sql
-- jobs that never came back
SELECT id, news_id, status, created_at
  FROM publish_jobs
 WHERE status IN ('QUEUED','DISPATCHED','IN_PROGRESS')
   AND created_at < now() - interval '30 minutes';

-- failures still current, per platform
SELECT p.code, COUNT(*)
  FROM (SELECT DISTINCT ON (news_id, platform_id) *
          FROM social_publish_status
         ORDER BY news_id, platform_id, publish_job_id DESC, id DESC) s
  JOIN social_platforms p ON p.id = s.platform_id
 WHERE s.status = 'FAILED'
 GROUP BY p.code;
```

## 8. Logging

The API writes one JSON line per event to stdout/stderr, with anything resembling a secret redacted.

```bash
docker compose logs -f backend            # Docker
sudo journalctl -u trichy-vision-api -f   # systemd
```

Docker log rotation is configured in `docker-compose.yml` (10 MB × 5 files). For systemd, cap the
journal:

```bash
sudo sed -i 's/^#SystemMaxUse=.*/SystemMaxUse=2G/' /etc/systemd/journald.conf
sudo systemctl restart systemd-journald
```

## 9. Backups

Three things must be backed up. Two of them are not on this server.

| What | Where | How |
| --- | --- | --- |
| Database | Supabase | Enable Supabase's automated backups (daily + PITR). Add an off-site dump below. |
| Media originals | office server | Nightly rsync to a second disk / NAS |
| Secrets | `backend/.env` | Password manager, **never** in git |

Off-site database dump (needs `postgresql-client`):

```bash
#!/usr/bin/env bash
# /usr/local/bin/trichy-db-backup.sh
set -euo pipefail
source /opt/trichy-vision/backend/.env
DEST=/srv/backups/trichy-vision
mkdir -p "$DEST"
pg_dump "$DATABASE_URL" --no-owner --format=custom \
  -f "$DEST/trichy-$(date +%F).dump"
find "$DEST" -name 'trichy-*.dump' -mtime +30 -delete
```

Media:

```bash
rsync -a --delete /srv/trichy-vision/media/ /mnt/backup/trichy-media/
```

```cron
15 2 * * * /usr/local/bin/trichy-db-backup.sh
45 2 * * * rsync -a --delete /srv/trichy-vision/media/ /mnt/backup/trichy-media/
```

Test a restore quarterly into a scratch database - a backup nobody has restored is a hope, not a
backup.

## 10. Object storage (optional)

To move media off the local disk onto MinIO or any S3-compatible store:

```bash
npm --prefix backend install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

```bash
STORAGE_DRIVER=s3
S3_ENDPOINT=http://minio.office.local:9000
S3_REGION=us-east-1
S3_BUCKET=trichy-vision-media
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
```

Existing rows keep `storage_driver = 'local'` and continue to be served from disk, so the switch is
safe mid-flight: new uploads go to S3, old ones stay where they are. Copy the old files across and
update `storage_driver` when you want to retire the disk.

## 11. Upgrades

```bash
cd /opt/trichy-vision
git pull
npm --prefix backend run verify:schema      # confirm the schema still matches
docker compose up -d --build                # or: npm ci && systemctl restart trichy-vision-api
curl -fsS https://newsroom.trichyvision.local/api/health
```

Roll back with `git checkout <previous-tag> && docker compose up -d --build`. Nothing in a release
mutates the database, so a rollback needs no data step.

## 12. Go-live checklist

- [ ] `.env` present, `chmod 600`, real `AUTH_SECRET`, not in git
- [ ] `AUTH_COOKIE_SECURE=true` and HTTPS working end to end
- [ ] `npm run verify:schema` clean
- [ ] `npm run seed:platforms` run
- [ ] ADMIN + 3 EDITOR accounts created, passwords handed over securely
- [ ] `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` set and matching n8n
- [ ] `GET /api/n8n/health` returns 200 from the n8n host
- [ ] `/api/health` monitored
- [ ] Media volume on a backed-up disk with room to grow
- [ ] `client_max_body_size` larger than `MAX_UPLOAD_SIZE_MB`
- [ ] Database and media backups scheduled, one restore tested
- [ ] End-to-end rehearsal: create → submit → approve (as another user) → publish → callback → retry
