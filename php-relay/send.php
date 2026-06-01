<?php
/**
 * TasksFlow mail relay.
 *
 * Лежит на сервере в веб-корне домена (например
 *   /var/www/tasksflow/data/www/tasksflow.ru/send.php
 * ), доступен как https://tasksflow.ru/send.php — наш Node-бекенд
 * POST-ит сюда JSON с письмом, PHP отдаёт его локальному exim/postfix
 * через mail(). Никакой БД, никакой логики приложения — только реле.
 *
 * Защита: общий секрет в заголовке X-Relay-Token. Без токена ничего
 * не отправит. Поменяйте RELAY_TOKEN на длинный рандом (>=32 символа)
 * и впишите тот же в .env Node-приложения как PHP_RELAY_TOKEN, а URL
 * этого файла — как PHP_RELAY_URL.
 *
 * SPF для доставляемости: в DNS домена нужна TXT-запись вида
 *   v=spf1 ip4:<IP сервера> ~all
 * иначе Gmail может отклонять письма (550-5.7.26 unauthenticated).
 */
declare(strict_types=1);

// ---- Настройки. Замените RELAY_TOKEN на свой длинный секрет. ----
const RELAY_TOKEN = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING_AT_LEAST_32_CHARS';
const FROM_EMAIL  = 'noreply@tasksflow.ru';
const FROM_NAME   = 'TasksFlow';
const LOG_PATH    = __DIR__ . '/send.log';   // null чтобы выключить логи

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function reply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function logLine(string $line): void {
    if (!LOG_PATH) return;
    @file_put_contents(LOG_PATH, '[' . date('c') . '] ' . $line . "\n", FILE_APPEND);
}

// 1. Только POST.
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(405, ['error' => 'method not allowed']);
}

// 2. Токен.
$got = $_SERVER['HTTP_X_RELAY_TOKEN'] ?? '';
if (!is_string($got) || !hash_equals(RELAY_TOKEN, $got)) {
    logLine('bad token from ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
    reply(401, ['error' => 'bad token']);
}

// 3. Тело.
$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    reply(400, ['error' => 'json body required']);
}

$to      = isset($body['to'])      && is_string($body['to'])      ? trim($body['to']) : '';
$subject = isset($body['subject']) && is_string($body['subject']) ? $body['subject']  : '';
$html    = isset($body['html'])    && is_string($body['html'])    ? $body['html']     : '';

if ($to === '' || $subject === '' || $html === '') {
    reply(400, ['error' => 'to, subject, html are required']);
}
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    reply(400, ['error' => 'invalid to address']);
}

// 4. Заголовки. Subject в RFC 2047 base64 для кириллицы.
$encSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$fromHeader = sprintf('=?UTF-8?B?%s?= <%s>', base64_encode(FROM_NAME), FROM_EMAIL);

$headers = implode("\r\n", [
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'From: ' . $fromHeader,
    'Reply-To: ' . FROM_EMAIL,
    'X-Mailer: TasksFlow-PHP-Relay/1.0',
]);

// 5. Отправка. -f задаёт envelope-from для корректного Return-Path.
$ok = @mail($to, $encSubject, $html, $headers, '-f' . FROM_EMAIL);

if (!$ok) {
    $err = error_get_last();
    logLine("mail() failed to {$to}: " . ($err['message'] ?? 'unknown'));
    reply(502, ['error' => 'mail() returned false', 'detail' => $err['message'] ?? null]);
}

logLine("sent to {$to} (subject {$subject})");
reply(200, ['ok' => true]);
