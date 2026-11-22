
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const mineflayer = require("mineflayer");
const dns = require("node:dns").promises;
const fs = require("node:fs");
const path = require("node:path");

const app = express();

const PORT = process.env.PORT || 3000;

const MC_HOST = process.env.MC_HOST || "bensmp.mc-hosting.xyz";
const MC_PORT = Number(process.env.MC_PORT || 34606);
const BOT_USERNAME = process.env.BOT_USERNAME || "Botgdl3";
const MC_AUTH = process.env.MC_AUTH || "offline";

// ŞİFRELERİ BURAYA YAZ
const MC_PASSWORD = "ben181819";
const MC_REGISTER_PASSWORD = "ben181819";

// Voltra standart AuthMe komutları
const LOGIN_COMMAND = "/login";
const REGISTER_COMMAND = "/register";

// Hedef konum
const TP_COMMAND = "/tp 93.71 -61 45.32";
const GAMEMODE_COMMAND = "/gamemode creative";

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({}));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100
  })
);

app.use(express.static(path.join(__dirname, "public")));

let bot = null;
let botOnline = false;
let botConnecting = false;
let botStopping = false;
let reconnectTimer = null;
let authCompleted = false;
let authStarted = false;
let actionCompleted = false;
let connectionGeneration = 0;

const state = {
  status: "offline",
  username: BOT_USERNAME,
  host: MC_HOST,
  port: MC_PORT,
  lastError: null,
  lastMessage: null,
  lastUpdate: new Date().toISOString()
};

function updateState(status, message = null) {
  state.status = status;
  state.lastMessage = message;
  state.lastUpdate = new Date().toISOString();

  console.log(`[BOT] ${status}`, message || "");
}

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function cleanText(message) {
  if (typeof message === "string") return message;

  if (message && typeof message === "object") {
    if (message.text) {
      return String(message.text);
    }

    if (Array.isArray(message.extra)) {
      return message.extra.map(cleanText).join("");
    }
  }

  return String(message || "");
}

async function resolveServer() {
  try {
    const records = await dns.resolveSrv(
      `_minecraft._tcp.${MC_HOST}`
    );

    if (records && records.length > 0) {
      return {
        host: records[0].name,
        port: records[0].port
      };
    }
  } catch {}

  return {
    host: MC_HOST,
    port: MC_PORT
  };
}

function scheduleReconnect(generation) {
  if (botStopping || generation !== connectionGeneration) return;
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    if (!botStopping && generation === connectionGeneration) {
      startBot();
    }
  }, 15000);
}

function sendCommand(command) {
  if (!bot || !botOnline) {
    console.log("[BOT] Komut gönderilemedi: Bot çevrimdışı.");
    return false;
  }

  console.log("[BOT] Komut:", command);
  bot.chat(command);
  return true;
}

function runAfterLogin() {
  if (actionCompleted || !botOnline || !authCompleted) return;

  actionCompleted = true;

  setTimeout(() => {
    if (!botOnline || !bot) return;

    sendCommand(TP_COMMAND);

    setTimeout(() => {
      if (!botOnline || !bot) return;

      sendCommand(GAMEMODE_COMMAND);
      updateState("online", "Giriş tamamlandı ve komutlar gönderildi.");
    }, 3000);
  }, 2000);
}

function beginAuthentication() {
  if (!bot || !botOnline || authStarted) return;

  authStarted = true;

  if (!MC_PASSWORD || MC_PASSWORD === "ben181819") {
    state.lastError = "MC_PASSWORD ayarlanmamış.";
    updateState("auth-error", state.lastError);
    console.error(state.lastError);
    return;
  }

  console.log("[AUTH] Sunucu kimlik doğrulaması başlıyor.");

  setTimeout(() => {
    if (!botOnline || !bot) return;

    // Önce kayıtlı hesap için giriş dene.
    sendCommand(`${LOGIN_COMMAND} ${MC_PASSWORD}`);
  }, 2500);
}

function handleAuthMessage(message) {
  const text = cleanText(message).toLowerCase();

  console.log("[CHAT]", cleanText(message));

  // Giriş başarılı mesajları
  if (
    text.includes("successfully logged") ||
    text.includes("başarıyla giriş") ||
    text.includes("giriş yaptınız") ||
    text.includes("logged in") ||
    text.includes("successfully authenticated")
  ) {
    authCompleted = true;
    updateState("authenticated", "Minecraft girişi başarılı.");
    runAfterLogin();
    return;
  }

  // Kayıt gerektiren mesajlar
  if (
    text.includes("please register") ||
    text.includes("register first") ||
    text.includes("kayıt ol") ||
    text.includes("kayıt olmalısınız") ||
    text.includes("not registered")
  ) {
    if (
      !MC_REGISTER_PASSWORD ||
      MC_REGISTER_PASSWORD === "ben181819"
    ) {
      updateState("auth-error", "Kayıt şifresi ayarlanmamış.");
      return;
    }

    console.log("[AUTH] Hesap kayıtlı değil. Kayıt deneniyor.");

    setTimeout(() => {
      if (!botOnline || !bot || authCompleted) return;

      sendCommand(
        `${REGISTER_COMMAND} ${MC_REGISTER_PASSWORD} ${MC_REGISTER_PASSWORD}`
      );
    }, 1500);

    return;
  }

  // Kayıt başarılı mesajları
  if (
    text.includes("successfully registered") ||
    text.includes("başarıyla kayıt") ||
    text.includes("registration successful")
  ) {
    console.log("[AUTH] Kayıt tamamlandı.");

    setTimeout(() => {
      if (!botOnline || !bot) return;

      sendCommand(`${LOGIN_COMMAND} ${MC_PASSWORD}`);
    }, 1500);
  }

  // Şifre yanlış mesajları
  if (
    text.includes("wrong password") ||
    text.includes("incorrect password") ||
    text.includes("yanlış şifre") ||
    text.includes("invalid password")
  ) {
    updateState("auth-error", "Minecraft şifresi yanlış.");
  }
}

async function startBot() {
  if (botConnecting || botOnline || botStopping) return;

  botConnecting = true;
  authCompleted = false;
  authStarted = false;
  actionCompleted = false;

  const generation = ++connectionGeneration;

  updateState("connecting", "Voltra sunucusuna bağlanılıyor...");

  try {
    const target = await resolveServer();

    if (generation !== connectionGeneration || botStopping) return;

    console.log("Minecraft hedefi:", target.host, target.port);

    const newBot = mineflayer.createBot({
      host: target.host,
      port: target.port,
      username: BOT_USERNAME,
      auth: MC_AUTH === "microsoft" ? "microsoft" : "offline",
      version: false,
      hideErrors: false,
      checkTimeoutInterval: 60000
    });

    bot = newBot;

    newBot.on("login", () => {
      if (generation !== connectionGeneration) return;

      botOnline = true;
      updateState("online", "Minecraft sunucusuna giriş yapıldı.");
    });

    newBot.on("spawn", () => {
      if (generation !== connectionGeneration) return;

      botOnline = true;
      updateState("spawned", "Bot dünyaya girdi.");

      beginAuthentication();
    });

    newBot.on("messagestr", (message) => {
      if (generation !== connectionGeneration) return;

      handleAuthMessage(message);
    });

    newBot.on("kicked", (reason) => {
      const reasonText = cleanText(reason);

      state.lastError = reasonText;
      console.error("[KICK]", reasonText);
      updateState("kicked", reasonText);
    });

    newBot.on("error", (error) => {
      if (generation !== connectionGeneration) return;

      state.lastError = error.message;
      console.error("[BOT ERROR]", error.message);
    });

    newBot.on("end", (reason) => {
      if (generation !== connectionGeneration) return;

      console.log("[BOT] Bağlantı kapandı:", reason);

      botOnline = false;
      botConnecting = false;
      bot = null;

      updateState("offline", String(reason || "Bağlantı kesildi."));

      scheduleReconnect(generation);
    });

  } catch (error) {
    state.lastError = error.message;
    console.error("[START ERROR]", error);

    updateState("error", error.message);
    scheduleReconnect(generation);
  } finally {
    botConnecting = false;
  }
}

function stopBot() {
  botStopping = true;
  connectionGeneration++;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (bot) {
    bot.quit("Bot durduruldu.");
    bot = null;
  }

  botOnline = false;
  botConnecting = false;

  updateState("offline", "Bot manuel olarak durduruldu.");
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: state.status
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    ...state,
    online: botOnline
  });
});

app.post("/api/bot/start", (req, res) => {
  botStopping = false;
  startBot();

  res.json({
    success: true,
    message: "Bot başlatma isteği gönderildi."
  });
});

app.post("/api/bot/stop", (req, res) => {
  stopBot();

  res.json({
    success: true,
    message: "Bot durduruldu."
  });
});

app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || password.length < 6) {
      return res.status(400).json({
        error: "Kullanıcı adı ve en az 6 karakterli şifre gerekli."
      });
    }

    const users = loadUsers();

    if (users[username]) {
      return res.status(409).json({
        error: "Bu kullanıcı adı zaten kayıtlı."
      });
    }

    users[username] = {
      password: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString()
    };

    saveUsers(users);

    req.session.username = username;

    res.json({
      success: true,
      message: "Kayıt başarılı."
    });
  } catch (error) {
    res.status(500).json({
      error: "Kayıt sırasında hata oluştu."
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = loadUsers();

    if (
      !username ||
      !password ||
      !users[username] ||
      !(await bcrypt.compare(password, users[username].password))
    ) {
      return res.status(401).json({
        error: "Kullanıcı adı veya şifre yanlış."
      });
    }

    req.session.username = username;

    res.json({
      success: true,
      message: "Giriş başarılı."
    });
  } catch (error) {
    res.status(500).json({
      error: "Giriş sırasında hata oluştu."
    });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      success: true
    });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session.username) {
    return res.status(401).json({
      loggedIn: false
    });
  }

  res.json({
    loggedIn: true,
    username: req.session.username
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Botgdl3 web sunucusu başlatıldı:", PORT);
  botStopping = false;
  startBot();
});
