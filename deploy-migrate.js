/** Deployment migration – optionally ensure an admin user exists */
const path = require("path");
const db = require(path.resolve(__dirname, "dist/db/schema")).createDb(path.resolve(__dirname, "data"));
const crypto = require("crypto");

const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");
const legacyEmail = "444925817@qq.com";
const legacyPasswordSha256 = "c0acaba1a8c1fd23b4c58ae9256a2bb9da8967330fd475cae8b4095663bcde51";

const legacyRow = db.prepare("SELECT u.id, c.password_hash FROM users u LEFT JOIN user_configs c ON c.user_id = u.id WHERE u.email = ?").get(legacyEmail);
if (legacyRow?.password_hash) {
  const legacyHash = legacyRow.password_hash;
  const [, hash = ""] = legacyHash.split(":");
  if (crypto.createHash("sha256").update(hash).digest("hex") === legacyPasswordSha256) {
    db.prepare("UPDATE user_configs SET password_hash = '' WHERE user_id = ?").run(legacyRow.id);
    console.log("Disabled legacy hard-coded admin password");
  }
}

let uid = 0;

if (!email) {
  console.log("ADMIN_EMAIL not set; skipping admin bootstrap");
} else {
  const row = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (!row) {
    const info = db.prepare("INSERT INTO users (email, display_name) VALUES (?, ?)").run(email, "admin");
    uid = info.lastInsertRowid;
    db.prepare("INSERT OR IGNORE INTO user_configs (user_id) VALUES (?)").run(uid);
    console.log("Admin user created (id=" + uid + ")");
  } else {
    uid = row.id;
    console.log("Admin user exists (id=" + uid + ")");
  }

  if (password && password.length >= 12) {
    const cfg = db.prepare("SELECT password_hash FROM user_configs WHERE user_id = ?").get(uid);
    if (!cfg || !cfg.password_hash) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
      db.prepare("UPDATE user_configs SET password_hash = ? WHERE user_id = ?").run(salt + ":" + hash, uid);
      console.log("Password hash set");
    } else {
      console.log("Password already set");
    }
  }

  // Set default DeepSeek API key for admin user
  const deepseekKey = process.env.DEEPSEEK_API_KEY || "";
  if (deepseekKey) {
    try {
      const { encrypt } = require(path.resolve(__dirname, "dist/db/crypto"));
      const encrypted = encrypt(deepseekKey);
      db.prepare("UPDATE user_configs SET api_key_enc = ? WHERE user_id = ? AND (api_key_enc = '' OR api_key_enc IS NULL)").run(encrypted, uid);
      console.log("DeepSeek API key set for admin user");
    } catch(e) {
      console.error("Failed to set API key:", e.message);
    }
  }
}

  // Merge orphan WeChat accounts into admin (uid from above)
  const orphanUsers = db.prepare("SELECT id, email FROM users WHERE email LIKE 'wechat_%@bilistudy.local' AND id != ?").all(uid);
  if (orphanUsers.length) console.log(`Found ${orphanUsers.length} orphan WeChat user(s), merging into admin id=${uid}...`);
  for (const orphan of orphanUsers) {
    // FK cleanup first (child rows that reference the orphan user's data)
    db.prepare("DELETE FROM chat_messages WHERE user_id = ?").run(orphan.id);
    db.prepare("DELETE FROM chat_threads WHERE user_id = ?").run(orphan.id);
    db.prepare("DELETE FROM review_items WHERE user_id = ?").run(orphan.id);
    db.prepare("DELETE FROM learning_path_items WHERE path_id IN (SELECT id FROM learning_paths WHERE user_id = ?)").run(orphan.id);
    // Reassign remaining data to admin
    db.prepare("UPDATE library_items SET user_id = ? WHERE user_id = ?").run(uid, orphan.id);
    db.prepare("UPDATE snippets SET user_id = ? WHERE user_id = ?").run(uid, orphan.id);
    db.prepare("UPDATE learning_paths SET user_id = ? WHERE user_id = ?").run(uid, orphan.id);
    db.prepare("UPDATE quizzes SET user_id = ? WHERE user_id = ?").run(uid, orphan.id);
    db.prepare("UPDATE api_usage_logs SET user_id = ? WHERE user_id = ?").run(uid, orphan.id);
    db.prepare("UPDATE daily_usage SET user_id = ? WHERE user_id = ?").run(uid, orphan.id);
    db.prepare("UPDATE tag_metadata SET user_id = ? WHERE user_id = ?").run(uid, orphan.id);
    db.prepare("DELETE FROM user_configs WHERE user_id = ?").run(orphan.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(orphan.id);
    db.prepare("DELETE FROM summary_tasks WHERE user_id = ?").run(orphan.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(orphan.id);
  }

db.close();
