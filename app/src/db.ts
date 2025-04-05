import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const dbPath = path.resolve(__dirname, '../db/agent_data.sqlite'); 

let dbInstance: Awaited<ReturnType<typeof open>> | null = null;

export async function initializeDatabase() {
    if (dbInstance) return dbInstance;

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    dbInstance = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS agent_status (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            status TEXT DEFAULT 'IDLE',
            current_step TEXT NULL,
            op_usdc_balance REAL DEFAULT 0,
            op_haio_balance REAL DEFAULT 0,
            op_ath_balance REAL DEFAULT 0,
            last_error TEXT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'info',
            tx_id TEXT NULL 
        );

        INSERT OR IGNORE INTO agent_status (id, updated_at) VALUES (1, datetime('now'));
    `);

    console.log('Database initialized successfully at:', dbPath);
    return dbInstance;
}

export async function addLog(message: string, status: 'info' | 'success' | 'error' | 'process' = 'info', txId?: string) {
    const db = await initializeDatabase();
    const timestamp = new Date().toISOString();

    if(txId) {
        console.log(`message: ${message}, txId: ${txId}`);
    }

    try {
        await db.run(
            'INSERT INTO agent_logs (timestamp, message, status, tx_id) VALUES (?, ?, ?, ?)',
            timestamp, message, status, txId ?? null
        );
        await db.run('DELETE FROM agent_logs WHERE id NOT IN (SELECT id FROM agent_logs ORDER BY timestamp DESC LIMIT 1000)');
    } catch (err) {
        console.error("Error adding log:", err);
    }
}

export async function updateStatus(data: {
    status?: 'IDLE' | 'PROCESSING' | 'ERROR' | string;
    current_step?: string | null; 
    opUsdcBalance?: number;
    opHaioBalance?: number;
    opAthBalance?: number;
    lastError?: string | null;
}) {
    const db = await initializeDatabase();
    const updates = [];
    const params = [];
    const now = new Date().toISOString();

    if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status); }
    if (data.current_step !== undefined) { updates.push('current_step = ?'); params.push(data.current_step); }
    if (data.opUsdcBalance !== undefined) { updates.push('op_usdc_balance = ?'); params.push(data.opUsdcBalance); }
    if (data.opHaioBalance !== undefined) { updates.push('op_haio_balance = ?'); params.push(data.opHaioBalance); }
    if (data.opAthBalance !== undefined) { updates.push('op_ath_balance = ?'); params.push(data.opAthBalance); }
    if (data.lastError !== undefined) { updates.push('last_error = ?'); params.push(data.lastError); }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(now);
        const sql = `UPDATE agent_status SET ${updates.join(', ')} WHERE id = 1`;
        try {
            await db.run(sql, ...params);
        } catch (err) {
            console.error("Error updating status:", err);
        }
    }
}

export async function getStatus(): Promise<any> {
    const db = await initializeDatabase();
    try {
        return await db.get('SELECT * FROM agent_status WHERE id = 1');
    } catch (err) {
        console.error("Error getting status:", err);
        return null;
    }
}

export async function getRecentLogs(limit: number = 50): Promise<any[]> {
    const db = await initializeDatabase();
    try {
        return await db.all('SELECT * FROM agent_logs ORDER BY timestamp DESC LIMIT ?', limit);
    } catch (err) {
        console.error("Error getting logs:", err);
        return [];
    }
}

import * as fs from 'fs';