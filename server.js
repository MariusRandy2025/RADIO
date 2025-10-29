import express from "express";
import http from "http";
import { Server } from "socket.io";
import session from "express-session";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
import { initAdmin, getAdmin, createUser, deleteUser, updatePassword } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

await initAdmin();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Sesión ---
app.use(
  session({
    secret: "clave-secreta-radio",
    resave: false,
    saveUninitialized: false,
  })
);

// --- Middleware de autenticación ---
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
    res.send("❌ Usuario o contraseña incorrectos. <a href='/login.html'>Intentar de nuevo</a>");
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

// --- WebSockets ---
io.on("connection", (socket) => {
  socket.on("chat", (msg) => io.emit("chat", msg));
  socket.on("audio", (data) => socket.broadcast.emit("audio", data));
  socket.on("stopStream", () => io.emit("stopStream"));
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
