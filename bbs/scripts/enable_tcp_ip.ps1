# SQLEXPRESS インスタンスの TCP/IP 設定を確認し、無効なら有効化する
$found = $false
$changed = $false

Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server' -ErrorAction SilentlyContinue |
    Where-Object { $_.PSChildName -match '^MSSQL.*\.SQLEXPRESS$' } |
    ForEach-Object {
        $tcpPath = Join-Path $_.PSPath 'MSSQLServer\SuperSocketNetLib\Tcp'
        if (Test-Path $tcpPath) {
            $found = $true
            $enabled = (Get-ItemProperty -Path $tcpPath -Name Enabled -ErrorAction SilentlyContinue).Enabled
            if ($enabled -ne 1) {
                Set-ItemProperty -Path $tcpPath -Name Enabled -Value 1 -Type DWord
                $changed = $true
            }
        }
    }

if (-not $found) {
    Write-Output 'NOTFOUND'
} elseif ($changed) {
    Write-Output 'ENABLED'
} else {
    Write-Output 'OK'
}
