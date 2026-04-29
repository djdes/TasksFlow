/**
 * Создаёт (или промоутит существующего) админа компании.
 *
 * Использование:
 *   npm run seed-admin -- --phone=+79991234567 --name="Денис" --company="ООО Ромашка"
 *
 * Поведение:
 *   1. Если company с таким именем нет — создаёт.
 *   2. Если user с таким телефоном нет — создаёт как admin этой company.
 *   3. Если user есть, но не admin — промоутит до admin и привязывает к company.
 *   4. Если user есть и admin — обновляет companyId если нужно.
 *
 * Идемпотентно — повторный запуск ничего не ломает. Не дропает,
 * не удаляет.
 */
import "dotenv/config";
import { db } from "../server/db";
import { users, companies } from "../shared/schema";
import { eq } from "drizzle-orm";

function getArg(name: string): string | undefined {
	const prefix = `--${name}=`;
	const arg = process.argv.find((a) => a.startsWith(prefix));
	return arg?.slice(prefix.length);
}

async function main() {
	const phoneRaw = getArg("phone");
	const name = getArg("name") || "Администратор";
	const companyName = getArg("company") || "Моя компания";

	if (!phoneRaw) {
		console.error("Usage: npm run seed-admin -- --phone=+7XXXXXXXXXX [--name=\"...\"] [--company=\"...\"]");
		process.exit(1);
	}

	const phone = phoneRaw.replace(/\s+/g, "").replace(/-/g, "");
	if (!/^\+7\d{10}$/.test(phone)) {
		console.error(`Bad phone format: "${phone}". Expected +7XXXXXXXXXX (11 digits after +).`);
		process.exit(1);
	}

	// 1. Company
	let [company] = await db.select().from(companies).where(eq(companies.name, companyName));
	if (!company) {
		const [result] = await db.insert(companies).values({
			name: companyName,
			createdAt: Math.floor(Date.now() / 1000),
		});
		const newId = (result as any).insertId;
		[company] = await db.select().from(companies).where(eq(companies.id, newId));
		console.log(`✅ company created: id=${company!.id} name="${company!.name}"`);
	} else {
		console.log(`ℹ company exists: id=${company.id} name="${company.name}"`);
	}

	// 2. User
	const [existing] = await db.select().from(users).where(eq(users.phone, phone));
	if (!existing) {
		const [result] = await db.insert(users).values({
			phone,
			name,
			isAdmin: true,
			companyId: company!.id,
			createdAt: Math.floor(Date.now() / 1000),
		});
		const userId = (result as any).insertId;
		console.log(`✅ admin created: id=${userId} phone=${phone} name="${name}" companyId=${company!.id}`);
		return;
	}

	const patch: Record<string, unknown> = {};
	if (!existing.isAdmin) patch.isAdmin = true;
	if (existing.companyId !== company!.id) patch.companyId = company!.id;
	if (existing.name !== name) patch.name = name;

	if (Object.keys(patch).length === 0) {
		console.log(`ℹ admin already up-to-date: id=${existing.id} phone=${phone}`);
		return;
	}

	await db.update(users).set(patch).where(eq(users.id, existing.id));
	console.log(`✅ admin updated: id=${existing.id} phone=${phone} patch=${JSON.stringify(patch)}`);
}

main().then(() => process.exit(0)).catch((err) => {
	console.error("❌ Failed:", err);
	process.exit(1);
});
