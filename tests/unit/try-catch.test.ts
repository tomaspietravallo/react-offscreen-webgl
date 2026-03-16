import { describe, it, expect } from 'vitest';
import { ok, err } from '../../src/utils/try-catch';

describe('ok', () => {
	it('wraps a value in a success result', () => {
		const result = ok(42);
		expect(result.data).toBe(42);
		expect(result.error).toBeNull();
	});

	it('wraps string values', () => {
		const result = ok('hello');
		expect(result.data).toBe('hello');
		expect(result.error).toBeNull();
	});

	it('wraps object values', () => {
		const obj = { x: 1 };
		const result = ok(obj);
		expect(result.data).toBe(obj);
		expect(result.error).toBeNull();
	});

	it('wraps falsy numbers', () => {
		expect(ok(0).data).toBe(0);
		expect(ok(0).error).toBeNull();
	});
});

describe('err', () => {
	it('wraps an Error instance', () => {
		const e = new Error('something went wrong');
		const result = err(e);
		expect(result.data).toBeNull();
		expect(result.error).toBe(e);
	});

	it('wraps a string error', () => {
		const result = err('oops');
		expect(result.data).toBeNull();
		expect(result.error).toBe('oops');
	});

	it('wraps arbitrary error values', () => {
		const result = err(404);
		expect(result.data).toBeNull();
		expect(result.error).toBe(404);
	});
});

describe('Result narrowing', () => {
	it('data is accessible when error is null', () => {
		const result = ok('value');
		if (result.error) {
			expect.fail('should not have an error');
		} else {
			expect(result.data).toBe('value');
		}
	});

	it('error is accessible when present', () => {
		const e = new Error('fail');
		const result = err(e);
		if (result.error) {
			expect(result.error).toBe(e);
		} else {
			expect.fail('should have an error');
		}
	});

	it('ok result never has an error', () => {
		const result = ok(123);
		expect(result.error).toBeNull();
		expect(result.data).not.toBeNull();
	});

	it('err result never has data', () => {
		const result = err(new Error('x'));
		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
	});
});
