import { describe, it, expect, beforeEach } from 'vitest';
import { removeLibraryElements, restoreLibraryElements } from './cleanCapture';

describe('cleanCapture', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should remove and restore library UI elements', () => {
        // Setup initial DOM
        document.body.innerHTML = `
            <div id="ai-page-sense-monitor-root">Monitor</div>
            <div data-page-sense-modal="true">Modal 1</div>
            <div data-page-sense-modal="true">Modal 2</div>
            <main>Actual content</main>
        `;

        // Action 1: Remove
        const removed = removeLibraryElements();

        // Assertions after remove
        expect(removed.size).toBe(3); // monitor + 2 modals
        expect(document.getElementById('ai-page-sense-monitor-root')).toBeNull();
        expect(document.querySelectorAll('[data-page-sense-modal]').length).toBe(0);
        expect(document.querySelector('main')?.textContent).toBe('Actual content'); // Still there

        // Action 2: Restore
        restoreLibraryElements(removed);

        // Assertions after restore
        expect(document.getElementById('ai-page-sense-monitor-root')).not.toBeNull();
        expect(document.querySelectorAll('[data-page-sense-modal]').length).toBe(2);
    });

    it('should handle calling remove when no elements exist', () => {
        document.body.innerHTML = '<main>Just content</main>';
        const removed = removeLibraryElements();
        expect(removed.size).toBe(0);
        expect(document.querySelector('main')?.textContent).toBe('Just content');
    });
});
