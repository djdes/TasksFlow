import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DEFAULT_PASSWORD = "admin1234";
const DEMO_ORG_EMAIL = "admin@haccp.local";
const DEMO_ORG_NAME = "Тестовая организация HACCP Demo";
const DEMO_ORG_TYPE = "food";

type DemoUserSeed = {
  email: string;
  name: string;
  role: string;
  positionTitle: string;
};

type DemoAreaSeed = {
  name: string;
  description: string;
};

type DemoEquipmentSeed = {
  areaName: string;
  name: string;
  type: string;
  tempMin?: number | null;
  tempMax?: number | null;
};

const DEMO_USERS: DemoUserSeed[] = [
  { email: "admin@haccp.local", name: "Крылов Денис Сергеевич", role: "owner", positionTitle: "Управляющий" },
  { email: "chef@haccp.local", name: "Морозов Илья Андреевич", role: "technologist", positionTitle: "Шеф-повар" },
  { email: "souschef@haccp.local", name: "Кузнецов Павел Игоревич", role: "operator", positionTitle: "Су-шеф" },
  { email: "hotcook1@haccp.local", name: "Волкова Анна Дмитриевна", role: "operator", positionTitle: "Повар горячего цеха" },
  { email: "hotcook2@haccp.local", name: "Соколов Андрей Викторович", role: "operator", positionTitle: "Повар горячего цеха 2 смена" },
  { email: "coldcook1@haccp.local", name: "Орлов Илья Максимович", role: "operator", positionTitle: "Повар холодного цеха" },
  { email: "coldcook2@haccp.local", name: "Федорова Мария Романовна", role: "operator", positionTitle: "Повар холодного цеха 2 смена" },
  { email: "pastry1@haccp.local", name: "Мельникова Софья Романовна", role: "operator", positionTitle: "Повар-кондитер" },
  { email: "pastry2@haccp.local", name: "Ларионова Елена Сергеевна", role: "operator", positionTitle: "Повар-кондитер 2 смена" },
  { email: "waiter1@haccp.local", name: "Смирнова Марина Михайловна", role: "waiter", positionTitle: "Официант" },
  { email: "waiter2@haccp.local", name: "Демин Кирилл Олегович", role: "waiter", positionTitle: "Официант 2 смена" },
  { email: "dishwasher1@haccp.local", name: "Егорова Нина Викторовна", role: "operator", positionTitle: "Посудомойщик" },
  { email: "dishwasher2@haccp.local", name: "Тихонов Артем Сергеевич", role: "operator", positionTitle: "Посудомойщик 2 смена" },
  { email: "cleaner1@haccp.local", name: "Савельева Ирина Павловна", role: "operator", positionTitle: "Уборщик" },
  { email: "cleaner2@haccp.local", name: "Леонов Максим Валерьевич", role: "operator", positionTitle: "Уборщик 2 смена" },
  { email: "storekeeper@haccp.local", name: "Кузьмин Артем Сергеевич", role: "operator", positionTitle: "Кладовщик" },
  { email: "merchandiser@haccp.local", name: "Белова Елена Андреевна", role: "operator", positionTitle: "Товаровед" },
  { email: "technologist@haccp.local", name: "Лебедева Марина Олеговна", role: "technologist", positionTitle: "Технолог" },
  { email: "loader1@haccp.local", name: "Ефимов Роман Алексеевич", role: "operator", positionTitle: "Грузчик" },
  { email: "loader2@haccp.local", name: "Грачев Виктор Ильич", role: "operator", positionTitle: "Грузчик 2 смена" },
  { email: "hall-manager@haccp.local", name: "Громова Алина Павловна", role: "manager", positionTitle: "Менеджер зала" },
  { email: "sanitation@haccp.local", name: "Ермакова Нина Сергеевна", role: "operator", positionTitle: "Специалист по санитарной обработке" },
  { email: "engineer@haccp.local", name: "Титов Максим Андреевич", role: "engineer", positionTitle: "Инженер по оборудованию" },
];

const DEMO_AREAS: DemoAreaSeed[] = [
  { name: "Горячий цех", description: "Основная зона термообработки" },
  { name: "Холодный цех", description: "Салаты, холодные закуски, хранение после сборки" },
  { name: "Кондитерский цех", description: "Десерты, крема, выпечка" },
  { name: "Мойка", description: "Мойка инвентаря и посуды" },
  { name: "Склад", description: "Хранение сырья и упаковки" },
  { name: "Бар", description: "Напитки и разлив" },
  { name: "Зал", description: "Гостевая зона" },
  { name: "Раздача", description: "Финальный отпуск блюд" },
];

const DEMO_EQUIPMENT: DemoEquipmentSeed[] = [
  { areaName: "Холодный цех", name: "Холодильник Polair 1", type: "refrigerator", tempMin: 2, tempMax: 4 },
  { areaName: "Холодный цех", name: "Холодильник Polair 2", type: "refrigerator", tempMin: 2, tempMax: 4 },
  { areaName: "Склад", name: "Морозильный ларь Frostor", type: "freezer", tempMin: -22, tempMax: -18 },
  { areaName: "Горячий цех", name: "Пароконвектомат Rational", type: "oven" },
  { areaName: "Горячий цех", name: "Фритюрница 8л", type: "fryer" },
  { areaName: "Горячий цех", name: "Термогигрометр Testo Hot", type: "thermohygrometer", tempMin: 18, tempMax: 25 },
  { areaName: "Холодный цех", name: "Термогигрометр Testo Cold", type: "thermohygrometer", tempMin: 2, tempMax: 8 },
  { areaName: "Раздача", name: "УФ-лампа бактерицидная 1", type: "uv_lamp" },
  { areaName: "Бар", name: "Холодильный шкаф Бар 1", type: "refrigerator", tempMin: 2, tempMax: 6 },
  { areaName: "Кондитерский цех", name: "Миксер планетарный", type: "mixer" },
  { areaName: "Мойка", name: "Посудомоечная машина Winterhalter", type: "dishwasher" },
  { areaName: "Склад", name: "Весы напольные 012-В", type: "scale" },
];

async function main() {
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL (or DATABASE_URL_DIRECT) is not set");
  }

  const pool = new pg.Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    const adminUser = await prisma.user.findUnique({
      where: { email: DEMO_ORG_EMAIL },
      include: { organization: true },
    });

    const organization =
      adminUser?.organization ??
      (await prisma.organization.create({
        data: {
          name: DEMO_ORG_NAME,
          type: DEMO_ORG_TYPE,
          subscriptionPlan: "pro",
          subscriptionEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      }));

    for (const user of DEMO_USERS) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          role: user.role,
          positionTitle: user.positionTitle,
          organizationId: organization.id,
          passwordHash,
          isActive: true,
        },
        create: {
          email: user.email,
          name: user.name,
          role: user.role,
          positionTitle: user.positionTitle,
          organizationId: organization.id,
          passwordHash,
          isActive: true,
        },
      });
    }

    for (const area of DEMO_AREAS) {
      await prisma.area.upsert({
        where: { id: `${organization.id}-${area.name}` },
        update: { name: area.name, description: area.description },
        create: {
          id: `${organization.id}-${area.name}`,
          organizationId: organization.id,
          name: area.name,
          description: area.description,
        },
      });
    }

    const areas = await prisma.area.findMany({
      where: { organizationId: organization.id },
      select: { id: true, name: true },
    });

    for (const equipment of DEMO_EQUIPMENT) {
      const area = areas.find((item) => item.name === equipment.areaName);
      if (!area) continue;
      await prisma.equipment.upsert({
        where: { id: `${area.id}-${equipment.name}` },
        update: {
          name: equipment.name,
          type: equipment.type,
          tempMin: equipment.tempMin ?? null,
          tempMax: equipment.tempMax ?? null,
        },
        create: {
          id: `${area.id}-${equipment.name}`,
          areaId: area.id,
          name: equipment.name,
          type: equipment.type,
          tempMin: equipment.tempMin ?? null,
          tempMax: equipment.tempMax ?? null,
        },
      });
    }

    const seededUsers = await prisma.user.count({
      where: { organizationId: organization.id, isActive: true },
    });
    const seededAreas = await prisma.area.count({ where: { organizationId: organization.id } });
    const seededEquipment = await prisma.equipment.count({
      where: { area: { organizationId: organization.id } },
    });

    console.log(
      JSON.stringify(
        {
          organizationId: organization.id,
          organizationName: organization.name,
          activeUsers: seededUsers,
          areas: seededAreas,
          equipment: seededEquipment,
          loginEmail: DEMO_ORG_EMAIL,
          loginPassword: DEFAULT_PASSWORD,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
