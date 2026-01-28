const http = require("http");
const fs = require("fs");
const WebSocket = require("ws");

const PORT = 8080;

// ساخت سرور HTTP
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const html = fs.readFileSync("index.html", "utf8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  }
});

// WebSocket
const wss = new WebSocket.Server({ server });

// کاربران آنلاین: username -> { sessionId, ws, lastSeen }
const users = {};

function sanitize(text) {
  return String(text).replace(/[<>]/g, "");
}

// ارسال پیام به همه کاربران
function broadcast(msg) {
  const data = JSON.stringify(msg);
  Object.values(users).forEach(u => {
    try { u.ws.send(data); } catch {}
  });
}

// بروزرسانی آنلاین‌ها
function updateOnline() {
  broadcast({
    type: "online",
    data: Object.keys(users)
  });
}

// اتصال جدید
wss.on("connection", ws => {
  let currentUser = null;

  ws.on("message", data => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    // ورود به چت
    if (msg.type === "login") {
      const username = sanitize(msg.username);
      const sessionId = msg.sessionId;

      if (!username || username.length < 3) {
        ws.send(JSON.stringify({ type: "error", message: "Username invalid" }));
        return;
      }

      if (users[username]) {
        if (users[username].sessionId !== sessionId) {
          ws.send(JSON.stringify({ type: "error", message: "این یوزرنیم در حال استفاده است" }));
          ws.close();
          return;
        }
        users[username].ws = ws;
        users[username].lastSeen = Date.now();
      } else {
        users[username] = {
          sessionId,
          ws,
          lastSeen: Date.now()
        };
        broadcast({ type: "system", message: username + " وارد شد" });
      }

      currentUser = username;
      ws.send(JSON.stringify({ type: "ok" }));
      updateOnline();
    }

    // پیام چت
    if (msg.type === "chat" && currentUser) {
      broadcast({
        type: "chat",
        user: currentUser,
        text: sanitize(msg.text)
      });
    }
  });

  ws.on("close", () => {
    if (currentUser && users[currentUser]) {
      users[currentUser].lastSeen = Date.now();

      // grace period 5 ثانیه
      setTimeout(() => {
        if (users[currentUser] && Date.now() - users[currentUser].lastSeen > 5000) {
          delete users[currentUser];
          broadcast({ type: "system", message: currentUser + " خارج شد" });
          updateOnline();
        }
      }, 5000);
    }
  });
});

// اجرا
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
