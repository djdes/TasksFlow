# Spec: TasksFlow journal bind repair

## Problem
Journal tasks can have a WeSetup journalLink in TasksFlow while WeSetup does not have the matching TasksFlowTaskLink row for that TasksFlow task id. When the worker completes such a task, TasksFlow proxies to WeSetup and WeSetup returns 404: "Task not bound to a journal row".

## Scope
Repository: TasksFlow.

Fix completion behavior for all WeSetup journal kinds, not just cleaning, by relying on generic journalLink fields (`kind`, `documentId`, `rowKey`).

## Acceptance Criteria

AC1: TasksFlow completion with structured values must not blindly surface "Task not bound to a journal row" when the local task has a valid WeSetup journalLink. It must attempt a generic rebind/repair path for any `wesetup-*` journal kind.

AC2: The repair path must bind the current TasksFlow task id to the WeSetup journal row, not create an unrelated duplicate task.

AC3: If the task cannot be repaired, TasksFlow must return a clear JSON error that explains the task is not linked in WeSetup and must not mark the local task completed as if the journal write succeeded.

AC4: Non-journal tasks and already-bound journal tasks must keep existing behavior.

AC5: Add focused tests covering generic `wesetup-*` journalLink parsing/repair request behavior.

AC6: Run `npm run check` and relevant tests; create evidence artifacts.
