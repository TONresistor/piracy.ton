import express from 'express';
import cors from 'cors';
import db from './db.js';
import { startSyncLoop, syncFromContract } from './contract-sync.js';

const app = express();
app.use(cors());
app.use(express.json());

const TON_STORAGE_API = 'http://127.0.0.1:9090/api/v1';

// Fetch bag info from TON Storage
async function getBagInfo(bagId, includeFiles = false) {
    try {
        const res = await fetch(`${TON_STORAGE_API}/details?bag_id=${bagId}`);
        if (res.ok) {
            const data = await res.json();
            const info = {
                description: data.description || null,
                size: data.size || data.bag_size || null,
                bag_size: data.bag_size || data.size || null,
                files_count: data.files_count || 0,
                peers_count: data.peers ? data.peers.length : 0,
                piece_size: data.piece_size || 131072,
                merkle_hash: data.merkle_hash || null,
                dir_name: data.dir_name || ''
            };
            if (includeFiles && data.files) {
                info.files = data.files;
            }
            return info;
        }
    } catch (err) {
        console.log('Could not fetch bag info from TON Storage');
    }
    return null;
}

// Format bytes to human readable
function formatSize(bytes) {
    if (!bytes) return null;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return bytes.toFixed(bytes >= 10 ? 0 : 1) + ' ' + units[i];
}

// GET /api/bags - Liste tous les bags
app.get('/api/bags', (req, res) => {
    const { category, q, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let sql = 'SELECT * FROM bags';
    let countSql = 'SELECT COUNT(*) as total FROM bags';
    const params = [];
    const conditions = [];

    if (category) {
        conditions.push('category = ?');
        params.push(category);
    }

    if (q) {
        conditions.push('name LIKE ?');
        params.push(`%${q}%`);
    }

    if (conditions.length > 0) {
        const where = ' WHERE ' + conditions.join(' AND ');
        sql += where;
        countSql += where;
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

    const bags = db.prepare(sql).all(...params, limit, offset);
    const { total } = db.prepare(countSql).get(...params);

    res.json({ bags, total, page: Number(page) });
});

// GET /api/bags/:id - Détails d'un bag (par id ou bag_id)
app.get('/api/bags/:id', (req, res) => {
    const { id } = req.params;
    // Check if it's a bag_id (64 hex chars) or numeric id
    const isBagId = /^[a-fA-F0-9]{64}$/.test(id);
    const bag = isBagId
        ? db.prepare('SELECT * FROM bags WHERE bag_id = ?').get(id)
        : db.prepare('SELECT * FROM bags WHERE id = ?').get(id);
    if (!bag) {
        return res.status(404).json({ error: 'Bag not found' });
    }
    res.json(bag);
});

// GET /api/bag-info/:bagId - Récupère les infos d'un bag depuis TON Storage
// Returns all metadata needed for contract registration
app.get('/api/bag-info/:bagId', async (req, res) => {
    const { bagId } = req.params;

    if (!/^[a-fA-F0-9]{64}$/.test(bagId)) {
        return res.status(400).json({ error: 'Invalid bag_id format' });
    }

    const info = await getBagInfo(bagId, true);
    if (!info) {
        return res.status(404).json({ error: 'Bag not found in TON Storage' });
    }

    res.json({
        // Display info
        description: info.description,
        size: formatSize(info.size),
        size_bytes: info.size,
        files_count: info.files_count,
        peers_count: info.peers_count,
        files: info.files || [],
        // Contract metadata
        bag_size: info.bag_size,
        piece_size: info.piece_size,
        merkle_hash: info.merkle_hash,
        dir_name: info.dir_name
    });
});

// GET /api/sync - Trigger manual sync from contract
app.get('/api/sync', async (req, res) => {
    const result = await syncFromContract();
    res.json(result);
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Start contract sync loop (every 60 seconds)
    startSyncLoop(60000);
});
