import { ChefHat, Factory, ShieldCheck, ShoppingBag, SprayCan, Truck, Wrench } from "lucide-react";

/**
 * Бегущая строка отраслей. Вторая копия списка нужна для бесшовного
 * цикла и скрыта от экранного диктора; без движения строка просто
 * переносится и показывается один раз.
 */
const INDUSTRIES = [
  { name: "Клининг", icon: SprayCan },
  { name: "Общепит", icon: ChefHat },
  { name: "Розница", icon: ShoppingBag },
  { name: "Сервис и ремонт", icon: Wrench },
  { name: "Логистика", icon: Truck },
  { name: "Охрана", icon: ShieldCheck },
  { name: "Производство", icon: Factory },
];

export function IndustryMarquee() {
  return (
    <div className="marquee-wrap">
      <span className="marquee-label">Работает в</span>
      <div className="marquee">
        <ul className="marquee-track">
          {[0, 1].map((copy) =>
            INDUSTRIES.map(({ name, icon: Icon }) => (
              <li key={`${copy}-${name}`} className="marquee-item" aria-hidden={copy === 1 || undefined}>
                <Icon className="w-4 h-4" /> {name}
              </li>
            )),
          )}
        </ul>
      </div>
    </div>
  );
}
