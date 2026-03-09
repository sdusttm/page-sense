# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-03-09

### Added
- **Snapshot Diffing**: Shows what changed between snapshots after each action
  - Displays added lines, removed lines, character count diff, element count diff
  - Warning when no changes detected (helps diagnose timing issues)
  - Logs first 20 added / 10 removed lines for easy debugging
- **Enhanced Debugging Logs**:
  - Annotated element count per iteration
  - Snapshot size tracking
  - Keyword search in snapshots ("declaration", "customs")
  - First 50 lines preview of each snapshot
  - LLM request/response details
  - Action execution timing logs

### Changed
- Increased post-click delay: 1500ms → 2000ms for better dropdown rendering
- Increased pre-snapshot delay: 800ms → 1200ms for more stable captures
- Total wait time per action: 3200ms (was 2300ms)

### Fixed
- Better detection of dropdown content capture issues via snapshot diffing
- More time for dynamic UI elements to fully render

### Documentation
- Added `SNAPSHOT-DIFFING-FEATURE.md` - Complete feature documentation
- Added `SNAPSHOT-DIFF-UPDATE.md` - Implementation details
- Added `DROPDOWN-SNAPSHOT-DEBUGGING.md` - Debugging guide

## [0.2.0] - 2026-03-08

### Added
- **Sequential Action Execution**: Major feature implementation for multi-step AI agent tasks
  - Actions now execute sequentially with fresh DOM snapshots after each action
  - Support for `previousActions` context passed to backend API
  - Handles `isComplete` signal from backend to determine task completion
  - Maximum 5 iterations per instruction to prevent infinite loops
  - Comprehensive console logging for debugging sequential execution

### Changed
- **BREAKING**: Backend API contract updated to support sequential execution
  - Request now accepts `previousActions?: string[]` field
  - Response now includes `isComplete: boolean` field
  - Backend should return only ONE action per call instead of all actions upfront
- Action execution loop refactored from batch to sequential pattern
- Improved timing: 1500ms delay after UI-changing clicks, 500ms after typing

### Fixed
- **Critical Bug**: Fixed loop breaking after first action due to incorrect `commands.length === 1` condition
- Actions now properly continue until backend signals `isComplete: true`
- Multi-step tasks (e.g., "open menu, click settings") now work correctly

### Technical Details
- Each iteration captures fresh snapshot showing current page state
- LLM makes decisions based on actual current DOM state, not stale snapshots
- Action history tracked and sent as context for better LLM decision making
- Better error messages when commands fail to execute

### Migration Guide

**For Backend Implementers:**

Your `/agent` endpoint must now:
1. Accept `previousActions?: string[]` in request body
2. Return `isComplete: boolean` in response
3. Return only ONE command per call (frontend will call multiple times)
4. Set `isComplete: true` when task is fully completed

Example:
```typescript
// Request
{
  instruction: "Go to settings",
  snapshot: "...",
  previousActions: ["click on menu-button"]
}

// Response
{
  commands: [{action: "click", agent_id: "settings-link"}],
  isComplete: true
}
```

**For Frontend Users:**

No changes needed! The library handles everything automatically. Just ensure your backend supports the new API contract.

### Documentation
- Added `SEQUENTIAL-ACTION-IMPLEMENTATION.md` - Full implementation details
- Added `SEQUENTIAL-FLOW-DIAGRAM.md` - Visual flow diagram
- Added `BUG-FIX-LOOP-BREAKING.md` - Bug fix documentation
- Added `COMPLETE-IMPLEMENTATION-SUMMARY.md` - Complete overview

## [0.1.3-dev] - Previous

### Features
- User behavior tracking
- Interactive element annotation
- AI LLM agent integration
- Event tracking and visualization
- TrackerProvider and useTracker hook
- AiBehaviorMonitor component
