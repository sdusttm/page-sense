"use client";

import { TrackerProvider } from 'page-sense-library';

export function Providers({ children }: { children: any }) {
    return <TrackerProvider apiUrl="http://localhost:3001/api" apiKey="sk-ps-8ci5a1ghguda5uko66lrv9ox">{children}</TrackerProvider>;
}
