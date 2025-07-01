// https://gist.github.com/t3dotgg/a486c4ae66d32bf17c09c73609dacc5b
// Types for the result object with discriminated union

export type Success<T> = {
	data: T;
	error: null;
};

export type Failure<E> = {
	data: null;
	error: E;
};

export type Result<T, E = Error> = Success<T> | Failure<E>;

export const ok = <T>(data: T): Success<T> => ({
	data,
	error: null,
});

export const err = <E = Error>(error: E): Failure<E> => ({
	data: null,
	error,
});

// Main wrapper function
export async function tryCatch<T, E = Error>(
	promise: Promise<T>
): Promise<Result<T, E>> {
	try {
		const data = await promise;
		return { data, error: null };
	} catch (error) {
		return { data: null, error: error as E };
	}
}
