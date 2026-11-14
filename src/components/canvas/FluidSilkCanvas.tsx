import React from 'react';
import { FluxPrismCanvas, type FluxPrismCanvasProps } from './FluxPrismCanvas';

export type FluidSilkCanvasProps = FluxPrismCanvasProps;
export const FluidSilkCanvas: React.FC<FluidSilkCanvasProps> = (props) => {
  return <FluxPrismCanvas {...props} />;
};

export default FluidSilkCanvas;
