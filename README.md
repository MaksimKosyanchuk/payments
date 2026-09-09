# P2P Ledger — стартовий репозиторій

Це стартовий каркас для тестового завдання (`ТЗ_тестове_завдання_6`). Частина
сервісів уже працює, частина — лише каркас або TODO. Повний опис завдання —
у файлі ТЗ, який ви отримали окремо.

## Що вже працює

- `apps/ledger-service` — auth, event-sourced wallets, holds, reconciliation, `@ServiceAuth` для payments.
- `apps/payments-service` — transfer saga + FX + **split bills** (спільні рахунки).
- `apps/notifications-service` — Redis consumer, WS, activity, split overdue notifications.
- `apps/frontend` — login, wallets, transfer live, **`/splits`** спільні рахунки.

## Запуск

```bash
docker-compose up --build
```

- ledger-service: http://localhost:3001
- payments-service: http://localhost:3002
- notifications-service: http://localhost:3003
- frontend: http://localhost:3000

Для локальної розробки без Docker: скопіюйте `.env.example` → `.env` у
кожному сервісі, підніміть Postgres окремо, `npm install && npm run start:dev`
у потрібному сервісі.

## Тести

```bash
cd apps/ledger-service && npm test
```

## Знайдені закладні баги (ТЗ §3.2)

### 1. IDOR — читання чужого гаманця

- **Проблема:** `GET /wallets/:id` віддавав проєкцію будь-якого гаманця без перевірки
  власника (спочатку навіть без JWT).
- **Відтворення:** знати UUID чужого гаманця → `GET /wallets/:id` (або без токена на
  стартерній версії) → видно баланс/дані не свого гаманця.
- **Фікс:** user API — `JwtAuthGuard` + `getOwnedById` (чужий id → 404); для payments
  saga — `@ServiceAuth()` / `x-service-key` і `GET /internal/wallets/:id`.

### 2. Хибно-зелений тест withdraw

- **Проблема:** у стартері `apps/ledger-service/test/wallets.service.spec.ts` тест
  «does not allow withdrawing more than the current balance» викликав
  `service.withdraw(...).catch(...)` **без `await`**. Jest завершував тест до
  перевірки reject — тест міг бути зеленим навіть якщо withdraw не кидав помилку.
- **Відтворення:** прибрати `throw` з withdraw при недостатньому балансі → тест у
  стартерній формі все одно pass.
- **Фікс:** `await expect(service.withdraw(...)).rejects.toBeInstanceOf(BadRequestException)`.

### 3. Race / double-spend на балансі (check-then-act)

- **Проблема:** у стартері `deposit` / `withdraw` робили read-modify-write поля
  `wallet.balance` без транзакції й без блокування рядка: спочатку читали баланс і
  перевіряли достатність, потім рахували нове значення в пам’яті і `save`. Між
  перевіркою і записом інший паралельний запит міг змінити баланс — обидва withdraw
  бачили старий `current` і обидва проходили (overspend / «подвійна витрата»).
- **Відтворення:** гаманець з балансом 100; два одночасні `POST .../withdraw` по 80
  → обидва успішні; підсумковий баланс некоректний (наприклад 20 замість відмови
  другого запиту).
- **Фікс:** event sourcing + DB-транзакція + `pessimistic_write` на wallet row
  (`loadWallet(..., { lock: true })`) і унікальність `(streamId, version)` на
  подіях — перевірка available і append події в одному критичному секті.

## Observability и admin traces

Каждый backend публикует живые Prometheus-метрики на `/metrics`: HTTP request
counter/histogram, а также saga-step, saga-duration и event-consumer metrics.
`OTEL_EXPORTER_OTLP_ENDPOINT` включает OTLP trace exporter; без этой переменной
локальный запуск остаётся рабочим. Входящий W3C `traceparent` возвращается в
HTTP-ответе, передаётся payments → ledger и сохраняется в payments outbox/Redis
event envelope, после чего логируется notifications consumer.

Admin trace flow: Next BFF проверяет admin JWT на `/api/admin/traces`, затем
передаёт server-side `x-admin-key` в payments endpoint
`GET /transfers/admin/recent`. Ответ содержит transfer status, duration и
упорядоченные `saga_steps`; эти данные отображаются на `/admin`.

## Idempotency и acceptance tests

`POST /transfers`, создание split bill и оплата split share используют
`Idempotency-Key`. Split bill хранит ключ в уникальном поле `idempotencyKey`, а
повторный запрос возвращает уже созданный bill. Повторная оплата share с тем же
ключом не создаёт новую transfer saga.

Ledger tests дополнительно проверяют double-entry равенство debit/credit и
reconciliation с нулевым journal difference. Payments tests проверяют повторное
создание split bill и saga compensation/idempotency paths.
