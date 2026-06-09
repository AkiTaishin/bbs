const express = require('express');
const sql = require('mssql/msnodesqlv8'); //Windows認証ネイティブドライバー
const path = require('path');

const app = express();
const PORT = 3000;

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
    
    //GET
    app.get('/api/posts', async (req, res) => {
        try {
            //poolを再利用（負荷軽減）
            let result = await pool.request().query('SELECT * FROM Posts ORDER BY CreatedAt DESC');
            res.json(result.recordset);
        } catch (err) {
            console.error('取得エラー:', err);
            res.status(500).send('サーバーエラーが発生しました。');
        }
    });

    //POST
    app.post('/api/posts', async (req, res) => {
        const { name, message } = req.body;
        
        if (!name || !message) {
            return res.status(400).send('名前と本文は必須です。');
        }

        try {
            await pool.request()
                .input('name', sql.NVarChar(50), name)
                .input('message', sql.NVarChar(sql.MAX), message)
                .query('INSERT INTO Posts (Name, Message) VALUES (@name, @message)');
            
            res.status(201).send('投稿が完了しました。');
        } catch (err) {
            console.error('投稿エラー:', err);
            res.status(500).send('サーバーエラーが発生しました。');
        }
    });

    //サーバーの待機を開始
    app.listen(PORT, () => {
        console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    });
});