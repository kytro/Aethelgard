module.exports = {
  preset: 'jest-preset-angular',
  // globalSetup: 'jest-preset-angular/global-setup', // <-- REMOVE THIS LINE
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/'
  ],
  
  transform: {
    '^.+\\.(ts|js|html)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$',
        
        // setupJest: false // <-- REMOVE THIS LINE
      },
    ],
  },
};