import { CheckCircle2 } from "lucide-react";

import { JournalStepCard } from "@/components/JournalStepCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  selectedRowKey: string;
  journalTaskMode: "row" | "free";
  journalSearch: string;
  rowSearch: string;
  journalTaskTitle: string;
  journalWorkerUserId: string;
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
  onRowSelect: (row: FlattenedJournalRow) => void;
  onDocumentChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onWorkerChange: (value: string) => void;
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
  selectedRowKey,
  journalTaskMode,
  journalSearch,
  rowSearch,
  journalTaskTitle,
  journalWorkerUserId,
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
  onRowSelect,
  onDocumentChange,
  onTitleChange,
  onWorkerChange,
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
                            <div className="rounded-full bg-background px-2 py-1 text-[11px] text-muted-foreground">
                              {group.rows.length} строк
                            </div>
                          </button>

                          {isOpen ? (
                            <div className="mt-3 space-y-2">
                              {group.rows.map((item) => {
                                const taken = Boolean(item.row.existingTasksflowTaskId);
                                const selected =
                                  selectedDocId === item.document.documentId &&
                                  selectedRowKey === item.row.rowKey;

                                return (
                                  <button
                                    type="button"
                                    key={`${item.document.documentId}/${item.row.rowKey}`}
                                    disabled={taken}
                                    onClick={() => onRowSelect(item)}
                                    className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                                      selected
                                        ? "border-primary bg-primary/10"
                                        : taken
                                        ? "border-border/30 bg-muted/20 opacity-50"
                                        : "border-border/50 hover:bg-muted/30"
                                    }`}
                                  >
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
                  <div className="text-sm font-medium">
                    {activeJournalUi.workerLabel}
                  </div>
                  <Select
                    value={journalWorkerUserId}
                    onValueChange={onWorkerChange}
                  >
                    <SelectTrigger className="things-input w-full">
                      <SelectValue
                        placeholder={activeJournalUi.workerPlaceholder}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableUsers.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">
                          В WeSetup еще не синхронизированы сотрудники для TasksFlow.
                        </div>
                      ) : (
                        assignableUsers.map((worker) => (
                          <SelectItem key={worker.userId} value={worker.userId}>
                            {worker.name}
                            {worker.positionTitle ? ` · ${worker.positionTitle}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    {activeJournalUi.workerHint}
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
