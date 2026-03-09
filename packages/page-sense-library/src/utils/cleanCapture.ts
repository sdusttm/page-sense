/**
 * Utility functions for capturing clean DOM snapshots without library UI elements
 */

/**
 * Removes library UI elements from the DOM before snapshot capture
 * Returns a map of removed elements so they can be restored
 */
export const removeLibraryElements = (): Map<string, Element> => {
    const removed = new Map<string, Element>();

    // Remove AI Monitor root (includes button and panel)
    const monitorRoot = document.getElementById('ai-page-sense-monitor-root');
    if (monitorRoot && monitorRoot.parentNode) {
        removed.set('monitor', monitorRoot);
        monitorRoot.parentNode.removeChild(monitorRoot);
    }

    // Remove any visualization modals
    const visualModals = document.querySelectorAll('[data-page-sense-modal]');
    visualModals.forEach((modal, index) => {
        if (modal.parentNode) {
            removed.set(`modal-${index}`, modal);
            modal.parentNode.removeChild(modal);
        }
    });

    return removed;
};

/**
 * Restores library UI elements after snapshot capture
 */
export const restoreLibraryElements = (removed: Map<string, Element>): void => {
    removed.forEach((element) => {
        document.body.appendChild(element);
    });
};
