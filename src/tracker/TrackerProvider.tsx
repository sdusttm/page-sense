"use client";
import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { convertHtmlToMarkdown } from '../utils/dom-to-semantic-markdown';
import { syncStateToAttributes } from '../utils/annotator';

export type InteractionEvent = {
    id: string;
    type: 'click' | 'scroll' | 'input';
    x?: number;
    y?: number;
    target?: string;
    value?: string;
    timestamp: number;

    // Semantic Context
    path?: string;
    innerText?: string;
    role?: string | null;
    ariaLabel?: string | null;

    // DOM Snapshot
    snapshot?: string;
};

export type TrackerContextType = {
    events: InteractionEvent[];
    isPaused: boolean;
    setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
    executeAgentCommand: (action: 'click' | 'type' | 'select', agentId: string, value?: string) => Promise<void>;
    apiUrl: string;
    apiKey?: string;
    visitorId?: string;
    threadId: string;
};

export const TrackerContext = createContext<TrackerContextType | null>(null);

const getElementPath = (element: Element | null): string => {
    if (!element) return '';
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.nodeName.toLowerCase();
        if (current.id) {
            selector += `#${current.id}`;
            path.unshift(selector);
            break;
        } else {
            let sibling = current.previousElementSibling;
            let index = 1;
            while (sibling) {
                if (sibling.nodeName.toLowerCase() === current.nodeName.toLowerCase()) {
                    index++;
                }
                sibling = sibling.previousElementSibling;
            }
            if (index > 1) {
                selector += `:nth-of-type(${index})`;
            }
        }
        path.unshift(selector);
        current = current.parentElement;
    }
    return path.join(' > ');
};

const extractSemanticData = (element: Element | null) => {
    if (!element) return {};

    const htmlElement = element as HTMLElement;
    return {
        innerText: htmlElement.innerText ? htmlElement.innerText.substring(0, 100) : undefined,
        role: element.getAttribute('role'),
        ariaLabel: element.getAttribute('aria-label') || element.getAttribute('alt'),
    };
};

export const TrackerProvider: React.FC<{
    children: ReactNode;
    maxEvents?: number;
    apiUrl?: string;
    apiKey?: string;
    visitorId?: string;
    enableCrossPageTracking?: boolean;
}> = ({ children, maxEvents = 100, apiUrl = '/api', apiKey, visitorId, enableCrossPageTracking = false }) => {
    const [events, setEvents] = useState<InteractionEvent[]>([]);
    const [isPaused, setIsPaused] = useState(false);
    const [threadId, setThreadId] = useState<string>('');

    // Initialize or restore thread ID from localStorage
    useEffect(() => {
        if (enableCrossPageTracking) {
            const storageKey = 'page-sense-thread-id';
            let storedThreadId = localStorage.getItem(storageKey);

            if (!storedThreadId) {
                storedThreadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                localStorage.setItem(storageKey, storedThreadId);
                console.log('[PageSense] Created new thread:', storedThreadId);
            } else {
                console.log('[PageSense] Resumed thread:', storedThreadId);
            }

            setThreadId(storedThreadId);
        } else {
            // Non-persistent mode: create ephemeral thread ID
            setThreadId(`session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
        }
    }, [enableCrossPageTracking]);

    const addEvent = useCallback((event: Omit<InteractionEvent, 'id' | 'timestamp'>) => {
        setEvents((prev) => {
            const newEvent: InteractionEvent = {
                ...event,
                id: Math.random().toString(36).substring(2, 9),
                timestamp: Date.now(),
            };
            const updated = [newEvent, ...prev];
            return updated.slice(0, maxEvents);
        });
    }, [maxEvents]);

    const executeAgentCommand = useCallback(async (action: 'click' | 'type' | 'select', agentId: string, value?: string) => {
        // Retry with exponential backoff to find dynamically loaded elements
        let element: Element | null = null;
        let attempts = 0;
        const maxAttempts = 5;

        while (!element && attempts < maxAttempts) {
            element = document.querySelector(`[data-agent-id="${agentId}"]`);

            if (!element) {
                if (attempts < maxAttempts - 1) {
                    // Exponential backoff: 100ms, 200ms, 400ms, 800ms
                    const delay = Math.min(100 * Math.pow(2, attempts), 1000);
                    console.log(`[Agent] Element ${agentId} not found, retrying in ${delay}ms (attempt ${attempts + 1}/${maxAttempts})`);
                    await new Promise(r => setTimeout(r, delay));
                    attempts++;
                } else {
                    console.warn(`Agent attempted to interact with non-existent element with agent_id: ${agentId}`);
                    throw new Error(`Element not found after ${maxAttempts} attempts: ${agentId}`);
                }
            }
        }

        if (!element) {
            throw new Error(`Element not found: ${agentId}`);
        }

        // Ensure the element is visible in the viewport before highlighting
        element.scrollIntoView({ behavior: 'instant', block: 'center' });

        // Wait a tiny bit for the scroll to finish, then get the new rect
        await new Promise(r => setTimeout(r, 50));
        const rect = element.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.style.position = 'fixed'; // Use fixed to bypass any scroll context issues
        highlight.style.top = `${rect.top - 4}px`;
        highlight.style.left = `${rect.left - 4}px`;
        highlight.style.width = `${rect.width + 8}px`;
        highlight.style.height = `${rect.height + 8}px`;
        highlight.style.border = '4px solid #22c55e'; // Green-500
        highlight.style.backgroundColor = 'rgba(34, 197, 94, 0.2)'; // Semi-transparent green
        highlight.style.borderRadius = '6px';
        highlight.style.pointerEvents = 'none';
        highlight.style.zIndex = '2147483647'; // Max integer z-index
        highlight.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.6)';
        highlight.style.transition = 'all 0.3s ease-out';

        document.body.appendChild(highlight);

        // Force a reflow so the browser actually paints the highlight immediately
        highlight.getBoundingClientRect();

        // Brief delay so the user sees what is about to be clicked, wrapped in a setTimeout 
        // to yield to the browser's rendering thread so it actually draws the div
        await new Promise(r => {
            requestAnimationFrame(() => {
                setTimeout(r, 500); // Wait 500ms for the user to see the highlight
            });
        });

        // Execute action
        if (action === 'click') {
            (element as HTMLElement).click();
        } else if (action === 'type' && value !== undefined) {
            const inputElement = element as HTMLInputElement | HTMLTextAreaElement;

            // React 16+ overrides the default native value setter. 
            // If we just do `inputElement.value = value`, React won't register the change.
            // We must bypass React's setter to trigger an actual synthetic onChange event.
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            )?.set;
            const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
            )?.set;

            const tagName = inputElement.tagName.toLowerCase();
            if (tagName === 'textarea' && nativeTextAreaValueSetter) {
                nativeTextAreaValueSetter.call(inputElement, value);
            } else if (tagName === 'input' && nativeInputValueSetter) {
                nativeInputValueSetter.call(inputElement, value);
            } else {
                // If LLM hallucinates 'type' on a select or other tag
                inputElement.value = value;
            }

            // Dispatch input and change events to trigger React or vanilla JS listeners
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (action === 'select' && value !== undefined) {
            if (element.tagName.toLowerCase() === 'select') {
                const selectElement = element as HTMLSelectElement;

                // Try to find an option whose text or value exactly matches the LLM's requested value
                let optionToSelect = Array.from(selectElement.options).find(opt =>
                    opt.text.trim() === value.trim() || opt.value === value.trim()
                );

                // Fallback to case-insensitive partial match if exact match fails
                if (!optionToSelect) {
                    const lowerValue = value.toLowerCase().trim();
                    optionToSelect = Array.from(selectElement.options).find(opt =>
                        opt.text.toLowerCase().includes(lowerValue) || opt.value.toLowerCase() === lowerValue
                    );
                }

                if (optionToSelect) {
                    // Set the option selected state directly (most reliable for vanilla DOM)
                    optionToSelect.selected = true;

                    // Also invoke the native select value setter to bypass React's wrapper
                    const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLSelectElement.prototype,
                        'value'
                    )?.set;

                    if (nativeSelectValueSetter) {
                        nativeSelectValueSetter.call(selectElement, optionToSelect.value);
                    } else {
                        selectElement.value = optionToSelect.value;
                    }

                    console.log(`[PageSense] Selected option: "${optionToSelect.text}" (${optionToSelect.value})`);

                    // Dispatch both input and change events to trigger React's synthetic event system
                    // We must artificially inject the new value into the Event object because React 16+ tracks it
                    const inputEvent = new Event('input', { bubbles: true });
                    const changeEvent = new Event('change', { bubbles: true });

                    selectElement.dispatchEvent(inputEvent);
                    selectElement.dispatchEvent(changeEvent);
                } else {
                    console.warn(`[PageSense] Failed to find requested option "${value}" inside <select data-agent-id="${agentId}">`);
                }
            } else {
                // If the LLM tries to "select" on a non-select element (like a custom dropdown button),
                // just gracefully execute a click instead to toggle it.
                console.log(`[PageSense] Element <${element.tagName.toLowerCase()}> is not a native select. Falling back to simple click for 'select' command.`);
                (element as HTMLElement).click();
            }
        }

        // Fade out highlight
        highlight.style.opacity = '0';
        highlight.style.transform = 'scale(1.1)';
        setTimeout(() => {
            if (highlight.parentNode) {
                document.body.removeChild(highlight);
            }
        }, 300);

    }, []);

    useEffect(() => {
        let lastScroll = 0;

        const handleClick = (e: MouseEvent) => {
            if (isPaused) return;
            const target = e.target as HTMLElement;

            // Don't track clicks on the AI Monitor itself
            if (target.closest('#ai-page-sense-monitor-root')) {
                return;
            }

            let snapshot = undefined;
            try {
                syncStateToAttributes();

                // Capture a lightweight markdown snapshot of the body
                // Note: This may include library UI, but that's OK for event tracking
                // since these snapshots are truncated and just for debugging context
                snapshot = convertHtmlToMarkdown(document.body.outerHTML);
                // limit snapshot size just in case, though LLMs can handle a lot, we don't want to crash the browser UI
                if (snapshot && snapshot.length > 5000) {
                    snapshot = snapshot.substring(0, 5000) + '... [truncated]';
                }
            } catch (err) {
                console.warn("Failed to capture semantic markdown snapshot", err);
            }

            addEvent({
                type: 'click',
                x: e.clientX,
                y: e.clientY,
                target: target?.tagName?.toLowerCase() || 'unknown',
                path: getElementPath(target),
                ...extractSemanticData(target),
                snapshot
            });

            // ==========================================
            // 📡 HUMAN TELEMETRY SYNC
            // ==========================================
            if (apiKey) {
                const preClickHtml = document.body.outerHTML;
                const preClickSnapshot = convertHtmlToMarkdown(preClickHtml);
                const tag_name = target?.tagName?.toLowerCase() || 'unknown';
                const text_content = (target?.textContent || '').substring(0, 100).trim();
                const aria_signatures = Array.from(target.attributes || [])
                    .filter(attr => attr.name.startsWith('aria-') || attr.name === 'role')
                    .map(attr => `${attr.name}=${attr.value}`)
                    .join(';');

                // Wait for any UI mutations (dropdowns opening, modals, etc.)
                setTimeout(async () => {
                    try {
                        syncStateToAttributes();
                        const postClickHtml = document.body.outerHTML;
                        const postClickSnapshot = convertHtmlToMarkdown(postClickHtml);

                        // Only ping DB if the UI actually structurally changed
                        if (preClickSnapshot !== postClickSnapshot) {
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
                                    action_type: 'click',
                                    diff_payload: postClickSnapshot, // The resultant DOM structure
                                    status: 'SUCCESS'
                                })
                            });
                            console.log('[PageSense] 📡 Human Telemetry Diff Synced');
                        }
                    } catch (err) {
                        console.warn('[PageSense] Failed to sync human telemetry:', err);
                    }
                }, 1000); // Wait 1s for NextJS renders
            }
        };

        const handleScroll = () => {
            if (isPaused) return;
            const now = Date.now();
            if (now - lastScroll > 500) {
                lastScroll = now;
                addEvent({
                    type: 'scroll',
                    y: window.scrollY,
                });
            }
        };

        const handleInput = (e: Event) => {
            if (isPaused) return;
            const target = e.target as HTMLInputElement;

            // Don't track input on the AI Monitor itself
            if (target.closest('#ai-page-sense-monitor-root')) {
                return;
            }

            addEvent({
                type: 'input',
                target: target.tagName?.toLowerCase() || 'unknown',
                value: target.type === 'password' ? '***' : target.value,
                path: getElementPath(target),
                ...extractSemanticData(target),
            });
        };

        window.addEventListener('click', handleClick);
        window.addEventListener('scroll', handleScroll);
        window.addEventListener('input', handleInput, true);

        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('input', handleInput, true);
        };
    }, [addEvent, isPaused]);

    return (
        <TrackerContext.Provider value={{ events, isPaused, setIsPaused, executeAgentCommand, apiUrl, apiKey, visitorId, threadId }}>
            {children}
        </TrackerContext.Provider>
    );
};
