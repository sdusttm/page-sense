"use client";
import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';

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
    executeAgentCommand: (action: 'click' | 'type', agentId: string, value?: string) => Promise<void>;
    apiUrl: string;
    apiKey?: string;
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

export const TrackerProvider: React.FC<{ children: ReactNode; maxEvents?: number; apiUrl?: string; apiKey?: string }> = ({ children, maxEvents = 100, apiUrl = '/api', apiKey }) => {
    const [events, setEvents] = useState<InteractionEvent[]>([]);
    const [isPaused, setIsPaused] = useState(false);

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

    const executeAgentCommand = useCallback(async (action: 'click' | 'type', agentId: string, value?: string) => {
        const element = document.querySelector(`[data-agent-id="${agentId}"]`);
        if (!element) {
            console.warn(`Agent attempted to interact with non-existent element with agent_id: ${agentId}`);
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
            inputElement.value = value;
            // Dispatch input and change events to trigger React or vanilla JS listeners
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
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

            let snapshot = undefined;
            try {
                // Capture a lightweight markdown snapshot of the body
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
        <TrackerContext.Provider value={{ events, isPaused, setIsPaused, executeAgentCommand, apiUrl, apiKey }}>
            {children}
        </TrackerContext.Provider>
    );
};
