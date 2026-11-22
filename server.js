
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const mineflayer = require("mineflayer");
const dns = require("node:dns").promises;
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");

const app = express();
const PORT = Number(process.env.PORT || 3000);

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET gerekli.");
}

const dataDir = path.join(__dirname, "data");
const usersFile = path.join(dataDir, "users.json");

fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(usersFile)) {
  fs.writeFileSync(usersFile, "[]");
}

app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));

app.use(session({
  name: "botgdl3.sid",
  secret: process.env.SESSION_SECRET || "dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 604800000
  }
}));

const limiter = rateLimit({
  windowMs: 900000,
  limit: 12
});

app.use("/api/login", limiter);
app.use("/api/register", limiter);

const readUsers = () => {
  try {
    return JSON.parse(fs.readFileSync(usersFile, "utf8"));
  } catch {
    return [];
  }
};

const saveUsers = users => {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
};

const auth = (req, res, next) => {
  if (req.session.user) return next();

  return res.status(401).json({
    error: "Önce giriş yapmalısın."
  });
};

let bot = null;
let state = "stopped";
let message = "Bot başlatılıyor...";
let timer = null;
let stopRequested = false;
let connecting = false;
let generation = 0;

function formatReason(reason) {
  if (typeof reason === "string") return reason;

  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

async function resolveServer() {
  const host = (process.env.MC_HOST || "").trim();

  if (!host || host === "your-voltra-server-address") {
    throw new Error("MC_HOST ayarlanmamış.");
  }

  if (process.env.MC_PORT) {
    const port = Number(process.env.MC_PORT);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("MC_PORT geçersiz.");
    }

    return { host, port };
  }

  if (net.isIP(host)) {
    return { host, port: 25565 };
  }

  try {
    const records = await dns.resolveSrv("_minecraft._tcp." + host);

    if (records.length) {
      records.sort((a, b) =>
        a.priority - b.priority || b.weight - a.weight
      );

      return {
        host: records[0].name.replace(/\.$/, ""),
        port: records[0].port
      };
    }
  } catch (err) {
    console.log("SRV kaydı bulunamadı:", err.message);
  }

  return { host, port: 25565 };
}

function retry() {
  if (stopRequested || timer) return;

  timer = setTimeout(() => {
    timer = null;

    startBot().catch(err => {
      console.error("Yeniden bağlantı hatası:", err.message);
    });
  }, 10000);
}

async function startBot() {
  if (bot || connecting) return;

  connecting = true;
  stopRequested = false;

  const currentGeneration = ++generation;

  state = "connecting";
  message = "Voltra sunucusuna bağlanılıyor...";

  console.log(message);

  try {
    const target = await resolveServer();

    if (stopRequested || currentGeneration !== generation) return;

    const options = {
      host: target.host,
      port: target.port,
      username: process.env.BOT_USERNAME || "Botgdl3",
      auth:
        (process.env.MC_AUTH || "offline").toLowerCase() === "microsoft"
          ? "microsoft"
          : "offline"
    };

    if (process.env.MC_VERSION) {
      options.version = process.env.MC_VERSION;
    }

    console.log(
      "Minecraft hedefi:",
      target.host + ":" + target.port
    );

    const b = mineflayer.createBot(options);
    bot = b;

    b.once("login", () => {
      if (bot !== b) return;

      state = "online";
      message = "Minecraft sunucusuna giriş yapıldı.";

      console.log(message);
    });

    b.once("spawn", () => {
      if (bot !== b || stopRequested) return;

      state = "online";
      message = "Bot oyunda.";

      console.log(message);

      setTimeout(() => {
        if (bot !== b || stopRequested) return;

        b.chat("/tp 93.71 -61 45.32");
        console.log("TP komutu gönderildi.");

        setTimeout(() => {
          if (bot !== b || stopRequested) return;

          b.chat("/gamemode creative");
          console.log("Creative komutu gönderildi.");

        }, 1800);

      }, 1200);
    });

    b.on("kicked", reason => {
      const detail = formatReason(reason);

      message = "Sunucudan çıkarıldı: " + detail;

      console.log("KICK REASON:", detail);
    });

    b.on("error", err => {
      if (bot !== b) return;

      state = "error";
      message = "Minecraft bağlantı hatası: " + err.message;

      console.error(message);
    });

    b.once("end", reason => {
      if (bot === b) bot = null;

      connecting = false;

      if (!stopRequested && currentGeneration === generation) {
        state = "reconnecting";

        message = "Bağlantı kesildi. 10 saniye sonra tekrar denenecek.";

        console.log(message);
        console.log("END REASON:", formatReason(reason));

        retry();
      } else {
        state = "stopped";
        message = "Bot durduruldu.";
      }
    });

  } catch (err) {
    connecting = false;
    state = "error";
    message = err.message;

    console.error("Bot başlatma hatası:", err.message);

    retry();
    throw err;

  } finally {
    connecting = false;
  }
}

function stopBot() {
  stopRequested = true;
  generation++;

  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  const currentBot = bot;
  bot = null;

  if (currentBot) {
    try {
      currentBot.quit("Dashboard stop");
    } catch (err) {
      console.error(err.message);
    }
  }

  state = "stopped";
  message = "Bot durduruldu.";
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Botgdl3",
    bot: state,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/register", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({
      error: "Kullanıcı adı 3-20 karakter olmalı."
    });
  }

  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({
      error: "Şifre 8-72 karakter arasında olmalı."
    });
  }

  const users = readUsers();

  if (users.some(u =>
    u.username.toLowerCase() === username.toLowerCase()
  )) {
    return res.status(409).json({
      error: "Bu kullanıcı adı zaten kayıtlı."
    });
  }

  users.push({
    username,
    passwordHash: await bcrypt.hash(password, 12)
  });

  saveUsers(users);

  req.session.user = { username };

  res.json({ ok: true, username });
});

app.post("/api/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  const user = readUsers().find(u =>
    u.username.toLowerCase() === username.toLowerCase()
  );

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({
      error: "Kullanıcı adı veya şifre hatalı."
    });
  }

  req.session.user = { username: user.username };

  res.json({
    ok: true,
    username: user.username
  });
});

app.post("/api/logout", auth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/me", auth, (req, res) => {
  res.json({
    username: req.session.user.username
  });
});

app.get("/api/status", auth, (req, res) => {
  res.json({
    state,
    message,
    botUsername: process.env.BOT_USERNAME || "Botgdl3"
  });
});

app.post("/api/bot/start", auth, async (req, res) => {
  try {
    await startBot();

    res.json({
      ok: true,
      state,
      message
    });

  } catch (err) {
    res.status(503).json({
      error: err.message,
      state
    });
  }
});

app.post("/api/bot/stop", auth, (req, res) => {
  stopBot();

  res.json({
    ok: true,
    state
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Botgdl3 listening on " + PORT);
  console.log("Minecraft bot otomatik başlatılıyor...");

  startBot().catch(err => {
    console.error("Bot başlatılamadı:", err.message);
  });
});
