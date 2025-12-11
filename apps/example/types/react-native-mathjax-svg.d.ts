declare module 'react-native-mathjax-svg' {
  import { ComponentType, ReactNode } from 'react';

  export interface MathJaxProps {
    children: string;
    fontSize?: number;
    color?: string;
    fontCache?: boolean;
  }

  const MathJax: ComponentType<MathJaxProps>;
  export default MathJax;
}
