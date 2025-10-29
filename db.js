import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";

const db = new sqlite3.Database("./radio.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);
});

export async function initAdmin() {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM admin WHERE username = ?", ["admin"], async (err, row) => {
      if (err) reject(err);
      if (!row) {
        const hash = await bcrypt.hash("1234", 10);
        db.run("INSERT INTO admin (username, password) VALUES (?, ?)", ["admin", hash]);
        console.log("Usuario admin creado: usuario=admin contraseña=1234");
      }
      resolve();
    });
  });
}

export function getAdmin(username) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM admin WHERE username = ?", [username], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
}

export async function createUser(username, password) {
  const hash = await bcrypt.hash(password, 10);
  return new Promise((resolve) => {
    db.run("INSERT INTO admin (username, password) VALUES (?, ?)", [username, hash], (err) => {
      resolve(!err);
    });
  });
}

export function deleteUser(username) {
  return new Promise((resolve) => {
    db.run("DELETE FROM admin WHERE username = ?", [username], function (err) {
      resolve(!err && this.changes > 0);
    });
  });
}

export async function updatePassword(username, newPassword) {
  const hash = await bcrypt.hash(newPassword, 10);
  return new Promise((resolve) => {
    db.run("UPDATE admin SET password = ? WHERE username = ?", [hash, username], (err) => {
      resolve(!err);
    });
  });
}

export default db;

