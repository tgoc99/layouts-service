import {getBounds} from './getBounds';
import {Win} from './getWindow';
const xOffset = 3;
const yOffset = 10;

export const dragWindowTo =
    async (identityOrWindow: Win, x: number, y: number) => {
  const bounds = await getBounds(identityOrWindow);
  await new Promise((r) => setTimeout(r, 500));
};
