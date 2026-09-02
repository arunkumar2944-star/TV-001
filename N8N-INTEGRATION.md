# n8n integration contract

For the colleague building the Trichy Vision n8n workflows.

## 1. Division of responsibility

| Trichy Vision web application | n8n |
| --- | --- |
| Stores posts, media, platform selection | Publishes to Facebook, Instagram, WhatsApp, YouTube, Telegram, X, Threads |
| Creates publish jobs and per-platform status rows | Holds every platform credential and API detail |
| Triggers the webhook | Handles rate limits, media format rules, account requirements |
| Records results, errors, attempts and audit rows | Reports each platform's outcome back |
| Offers retry of failed platforms only | Publishes only what a job asks for |

The web application contains **no social media API code** and never marks a platform as published on
its own. A platform is `PUBLISHED` only when n8n says so.

## 2. Authentication

One shared secret, `N8N_WEBHOOK_SECRET`, used in both directions.

**Application → n8n** (on the trigger). Both headers are sent:

```
X-N8N-Secret: <N8N_WEBHOOK_SECRET>
X-TrichyVision-Signature: <hex HMAC-SHA256 of the exact request body, keyed with the secret>
```

**n8n → application** (on every `/api/n8n/*` call). Send **either**:

```
X-N8N-Secret: <N8N_WEBHOOK_SECRET>
```

or, if you prefer signing:

```
X-TrichyVision-Signature: <hex HMAC-SHA256 of the raw body, keyed with the secret>
```

Both are compared in constant time. Anything else gets `401` and is logged. Cookies and CSRF do not
apply to these routes.

Verify your credentials at any time:

```bash
curl -H "X-N8N-Secret: $N8N_WEBHOOK_SECRET" https://newsroom.trichyvision.local/api/n8n/health
```

```json
{ "success": true, "data": { "status": "ok", "authenticatedAs": "n8n", "method": "secret",
                             "storageDriver": "local", "webhookConfigured": true } }
```

## 3. The trigger the workflow receives

When a user presses **Publish** (or **Retry**), the application commits the job to PostgreSQL first,
then POSTs this to `N8N_WEBHOOK_URL`:

```json
{
  "jobId": 1001,
  "newsId": 2001,
  "jobType": "PUBLISH",
  "attempt": 1,
  "platforms": ["facebook", "instagram", "youtube", "telegram"],
  "headline": "Trichy corporation approves new bus terminus",
  "contentUrl": "https://newsroom.trichyvision.local/api/n8n/jobs/1001",
  "callbackUrl": "https://newsroom.trichyvision.local/api/n8n/publish-result",
  "triggeredAt": "2026-08-26T09:00:00.000Z"
}
```

The payload is small on purpose: no content, no media, no credentials. A retry looks identical except
`"jobType": "RETRY"`, a higher `attempt`, and **only the failed platforms** in `platforms`.

**Publish only the platforms listed in that array.** Never publish a platform that is not there - it
already succeeded in an earlier attempt.

Respond `2xx` as soon as you have accepted the job. Anything you return is optional; if the body
contains `executionId` (or `execution_id`) and `workflowName`, they are stored on the job:

```json
{ "received": true, "executionId": "{{$execution.id}}", "workflowName": "Trichy Vision Publisher" }
```

## 4. Fetching the post content

```
GET /api/n8n/jobs/1001
X-N8N-Secret: <secret>
```

```json
{
  "success": true,
  "data": {
    "job": { "id": 1001, "newsId": 2001, "jobType": "PUBLISH", "status": "DISPATCHED",
             "attempt": 1, "createdAt": "2026-08-26T09:00:00.000Z" },
    "news": {
      "id": 2001,
      "headline": "Trichy corporation approves new bus terminus",
      "summary": "Work starts next month near Chatram bus stand.",
      "content": "Full story text ...",
      "source": "Staff reporter",
      "category": "Local",
      "district": "Tiruchirappalli",
      "state": "Tamil Nadu",
      "country": "India",
      "status": "PUBLISHING",
      "createdAt": "2026-08-26T08:10:00.000Z",
      "approvedAt": "2026-08-26T08:55:00.000Z"
    },
    "platforms": [
      { "code": "facebook", "name": "Facebook", "status": "PENDING", "attempt": 0, "platformContent": null },
      { "code": "youtube",  "name": "YouTube",  "status": "PENDING", "attempt": 0, "platformContent": null }
    ],
    "media": [
      { "id": 51, "mediaType": "MAIN_IMAGE", "originalFilename": "terminus.jpg",
        "mimeType": "image/jpeg", "fileSize": 482113, "width": 1600, "height": 900,
        "durationSeconds": null,
        "downloadUrl": "https://newsroom.trichyvision.local/api/n8n/media/51/file",
        "signedUrl": null },
      { "id": 52, "mediaType": "VIDEO", "originalFilename": "terminus.mp4",
        "mimeType": "video/mp4", "fileSize": 18344012, "width": 1920, "height": 1080,
        "durationSeconds": 48.5,
        "downloadUrl": "https://newsroom.trichyvision.local/api/n8n/media/52/file",
        "signedUrl": null }
    ],
    "callbackUrl": "https://newsroom.trichyvision.local/api/n8n/publish-result"
  }
}
```

Notes:

- `platforms` lists **only** what this job is responsible for.
- `downloadUrl` needs the same `X-N8N-Secret` header and supports HTTP range requests.
- `signedUrl` is a direct, time-limited object-storage URL and is non-null only when the deployment
  uses S3/MinIO. Prefer it when present - it saves streaming through the API.
- `platformContent` is reserved for per-platform captions. It is `null` today; when the newsroom
  starts using it, prefer it over `content` for that platform.

Media roles: `MAIN_IMAGE`, `NEWS_POSTER`, `AD_POSTER`, `IMAGE`, `VIDEO`, `AUDIO`.

## 5. Reporting results

`POST /api/n8n/publish-result` — **once per platform**, as soon as that platform finishes.
Do not wait for the whole job.

### Success

```json
{
  "jobId": 1001,
  "newsId": 2001,
  "platform": "youtube",
  "status": "PUBLISHED",
  "externalPostId": "abc123",
  "publishedUrl": "https://youtu.be/abc123",
  "executionId": "n8n-execution-id",
  "workflowName": "Trichy Vision Publisher"
}
```

### Failure

```json
{
  "jobId": 1001,
  "newsId": 2001,
  "platform": "youtube",
  "status": "FAILED",
  "errorType": "API_ERROR",
  "message": "Publishing failed",
  "retryAllowed": true,
  "executionId": "n8n-execution-id",
  "workflowName": "Trichy Vision Publisher"
}
```

### Batch (optional)

```json
{
  "jobId": 1001,
  "newsId": 2001,
  "executionId": "n8n-execution-id",
  "workflowName": "Trichy Vision Publisher",
  "results": [
    { "platform": "facebook", "status": "PUBLISHED", "externalPostId": "fb_1", "publishedUrl": "https://..." },
    { "platform": "telegram", "status": "PUBLISHED", "externalPostId": "tg_9" },
    { "platform": "youtube",  "status": "FAILED", "errorType": "QUOTA_EXCEEDED",
      "message": "Daily upload limit reached", "retryAllowed": true }
  ]
}
```

### Fields

| Field | Required | Notes |
| --- | :---: | --- |
| `jobId` | yes | From the trigger. Top level `jobId` applies to every entry in `results`. |
| `newsId` | no | Validated against the job if sent; mismatch is rejected. |
| `platform` | yes | Lower-case code: `facebook`, `instagram`, `whatsapp`, `youtube`, `telegram`, `x`, `threads` |
| `status` | yes | `PENDING`, `READY`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `CANCELLED` |
| `externalPostId` | no | The platform's own id - shown in the UI, useful for support |
| `publishedUrl` | no | Deep link to the live post |
| `errorType` | on failure | Short machine code, e.g. `API_ERROR`, `AUTH_ERROR`, `RATE_LIMIT`, `INVALID_MEDIA`, `QUOTA_EXCEEDED`, `TIMEOUT` |
| `message` | on failure | Human readable, shown to the newsroom (max 2000 chars) |
| `retryAllowed` | no | Default `true`. Send `false` for a permanent failure - the Retry button is then withheld. |
| `executionId` | no | `{{$execution.id}}` - stored on the job and in the audit trail |
| `workflowName` | no | Stored alongside it |

### Response

```json
{ "success": true, "data": {
  "accepted": 1, "duplicates": 0, "jobStatus": "PARTIAL", "newsStatus": "PARTIALLY_PUBLISHED",
  "platforms": [{ "platform": "youtube", "status": "FAILED", "duplicate": false }] } }
```

| Status | Meaning |
| --- | --- |
| `200` | Recorded (check `duplicates`) |
| `400` | Bad payload, unknown platform, or that platform is not part of this job |
| `401` | Missing or invalid secret / signature |
| `404` | No such job |

## 6. Optional progress ping

```
POST /api/n8n/job-progress
{ "jobId": 1001, "platform": "youtube", "executionId": "...", "workflowName": "..." }
```

Moves that platform `PENDING → PUBLISHING` and the job to `IN_PROGRESS`, so the newsroom sees
movement on long uploads. Entirely optional.

## 7. What the application does with your results

```
each result → social_publish_status (job, platform) updated, attempt_count + 1
            → publish_jobs.status recomputed from that job's platform rows
            → news.status recomputed from the LATEST status of every targeted platform
            → news_execution_audit row written
```

| Platform outcomes | `news.status` | `publish_jobs.status` |
| --- | --- | --- |
| anything still in flight | `PUBLISHING` | `IN_PROGRESS` |
| some published + some failed | `PARTIALLY_PUBLISHED` | `PARTIAL` |
| all published | `PUBLISHED` | `COMPLETED` |
| all failed | `FAILED` | `FAILED` |

Partial success is never reported as fully published.

## 8. Idempotency — important

The logical publishing operation is **`(jobId, platform)`**, backed by a unique database index.

- Sending the same `PUBLISHED` callback twice does **not** create a second success and does **not**
  increment `attempt_count`. The repeat is recorded as `PUBLISH_CALLBACK_DUPLICATE` and the response
  reports `"duplicates": 1`.
- A success is **never** downgraded by a later `FAILED` callback for the same job and platform.
- Retrying at your end is therefore safe: if you are unsure whether a callback arrived, send it again.

## 9. Retry behaviour

Retry is driven from the Trichy Vision UI, not by n8n.

1. A user opens the job and presses **Retry** on a failed platform (or *Retry all failed*).
2. The application creates a **new** job (`jobType: "RETRY"`, higher `attempt`) whose `platforms`
   array contains **only** the failed, retryable platforms.
3. You receive a normal trigger and publish exactly those platforms.

Guarantees you can rely on:

- A platform that reported `PUBLISHED` is never sent again.
- `retryAllowed: false` removes the Retry button for that platform entirely.
- Only one job per post is ever live - a second publish is refused with `409` while one is running.

## 10. Failure scenarios

| Situation | Application behaviour | What you should do |
| --- | --- | --- |
| n8n unreachable / non-2xx | Job `FAILED`, platforms `FAILED` with `DISPATCH_ERROR`, retry allowed | Nothing - the newsroom retries |
| n8n **times out** | Job stays `DISPATCHED` with a warning; nothing marked failed | If you did receive it, finish and send the callbacks - they will be accepted |
| One platform fails | That platform `FAILED`, others unaffected | Report each platform separately |
| All platforms fail | Post `FAILED` | Report each failure with an `errorType` |
| Duplicate callback | Ignored, counted as a duplicate | Safe to resend |
| Callback for a platform not in the job | `400` | Only report platforms from the trigger |
| Callback for an unknown job | `404` | Check `jobId` |
| Invalid media | Report `errorType: "INVALID_MEDIA"`, `retryAllowed: false` | The newsroom fixes the media and publishes a new post |
| Rate limit | Report `errorType: "RATE_LIMIT"`, `retryAllowed: true` | The newsroom retries later |
| Platform auth failure | Report `errorType: "AUTH_ERROR"`, `retryAllowed: false` | Fix the credential in n8n, then the newsroom retries |

## 11. Suggested workflow shape

```
Webhook (POST, secret header check)
  → HTTP Request: GET {{$json.contentUrl}}   header X-N8N-Secret
  → Split platforms  ({{$json.platforms}})
  → Switch on the platform code
       ├─ facebook  → Facebook node   → callback
       ├─ instagram → Instagram node  → callback
       ├─ whatsapp  → WhatsApp node   → callback
       ├─ youtube   → YouTube node    → callback
       ├─ telegram  → Telegram node   → callback
       ├─ x         → X node          → callback
       └─ threads   → Threads node    → callback
```

Where **callback** is `POST {{$json.callbackUrl}}` with the `X-N8N-Secret` header and the result
payload from section 5. Attach an error branch to every platform node so a failure is reported rather
than swallowed - a platform that never calls back leaves the post stuck in `PUBLISHING`.

## 12. Configuration checklist

On the Trichy Vision server (`backend/.env`):

```
N8N_WEBHOOK_URL=https://n8n.office.local/webhook/trichy-vision-publish
N8N_WEBHOOK_SECRET=<same long random value on both sides>
N8N_TIMEOUT_MS=15000
PUBLIC_API_URL=https://newsroom.trichyvision.local
```

`PUBLIC_API_URL` is what `contentUrl` and `callbackUrl` are built from - set it to the address n8n
can actually reach.

In n8n: store the same secret as a credential, never inline in a node.

## 13. Manual test without the UI

```bash
SECRET='your-shared-secret'
BASE='https://newsroom.trichyvision.local'

# 1. credentials
curl -s -H "X-N8N-Secret: $SECRET" "$BASE/api/n8n/health"

# 2. fetch a job (publish a post from the UI first to get a jobId)
curl -s -H "X-N8N-Secret: $SECRET" "$BASE/api/n8n/jobs/1001"

# 3. report a success
curl -s -X POST "$BASE/api/n8n/publish-result" \
  -H "X-N8N-Secret: $SECRET" -H 'Content-Type: application/json' \
  -d '{"jobId":1001,"platform":"telegram","status":"PUBLISHED","externalPostId":"tg_1"}'

# 4. report a failure
curl -s -X POST "$BASE/api/n8n/publish-result" \
  -H "X-N8N-Secret: $SECRET" -H 'Content-Type: application/json' \
  -d '{"jobId":1001,"platform":"youtube","status":"FAILED","errorType":"API_ERROR","message":"Publishing failed","retryAllowed":true}'
```

After step 4 the post should read `PARTIALLY_PUBLISHED` on the dashboard, with a Retry button on
YouTube only.
