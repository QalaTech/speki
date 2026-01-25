// Mock @codesandbox/sandpack-react to avoid @stitches/core CSS parsing issues in jsdom
// Sandpack bundles stitches internally, so we need to mock the whole library
export const SandpackProvider = ({ children }) => children;
export const SandpackCodeEditor = () => null;
export const SandpackPreview = () => null;
export const SandpackLayout = ({ children }) => children;
export const SandpackConsole = () => null;
export const useSandpack = () => ({ sandpack: {}, dispatch: () => {}, listen: () => {} });
export const useSandpackNavigation = () => ({ refresh: () => {}, back: () => {}, forward: () => {} });

export default {
  SandpackProvider,
  SandpackCodeEditor,
  SandpackPreview,
  SandpackLayout,
  SandpackConsole,
  useSandpack,
  useSandpackNavigation,
};
