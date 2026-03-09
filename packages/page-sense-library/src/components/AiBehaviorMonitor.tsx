"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useTracker } from '../tracker/useTracker';
import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import { annotateInteractiveElements, clearAnnotations, clearVisualAnnotations } from '../utils/annotator';
import { VERSION, BUILD_TIME } from '../version';

const AgentInstructionForm = React.memo(({ executeAgentCommand, apiUrl, apiKey }: { executeAgentCommand: (action: 'click' | 'type', agentId: string, value?: string) => Promise<void>, apiUrl: string, apiKey?: string }) => {
    const [instruction, setInstruction] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [executionError, setExecutionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleExecuteInstruction = async () => {
        if (!instruction.trim()) return;

        setIsExecuting(true);
        setExecutionError(null);
        setSuccessMessage(null);

        try {
            // Wait briefly for any pending DOM updates or async content to load
            // This ensures we capture the most up-to-date page state
            await new Promise(resolve => setTimeout(resolve, 300));

            // 1. Annotate DOM
            annotateInteractiveElements(document.body);

            // 2. Capture Snapshot
            const snapshot = convertHtmlToMarkdown(document.body.outerHTML);

            // 3. Immediately clean up VISUAL text nodes so user doesn't see them during network request
            clearVisualAnnotations(document.body);

            // 4. Send instruction to LLM Agent API
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const res = await fetch(`${apiUrl.replace(/\/$/, '')}/agent`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ instruction, snapshot })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to execute instruction');

            // 5. Execute commands returned by LLM
            let successCount = 0;
            if (data.commands && Array.isArray(data.commands)) {
                for (const cmd of data.commands) {
                    if (cmd.action && cmd.agent_id) {
                        try {
                            await executeAgentCommand(cmd.action, cmd.agent_id, cmd.value);
                            successCount++;

                            // Longer delay after clicks (likely to trigger UI changes like opening modals, dropdowns, etc.)
                            // Shorter delay after typing (usually doesn't change UI structure)
                            const isUIChangingAction = cmd.action === 'click';
                            const delay = isUIChangingAction ? 1500 : 500;
                            await new Promise(r => setTimeout(r, delay));
                        } catch (err: any) {
                            throw new Error(`Failed to execute command on element. It might not be visible or available. Details: ${err.message}`);
                        }
                    }
                }
            }

            setInstruction(''); // clear input on success!
            if (successCount > 0) {
                setSuccessMessage(`✅ Successfully executed ${successCount} action${successCount > 1 ? 's' : ''}`);
                setTimeout(() => setSuccessMessage(null), 4000);
            }
        } catch (err: any) {
            setExecutionError(err.message || 'An error occurred');
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
                <div style={{ color: 'green', fontSize: '10px', marginBottom: '8px', padding: '4px', backgroundColor: '#efe', borderRadius: '4px' }}>
                    {successMessage}
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

export const AiBehaviorMonitor: React.FC = () => {
    const { events, isPaused, setIsPaused, executeAgentCommand, apiUrl, apiKey } = useTracker();
    const [isOpen, setIsOpen] = useState(false);

    // AI Visualization state
    const [isVisualizing, setIsVisualizing] = useState(false);
    const [visualizedHtml, setVisualizedHtml] = useState<string | null>(null);
    const [visualizationError, setVisualizationError] = useState<string | null>(null);
    const [showVisualizationModal, setShowVisualizationModal] = useState(false);
    const [currentSnapshot, setCurrentSnapshot] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'result' | 'prompt'>('result');



    // Draggable Modal State
    const [position, setPosition] = useState({ x: 50, y: 50 }); // Default top 50px, left 50px
    const isDraggingRef = useRef(false);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

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

    const handleVisualize = async () => {
        // Always capture a FRESH snapshot of current page state
        // This ensures we capture dynamically loaded content
        let snapshot = null;
        try {
            snapshot = convertHtmlToMarkdown(document.body.outerHTML);
        } catch (err) {
            console.error("Failed to capture snapshot for visualization:", err);
            setVisualizationError("Failed to capture page snapshot. Please try again.");
            setShowVisualizationModal(true);
            return;
        }

        if (!snapshot) {
            setVisualizationError("Failed to capture page snapshot. Please try again.");
            setShowVisualizationModal(true);
            return;
        }

        setCurrentSnapshot(snapshot);
        setIsVisualizing(true);
        setVisualizationError(null);
        setShowVisualizationModal(true);
        setVisualizedHtml(null);
        setActiveTab('result'); // Default to result tab

        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const res = await fetch(`${apiUrl.replace(/\/$/, '')}/visualize`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ snapshot })
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
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111' }}>🧠 AI Behavior Intake</h3>
                    <span style={{
                        fontSize: '9px',
                        color: '#10b981',
                        fontWeight: '600',
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px'
                    }} title={`Built: ${BUILD_TIME}`}>
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
            <AgentInstructionForm executeAgentCommand={executeAgentCommand} apiUrl={apiUrl} apiKey={apiKey} />

            <div style={{ padding: '12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <button
                        onClick={handleVisualize}
                        disabled={isVisualizing}
                        style={{
                            fontSize: '12px',
                            padding: '6px 12px',
                            backgroundColor: isVisualizing ? '#ccc' : '#0070f3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isVisualizing ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold',
                            width: '100%'
                        }}
                    >
                        {isVisualizing ? '✨ Drawing...' : '✨ Draw AI Visualization'}
                    </button>
                </div>

                {showVisualizationModal && (
                    <div style={{
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
                                <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                                    <div style={{ backgroundColor: '#2d2d2d', color: '#f8f8f2', padding: '16px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', minHeight: '100%' }}>
                                        {currentSnapshot ? currentSnapshot : "No snapshot feed generated."}
                                    </div>
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
