const LOCAL_REALTIME_ENDPOINT = "http://localhost:2567";

export function getRealtimeEndpoint(): string {
  return import.meta.env?.VITE_REALTIME_URL ?? (import.meta.env?.PROD ? window.location.origin : LOCAL_REALTIME_ENDPOINT);
}
