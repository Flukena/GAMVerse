export function conversationRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function conversationText(value: unknown, maxCharacters: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maxCharacters && !/[\u0000-\u001f\u007f]/.test(value); }
