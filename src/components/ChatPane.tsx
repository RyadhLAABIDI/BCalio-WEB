// src/components/ChatPane.tsx
import React, { useMemo, useRef, useState } from 'react';

export type ChatMsg = { id?: string; from?: string; name?: string; msg: string; ts?: number; mine?: boolean };

type Props = {
  myId: string;
  myName: string;
  messages: ChatMsg[];     // cumul (history + temps réel)
  onSend: (text: string) => void;
};

const ChatPane: React.FC<Props> = ({ myId, myName, messages, onSend }) => {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // anti-doublon visuel si jamais (sécurité)
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const out: ChatMsg[] = [];
    for (const m of messages) {
      const id = (m.id ?? `${m.from}:${m.ts}:${m.msg}`).toString();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(m);
    }
    return out.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  }, [messages]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="bg-black/50 rounded-lg p-2 flex flex-col h-full">
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-1 pr-1">
        {deduped.map((m, i) => {
          const mine = m.mine || (m.from && m.from === myId) || (m.name && m.name === myName);
          return (
            <div key={(m.id ?? i).toString()} className={`flex ${mine?'justify-end':'justify-start'}`}>
              <div className={`px-2 py-1 rounded text-xs font-mono ${mine ? 'bg-cyan-600/60 text-black' : 'bg-zinc-700/70 text-cyan-300'}`}>
                <span className="opacity-80">{m.name}:</span> {m.msg}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={e=>setText(e.target.value)}
          placeholder="Message…"
          className="flex-1 bg-zinc-900/60 border border-cyan-500/40 rounded px-2 py-1 text-cyan-300 outline-none"
          onKeyDown={(e)=>{ if(e.key==='Enter') send(); }}
        />
        <button className="px-3 py-1 rounded bg-cyan-500 text-black font-semibold" onClick={send}>Send</button>
      </div>
    </div>
  );
};

export default ChatPane;
