import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTracker } from './useTracker';
import { TrackerContext } from './TrackerProvider';
import React from 'react';

describe('useTracker', () => {
    it('should throw Error when used outside of TrackerProvider', () => {
        // Prevent console.error from polluting test logs
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => renderHook(() => useTracker())).toThrow('useTracker must be used within a TrackerProvider');
        spy.mockRestore();
    });

    it('should return context when used inside TrackerProvider', () => {
        const mockContextValue: any = { events: [], isPaused: false };
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <TrackerContext.Provider value={mockContextValue}>
                {children}
            </TrackerContext.Provider>
        );

        const { result } = renderHook(() => useTracker(), { wrapper });
        expect(result.current).toBe(mockContextValue);
    });
});
