const express = require('express');
const sql = require('mssql/msnodesqlv8'); //Windows認証ネイティブドライバー
const path = require('path');

const app = express();
const PORT = 3000;

//入力値の上限（フロントエンドと揃える）
const LIMITS = {
    nameMax: 50,
    messageMax: 500
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

//Windows認証（SSO）用の接続設定
const baseConfig = {
    server: 'localhost\\SQLEXPRESS', //SSMSと同じサーバー名
    database: 'master',              //最初はmasterへ接続
    options: {
        trustedConnection: true,     //パスワード不要のWindows認証
        trustServerCertificate: true
    }
};

let pool;

//投稿データのバリデーション（前後の空白を除去し、文字数をチェック）
function validatePostInput(name, message) {
    const trimmedName = (name || '').trim();
    const trimmedMessage = (message || '').trim();

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

//データベース・テーブルの自動構築
async function initializeDatabase() {
    try {
        console.log('SQL Server (master) に接続しています...');
        let masterPool = await sql.connect(baseConfig);
        
        //データベースの確認・作成
        const dbCheck = await masterPool.request().query("SELECT name FROM sys.databases WHERE name = 'BbsDB'");
        if (dbCheck.recordset.length === 0) {
            console.log("データベース 'BbsDB' が存在しません。作成します...");
            await masterPool.request().query('CREATE DATABASE BbsDB');
            console.log("データベース 'BbsDB' を作成しました。");
        }
        await masterPool.close(); 

        //BbsDB に接続し直してプールを保持
        const bbsConfig = { ...baseConfig, database: 'BbsDB' };
        pool = await sql.connect(bbsConfig);
        console.log("データベース 'BbsDB' に接続しました。");

        //テーブルの確認・作成
        const tableCheck = await pool.request().query("SELECT * FROM sys.tables WHERE name = 'Posts'");
        if (tableCheck.recordset.length === 0) {
            console.log("テーブル 'Posts' が存在しません。作成します...");
            await pool.request().query(`
                CREATE TABLE Posts (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Name NVARCHAR(50) NOT NULL,
                    Message NVARCHAR(MAX) NOT NULL,
                    CreatedAt DATETIME DEFAULT GETDATE()
                )
            `);
            console.log("テーブル 'Posts' を作成しました。");
        }

        console.log('データベースの準備が完了しました。');
    } catch (err) {
        console.error('【エラー】データベース初期化に失敗しました:', err);
        process.exit(1);
    }
}

//DB初期化が成功したあとにWebサーバーを立ち上げ、APIを有効にする
initializeDatabase().then(() => {
    
    //GET: 投稿一覧の取得
    app.get('/api/posts', async (req, res) => {
        try {
            //poolを再利用（負荷軽減）
            let result = await pool.request().query('SELECT * FROM Posts ORDER BY CreatedAt DESC');
            res.json(result.recordset);
        } catch (err) {
            console.error('取得エラー:', err);
            res.status(500).json({ error: 'サーバーエラーが発生しました。' });
        }
    });

    //POST: 新規投稿の登録
    app.post('/api/posts', async (req, res) => {
        const { name, message } = req.body;
        const validation = validatePostInput(name, message);

        if (!validation.ok) {
            return res.status(400).json({ error: validation.message });
        }

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

    //DELETE: 投稿の削除（メンター用の管理機能）
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

    //サーバーの待機を開始
    app.listen(PORT, () => {
        console.log(`【メンター用】サーバーが起動しました: http://localhost:${PORT}/index_bk.html`);
    });
});
