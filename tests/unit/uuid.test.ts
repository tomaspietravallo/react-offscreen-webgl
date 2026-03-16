import { describe, it, expect } from 'vitest';
import { uuidv4 } from '../../src/utils/uuid';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuidv4', () => {
	it('output matches UUID v4 format', () => {
		expect(uuidv4()).toMatch(UUID_V4_REGEX);
	});

	it('the 13th character is always 4 (version identifier)', () => {
		for (let i = 0; i < 20; i++) {
			expect(uuidv4()[14]).toBe('4');
		}
	});

	it('the 17th character is always 8, 9, a, or b (variant identifier)', () => {
		const variantChars = new Set(['8', '9', 'a', 'b']);
		for (let i = 0; i < 20; i++) {
			expect(variantChars.has(uuidv4()[19])).toBe(true);
		}
	});

	it('two calls return different values', () => {
		expect(uuidv4()).not.toBe(uuidv4());
	});

	it('generates unique values across many calls', () => {
		const ids = new Set(Array.from({ length: 200 }, () => uuidv4()));
		expect(ids.size).toBe(200);
	});
});
