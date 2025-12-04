/**
 * Jest configuration for backend/Node.js unit tests
 * These tests don't use Angular and run with standard Node.js Jest
 * 
 * Run with: npx jest --config jest.backend.config.js
 */
module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '<rootDir>/tests/unit/**/*.test.js'
    ],
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/'
    ],
    verbose: true
};
