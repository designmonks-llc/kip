import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { floating } from '../lib/floating';
import { useSession } from './common';
import { endMeeting, useMeetingKeys } from './Live';
import { PageSticky } from './PageSticky';
import { Sticky } from './Sticky';
import { applyLook } from '../lib/look';
import { useSettings } from './ui';
import { ErrorBoundary } from './Safety';

/** Renders whatever is floating into the always-on-top window. */
export function FloatingHost() {
  useSyncExternalStore(floating.subscribe, floating.version);
  const { win, target } = floating.get();
  const s = useSession();
  useMeetingKeys(win && target?.kind === 'meeting' ? win.document : null);
  const look = useSettings();
  useEffect(() => { if (win) applyLook(win.document, look); }, [win, look]);

  // A meeting that ends elsewhere shouldn't leave an empty floating window behind.
  useEffect(() => { if (target?.kind === 'meeting' && !s) floating.close(); }, [target, s]);

  if (!win || !target) return null;
  const body =
    target.kind === 'meeting' ? (s ? <Sticky session={s} floating onEnd={endMeeting} /> : null) : <PageSticky key={target.id} id={target.id} />;
  return createPortal(<ErrorBoundary compact>{body}</ErrorBoundary>, win.document.body);
}
