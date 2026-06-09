# SQLEXPRESS インスタンスの TCP/IP 設定を確認し、無効なら有効化を試みる
# 標準出力には必ず 1 行だけ（OK / ENABLED / NOTFOUND / ERROR / DENIED）を返す
$ErrorActionPreference = 'Stop'

function Get-TcpEnabledState {
    param([string]$InstanceKeyName)

    $tcpPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$InstanceKeyName\MSSQLServer\SuperSocketNetLib\Tcp"
    if (-not (Test-Path -LiteralPath $tcpPath)) {
        return $null
    }

    $enabled = (Get-ItemProperty -LiteralPath $tcpPath -Name Enabled -ErrorAction SilentlyContinue).Enabled
    return @{
        TcpPath = $tcpPath
        Enabled = $enabled
    }
}

try {
    $found = $false
    $changed = $false
    $instanceKeys = @()

    $roots = @(
        'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server'
    )

    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue |
            Where-Object { $_.PSChildName -match '^MSSQL.*\.SQLEXPRESS$' } |
            ForEach-Object { $instanceKeys += $_.PSChildName }
    }

    $instanceKeys = $instanceKeys | Select-Object -Unique

    foreach ($keyName in $instanceKeys) {
        $state = Get-TcpEnabledState -InstanceKeyName $keyName
        if ($null -eq $state) { continue }

        $found = $true
        if ($state.Enabled -ne 1) {
            try {
                Set-ItemProperty -LiteralPath $state.TcpPath -Name Enabled -Value 1 -Type DWord
                $changed = $true
            } catch {
                Write-Output 'DENIED'
                exit 0
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
} catch {
    Write-Output 'ERROR'
}

exit 0
