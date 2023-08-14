import {IPoint} from "./interfaces";
import Boat from "./boat";

export default class Camera {
    pos: IPoint;  // The position of the camera.
    maxZoom: number; // The zoom level of the camera.
    currentZoom: number;
    minZoom: number;
    canvasSize: IPoint;
    worldSize: IPoint;
    scale: number;

    constructor(pos: IPoint, maxZoom: number, minZoom: number, canvasSize: IPoint, worldSize: IPoint, scale:number) {
        this.pos = pos;
        this.maxZoom = maxZoom;
        this.currentZoom = maxZoom;
        this.minZoom = minZoom;
        this.canvasSize = canvasSize;
        this.worldSize = worldSize;
        this.scale = scale;
    }

    // Clamp the value between the min and max.
    clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }


    centerOn(target: Boat, deltaTime: number) {
        const sign = target.speed > 1 ? -1 : 1;
        this.currentZoom = this.clamp(this.currentZoom + sign * .01, this.minZoom, this.maxZoom);

        let targetX = target.center.x - this.canvasSize.x / 2 / this.currentZoom;
        let targetY = target.center.y - this.canvasSize.y / 2 / this.currentZoom;

        targetX = this.clamp(targetX, 0, this.worldSize.x - this.canvasSize.x / this.currentZoom);
        targetY = this.clamp(targetY, 0, this.worldSize.y - this.canvasSize.y / this.currentZoom);

        this.pos.x = targetX;
        this.pos.y = targetY;
    }
}