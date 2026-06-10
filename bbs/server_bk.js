/**
 * server_bk.js — メンター用模範解答サーバー
 *
 * 研修生用 server.js の完成版です。検索・削除・リアクション・レート制限・
 * 入力サニタイズ・セキュリティヘッダーなどを実装しています。
 * start_bk.bat から起動し、index_bk.html 向けに API を提供します。
 */
const express = require('express');
const sql = require('mssql/msnodesqlv8'); //Windows認証ネイティブドライバー
const path = require('path');

const app = express();
const PORT = 3000;

// --- 定数・設定 ---
const LIMITS = {
    nameMax: 50,
    messageMax: 500,
    searchMax: 50
};

//レート制限: IPごとに1分間の投稿回数を制限（スパム・DoS対策）
const RATE_LIMIT = { windowMs: 60 * 1000, maxPosts: 10 };
const rateLimitStore = new Map();

//リアクションで許可する絵文字（任意の文字列をDBに保存させない）
const ALLOWED_EMOJIS = ['👍', '🎉', '💡', '❤️', '😂'];

// --- Express ミドルウェア ---
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

//セキュリティヘッダー（クリックジャッキング・MIMEスニッフィング等の対策）
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.removeHeader('X-Powered-By');
    next();
});

// --- SQL Server 接続設定（Windows 認証） ---
const baseConfig = {
    driver: 'ODBC Driver 17 for SQL Server',
    server: 'localhost\\SQLEXPRESS',
    database: 'master',
    options: {
        trustedConnection: true,
        trustServerCertificate: true
    }
};

let pool;

//制御文字・NULLバイトの除去（入力サニタイズ）
// --- 入力検証・サニタイズ ---
function sanitizeInput(value) {
    return String(value || '')
        .replace(/\0/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

//SQLインジェクションの疑いがあるパターンを検知してログ出力（研修用の学習ポイント）
const SUSPICIOUS_PATTERNS = [
    /'\s*or\s+'/i,
    /"\s*or\s+"/i,
    /\bunion\b.+\bselect\b/i,
    /\b(drop|alter|exec|execute)\b/i,
    /(--|\/\*)/,
    /;\s*(drop|delete|insert|update)\b/i
];

function logSuspiciousInput(req, field, value) {
    if (SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(value))) {
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        console.warn(`[セキュリティ警告] 疑わしい入力を検知: field=${field}, ip=${clientIp}`);
        console.warn('  → パラメータ化クエリにより SQL インジェクションは防御されています');
    }
}

//レート制限チェック
function checkRateLimit(clientIp) {
    const now = Date.now();
    const record = rateLimitStore.get(clientIp) || { count: 0, resetAt: now + RATE_LIMIT.windowMs };

    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + RATE_LIMIT.windowMs;
    }

    record.count += 1;
    rateLimitStore.set(clientIp, record);

    return record.count <= RATE_LIMIT.maxPosts;
}

function validatePostInput(name, message) {
    const trimmedName = sanitizeInput(name).trim();
    const trimmedMessage = sanitizeInput(message).trim();

    if (!trimmedName || !trimmedMessage) {
        return { ok: false, message: '名前と本文は必須です。' };
    }
    if (trimmedName.length > LIMITS.nameMax) {
        return { ok: false, message: `名前は${LIMITS.nameMax}文字以内で入力してください。` };
    }
    if (trimmedMessage.length > LIMITS.messageMax) {
        return { ok: false, message: `本文は${LIMITS.messageMax}文字以内で入力してください。` };
    }

    return { ok: true, name: trimmedName, message: trimmedMessage };
}

function validateSearchInput(search) {
    const trimmed = sanitizeInput(search).trim();
    if (!trimmed) return { ok: true, search: '' };
    if (trimmed.length > LIMITS.searchMax) {
        return { ok: false, message: `検索キーワードは${LIMITS.searchMax}文字以内で入力してください。` };
    }
    return { ok: true, search: trimmed };
}

function parseReactions(raw) {
    try {
        const parsed = JSON.parse(raw || '{}');
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return {};
        }
        return parsed;
    } catch {
        return {};
    }
}

// --- データベース初期化（BbsDB / Posts テーブルの自動作成） ---
async function initializeDatabase() {
    try {
        console.log('SQL Server (master) に接続しています...');
        let masterPool = await sql.connect(baseConfig);

        const dbCheck = await masterPool.request().query("SELECT name FROM sys.databases WHERE name = 'BbsDB'");
        if (dbCheck.recordset.length === 0) {
            console.log("データベース 'BbsDB' が存在しません。作成します...");
            await masterPool.request().query('CREATE DATABASE BbsDB');
            console.log("データベース 'BbsDB' を作成しました。");
        }
        await masterPool.close();

        const bbsConfig = { ...baseConfig, database: 'BbsDB' };
        pool = await sql.connect(bbsConfig);
        console.log("データベース 'BbsDB' に接続しました。");

        const tableCheck = await pool.request().query("SELECT * FROM sys.tables WHERE name = 'Posts'");
        if (tableCheck.recordset.length === 0) {
            console.log("テーブル 'Posts' が存在しません。作成します...");
            await pool.request().query(`
                CREATE TABLE Posts (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Name NVARCHAR(50) NOT NULL,
                    Message NVARCHAR(MAX) NOT NULL,
                    Reactions NVARCHAR(500) NOT NULL DEFAULT '{}',
                    CreatedAt DATETIME DEFAULT GETDATE()
                )
            `);
            console.log("テーブル 'Posts' を作成しました。");
        } else {
            const colCheck = await pool.request().query("SELECT COL_LENGTH('Posts', 'Reactions') AS ColLen");
            if (colCheck.recordset[0].ColLen === null) {
                console.log("カラム 'Reactions' を追加します...");
                await pool.request().query("ALTER TABLE Posts ADD Reactions NVARCHAR(500) NOT NULL DEFAULT '{}'");
            }
        }

        console.log('データベースの準備が完了しました。');
    } catch (err) {
        console.error('【エラー】データベース初期化に失敗しました:', err);
        process.exit(1);
    }
}

initializeDatabase().then(() => {

    // --- REST API ルート ---

    //GET: 投稿一覧（検索・並び順対応）
    //※ 検索キーワードも @search パラメータで渡すことで SQL インジェクションを防止
    app.get('/api/posts', async (req, res) => {
        const searchValidation = validateSearchInput(req.query.search || '');
        if (!searchValidation.ok) {
            return res.status(400).json({ error: searchValidation.message });
        }

        const sort = req.query.sort === 'asc' ? 'ASC' : 'DESC';

        try {
            let result;
            if (searchValidation.search) {
                logSuspiciousInput(req, 'search', searchValidation.search);
                const searchPattern = `%${searchValidation.search}%`;
                result = await pool.request()
                    .input('search', sql.NVarChar(100), searchPattern)
                    .query(`SELECT * FROM Posts WHERE Name LIKE @search OR Message LIKE @search ORDER BY CreatedAt ${sort}`);
            } else {
                result = await pool.request()
                    .query(`SELECT * FROM Posts ORDER BY CreatedAt ${sort}`);
            }

            const posts = result.recordset.map((post) => ({
                ...post,
                Reactions: parseReactions(post.Reactions)
            }));

            res.json(posts);
        } catch (err) {
            console.error('取得エラー:', err);
            res.status(500).json({ error: 'サーバーエラーが発生しました。' });
        }
    });

    //POST: 新規投稿（パラメータ化クエリで SQL インジェクション対策）
    app.post('/api/posts', async (req, res) => {
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({ error: '投稿が多すぎます。しばらく待ってから再試行してください。' });
        }

        const { name, message } = req.body;
        const validation = validatePostInput(name, message);

        if (!validation.ok) {
            return res.status(400).json({ error: validation.message });
        }

        logSuspiciousInput(req, 'name', validation.name);
        logSuspiciousInput(req, 'message', validation.message);

        try {
            await pool.request()
                .input('name', sql.NVarChar(50), validation.name)
                .input('message', sql.NVarChar(sql.MAX), validation.message)
                .query('INSERT INTO Posts (Name, Message) VALUES (@name, @message)');

            res.status(201).json({ message: '投稿が完了しました。' });
        } catch (err) {
            console.error('投稿エラー:', err);
            res.status(500).json({ error: 'サーバーエラーが発生しました。' });
        }
    });

    //DELETE: 投稿削除（IDは数値型に厳密変換して不正アクセスを防止）
    app.delete('/api/posts/:id', async (req, res) => {
        const postId = Number(req.params.id);

        if (!Number.isInteger(postId) || postId <= 0) {
            return res.status(400).json({ error: '不正な投稿IDです。' });
        }

        try {
            const result = await pool.request()
                .input('id', sql.Int, postId)
                .query('DELETE FROM Posts WHERE Id = @id');

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ error: '指定された投稿が見つかりません。' });
            }

            res.json({ message: '投稿を削除しました。' });
        } catch (err) {
            console.error('削除エラー:', err);
            res.status(500).json({ error: 'サーバーエラーが発生しました。' });
        }
    });

    //POST: リアクション追加（絵文字ホワイトリストで不正データを防止）
    app.post('/api/posts/:id/react', async (req, res) => {
        const postId = Number(req.params.id);
        const emoji = sanitizeInput(req.body.emoji).trim();

        if (!Number.isInteger(postId) || postId <= 0) {
            return res.status(400).json({ error: '不正な投稿IDです。' });
        }
        if (!ALLOWED_EMOJIS.includes(emoji)) {
            return res.status(400).json({ error: 'このリアクションは使用できません。' });
        }

        try {
            const current = await pool.request()
                .input('id', sql.Int, postId)
                .query('SELECT Reactions FROM Posts WHERE Id = @id');

            if (current.recordset.length === 0) {
                return res.status(404).json({ error: '指定された投稿が見つかりません。' });
            }

            const reactions = parseReactions(current.recordset[0].Reactions);
            reactions[emoji] = (reactions[emoji] || 0) + 1;

            await pool.request()
                .input('id', sql.Int, postId)
                .input('reactions', sql.NVarChar(500), JSON.stringify(reactions))
                .query('UPDATE Posts SET Reactions = @reactions WHERE Id = @id');

            res.json({ reactions });
        } catch (err) {
            console.error('リアクションエラー:', err);
            res.status(500).json({ error: 'サーバーエラーが発生しました。' });
        }
    });

    // --- サーバー起動 ---
    app.listen(PORT, () => {
        console.log(`【メンター用】サーバーが起動しました: http://localhost:${PORT}/index_bk.html`);
    });
});
