# Deploying to production (maktabali.com)

Production: `169.58.35.214`, app at `/opt/maktabali-app`, systemd unit `maktabali.service`
(listening on `127.0.0.1:3000`), nginx + Let's Encrypt in front. Self-hosted Supabase at
`https://api.maktabali.com`.

## The one thing that will bite you

`VITE_*` variables are inlined by Vite **at build time**, not read at runtime. Building
without the production env bakes the local dev Supabase URL (`http://127.0.0.1:54321`) into
the client bundle. The server still returns **HTTP 200** with an HTML shell, so a status-code
check passes while every visitor sees a **blank page**.

This shipped to production on 2026-07-20 and went unnoticed through two deploys because the
only verification was `curl -o /dev/null -w "%{http_code}"`. **HTTP 200 is not proof of a
working deploy.** Verify rendered content.

`.env.production` (gitignored) supplies the correct values and takes precedence over
`.env.local` for `npm run build`. If it goes missing, the bug returns.

## Steps

```bash
# 1. Build with the production preset
NITRO_PRESET=node-server npm run build

# 2. GUARD — refuses to proceed if the bundle points at localhost. Never skip.
npm run predeploy

# 3. Ship (only if step 2 exited 0)
tar -czf /tmp/output.tgz .output
scp /tmp/output.tgz deploy@169.58.35.214:/tmp/output.tgz
ssh deploy@169.58.35.214 'set -e
  cd /opt/maktabali-app
  sudo rm -rf .output.bak && sudo mv .output .output.bak      # keep rollback
  sudo tar -xzf /tmp/output.tgz -C /opt/maktabali-app
  sudo chown -R deploy:deploy .output
  sudo systemctl restart maktabali.service'
```

## Verify by rendered content, not status code

```bash
# SSR HTML must carry real markup. A broken build returns ~10KB of empty shell;
# a healthy home page is ~25KB with Arabic text.
curl -s https://maktabali.com | wc -c
curl -s https://maktabali.com | grep -c "قطع غيار"

# Server-side data fetch must not be failing
ssh deploy@169.58.35.214 \
  'sudo journalctl -u maktabali.service --since "$(systemctl show maktabali.service -p ActiveEnterTimestamp --value)" \
   --no-pager | grep -cE "ECONNREFUSED|fetch failed"'     # must be 0
```

In a browser: `document.body.innerText.length > 0`, and no React error #419 in the console
(#419 means the SSR Suspense boundary failed — usually the data fetch above).

## Rollback

The previous build is kept at `/opt/maktabali-app/.output.bak` until the next deploy:

```bash
ssh deploy@169.58.35.214 'set -e
  cd /opt/maktabali-app
  sudo rm -rf .output && sudo mv .output.bak .output
  sudo systemctl restart maktabali.service'
```

## Notes

- `/opt/maktabali-app/app.env` holds **runtime** server vars (service-role key, `ADMIN_OTP_ENABLED`).
  Its `SUPABASE_URL=http://127.0.0.1:8000` is Kong-internal and correct for server-side use —
  the *client* needs the public `https://api.maktabali.com`. Don't copy one into the other.
- Apple client secret expires **2027-01-18**; runbook at `/root/apple/README-apple.txt`.
