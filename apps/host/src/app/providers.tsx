"use client";

import { TrackerProvider } from 'page-sense-library';

export function Providers({ children }: { children: React.ReactNode }) {
    return <TrackerProvider>{children}</TrackerProvider>;
}
