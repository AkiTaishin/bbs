@echo off
setlocal EnableDelayedExpansion
chcp 65001 > nul

set "CHECK_FAILED=0"
set "SQL_SERVER=localhost\SQLEXPRESS"
set "SKIP_PAUSE=0"
if /I "%~1"=="nopause" set "SKIP_PAUSE=1"

echo ===================================================
echo   SQL Server 環境チェック
echo ===================================================
echo.

REM ===================================================
REM [3] SQL Server 本体 + Browser サービスの確認・起動
REM ===================================================
echo [3/6] SQL Server サービスを確認しています...

sc query "MSSQL$SQLEXPRESS" >nul 2>&1
if !errorlevel! neq 0 (
    echo ❌ SQL Server ^(SQLEXPRESS^) サービスが見つかりません。
    echo    SQL Server Express がインストールされているか確認してください。
    set "CHECK_FAILED=1"
) else (
    sc query "MSSQL$SQLEXPRESS" | findstr /C:"RUNNING" >nul 2>&1
    if !errorlevel! neq 0 (
        echo    SQL Server ^(SQLEXPRESS^) が停止中です。起動を試みます...
        net start "MSSQL$SQLEXPRESS" >nul 2>&1
        if !errorlevel! neq 0 (
            echo ❌ SQL Server の起動に失敗しました。
            echo    管理者として実行するか、services.msc から
            echo    「SQL Server ^(SQLEXPRESS^)」を開始してください。
            set "CHECK_FAILED=1"
        ) else (
            echo ✅ SQL Server ^(SQLEXPRESS^) を起動しました。
        )
    ) else (
        echo ✅ SQL Server ^(SQLEXPRESS^) は実行中です。
    )
)

sc query SQLBrowser >nul 2>&1
if !errorlevel! neq 0 (
    echo ⚠️  SQL Server Browser サービスがインストールされていません。
    echo    名前付きインスタンス接続に必要な場合があります。
    set "CHECK_FAILED=1"
) else (
    sc query SQLBrowser | findstr /C:"RUNNING" >nul 2>&1
    if !errorlevel! neq 0 (
        echo    Browser サービスが停止中です。起動を試みます...
        net start SQLBrowser >nul 2>&1
        if !errorlevel! neq 0 (
            echo ❌ Browser サービスの起動に失敗しました。
            echo    管理者として net start SQLBrowser を実行してください。
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
REM ===================================================
echo [4/6] ODBC ドライバーを確認しています...

set "ODBC_OK=0"
reg query "HKLM\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 17 for SQL Server" >nul 2>&1
if !errorlevel! equ 0 set "ODBC_OK=1"
reg query "HKLM\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 18 for SQL Server" >nul 2>&1
if !errorlevel! equ 0 set "ODBC_OK=1"

if !ODBC_OK! equ 0 (
    echo ❌ ODBC Driver 17 または 18 for SQL Server が見つかりません。
    echo    https://learn.microsoft.com/ja-jp/sql/connect/odbc/download-odbc-driver-for-sql-server
    set "CHECK_FAILED=1"
) else (
    echo ✅ ODBC ドライバーがインストールされています。
)
echo.

REM ===================================================
REM [5] TCP/IP プロトコルの確認・有効化
REM     ※ for /f + PowerShell はエラー出力で CMD が落ちることがあるため
REM       一時ファイル経由で結果を受け取る
REM ===================================================
echo [5/6] TCP/IP プロトコルを確認しています...

set "TCP_RESULT=ERROR"
set "TCP_ERR_FILE=%TEMP%\bbs_tcp_check_err.txt"
set "TCP_OUT_FILE=%TEMP%\bbs_tcp_check_out.txt"
set "PS_SCRIPT=%~dp0scripts\enable_tcp_ip.ps1"

if not exist "%PS_SCRIPT%" (
    echo ❌ TCP/IP 確認スクリプトが見つかりません: %PS_SCRIPT%
    echo    プロジェクトフォルダが壊れていないか確認してください。
    set "CHECK_FAILED=1"
    goto :after_tcp_check
)

del /f /q "%TCP_OUT_FILE%" "%TCP_ERR_FILE%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" 1> "%TCP_OUT_FILE%" 2> "%TCP_ERR_FILE%"
set "PS_EXIT=!errorlevel!"

if exist "%TCP_OUT_FILE%" (
    set /p TCP_RESULT=<"%TCP_OUT_FILE%"
)

if "!TCP_RESULT!"=="" set "TCP_RESULT=ERROR"

if !PS_EXIT! neq 0 (
    echo ⚠️  TCP/IP 確認スクリプトの実行に失敗しました^(終了コード: !PS_EXIT!^)。
    if exist "%TCP_ERR_FILE%" (
        echo    --- 詳細 ---
        type "%TCP_ERR_FILE%"
    )
    set "CHECK_FAILED=1"
    goto :after_tcp_check
)

if /I "!TCP_RESULT!"=="NOTFOUND" (
    echo ⚠️  SQLEXPRESS インスタンスの TCP/IP 設定が見つかりません。
    echo    SQL Server Configuration Manager で TCP/IP を確認してください。
    set "CHECK_FAILED=1"
) else if /I "!TCP_RESULT!"=="DENIED" (
    echo ⚠️  TCP/IP の有効化に管理者権限が必要です。
    echo    start.bat を右クリック →「管理者として実行」するか、
    echo    SQL Server Configuration Manager で手動で TCP/IP を有効にしてください。
    set "CHECK_FAILED=1"
) else if /I "!TCP_RESULT!"=="ENABLED" (
    echo    TCP/IP が無効だったため、有効化しました。SQL Server を再起動します...
    net stop "MSSQL$SQLEXPRESS" /y >nul 2>&1
    timeout /t 3 /nobreak >nul
    net start "MSSQL$SQLEXPRESS" >nul 2>&1
    if !errorlevel! neq 0 (
        echo ❌ SQL Server の再起動に失敗しました。
        echo    管理者として実行するか、services.msc から手動で再起動してください。
        set "CHECK_FAILED=1"
    ) else (
        echo ✅ TCP/IP を有効化し、SQL Server を再起動しました。
    )
) else if /I "!TCP_RESULT!"=="OK" (
    echo ✅ TCP/IP プロトコルは有効です。
) else (
    echo ⚠️  TCP/IP の確認結果が不明です^(結果: !TCP_RESULT!^)。
    if exist "%TCP_ERR_FILE%" (
        echo    --- 詳細 ---
        type "%TCP_ERR_FILE%"
    )
    echo    SQL Server Configuration Manager で TCP/IP が有効か確認してください。
    set "CHECK_FAILED=1"
)

:after_tcp_check
del /f /q "%TCP_OUT_FILE%" "%TCP_ERR_FILE%" >nul 2>&1
echo.

REM ===================================================
REM [6] Windows 認証での接続テスト
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
        echo      1. SSMS で %SQL_SERVER% に接続できるか
        echo      2. サーバー名が SSMS の表示と一致しているか
        echo      3. Windows アカウントに SQL Server への権限があるか
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
    echo.
    if !SKIP_PAUSE! equ 0 (
        echo 何かキーを押すと閉じます...
        pause >nul
    )
    endlocal & exit /b 1
) else (
    echo ===================================================
    echo ✅ SQL Server 環境チェック完了
    echo ===================================================
    echo.
    endlocal & exit /b 0
)
