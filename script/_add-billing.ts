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
 *   promo_codes       — промокоды (root).
 *   company_requisites — реквизиты компании для счёта и УПД.
 *   closing_documents — закрывающие документы: снимок на дату оплаты.
 *   price_promotions  — акции по расписанию (root).
 *   company_discounts — постоянные скидки компаний (по строке на код).
 *   balance_transactions — журнал баланса в баллах.
 *
 * Только CREATE TABLE, ADD COLUMN / ADD INDEX к этим же таблицам и одна строка цены в
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
  [
    "promo_codes",
    `CREATE TABLE promo_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(32) NOT NULL,
      kind VARCHAR(8) NOT NULL,
      value INT NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      starts_at INT NULL,
      ends_at INT NULL,
      max_uses INT NULL,
      new_clients_only TINYINT(1) NOT NULL DEFAULT 0,
      company_id INT NULL,
      note VARCHAR(255) NULL,
      created_at INT NOT NULL DEFAULT 0,
      updated_at INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_promo_codes_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  [
    "company_requisites",
    `CREATE TABLE company_requisites (
      company_id INT NOT NULL PRIMARY KEY,
      kind VARCHAR(8) NOT NULL DEFAULT 'org',
      name VARCHAR(255) NOT NULL,
      inn VARCHAR(12) NOT NULL,
      kpp VARCHAR(9) NULL,
      ogrn VARCHAR(15) NULL,
      address VARCHAR(500) NOT NULL,
      head_post VARCHAR(100) NULL,
      head_name VARCHAR(150) NULL,
      email VARCHAR(255) NULL,
      updated_at INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  [
    "closing_documents",
    `CREATE TABLE closing_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      company_id INT NOT NULL,
      number VARCHAR(32) NOT NULL,
      issued_at INT NOT NULL,
      seller TEXT NOT NULL,
      buyer TEXT NOT NULL,
      line_items TEXT NOT NULL,
      total_rub INT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'issued',
      voided_at INT NULL,
      created_at INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_closing_documents_order (order_id),
      KEY idx_closing_documents_company (company_id, issued_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  [
    "price_promotions",
    `CREATE TABLE price_promotions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      discount_percent INT NOT NULL,
      starts_at INT NOT NULL,
      ends_at INT NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      note VARCHAR(255) NULL,
      created_at INT NOT NULL DEFAULT 0,
      updated_at INT NOT NULL DEFAULT 0,
      KEY idx_price_promotions_window (active, ends_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  [
    "company_discounts",
    `CREATE TABLE company_discounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      promo_code_id INT NOT NULL,
      code VARCHAR(32) NOT NULL,
      kind VARCHAR(8) NOT NULL,
      value INT NOT NULL,
      order_id INT NULL,
      bound_at INT NOT NULL,
      expires_at INT NULL,
      revoked_at INT NULL,
      revoked_by INT NULL,
      updated_at INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_company_discounts_code (company_id, promo_code_id),
      KEY idx_company_discounts_order (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  [
    "balance_transactions",
    `CREATE TABLE balance_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      amount_rub INT NOT NULL,
      balance_after INT NOT NULL,
      kind VARCHAR(24) NOT NULL,
      description VARCHAR(255) NOT NULL,
      order_id INT NULL,
      actor_user_id INT NULL,
      dedupe_key VARCHAR(64) NULL,
      created_at INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_balance_transactions_dedupe (dedupe_key),
      KEY idx_balance_transactions_company (company_id, id)
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
  // Промокоды и оплата по счёту.
  ["payment_orders", "payment_method", "VARCHAR(16) NOT NULL DEFAULT 'card'"],
  ["payment_orders", "base_rub", "INT NULL"],
  ["payment_orders", "discount_rub", "INT NOT NULL DEFAULT 0"],
  ["payment_orders", "promo_code", "VARCHAR(32) NULL"],
  ["payment_orders", "invoice_due_at", "INT NULL"],
  // Баланс, акции, постоянные скидки.
  ["payment_orders", "order_kind", "VARCHAR(8) NOT NULL DEFAULT 'plan'"],
  ["payment_orders", "promotion_id", "INT NULL"],
  ["payment_orders", "promotion_percent", "INT NULL"],
  ["payment_orders", "promotion_discount_rub", "INT NOT NULL DEFAULT 0"],
  ["payment_orders", "discount_source", "VARCHAR(8) NULL"],
  ["payment_orders", "points_rub", "INT NOT NULL DEFAULT 0"],
  ["payment_orders", "points_state", "VARCHAR(12) NULL"],
  ["promo_codes", "lifetime", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["promo_codes", "duration_months", "INT NULL"],
  ["company_billing", "balance_rub", "INT NOT NULL DEFAULT 0"],
];

// Индексы к колонкам выше: использования промокода считаются по заказам.
const INDEXES: Array<[string, string, string]> = [["payment_orders", "idx_payment_orders_promo", "(promo_code, status)"]];

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
  for (const [table, name, columns] of INDEXES) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` ${columns}`));
      console.log(`[migrate] added index ${table}.${name}`);
    } catch (err: any) {
      if (err?.code === "ER_DUP_KEYNAME") console.log(`[migrate] ${table}.${name} already exists, skipping`);
      else throw err;
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] billing failed:", err);
  process.exit(1);
});
