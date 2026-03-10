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
const CROSS_PAGE_TIMEOUT_MS = 60000; // 60 seconds max to resume (
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
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '3px', verticalAlign: '-1px'}}>
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
                    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', verticalAlign: '-2px'}}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"></path><path d="m14 7 3 3"></path><path d="M5 6v4"></path><path d="M19 14v4"></path><path d="M10 2v2"></path><path d="M7 8H3"></path><path d="M21 16h-4"></path><path d="M11 3H9"></path></svg> Draw Visualization
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
                                borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: 'transparent',
                                cursor: 'grab'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <h2 style={{ margin: 0, fontSize: '18px', userSelect: 'none' }}><span style={{display: 'flex', alignItems: 'center', gap: '8px'}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"></path><path d="m14 7 3 3"></path></svg> AI Map</span></h2>
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
                            <button onClick={() => setShowVisualizationModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
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
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px', verticalAlign: '-2px'}}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg> Snapshot History ({snapshotHistory.length})
                                                {hasNewSnapshot && (
                                                    <span style={{
                                                        fontSize: '10px',
                                                        padding: '2px 6px',
                                                        backgroundColor: '#10b981',
                                                        color: 'white',
                                                        borderRadius: '4px',
                                                        fontWeight: '600'
                                                    }}>
                                                        <span style={{display: 'inline-block', width: '6px', height: '6px', backgroundColor: 'white', borderRadius: '50%', marginRight: '4px'}}></span> Fresh
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
                                                            {isNewest ? <span style={{display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%', marginRight: '6px'}}></span> : null}
                                                            {time} - {size}KB - {snapshot.url.split('/').pop() || 'page'}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 auto' }}>
                                        <label style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px', verticalAlign: '-2px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Snapshot Preview (Read-only)
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
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px', verticalAlign: '-2px'}}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> Instructions
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
                                            <span style={{display: 'flex', alignItems: 'center'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', animation: 'spin 1.5s linear infinite'}}><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Generating...</span>
                                        ) : (
                                            <span style={{display: 'flex', alignItems: 'center'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"></path><path d="m14 7 3 3"></path><path d="M5 6v4"></path><path d="M19 14v4"></path><path d="M10 2v2"></path><path d="M7 8H3"></path><path d="M21 16h-4"></path><path d="M11 3H9"></path></svg> Generate Image</span>
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
