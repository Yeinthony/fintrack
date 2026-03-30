import '@testing-library/jest-dom';

Object.defineProperty(window, 'electronAPI', {
  value: { invoke: jest.fn() },
  writable: true,
});
