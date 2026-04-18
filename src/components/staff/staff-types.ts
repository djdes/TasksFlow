export type PositionCategory = "management" | "staff";

export type StaffPosition = {
  id: string;
  categoryKey: PositionCategory;
  name: string;
  sortOrder: number;
};

export type StaffEmployee = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  jobPositionId: string | null;
  positionTitle: string | null;
  role: string;
  isActive: boolean;
  isRoot: boolean;
  isSelf: boolean;
  telegramLinked: boolean;
};

export type StaffWorkOff = {
  userId: string;
  /// ISO YYYY-MM-DD
  date: string;
};

export type StaffPeriodRow = {
  id: string;
  userId: string;
  userName: string;
  jobPositionId: string | null;
  positionLabel: string;
  /// ISO YYYY-MM-DD
  dateFrom: string;
  /// ISO YYYY-MM-DD
  dateTo: string;
};

export type StaffDismissalRow = {
  id: string;
  userId: string;
  userName: string;
  jobPositionId: string | null;
  positionLabel: string;
  /// ISO YYYY-MM-DD
  date: string;
};

export type StaffPageProps = {
  organization: { id: string; name: string };
  telegramBotUrl: string | null;
  positions: StaffPosition[];
  employees: StaffEmployee[];
  workOffDays: StaffWorkOff[];
  vacations: StaffPeriodRow[];
  sickLeaves: StaffPeriodRow[];
  dismissals: StaffDismissalRow[];
};
