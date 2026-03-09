"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTracker } from '../tracker/useTracker';
import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import { annotateInteractiveElements, clearAnnotations, clearVisualAnnotations } from '../utils/annotator';
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
}

// Cross-page execution helpers
const CROSS_PAGE_STORAGE_KEY = 'page-sense-cross-page-execution';
const CROSS_PAGE_TIMEOUT_MS = 15000; // 15 seconds max to resume

const saveCrossPageState = (state: CrossPageExecutionState) => {
    try {
        localStorage.setItem(CROSS_PAGE_STORAGE_KEY, JSON.stringify(state));
        console.log('[Cross-Page] Saved execution state:', state);
    } catch (err) {
        console.error('[Cross-Page] Failed to save state:', err);
    }
};

const loadCrossPageState = (): CrossPageExecutionState | null => {
    try {
        const stored = localStorage.getItem(CROSS_PAGE_STORAGE_KEY);
        if (!stored) return null;

        const state = JSON.parse(stored) as CrossPageExecutionState;

        // Check if state is recent (within timeout)
        if (Date.now() - state.timestamp > CROSS_PAGE_TIMEOUT_MS) {
            console.log('[Cross-Page] State expired, clearing');
            clearCrossPageState();
            return null;
        }

        console.log('[Cross-Page] Loaded execution state:', state);
        return state;
    } catch (err) {
        console.error('[Cross-Page] Failed to load state:', err);
        return null;
    }
};

const clearCrossPageState = () => {
    try {
        localStorage.removeItem(CROSS_PAGE_STORAGE_KEY);
        console.log('[Cross-Page] Cleared execution state');
    } catch (err) {
        console.error('[Cross-Page] Failed to clear state:', err);
    }
};

// Check if element is a navigation link (will cause page reload)
const isNavigationLink = (agentId: string): boolean => {
    try {
        const element = document.querySelector(`[data-agent-id="${agentId}"]`);
        if (!element) return false;

        // Check if it's an anchor tag
        if (element.tagName === 'A') {
            const href = element.getAttribute('href');
            // Navigation links: external URLs, relative paths, but NOT hash links or javascript
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                // Check if it's a different page (not same origin + path)
                try {
                    const currentPath = window.location.pathname;
                    const linkUrl = new URL(href, window.location.origin);
                    const isExternal = linkUrl.origin !== window.location.origin;
                    const isDifferentPath = linkUrl.pathname !== currentPath;

                    return isExternal || isDifferentPath;
                } catch {
                    // If URL parsing fails, assume it's a navigation
                    return true;
                }
            }
        }

        // Check if element has onclick that might navigate
        // (This is heuristic, not foolproof)
        const onClick = element.getAttribute('onclick');
        if (onClick && (onClick.includes('location') || onClick.includes('navigate'))) {
            return true;
        }

        return false;
    } catch (err) {
        console.error('[Cross-Page] Error checking navigation:', err);
        return false;
    }
};

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
    executeAgentCommand: (action: 'click' | 'type', agentId: string, value?: string) => Promise<void>;
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
    const hasResumedRef = useRef(false);

    // Check for cross-page execution state on mount
    useEffect(() => {
        const resumeExecution = async () => {
            // Only resume once
            if (hasResumedRef.current) return;
            hasResumedRef.current = true;

            const state = loadCrossPageState();
            if (!state) return;

            // Verify threadId matches (avoid resuming wrong session)
            if (state.threadId !== threadId) {
                console.log('[Cross-Page] ThreadId mismatch, clearing state');
                clearCrossPageState();
                return;
            }

            console.log('[Cross-Page] Resuming execution after page navigation');
            console.log('[Cross-Page] Previous URL:', state.url);
            console.log('[Cross-Page] Current URL:', window.location.href);
            console.log('[Cross-Page] Previous actions:', state.previousActions);

            // Show resuming message
            onAddMessage({
                role: 'system',
                content: `🔄 Resuming task after page navigation... (${state.previousActions.length} actions completed)`,
                timestamp: new Date().toISOString()
            });

            // Wait for page to fully load and render
            await new Promise(resolve => setTimeout(resolve, 2500));

            // Resume execution
            await handleExecuteInstruction(state.instruction, {
                previousActions: state.previousActions,
                iterationCount: state.iterationCount
            });
        };

        resumeExecution();
    }, [threadId]); // Only run when threadId is available

    const handleExecuteInstruction = async (
        instructionOverride?: string,
        resumeState?: {
            previousActions: string[];
            iterationCount: number;
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

                // 3. THEN annotate ALL interactive elements with fresh IDs
                //    (library UI is already gone, so only page elements are annotated)
                const annotatedCount = annotateInteractiveElements(document.body);
                console.log(`[Snapshot] Annotated ${annotatedCount} interactive elements (fresh IDs)`);

                // 4. Capture CLEAN snapshot (without library UI)
                const snapshot = convertHtmlToMarkdown(document.body.outerHTML);

                // Debug: Log snapshot details and search for common dropdown keywords
                console.log(`[Snapshot] Size: ${snapshot.length} chars`);
                console.log(`[Snapshot] Contains "declaration"?`, snapshot.toLowerCase().includes('declaration'));
                console.log(`[Snapshot] Contains "customs"?`, snapshot.toLowerCase().includes('customs'));

                // Show a portion of the snapshot to verify dropdown content
                const snapshotLines = snapshot.split('\n').slice(0, 50);
                console.log(`[Snapshot] First 50 lines:`, snapshotLines.join('\n'));

                // 5. Restore library UI immediately
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

                console.log(`[LLM Response]`, {
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
            let previousSnapshot: string | null = null;
            const startIteration = resumeState ? resumeState.iterationCount : 0;

            for (let iteration = startIteration; iteration < maxIterations; iteration++) {
                console.log(`[Iteration ${iteration + 1}/${maxIterations}] Starting...`);

                // 1. Capture fresh snapshot (shows current state after any previous actions)
                const snapshot = await captureSnapshot();
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
                if (cmd.action && cmd.agent_id) {
                    try {
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

                        // Check if this action will cause page navigation
                        if (cmd.action === 'click' && isNavigationLink(cmd.agent_id)) {
                            console.log('[Cross-Page] Detected navigation link, saving state before click');

                            // Save state BEFORE executing (in case page unloads)
                            const crossPageState: CrossPageExecutionState = {
                                instruction: currentInstruction,
                                previousActions: [...previousActions, actionDescription],
                                iterationCount: iteration + 1,
                                threadId,
                                timestamp: Date.now(),
                                url: window.location.href
                            };

                            saveCrossPageState(crossPageState);

                            onAddMessage({
                                role: 'system',
                                content: `🔄 Navigating to new page... (will resume automatically)`,
                                timestamp: new Date().toISOString()
                            });
                        }

                        await executeAgentCommand(cmd.action, cmd.agent_id, cmd.value);
                        successCount++;

                        previousActions.push(actionDescription);
                        console.log(`[Iteration ${iteration + 1}] Action completed: ${actionDescription}`);

                        // Longer delay after clicks (likely to trigger UI changes like opening modals, dropdowns, etc.)
                        // Shorter delay after typing (usually doesn't change UI structure)
                        const isUIChangingAction = cmd.action === 'click';
                        const delay = isUIChangingAction ? 2000 : 500; // Increased to 2000ms for dropdowns
                        console.log(`[Iteration ${iteration + 1}] Waiting ${delay}ms for UI to settle...`);
                        await new Promise(r => setTimeout(r, delay));
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

                // Store snapshot for next iteration's diff
                previousSnapshot = snapshot;
            }

            setInstruction(''); // clear input on success!

            // Clear cross-page state on successful completion
            clearCrossPageState();

            if (successCount > 0) {
                const responseMsg = `✅ Successfully executed ${successCount} action${successCount > 1 ? 's' : ''}`;
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
                content: `❌ Error: ${errorMsg}`,
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
                    ❌ Error: {executionError}
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

            // 2. THEN annotate only the page elements (library UI is already gone)
            annotateInteractiveElements(document.body);
            await new Promise(resolve => setTimeout(resolve, 100));

            // 3. Capture the CLEAN DOM (without library UI)
            const snapshot = convertHtmlToMarkdown(document.body.outerHTML);

            // 4. Restore library UI elements immediately
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

            // 2. THEN annotate only the page elements (library UI is already gone)
            try {
                annotateInteractiveElements(document.body);
            } catch (err) {
                console.warn('Failed to annotate elements:', err);
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            // 3. Capture CLEAN snapshot (without library UI)
            snapshot = convertHtmlToMarkdown(document.body.outerHTML);
            console.log('[PageSense] Captured on-demand snapshot:', snapshot?.length);
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
                    bottom: '20px',
                    right: '20px',
                    padding: '12px 20px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '24px',
                    cursor: 'pointer',
                    zIndex: 9999,
                    fontWeight: 'bold',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    fontFamily: 'sans-serif'
                }}
            >
                👁️ AI Monitor
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
            backgroundColor: '#fff',
            border: '1px solid #eaeaea',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            fontFamily: 'sans-serif',
            overflow: 'hidden'
        }}>
            <div style={{
                padding: '16px',
                borderBottom: '1px solid #eaeaea',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f9f9f9'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111' }}>🧠 AI Behavior Intake</h3>
                        {isResumed && conversationHistory.length > 0 && (
                            <span style={{
                                fontSize: '9px',
                                padding: '2px 6px',
                                backgroundColor: '#dbeafe',
                                color: '#1e40af',
                                borderRadius: '4px',
                                fontWeight: '600'
                            }} title={`Resumed with ${conversationHistory.length} messages`}>
                                🔗 Resumed
                            </span>
                        )}
                    </div>
                    <span style={{
                        fontSize: '9px',
                        color: '#10b981',
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
                        {isPaused ? '▶️' : '⏸️'}
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#666' }}
                    >
                        ✕
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
                    backgroundColor: '#f9fafb',
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
                            <strong>{msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚠️'}</strong> {msg.content}
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
                        ✨ Draw AI Visualization {hasNewSnapshot ? '🟢' : ''}
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
                                <h2 style={{ margin: 0, fontSize: '18px', userSelect: 'none' }}>✨ AI Imagination</h2>
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
                            <button onClick={() => setShowVisualizationModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                        </div>
                        <div style={{ flex: 1, backgroundColor: '#f0f0f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            {activeTab === 'result' ? (
                                <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                    {isVisualizing && (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                            <div style={{ fontSize: '40px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>⏳</div>
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
                                                📸 Snapshot History ({snapshotHistory.length})
                                                {hasNewSnapshot && (
                                                    <span style={{
                                                        fontSize: '10px',
                                                        padding: '2px 6px',
                                                        backgroundColor: '#10b981',
                                                        color: 'white',
                                                        borderRadius: '4px',
                                                        fontWeight: '600'
                                                    }}>
                                                        🟢 Fresh
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
                                                            {isNewest ? '🟢 ' : ''}
                                                            {time} - {size}KB - {snapshot.url.split('/').pop() || 'page'}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 auto' }}>
                                        <label style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>
                                            📝 Snapshot Preview (Read-only)
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
                                            💡 Instructions
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
                                        {isVisualizing ? '⏳ Generating...' : '🎨 Generate Image'}
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
