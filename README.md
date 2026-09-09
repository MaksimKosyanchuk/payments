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
