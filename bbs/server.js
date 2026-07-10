const express = require('express');
const sql = require('mssql/msnodesqlv8');
const path = require('path');
const { buildConfig, resolveOdbcDriver } = require('./sqlConfig');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let pool;

async function initializeDatabase() {
    try {
        const odbcDriver = resolveOdbcDriver();
        console.log(`使用する ODBC ドライバー: ${odbcDriver}`);
        console.log('SQL Server (master) に接続しています...');
        let masterPool = await sql.connect(buildConfig('master'));
        
        const dbCheck = await masterPool.request().query("SELECT name FROM sys.databases WHERE name = 'BbsDB'");
        if (dbCheck.recordset.length === 0) {
            console.log("データベース 'BbsDB' が存在しません。作成します...");
            await masterPool.request().query('CREATE DATABASE BbsDB');
            console.log("データベース 'BbsDB' を作成しました。");
        }
        await masterPool.close();

        pool = await sql.connect(buildConfig('BbsDB'));
        console.log("データベース 'BbsDB' に接続しました。");

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
        
        startServer();
    } catch (err) {
        console.error('【エラー】データベース初期化に失敗しました:', err);
        process.exit(1);
    }
}

function startServer() {
    app.get('/api/posts', async (req, res) => {
        try {
            let result = await pool.request().query('SELECT * FROM Posts ORDER BY CreatedAt DESC');
            res.json(result.recordset);
        } catch (err) {
            console.error('取得エラー:', err);
            res.status(500).send('サーバーエラーが発生しました。');
        }
    });

    app.post('/api/posts', async (req, res) => {
        const name = req.body.name;
        const message = req.body.message;
        
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

    app.listen(PORT, () => {
        console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    });
}

initializeDatabase();