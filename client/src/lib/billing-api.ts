import { useEffect, useState } from "react";
import {
  ROBOKASSA_IFRAME_SCRIPT_URL,
  type BillingInfo,
  type BillingOrder,
  type CheckoutInput,
  type CheckoutResult,
  type CompanyRequisites,
  type InvoiceInput,
  type InvoiceResult,
  type PromoQuote,
} from "@shared/billing";
import { apiRequest, fetchOrFriendlyError, withTimeout } from "./queryClient";

/** Тариф и оплата компании: страница «Тариф и оплата» (server/billing-routes.ts). */
export const BILLING_KEY = "/api/billing";

declare global {
  interface Window {
    Robokassa?: { StartPayment: (params: Record<string, string>) => void };
  }
}

export async function fetchBilling(signal?: AbortSignal): Promise<BillingInfo> {
  const res = await fetchOrFriendlyError(BILLING_KEY, { credentials: "include", signal: withTimeout(signal, 30_000) });
  if (!res.ok) throw new Error("Не удалось загрузить тариф и платежи");
  return res.json();
}

/** Статус заказа; null — заказ не найден (чужой или удалён). */
export async function fetchOrder(id: number): Promise<BillingOrder | null> {
  const res = await fetchOrFriendlyError(`/api/billing/orders/${id}`, { credentials: "include", signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Не удалось проверить оплату");
  return res.json();
}

export async function startCheckout(input: Omit<CheckoutInput, "recurringConsent"> & { recurringConsent: boolean }): Promise<CheckoutResult> {
  const res = await apiRequest("POST", "/api/billing/checkout", input);
  return res.json();
}

export async function cancelRecurring(): Promise<void> {
  await apiRequest("DELETE", "/api/billing/recurring");
}

/** Что даст промокод на тариф и срок. Ошибка сети — исключение, «не подошёл» — ok: false. */
export async function checkPromo(input: { plan: string; months: number; promoCode: string }): Promise<PromoQuote> {
  const res = await apiRequest("POST", "/api/billing/promo", input);
  return res.json();
}

export async function saveRequisites(requisites: Record<string, string>): Promise<{ requisites: CompanyRequisites }> {
  const res = await apiRequest("PUT", "/api/billing/requisites", requisites);
  return res.json();
}

export async function createInvoice(input: InvoiceInput): Promise<InvoiceResult> {
  const res = await apiRequest("POST", "/api/billing/invoice", input);
  return res.json();
}

export const invoicePdfUrl = (orderId: number) => `/api/billing/orders/${orderId}/invoice.pdf`;
export const updPdfUrl = (orderId: number) => `/api/billing/orders/${orderId}/upd.pdf`;

/**
 * Скрипт окна оплаты Робокассы — лениво, один раз на страницу. Не
 * загрузился (блокировщик, сеть) — оплата идёт обычной страницей кассы.
 */
export function useRobokassaScript(enabled: boolean): boolean {
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.Robokassa);
  useEffect(() => {
    if (!enabled || ready) return;
    let cancelled = false;
    const markReady = () => {
      if (!cancelled && window.Robokassa) setReady(true);
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${ROBOKASSA_IFRAME_SCRIPT_URL}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", markReady);
    if (!existing) {
      script.src = ROBOKASSA_IFRAME_SCRIPT_URL;
      script.async = true;
      document.body.appendChild(script);
    }
    return () => {
      cancelled = true;
      script.removeEventListener("load", markReady);
    };
  }, [enabled, ready]);
  return ready;
}
