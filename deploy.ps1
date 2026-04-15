# TasksFlow Deploy Script (PowerShell)

$SERVER_USER = "tasks"
$SERVER_HOST = "tasksflow.ru"
$SERVER_PORT = "50222"
$REMOTE_PATH = "/var/www/tasksflow/data/www/tasksflow.ru"

Write-Host "=== TasksFlow Deploy ===" -ForegroundColor Yellow
Write-Host "Server: ${SERVER_USER}@${SERVER_HOST}:${SERVER_PORT}"
Write-Host "Path: ${REMOTE_PATH}"
Write-Host ""

$commands = "cd $REMOTE_PATH && git pull && npm run build && pm2 restart 0 && pm2 status"

Write-Host "Connecting to server..." -ForegroundColor Green

ssh -p $SERVER_PORT "${SERVER_USER}@${SERVER_HOST}" $commands

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== Deploy completed! ===" -ForegroundColor Green
    Write-Host "Site: https://${SERVER_HOST}"
} else {
    Write-Host ""
    Write-Host "=== Deploy error! ===" -ForegroundColor Red
    exit 1
}
