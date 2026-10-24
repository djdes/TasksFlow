import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Оплата тарифов через Робокассу (shared/billing.ts, server/billing):
 *
 *   billing_prices    — цены тарифов (тариф × срок), правит root. При
 *                       создании — «Команда» 990 ₽ в месяц, как на лендинге.
 *   payment_orders    — заказы; id уходит в Робокассу как InvId.
 *   payment_consents  — история согласий на автосписания и их отзывов.
 *   company_billing   — автопродление компании (серия платежей).
 *
 * Только CREATE TABLE, ADD COLUMN к этим же таблицам и одна строка цены в
 * новой таблице; остальные таблицы и строки не трогает. Идемпотентно:
 * ER_TABLE_EXISTS_ERROR / ER_DUP_FIELDNAME = уже есть. Шаг деплоя
 * обязательный: код читает все эти колонки.
 */
const TABLES: Array<[string, string]> = [
  [
    "billing_prices",
    `CREATE TABLE billing_prices (
      plan VARCHAR(20) NOT NULL,
      months INT NOT NULL,
      price_rub INT NOT NULL,
      updated_at INT NOT NULL DEFAULT 0,
      PRIMARY KEY (plan, months)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  [
    "payment_orders",
    `CREATE TABLE payment_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      user_id INT NULL,
      email VARCHAR(255) NULL,
      plan VARCHAR(20) NOT NULL,
      months INT NOT NULL,
      amount_rub INT NOT NULL,
      description VARCHAR(255) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      is_test TINYINT(1) NOT NULL DEFAULT 0,
      recurring_consent TINYINT(1) NOT NULL DEFAULT 0,
      recurring_charge_of INT NULL,
      plan_until_after INT NULL,
      raw_result TEXT NULL,
      created_at INT NOT NULL DEFAULT 0,
      paid_at INT NULL,
      KEY idx_payment_orders_company (company_id, created_at),
      KEY idx_payment_orders_status (status, created_at),
      KEY idx_payment_orders_charge_of (recurring_charge_of)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  [
    "payment_consents",
    `CREATE TABLE payment_consents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      user_id INT NULL,
      order_id INT NULL,
      granted TINYINT(1) NOT NULL,
      statement_text TEXT NOT NULL,
      offer_revision VARCHAR(20) NOT NULL,
      ip VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      created_at INT NOT NULL DEFAULT 0,
      KEY idx_payment_consents_company (company_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  [
    "company_billing",
    `CREATE TABLE company_billing (
      company_id INT NOT NULL PRIMARY KEY,
      recurring_active TINYINT(1) NOT NULL DEFAULT 0,
      recurring_parent_order_id INT NULL,
      recurring_plan VARCHAR(20) NULL,
      recurring_months INT NULL,
      recurring_amount_rub INT NULL,
      recurring_attempts INT NOT NULL DEFAULT 0,
      recurring_last_attempt_at INT NULL,
      recurring_notice_for INT NULL,
      recurring_disabled_at INT NULL,
      updated_at INT NOT NULL DEFAULT 0,
      KEY idx_company_billing_active (recurring_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
];

// Колонки, добавленные после первой выкладки (11.2026): откат тарифа при
// возврате, сверка с кассой, возвраты, напоминания об окончании тарифа.
const COLUMNS: Array<[string, string, string]> = [
  ["payment_orders", "plan_before", "VARCHAR(20) NULL"],
  ["payment_orders", "plan_until_before", "INT NULL"],
  ["payment_orders", "checked_at", "INT NULL"],
  ["payment_orders", "refund_status", "VARCHAR(16) NULL"],
  ["payment_orders", "refund_request_id", "VARCHAR(64) NULL"],
  ["payment_orders", "refund_requested_at", "INT NULL"],
  ["payment_orders", "refunded_at", "INT NULL"],
  ["company_billing", "expiry_notice_for", "INT NULL"],
  ["company_billing", "expired_notice_for", "INT NULL"],
];

async function main() {
  for (const [name, ddl] of TABLES) {
    try {
      await db.execute(sql.raw(ddl));
      console.log(`[migrate] created table ${name}`);
      if (name === "billing_prices") {
        await db.execute(
          sql`INSERT INTO billing_prices (plan, months, price_rub, updated_at) VALUES ('team', 1, 990, ${Math.floor(Date.now() / 1000)})`,
        );
        console.log("[migrate] billing_prices: «Команда» 990 ₽ в месяц");
      }
    } catch (err: any) {
      if (err?.code === "ER_TABLE_EXISTS_ERROR") console.log(`[migrate] ${name} already exists, skipping`);
      else throw err;
    }
  }
  for (const [table, column, ddl] of COLUMNS) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`));
      console.log(`[migrate] added ${table}.${column}`);
    } catch (err: any) {
      if (err?.code === "ER_DUP_FIELDNAME") console.log(`[migrate] ${table}.${column} already exists, skipping`);
      else throw err;
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] billing failed:", err);
  process.exit(1);
});
