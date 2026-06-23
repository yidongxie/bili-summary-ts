/** Deployment migration – ensure admin user exists */
const path = require("path");
const db = require(path.resolve(__dirname, "dist/db/schema")).createDb(path.resolve(__dirname, "data"));
const crypto = require("crypto");

const email = "444925817@qq.com";
const password = "REDACTED";

const row = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
let uid;
if (!row) {
  const info = db.prepare("INSERT INTO users (email, display_name) VALUES (?, ?)").run(email, "admin");
  uid = info.lastInsertRowid;
  db.prepare("INSERT OR IGNORE INTO user_configs (user_id) VALUES (?)").run(uid);
  console.log("Admin user created (id=" + uid + ")");
} else {
  uid = row.id;
  console.log("Admin user exists (id=" + uid + ")");
}

const cfg = db.prepare("SELECT password_hash FROM user_configs WHERE user_id = ?").get(uid);
if (!cfg || !cfg.password_hash) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  db.prepare("UPDATE user_configs SET password_hash = ? WHERE user_id = ?").run(salt + ":" + hash, uid);
  console.log("Password hash set");
} else {
  console.log("Password already set");
}

db.close();
