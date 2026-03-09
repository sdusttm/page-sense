// Version info - Update BUILD_TIME when making changes to verify updates in UI
// The version number will show in green at top of AI Monitor panel

export const VERSION = '0.2.14';
export const BUILD_TIME = '2026-03-09T09:36:00Z'; // Latest stable build
export const FEATURES = [
    'Event Tracking',
    'AI Monitor',
    'DOM Visualization',
    'Sequential Action Execution', // NEW in 0.2.0
    'Cross-Page Action Support', // NEW in 0.2.2
    'Checkbox State Detection', // NEW in 0.2.5
    'Dropdown Auto-Expansion', // NEW in 0.2.5
    'Hidden Element Discovery', // NEW in 0.2.5
    'Dynamic UI Retry Logic',
    'Adaptive Delays',
    'Cross-Page Tracking',
    'Conversation Persistence'
] as const;
