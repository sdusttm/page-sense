import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useContext } from 'react';
import { TrackerProvider, TrackerContext } from './TrackerProvider';

const TestComponent = ({ onContextReady }: { onContextReady?: (ctx: any) => void }) => {
    const context = useContext(TrackerContext);
    if (context && onContextReady) {
        onContextReady(context);
    }
    return (
        <div>
            <button id="my-button" data-agent-id="100">Click me</button>
            <input type="text" id="my-input" data-agent-id="101" />
            <select id="my-select" data-agent-id="102">
                <option value="opt1">Option 1</option>
                <option value="opt2">Option 2</option>
            </select>
            <div id="ai-page-sense-monitor-root">
                <button id="monitor-button">Monitor</button>
            </div>
            <div data-testid="thread-id">{context?.threadId}</div>
            <ul data-testid="events-list">
                {context?.events.map((e, i) => (
                    <li key={i}>{e.type}:{e.target}:{e.value || ''}</li>
                ))}
            </ul>
        </div>
    );
};

describe('TrackerProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        // Mock scrollIntoView
        window.HTMLElement.prototype.scrollIntoView = vi.fn();

        // Mock getBoundingClientRect
        window.HTMLElement.prototype.getBoundingClientRect = () => ({
            top: 10,
            left: 10,
            width: 100,
            height: 50,
            right: 110,
            bottom: 60,
            x: 10,
            y: 10,
            toJSON: () => { }
        });
    });

    afterEach(() => {
        // cleanup any potential fake timers if used locally
    });

    it('should render children and initialize thread ID ephemerally by default', () => {
        render(
            <TrackerProvider>
                <TestComponent />
            </TrackerProvider>
        );
        expect(screen.getByText('Click me')).toBeInTheDocument();
        const threadIdEl = screen.getByTestId('thread-id');
        expect(threadIdEl.textContent).toMatch(/^session_\d+_[a-z0-9]+$/);
    });

    it('should restore cross-page thread ID from localStorage if enabled', () => {
        localStorage.setItem('page-sense-thread-id', 'thread_123_abc');
        render(
            <TrackerProvider enableCrossPageTracking={true}>
                <TestComponent />
            </TrackerProvider>
        );
        const threadIdEl = screen.getByTestId('thread-id');
        expect(threadIdEl.textContent).toBe('thread_123_abc');
    });

    it('should track clicks and inputs', async () => {
        render(
            <TrackerProvider>
                <TestComponent />
            </TrackerProvider>
        );

        const btn = screen.getByText('Click me');
        fireEvent.click(btn);

        const input = screen.getByRole('textbox', { hidden: true });
        fireEvent.input(input, { target: { value: 'hello test' } });

        const list = screen.getByTestId('events-list');

        await waitFor(() => {
            // events are prepended
            expect(list.textContent).toContain('input:input:hello test');
            expect(list.textContent).toContain('click:button:');
        });
    });

    it('should ignore input on the AI monitor root', async () => {
        render(
            <TrackerProvider>
                <TestComponent />
            </TrackerProvider>
        );

        const monitorBtn = screen.getByText('Monitor');
        const root = document.getElementById('ai-page-sense-monitor-root') as HTMLElement;
        const monitorInput = document.createElement('input');
        root.appendChild(monitorInput);

        fireEvent.input(monitorInput, { target: { value: 'ignore me' } });

        const list = screen.getByTestId('events-list');
        expect(list.textContent).not.toContain('ignore me');
    });

    it('should track scrolls', async () => {
        render(
            <TrackerProvider>
                <TestComponent />
            </TrackerProvider>
        );

        fireEvent.scroll(window, { target: { scrollY: 100 } });

        // Wait 600ms in real time for the throttle
        await new Promise(r => setTimeout(r, 600));

        const list = screen.getByTestId('events-list');
        await waitFor(() => {
            expect(list.textContent).toContain('scroll::');
        });
    });

    it('should ignore clicks on the AI monitor root', async () => {
        render(
            <TrackerProvider>
                <TestComponent />
            </TrackerProvider>
        );

        const monitorBtn = screen.getByText('Monitor');
        fireEvent.click(monitorBtn);

        const list = screen.getByTestId('events-list');
        expect(list.textContent).not.toContain('click:button');
    });

    describe('executeAgentCommand', () => {
        it('should execute a click command', async () => {
            let context: any = null;
            render(
                <TrackerProvider>
                    <TestComponent onContextReady={(ctx) => context = ctx} />
                </TrackerProvider>
            );

            const btn = screen.getByText('Click me');
            const clickSpy = vi.spyOn(btn, 'click');

            await context.executeAgentCommand('click', '100');

            expect(clickSpy).toHaveBeenCalled();
        });

        it('should execute a type command and trigger React synthetic events', async () => {
            let context: any = null;
            render(
                <TrackerProvider>
                    <TestComponent onContextReady={(ctx) => context = ctx} />
                </TrackerProvider>
            );

            const input = document.getElementById('my-input') as HTMLInputElement;
            expect(input).toBeDefined();

            await context.executeAgentCommand('type', '101', 'auto typed text');

            expect(input.value).toBe('auto typed text');
        });

        it('should execute a select command', async () => {
            let context: any = null;
            render(
                <TrackerProvider>
                    <TestComponent onContextReady={(ctx) => context = ctx} />
                </TrackerProvider>
            );

            const select = document.getElementById('my-select') as HTMLSelectElement;

            await context.executeAgentCommand('select', '102', 'Option 2');

            expect(select.value).toBe('opt2');
            expect(select.options[1].selected).toBe(true);
        });

        it('should throw error if element is not found', async () => {
            let context: any = null;
            render(
                <TrackerProvider>
                    <TestComponent onContextReady={(ctx) => context = ctx} />
                </TrackerProvider>
            );

            await expect(context.executeAgentCommand('click', '999')).rejects.toThrow('Element not found after 5 attempts: 999');
        });
    });
});
