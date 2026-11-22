Botgdl3
=======

Minecraft Java AFK bot with website login/register and a separate uptime monitor.

RENDER SERVICES
- Botgdl3: Web Service; repository root; build: npm install; start: npm start.
- Botgdl3-Uptime: Static Site; root directory: uptime-site; publish directory: .

WEB SERVICE ENVIRONMENT
- SESSION_SECRET: long random session secret.
- MC_HOST: Voltra server hostname or IP.
- MC_PORT: optional. A domain with an SRV record is resolved automatically. For a raw IP, set the port supplied by Voltra; without it, 25565 is used.
- BOT_USERNAME: Minecraft bot account name; defaults to Botgdl3.
- MC_AUTH: offline (default) or microsoft.
- MC_VERSION: optional; otherwise Mineflayer attempts version detection.
- UPTIME_ORIGIN: exact URL of the Static Site.
Render supplies PORT automatically.

When a website account registers or logs in, the bot connects to Minecraft. On spawn it sends /tp 93.71 -61 45.32 and then /gamemode creative. It retries dropped connections after 10 seconds. Website login is separate from Minecraft authentication; this first version does not send the Minecraft server's own /login or /register commands.

DEPLOY
1. Create a Node Web Service from this repository. Build command: npm install. Start command: npm start.
2. Add the environment variables above.
3. Create a separate Static Site from this repository, root directory uptime-site and publish directory .
4. Set UPTIME_ORIGIN on the Web Service to the exact Static Site URL.
5. In GitHub Settings > Secrets and variables > Actions, add BOTGDL3_SERVICE_URL with the Web Service base URL.

The scheduled GitHub Actions workflow checks /health every 10 minutes when its runner executes. GitHub may delay scheduled workflows, so uninterrupted uptime is not guaranteed. The Static Site itself cannot run background code; its browser monitor only works while its page is open.

FREE PLAN LIMITS
Render free Web Services spin down after 15 minutes without inbound traffic, may restart, and have an ephemeral filesystem. This prototype stores website accounts in a local JSON file, so accounts can be lost on restart or spin-down. Sessions are also in-memory. Use a persistent external database before relying on accounts. Render's monthly free instance-hour allowance also limits always-on operation.

LOCAL RUN
npm install
cp .env.example .env
npm start
Open http://localhost:3000 after setting MC_HOST and SESSION_SECRET.
