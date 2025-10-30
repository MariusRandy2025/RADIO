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
  maxHttpBufferSize: 1e6, // 🔧 permite chunks de audio más grandes (1 MB)
  cors: { origin: "*" }
});

// --- Inicializar admin por defecto ---
await initAdmin();

// --- Middleware base ---
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Sesiones ---
app.use(
  session({
    secret: "clave-secreta-radio",
    resave: false,
    saveUninitialized: false,
  })
);

// --- Autenticación ---
function checkAuth(req, res, next) {
  if (req.session.user) next();
  else res.redirect("/login.html");
}

// --- LOGIN / LOGOUT ---
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const admin = await getAdmin(username);
  if (admin && (await bcrypt.compare(password, admin.password))) {
    req.session.user = username;
    res.redirect("/admin.html");
  } else {
    res.send(
      "❌ Usuario o contraseña incorrectos. <a href='/login.html'>Intentar de nuevo</a>"
    );
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

// --- Páginas protegidas ---
app.get("/admin.html", checkAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "public/admin.html"))
);

app.get("/panel.html", checkAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "public/panel.html"))
);

// --- APIs de gestión ---
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

// --- WebSockets: Audio y Chat ---
io.on("connection", (socket) => {
  console.log("🟢 Nueva conexión:", socket.id);

  // Chat en vivo
  socket.on("chat", (msg) => io.emit("chat", msg));

  // Audio: recibe paquetes binarios y los reenvía
  socket.on("audio", (data) => {
    // data viene como Uint8Array de audio WebM/Opus
    socket.broadcast.emit("audio", data);
  });

  socket.on("stopStream", () => {
    io.emit("stopStream");
    console.log("🔴 Transmisión detenida por", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("⚪ Cliente desconectado:", socket.id);
  });
});

// --- Inicio del servidor ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));

