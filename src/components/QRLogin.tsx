// src/components/QRLogin.tsx
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { issueWeb, getState, consume, IssueRes } from '../utils/pair';
import { meWithToken } from '../utils/me';

type Props = {
  onSuccess: (auth: { token: string; user: any }) => void;
};

const QRLogin: React.FC<Props> = ({ onSuccess }) => {
  const [iss, setIss] = useState<IssueRes | null>(null);
  const [leftMs, setLeftMs] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const pollRef = useRef<number | null>(null);
  const ttlRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (ttlRef.current)  { window.clearInterval(ttlRef.current);  ttlRef.current = null; }
  };

  const start = async () => {
    setErr('');
    setLoading(true);
    clearTimers();
    try {
      const res = await issueWeb();
      setIss(res);

      // calcule le TTL local à partir de expiresAt si dispo, sinon 120s
      const initialLeft = res.expiresAt ? Math.max(0, res.expiresAt - Date.now()) : (res.ttlSeconds ?? 120) * 1000;
      setLeftMs(initialLeft);

      // compte à rebours
      ttlRef.current = window.setInterval(() => {
        setLeftMs(prev => {
          const v = prev - 1000;
          if (v <= 0) {
            clearTimers();
            return 0;
          }
          return v;
        });
      }, 1000);

      // polling statut
      const every = 2000;
      pollRef.current = window.setInterval(async () => {
        try {
          const st = await getState(res.pairId, res.pairSecret);
          if (st.status === 'attached') {
            clearTimers();
            const c = await consume(res.pairId, res.pairSecret);

            // Récupérer le user depuis le token (sinon fallback preview)
            let user: any | null = null;
            try {
              user = await meWithToken(c.token);
            } catch {
              if (c.preview) {
                user = {
                  id: c.preview.userId,
                  name: c.preview.name,
                  image: c.preview.avatar,
                };
              }
            }
            if (!user) {
              setErr('Impossible de récupérer le profil. Réessaie.');
              return;
            }
            onSuccess({ token: c.token, user });
          } else if (st.status === 'expired') {
            clearTimers();
            setErr('QR expiré. Rafraîchis pour en générer un nouveau.');
          }
        } catch (e:any) {
          console.warn('poll error', e?.message || e);
        }
      }, every);
    } catch (e:any) {
      setErr(e?.message || 'Impossible de générer le QR');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { start(); return () => clearTimers(); }, []);

  const mins = Math.floor(Math.max(0, leftMs)/60000);
  const secs = Math.floor(Math.max(0, (leftMs%60000))/1000).toString().padStart(2, '0');

  return (
    <div className="space-y-3">
      <div className="text-sm opacity-80">
        Ouvrez l’app mobile → « Connexion Web » → scannez ce QR.
      </div>

      <div className="grid place-items-center p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        {iss?.qr ? <QRCode value={iss.qr} size={220} /> : <div className="text-sm opacity-70">{loading ? 'Génération…' : '—'}</div>}
      </div>

      <div className="flex items-center justify-between text-sm opacity-80">
        <span>Expire dans : <b>{mins}:{secs}</b></span>
        <button onClick={start} className="underline">Rafraîchir</button>
      </div>

      {err && <div className="text-red-500 text-sm">{err}</div>}
    </div>
  );
};

export default QRLogin;
