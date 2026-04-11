# Task Spec: subagent-dispatcher-template-2026-04-11

## Original task statement
User asked to prepare a dispatcher template in the repository for running the equivalent of many subagent tasks in waves, after discussing the environment limit of 6 parallel subagents.

## Task goal
Add a reusable, repo-local dispatcher template that lets the user stage up to 20 task IDs through a 6-slot rotating subagent pool, with explicit wave planning, slot ownership, result capture, and operational instructions.

## Relevant repo context
- Repo-wide workflow requires task artifacts under `.agent/tasks/<TASK_ID>/`.
- The current chat already established an environment limit of 6 parallel subagents.
- The user asked for a practical dispatcher template, not an app feature or UI change.

## Assumptions
- A documentation/template artifact is sufficient; no runtime automation script is required unless explicitly requested later.
- The template should be immediately usable from the repository by filling in tasks and slot assignments.
- The template should stay tool-agnostic enough to work with the existing `spawn_agent` / `send_input` workflow already used in this session.

## Constraints
- Freeze this spec before implementation.
- Keep the change small and isolated.
- Do not modify application behavior.

## Non-goals
- Do not build a full orchestration framework.
- Do not add background process management or external services.
- Do not change the subagent platform limit itself.

## Acceptance criteria

### AC1. Repo-local dispatcher template exists
Pass conditions:
- A new repository file exists with a clear dispatcher template for batched subagent work.
- The template is readable without requiring chat history.

### AC2. The template supports 20 tasks over a 6-slot pool
Pass conditions:
- The template explicitly shows wave planning for 20 tasks using 6 active slots at a time.
- The template includes stable task IDs and slot IDs.

### AC3. The template captures execution state and outputs
Pass conditions:
- The template includes fields for model, assigned slot, status, result, risks, and next step.
- The template includes a standard response format for subagents.

### AC4. The template includes operational instructions
Pass conditions:
- The template explains how to use the file in practice.
- The template explains how to rotate waves and reuse slots.

### AC5. Fresh verification artifacts are recorded
Pass conditions:
- `evidence.md` and `evidence.json` are created under the task artifact directory.
- Verification explicitly checks each acceptance criterion against the current repo state.
