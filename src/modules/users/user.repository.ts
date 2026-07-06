import { getDb } from "../../db/database";

export interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export const userRepository = {
  create(username: string, email: string, passwordHash: string): UserRow {
    const result = getDb()
      .prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)")
      .run(username, email, passwordHash);
    return this.findById(Number(result.lastInsertRowid))!;
  },

  findByEmail(email: string): UserRow | undefined {
    return getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  },

  findByUsername(username: string): UserRow | undefined {
    return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as
      UserRow | undefined;
  },

  findById(id: number): UserRow | undefined {
    return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  },
};
