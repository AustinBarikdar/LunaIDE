# Codebase Audit & Optimization Plan

## Overview
An audit was conducted across the `packages` directory (`core`, `mcp-server`, `shared`, `studio-plugin`) to identify bugs, readability issues, and areas of optimization for open-sourcing the RobloxIDE project. The main goal is to make the codebase clean, modular, and easy to understand for contributors.

## Findings by Package

### 1. `packages/shared`
- **Status:** Excellent.
- **Findings:** The shared resources (`constants.ts`, `types.ts`, `protocol.ts`) are well-scoped and maintainable. No immediate changes required.

### 2. `packages/mcp-server`
- **Status:** Good, but has a few bloated tool files.
- **Findings:**
  - The core architecture (`index.ts`, `bridgeClient`, `lockManager`) is very clean.
  - `src/tools/createUI.ts` is 701 lines. It contains multiple hardcoded UI generators (`generateButtonCode`, `generateCardCode`, etc.) inside a single file. This is very difficult to maintain or extend.
  - `src/tools/manageTests.ts` is 264 lines. It mixes tool handling logic with the Luau Runner Harness string generation.
- **Optimization Strategy:** 
  - Refactor `createUI` to extract individual component generators into a `src/tools/createUI/components/` directory format.
  - Refactor `manageTests` to separate the Luau string harness out of the tool logic.

### 3. `packages/core`
- **Status:** Needs refactoring.
- **Findings:** 
  - `src/extension.ts` is 861 lines. It acts as a massive "god file" that registers commands, handles tree view providers, initializes managers (Rojo, Luau, Sessions), and manages project configs. This is an anti-pattern for large VS Code extensions.
- **Optimization Strategy:**
  - Extract commands into a `src/commands` folder.
  - Extract tree view providers (e.g., ExplorerTreeView, SessionTreeView) into a `src/providers` folder.
  - Extract profile and places configuration utilities into a `src/utils/config.ts` or similar module.
  - Keep `extension.ts` strictly for extension activation/deactivation routing.

### 4. `packages/studio-plugin`
- **Status:** Needs refactoring.
- **Findings:**
  - `src/init.server.lua` is 788 lines. It handles the `HttpPoller` setup and then proceeds to define inline handlers for every single command (`run_code`, `insert_model`, `get_instance_properties`, `create_instance`, etc.).
- **Optimization Strategy:**
  - Introduce a modular command handler pattern (e.g., `src/handlers/`).
  - Move the logic for commands like `get_instance_properties`, `create_instance`, etc. into their own dedicated Luau modules, which are imported and registered in `init.server.lua`.

## Bug Audit
No immediate glaring runtime errors or critical bugs were found in the structural audit. However, the architectural design of having "god files" increases the surface area for merge conflicts, makes PR reviews difficult for open source contributors, and limits testability. The optimizations above exist to mitigate these "architectural bugs."

## Next Steps
Please refer to the `implementation_plan.md` artifact for the proposed execution steps.
