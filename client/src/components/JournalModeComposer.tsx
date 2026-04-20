import { CheckCircle2, Users } from "lucide-react";

import { JournalStepCard } from "@/components/JournalStepCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CatalogAssignableUser,
  CatalogJournal,
  FlattenedJournalRow,
  JournalRowGroup,
  ResolvedCatalogJournalUi,
  WesetupCatalog,
} from "@shared/wesetup-journal-mode";

type StepKey = "journal" | "details" | "review";

type JournalModeComposerProps = {
  catalogLoading: boolean;
  catalogError: string | null;
  catalog: WesetupCatalog | null;
  visibleJournals: CatalogJournal[];
  activeJournal: string;
  activeJournalData: CatalogJournal | null;
  activeJournalUi: ResolvedCatalogJournalUi;
  activeJournalSupportsRowMode: boolean;
  groupedFilteredRows: JournalRowGroup[];
  selectedRow: FlattenedJournalRow | null;
  selectedDocumentTitle: string | null;
  selectedDocId: string;
  /**
   * Multi-row selection — admin can tick one OR more rows within a
   * single document. Submit sends `rowKeys[]` to bind-row which creates
   * one TasksFlow task per entry.
   */
  selectedRowKeys: string[];
  journalTaskMode: "row" | "free";
  journalSearch: string;
  rowSearch: string;
  journalTaskTitle: string;
  /**
   * Multi-worker selection. Empty array = no one picked. The submit
   * batch in CreateTask sends all of them as workerUserIds[] to
   * /api/wesetup/bind-row, which creates one TasksFlow task per worker.
   */
  journalWorkerUserIds: string[];
  assignableUsers: CatalogAssignableUser[];
  selectedAssignableUserName: string | null;
  openJournalStep: StepKey;
  openDocumentId: string;
  isJournalDetailsReady: boolean;
  journalSelectionSummary: string | null;
  journalDetailsSummary: string | null;
  journalReviewSummary: string | null;
  journalSubmitting: boolean;
  onStepChange: (step: StepKey) => void;
  onJournalSearchChange: (value: string) => void;
  onJournalSelect: (journal: CatalogJournal, rowsTotal: number) => void;
  onTaskModeChange: (mode: "row" | "free") => void;
  onRowSearchChange: (value: string) => void;
  onDocumentToggle: (documentId: string, canCollapse: boolean) => void;
  onRowToggle: (row: FlattenedJournalRow) => void;
  onRowSelectAllInDocument: (documentId: string, rowKeys: string[]) => void;
  onRowClear: () => void;
  onDocumentChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onWorkersChange: (values: string[]) => void;
  onSubmit: () => void;
};

export function JournalModeComposer({
  catalogLoading,
  catalogError,
  catalog,
  visibleJournals,
  activeJournal,
  activeJournalData,
  activeJournalUi,
  activeJournalSupportsRowMode,
  groupedFilteredRows,
  selectedRow,
  selectedDocumentTitle,
  selectedDocId,
  selectedRowKeys,
  journalTaskMode,
  journalSearch,
  rowSearch,
  journalTaskTitle,
  journalWorkerUserIds,
  assignableUsers,
  selectedAssignableUserName,
  openJournalStep,
  openDocumentId,
  isJournalDetailsReady,
  journalSelectionSummary,
  journalDetailsSummary,
  journalReviewSummary,
  journalSubmitting,
  onStepChange,
  onJournalSearchChange,
  onJournalSelect,
  onTaskModeChange,
  onRowSearchChange,
  onDocumentToggle,
  onRowToggle,
  onRowSelectAllInDocument,
  onRowClear,
  onDocumentChange,
  onTitleChange,
  onWorkersChange,
  onSubmit,
}: JournalModeComposerProps) {
  if (catalogLoading) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        Загружаем каталог из WeSetup…
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {catalogError}
      </div>
    );
  }

  if (catalog && catalog.journals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        В WeSetup пока нет журналов с поддержкой TasksFlow.
      </div>
    );
  }

  if (!catalog) {
    return null;
  }

  return (
    <div className="space-y-4">
      <JournalStepCard
        step="1"
        title="Выберите журнал"
        summary={journalSelectionSummary}
        description="Найдите нужный журнал WeSetup и откройте его контекст."
        open={openJournalStep === "journal"}
        done={Boolean(activeJournalData)}
        onToggle={() =>
          onStepChange(openJournalStep === "journal" ? "details" : "journal")
        }
      >
        <div className="space-y-4">
          <Input
            type="search"
            value={journalSearch}
            onChange={(e) => onJournalSearchChange(e.target.value)}
            placeholder="Поиск по журналам: уборка, здоровье, медкнижки…"
            className="things-input"
            data-testid="journal-search"
          />

          {visibleJournals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              По этому запросу журналы не найдены.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {visibleJournals.map((journal) => {
                const active = journal.templateCode === activeJournal;
                const rowsTotal = journal.documents.reduce(
                  (sum, document) => sum + document.rows.length,
                  0
                );

                return (
                  <button
                    key={journal.templateCode}
                    type="button"
                    onClick={() => onJournalSelect(journal, rowsTotal)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      active
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border/50 hover:bg-muted/30"
                    }`}
                    data-testid={`journal-tab-${journal.templateCode}`}
                  >
                    <div className="font-medium">{journal.label}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-background px-2 py-1">
                        {journal.documents.length} док.
                      </span>
                      <span className="rounded-full bg-background px-2 py-1">
                        {rowsTotal > 0 ? `${rowsTotal} строк` : "без строк"}
                      </span>
                    </div>
                    {journal.description ? (
                      <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {journal.description}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          {activeJournalData ? (
            <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">{activeJournalData.label}</div>
                <div className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                  {activeJournalData.documents.length} документов
                </div>
                <div className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                  {activeJournalSupportsRowMode
                    ? `Есть ${activeJournalUi.subjectPlural}`
                    : "Свободные задачи"}
                </div>
              </div>
              {activeJournalData.description ? (
                <div className="mt-2 text-sm text-muted-foreground">
                  {activeJournalData.description}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </JournalStepCard>

      <JournalStepCard
        step="2"
        title="Соберите задачу"
        summary={journalDetailsSummary}
        description="Выберите способ создания и заполните только нужные поля."
        open={openJournalStep === "details"}
        done={isJournalDetailsReady}
        onToggle={() =>
          onStepChange(openJournalStep === "details" ? "journal" : "details")
        }
      >
        {!activeJournalData ? (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Сначала выберите журнал сверху.
          </div>
        ) : (
          <div className="space-y-4">
            {activeJournalSupportsRowMode ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onTaskModeChange("row")}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    journalTaskMode === "row"
                      ? "border-primary bg-primary/10"
                      : "border-border/50 hover:bg-muted/30"
                  }`}
                >
                  <div className="font-medium">{activeJournalUi.modeRowLabel}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {activeJournalUi.modeRowHint}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onTaskModeChange("free")}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    journalTaskMode === "free"
                      ? "border-primary bg-primary/10"
                      : "border-border/50 hover:bg-muted/30"
                  }`}
                >
                  <div className="font-medium">{activeJournalUi.modeFreeLabel}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {activeJournalUi.modeFreeHint}
                  </div>
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
                Для этого журнала доступен только сценарий свободной задачи.
              </div>
            )}

            {journalTaskMode === "row" && activeJournalSupportsRowMode ? (
              <div className="space-y-4">
                <Input
                  type="search"
                  value={rowSearch}
                  onChange={(e) => onRowSearchChange(e.target.value)}
                  placeholder={activeJournalUi.rowSearchPlaceholder}
                  className="things-input"
                  data-testid="journal-row-search"
                />

                {groupedFilteredRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                    {activeJournalUi.rowEmptyState}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupedFilteredRows.map((group) => {
                      const isOpen =
                        rowSearch.trim().length > 0 ||
                        openDocumentId === group.document.documentId;
                      const isActiveDocument =
                        selectedDocId === group.document.documentId;
                      const selectedCountInDoc = isActiveDocument
                        ? group.rows.filter((item) =>
                            selectedRowKeys.includes(item.row.rowKey)
                          ).length
                        : 0;
                      const availableRowKeys = group.rows
                        .filter((item) => !item.row.existingTasksflowTaskId)
                        .map((item) => item.row.rowKey);
                      const allAvailableSelected =
                        isActiveDocument &&
                        availableRowKeys.length > 0 &&
                        availableRowKeys.every((key) =>
                          selectedRowKeys.includes(key)
                        );

                      return (
                        <div
                          key={group.document.documentId}
                          className="rounded-2xl border border-border/50 bg-muted/10 p-3"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onDocumentToggle(
                                group.document.documentId,
                                isOpen && rowSearch.trim().length === 0
                              )
                            }
                            className="flex w-full items-center justify-between gap-3 text-left"
                          >
                            <div className="min-w-0">
                              <div className="font-medium">
                                {group.document.documentTitle}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {group.document.period.from}—{group.document.period.to}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {selectedCountInDoc > 0 ? (
                                <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                                  {selectedCountInDoc} выбрано
                                </span>
                              ) : null}
                              <span className="rounded-full bg-background px-2 py-1 text-[11px] text-muted-foreground">
                                {group.rows.length} строк
                              </span>
                            </div>
                          </button>

                          {isOpen ? (
                            <div className="mt-3 space-y-2">
                              {availableRowKeys.length > 1 ? (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (allAvailableSelected) {
                                        onRowClear();
                                      } else {
                                        onRowSelectAllInDocument(
                                          group.document.documentId,
                                          availableRowKeys
                                        );
                                      }
                                    }}
                                    className="rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/30"
                                    data-testid="select-all-rows"
                                  >
                                    {allAvailableSelected
                                      ? "Снять выделение"
                                      : `Выбрать все (${availableRowKeys.length})`}
                                  </button>
                                </div>
                              ) : null}

                              {group.rows.map((item) => {
                                const taken = Boolean(item.row.existingTasksflowTaskId);
                                const selected =
                                  selectedDocId === item.document.documentId &&
                                  selectedRowKeys.includes(item.row.rowKey);

                                return (
                                  <button
                                    type="button"
                                    key={`${item.document.documentId}/${item.row.rowKey}`}
                                    disabled={taken}
                                    onClick={() => onRowToggle(item)}
                                    className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                                      selected
                                        ? "border-primary bg-primary/10"
                                        : taken
                                        ? "border-border/30 bg-muted/20 opacity-50"
                                        : "border-border/50 hover:bg-muted/30"
                                    }`}
                                  >
                                    <Checkbox
                                      checked={selected}
                                      disabled={taken}
                                      tabIndex={-1}
                                      className="mt-0.5 shrink-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-medium">
                                        {item.row.label}
                                      </div>
                                      {item.row.sublabel ? (
                                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                          {item.row.sublabel}
                                        </div>
                                      ) : null}
                                    </div>

                                    {taken ? (
                                      <div className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                        #{item.row.existingTasksflowTaskId}
                                      </div>
                                    ) : selected ? (
                                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {activeJournalUi.titleLabel}
                  </div>
                  <Input
                    value={journalTaskTitle}
                    onChange={(e) => onTitleChange(e.target.value)}
                    placeholder={activeJournalUi.titlePlaceholder}
                    className="things-input"
                  />
                  <div className="text-xs text-muted-foreground">
                    {activeJournalUi.titleHint}
                  </div>
                </div>
              </div>
            ) : activeJournalData.documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                В этом журнале пока нет активных документов.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {activeJournalUi.documentLabel}
                  </div>
                  <Select value={selectedDocId} onValueChange={onDocumentChange}>
                    <SelectTrigger className="things-input w-full">
                      <SelectValue
                        placeholder={activeJournalUi.documentPlaceholder}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {activeJournalData.documents.map((document) => (
                        <SelectItem
                          key={document.documentId}
                          value={document.documentId}
                        >
                          {document.documentTitle} · {document.period.from}—{document.period.to}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <div className="text-sm font-medium">
                    {activeJournalUi.titleLabel}
                  </div>
                  <Input
                    value={journalTaskTitle}
                    onChange={(e) => onTitleChange(e.target.value)}
                    placeholder={activeJournalUi.titlePlaceholder}
                    className="things-input"
                  />
                  <div className="text-xs text-muted-foreground">
                    {activeJournalUi.titleHint}
                  </div>
                </div>

                <div className="space-y-2 lg:col-span-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {activeJournalUi.workerLabel} ·{" "}
                      <span className="text-primary">
                        {journalWorkerUserIds.length}
                      </span>{" "}
                      из {assignableUsers.length}
                    </div>
                    {assignableUsers.length > 0 ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onWorkersChange(
                              assignableUsers.map((w) => w.userId)
                            )
                          }
                          className="text-xs font-medium text-primary hover:underline"
                          data-testid="select-all-workers"
                        >
                          Выбрать всех
                        </button>
                        <span className="text-xs text-muted-foreground">·</span>
                        <button
                          type="button"
                          onClick={() => onWorkersChange([])}
                          className="text-xs font-medium text-muted-foreground hover:underline"
                          data-testid="deselect-all-workers"
                        >
                          Снять
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {assignableUsers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                      <Users className="mx-auto mb-2 size-5 opacity-40" />
                      В WeSetup ещё не синхронизированы сотрудники для TasksFlow.
                    </div>
                  ) : (
                    <div className="max-h-[260px] space-y-1 overflow-y-auto rounded-xl border border-border/50 p-2">
                      {assignableUsers.map((worker) => {
                        const checked = journalWorkerUserIds.includes(
                          worker.userId
                        );
                        return (
                          <label
                            key={worker.userId}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg p-2 text-sm transition-colors ${
                              checked
                                ? "bg-primary/10"
                                : "hover:bg-muted/30"
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                if (v) {
                                  onWorkersChange([
                                    ...journalWorkerUserIds,
                                    worker.userId,
                                  ]);
                                } else {
                                  onWorkersChange(
                                    journalWorkerUserIds.filter(
                                      (id) => id !== worker.userId
                                    )
                                  );
                                }
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">
                                {worker.name}
                              </div>
                              {worker.positionTitle ? (
                                <div className="truncate text-xs text-muted-foreground">
                                  {worker.positionTitle}
                                </div>
                              ) : null}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {activeJournalUi.workerHint} По задаче на каждого
                    выбранного — итог в TasksFlow получит каждый из них.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </JournalStepCard>

      <JournalStepCard
        step="3"
        title={activeJournalUi.reviewTitle}
        summary={journalReviewSummary}
        description="Проверьте, что именно уйдет в TasksFlow и вернется в журнал."
        open={openJournalStep === "review"}
        done={isJournalDetailsReady}
        onToggle={() =>
          onStepChange(openJournalStep === "review" ? "details" : "review")
        }
      >
        {!activeJournalData ? (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Выберите журнал и заполните шаг выше.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-border/50 bg-muted/10 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Журнал
                </div>
                <div className="mt-1 font-medium">{activeJournalData.label}</div>
              </div>

              <div className="rounded-2xl border border-border/50 bg-muted/10 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Режим
                </div>
                <div className="mt-1 font-medium">
                  {journalTaskMode === "row" && activeJournalSupportsRowMode
                    ? activeJournalUi.modeRowLabel
                    : activeJournalUi.modeFreeLabel}
                </div>
              </div>

              <div className="rounded-2xl border border-border/50 bg-muted/10 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {journalTaskMode === "row" && selectedRow
                    ? activeJournalUi.subjectLabel
                    : activeJournalUi.documentLabel}
                </div>
                <div className="mt-1 font-medium">
                  {journalTaskMode === "row" && selectedRow
                    ? selectedRow.row.label
                    : selectedDocumentTitle ?? "Не выбрано"}
                </div>
              </div>

              <div className="rounded-2xl border border-border/50 bg-muted/10 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {activeJournalUi.titleLabel}
                </div>
                <div className="mt-1 font-medium">
                  {journalTaskTitle.trim() || selectedRow?.row.label || "Не заполнено"}
                </div>
              </div>
            </div>

            {journalTaskMode === "row" && selectedRow ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
                <div className="font-medium">Что произойдет</div>
                <div className="mt-1 text-muted-foreground">
                  «{journalTaskTitle.trim() || selectedRow.row.label}» будет создана по
                  строке «{selectedRow.row.label}» в документе «
                  {selectedRow.document.documentTitle}». {activeJournalUi.reviewRowHint}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
                <div className="font-medium">Что произойдет</div>
                <div className="mt-1 text-muted-foreground">
                  «{journalTaskTitle.trim() || "Задача"}» будет создана в документе «
                  {selectedDocumentTitle ?? "Документ"}»
                  {selectedAssignableUserName
                    ? ` для ${selectedAssignableUserName}`
                    : ""}. {activeJournalUi.reviewFreeHint}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                size="lg"
                disabled={journalSubmitting || !isJournalDetailsReady}
                onClick={onSubmit}
                className="things-button"
              >
                {journalSubmitting ? "Создаю…" : activeJournalUi.submitLabel}
              </Button>
            </div>
          </div>
        )}
      </JournalStepCard>
    </div>
  );
}
