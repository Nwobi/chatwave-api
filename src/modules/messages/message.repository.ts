import { getDb } from "../../db/database";

export interface MessageRow {
  id: number;
  room_id: number;
  user_id: number;
  content: string;
  created_at: string;
}

export interface MessageWithUser extends MessageRow {
  username: string;
}

export const messageRepository = {
  create(roomId: number, userId: number, content: string): MessageWithUser {
    const result = getDb()
      .prepare("INSERT INTO messages (room_id, user_id, content) VALUES (?, ?, ?)")
      .run(roomId, userId, content);
    return this.findById(Number(result.lastInsertRowid))!;
  },

  findById(id: number): MessageWithUser | undefined {
    return getDb()
      .prepare(
        `SELECT m.*, u.username
         FROM messages m JOIN users u ON u.id = m.user_id
         WHERE m.id = ?`
      )
      .get(id) as MessageWithUser | undefined;
  },

  listForRoom(roomId: number, limit: number, before?: number): MessageWithUser[] {
    const db = getDb();
    if (before !== undefined) {
      const rows = db
        .prepare(
          `SELECT m.*, u.username
           FROM messages m JOIN users u ON u.id = m.user_id
           WHERE m.room_id = ? AND m.id < ?
           ORDER BY m.id DESC LIMIT ?`
        )
        .all(roomId, before, limit) as unknown as MessageWithUser[];
      return rows.reverse();
    }
    const rows = db
      .prepare(
        `SELECT m.*, u.username
         FROM messages m JOIN users u ON u.id = m.user_id
         WHERE m.room_id = ?
         ORDER BY m.id DESC LIMIT ?`
      )
      .all(roomId, limit) as unknown as MessageWithUser[];
    return rows.reverse();
  },
};
