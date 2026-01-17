export const splitRequestOptions = (options = {}) => {
  const src = (options && typeof options === 'object') ? options : {};
  const signal = src.signal;
  const { signal: _signal, ...rest } = src;
  return { signal, options: rest };
};

export const createLinkedAbortController = ({ timeoutMs, signal } = {}) => {
  const controller = new AbortController();
  const ms = Number(timeoutMs);
  const shouldTimeout = Number.isFinite(ms) && ms > 0;
  let timeoutId = null;

  const abortInner = () => {
    try {
      controller.abort(signal?.reason);
    } catch {
      try { controller.abort(); } catch {}
    }
  };

  if (signal) {
    if (signal.aborted) {
      abortInner();
    } else {
      try { signal.addEventListener('abort', abortInner, { once: true }); } catch {}
    }
  }

  if (shouldTimeout) {
    timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, ms);
  }

  const cleanup = () => {
    if (timeoutId) {
      try { clearTimeout(timeoutId); } catch {}
      timeoutId = null;
    }
    if (signal) {
      try { signal.removeEventListener('abort', abortInner); } catch {}
    }
  };

  return { controller, cleanup };
};

