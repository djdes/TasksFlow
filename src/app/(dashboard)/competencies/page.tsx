import { GraduationCap } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { CompetencyCell } from "@/components/competencies/competency-cell";

const SKILLS = [
  { key: "safety", label: "Безопасность" },
  { key: "stability", label: "Стабильность" },
  { key: "speed", label: "Скорость" },
  { key: "haccp", label: "ХАССП" },
  { key: "hygiene", label: "Гигиена" },
  { key: "equipment", label: "Оборудование" },
];

const LEVEL_COLORS = [
  "bg-[#ececf4]",
  "bg-[#fff4c7]",
  "bg-[#9fb3ff]",
  "bg-[#7cf5c0]",
];
const LEVEL_LABELS = ["Не обучен", "Базовый", "Средний", "Продвинутый"];

export default async function CompetenciesPage() {
  const session = await requireAuth();
  const orgId = session.user.organizationId;

  const [users, competencies] = await Promise.all([
    db.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    db.staffCompetency.findMany({
      where: { organizationId: orgId },
    }),
  ]);

  const matrix: Record<string, Record<string, { level: number; id: string }>> = {};
  for (const c of competencies) {
    if (!matrix[c.userId]) matrix[c.userId] = {};
    matrix[c.userId][c.skill] = { level: c.level, id: c.id };
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[#5566f6]">
          <GraduationCap className="size-5" />
          <span className="text-[12px] font-medium uppercase tracking-[0.16em]">
            Матрица компетенций
          </span>
        </div>
        <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.02em] text-[#0b1024]">
          Обучение персонала
        </h1>
        <p className="mt-1.5 text-[14px] text-[#6f7282]">
          Уровни: Безопасно → Стабильно → Быстро (3-уровневая модель)
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {LEVEL_LABELS.map((label, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px] text-[#3c4053]">
            <span className={`size-3.5 rounded-md ${LEVEL_COLORS[i]}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-[#ececf4] bg-white shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead>
              <tr className="border-b border-[#ececf4] bg-[#fafbff] text-[12px] uppercase tracking-wider text-[#6f7282]">
                <th className="px-4 py-3 text-left font-medium">Сотрудник</th>
                {SKILLS.map((s) => (
                  <th
                    key={s.key}
                    className="px-3 py-3 text-center font-medium"
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-[#ececf4] last:border-b-0 hover:bg-[#fafbff]"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-[#0b1024]">{user.name}</p>
                      <p className="text-[12px] text-[#9b9fb3]">{user.role}</p>
                    </div>
                  </td>
                  {SKILLS.map((skill) => {
                    const comp = matrix[user.id]?.[skill.key];
                    const level = comp?.level ?? 0;
                    return (
                      <td key={skill.key} className="px-3 py-3 text-center">
                        <CompetencyCell
                          userId={user.id}
                          skill={skill.key}
                          level={level}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
