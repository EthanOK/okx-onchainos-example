export const formatTs = (ts: string) => {
    const n = Number(ts);
    if (!Number.isFinite(n)) return `invalid ts=${ts}`;
    const utc = new Date(n).toISOString();
    return `${utc} UTC`;
  };