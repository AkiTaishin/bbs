@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul

set "CHECK_FAILED=0"
set "SQL_SERVER=localhost\SQLEXPRESS"

echo ===================================================
echo   SQL Server 環境チェック
echo ===================================================
echo.

REM ===================================================
REM [3] SQL Server Browser サービスの確認・起動
REM     名前付きインスタンス (SQLEXPRESS) の解決に必要
REM ===================================================
echo [3/6] SQL Server Browser サービスを確認しています...

sc query SQLBrowser >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  SQL Server Browser サービスがインストールされていません。
    echo    SQL Server Express の再インストール、または
    echo    「共有機能」で Browser を有効にしてください。
    set "CHECK_FAILED=1"
) else (
    sc query SQLBrowser | findstr /C:"RUNNING" >nul 2>&1
    if %errorlevel% neq 0 (
        echo    Browser サービスが停止中です。起動を試みます...
        net start SQLBrowser >nul 2>&1
        if !errorlevel! neq 0 (
            echo ❌ Browser サービスの起動に失敗しました。
            echo    管理者としてコマンドプロンプトを開き、次を実行してください:
            echo      net start SQLBrowser
            echo    または services.msc で「SQL Server Browser」を開始してください。
            set "CHECK_FAILED=1"
        ) else (
            echo ✅ SQL Server Browser を起動しました。
        )
    ) else (
        echo ✅ SQL Server Browser は実行中です。
    )
)
echo.

REM ===================================================
REM [4] ODBC ドライバーの確認
REM     msnodesqlv8 は ODBC Driver 17/18 が必要
REM ===================================================
echo [4/6] ODBC ドライバーを確認しています...

set "ODBC_OK=0"
reg query "HKLM\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 17 for SQL Server" >nul 2>&1
if !errorlevel! equ 0 set "ODBC_OK=1"
reg query "HKLM\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 18 for SQL Server" >nul 2>&1
if !errorlevel! equ 0 set "ODBC_OK=1"

if !ODBC_OK! equ 0 (
    echo ❌ ODBC Driver 17 または 18 for SQL Server が見つかりません。
    echo    msnodesqlv8 の接続に必要です。以下からインストールしてください:
    echo    https://learn.microsoft.com/ja-jp/sql/connect/odbc/download-odbc-driver-for-sql-server
    echo    ※ インストール後、このバッチを再度実行してください。
    set "CHECK_FAILED=1"
) else (
    echo ✅ ODBC ドライバーがインストールされています。
)
echo.

REM ===================================================
REM [5] TCP/IP プロトコルの確認・有効化
REM     Node.js からの接続に TCP/IP が必要な場合がある
REM ===================================================
echo [5/6] TCP/IP プロトコルを確認しています...

set "TCP_RESULT="
for /f "delims=" %%R in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\enable_tcp_ip.ps1"') do set "TCP_RESULT=%%R"

if "!TCP_RESULT!"=="NOTFOUND" (
    echo ⚠️  SQLEXPRESS インスタンスの TCP/IP 設定が見つかりません。
    echo    SQL Server Configuration Manager で手動確認してください:
    echo      SQLEXPRESS のプロトコル ^> TCP/IP を「有効」に設定
    set "CHECK_FAILED=1"
) else if "!TCP_RESULT!"=="ENABLED" (
    echo    TCP/IP が無効だったため、有効化しました。SQL Server を再起動します...
    net stop "MSSQL$SQLEXPRESS" /y >nul 2>&1
    timeout /t 3 /nobreak >nul
    net start "MSSQL$SQLEXPRESS" >nul 2>&1
    if !errorlevel! neq 0 (
        echo ❌ SQL Server の再起動に失敗しました。
        echo    管理者として実行するか、services.msc から
        echo    「SQL Server (SQLEXPRESS)」を手動で再起動してください。
        set "CHECK_FAILED=1"
    ) else (
        echo ✅ TCP/IP を有効化し、SQL Server を再起動しました。
    )
) else if "!TCP_RESULT!"=="OK" (
    echo ✅ TCP/IP プロトコルは有効です。
) else (
    echo ⚠️  TCP/IP の確認に失敗しました。
    echo    SQL Server Configuration Manager で TCP/IP が有効か確認してください。
    set "CHECK_FAILED=1"
)
echo.

REM ===================================================
REM [6] Windows 認証での接続テスト
REM     trustedConnection: true の接続可否を事前確認
REM ===================================================
echo [6/6] Windows 認証での接続をテストしています...

set "SQLCMD_PATH="
where sqlcmd >nul 2>&1
if !errorlevel! equ 0 (
    set "SQLCMD_PATH=sqlcmd"
) else (
    if exist "%ProgramFiles%\Microsoft SQL Server\Client SDK\ODBC\180\Tools\Binn\SQLCMD.EXE" (
        set "SQLCMD_PATH=%ProgramFiles%\Microsoft SQL Server\Client SDK\ODBC\180\Tools\Binn\SQLCMD.EXE"
    ) else if exist "%ProgramFiles%\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE" (
        set "SQLCMD_PATH=%ProgramFiles%\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE"
    ) else if exist "%ProgramFiles(x86)%\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE" (
        set "SQLCMD_PATH=%ProgramFiles(x86)%\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE"
    )
)

if not defined SQLCMD_PATH (
    echo ⚠️  sqlcmd が見つかりません。接続テストをスキップします。
    echo    SSMS で %SQL_SERVER% に Windows 認証で接続できるか確認してください。
) else (
    "!SQLCMD_PATH!" -S %SQL_SERVER% -E -Q "SET NOCOUNT ON; SELECT 1" -h -1 -W -b >nul 2>&1
    if !errorlevel! neq 0 (
        echo ❌ Windows 認証での接続に失敗しました。
        echo    以下を確認してください:
        echo      1. SSMS で %SQL_SERVER% に接続できるか
        echo      2. サーバー名が正しいか（SSMS の接続画面と一致させる）
        echo      3. 現在の Windows アカウントに SQL Server への権限があるか
        echo    ※ サーバー名が違う場合は server.js の server 設定を変更してください。
        set "CHECK_FAILED=1"
    ) else (
        echo ✅ Windows 認証での接続に成功しました。
    )
)
echo.

REM ===================================================
REM 結果サマリー
REM ===================================================
if !CHECK_FAILED! equ 1 (
    echo ===================================================
    echo ❌ SQL Server 環境に問題があります。上記を修正してから
    echo    再度 start.bat を実行してください。
    echo ===================================================
    endlocal & exit /b 1
) else (
    echo ===================================================
    echo ✅ SQL Server 環境チェック完了
    echo ===================================================
    echo.
    endlocal & exit /b 0
)
