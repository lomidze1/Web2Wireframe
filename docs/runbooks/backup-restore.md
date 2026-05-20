# Runbook — License & Webhook Backup / Restore

> როდის გამოიყენო: daily/weekly backup cron, ან incident recovery (data loss, accidental delete, schema migration validation).

## ჩვენი backup სტრატეგია (current)

- **სიხშირე:** daily, off-peak hours (recommend 04:00 UTC)
- **რას ვინახავთ:** `licenses` + `webhookevents` collections JSON-ად
- **სად:** ⚠️ TBD — currently writes to `packages/api/backups/`. შენ უნდა გადატანო off-site (S3, GCS, Glacier, ან Backblaze)
- **TTL:** 18 თვე (audit log-ის TTL-ის ტოლი)
- **რას არ ვინახავთ:** `licenseaudits` (already auto-purges; backup-ში არ შედის)

## ერთხელ-შემოწმება (manual run)

```bash
# Local dev (against running mongo):
MONGODB_URI="mongodb://localhost:27017/web2wireframe" \
  pnpm --filter @w2w/api backup:licenses

# Production (read-only role recommended):
MONGODB_URI="mongodb+srv://readonly:****@cluster.mongodb.net/web2wireframe" \
BACKUP_DIR="/var/backups/w2w" \
  pnpm --filter @w2w/api backup:licenses
```

Output: `w2w-licenses-2026-05-20T12-00-00.json` — single file, ~1 KB per license + 200 B per webhook event.

## Cron setup (production)

### Linux/Docker host
```cron
# /etc/cron.d/w2w-backup — daily at 04:00 UTC
0 4 * * * w2w cd /opt/web2wireframe && \
  MONGODB_URI=... BACKUP_DIR=/var/backups/w2w \
  /usr/local/bin/pnpm --filter @w2w/api backup:licenses \
  >> /var/log/w2w-backup.log 2>&1 && \
  aws s3 cp /var/backups/w2w/$(ls -1t /var/backups/w2w | head -1) \
    s3://w2w-backups/licenses/
```

### Kubernetes CronJob (sketch)
```yaml
apiVersion: batch/v1
kind: CronJob
metadata: { name: w2w-license-backup }
spec:
  schedule: "0 4 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: backup
            image: w2w-api:latest
            command: ["pnpm", "--filter", "@w2w/api", "backup:licenses"]
            env:
              - name: MONGODB_URI
                valueFrom: { secretKeyRef: { name: w2w-secrets, key: MONGODB_URI_RO } }
              - name: BACKUP_DIR
                value: /backups
            volumeMounts:
              - { name: backups, mountPath: /backups }
          volumes:
            - name: backups
              persistentVolumeClaim: { claimName: w2w-backups }
```

## Restore (full)

⚠️ **WARNING:** restore overwrites collections. Take a fresh backup of CURRENT state first.

```bash
# 1. Fresh backup of current state (safety net)
MONGODB_URI=... pnpm --filter @w2w/api backup:licenses

# 2. Import using mongosh
mongosh "$MONGODB_URI" << EOF
const data = JSON.parse(cat("/path/to/w2w-licenses-2026-05-20T12-00-00.json"));
db.licenses.drop();
db.webhookevents.drop();
db.licenses.insertMany(data.licenses);
db.webhookevents.insertMany(data.webhookEvents);
db.licenses.countDocuments();
db.webhookevents.countDocuments();
EOF
```

## Restore (single user — common support case)

```bash
# Extract one user's license from a backup
node -e "
  const data = require('/path/to/backup.json');
  const lic = data.licenses.find(l => l.figmaUserId === 'TARGET_USER');
  console.log(JSON.stringify(lic, null, 2));
"

# Manually apply via /api/admin/license/override or mongosh
```

## Verification

After every backup:
1. Confirm file size > 1 KB (empty `[]` collections = 200 B; anything smaller is suspicious)
2. `jq '.counts'` should match `db.licenses.countDocuments()` and `db.webhookevents.countDocuments()`
3. `jq '.licenses[0]'` should pretty-print a real license document

## Threats this protects against
| ცდი | რას აკეთებს backup |
|------|---------------------|
| Accidental `db.licenses.drop()` | Full restore from yesterday's snapshot |
| Storage corruption / replica-set failure | Off-site copy survives MongoDB outage |
| Migration script error (e.g. `failureCount` overwritten) | Restore one collection, replay webhooks |
| Insider data loss | Off-site copy lives outside production credentials |

## Threats this does NOT protect against
- Real-time data loss between backups — last 24h of activity is lost on full restore
- Schema migrations that change document shape — restoring old shape may break new code
- Ransomware that also encrypts the backup directory — keep at least one copy offline / immutable
