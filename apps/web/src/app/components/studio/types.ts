export type CanvasTab = '2d' | '3d' | 'compare';

export type SelectedType = 'room' | 'wall' | 'opening' | null;

export type GenerateResult = {
  prompt: string;
  layout: any;
  svg: string;
  script: string;
  notes?: string[];
  error?: string;
};
