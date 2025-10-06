// src/components/VideoTile.tsx
import React, { useEffect, useRef } from 'react';

type Props = {
  id: string;
  name: string;
  stream?: MediaStream | null;
  isSelf?: boolean;
};

const VideoTile: React.FC<Props> = ({ id, name, stream, isSelf }) => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const ms = stream ?? null;

    // Préfère srcObject (standard), fallback createObjectURL si nécessaire
    try {
      (video as any).srcObject = ms;
    } catch {
      if (ms) {
        // très vieux navigateurs
        video.src = URL.createObjectURL(ms as any);
      } else {
        video.removeAttribute('src');
        video.load();
      }
    }

    if (ms) {
      // éviter l'erreur non bloquante des navigateurs
      video.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div className="rounded-lg border border-cyan-500/40 p-1 relative overflow-hidden bg-black/40">
      <video
        ref={ref}
        muted={isSelf}
        playsInline
        autoPlay
        className="w-full h-40 object-cover rounded-md"
      />
      <div className="absolute bottom-1 left-1 text-xs px-2 py-0.5 rounded bg-black/60 text-cyan-300">
        {name || id}{isSelf ? ' (you)' : ''}
      </div>
    </div>
  );
};

export default VideoTile;
