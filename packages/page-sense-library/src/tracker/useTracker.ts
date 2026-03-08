import { useContext } from 'react';
import { TrackerContext, TrackerContextType } from './TrackerProvider';

export const useTracker = (): TrackerContextType => {
    const context = useContext(TrackerContext);
    if (!context) {
        throw new Error('useTracker must be used within a TrackerProvider');
    }
    return context;
};
