# Server Credentials & Setup Info

## SSH Connection
```bash
sshpass -p 'xqk5zyd2ahj-DUV2dgf' ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no -o StrictHostKeyChecking=no root@195.20.236.84 'COMMAND'
```

## Server Details
- **Host:** 195.20.236.84
- **Hostname:** smartergerman.com
- **SSH User:** root
- **SSH Password:** xqk5zyd2ahj-DUV2dgf
- **Web Root:** /var/www/vhosts/smartergerman.com/

## SSL Setup (Plesk + Let's Encrypt)
```bash
# 1. Create subdomain
plesk bin subdomain --create conversation -domain smartergerman.com -www-root conversation.smartergerman.com

# 2. Issue SSL certificate
plesk ext sslit --certificate -issue -domain conversation.smartergerman.com -registrationEmail michael@smartergerman.com -secure-domain -secure-www

# 3. Enable HSTS
plesk ext sslit --hsts -enable -domain conversation.smartergerman.com -max-age 6months
```

## Related Subdomains
- **learn.smartergerman.com** - LifterLMS course site
- **courses.smartergerman.com** - Teachable courses
- **write.smartergerman.com** - Writing tool (protected)
- **speak.smartergerman.com** - Speaking tool (protected)
- **conversation.smartergerman.com** - This app (to be created)

## APIs Available
- **LifterLMS REST API:**
  - Site: https://learn.smartergerman.com
  - Consumer Key: ck_845838d29bc3083f26ce4796589fea798eb59815
  - Consumer Secret: cs_bf80f35c58e590448865072a76814615fd731fe3

- **WordPress REST API (learn.smartergerman.com):**
  - User: michael_admin
  - App Password: SRwj ZP0j xGhm CS2S LZ11 Tasg

## Authentication Strategy
This app should only be accessible to logged-in users from:
- Teachable courses (courses.smartergerman.com)
- LifterLMS courses (learn.smartergerman.com)

Use iframe embedding with JWT/token verification similar to write.smartergerman.com and speak.smartergerman.com.

---

## Redis (Session Storage)

Self-hosted Redis on the same server for multi-instance Cloud Run session sharing.

### Connection Details
- **Host:** 195.20.236.84
- **Port:** 6379
- **Password:** 3LbsEQC04vUP2h4iaLuabntEReVuZXpV
- **URL:** `redis://:3LbsEQC04vUP2h4iaLuabntEReVuZXpV@195.20.236.84:6379`

### What Redis Stores
| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `session_token:{token}` | Auth tokens (one-time use) | 30 sec |
| `session:{id}` | Active conversation sessions | 2 hours |
| `usage:{user}:{date}` | Daily usage tracking per user | 25 hours |
| `oauth_state:{state}` | Teachable OAuth state | 10 min |

### Monitoring Commands
```bash
# Quick status check
ssh root@195.20.236.84 '/usr/local/bin/redis-status'

# Manual Redis CLI (password required)
ssh root@195.20.236.84 'redis-cli -a 3LbsEQC04vUP2h4iaLuabntEReVuZXpV'

# View all keys
redis-cli -a 3LbsEQC04vUP2h4iaLuabntEReVuZXpV KEYS "*"

# Check memory usage
redis-cli -a 3LbsEQC04vUP2h4iaLuabntEReVuZXpV INFO memory

# View active sessions
redis-cli -a 3LbsEQC04vUP2h4iaLuabntEReVuZXpV KEYS "session:*"
```

### Security Hardening Applied
- Password authentication required
- Dangerous commands disabled (FLUSHDB, FLUSHALL, DEBUG, CONFIG)
- SHUTDOWN renamed to `REDIS_SHUTDOWN_b7x9k2`
- Memory limited to 100MB with LRU eviction
- Logging enabled at `/var/log/redis/redis-server.log`

### Config File Location
- **Config:** `/etc/redis/redis.conf`
- **Backup:** `/etc/redis/redis.conf.backup`
- **Log:** `/var/log/redis/redis-server.log`

### Restart Redis
```bash
ssh root@195.20.236.84 'systemctl restart redis-server && systemctl status redis-server'
```

---

## Security Measures (2026-01-30)

### Server-Side
- **Redis-backed tokens:** Session tokens stored in Redis (not memory) for multi-instance support
- **Token off URL:** WebSocket auth tokens sent via message, not URL (prevents logging)
- **Rate limiting:** Token bucket algorithm (100 msg/sec sustained, 200 burst) per WebSocket
- **One-time tokens:** Auth tokens consumed on use, preventing replay attacks

### Client-Side
- **XSS prevention:** `escapeHtml()` for all user-controlled content
- **Prompt injection:** `sanitizeForPrompt()` strips dangerous characters from mission data
- **PostMessage origin:** Restricted to allowed parent origins only (no wildcard)
- **Audio validation:** Size limits on audio chunks (5MB max)
- **Memory protection:** Audio queue capped at 100 chunks

### Files Changed
- `server/redis_storage.py` - Redis abstraction layer
- `server/main.py` - Token storage, WebSocket auth, rate limiting
- `server/usage_tracker.py` - Redis-backed usage tracking
- `server/teachable_auth.py` - Redis-backed OAuth state
- `src/components/view-chat.js` - XSS/prompt injection prevention
- `src/lib/gemini-live/geminilive.js` - Token via WebSocket
- `src/components/app-root.js` - PostMessage origin fix
- `src/lib/gemini-live/mediaUtils.js` - Audio size validation
- `public/audio-processors/playback.worklet.js` - Queue size limit

---

## Deployment

### GitHub Actions (Auto-Deploy)
Pushes to `main` trigger automatic deployment to Cloud Run.

### Manual Deploy
```bash
gh workflow run deploy.yml
```

### Environment Variables (GitHub Secrets)
| Secret | Purpose |
|--------|---------|
| `ACCESS_PASSWORD` | Password for direct access |
| `JWT_SECRET` | Signing key for JWTs |
| `REDIS_URL` | Redis connection string |
| `TEACHABLE_CLIENT_ID` | Teachable OAuth |
| `TEACHABLE_CLIENT_SECRET` | Teachable OAuth |
| `QWEN_API_KEY` | Qwen AI provider |

### Cloud Run Service
- **Project:** smartergerman-conversation
- **Service:** conversation-tool
- **Region:** us-central1
