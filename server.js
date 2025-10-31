import express from "express";
import http from "http";
import { Server } from "socket.io";
import session from "express-session";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
import {
  initAdmin,
  getAdmin,
  createUser,
  deleteUser,
  updatePassword,
} from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7, // 10 MB
  cors: { origin: "*" },
});

// ================= SEGURIDAD BÁSICA =================
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  // Permitir micrófono (importante para Render y navegadores)
  res.setHeader("Permissions-Policy", "microphone=(self)");
  next();
});

// ================= INICIALIZAR BASE DE DATOS =================
await initAdmin();

// ================= PARSEO DE FORMULARIOS =================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ================= SESIÓN (debe ir antes del middleware de bloqueo) =================
app.use(
  session({
    secret: "clave-secreta-radio",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // ⚠️ Usa true si tu servidor tiene HTTPS
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60, // 1 hora
    },
  })
);

// ================= BLOQUEO DE ACCESO DIRECTO A RUTAS PRIVADAS =================
app.use((req, res, next) => {
  const rutasProtegidas = ["/admin.html", "/panel.html"];
  if (rutasProtegidas.includes(req.path) && !req.session.user) {
    return res.redirect("/login.html");
  }
  next();
});

// ================= ARCHIVOS ESTÁTICOS =================
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// ================= MIDDLEWARE AUTH =================
function checkAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect("/login.html");
}

// ================= RUTAS =================
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.get("/login", (req, res) => {
  // Si ya está logueado, redirigir automáticamente
  if (req.session.user) return res.redirect("/admin");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/admin", checkAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html"))
);

app.get("/panel", checkAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "public", "panel.html"))
);

// ================= AUTENTICACIÓN =================
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const admin = await getAdmin(username);

  if (admin && (await bcrypt.compare(password, admin.password))) {
    req.session.user = username;
    return res.redirect("/admin");
  } else {
    return res.send(`
      <h2>❌ Usuario o contraseña incorrectos.</h2>
      <a href="/login.html">Volver</a>
    `);
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

// ================= API ADMIN =================
app.get("/api/whoami", checkAuth, (req, res) => {
  res.json({ username: req.session.user });
});

app.post("/api/change-password", checkAuth, async (req, res) => {
  const { oldPass, newPass } = req.body;
  const user = await getAdmin(req.session.user);

  if (user && (await bcrypt.compare(oldPass, user.password))) {
    await updatePassword(req.session.user, newPass);
    res.send("✅ Contraseña actualizada correctamente.");
  } else {
    res.send("❌ Contraseña actual incorrecta.");
  }
});

app.post("/api/new-user", checkAuth, async (req, res) => {
  const { username, password } = req.body;
  const ok = await createUser(username, password);
  res.send(ok ? "✅ Locutor creado correctamente." : "⚠️ Ese usuario ya existe.");
});

app.post("/api/delete-user", checkAuth, async (req, res) => {
  const { username } = req.body;
  const ok = await deleteUser(username);
  res.send(ok ? "🗑️ Usuario eliminado." : "❌ No se encontró ese usuario.");
});

// ================= SOCKET.IO =================
io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  // Chat (compatibilidad doble)
  socket.on("chat", (msg) => {
    io.emit("chat", msg);
    io.emit("chatMessage", msg);
  });

  socket.on("chatMessage", (msg) => {
    io.emit("chatMessage", msg);
    io.emit("chat", msg);
  });

  // Transmisión de audio
  socket.on("audio-meta", (meta) => socket.broadcast.emit("audio-meta", meta));
  socket.on("audio", (data) => socket.broadcast.emit("audio", data));

  // Música compartida
  socket.on("music", (fileData) => {
    io.emit("music", fileData);
  });

  // Detener música
  socket.on("stopMusic", () => {
    io.emit("stopMusic");
    console.log("🎵 Música detenida por", socket.id);
  });

  // Detener transmisión
  socket.on("stopStream", () => {
    io.emit("stopStream");
    console.log("🔴 Transmisión detenida por", socket.id);
  });

  socket.on("disconnect", () =>
    console.log("⚪ Cliente desconectado:", socket.id)
  );
});

// ================= SERVIDOR =================
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
);


