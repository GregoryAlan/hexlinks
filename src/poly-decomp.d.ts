declare module 'poly-decomp' {
  const decomp: {
    quickDecomp(polygon: number[][]): number[][][];
    decomp(polygon: number[][]): number[][][];
    makeCCW(polygon: number[][]): boolean;
    removeCollinearPoints(polygon: number[][], thresholdAngle?: number): number;
    removeDuplicatePoints(polygon: number[][], precision?: number): void;
    isSimple(polygon: number[][]): boolean;
  };
  export default decomp;
}
