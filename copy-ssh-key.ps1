# Скрипт для копирования SSH ключа на сервер
# Потребуется один раз ввести пароль

$SERVER_USER = "tasks"
$SERVER_HOST = "tasksflow.ru"
$SERVER_PORT = "50222"
$PUB_KEY_PATH = "$env:USERPROFILE\.ssh\id_ed25519.pub"

if (-not (Test-Path $PUB_KEY_PATH)) {
    Write-Host "Ошибка: SSH ключ не найден в $PUB_KEY_PATH" -ForegroundColor Red
    exit 1
}

$pubKey = Get-Content $PUB_KEY_PATH -Raw
$pubKey = $pubKey.Trim()

Write-Host "Копирование SSH ключа на сервер..." -ForegroundColor Yellow
Write-Host "Вам будет предложено ввести пароль один раз" -ForegroundColor Yellow
Write-Host ""

# Команда для добавления ключа на сервер
$command = @"
mkdir -p ~/.ssh && 
if ! grep -Fxq '$pubKey' ~/.ssh/authorized_keys 2>/dev/null; then
    echo '$pubKey' >> ~/.ssh/authorized_keys && 
    chmod 700 ~/.ssh && 
    chmod 600 ~/.ssh/authorized_keys && 
    echo 'SSH ключ успешно добавлен'
else
    echo 'SSH ключ уже существует на сервере'
fi
"@

ssh -p $SERVER_PORT "${SERVER_USER}@${SERVER_HOST}" $command

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== SSH ключ успешно скопирован! ===" -ForegroundColor Green
    Write-Host "Теперь вы можете подключаться без пароля" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "=== Ошибка при копировании ключа ===" -ForegroundColor Red
    exit 1
}
