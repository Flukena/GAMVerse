type LogFields = Record<string, string | number | boolean | null | undefined>;

const ERROR_METRIC_BUCKET_MS = 60_000;
const ERROR_METRIC_BUCKET_COUNT = 15;
const recentErrorBuckets = Array.from({ length: ERROR_METRIC_BUCKET_COUNT }, () => ({ minute: -1, count: 0 }));

/** Count structured errors in a bounded 15-minute rolling window, without labels or error content. */
export function getRecentServerErrorCount(now = Date.now()) {
  const currentMinute = Math.floor(now / ERROR_METRIC_BUCKET_MS);
  return recentErrorBuckets.reduce((total, bucket) =>
    bucket.minute >= currentMinute - (ERROR_METRIC_BUCKET_COUNT - 1) && bucket.minute <= currentMinute ? total + bucket.count : total, 0);
}

function recordErrorMetric(now = Date.now()) {
  const minute = Math.floor(now / ERROR_METRIC_BUCKET_MS);
  const bucket = recentErrorBuckets[((minute % ERROR_METRIC_BUCKET_COUNT) + ERROR_METRIC_BUCKET_COUNT) % ERROR_METRIC_BUCKET_COUNT]!;
  if (bucket.minute !== minute) { bucket.minute = minute; bucket.count = 0; }
  bucket.count += 1;
}

function errorDetails(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}

/** Write machine-readable server events without credentials or request bodies. */
export function logServerEvent(service: "api" | "realtime", event: string, fields: LogFields = {}) {
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), level: "info", service, event, ...fields }));
}

export function logServerError(service: "api" | "realtime", event: string, error: unknown, fields: LogFields = {}) {
  recordErrorMetric();
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: "error", service, event, ...fields, error: errorDetails(error) }));
}
