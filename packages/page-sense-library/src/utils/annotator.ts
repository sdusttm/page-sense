/**
 * Evaluates if an element is considered interactive.
 */
function isInteractive(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();

    // Standard interactive tags
    if (['button', 'a', 'input', 'select', 'textarea'].includes(tagName)) {
        return true;
    }

    // Roles that indicate interactivity
    const role = element.getAttribute('role');
    if (role && ['button', 'link', 'checkbox', 'menuitem', 'option', 'radio', 'switch', 'tab'].includes(role)) {
        return true;
    }

    // Tabindex explicitly set to 0 or higher
    if (element.hasAttribute('tabindex')) {
        const tabIndex = parseInt(element.getAttribute('tabindex') || '-1', 10);
        if (tabIndex >= 0) {
            return true;
        }
    }

    // Click handler presence is hard to guess purely from DOM, but let's assume standard semantic tags for now.
    return false;
}

/**
 * Traverses the DOM tree under the given root and injects `data-agent-id` into all interactive elements.
 * Returns the maximum ID assigned.
 */
export function annotateInteractiveElements(root: Element = document.body): number {
    let counter = 1;

    // Create a TreeWalker to efficiently traverse all element nodes
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        {
            acceptNode: (node: Node) => {
                if (node instanceof Element) {
                    // Skip the AI Monitor itself to prevent the agent from trying to interact with our UI
                    if (node.id === 'ai-page-sense-monitor-root') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (isInteractive(node)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
                return NodeFilter.FILTER_SKIP;
            }
        }
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
        if (currentNode instanceof Element) {
            const id = counter.toString();
            currentNode.setAttribute('data-agent-id', id);

            // Inject a physical text node so the Markdown converter sees the ID
            const marker = document.createElement('span');
            marker.className = 'page-sense-agent-marker';
            marker.textContent = `[ID: ${id}] `;
            // Hide it visually from the human user (though snapshot is fast enough they usually won't see it anyway)
            marker.style.cssText = 'position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0; overflow: hidden;';
            currentNode.insertBefore(marker, currentNode.firstChild);

            counter++;
        }
        currentNode = walker.nextNode();
    }

    return counter - 1; // Return the number of annotated elements
}

/**
 * Removes `data-agent-id` attributes from all elements within the root.
 */
export function clearAnnotations(root: Element = document.body): void {
    const elements = root.querySelectorAll('[data-agent-id]');
    elements.forEach((el) => {
        el.removeAttribute('data-agent-id');
    });
}

/**
 * Removes only the injected text nodes, leaving the `data-agent-id` attribute intact for execution.
 */
export function clearVisualAnnotations(root: Element = document.body): void {
    const markers = root.querySelectorAll('.page-sense-agent-marker');
    markers.forEach((marker) => marker.remove());
}
