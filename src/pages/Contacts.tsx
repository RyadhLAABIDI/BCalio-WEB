import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { createOneToOne, createGroup, addContact } from '../utils/api';
import { splitContacts } from '../utils/contactsSync';
import { useNavigate } from 'react-router-dom';
import { uploadToCloudinary } from '../utils/upload';
import { inviteSms } from '../utils/inviteSms'; // ⬅️ NEW

/* ---------------- Types ---------------- */
type InApp = {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  phoneNumber?: string | null;
};
type PhoneOnly = { name?: string; phoneNumber: string };

/* ---------------- Helpers UI ---------------- */
const initials = (name?: string) => {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(s => s[0]?.toUpperCase() || '').join('');
};

const UserIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className || 'w-5 h-5'}>
    <path d="M12 12c2.761 0 5-2.686 5-6s-2.239-6-5-6-5 2.686-5 6 2.239 6 5 6zm0 2c-5.523 0-10 3.582-10 8 0 .552.448 1 1 1h18c.552 0 1-.448 1-1 0-4.418-4.477-8-10-8z"/>
  </svg>
);

/** Avatar corrigé : image → sinon initiales → sinon icône */
const Avatar: React.FC<{ src?: string | null; name?: string; size?: number; presence?: boolean }> = ({ src, name, size = 40, presence }) => {
  const s = `${size}px`;

  if (src) {
    return (
      <div className="relative" style={{ width: s, height: s }}>
        <img
          src={src}
          alt={name || 'avatar'}
          className="rounded-full object-cover bg-white/10"
          style={{ width: s, height: s }}
        />
        {presence !== undefined && (
          <span className={`absolute -bottom-0 -right-0 w-3 h-3 rounded-full ring-2 ring-[var(--panel)] ${presence ? 'bg-green-400' : 'bg-gray-500'}`} />
        )}
      </div>
    );
  }

  const hasName = !!(name && name.trim());
  const text = initials(name);

  return (
    <div
      className="relative grid place-items-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-500 text-white"
      style={{ width: s, height: s }}
    >
      {hasName ? (
        <div className="font-semibold text-xs">{text}</div>
      ) : (
        <UserIcon className="w-5 h-5 opacity-90" />
      )}
      {presence !== undefined && (
        <span className={`absolute -bottom-0 -right-0 w-3 h-3 rounded-full ring-2 ring-[var(--panel)] ${presence ? 'bg-green-400' : 'bg-gray-500'}`} />
      )}
    </div>
  );
};

const SectionHeader: React.FC<{ title: string; count?: number; right?: React.ReactNode }> = ({ title, count, right }) => (
  <div className="flex items-center justify-between mb-2">
    <div className="text-xs uppercase opacity-70">
      {title} {typeof count === 'number' && <span className="opacity-60">({count})</span>}
    </div>
    {right}
  </div>
);

/* ---------------- Page ---------------- */
const Contacts: React.FC = () => {
  const { token } = useAuth();
  const { requestPresence, presence } = useSocket();
  const nav = useNavigate();

  const [inApp, setInApp] = useState<InApp[]>([]);
  const [phoneOnly, setPhoneOnly] = useState<PhoneOnly[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [groupName, setGroupName] = useState('');
  const [groupLogo, setGroupLogo] = useState<string>('');

  // état d’envoi SMS par numéro
  const [inviting, setInviting] = useState<Record<string, 'idle'|'sending'|'ok'|'err'>>({});

  const reload = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const data = await splitContacts(token);
      setInApp(data.inApp || []);
      setPhoneOnly(data.phoneOnly || []);
      requestPresence((data.inApp || []).map(c => c.id));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        await reload();
      } finally {
        setLoading(false);
      }
    })();
  }, [token]); // eslint-disable-line

  const filteredInApp = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return inApp;
    return inApp.filter(c =>
      (c.name || '').toLowerCase().includes(t) ||
      (c.email || '').toLowerCase().includes(t) ||
      (c.phoneNumber || '').toLowerCase().includes(t)
    );
  }, [inApp, q]);

  const filteredPhoneOnly = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return phoneOnly;
    return phoneOnly.filter(c =>
      (c.name || '').toLowerCase().includes(t) ||
      (c.phoneNumber || '').toLowerCase().includes(t)
    );
  }, [phoneOnly, q]);

  const toggle = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));

  const startChat = async (contactId: string) => {
    if (!token) return;
    const conv = await createOneToOne(token, contactId);
    sessionStorage.setItem('openConvId', conv.id);
    nav('/');
  };

  const createGroupNow = async () => {
    if (!token) return;
    const ids = Object.keys(selected).filter(id => selected[id]);
    if (ids.length < 2) return alert('Sélectionnez au moins 2 contacts');
    const conv = await createGroup(token, groupName || 'Mon groupe', groupLogo || '', ids);
    sessionStorage.setItem('openConvId', conv.id);
    nav('/');
  };

  const pickLogo = async (file: File) => {
    const url = await uploadToCloudinary(file);
    setGroupLogo(url);
  };

  const addToContacts = async (userId: string) => {
    if (!token) return;
    await addContact(token, userId);
    await reload(); // recharge la vue split
  };

  // --- invitation SMS ---
  const inviteOne = async (phone: string) => {
    if (!token) return;
    setInviting(s => ({ ...s, [phone]: 'sending' }));
    try {
      const res = await inviteSms(token, phone);
      if (res.ok && res.sent > 0) {
        setInviting(s => ({ ...s, [phone]: 'ok' }));
      } else {
        setInviting(s => ({ ...s, [phone]: 'err' }));
        alert('Envoi non confirmé par le serveur.');
      }
    } catch (e:any) {
      console.warn('invite error', e?.message || e);
      setInviting(s => ({ ...s, [phone]: 'err' }));
      alert(`Échec de l’invitation: ${e?.message || e}`);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Topbar */}
      <div className="p-3 border-b border-[var(--border)] flex items-center gap-3">
        <div className="title font-semibold">Contacts</div>
        <input
          className="input ml-4 flex-1"
          placeholder="Rechercher…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className={`btn-ghost ${refreshing ? 'opacity-60 pointer-events-none' : ''}`}
          onClick={reload}
          title="Rafraîchir"
        >
          {refreshing ? '…' : '↻'}
        </button>
      </div>

      {/* Two columns */}
      <div className="flex-1 overflow-hidden p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
          {/* Col gauche : Inscrits */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/40 overflow-hidden flex flex-col">
            <div className="p-3">
              <SectionHeader title="Dans B-Callio" count={filteredInApp.length} />
              {loading && <div className="opacity-70 px-1 py-2">Chargement…</div>}
              {!loading && filteredInApp.length === 0 && (
                <div className="opacity-70 px-1 py-2">Aucun contact inscrit</div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-2">
              {filteredInApp.map((c) => {
                const p = presence[c.id];
                return (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5">
                    <Avatar src={c.image} name={c.name || c.email} size={40} presence={!!p?.online} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name || c.email}</div>
                      <div className="text-xs opacity-70 truncate">{c.email || c.phoneNumber}</div>
                    </div>

                    <button className="btn-ghost" onClick={() => startChat(c.id)}>Message</button>

                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selected[c.id]}
                        onChange={() => toggle(c.id)}
                      />
                      <span className="text-sm opacity-80">Groupe</span>
                    </label>

                    <button className="btn-ghost" onClick={() => addToContacts(c.id)}>Ajouter</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Col droite : Téléphone uniquement */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/40 overflow-hidden flex flex-col">
            <div className="p-3">
              <SectionHeader title="Téléphone uniquement" count={filteredPhoneOnly.length} />
              {loading && <div className="opacity-70 px-1 py-2">Chargement…</div>}
              {!loading && filteredPhoneOnly.length === 0 && (
                <div className="opacity-70 px-1 py-2">Aucun contact téléphone</div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-2">
              {filteredPhoneOnly.map((c, i) => {
                const state = inviting[c.phoneNumber] || 'idle';
                const label =
                  state === 'sending' ? 'Envoi…' :
                  state === 'ok'      ? 'Envoyé' :
                  state === 'err'     ? 'Échec'  :
                                        'Inviter';
                const disabled = state === 'sending' || state === 'ok';

                return (
                  <div key={`${c.phoneNumber}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5">
                    <Avatar src={undefined} name={c.name} size={40} presence={undefined} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name || 'Contact'}</div>
                      <div className="text-xs opacity-70 truncate">{c.phoneNumber}</div>
                    </div>
                    <button
                      className={`btn-ghost ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
                      onClick={() => inviteOne(c.phoneNumber)}
                      title="Envoyer une invitation par SMS"
                    >
                      {label}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer : Création de groupe */}
      <div className="border-t border-[var(--border)] p-3 flex items-center gap-3">
        <input
          className="input flex-1"
          placeholder="Nom du groupe"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
        />
        <input
          type="file"
          accept="image/*"
          id="group-logo"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await pickLogo(f);
          }}
        />
        <button
          className="btn-ghost"
          onClick={() =>
            (document.getElementById('group-logo') as HTMLInputElement)?.click()
          }
        >
          {groupLogo ? 'Changer logo' : 'Logo'}
        </button>
        <button className="btn-primary" onClick={createGroupNow}>
          Créer le groupe ({Object.values(selected).filter(Boolean).length})
        </button>
      </div>
    </div>
  );
};

export default Contacts;
