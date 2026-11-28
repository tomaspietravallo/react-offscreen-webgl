export type OffscreenWebGLErrorKind = 'compile' | 'link' | 'fetch' | 'context-lost' | 'callback' | 'worker' | 'unsupported';

export interface SerializedOffscreenWebGLError {
	kind: OffscreenWebGLErrorKind;
	message: string;
	cause?: unknown;
}

export type ShaderStage = 'vertex' | 'fragment';

export class OffscreenWebGLError extends Error {
	public readonly kind: OffscreenWebGLErrorKind;

	constructor(kind: OffscreenWebGLErrorKind, message: string, cause?: unknown) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = 'OffscreenWebGLError';
		this.kind = kind;
	}

	public toJSON(): SerializedOffscreenWebGLError {
		const cause = this.cause === undefined || this.cause instanceof Error ? this.cause : String(this.cause);
		return cause === undefined ? { kind: this.kind, message: this.message } : { kind: this.kind, message: this.message, cause };
	}

	public static from(error: unknown, kind: OffscreenWebGLErrorKind = 'worker'): OffscreenWebGLError {
		if (error instanceof OffscreenWebGLError) return error;
		if (error && typeof error === 'object' && !(error instanceof Error) && 'kind' in error && 'message' in error) {
			const data = error as SerializedOffscreenWebGLError;
			return new OffscreenWebGLError(data.kind, data.message, data.cause);
		}
		return new OffscreenWebGLError(kind, error instanceof Error ? error.message : String(error), error);
	}
}

export function shaderLabel(stage: ShaderStage, details: { group?: number; pass?: number; url?: string } = {}): string {
	const location = [
		details.group !== undefined ? `group ${details.group}` : '',
		details.pass !== undefined ? `pass ${details.pass}` : '',
		details.url ?? '',
	].filter(Boolean);
	return `${stage === 'vertex' ? 'Vertex' : 'Fragment'} shader${location.length ? ` (${location.join(', ')})` : ''}`;
}
