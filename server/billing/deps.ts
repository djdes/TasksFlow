import { getPublicTasksflowBaseUrl } from "../public-urls";
import { storage } from "../storage";
import { billingNotifier } from "./notify";
import { robokassaConfig } from "./robokassa";
import type { BillingDeps } from "./service";
import { billingStore } from "./store";

/** Боевые зависимости оплаты: MySQL, env Робокассы, push/Telegram/почта. */
export function defaultBillingDeps(): BillingDeps {
  return {
    store: billingStore,
    config: () => robokassaConfig(),
    notify: billingNotifier,
    getCompany: (id) => storage.getCompanyById(id),
    countUsers: (companyId) => storage.countCompanyUsers(companyId),
    baseUrl: () => getPublicTasksflowBaseUrl(),
  };
}
