import Database from "better-sqlite3";
import bcrypt from "bcrypt";

const db = new Database("./radio.db");

// Crear tabla si no existe
db.prepare(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`).run();

export async function initAdmin() {
  const admin = db.prepare("SELECT * FROM admin WHERE username = ?").get("admin");
  if (!admin) {
    const hash = await bcrypt.hash("1234", 10);
    db.prepare("INSERT INTO admin (username, password) VALUES (?, ?)").run("admin", hash);
    console.log("✅ Usuario admin creado: usuario=admin contraseña=1234");
  }
}

export function getAdmin(username) {
  return db.prepare("SELECT * FROM admin WHERE username = ?").get(username);
}

export async function createUser(username, password) {
  const hash = await bcrypt.hash(password, 10);
  try {
    db.prepare("INSERT INTO admin (username, password) VALUES (?, ?)").run(username, hash);
    return true;
  } catch {
    return false;
  }
}

export function deleteUser(username) {
  const result = db.prepare("DELETE FROM admin WHERE username = ?").run(username);
  return result.changes > 0;
}

export async function updatePassword(username, newPassword) {
  const hash = await bcrypt.hash(newPassword, 10);
  db.prepare("UPDATE admin SET password = ? WHERE username = ?").run(hash, username);
  return true;
}

export default db;
