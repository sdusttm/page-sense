"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTracker } from '../tracker/useTracker';
import { convertHtmlToMarkdown } from '../utils/dom-to-semantic-markdown';
import { annotateInteractiveElements, clearAnnotations, clearVisualAnnotations, temporarilyShowHiddenElements, temporarilyExpandDropdowns, syncStateToAttributes } from '../utils/annotator';
import { removeLibraryElements, restoreLibraryElements } from '../utils/cleanCapture';
import { VERSION, BUILD_TIME } from '../version';

// Cross-page execution state interface
interface CrossPageExecutionState {
    instruction: string;
    previousActions: string[];
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
    threadId,
    onAddMessage
}: {
    executeAgentCommand: (action: 'click' | 'type' | 'select', agentId: string, value?: string) => Promise<void>;
    apiUrl: string;
    apiKey?: string;
    threadId: string;
    onAddMessage: (message: { role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }) => void;
}) => {
    const [instruction, setInstruction] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [executionError, setExecutionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [executedActions, setExecutedActions] = useState<string[]>([]);
    const [showActionDetails, setShowActionDetails] = useState(false);

    // Listen for cross-page execution resume event from main component
    useEffect(() => {
        const handleResumeEvent = async (event: Event) => {
            const customEvent = event as CustomEvent;
            console.log('[PageSense-Debug] 🎯 AgentInstructionForm RECEIVED "page-sense-resume-execution" payload:', customEvent.detail);

            const { instruction, previousActions, iterationCount } = customEvent.detail;

            console.log('[PageSense-Debug] 🚀 Automatically starting execution loop with instruction:', instruction);

            // Resume execution
            await handleExecuteInstruction(instruction, {
                previousActions,
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
            iterationCount: number;
            previousSnapshot?: string;
        }
    ) => {
        const currentInstruction = instructionOverride || instruction;
        if (!currentInstruction.trim()) return;

        setIsExecuting(true);
        setExecutionError(null);
        setSuccessMessage(null);

        // Add user message to conversation (only if not resuming)
        if (!resumeState) {
            onAddMessage({
                role: 'user',
                content: currentInstruction,
                timestamp: new Date().toISOString()
            });
        }

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
            const maxIterations = 10; // Prevent infinite loops
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
                    isComplete: data.isComplete
                });

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

                if (cmd.action) {
                    try {
                        if (cmd.action === 'ask_confirmation') {
                            console.log(`[Iteration ${iteration + 1}] LLM asking for confirmation: "${cmd.value}"`);
                            const userConfirmed = window.confirm(`🤖 AI Agent asks:\n\n${cmd.value}`);

                            const decisionStr = userConfirmed ? 'Confirmed' : 'Denied';
                            const actionDescription = `Asked for confirmation: "${cmd.value}" -> User ${decisionStr}`;

                            previousActions.push(actionDescription);
                            console.log(`[Iteration ${iteration + 1}] User ${decisionStr} confirmation.`);

                            // Log to conversation history
                            onAddMessage({
                                role: 'system',
                                content: `🤔 Asked: "${cmd.value}" -> You ${decisionStr}`,
                                timestamp: new Date().toISOString()
                            });

                            // Continue to next iteration so LLM can read the decision
                            previousSnapshot = snapshot;
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
                        const actionDescription = `${cmd.action} on ${elementDescription}${cmd.value ? ` with value "${cmd.value}"` : ''}`;

                        // EAGERLY save cross-page state before EVERY click.
                        // SPA frameworks like Next.js change the URL without a full page reload,
                        // breaking traditional unload events and naive <a> tag checks.
                        if (cmd.action === 'click') {
                            console.log('[PageSense-Debug] 🖱️ CLICK DETECTED. Eagerly saving complete state to localStorage right before clicking...');
                            const crossPageState: CrossPageExecutionState = {
                                instruction: currentInstruction,
                                previousActions: [...previousActions, actionDescription],
                                iterationCount: iteration + 1,
                                threadId,
                                timestamp: Date.now(),
                                url: window.location.href, // NOTE: URL *before* click
                                previousSnapshot: snapshot // Store pre-action snapshot
                            };
                            saveCrossPageState(crossPageState);
                        }

                        await executeAgentCommand(cmd.action as 'click' | 'type' | 'select', cmd.agent_id, cmd.value);
                        successCount++;

                        previousActions.push(actionDescription);
                        console.log(`[Iteration ${iteration + 1}] Action completed: ${actionDescription}`);

                        // Longer delay after clicks (likely to trigger UI changes like opening modals, dropdowns, etc.)
                        // Shorter delay after typing (usually doesn't change UI structure)
                        const isUIChangingAction = cmd.action === 'click';
                        const delay = isUIChangingAction ? 2000 : 500; // Increased to 2000ms for dropdowns
                        console.log(`[Iteration ${iteration + 1}] Waiting ${delay}ms for UI to settle...`);
                        await new Promise(r => setTimeout(r, delay));

                        // NOTE: If this was a Next.js SPA navigation, the URL will have changed by now,
                        // and the new Page component will be rendered. The loop will seamlessly continue
                        // to the next iteration, capturing the new page's DOM automatically!
                        // If this was a hard page reload, the browser would have killed this loop
                        // and the root layout's useEffect will resume it using the eagerly saved state.
                    } catch (err: any) {
                        throw new Error(`Failed to execute command on element. It might not be visible or available. Details: ${err.message}`);
                    }
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
            }

            setInstruction(''); // clear input on success!

            // Clear cross-page state on successful completion
            clearCrossPageState();

            if (successCount > 0) {
                const responseMsg = `Successfully executed ${successCount} action${successCount > 1 ? 's' : ''}`;
                setSuccessMessage(responseMsg);
                setExecutedActions(previousActions); // Store actions for expandable details
                setShowActionDetails(false); // Reset expansion state
                setTimeout(() => {
                    setSuccessMessage(null);
                    setExecutedActions([]);
                }, 8000); // Increased timeout to give time to expand

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
            {executionError && (
                <div style={{ color: 'red', fontSize: '10px', marginBottom: '8px', padding: '4px', backgroundColor: '#fee', borderRadius: '4px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Error: {executionError}
                </div>
            )}
            {successMessage && (
                <div style={{
                    color: 'green',
                    fontSize: '10px',
                    marginBottom: '8px',
                    padding: '8px',
                    backgroundColor: '#efe',
                    borderRadius: '4px',
                    border: '1px solid #4caf50'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: executedActions.length > 0 ? 'pointer' : 'default'
                    }}
                        onClick={() => executedActions.length > 0 && setShowActionDetails(!showActionDetails)}
                    >
                        <span>{successMessage}</span>
                        {executedActions.length > 0 && (
                            <span style={{
                                fontSize: '12px',
                                marginLeft: '8px',
                                userSelect: 'none'
                            }}>
                                {showActionDetails ? '▼' : '▶'}
                            </span>
                        )}
                    </div>
                    {showActionDetails && executedActions.length > 0 && (
                        <div style={{
                            marginTop: '8px',
                            paddingTop: '8px',
                            borderTop: '1px solid #4caf50',
                            fontSize: '9px',
                            fontFamily: 'monospace'
                        }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Actions executed:</div>
                            {executedActions.map((action, idx) => (
                                <div key={idx} style={{
                                    padding: '2px 4px',
                                    backgroundColor: '#fff',
                                    marginBottom: '2px',
                                    borderRadius: '2px'
                                }}>
                                    {idx + 1}. {action}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
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
                        fontSize: '12px'
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
                        fontSize: '12px',
                        fontWeight: 'bold'
                    }}
                >
                    {isExecuting ? '...' : 'Cmd'}
                </button>
            </form >
            {executionError && (
                <div style={{ color: 'red', fontSize: '10px', marginBottom: '8px' }}>
                    Error: {executionError}
                </div>
            )}
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
    const { events, isPaused, setIsPaused, executeAgentCommand, apiUrl, apiKey, threadId } = useTracker();
    const [isOpen, setIsOpen] = useState(false);
    const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
    const [isResumed, setIsResumed] = useState(false);

    // AI Visualization state
    const [isVisualizing, setIsVisualizing] = useState(false);
    const [visualizedHtml, setVisualizedHtml] = useState<string | null>(null);
    const [visualizationError, setVisualizationError] = useState<string | null>(null);

    const [showVisualizationModal, setShowVisualizationModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'result' | 'prompt'>('result');

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
                width: '320px',
                height: '400px',
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
                overflow: 'hidden'
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
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#111', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '-0.02em' }}>
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
                threadId={threadId}
                onAddMessage={(msg) => setConversationHistory(prev => [...prev, msg])}
            />

            {/* Conversation History */}
            {conversationHistory.length > 0 && (
                <div style={{
                    padding: '8px 12px',
                    backgroundColor: 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '1px solid #eaeaea',
                    maxHeight: '200px',
                    overflowY: 'auto'
                }}>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px', fontWeight: '600' }}>
                        Conversation ({conversationHistory.length})
                    </div>
                    {conversationHistory.slice(-5).map((msg, idx) => (
                        <div key={idx} style={{
                            fontSize: '9px',
                            padding: '4px 6px',
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
                            </span> {msg.content}
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
