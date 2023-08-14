import {IPositionable} from "./interfaces";

export const PIXEL_SIZE = 5;
export function drawPixels(offscreenCanvas: HTMLCanvasElement, offscreenCtx: CanvasRenderingContext2D, pixelValues: number[][], characterColorMap: string[], pixelSize: number, xOffset: number = 0, yOffset: number = 0) {
    offscreenCtx.imageSmoothingEnabled = false;  // Ensure no smoothing
    //clear the canvas
    // offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // Draw the pixel data onto the off-screen canvas without any scaling
    for (let y = 0; y < pixelValues.length; y++) {
        const row = pixelValues[y];
        for (let x = 0; x < row.length; x++) {
            const pixel = row[x];
            if (pixel === null) continue;
            const color = characterColorMap[pixel];
            if (color) {
                offscreenCtx.fillStyle = color;
                offscreenCtx.fillRect(x * pixelSize + xOffset, y * pixelSize, pixelSize, pixelSize);
            }
        }
    }
}

export function updatePos(x: number, y: number, object: IPositionable): void {
    object.pos.x = x;
    object.pos.y = y;
    object.center.x = object.pos.x + object.size.x / 2;
    object.center.y = object.pos.y + object.size.y / 2;
    generateVertices(object);
}

export function generateVertices(object: IPositionable) {
    const { center, size, angle } = object;
    const { x: width, y: height } = size;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);

    object.vertices[0].x = -width / 2;
    object.vertices[0].y = -height / 2;
    object.vertices[1].x = width / 2;
    object.vertices[1].y = -height / 2;
    object.vertices[2].x = width / 2;
    object.vertices[2].y = height / 2;
    object.vertices[3].x = -width / 2;
    object.vertices[3].y = height / 2;

    for (const vertex of object.vertices) {
        const { x, y } = vertex;
        vertex.x = x * cosAngle - y * sinAngle + center.x;
        vertex.y = x * sinAngle + y * cosAngle + center.y;
    }
}