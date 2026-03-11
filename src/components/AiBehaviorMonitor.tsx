"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTracker } from '../tracker/useTracker';
import { convertHtmlToMarkdown } from '../utils/dom-to-semantic-markdown';
import { annotateInteractiveElements, clearAnnotations, clearVisualAnnotations, temporarilyShowHiddenElements, temporarilyExpandDropdowns, syncStateToAttributes } from '../utils/annotator';
import { removeLibraryElements, restoreLibraryElements } from '../utils/cleanCapture';
import { diffChars } from 'diff';
import { VERSION, BUILD_TIME } from '../version';

// Cross-page execution state interface
interface CrossPageExecutionState {
    instruction: string;
    previousActions: string[];
    actionHistory?: { snapshot: string; action: any }[];
    iterationCount: number;
    threadId: string;
    timestamp: number;
    url: string;
    previousSnapshot?: string;
}

// Cross-page execution helpers
const CROSS_PAGE_STORAGE_KEY = 'page-sense-cross-page-execution';
const CROSS_PAGE_TIMEOUT_MS = 60000; // 60 seconds max to resume (increased for slow page loads)

const saveCrossPageState = (state: CrossPageExecutionState) => {
    try {
        localStorage.setItem(CROSS_PAGE_STORAGE_KEY, JSON.stringify(state));
        console.log('[PageSense-Debug] 💾 SAVED state to localStorage:', {
            instruction: state.instruction,
            actions: state.previousActions.length,
            url: state.url
        });
    } catch (err) {
        console.error('[PageSense-Debug] ❌ Failed to save state:', err);
    }
};

const loadCrossPageState = (): CrossPageExecutionState | null => {
    try {
        const stored = localStorage.getItem(CROSS_PAGE_STORAGE_KEY);
        if (!stored) {
            console.log('[PageSense-Debug] 📭 localStorage check: No state found.');
            return null;
        }

        const state = JSON.parse(stored) as CrossPageExecutionState;

        // Check if state is recent (within timeout)
        if (Date.now() - state.timestamp > CROSS_PAGE_TIMEOUT_MS) {
            console.log('[PageSense-Debug] ⏰ State expired (older than 60s), clearing it.');
            clearCrossPageState();
            return null;
        }

        console.log('[PageSense-Debug] 📖 LOADED state from localStorage:', {
            instruction: state.instruction,
            actions: state.previousActions.length,
            url: state.url
        });
        return state;
    } catch (err) {
        console.error('[PageSense-Debug] ❌ Failed to load state:', err);
        return null;
    }
};

const clearCrossPageState = () => {
    try {
        localStorage.removeItem(CROSS_PAGE_STORAGE_KEY);
        console.log('[PageSense-Debug] 🗑️ CLEARED state from localStorage');
    } catch (err) {
        console.error('[PageSense-Debug] ❌ Failed to clear state:', err);
    }
};

// We removed isNavigationLink because it is unreliable for SPA routers like Next.js.
// Instead, we will save a "pending" cross-page state BEFORE every click action.
// If the page unloads or the URL changes, that state is preserved and resumed.
// If the click completes and the page *doesn't* navigate, we just clear the pending state.

// Helper to compare two snapshots and show what changed
function compareSnapshots(oldSnapshot: string, newSnapshot: string) {
    const oldLines = oldSnapshot.split('\n');
    const newLines = newSnapshot.split('\n');

    // Create sets for faster lookup
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    // Find added and removed lines
    const addedLines = newLines.filter(line => !oldSet.has(line));
    const removedLines = oldLines.filter(line => !newSet.has(line));

    // Calculate stats
    const addedChars = newSnapshot.length - oldSnapshot.length;
    const addedElements = (newSnapshot.match(/\[ID: \d+\]/g) || []).length - (oldSnapshot.match(/\[ID: \d+\]/g) || []).length;

    return {
        addedLines,
        removedLines,
        addedChars,
        addedElements,
        summary: `${addedChars > 0 ? '+' : ''}${addedChars} chars, ${addedElements > 0 ? '+' : ''}${addedElements} elements`
    };
}

const AgentInstructionForm = React.memo(({
    executeAgentCommand,
    apiUrl,
    apiKey,
    visitorId,
    threadId,
    onAddMessage,
    isExpanded
}: {
    executeAgentCommand: (action: 'click' | 'type' | 'select', agentId: string, value?: string) => Promise<void>;
    apiUrl: string;
    apiKey?: string;
    visitorId?: string;
    threadId: string;
    onAddMessage: (message: { role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }) => void;
    isExpanded?: boolean;
}) => {
    const [instruction, setInstruction] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [executionError, setExecutionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [actionHistory, setActionHistory] = useState<{ snapshot: string; action: any }[]>([]);
    const [liveActions, setLiveActions] = useState<string[]>([]);
    const [feedback, setFeedback] = useState('');
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
    const [feedbackSuccess, setFeedbackSuccess] = useState(false);
    const [lastInstruction, setLastInstruction] = useState('');

    // Custom Confirmation Dialog State
    const [confirmationDialog, setConfirmationDialog] = useState<{
        message: string;
        resolve: (value: boolean) => void;
    } | null>(null);

    // Auto-scroll ref for the live actions container
    const liveActionsEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll effect when live actions update
    useEffect(() => {
        if (liveActionsEndRef.current) {
            // Defer execution until the browser natively flushes the React DOM render layout
            setTimeout(() => {
                liveActionsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 50);
        }
    }, [liveActions, confirmationDialog]);

    // Listen for cross-page execution resume event from main component
    useEffect(() => {
        const handleResumeEvent = async (event: Event) => {
            const customEvent = event as CustomEvent;
            console.log('[PageSense-Debug] 🎯 AgentInstructionForm RECEIVED "page-sense-resume-execution" payload:', customEvent.detail);

            const { instruction, previousActions, iterationCount, actionHistory } = customEvent.detail;

            console.log('[PageSense-Debug] 🚀 Automatically starting execution loop with instruction:', instruction);

            // Resume execution
            await handleExecuteInstruction(instruction, {
                previousActions,
                actionHistory,
                iterationCount,
                previousSnapshot: customEvent.detail.previousSnapshot
            });
        };

        console.log('[PageSense-Debug] AgentInstructionForm mounted. Listening for "page-sense-resume-execution" events.');
        window.addEventListener('page-sense-resume-execution', handleResumeEvent);

        return () => {
            console.log('[PageSense-Debug] AgentInstructionForm unmounting. Removing "page-sense-resume-execution" listener.');
            window.removeEventListener('page-sense-resume-execution', handleResumeEvent);
        };
    }, [executeAgentCommand, apiUrl, apiKey, threadId]); // Include dependencies for handleExecuteInstruction

    const handleExecuteInstruction = async (
        instructionOverride?: string,
        resumeState?: {
            previousActions: string[];
            actionHistory?: { snapshot: string; action: any }[];
            iterationCount: number;
            previousSnapshot?: string;
        }
    ) => {
        const currentInstruction = instructionOverride || instruction;
        if (!currentInstruction.trim()) return;

        setLastInstruction(currentInstruction);
        setIsExecuting(true);
        setExecutionError(null);
        setSuccessMessage(null);
        setFeedback('');
        setFeedbackSuccess(false);
        setActionHistory([]);
        setLiveActions(resumeState?.previousActions ? [...resumeState.previousActions] : []);

        // Add user message to conversation (only if not resuming)
        if (!resumeState) {
            onAddMessage({
                role: 'user',
                content: currentInstruction,
                timestamp: new Date().toISOString()
            });
        }

        let currentActionHistory: { snapshot: string; action: any }[] = resumeState?.actionHistory ? [...resumeState.actionHistory] : [];

        try {
            // Helper function to capture a clean snapshot
            const captureSnapshot = async () => {
                // Wait for any pending React renders and dynamic content to load
                // Increased to 1200ms to ensure dropdowns are fully rendered
                await new Promise(resolve => setTimeout(resolve, 1200));

                // 1. Clear any old annotations from previous iteration
                //    This ensures new elements (like dropdown items) get fresh IDs
                clearAnnotations(document.body);
                console.log(`[Snapshot] Cleared old annotations`);

                // 2. Remove library UI FIRST (before annotation)
                const removedElements = removeLibraryElements();

                // 3. Temporarily expand dropdowns to render their content into DOM
                //    This is critical for dropdowns that don't render options until opened
                const collapseDropdowns = temporarilyExpandDropdowns();

                // 4. Wait for dropdown content to render (some frameworks render async)
                await new Promise(resolve => setTimeout(resolve, 300));

                // 5. Temporarily show hidden elements (unchecked checkboxes within expanded dropdowns)
                //    This ensures ALL interactive elements are visible for annotation and snapshot
                const restoreHiddenElements = temporarilyShowHiddenElements();

                // 6. Debug: Check what checkboxes are visible
                const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
                console.log(`[DEBUG] Found ${allCheckboxes.length} checkboxes in DOM`);
                allCheckboxes.forEach((cb, idx) => {
                    const label = cb.closest('label')?.textContent?.trim() || 'no label';
                    const checked = (cb as HTMLInputElement).checked;
                    const computed = window.getComputedStyle(cb);
                    const visible = computed.display !== 'none' && computed.visibility !== 'hidden';
                    console.log(`  [${idx}] ${checked ? '✓' : '☐'} ${label} - visible: ${visible}, display: ${computed.display}`);
                });

                // 7. THEN annotate ALL interactive elements with fresh IDs
                //    (library UI is gone, dropdowns expanded, hidden elements visible)
                const annotatedCount = annotateInteractiveElements(document.body);
                console.log(`[Snapshot] Annotated ${annotatedCount} interactive elements (fresh IDs)`);

                // 8. Sync DOM property state (React programmatic mutators) to HTML attributes 
                //    so that outerHTML successfully captures the state
                syncStateToAttributes();

                // 9. Capture CLEAN snapshot (without library UI, with ALL elements visible)
                const snapshot = convertHtmlToMarkdown(document.body.outerHTML);

                // 9. Debug: Check what's in the snapshot
                console.log(`[Snapshot] Size: ${snapshot.length} chars`);
                console.log(`[Snapshot] Contains "Preparing"?`, snapshot.includes('Preparing'));
                console.log(`[Snapshot] Contains "Filed"?`, snapshot.includes('Filed'));
                console.log(`[Snapshot] Contains "Under Hold"?`, snapshot.includes('Under Hold'));
                console.log(`[Snapshot] Contains "Released"?`, snapshot.includes('Released'));
                console.log(`[Snapshot] Contains "Select all"?`, snapshot.includes('Select all'));

                // Show portions mentioning checkboxes
                const lines = snapshot.split('\n');
                const checkboxLines = lines.filter(line =>
                    line.includes('checkbox') ||
                    line.includes('Preparing') ||
                    line.includes('Filed') ||
                    line.includes('Under Hold') ||
                    line.includes('Released')
                );
                console.log(`[Snapshot] Checkbox-related lines (${checkboxLines.length}):`, checkboxLines.join('\n'));

                // DEBUG: Show raw markdown around checkbox lines to see if [ID: X] is there
                console.log('[DEBUG] Raw snapshot first 2000 chars:', snapshot.substring(0, 2000));

                // Check specifically for ID markers
                const hasIdMarkers = /\[ID:\s*\d+/.test(snapshot);
                console.log('[DEBUG] Snapshot contains [ID: X] markers?', hasIdMarkers);
                if (hasIdMarkers) {
                    const idLines = lines.filter(line => /\[ID:\s*\d+/.test(line));
                    console.log('[DEBUG] Lines with ID markers:', idLines.join('\n'));
                }

                // 10. Restore hidden elements and collapse dropdowns
                restoreHiddenElements();
                collapseDropdowns();

                // 7. Restore library UI immediately
                restoreLibraryElements(removedElements);

                // 6. Clean up VISUAL annotation text nodes (but keep data-agent-id for execution)
                clearVisualAnnotations(document.body);

                return snapshot;
            };

            // Helper function to call LLM API
            const callLLMAgent = async (snapshot: string, previousActions: string[] = []) => {
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                console.log(`[LLM Call] Sending snapshot (${snapshot.length} chars) with previousActions:`, previousActions);

                const res = await fetch(`${apiUrl.replace(/\/$/, '')}/agent`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        instruction: currentInstruction,
                        snapshot,
                        threadId,
                        visitorId,
                        url: window.location.href,
                        previousActions // Include context of what actions were already taken
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to execute instruction');

                const backendVersion = res.headers.get('x-agent-backend-version') || 'unknown';

                console.log(`[LLM Response] (Backend API v${backendVersion})`, {
                    commands: data.commands?.length || 0,
                    isComplete: data.isComplete,
                    firstCommand: data.commands?.[0]
                });

                return data;
            };

            // Sequential execution: take snapshot -> get action -> execute -> repeat
            let successCount = resumeState ? resumeState.previousActions.length : 0;
            const maxIterations = 5; // Prevent infinite loops
            const previousActions: string[] = resumeState ? [...resumeState.previousActions] : [];
            let previousSnapshot: string | null = resumeState?.previousSnapshot || null;
            let lastCommand: any = null;
            let fallbackAttempted = false;
            const startIteration = resumeState ? resumeState.iterationCount : 0;

            for (let iteration = startIteration; iteration < maxIterations; iteration++) {
                console.log(`[Iteration ${iteration + 1}/${maxIterations}] Starting...`);

                // 1. Capture fresh snapshot (shows current state after any previous actions)
                let snapshot = await captureSnapshot();
                console.log(`[Iteration ${iteration + 1}] Snapshot captured`);

                // Show diff from previous snapshot
                if (previousSnapshot) {
                    const diff = compareSnapshots(previousSnapshot, snapshot);
                    console.log(`[Iteration ${iteration + 1}] 📊 SNAPSHOT DIFF: ${diff.summary}`);

                    if (diff.addedLines.length > 0) {
                        console.log(`[Iteration ${iteration + 1}] ➕ ADDED (${diff.addedLines.length} lines):`);
                        // Show first 20 added lines
                        diff.addedLines.slice(0, 20).forEach((line, idx) => {
                            console.log(`   ${idx + 1}. ${line}`);
                        });
                        if (diff.addedLines.length > 20) {
                            console.log(`   ... and ${diff.addedLines.length - 20} more lines`);
                        }
                    }

                    if (diff.removedLines.length > 0) {
                        console.log(`[Iteration ${iteration + 1}] ➖ REMOVED (${diff.removedLines.length} lines):`);
                        // Show first 10 removed lines
                        diff.removedLines.slice(0, 10).forEach((line, idx) => {
                            console.log(`   ${idx + 1}. ${line}`);
                        });
                        if (diff.removedLines.length > 10) {
                            console.log(`   ... and ${diff.removedLines.length - 10} more lines`);
                        }
                    }

                    if (diff.addedLines.length === 0 && diff.removedLines.length === 0) {
                        console.warn(`[Iteration ${iteration + 1}] ⚠️ WARNING: No changes detected in snapshot after action!`);

                        let fallbackSuccessful = false;

                        // ✅ Exclude `ask_confirmation` from zero-diff errors because it's a native alert, not a DOM mutation.
                        if (lastCommand?.action === 'ask_confirmation') {
                            console.log(`[PageSense] 🧠 Smart Engine: Ignoring zero-diff for ask_confirmation as it intentionally doesn't mutate the DOM.`);
                            fallbackSuccessful = true; // Pretend it succeeded to skip the error logic
                            fallbackAttempted = true;
                        }

                        // 🧠 ATTEMPT SMART FALLBACK
                        if (lastCommand && !fallbackAttempted) {
                            console.log(`[PageSense] 🧠 Smart Engine: Attempting automatic fallback for failed action: ${lastCommand.action}`);

                            const element = document.querySelector(`[data-agent-id="${lastCommand.agent_id}"]`);

                            // Smart Fallback 1: LLM hallucinated 'click' or 'type' on a <select>
                            if (element && (lastCommand.action === 'click' || lastCommand.action === 'type') && element.tagName.toLowerCase() === 'select') {
                                const selectEl = element as HTMLSelectElement;
                                const instructionLower = currentInstruction.toLowerCase();
                                const instructionWords = instructionLower.split(' ').filter(w => w.length > 2); // filter tiny words

                                // Try to infer which option the user meant
                                const matchingOption = Array.from(selectEl.options).find(opt => {
                                    const optTextLower = opt.text.toLowerCase();
                                    const optValLower = opt.value.toLowerCase();

                                    // 1. Exact substring match of option text/value inside the instruction
                                    if (instructionLower.includes(optTextLower) || instructionLower.includes(optValLower)) return true;

                                    // 2. Exact match of instruction inside option text/value 
                                    if (optTextLower.includes(instructionLower) || optValLower.includes(instructionLower)) return true;

                                    // 3. If LLM typed a specific value, try to match that
                                    if (lastCommand.action === 'type' && lastCommand.value) {
                                        const typeValueLower = lastCommand.value.toLowerCase();
                                        if (optTextLower.includes(typeValueLower) || optValLower.includes(typeValueLower) || typeValueLower.includes(optTextLower)) {
                                            return true;
                                        }
                                    }

                                    // 4. Granular word-based substring match (e.g., "chinese" matches "中文 (Chinese)")
                                    return instructionWords.some(word => optTextLower.includes(word) || optValLower.includes(word));
                                });

                                if (matchingOption) {
                                    console.log(`[PageSense] 🧠 Smart Engine: Guessed option "${matchingOption.text}" based on instruction and context. Upgrading action to 'select'.`);

                                    try {
                                        await executeAgentCommand('select', lastCommand.agent_id, matchingOption.value);
                                        console.log(`[PageSense] 🧠 Smart Engine: Fallback executed. Waiting 2000ms for UI to settle...`);
                                        await new Promise(r => setTimeout(r, 2000));

                                        // Capture a new snapshot to check if the fallback worked
                                        // We use the same capture method, but we must compare it to `previousSnapshot`,
                                        // because `snapshot` in this scope is the snapshot that just failed to trigger a diff!
                                        const fallbackSnapshot = await captureSnapshot();
                                        const fallbackDiff = compareSnapshots(previousSnapshot || snapshot, fallbackSnapshot);

                                        console.log(`[PageSense] 🔍 Fallback Diff Added Lines (${fallbackDiff.addedLines.length}):`, fallbackDiff.addedLines);
                                        console.log(`[PageSense] 🔍 Fallback Diff Removed Lines (${fallbackDiff.removedLines.length}):`, fallbackDiff.removedLines);

                                        if (fallbackDiff.addedLines.length > 0 || fallbackDiff.removedLines.length > 0) {
                                            console.log(`[PageSense] 🧠 Smart Engine: Fallback SUCCESSFUL! UI changed.`);
                                            // Replace the old unchanged snapshot with this new one so next iteration gets it
                                            snapshot = fallbackSnapshot;
                                            fallbackSuccessful = true;
                                            fallbackAttempted = true;

                                            // Enhance the last naive action description to show the engine saved the day
                                            if (previousActions.length > 0) {
                                                const popped = previousActions.pop();
                                                previousActions.push(`${popped} -> 🌟 SMART FALLBACK: Auto-corrected and successfully selected "${matchingOption.text}"`);
                                                setLiveActions([...previousActions]);
                                            }

                                            onAddMessage({
                                                role: 'system',
                                                content: `🧠 Engine auto-corrected click to select: "${matchingOption.text}"`,
                                                timestamp: new Date().toISOString()
                                            });
                                        } else {
                                            console.log(`[PageSense] 🧠 Smart Engine: Fallback failed to produce UI changes.`);
                                        }
                                    } catch (err) {
                                        console.error(`[PageSense] 🧠 Smart Engine: Error during fallback`, err);
                                    }
                                }
                            }
                        }

                        if (!fallbackSuccessful) {
                            if (previousActions.length > 0) {
                                const failedAction = previousActions[previousActions.length - 1];
                                const cleanActionName = failedAction.split(" (❌")[0].split(" ->")[0];

                                // 3. Push a single, commanding error message AFTER the failed action
                                previousActions.push(`❌ ERROR: Your action ('${cleanActionName}') produced NO visual changes. If you just clicked a Save/Submit button, it might be a silent save. If your ultimate objective is already visibly fulfilled on the screen, please return isComplete: true. Otherwise, try a DIFFERENT action. DO NOT repeat the exact same action!`);
                                setLiveActions([...previousActions]);
                            }
                        }
                    }
                } else {
                    console.log(`[Iteration ${iteration + 1}] (First iteration - no previous snapshot to compare)`);
                }

                // 2. Ask LLM for next action based on current snapshot
                const data = await callLLMAgent(snapshot, previousActions);
                console.log(`[Iteration ${iteration + 1}] LLM response:`, {
                    commands: data.commands?.length || 0,
                    isComplete: data.isComplete,
                    isImpossible: data.isImpossible
                });

                // 🛑 Handle Explicit Impossible States
                if (data.isImpossible) {
                    const reason = data.failureReason || "The AI determined this task is impossible to complete based on the current page state.";
                    console.error(`[Iteration ${iteration + 1}] 🛑 AI DECLARED TASK IMPOSSIBLE: ${reason}`);
                    setExecutionError(`Task Impossible: ${reason}`);

                    onAddMessage({
                        role: 'system',
                        content: `🛑 Giving up: ${reason}`,
                        timestamp: new Date().toISOString()
                    });

                    break;
                }

                // 3. Check if we have commands to execute
                if (!data.commands || !Array.isArray(data.commands) || data.commands.length === 0) {
                    // No more actions needed, task is complete
                    console.log(`[Iteration ${iteration + 1}] No commands to execute, stopping`);
                    break;
                }

                // 4. Execute only the FIRST command (next iteration will get updated state)
                const cmd = data.commands[0];

                // 🛑 Hard Loop Breaker: Prevent LLM from consecutively retrying the exact same failed action
                if (lastCommand &&
                    lastCommand.action === cmd.action &&
                    lastCommand.agent_id === cmd.agent_id &&
                    lastCommand.value === cmd.value) {

                    // Check if the last action we recorded was our custom ❌ ERROR message for zero-diff
                    if (previousActions.length > 0 && previousActions[previousActions.length - 1].startsWith('❌ ERROR:')) {
                        console.error(`[Iteration ${iteration + 1}] 🛑 LOOP BREAKER TRIGGERED: LLM forcefully repeated a failed command. Aborting execution.`);
                        setExecutionError("Execution aborted: The AI agent got stuck in a repetitive loop attempting an action that produces no visual feedback.");
                        break;
                    }
                }

                // 🛑 Toggle Loop Breaker: Detect if the agent is stuck opening/closing the same dropdown
                if (previousActions.length >= 3) {
                    const last1 = previousActions[previousActions.length - 1];
                    const last2 = previousActions[previousActions.length - 2];
                    const last3 = previousActions[previousActions.length - 3];
                    const newActionStr = `${cmd.action} on agent_id=${cmd.agent_id}`;

                    // Simple check if the string representations are identical
                    if (last1 === last2 && last2 === last3 && last1.startsWith(newActionStr)) {
                        console.error(`[Iteration ${iteration + 1}] 🛑 TOGGLE LOOP BREAKER TRIGGERED: LLM repeated '${newActionStr}' 4 times. Aborting execution.`);
                        setExecutionError(`Execution aborted: The AI agent got stuck in a repetitive conceptual loop, endlessly toggling the same element without progressing.`);
                        break;
                    } else if (last1 === last2 && last1.startsWith(newActionStr)) {
                        // If repeated 3 times natively, inject a stern warning to force it to look elsewhere
                        previousActions.push(`❌ ERROR: You have repeated this exact action 3 times in a row! It is NOT working. You are stuck in a reasoning loop opening and closing the same menu. STOP clicking this element and try a COMPLETELY DIFFERENT approach. Remember to look at the entire page, including top-level category buttons!`);
                        setLiveActions([...previousActions]);
                    }
                }

                if (cmd.action) {
                    try {
                        if (cmd.action === 'ask_confirmation') {
                            console.log(`[Iteration ${iteration + 1}] LLM asking for confirmation: "${cmd.value}"`);

                            // 🛑 Hook into React State instead of `window.confirm` to prevent blocking the main thread natively
                            const userConfirmed = await new Promise<boolean>((resolve) => {
                                setConfirmationDialog({
                                    message: cmd.value || 'Are you sure?',
                                    resolve
                                });
                            });

                            const decisionStr = userConfirmed ? 'Confirmed' : 'Denied';
                            const actionDescription = `Asked for confirmation: "${cmd.value}" -> User ${decisionStr}${cmd.reasoning ? ` (Reason: ${cmd.reasoning})` : ''}`;

                            previousActions.push(actionDescription);
                            setLiveActions([...previousActions]);
                            console.log(`[Iteration ${iteration + 1}] User ${decisionStr} confirmation.`);

                            // Log to conversation history
                            onAddMessage({
                                role: 'system',
                                content: `🤔 Asked: "${cmd.value}" -> You ${decisionStr}`,
                                timestamp: new Date().toISOString()
                            });

                            // Continue to next iteration so LLM can read the decision
                            lastCommand = cmd;
                            fallbackAttempted = false;
                            previousSnapshot = snapshot;
                            currentActionHistory.push({ snapshot, action: cmd });
                            continue;
                        }

                        if (!cmd.agent_id) {
                            throw new Error('agent_id is required for click and type actions');
                        }

                        console.log(`[Iteration ${iteration + 1}] Executing: ${cmd.action} on agent_id="${cmd.agent_id}"`);

                        // Get human-readable element description
                        const element = document.querySelector(`[data-agent-id="${cmd.agent_id}"]`);
                        let elementDescription = `agent_id="${cmd.agent_id}"`;

                        if (element) {
                            // Try to get meaningful text from the element
                            const textContent = element.textContent?.trim().slice(0, 50) || '';
                            const ariaLabel = element.getAttribute('aria-label') || '';
                            const placeholder = element.getAttribute('placeholder') || '';
                            const title = element.getAttribute('title') || '';
                            const tagName = element.tagName.toLowerCase();
                            const elementType = element.getAttribute('type') || '';

                            // Build a descriptive string
                            if (textContent) {
                                elementDescription = `"${textContent}"${textContent.length === 50 ? '...' : ''}`;
                            } else if (ariaLabel) {
                                elementDescription = `"${ariaLabel}" (aria-label)`;
                            } else if (placeholder) {
                                elementDescription = `${tagName} with placeholder "${placeholder}"`;
                            } else if (title) {
                                elementDescription = `"${title}" (title)`;
                            } else if (tagName === 'input' || tagName === 'textarea') {
                                elementDescription = `${tagName}${elementType ? ` type="${elementType}"` : ''}`;
                            } else if (tagName === 'button') {
                                elementDescription = 'button';
                            } else {
                                elementDescription = `${tagName} element`;
                            }
                        }

                        // Track what action was taken for context
                        const systemPromptStr = data.systemPrompt ? `\n\n<details><summary style="cursor: pointer; opacity: 0.7; font-size: 10px; margin-top: 4px;">View Raw Prompt Context</summary><pre style="white-space: pre-wrap; font-size: 9px; margin-top: 4px; padding: 4px; background: rgba(0,0,0,0.05); border-radius: 4px; max-height: 150px; overflow-y: auto;">${data.systemPrompt}</pre></details>` : '';
                        const actionDescription = `${cmd.action} on ${elementDescription}${cmd.value ? ` with value "${cmd.value}"` : ''}${cmd.reasoning ? ` (Reason: ${cmd.reasoning})` : ''}${systemPromptStr}`;

                        // EAGERLY save cross-page state before EVERY click.
                        // SPA frameworks like Next.js change the URL without a full page reload,
                        // breaking traditional unload events and naive <a> tag checks.
                        if (cmd.action === 'click') {
                            console.log('[PageSense-Debug] 🖱️ CLICK DETECTED. Eagerly saving complete state to localStorage right before clicking...');
                            const crossPageState: CrossPageExecutionState = {
                                instruction: currentInstruction,
                                previousActions: [...previousActions, actionDescription],
                                actionHistory: [...currentActionHistory, { snapshot, action: cmd }],
                                iterationCount: iteration + 1,
                                threadId,
                                timestamp: Date.now(),
                                url: window.location.href, // NOTE: URL *before* click
                                previousSnapshot: snapshot // Store pre-action snapshot
                            };
                            saveCrossPageState(crossPageState);
                        }

                        // Extract Element Semantics for Telemetry Hashing BEFORE execution mutates it
                        const elem = document.querySelector(`[data-agent-id="${cmd.agent_id}"]`);
                        let tag_name = 'UNKNOWN';
                        let text_content = '';
                        let aria_signatures = '';
                        if (elem) {
                            tag_name = elem.tagName.toLowerCase();
                            text_content = (elem.textContent || '').substring(0, 100).trim();
                            aria_signatures = Array.from(elem.attributes)
                                .filter(attr => attr.name.startsWith('aria-') || attr.name === 'role')
                                .map(attr => `${attr.name}=${attr.value}`)
                                .join(';');
                        }

                        // Cache existing element IDs before clicking to use for DOM diffing in opportunistic predictions
                        const preActionAgentElements = document.querySelectorAll('[data-agent-id]');
                        const preActionAgentIds = new Set(Array.from(preActionAgentElements).map(el => el.getAttribute('data-agent-id')).filter(Boolean));

                        // Execute action
                        await executeAgentCommand(cmd.action as 'click' | 'type' | 'select', cmd.agent_id, cmd.value);
                        successCount++;

                        previousActions.push(actionDescription);
                        setLiveActions([...previousActions]);
                        console.log(`[Iteration ${iteration + 1}] Action completed: ${actionDescription}`);

                        // Longer delay after clicks (likely to trigger UI changes like opening modals, dropdowns, etc.)
                        // Shorter delay after typing (usually doesn't change UI structure)
                        const isUIChangingAction = cmd.action === 'click';
                        const delay = isUIChangingAction ? 2000 : 500; // Increased to 2000ms for dropdowns
                        console.log(`[Iteration ${iteration + 1}] Waiting ${delay}ms for UI to settle...`);
                        await new Promise(r => setTimeout(r, delay));

                        // Post-Execution Telemetry Diffing
                        if (apiKey) {
                            try {
                                // Temporarily prepare DOM for clean snapshotting
                                const newRemovedElements = removeLibraryElements();
                                const newCollapseDropdowns = temporarilyExpandDropdowns();
                                const newRestoreHiddenElements = temporarilyShowHiddenElements();
                                syncStateToAttributes();

                                const rawHtml = document.body.outerHTML;
                                const newSnapshot = convertHtmlToMarkdown(rawHtml);

                                // Clean up DOM
                                newRestoreHiddenElements();
                                newCollapseDropdowns();
                                restoreLibraryElements(newRemovedElements);
                                clearVisualAnnotations(document.body);

                                // Basic diff logic: we just send the new mutated snapshot section if needed,
                                // or the server can handle deeper structural diffing.
                                // For MVP, we'll send the raw new snapshot and let the LLM map see the layout change.

                                await fetch(`${apiUrl}/agent/telemetry`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${apiKey}`,
                                    },
                                    body: JSON.stringify({
                                        url_pattern: window.location.pathname,
                                        tag_name,
                                        text_content,
                                        aria_signatures,
                                        action_type: cmd.action,
                                        diff_payload: newSnapshot, // The resultant DOM structure
                                        status: 'SUCCESS'
                                    })
                                });
                                console.log('[Telemetry] Action Diff Pushed Successfully.');
                            } catch (telemetryErr) {
                                console.error('[Telemetry] Background ping failed:', telemetryErr);
                            }
                        }

                        // ==========================================
                        // 🔮 OPPORTUNISTIC PREDICTIVE EXECUTION
                        // ==========================================
                        if (cmd.opportunistic_prediction) {
                            console.log('[PageSense] 🔮 Opportunistic Prediction detected:', cmd.opportunistic_prediction);

                            // 1. Check if the condition was met in the new DOM snapshot
                            const currentHtml = convertHtmlToMarkdown(document.body.outerHTML);
                            if (currentHtml.includes(cmd.opportunistic_prediction.expected_new_text)) {
                                console.log(`[PageSense] 🔮 CONDITION MET! Found "${cmd.opportunistic_prediction.expected_new_text}". Attempting to execute conditional followup.`);

                                // 2. Find the target element in the live DOM
                                // We iterate through all elements that have a data-agent-id and see if their text matches
                                const allAgentElements = document.querySelectorAll('[data-agent-id]');
                                const targetText = cmd.opportunistic_prediction.conditional_target_text.trim();

                                // Robust DOM Diffing: Only consider elements that are NEW to the DOM (i.e., dropdown option that just appeared)
                                // or elements whose pure textContent exactly matches the target.
                                const matchingElements = Array.from(allAgentElements).filter(el => {
                                    const agentId = el.getAttribute('data-agent-id');
                                    // Skip elements that existed before the click (e.g., global navigation links)
                                    if (agentId && preActionAgentIds.has(agentId)) return false;

                                    // Robust Text Matching: Only exact matches or very specific substrings (not just partial 'includes')
                                    const text = el.textContent?.trim() || '';
                                    return text === targetText || (text.includes(targetText) && text.length <= targetText.length + 5);
                                });

                                if (matchingElements.length === 1) {
                                    // Singular confident match!
                                    const matchedElement = matchingElements[0];
                                    const matchedAgentId = matchedElement.getAttribute('data-agent-id');

                                    if (matchedAgentId) {
                                        console.log(`[PageSense] 🔮 Found exact singular new element for follow-up! Executing ${cmd.opportunistic_prediction.conditional_followup_action} on agent_id="${matchedAgentId}"`);

                                        // 3. Document the fast-tracked action visually in the trace
                                        const fastTrackDesc = `⚡ FAST-TRACK: ${cmd.opportunistic_prediction.conditional_followup_action} on "${cmd.opportunistic_prediction.conditional_target_text}" (Predicted Target)`;

                                        // 4. Eagerly preserve state
                                        if (cmd.opportunistic_prediction.conditional_followup_action === 'click') {
                                            const crossPageFollowupState: CrossPageExecutionState = {
                                                instruction: currentInstruction,
                                                previousActions: [...previousActions, fastTrackDesc],
                                                actionHistory: [...currentActionHistory],
                                                iterationCount: iteration + 2, // Technically next step
                                                threadId,
                                                timestamp: Date.now(),
                                                url: window.location.href,
                                                previousSnapshot: currentHtml
                                            };
                                            saveCrossPageState(crossPageFollowupState);
                                        }

                                        // 5. Execute!
                                        await executeAgentCommand(cmd.opportunistic_prediction.conditional_followup_action as any, matchedAgentId, '');
                                        successCount++;

                                        previousActions.push(fastTrackDesc);
                                        setLiveActions([...previousActions]);

                                        console.log(`[PageSense] 🔮 Fast-track action completed. Waiting 2000ms...`);
                                        await new Promise(r => setTimeout(r, 2000));

                                        // Set snapshot to the FINAL state so next loop sees the result of the prediction
                                        snapshot = convertHtmlToMarkdown(document.body.outerHTML);

                                        // Make sure we explicitly do NOT break or skip the loop 
                                        // The Next.js framework state mutation might cause unmounted components, but let root catch it 
                                    } else if (matchingElements.length > 1) {
                                        console.warn(`[PageSense] 🔮 AMBIGUITY BAILOUT: Prediction condition was met, but found ${matchingElements.length} new structural elements matching "${targetText}". Falling back to strict LLM execution.`);
                                    } else {
                                        console.warn(`[PageSense] 🔮 Prediction condition was met, but could not find any strictly NEW target element matching exactly: "${targetText}". Skipping automatic followup.`);
                                    }
                                } else {
                                    console.log(`[PageSense] 🔮 Prediction missed. New DOM did not contain: "${cmd.opportunistic_prediction.expected_new_text}". Ignoring followup and continuing normal LLM loop.`);
                                }
                            }
                        }
                    } catch (err: any) {
                        throw new Error(`Failed to execute command on element. It might not be visible or available. Details: ${err.message}`);
                    }

                    // NOTE: If this was a Next.js SPA navigation, the URL will have changed by now,
                    // and the new Page component will be rendered. The loop will seamlessly continue
                    // to the next iteration, capturing the new page's DOM automatically!
                    // If this was a hard page reload, the browser would have killed this loop
                } else {
                    // No valid command, stop
                    console.log(`[Iteration ${iteration + 1}] Invalid command, stopping`);
                    break;
                }

                // If LLM indicated this was the final action, stop
                if (data.isComplete) {
                    console.log(`[Iteration ${iteration + 1}] Task marked complete by LLM, stopping`);
                    break;
                }

                console.log(`[Iteration ${iteration + 1}] Continuing to next iteration...`);

                // Store snapshot and command for next iteration's diff & smart fallback logic
                lastCommand = cmd;
                fallbackAttempted = false;
                previousSnapshot = snapshot;
                currentActionHistory.push({ snapshot, action: cmd });
            }

            // Clear cross-page state on successful completion
            clearCrossPageState();

            if (successCount > 0) {
                const responseMsg = `Successfully executed ${successCount} action${successCount > 1 ? 's' : ''}`;
                setSuccessMessage(responseMsg);
                setActionHistory(currentActionHistory);

                // Add assistant response to conversation with details
                const detailsText = previousActions.length > 0
                    ? `\n\nActions:\n${previousActions.map((action, idx) => `${idx + 1}. ${action}`).join('\n')}`
                    : '';
                onAddMessage({
                    role: 'assistant',
                    content: responseMsg + detailsText,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (err: any) {
            const errorMsg = err.message || 'An error occurred';
            setExecutionError(errorMsg);
            setActionHistory(currentActionHistory);

            // Clear cross-page state on error
            clearCrossPageState();

            // Add error to conversation
            onAddMessage({
                role: 'system',
                content: `Error: ${errorMsg}`,
                timestamp: new Date().toISOString()
            });
        } finally {
            setIsExecuting(false);
            clearAnnotations(document.body); // Fallback cleanup
        }
    };

    return (
        <div style={{ padding: '12px 12px 0 12px', borderBottom: '1px solid #eaeaea', backgroundColor: '#fafafa' }}>
            {executionError && liveActions.length === 0 && (
                <div style={{ color: 'red', fontSize: '10px', marginBottom: '8px', padding: '4px', backgroundColor: '#fee', borderRadius: '4px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Error: {executionError}
                </div>
            )}
            {(successMessage || executionError) && actionHistory.length > 0 && (
                <details style={{ padding: '8px', backgroundColor: '#f0fdf4', borderRadius: '4px', border: '1px solid #bbf7d0', marginBottom: '8px', overflow: 'hidden' }}>
                    <summary style={{ fontSize: '10px', fontWeight: 'bold', color: '#166534', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
                        Feedback? Help the AI improve on this page.
                    </summary>
                    <div style={{ marginTop: '8px' }}>
                        {!feedbackSuccess ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <textarea
                                    value={feedback}
                                    onChange={e => setFeedback(e.target.value)}
                                    placeholder="E.g., You selected the wrong checkout button..."
                                    disabled={isSubmittingFeedback}
                                    rows={2}
                                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #86efac', fontSize: '11px', resize: 'none', fontFamily: 'inherit' }}
                                />
                                <button
                                    onClick={async () => {
                                        if (!feedback.trim()) return;
                                        setIsSubmittingFeedback(true);
                                        try {
                                            const res = await fetch(`${apiUrl.replace(/\/$/, '')}/feedback`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
                                                body: JSON.stringify({ url: window.location.href, instruction: lastInstruction, feedback, actionHistory, visitorId })
                                            });
                                            if (res.ok) setFeedbackSuccess(true);
                                            else console.error('Feedback failed:', await res.text());
                                        } catch (err) {
                                            console.error('Feedback error:', err);
                                        } finally {
                                            setIsSubmittingFeedback(false);
                                        }
                                    }}
                                    disabled={isSubmittingFeedback || !feedback.trim()}
                                    style={{ padding: '4px 8px', backgroundColor: isSubmittingFeedback ? '#ccc' : '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: isSubmittingFeedback || !feedback.trim() ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 'bold', alignSelf: 'flex-end' }}
                                >
                                    {isSubmittingFeedback ? 'Submitting...' : 'Submit Rules'}
                                </button>
                            </div>
                        ) : (
                            <div style={{ fontSize: '10px', color: '#166534' }}>✓ Prompt rules generated & saved successfully.</div>
                        )}
                    </div>
                </details>
            )}
            <form
                onSubmit={(e) => { e.preventDefault(); handleExecuteInstruction(); }}
                style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}
            >
                <input
                    type="text"
                    value={instruction}
                    onChange={e => setInstruction(e.target.value)}
                    placeholder="e.g. Click the checkout button..."
                    disabled={isExecuting}
                    style={{
                        flex: 1,
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        fontSize: isExpanded ? '14px' : '12px'
                    }}
                />
                <button
                    type="submit"
                    disabled={isExecuting || !instruction.trim()}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: isExecuting ? '#ccc' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isExecuting || !instruction.trim() ? 'not-allowed' : 'pointer',
                        fontSize: isExpanded ? '14px' : '12px',
                        fontWeight: 'bold'
                    }}
                >
                    {isExecuting ? '...' : 'Cmd'}
                </button>
            </form >
            {liveActions.length > 0 && (
                <div style={{
                    marginTop: '4px',
                    padding: '8px',
                    backgroundColor: isExecuting ? '#fffbeb' : executionError ? '#fef2f2' : '#f0fdf4',
                    border: isExecuting ? '1px solid #fcd34d' : executionError ? '1px solid #fecaca' : '1px solid #bbf7d0',
                    borderRadius: '4px',
                    fontSize: isExpanded ? '12px' : '9px',
                    fontFamily: 'monospace',
                    color: isExecuting ? '#92400e' : executionError ? '#991b1b' : '#166534'
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {isExecuting ? (
                            <>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1.5s linear infinite' }}><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                                Agent is working...
                            </>
                        ) : executionError ? (
                            <>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                                {executionError}
                            </>
                        ) : (
                            <>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                {successMessage || 'Agent finished'}
                            </>
                        )}
                    </div>
                    <div style={{ maxHeight: isExpanded ? '50vh' : '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {liveActions.map((action, idx) => (
                            <div key={idx} style={{
                                padding: isExpanded ? '6px 10px' : '3px 6px',
                                backgroundColor: action.startsWith('❌') ? '#fee2e2' : '#fef3c7',
                                color: action.startsWith('❌') ? '#991b1b' : 'inherit',
                                borderRadius: '2px',
                                borderLeft: action.startsWith('❌') ? '2px solid #ef4444' : '2px solid #f59e0b'
                            }}>
                                <div style={{ fontWeight: 500 }}>{idx + 1}. {action.split('\n\n<details>')[0]}</div>
                                {action.includes('<details>') && (
                                    <div dangerouslySetInnerHTML={{ __html: `<details>${action.split('<details>')[1]}` }} />
                                )}
                            </div>
                        ))}

                        {/* 🛑 Custom Inline Confirmation Dialog */}
                        {confirmationDialog && (
                            <div style={{
                                padding: '8px 12px',
                                backgroundColor: '#fff',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                marginTop: '4px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}>
                                <div style={{ fontWeight: 'bold', fontSize: isExpanded ? '13px' : '11px', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                    Agent is asking for permission:
                                </div>
                                <div style={{ fontSize: isExpanded ? '12px' : '10px', color: '#4b5563', whiteSpace: 'pre-wrap' }}>
                                    {confirmationDialog.message}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                                    <button
                                        onClick={() => {
                                            confirmationDialog.resolve(false);
                                            setConfirmationDialog(null);
                                        }}
                                        style={{ padding: '4px 10px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: isExpanded ? '12px' : '10px', fontWeight: 500 }}
                                    >
                                        Deny
                                    </button>
                                    <button
                                        onClick={() => {
                                            confirmationDialog.resolve(true);
                                            setConfirmationDialog(null);
                                        }}
                                        style={{ padding: '4px 10px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: isExpanded ? '12px' : '10px', fontWeight: 500 }}
                                    >
                                        Confirm
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Anchor for auto-scroll */}
                        <div ref={liveActionsEndRef} style={{ height: '1px', width: '100%' }} />
                    </div>
                </div>
            )}
            {/* (Removed duplicate bottom execution error block as it is now inside liveActions) */}
        </div >
    );
});

type ConversationMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
};

type SnapshotHistory = {
    id: string;
    snapshot: string;
    timestamp: string;
    url: string;
    size: number;
};

export const AiBehaviorMonitor: React.FC = () => {
    const { events, isPaused, setIsPaused, executeAgentCommand, apiUrl, apiKey, visitorId, threadId } = useTracker();
    const [isOpen, setIsOpen] = useState(false);
    const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
    const [isResumed, setIsResumed] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // AI Visualization state
    const [isVisualizing, setIsVisualizing] = useState(false);
    const [visualizedHtml, setVisualizedHtml] = useState<string | null>(null);
    const [visualizationError, setVisualizationError] = useState<string | null>(null);

    const [showVisualizationModal, setShowVisualizationModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'result' | 'prompt' | 'diff'>('result');

    // Snapshot History state - SINGLE SOURCE OF TRUTH
    const [snapshotHistory, setSnapshotHistory] = useState<SnapshotHistory[]>([]);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
    const [hasNewSnapshot, setHasNewSnapshot] = useState(false);

    // Derived state: Get the actual snapshot content based on selected ID
    const currentSnapshot = React.useMemo(() => {
        if (!selectedSnapshotId || snapshotHistory.length === 0) return null;
        const found = snapshotHistory.find(s => s.id === selectedSnapshotId);
        return found ? found.snapshot : null;
    }, [selectedSnapshotId, snapshotHistory]);

    // Auto-select newest snapshot when modal opens if nothing is selected
    useEffect(() => {
        if (showVisualizationModal && !selectedSnapshotId && snapshotHistory.length > 0) {
            const newest = snapshotHistory[snapshotHistory.length - 1];
            console.log('[PageSense] Auto-selecting newest snapshot on modal open:', newest.id);
            setSelectedSnapshotId(newest.id);
        }
    }, [showVisualizationModal, selectedSnapshotId, snapshotHistory]);

    // Ensure selected snapshot still exists in history (in case it was dropped from FIFO queue)
    useEffect(() => {
        if (selectedSnapshotId && snapshotHistory.length > 0) {
            const exists = snapshotHistory.some(s => s.id === selectedSnapshotId);
            if (!exists) {
                // Selected snapshot was removed, auto-select newest
                const newest = snapshotHistory[snapshotHistory.length - 1];
                console.log('[PageSense] Selected snapshot no longer exists, auto-selecting newest:', newest.id);
                setSelectedSnapshotId(newest.id);
            }
        }
    }, [selectedSnapshotId, snapshotHistory]);

    // Draggable Modal State
    const [position, setPosition] = useState({ x: 50, y: 50 }); // Default top 50px, left 50px
    const isDraggingRef = useRef(false);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    // Refs for auto-capture logic
    const captureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastDomSizeRef = useRef<number>(0);
    const mutationObserverRef = useRef<MutationObserver | null>(null);

    // Function to auto-capture snapshot when significant DOM changes detected
    const captureSnapshotToHistory = useCallback(async () => {
        // Skip capture if user is currently focused on a library input/textarea
        // to avoid disrupting their typing experience
        const activeElement = document.activeElement;
        if (activeElement && activeElement.closest('#ai-page-sense-monitor-root')) {
            console.log('[PageSense] Skipping auto-capture while user is typing in library UI');
            return;
        }

        let removedElements: Map<string, Element> | null = null;

        try {
            // Wait for any animations/transitions to complete
            await new Promise(resolve => setTimeout(resolve, 500));

            // 1. Remove library UI FIRST (before annotation)
            removedElements = removeLibraryElements();

            // 2. Temporarily expand dropdowns
            const collapseDropdowns = temporarilyExpandDropdowns();
            await new Promise(resolve => setTimeout(resolve, 300));

            // 3. Temporarily show hidden elements (dropdowns, unchecked checkboxes, etc.)
            const restoreHiddenElements = temporarilyShowHiddenElements();

            // 4. THEN annotate only the page elements (library UI is already gone, hidden elements visible)
            annotateInteractiveElements(document.body);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Sync DOM properties before outerHTML serialization
            syncStateToAttributes();

            // 5. Capture the CLEAN DOM (without library UI, with ALL elements visible)
            const snapshot = convertHtmlToMarkdown(document.body.outerHTML);

            // 6. Restore hidden elements and collapse dropdowns
            restoreHiddenElements();
            collapseDropdowns();

            // 7. Restore library UI elements immediately
            if (removedElements) {
                restoreLibraryElements(removedElements);
            }

            // 5. Clean up annotations
            clearVisualAnnotations(document.body);

            if (!snapshot) return;

            const newSnapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newSnapshot: SnapshotHistory = {
                id: newSnapshotId,
                snapshot,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                size: snapshot.length
            };

            setSnapshotHistory(prev => {
                // Keep only last 5 snapshots (FIFO queue)
                const updated = [...prev, newSnapshot].slice(-5);
                return updated;
            });

            // Only auto-select the new snapshot if modal is not open
            // (to avoid disrupting user while they're reviewing a different snapshot)
            if (!showVisualizationModal) {
                setSelectedSnapshotId(newSnapshotId);
            } else {
                // Just show the indicator that a new snapshot is available
                setHasNewSnapshot(true);
            }

            console.log('[PageSense] Auto-captured snapshot:', {
                id: newSnapshotId,
                size: snapshot.length,
                url: window.location.href,
                time: new Date().toISOString()
            });

            // Clear "new" indicator after 3 seconds
            setTimeout(() => setHasNewSnapshot(false), 3000);

        } catch (err) {
            console.warn('[PageSense] Failed to auto-capture snapshot:', err);
        }
    }, []);

    // MutationObserver to detect significant DOM changes
    useEffect(() => {
        // Initialize last DOM size
        lastDomSizeRef.current = document.body.innerHTML.length;

        // Create MutationObserver
        const observer = new MutationObserver(() => {
            // Clear existing timeout
            if (captureTimeoutRef.current) {
                clearTimeout(captureTimeoutRef.current);
            }

            // Debounce: only capture 2 seconds after changes stop
            captureTimeoutRef.current = setTimeout(() => {
                const currentSize = document.body.innerHTML.length;
                const previousSize = lastDomSizeRef.current;

                // Calculate change percentage
                const changePercent = Math.abs(currentSize - previousSize) / previousSize * 100;

                // Only capture if change is significant (> 5% of DOM)
                if (changePercent > 5) {
                    console.log('[PageSense] Significant DOM change detected:', {
                        changePercent: changePercent.toFixed(2) + '%',
                        previousSize,
                        currentSize
                    });

                    lastDomSizeRef.current = currentSize;
                    captureSnapshotToHistory();
                }
            }, 2000); // 2 second debounce
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false, // Don't track attribute changes (too noisy)
            characterData: false // Don't track text changes (too noisy)
        });

        mutationObserverRef.current = observer;

        // Capture initial snapshot on mount
        setTimeout(() => {
            captureSnapshotToHistory();
        }, 1000);

        // Cleanup
        return () => {
            if (mutationObserverRef.current) {
                mutationObserverRef.current.disconnect();
            }
            if (captureTimeoutRef.current) {
                clearTimeout(captureTimeoutRef.current);
            }
        };
    }, [captureSnapshotToHistory]);

    // Restore conversation history and monitor state from sessionStorage on mount
    useEffect(() => {
        if (threadId) {
            const storageKey = `page-sense-conversation-${threadId}`;
            const monitorStateKey = 'page-sense-monitor-open';

            try {
                // Restore conversation
                const savedConversation = sessionStorage.getItem(storageKey);
                if (savedConversation) {
                    const parsed = JSON.parse(savedConversation);
                    setConversationHistory(parsed);
                    setIsResumed(true);
                    console.log('[PageSense] Restored conversation:', parsed.length, 'messages');
                }

                // Restore monitor open state
                const savedOpenState = sessionStorage.getItem(monitorStateKey);
                if (savedOpenState === 'true') {
                    setIsOpen(true);
                }
            } catch (err) {
                console.warn('[PageSense] Failed to restore state:', err);
            }
        }
    }, [threadId]);



    // Check for cross-page execution state on mount (for hard reloads)
    useEffect(() => {
        console.log('[Cross-Page] Initial mount check, threadId:', threadId);

        // Don't check if we haven't loaded the threadId yet
        if (!threadId) {
            console.log('[Cross-Page] Skipping check (no threadId yet)');
            return;
        }

        const state = loadCrossPageState();
        if (!state) {
            return;
        }

        console.log('[Cross-Page] Found state:', {
            threadId: state.threadId,
            instruction: state.instruction,
            previousActions: state.previousActions.length,
            iterationCount: state.iterationCount
        });

        // Clear the state immediately so a subsequent hard refresh doesn't double-trigger
        // an orphaned state if the loop is interrupted before completion.
        clearCrossPageState();

        // SPA Navigation creates a new threadId because Next.js remounts the component tree.
        // We intentionally DO NOT verify if `state.threadId === threadId` here because the old 
        // thread was orphaned. We simply adopt the orphaned state into the new thread!

        console.log('[Cross-Page] ✅ Resuming execution after page navigation');
        console.log('[Cross-Page] Previous URL:', state.url);
        console.log('[Cross-Page] Current URL:', window.location.href);
        console.log('[Cross-Page] Previous actions:', state.previousActions);

        // Open the monitor automatically so user can see resumption
        setIsOpen(true);

        // Add resuming message to conversation
        setConversationHistory(prev => [...prev, {
            role: 'system',
            content: `🔄 Resuming task after page navigation... (${state.previousActions.length} actions completed)`,
            timestamp: new Date().toISOString()
        }]);

        // Wait for page to fully load and render, then trigger form's execute
        // We need to wait a bit longer to ensure AgentInstructionForm has mounted
        setTimeout(() => {
            console.log('[Cross-Page] 🚀 Triggering execution via custom event (Initial Mount)');

            // Dispatch custom event that AgentInstructionForm will listen for
            window.dispatchEvent(new CustomEvent('page-sense-resume-execution', {
                detail: {
                    instruction: state.instruction,
                    previousActions: state.previousActions,
                    iterationCount: state.iterationCount,
                    previousSnapshot: state.previousSnapshot
                }
            }));
        }, 3000);

    }, [threadId]); // Re-run whenever threadId loads

    // Save conversation history to sessionStorage whenever it changes
    useEffect(() => {
        if (threadId && conversationHistory.length > 0) {
            const storageKey = `page-sense-conversation-${threadId}`;
            try {
                sessionStorage.setItem(storageKey, JSON.stringify(conversationHistory));
                console.log('[PageSense] Saved conversation:', conversationHistory.length, 'messages');
            } catch (err) {
                console.warn('[PageSense] Failed to save conversation:', err);
            }
        }
    }, [conversationHistory, threadId]);

    // Save monitor open state
    useEffect(() => {
        const monitorStateKey = 'page-sense-monitor-open';
        sessionStorage.setItem(monitorStateKey, String(isOpen));
    }, [isOpen]);

    useEffect(() => {
        // Center modal initially only once when it opens
        if (showVisualizationModal && typeof window !== 'undefined') {
            setPosition({
                x: window.innerWidth * 0.05,
                y: window.innerHeight * 0.05
            });
        }
    }, [showVisualizationModal]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current) return;
            // Native smooth drag
            setPosition({
                x: e.clientX - dragOffsetRef.current.x,
                y: e.clientY - dragOffsetRef.current.y
            });
        };

        const handleMouseUp = () => {
            isDraggingRef.current = false;
        };

        if (showVisualizationModal) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [showVisualizationModal]);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        isDraggingRef.current = true;
        dragOffsetRef.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    // Step 1: Open the visualizer modal and show prompt (NO generation yet)
    const handleOpenVisualizer = async () => {
        // Show modal immediately
        setShowVisualizationModal(true);
        setActiveTab('prompt');
        setIsVisualizing(false);
        setVisualizationError(null);

        // Check if we have a recent auto-captured snapshot (within last 5 seconds)
        const latestSnapshot = snapshotHistory[snapshotHistory.length - 1];
        const now = Date.now();

        if (latestSnapshot) {
            const snapshotAge = now - new Date(latestSnapshot.timestamp).getTime();

            // If snapshot is fresh (< 5 seconds old), use it immediately
            if (snapshotAge < 5000) {
                console.log('[PageSense] Using recent auto-captured snapshot:', latestSnapshot.id);
                setSelectedSnapshotId(latestSnapshot.id);
                setHasNewSnapshot(false);
                return;
            }
        }

        // Otherwise, capture a fresh snapshot
        await new Promise(resolve => setTimeout(resolve, 800));

        let snapshot = null;
        let removedElements: Map<string, Element> | null = null;

        try {
            // 1. Remove library UI FIRST (before annotation)
            removedElements = removeLibraryElements();

            // 2. Temporarily expand dropdowns
            const collapseDropdowns = temporarilyExpandDropdowns();
            await new Promise(resolve => setTimeout(resolve, 300));

            // 3. Temporarily show hidden elements (dropdowns, unchecked checkboxes, etc.)
            const restoreHiddenElements = temporarilyShowHiddenElements();

            // 4. THEN annotate only the page elements (library UI is already gone, hidden elements visible)
            try {
                annotateInteractiveElements(document.body);
            } catch (err) {
                console.warn('Failed to annotate elements:', err);
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            // Sync DOM property state (React programmatic mutators) to HTML attributes 
            syncStateToAttributes();

            // 5. Capture CLEAN snapshot (without library UI, with ALL elements visible)
            snapshot = convertHtmlToMarkdown(document.body.outerHTML);
            console.log('[PageSense] Captured on-demand snapshot:', snapshot?.length);

            // 6. Restore hidden elements and collapse dropdowns
            restoreHiddenElements();
            collapseDropdowns();
        } catch (err) {
            console.error("Failed to capture snapshot:", err);
            setVisualizationError("Failed to capture page snapshot. Please try again.");
            return;
        } finally {
            // Restore library UI
            if (removedElements) {
                restoreLibraryElements(removedElements);
            }
            clearVisualAnnotations(document.body);
        }

        if (!snapshot) {
            setVisualizationError("Failed to capture page snapshot. Please try again.");
            return;
        }

        // Add the fresh snapshot to history and select it
        const newSnapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newSnapshot: SnapshotHistory = {
            id: newSnapshotId,
            snapshot,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            size: snapshot.length
        };

        setSnapshotHistory(prev => {
            // Keep only last 5 snapshots (FIFO queue)
            const updated = [...prev, newSnapshot].slice(-5);
            return updated;
        });

        setSelectedSnapshotId(newSnapshotId);
        console.log('[PageSense] Fresh snapshot ready for visualization:', {
            id: newSnapshotId,
            size: snapshot.length,
            url: window.location.href
        });
    };

    // Step 2: Generate the visualization (called from button in modal)
    const handleGenerate = async () => {
        if (!currentSnapshot) {
            setVisualizationError("No snapshot available. Please try again.");
            return;
        }

        console.log('[PageSense] Generating visualization with snapshot:', {
            snapshotId: selectedSnapshotId,
            snapshotSize: currentSnapshot.length,
            snapshotPreview: currentSnapshot.substring(0, 200) + '...',
            totalSnapshots: snapshotHistory.length
        });

        setIsVisualizing(true);
        setVisualizationError(null);
        setVisualizedHtml(null);
        setActiveTab('result'); // Switch to result tab while generating

        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const res = await fetch(`${apiUrl.replace(/\/$/, '')}/visualize`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ snapshot: currentSnapshot })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data || 'Failed to generate');

            // Clean markdown blocks if LLM still returned them
            let html = data.html;
            if (html.startsWith('```html')) {
                html = html.replace(/```html\\n?/, '').replace(/```$/, '');
            }
            setVisualizedHtml(html);
        } catch (err: any) {
            setVisualizationError(err.message);
        } finally {
            setIsVisualizing(false);
        }
    };



    if (!isOpen) {
        return (
            <button
                id="ai-page-sense-monitor-root"
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    padding: '12px 20px',
                    backgroundColor: '#0a0a0a',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    zIndex: 9999,
                    fontWeight: '600',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    letterSpacing: '-0.01em',
                    backdropFilter: 'blur(12px)',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.3)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.24)';
                }}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
                    <path d="M12 12 2.1 12"></path>
                    <path d="M12 12 18.5 2"></path>
                    <path d="M22 12A10 10 0 0 0 12 2v10z" fill="currentColor"></path>
                    <circle cx="12" cy="12" r="3" fill="#fff" stroke="none"></circle>
                </svg>
                Page Sense
            </button>
        );
    }

    return (
        <div
            id="ai-page-sense-monitor-root"
            style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                width: isExpanded ? '800px' : '320px',
                height: isExpanded ? '90vh' : '400px',
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 9999,
                boxShadow: '0 24px 80px -12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.02)',
                fontFamily: 'sans-serif',
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
            <div style={{
                padding: '16px',
                borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'transparent'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: isExpanded ? '18px' : '15px', fontWeight: '700', color: '#111', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '-0.02em' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
                                <path d="M12 12 2.1 12"></path>
                                <path d="M12 12 18.5 2"></path>
                                <path d="M22 12A10 10 0 0 0 12 2v10z" fill="currentColor"></path>
                            </svg>
                            Intake
                        </h3>
                        {isResumed && conversationHistory.length > 0 && (
                            <span style={{
                                fontSize: '9px',
                                padding: '2px 6px',
                                backgroundColor: '#dbeafe',
                                color: '#1e40af',
                                borderRadius: '4px',
                                fontWeight: '600'
                            }} title={`Resumed with ${conversationHistory.length} messages`}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '3px', verticalAlign: '-1px' }}>
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                </svg>
                                Resumed
                            </span>
                        )}
                    </div>
                    <span style={{
                        fontSize: '9px',
                        color: '#34d399',
                        fontWeight: '600',
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px'
                    }} title={`Built: ${BUILD_TIME} | Thread: ${threadId.substring(0, 12)}...`}>
                        v{VERSION}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#666', display: 'flex', alignItems: 'center' }}
                        title={isExpanded ? "Collapse UI" : "Expand UI"}
                    >
                        {isExpanded ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg>
                        )}
                    </button>
                    <button
                        onClick={() => setIsPaused(!isPaused)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: isPaused ? 'red' : 'green' }}
                        title={isPaused ? "Resume Tracking" : "Pause Tracking"}
                    >
                        {isPaused ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <rect x="6" y="4" width="4" height="16"></rect>
                                <rect x="14" y="4" width="4" height="16"></rect>
                            </svg>
                        )}
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#666' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>

            {/* Agent Instruction UI extracted to prevent focus loss on parent re-render */}
            <AgentInstructionForm
                executeAgentCommand={executeAgentCommand}
                apiUrl={apiUrl}
                apiKey={apiKey}
                visitorId={visitorId}
                threadId={threadId}
                onAddMessage={(msg) => setConversationHistory(prev => [...prev, msg])}
                isExpanded={isExpanded}
            />

            {/* Conversation History */}
            {conversationHistory.length > 0 && (
                <div style={{
                    padding: '8px 12px',
                    backgroundColor: 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '1px solid #eaeaea',
                    maxHeight: isExpanded ? '50vh' : '200px',
                    overflowY: 'auto'
                }}>
                    <div style={{ fontSize: isExpanded ? '13px' : '10px', color: '#666', marginBottom: '4px', fontWeight: '600' }}>
                        Conversation ({conversationHistory.length})
                    </div>
                    {conversationHistory.slice(-5).map((msg, idx) => (
                        <div key={idx} style={{
                            fontSize: isExpanded ? '12px' : '9px',
                            padding: isExpanded ? '6px 8px' : '4px 6px',
                            marginBottom: '4px',
                            borderRadius: '4px',
                            backgroundColor: msg.role === 'user' ? '#dbeafe' : msg.role === 'assistant' ? '#d1fae5' : '#fee2e2',
                            color: '#111',
                            whiteSpace: 'pre-wrap'
                        }}>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '14px',
                                height: '14px',
                                borderRadius: '4px',
                                marginRight: '4px',
                                verticalAlign: 'middle',
                                backgroundColor: msg.role === 'user' ? '#3b82f6' : msg.role === 'assistant' ? '#10b981' : '#ef4444',
                                color: 'white'
                            }}>
                                {msg.role === 'user' ? (
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                ) : msg.role === 'assistant' ? (
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>
                                ) : (
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                )}
                            </span>

                            {/* Render content dynamically depending on if it has Action details */}
                            {msg.role === 'assistant' && msg.content.includes('\n\nActions:\n') ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                    <span style={{ fontWeight: 'bold' }}>{msg.content.split('\n\nActions:\n')[0]}</span>
                                    {msg.content.split('\n\nActions:\n')[1].split('\n').filter(Boolean).map((actionLine, aIdx) => {
                                        // The actionLine typically looks like "1. click on 'Foo' <details>..."
                                        // We strip the prefix "1. " because we apply our own styling
                                        const cleanAction = actionLine.replace(/^\d+\.\s/, '');
                                        const isError = cleanAction.startsWith('❌');

                                        return (
                                            <div key={aIdx} style={{
                                                padding: isExpanded ? '6px 10px' : '3px 6px',
                                                backgroundColor: isError ? '#fee2e2' : '#fef3c7',
                                                color: isError ? '#991b1b' : '#333',
                                                borderRadius: '2px',
                                                borderLeft: isError ? '2px solid #ef4444' : '2px solid #f59e0b',
                                                marginTop: '2px'
                                            }}>
                                                <div style={{ fontWeight: 500 }}>{aIdx + 1}. {cleanAction.split('\n\n<details>')[0]}</div>
                                                {cleanAction.includes('<details>') && (
                                                    <div dangerouslySetInnerHTML={{ __html: `<details>${cleanAction.split('<details>')[1]}` }} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <span>{msg.content}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div style={{ padding: '12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <button
                        onClick={handleOpenVisualizer}
                        style={{
                            fontSize: '12px',
                            padding: '6px 12px',
                            backgroundColor: hasNewSnapshot ? '#10b981' : '#0070f3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            width: '100%',
                            position: 'relative'
                        }}
                    >
                        {hasNewSnapshot && (
                            <span style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                width: '10px',
                                height: '10px',
                                backgroundColor: '#10b981',
                                borderRadius: '50%',
                                border: '2px solid white',
                                animation: 'pulse 2s infinite'
                            }} />
                        )}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: '-2px' }}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"></path><path d="m14 7 3 3"></path><path d="M5 6v4"></path><path d="M19 14v4"></path><path d="M10 2v2"></path><path d="M7 8H3"></path><path d="M21 16h-4"></path><path d="M11 3H9"></path></svg> Draw Visualization
                    </button>
                </div>

                {showVisualizationModal && (
                    <div
                        data-page-sense-modal="true"
                        style={{
                            position: 'fixed',
                            top: position.y + 'px',
                            left: position.x + 'px',
                            width: '90%',
                            maxWidth: '1200px',
                            height: '90%',
                            backgroundColor: '#fff',
                            borderRadius: '12px',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                            zIndex: 10000,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}>
                        <div
                            onMouseDown={handleMouseDown}
                            style={{
                                padding: '16px',
                                borderBottom: '1px solid #eaeaea',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: '#f9f9f9',
                                cursor: 'grab'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <h2 style={{ margin: 0, fontSize: '18px', userSelect: 'none' }}><span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"></path><path d="m14 7 3 3"></path></svg> AI Map</span></h2>
                                <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                                    <button
                                        onClick={() => setActiveTab('result')}
                                        style={{
                                            padding: '4px 12px',
                                            borderRadius: '16px',
                                            border: 'none',
                                            backgroundColor: activeTab === 'result' ? '#0070f3' : '#e0e0e0',
                                            color: activeTab === 'result' ? 'white' : '#333',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            fontWeight: 'bold'
                                        }}
                                    >Visual Result</button>
                                    <button
                                        onClick={() => setActiveTab('prompt')}
                                        style={{
                                            padding: '4px 12px',
                                            borderRadius: '16px',
                                            border: 'none',
                                            backgroundColor: activeTab === 'prompt' ? '#0070f3' : '#e0e0e0',
                                            color: activeTab === 'prompt' ? 'white' : '#333',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            fontWeight: 'bold'
                                        }}
                                    >Prompt Feed Data</button>
                                    <button
                                        onClick={() => setActiveTab('diff')}
                                        style={{
                                            padding: '4px 12px',
                                            borderRadius: '16px',
                                            border: 'none',
                                            backgroundColor: activeTab === 'diff' ? '#0070f3' : '#e0e0e0',
                                            color: activeTab === 'diff' ? 'white' : '#333',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            fontWeight: 'bold'
                                        }}
                                    >Visual Diff</button>
                                </div>
                            </div>
                            <button onClick={() => setShowVisualizationModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                        </div>
                        <div style={{ flex: 1, backgroundColor: '#f0f0f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            {activeTab === 'result' ? (
                                <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                    {isVisualizing && (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                            <div style={{ marginBottom: '24px' }}>
                                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0070f3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1.5s linear infinite' }}>
                                                    <line x1="12" y1="2" x2="12" y2="6"></line>
                                                    <line x1="12" y1="18" x2="12" y2="22"></line>
                                                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                                                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                                                    <line x1="2" y1="12" x2="6" y2="12"></line>
                                                    <line x1="18" y1="12" x2="22" y2="12"></line>
                                                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                                                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                                                </svg>
                                            </div>
                                            <p>The AI is drawing the page based on the semantic snapshot...</p>
                                        </div>
                                    )}
                                    {visualizationError && (
                                        <div style={{ color: 'red', padding: '20px', backgroundColor: '#fee', borderRadius: '8px' }}>
                                            Error: {visualizationError}
                                        </div>
                                    )}
                                    {visualizedHtml && !isVisualizing && (
                                        <div style={{ backgroundColor: '#fff', border: '1px solid #ccc', flex: 1, borderRadius: '8px', overflow: 'hidden', display: 'flex' }}>
                                            <iframe
                                                srcDoc={visualizedHtml}
                                                style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
                                                title="AI Visualized Content"
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : activeTab === 'diff' ? (
                                <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {snapshotHistory.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: '-2px' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Compare Iterations
                                            </label>
                                            <select
                                                value={selectedSnapshotId || ''}
                                                onChange={(e) => {
                                                    const snapshotId = e.target.value;
                                                    setSelectedSnapshotId(snapshotId);
                                                    setHasNewSnapshot(false);
                                                }}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #ccc',
                                                    fontSize: '12px',
                                                    backgroundColor: 'white',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {[...snapshotHistory].reverse().map((snapshot, displayIndex) => {
                                                    const time = new Date(snapshot.timestamp).toLocaleTimeString();
                                                    const size = (snapshot.size / 1024).toFixed(1);
                                                    const isNewest = displayIndex === 0;
                                                    return (
                                                        <option key={snapshot.id} value={snapshot.id}>
                                                            {isNewest ? <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%', marginRight: '6px' }}></span> : null}
                                                            {time} - {size}KB - {snapshot.url.split('/').pop() || 'page'}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 auto' }}>
                                        <label style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: '-2px' }}><path d="m14 7 3 3"></path><path d="m3 14 3-3 3 3"></path><path d="M17 10v4a2 2 0 0 1-2 2H6"></path></svg> Diff Output
                                        </label>
                                        <div style={{
                                            backgroundColor: '#2d2d2d',
                                            color: '#ccc',
                                            padding: '16px',
                                            borderRadius: '8px',
                                            fontFamily: 'monospace',
                                            fontSize: '11px',
                                            whiteSpace: 'pre-wrap',
                                            height: '400px',
                                            overflow: 'auto',
                                            border: '1px solid #444',
                                            flexShrink: 0,
                                            wordBreak: 'break-word'
                                        }}>
                                            {(() => {
                                                if (!selectedSnapshotId || snapshotHistory.length === 0) {
                                                    return "Waiting for snapshot selection...";
                                                }

                                                // Find current index explicitly through normal array (not spread reverse array)
                                                // We want (index - 1) realistically because older = smaller index.
                                                const currentIndex = snapshotHistory.findIndex(s => s.id === selectedSnapshotId);
                                                if (currentIndex === -1) return "Snapshot not found.";
                                                const previousIndex = currentIndex - 1;

                                                if (previousIndex < 0) {
                                                    return (
                                                        <div style={{ color: '#888', fontStyle: 'italic', padding: '12px', backgroundColor: '#222', borderRadius: '4px' }}>
                                                            No previous snapshot exists in the iteration loop to diff against. This is the oldest recorded payload in memory.
                                                        </div>
                                                    )
                                                }

                                                const currentSnapshot = snapshotHistory[currentIndex];
                                                const previousSnapshot = snapshotHistory[previousIndex];
                                                const diff = diffChars(previousSnapshot.snapshot, currentSnapshot.snapshot);

                                                return diff.map((part, index) => {
                                                    const color = part.added ? '#10b981' : part.removed ? '#ef4444' : '#888';
                                                    return (
                                                        <span key={index} style={{
                                                            color,
                                                            backgroundColor: part.added ? 'rgba(16, 185, 129, 0.1)' : part.removed ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                                            textDecoration: part.removed ? 'line-through' : 'none'
                                                        }}>
                                                            {part.value}
                                                        </span>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {/* Snapshot History Selector */}
                                    {snapshotHistory.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: '-2px' }}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg> Snapshot History ({snapshotHistory.length})
                                                {hasNewSnapshot && (
                                                    <span style={{
                                                        fontSize: '10px',
                                                        padding: '2px 6px',
                                                        backgroundColor: '#10b981',
                                                        color: 'white',
                                                        borderRadius: '4px',
                                                        fontWeight: '600'
                                                    }}>
                                                        <span style={{ display: 'inline-block', width: '6px', height: '6px', backgroundColor: 'white', borderRadius: '50%', marginRight: '4px' }}></span> Fresh
                                                    </span>
                                                )}
                                            </label>
                                            <select
                                                value={selectedSnapshotId || ''}
                                                onChange={(e) => {
                                                    const snapshotId = e.target.value;
                                                    setSelectedSnapshotId(snapshotId);
                                                    setHasNewSnapshot(false);

                                                    const snapshot = snapshotHistory.find(s => s.id === snapshotId);
                                                    if (snapshot) {
                                                        console.log('[PageSense] Selected snapshot:', {
                                                            id: snapshot.id,
                                                            size: snapshot.size,
                                                            timestamp: snapshot.timestamp,
                                                            url: snapshot.url
                                                        });
                                                    }
                                                }}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #ccc',
                                                    fontSize: '12px',
                                                    backgroundColor: 'white',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {[...snapshotHistory].reverse().map((snapshot, displayIndex) => {
                                                    const time = new Date(snapshot.timestamp).toLocaleTimeString();
                                                    const size = (snapshot.size / 1024).toFixed(1);
                                                    const isNewest = displayIndex === 0;
                                                    return (
                                                        <option key={snapshot.id} value={snapshot.id}>
                                                            {isNewest ? <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%', marginRight: '6px' }}></span> : null}
                                                            {time} - {size}KB - {snapshot.url.split('/').pop() || 'page'}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 auto' }}>
                                        <label style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: '-2px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Snapshot Preview
                                        </label>
                                        <div style={{
                                            backgroundColor: '#2d2d2d',
                                            color: '#f8f8f2',
                                            padding: '16px',
                                            borderRadius: '8px',
                                            fontFamily: 'monospace',
                                            fontSize: '11px',
                                            whiteSpace: 'pre-wrap',
                                            height: '400px',
                                            overflow: 'auto',
                                            border: '1px solid #444',
                                            flexShrink: 0,
                                            wordBreak: 'break-word'
                                        }}>
                                            {currentSnapshot || (
                                                snapshotHistory.length === 0
                                                    ? "No snapshots available. The page will auto-capture snapshots as you interact with it."
                                                    : `Waiting for snapshot selection... (${snapshotHistory.length} available)\nSelected ID: ${selectedSnapshotId || 'none'}`
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: '-2px' }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> Instructions
                                        </label>
                                        <div style={{
                                            fontSize: '11px',
                                            padding: '12px',
                                            backgroundColor: '#f0f9ff',
                                            border: '1px solid #bae6fd',
                                            borderRadius: '8px',
                                            color: '#0c4a6e'
                                        }}>
                                            The AI will analyze this page snapshot and create a visual representation.
                                            It will highlight interactive elements with their agent IDs.
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleGenerate}
                                        disabled={isVisualizing || !currentSnapshot}
                                        style={{
                                            fontSize: '14px',
                                            padding: '12px 24px',
                                            backgroundColor: isVisualizing ? '#ccc' : '#10b981',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '8px',
                                            cursor: isVisualizing || !currentSnapshot ? 'not-allowed' : 'pointer',
                                            fontWeight: 'bold',
                                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                                        }}
                                    >
                                        {isVisualizing ? (
                                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', animation: 'spin 1.5s linear infinite' }}><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Generating...</span>
                                        ) : (
                                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"></path><path d="m14 7 3 3"></path><path d="M5 6v4"></path><path d="M19 14v4"></path><path d="M10 2v2"></path><path d="M7 8H3"></path><path d="M21 16h-4"></path><path d="M11 3H9"></path></svg> Generate Image</span>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {events.length === 0 ? (
                    <p style={{ color: '#888', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>Waiting for user interaction...</p>
                ) : (
                    events.map((ev) => (
                        <div key={ev.id} style={{
                            fontSize: '12px',
                            padding: '8px',
                            backgroundColor: '#f5f5f5',
                            borderRadius: '6px',
                            color: '#333',
                            opacity: isPaused ? 0.6 : 1
                        }}>
                            <span style={{ fontWeight: 'bold', textTransform: 'uppercase', marginRight: '6px', color: '#0070f3' }}>
                                {ev.type}
                            </span>
                            <span style={{ color: '#666' }}>
                                {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <div style={{ marginTop: '4px', wordBreak: 'break-all', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div>
                                    {ev.target && <span>Node: <strong>{ev.target}</strong> </span>}
                                    {ev.value && <span>Val: <strong>{ev.value}</strong> </span>}
                                    {ev.x !== undefined && ev.y !== undefined && <span>Pos: ({ev.x}, {ev.y})</span>}
                                </div>
                                {ev.path && (
                                    <div style={{ fontSize: '10px', color: '#666', background: '#e0e0e0', padding: '4px', borderRadius: '4px' }}>
                                        <code style={{ fontFamily: 'monospace' }}>Path: {ev.path}</code>
                                    </div>
                                )}
                                {(ev.innerText || ev.role || ev.ariaLabel) && (
                                    <div style={{ fontSize: '11px', color: '#444', borderLeft: '2px solid #0070f3', paddingLeft: '6px' }}>
                                        {ev.role && <span>Role: <strong>{ev.role}</strong><br /></span>}
                                        {ev.ariaLabel && <span>Aria: <strong>{ev.ariaLabel}</strong><br /></span>}
                                        {ev.innerText && <span>Text: "{ev.innerText}"</span>}
                                    </div>
                                )}
                                {ev.snapshot && (
                                    <details style={{ fontSize: '11px', marginTop: '4px' }}>
                                        <summary style={{ cursor: 'pointer', color: '#0070f3', fontWeight: 'bold' }}>View DOM Snapshot ({ev.snapshot.length} chars)</summary>
                                        <pre style={{ maxHeight: '150px', overflowY: 'auto', background: '#222', color: '#0f0', padding: '6px', borderRadius: '4px', fontSize: '10px', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                                            {ev.snapshot}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
