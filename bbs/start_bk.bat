@echo off
chcp 65001 > nul
echo ===================================================
echo   掲示板システム 起動ツール（メンター用）
echo ===================================================
echo.

echo [1/6] Node.js のインストール状態をチェックしています...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌【エラー】Node.js が見つかりません。
    echo Node.js をインストールしてね。秋谷が共有してなかったらどついてください。
    echo.
    pause
    exit /b 1
)
echo ✅ Node.js 🔃 準備完了 🔃
echo.

echo [2/6] SQL Server の接続環境をチェックしています...
call "%~dp0check_sql_env.bat" nopause
if %errorlevel% neq 0 (
    echo.
    pause
    exit /b 1
)

echo [1/3] バックグラウンドの古いプロセスをクリーンアップしています...
taskkill /f /im node.exe >nul 2>&1
echo ✅ ポートの解放  🔃 準備完了 🔃
echo.

echo [2/3] 必要なライブラリをインストールしています...
echo ※ 初回は少し時間がかかります。そのまま待っててね～。
call npm install
echo ✅ ライブラリ  🔃 準備完了 🔃
echo.

echo [3/3] メンター用サーバーを起動し、ブラウザを開きます。
echo ===================================================
echo  ※ このバッチは server_bk.js【模範解答版】を起動します。
echo  ※ 研修中は、この黒い画面【コマンドプロンプト】を
echo  閉じないでそのままにしておいてください。
echo  終了する時は Ctrl+C を押すか、画面の×ボタンで閉じます。
echo ===================================================
echo.

start "" "http://localhost:3000/index_bk.html"
echo ※ QA集: http://localhost:3000/qa_mentor.html
node server_bk.js
pause
