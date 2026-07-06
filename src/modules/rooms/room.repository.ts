import { getDb } from "../../db/database";

export interface RoomRow {
  id: number;
  name: string;
  description: string | null;
  created_by: number;
  created_at: string;
}

export interface RoomWithMeta extends RoomRow {
  member_count: number;
  is_member: number; // 1 or 0 from SQLite
}

export const roomRepository = {
  create(name: string, description: string | null, createdBy: number): RoomRow {
    const db = getDb();
    const result = db
      .prepare("INSERT INTO rooms (name, description, created_by) VALUES (?, ?, ?)")
      .run(name, description, createdBy);
    const roomId = Number(result.lastInsertRowid);
    // creator auto-joins on create
    db.prepare("INSERT INTO room_members (room_id, user_id) VALUES (?, ?)").run(roomId, createdBy);
    return this.findById(roomId)!;
  },

  findById(id: number): RoomRow | undefined {
    return getDb().prepare("SELECT * FROM rooms WHERE id = ?").get(id) as RoomRow | undefined;
  },

  findByName(name: string): RoomRow | undefined {
    return getDb().prepare("SELECT * FROM rooms WHERE name = ?").get(name) as RoomRow | undefined;
  },

  list(userId: number): RoomWithMeta[] {
    return getDb()
      .prepare(
        `SELECT r.*,
           COUNT(DISTINCT rm.user_id) AS member_count,
           MAX(CASE WHEN rm.user_id = ? THEN 1 ELSE 0 END) AS is_member
         FROM rooms r
         LEFT JOIN room_members rm ON rm.room_id = r.id
         GROUP BY r.id
         ORDER BY r.created_at DESC`
      )
      .all(userId) as unknown as RoomWithMeta[];
  },

  addMember(roomId: number, userId: number): void {
    getDb()
      .prepare("INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)")
      .run(roomId, userId);
  },

  removeMember(roomId: number, userId: number): void {
    getDb()
      .prepare("DELETE FROM room_members WHERE room_id = ? AND user_id = ?")
      .run(roomId, userId);
  },

  isMember(roomId: number, userId: number): boolean {
    const row = getDb()
      .prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?")
      .get(roomId, userId);
    return row !== undefined;
  },

  getMembers(roomId: number) {
    return getDb()
      .prepare(
        `SELECT u.id, u.username, rm.joined_at
         FROM room_members rm
         JOIN users u ON u.id = rm.user_id
         WHERE rm.room_id = ?
         ORDER BY rm.joined_at ASC`
      )
      .all(roomId);
  },
};
