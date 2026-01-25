// Mock @stitches/core to avoid CSS parsing issues in jsdom
// This file is auto-loaded by Vitest when @stitches/core is imported
export const createStitches = () => ({
  styled: (component) => (props) => {
    const { css, ...rest } = props || {};
    if (typeof component === 'string') {
      const Component = component;
      return { type: Component, props: rest };
    }
    return component(rest);
  },
  css: () => '',
  globalCss: () => () => {},
  keyframes: () => '',
  getCssText: () => '',
  theme: {},
  createTheme: () => ({}),
  config: {},
});

export default { createStitches };
