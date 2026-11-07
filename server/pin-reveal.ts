import { decryptApiKey, encryptApiKey } from "./api-key-crypto";

/**
 * «Посмотреть PIN» у сотрудника. PIN хранится хешем (bcrypt-подобно, в
 * обратную сторону не читается), поэтому PIN, заданный руководителем,
 * дополнительно лежит зашифрованным (AES-256-GCM, ключ — как у «Показать
 * ключ» API). PIN, который сотрудник придумал или сменил сам, не хранится:
 * руководитель видит «сотрудник сменил PIN» и может задать новый.
 * Любая смена PIN (storage.setUserPin) стирает сохранённый.
 */
const PREFIX = "pin:";

export function sealPin(pin: string): string | null {
  try {
    return encryptApiKey(PREFIX + pin);
  } catch {
    // Нет секрета шифрования — PIN просто нельзя будет посмотреть.
    return null;
  }
}

export function openPin(sealed: string): string | null {
  try {
    const plain = decryptApiKey(sealed);
    return plain.startsWith(PREFIX) ? plain.slice(PREFIX.length) : null;
  } catch {
    return null;
  }
}
