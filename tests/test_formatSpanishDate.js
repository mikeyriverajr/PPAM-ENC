const test = require('node:test');
const assert = require('node:assert');

// Mock browser globals to allow app-admin.js to load without errors
global.window = {
    addEventListener: () => {}
};
global.document = {
    addEventListener: () => {},
    getElementById: () => ({ style: {}, addEventListener: () => {} }),
    createElement: () => ({ style: {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
};
global.navigator = {};
global.firebaseConfig = {}; // Mock missing config
global.firebase = {
    initializeApp: () => ({
        auth: () => ({ onAuthStateChanged: () => {} })
    }),
    auth: () => ({ onAuthStateChanged: () => {} }),
    firestore: () => ({}),
    storage: () => ({})
};

const { formatSpanishDate } = require('../app-admin.js');

test('formatSpanishDate tests', async (t) => {

    await t.test('formats a valid date string correctly', () => {
        // 2023-10-15 is a Sunday
        assert.strictEqual(formatSpanishDate('2023-10-15'), 'Domingo 15 de Octubre');
        // 2023-01-01 is a Sunday
        assert.strictEqual(formatSpanishDate('2023-01-01'), 'Domingo 1 de Enero');
        // 2024-02-29 is a Thursday (Leap year)
        assert.strictEqual(formatSpanishDate('2024-02-29'), 'Jueves 29 de Febrero');
    });

    await t.test('handles falsy or empty values', () => {
        assert.strictEqual(formatSpanishDate(''), '');
        assert.strictEqual(formatSpanishDate(null), '');
        assert.strictEqual(formatSpanishDate(undefined), '');
    });

    await t.test('handles malformed date strings', () => {
        // If it doesn't have 3 parts split by '-', it should return the original string
        assert.strictEqual(formatSpanishDate('2023/10/15'), '2023/10/15');
        assert.strictEqual(formatSpanishDate('10-2023'), '10-2023');
        assert.strictEqual(formatSpanishDate('2023-10'), '2023-10');
        assert.strictEqual(formatSpanishDate('invalid date'), 'invalid date');
    });
});
