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

            // Build marker text with checkbox/radio state information
            let markerText = `[ID: ${id}] `;

            // Add checkbox/radio state for better AI understanding
            const role = currentNode.getAttribute('role');
            const tagName = currentNode.tagName.toLowerCase();
            const ariaChecked = currentNode.getAttribute('aria-checked');

            if (role === 'checkbox' || role === 'radio' || role === 'switch' ||
                (tagName === 'input' && (currentNode as HTMLInputElement).type === 'checkbox') ||
                (tagName === 'input' && (currentNode as HTMLInputElement).type === 'radio')) {

                // Determine checked state
                let isChecked = false;
                if (tagName === 'input') {
                    isChecked = (currentNode as HTMLInputElement).checked;
                } else if (ariaChecked !== null) {
                    isChecked = ariaChecked === 'true';
                }

                markerText = `[ID: ${id}${isChecked ? ' ✓' : ' ☐'}] `;
            }

            marker.textContent = markerText;
            // Make visible to markdown converter - use tiny font and color that blends in
            // Can't use opacity:0, left:-9999px, or display:none as markdown converter skips those!
            marker.style.cssText = 'font-size: 1px; color: transparent; pointer-events: none; user-select: none;';

            // Special handling for input elements (void elements that can't have children)
            // Insert marker into the parent label instead
            if (tagName === 'input' && currentNode.parentElement?.tagName.toLowerCase() === 'label') {
                currentNode.parentElement.insertBefore(marker, currentNode.parentElement.firstChild);
            } else {
                currentNode.insertBefore(marker, currentNode.firstChild);
            }

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

/**
 * Temporarily expands all dropdowns and shows their content for snapshot capture.
 * This is more aggressive than just showing hidden elements - it actually triggers
 * dropdowns to open so their content gets rendered into the DOM.
 *
 * Returns a restore function to revert the changes.
 */
export function temporarilyExpandDropdowns(): () => void {
    const expandedElements: Array<{
        element: HTMLElement;
        originalAriaExpanded: string | null;
        originalAriaHidden: string | null;
        wasClicked: boolean;
    }> = [];

    // Find dropdown triggers that might have hidden content
    const dropdownTriggers = document.querySelectorAll<HTMLElement>([
        '[aria-haspopup="menu"]',
        '[aria-haspopup="listbox"]',
        '[aria-haspopup="true"]',
        '[aria-expanded="false"]',
        'button[class*="dropdown"]',
        'button[class*="select"]',
        '[role="button"][class*="filter"]',
        '[class*="dropdown"][role="button"]'
    ].join(','));

    console.log(`[Annotator] Found ${dropdownTriggers.length} potential dropdown triggers`);

    dropdownTriggers.forEach((trigger) => {
        const ariaExpanded = trigger.getAttribute('aria-expanded');
        const ariaHidden = trigger.getAttribute('aria-hidden');

        // If dropdown is currently collapsed, expand it
        if (ariaExpanded === 'false' || ariaExpanded === null) {
            console.log(`[Annotator] Expanding dropdown:`, trigger.textContent?.trim());

            expandedElements.push({
                element: trigger,
                originalAriaExpanded: ariaExpanded,
                originalAriaHidden: ariaHidden,
                wasClicked: false
            });

            // Try to expand it via aria-expanded attribute
            trigger.setAttribute('aria-expanded', 'true');

            // Some dropdowns also need their associated menu to be shown
            const menuId = trigger.getAttribute('aria-controls');
            if (menuId) {
                const menu = document.getElementById(menuId);
                if (menu) {
                    const menuHidden = menu.getAttribute('aria-hidden');
                    if (menuHidden === 'true') {
                        menu.setAttribute('aria-hidden', 'false');
                        console.log(`[Annotator] Showed menu:`, menuId);
                    }
                }
            }
        }
    });

    console.log(`[Annotator] Expanded ${expandedElements.length} dropdowns`);

    // Return restore function
    return () => {
        expandedElements.forEach(({ element, originalAriaExpanded, originalAriaHidden }) => {
            if (originalAriaExpanded !== null) {
                element.setAttribute('aria-expanded', originalAriaExpanded);
            } else {
                element.removeAttribute('aria-expanded');
            }

            if (originalAriaHidden !== null) {
                element.setAttribute('aria-hidden', originalAriaHidden);
            }

            // Restore associated menus
            const menuId = element.getAttribute('aria-controls');
            if (menuId) {
                const menu = document.getElementById(menuId);
                if (menu) {
                    menu.setAttribute('aria-hidden', 'true');
                }
            }
        });
        console.log(`[Annotator] Collapsed ${expandedElements.length} dropdowns`);
    };
}

/**
 * Temporarily makes hidden dropdown/menu items visible for snapshot capture.
 * Returns a restore function to revert the changes.
 *
 * This ensures that unchecked checkboxes, hidden menu items, and collapsed
 * dropdown options are captured in the snapshot for the AI to see.
 */
export function temporarilyShowHiddenElements(): () => void {
    const modifiedElements: Array<{ element: HTMLElement; originalDisplay: string; originalVisibility: string; originalOpacity: string }> = [];
    const processedElements = new Set<HTMLElement>(); // Avoid duplicates

    // STEP 1: Find all checkboxes first, then check their parents
    const allCheckboxes = document.querySelectorAll<HTMLElement>('input[type="checkbox"]');

    allCheckboxes.forEach((checkbox) => {
        // Walk up the DOM tree from each checkbox
        let current: HTMLElement | null = checkbox;

        while (current) {
            if (processedElements.has(current)) {
                break; // Already processed this element
            }

            const computed = window.getComputedStyle(current);
            const isHidden = computed.display === 'none' ||
                computed.visibility === 'hidden' ||
                parseFloat(computed.opacity) < 0.1 ||
                computed.height === '0px' ||
                computed.maxHeight === '0px';

            if (isHidden) {
                processedElements.add(current);
                modifiedElements.push({
                    element: current,
                    originalDisplay: computed.display,
                    originalVisibility: computed.visibility,
                    originalOpacity: computed.opacity
                });

                // Make visible but off-screen to avoid UI flicker
                current.style.setProperty('display', 'block', 'important');
                current.style.setProperty('visibility', 'visible', 'important');
                current.style.setProperty('opacity', '1', 'important');
                current.style.setProperty('max-height', 'none', 'important');
                current.style.setProperty('height', 'auto', 'important');
                current.style.setProperty('position', 'absolute', 'important');
                current.style.setProperty('left', '-9999px', 'important');
                current.style.setProperty('z-index', '-9999', 'important');
            }

            current = current.parentElement;
        }
    });

    // STEP 2: Also find other interactive elements that might be hidden
    const potentiallyHidden = document.querySelectorAll<HTMLElement>([
        '[role="menu"]',
        '[role="listbox"]',
        '[role="menuitem"]',
        '[role="option"]',
        '[role="checkbox"]',
        '[aria-hidden="true"]',
        '[data-testid*="multiselect"]',
        '[data-testid*="dropdown"]',
        '[data-testid*="menu"]',
        '.dropdown-menu',
        '.menu',
        '[class*="dropdown"]',
        '[class*="menu"]',
        '[class*="select"]',
        'input[type="radio"]'
    ].join(','));

    potentiallyHidden.forEach((element) => {
        if (processedElements.has(element)) {
            return; // Already processed
        }

        const computed = window.getComputedStyle(element);
        const isHidden = computed.display === 'none' ||
            computed.visibility === 'hidden' ||
            parseFloat(computed.opacity) < 0.1 ||
            computed.height === '0px' ||
            computed.maxHeight === '0px';

        if (isHidden) {
            processedElements.add(element);
            modifiedElements.push({
                element,
                originalDisplay: computed.display,
                originalVisibility: computed.visibility,
                originalOpacity: computed.opacity
            });

            // Temporarily make visible (but keep it off-screen to avoid UI flicker)
            element.style.setProperty('display', 'block', 'important');
            element.style.setProperty('visibility', 'visible', 'important');
            element.style.setProperty('opacity', '1', 'important');
            element.style.setProperty('max-height', 'none', 'important');
            element.style.setProperty('height', 'auto', 'important');
            element.style.setProperty('position', 'absolute', 'important');
            element.style.setProperty('left', '-9999px', 'important');
            element.style.setProperty('z-index', '-9999', 'important');
        }
    });

    console.log(`[Annotator] Temporarily revealed ${modifiedElements.length} hidden elements for snapshot`);

    // Return restore function
    return () => {
        modifiedElements.forEach(({ element, originalDisplay, originalVisibility, originalOpacity }) => {
            element.style.display = originalDisplay;
            element.style.visibility = originalVisibility;
            element.style.opacity = originalOpacity;
            element.style.removeProperty('max-height');
            element.style.removeProperty('height');
            element.style.removeProperty('position');
            element.style.removeProperty('left');
            element.style.removeProperty('z-index');
        });
        console.log(`[Annotator] Restored ${modifiedElements.length} elements to original state`);
    };
}
