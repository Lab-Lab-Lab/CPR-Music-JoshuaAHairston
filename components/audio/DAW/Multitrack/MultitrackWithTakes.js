// components/audio/DAW/Multitrack/MultitrackWithTakes.js
'use client';

import { useRecording } from '../../../../contexts/DAWProvider';
import MultitrackEditor from './MultitrackEditor';

/**
 * Wrapper component that connects the RecordingContext takes
 * to the MultitrackEditor
 */
export default function MultitrackWithTakes({ logOperation = null, sampleTakes = [] }) {
  const { blobInfo } = useRecording();

  console.log('🎵 MultitrackWithTakes: Raw blobInfo:', blobInfo);

  // Transform blobInfo to the format expected by TakesImportModal
  const recordingTakes = blobInfo.map((take, index) => ({
    id: `take-${take.take}-${index}`, // Use more unique ID to avoid React key conflicts
    name: take.takeName || `Take ${take.take}`,
    partType: 'recording',
    takeNumber: take.take,
    duration: 0, // Could calculate from blob if needed
    createdAt: take.timeStr,
    audioURL: take.url,
    mimeType: take.mimeType,
    originalData: take.data,
  }));

  // Combine sample takes (e.g. bassline) with recording takes
  const allTakes = [...sampleTakes, ...recordingTakes];

  console.log('🎵 MultitrackWithTakes: Transformed takes:', allTakes);

  return <MultitrackEditor availableTakes={allTakes} logOperation={logOperation} />;
}
