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
