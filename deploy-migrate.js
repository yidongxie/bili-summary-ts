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

  // Sync admin DeepSeek API key from the deploy secret (applied whenever provided).
  const deepseekKey = process.env.DEEPSEEK_API_KEY || "";
  if (deepseekKey) {
    try {
      const { encrypt } = require(path.resolve(__dirname, "dist/db/crypto"));
      const encrypted = encrypt(deepseekKey);
      db.prepare("UPDATE user_configs SET api_key_enc = ? WHERE user_id = ?").run(encrypted, uid);
      console.log(`DeepSeek API key synced for admin user (id=${uid})`);
    } catch(e) {
      console.error("Failed to set API key:", e.message);
    }
  }
}

  // Migrate the default LLM model to deepseek-v4-flash for users still on the
  // legacy 'deepseek-chat' default (safe: only touches rows never customized).
  const modelMigrated = db.prepare(
    "UPDATE user_configs SET deepseek_model = 'deepseek-v4-flash' WHERE deepseek_model = 'deepseek-chat'"
  ).run();
  if (modelMigrated.changes) console.log(`Updated ${modelMigrated.changes} user config(s) to model deepseek-v4-flash`);

  // Merge orphan WeChat accounts into admin (uid from above).
  // Skipped when there is no admin context (uid stays 0) — reassigning
  // user_id to 0 would violate the users(id) FK constraint.
  if (uid > 0) {
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
      // daily_usage has PRIMARY KEY (user_id, date) — merge counts, then drop orphan rows
      db.prepare(
        `INSERT INTO daily_usage (user_id, date, summarize_count)
         SELECT ?, date, summarize_count FROM daily_usage WHERE user_id = ?
         ON CONFLICT(user_id, date) DO UPDATE SET summarize_count = summarize_count + excluded.summarize_count`
      ).run(uid, orphan.id);
      db.prepare("DELETE FROM daily_usage WHERE user_id = ?").run(orphan.id);
      // tag_metadata has UNIQUE(user_id, tag_name) — keep orphan's tag only if admin lacks it
      db.prepare(
        `INSERT OR IGNORE INTO tag_metadata (user_id, tag_name, color, description, updated_at)
         SELECT ?, tag_name, color, description, updated_at FROM tag_metadata WHERE user_id = ?`
      ).run(uid, orphan.id);
      db.prepare("DELETE FROM tag_metadata WHERE user_id = ?").run(orphan.id);
      db.prepare("DELETE FROM user_configs WHERE user_id = ?").run(orphan.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(orphan.id);
      db.prepare("DELETE FROM summary_tasks WHERE user_id = ?").run(orphan.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(orphan.id);
    }
  }

db.close();
