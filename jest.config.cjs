const project = (name, pattern) => ({ displayName: name, testEnvironment: 'node', testMatch: [pattern], transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }] }, testTimeout: 30000 });
module.exports = { projects: [project('unit', '<rootDir>/test/*.spec.ts'), project('integration', '<rootDir>/test/*.integration.ts'), project('e2e', '<rootDir>/test/*.e2e.ts')] };
