const { execSync } = require('child_process');

// mssql/msnodesqlv8 は Windows で driver 設定を無視し Native Client 11.0 を使うため、
// connectionString を明示してインストール済みの ODBC Driver 17/18 を使う。
const CANDIDATE_DRIVERS = [
    'ODBC Driver 18 for SQL Server',
    'ODBC Driver 17 for SQL Server'
];

const SQL_SERVER = 'localhost\\SQLEXPRESS';

function isOdbcDriverInstalled(driverName) {
    const keys = [
        `HKLM\\SOFTWARE\\ODBC\\ODBCINST.INI\\${driverName}`,
        `HKLM\\SOFTWARE\\WOW6432Node\\ODBC\\ODBCINST.INI\\${driverName}`
    ];

    for (const key of keys) {
        try {
            execSync(`reg query "${key}"`, { stdio: 'ignore' });
            return true;
        } catch {
            // 次のキーを試す
        }
    }
    return false;
}

function resolveOdbcDriver() {
    for (const driver of CANDIDATE_DRIVERS) {
        if (isOdbcDriverInstalled(driver)) {
            return driver;
        }
    }
    // 見つからない場合は 17 を試し、接続時エラーで分かるようにする
    return 'ODBC Driver 17 for SQL Server';
}

function buildConfig(database) {
    const driver = resolveOdbcDriver();
    return {
        connectionString:
            `Driver={${driver}};` +
            `Server=${SQL_SERVER};` +
            `Database=${database};` +
            'Trusted_Connection=Yes;' +
            'TrustServerCertificate=Yes;'
    };
}

module.exports = {
    buildConfig,
    resolveOdbcDriver,
    SQL_SERVER,
    CANDIDATE_DRIVERS
};
